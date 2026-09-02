/**
 * Navix — AI Career Guidance Chatbot
 * Backend server
 *
 * Responsibilities:
 *  - Serve a small REST API used by the frontend chat UI
 *  - Hold short-lived, in-memory chat sessions (history + extracted profile)
 *  - Proxy chat turns to the Google Gemini free-tier API (server-side, so the
 *    API key never reaches the browser)
 *  - Keep a running "career profile" per session (education, skills,
 *    interests, constraints...) so replies stay grounded in what the user
 *    has actually told Navix, instead of generic advice.
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");

const app = express();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.5-flash-lite,gemini-flash-lite-latest")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const GEMINI_REQUEST_TIMEOUT_MS = 30000;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedLocalOrigin(origin) {
  if (!origin || origin === "null") return true;

  try {
    const { hostname, protocol } = new URL(origin);
    const isLocalHostname = ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
    const isFileOrigin = protocol === "file:";
    return isLocalHostname || isFileOrigin;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: (origin, cb) => {
      if (
        !origin ||
        origin === "null" ||
        ALLOWED_ORIGINS.includes("*") ||
        ALLOWED_ORIGINS.includes(origin) ||
        isAllowedLocalOrigin(origin)
      ) {
        return cb(null, true);
      }
      return cb(new Error("Not allowed by CORS"));
    },
  })
);

// Basic abuse protection for the free-tier key
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages. Please wait a moment before trying again." },
});

// ---------------------------------------------------------------------------
// In-memory session store
// sessions[sessionId] = {
//   createdAt, updatedAt,
//   history: [{ role: 'user'|'model', text }],
//   profile: { education, field, skills, interests, experience,
//              workStyle, constraints, strengths, goals, stage }
// }
// ---------------------------------------------------------------------------

const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function createSession() {
  const id = uuidv4();
  sessions.set(id, {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    history: [],
    profile: {
      education: null,
      field: null,
      skills: [],
      interests: [],
      experience: null,
      workStyle: null,
      constraints: null,
      strengths: [],
      goals: null,
      stage: "gathering", // gathering -> recommending -> refining
    },
  });
  return id;
}

function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.updatedAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return s;
}

// Periodic cleanup of stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 1000 * 60 * 30).unref();

// ---------------------------------------------------------------------------
// Navix persona / system instruction
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTION = `
You are Navix, a focused career guidance AI. Your ONLY purpose is helping the
person figure out precise, actionable career choices for themselves.

Core method:
1. Before giving any recommendation, gather enough concrete facts about the
   person: education level and field, current skills, genuine interests,
   work style preference (e.g. team vs solo, structured vs flexible),
   experience so far, and real constraints (location, budget, time available,
   language, willingness to relocate/study further).
2. Ask short, specific, one-at-a-time (or grouped in twos) questions until you
   have enough to give a grounded answer. Do not ask more than 2 questions in
   a single turn. Do not repeat a question the person already answered.
3. Once you have enough information, stop asking and give exact career
   choices — name specific roles/paths (not vague categories), ranked by fit,
   each with: why it fits the facts they gave you, the core skills required,
   a realistic first step, and rough entry requirements. Prefer 3-5 ranked
   options over one.
4. If the person gives new information later, update your recommendation
   instead of repeating the same list.
5. Stay strictly on career guidance: education paths, skill-building,
   job-search strategy, resumes, interviews, career transitions, higher
   studies, and related planning. If asked something unrelated, briefly
   redirect back to career guidance.

Tone: direct, warm, precise, no fluff, no filler praise. Do not use emoji or
decorative symbols. Use plain text with short paragraphs and, when listing
options, simple numbered or dashed lists. Never invent facts about the person
— only use what they told you. Never claim certainty about job markets you
are not sure of; phrase market claims as general guidance, not guarantees.
`.trim();

function buildProfileNote(profile) {
  const parts = [];
  if (profile.education) parts.push(`Education: ${profile.education}`);
  if (profile.field) parts.push(`Field of study/background: ${profile.field}`);
  if (profile.skills?.length) parts.push(`Skills: ${profile.skills.join(", ")}`);
  if (profile.interests?.length) parts.push(`Interests: ${profile.interests.join(", ")}`);
  if (profile.experience) parts.push(`Experience: ${profile.experience}`);
  if (profile.workStyle) parts.push(`Work style preference: ${profile.workStyle}`);
  if (profile.constraints) parts.push(`Constraints: ${profile.constraints}`);
  if (profile.strengths?.length) parts.push(`Strengths: ${profile.strengths.join(", ")}`);
  if (profile.goals) parts.push(`Stated goals: ${profile.goals}`);

  if (parts.length === 0) return "No confirmed facts about the person yet.";
  return "Known facts about the person so far:\n" + parts.map((p) => `- ${p}`).join("\n");
}

// ---------------------------------------------------------------------------
// Very lightweight, rule-based profile extraction.
// This is intentionally simple (no extra Gemini call) so the free tier
// quota is spent on the actual conversation, not on background extraction.
// ---------------------------------------------------------------------------

function extractProfileUpdates(userText, profile) {
  const text = userText.toLowerCase();

  const eduPatterns = [
    [/\b(10th|sslc)\b/, "10th / SSLC"],
    [/\b(12th|hsc|higher secondary)\b/, "12th / HSC"],
    [/\bdiploma\b/, "Diploma"],
    [/\b(b\.?tech|be\b|bachelor of engineering)\b/, "B.Tech / B.E."],
    [/\b(b\.?sc|bachelor of science)\b/, "B.Sc"],
    [/\b(b\.?com|bachelor of commerce)\b/, "B.Com"],
    [/\b(bca)\b/, "BCA"],
    [/\b(mba)\b/, "MBA"],
    [/\b(m\.?tech|master of engineering)\b/, "M.Tech"],
    [/\b(m\.?sc|master of science)\b/, "M.Sc"],
    [/\bphd|doctorate\b/, "PhD"],
    [/\bundergrad(uate)?\b/, "Undergraduate"],
    [/\bpostgrad(uate)?\b/, "Postgraduate"],
  ];
  for (const [re, label] of eduPatterns) {
    if (re.test(text) && !profile.education) {
      profile.education = label;
      break;
    }
  }

  const skillKeywords = [
    "python", "java", "javascript", "html", "css", "sql", "excel",
    "communication", "public speaking", "design", "figma", "photoshop",
    "writing", "video editing", "accounting", "marketing", "sales",
    "data analysis", "machine learning", "c++", "react", "node",
    "networking", "teaching", "management", "leadership", "research",
  ];
  skillKeywords.forEach((kw) => {
    if (text.includes(kw) && !profile.skills.includes(kw)) {
      profile.skills.push(kw);
    }
  });

  const interestKeywords = [
    "technology", "coding", "art", "music", "medicine", "law", "finance",
    "business", "psychology", "teaching", "sports", "gaming", "design",
    "writing", "science", "biology", "environment", "travel", "government job",
    "civil service", "startup", "healthcare",
  ];
  interestKeywords.forEach((kw) => {
    if (text.includes(kw) && !profile.interests.includes(kw)) {
      profile.interests.push(kw);
    }
  });

  if (/\bfresher\b|\bno experience\b|\bfirst job\b/.test(text) && !profile.experience) {
    profile.experience = "Fresher / no prior work experience";
  }
  const yearsMatch = text.match(/(\d+)\s*\+?\s*(years|yrs)\s*(of\s*)?(experience)?/);
  if (yearsMatch && !profile.experience) {
    profile.experience = `${yearsMatch[1]} years of experience`;
  }

  if (/\bremote\b/.test(text) && !profile.workStyle) profile.workStyle = "Prefers remote work";
  if (/\bteam\b/.test(text) && !profile.workStyle) profile.workStyle = "Prefers working in a team";
  if (/\balone\b|\bindependent(ly)?\b|\bsolo\b/.test(text) && !profile.workStyle) {
    profile.workStyle = "Prefers working independently";
  }

  if (/\bbudget\b|\bcannot afford\b|\bcan't afford\b|\bfree\b|\blow cost\b/.test(text) && !profile.constraints) {
    profile.constraints = userText.slice(0, 160);
  }

  return profile;
}

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------

async function callGemini(history, profile) {
  if (!GEMINI_API_KEY) {
    const err = new Error("GEMINI_API_KEY is not configured on the server.");
    err.code = "NO_API_KEY";
    throw err;
  }

  const contents = history.map((turn) => ({
    role: turn.role === "model" ? "model" : "user",
    parts: [{ text: turn.text }],
  }));

  const body = {
    system_instruction: {
      parts: [{ text: `${SYSTEM_INSTRUCTION}\n\n${buildProfileNote(profile)}` }],
    },
    contents,
    generationConfig: {
      temperature: 0.6,
      topP: 0.9,
      maxOutputTokens: 700,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],
  };

  const models = [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS])];
  let lastError;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          }
        );
      } catch (requestError) {
        lastError = new Error(
          requestError.name === "AbortError"
            ? `Gemini request timed out after ${GEMINI_REQUEST_TIMEOUT_MS / 1000} seconds.`
            : `Could not reach Gemini: ${requestError.message}`
        );
        lastError.code = "GEMINI_ERROR";
        lastError.status = 503;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      } finally {
        clearTimeout(timeout);
      }

      const data = await res.json();
      if (res.ok) {
        const candidate = data?.candidates?.[0];
        const text = candidate?.content?.parts?.map((p) => p.text || "").join("").trim();

        if (!text) {
          const finishReason = candidate?.finishReason;
          if (finishReason === "SAFETY") {
            return "I can't help with that particular request, but I'm glad to continue with your career guidance questions.";
          }
          throw new Error("Gemini returned an empty response.");
        }

        return text;
      }

      const message = data?.error?.message || `Gemini request failed with status ${res.status}`;
      lastError = new Error(message);
      lastError.code = "GEMINI_ERROR";
      lastError.status = res.status;

      const isTransient = res.status === 429 || res.status === 503 || /high demand|overloaded|temporarily/i.test(message);
      if (!isTransient) throw lastError;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    model: GEMINI_MODEL,
    apiKeyConfigured: Boolean(GEMINI_API_KEY),
    activeSessions: sessions.size,
  });
});

app.post("/api/session/new", (req, res) => {
  const id = createSession();
  res.json({ sessionId: id });
});

app.get("/api/session/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found or expired." });
  res.json({
    history: session.history,
    profile: session.profile,
  });
});

app.delete("/api/session/:id", (req, res) => {
  sessions.delete(req.params.id);
  res.json({ ok: true });
});

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    let { sessionId, message } = req.body || {};
    message = (message || "").toString().trim();

    if (!message) {
      return res.status(400).json({ error: "Message text is required." });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Message is too long (max 2000 characters)." });
    }

    let session = sessionId ? getSession(sessionId) : null;
    if (!session) {
      sessionId = createSession();
      session = getSession(sessionId);
    }

    session.profile = extractProfileUpdates(message, session.profile);
    session.history.push({ role: "user", text: message });

    // Keep the transcript bounded so the free-tier token budget stays sane
    const MAX_TURNS = 24;
    if (session.history.length > MAX_TURNS) {
      session.history = session.history.slice(session.history.length - MAX_TURNS);
    }

    const reply = await callGemini(session.history, session.profile);

    session.history.push({ role: "model", text: reply });
    session.updatedAt = Date.now();

    // Naive stage transition: once we have a handful of facts, mark as ready
    const factCount =
      Number(Boolean(session.profile.education)) +
      Number(Boolean(session.profile.field)) +
      Number(session.profile.skills.length > 0) +
      Number(session.profile.interests.length > 0) +
      Number(Boolean(session.profile.experience));
    session.profile.stage = factCount >= 3 ? "recommending" : "gathering";

    res.json({
      sessionId,
      reply,
      profile: session.profile,
    });
  } catch (err) {
    console.error("Chat error:", err.message);
    if (err.code === "NO_API_KEY") {
      return res.status(500).json({
        error: "Server is missing GEMINI_API_KEY. Add it to backend/.env (see .env.example).",
      });
    }
    if (err.code === "GEMINI_ERROR") {
      return res.status(err.status && err.status < 500 ? 400 : 502).json({
        error: `Gemini API error: ${err.message}`,
      });
    }
    res.status(500).json({ error: "Something went wrong while talking to Navix. Please try again." });
  }
});

// Fallback 404 for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Navix backend running on http://localhost:${PORT}`);
    console.log(`Gemini model: ${GEMINI_MODEL}`);
    if (!GEMINI_API_KEY) {
      console.warn("WARNING: GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.");
    }
  });
}

module.exports = app;
