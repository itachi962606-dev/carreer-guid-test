/**
 * Navix — AI Career Guidance Chatbot
 * Frontend chat logic with Firebase Authentication & Firestore Data Persistence
 */

import {
  onAuthChange,
  logoutUser,
  getUserConversations,
  saveConversation,
  loadConversation,
  deleteConversation,
} from "./firebase-config.js";

(() => {
  "use strict";

  // -----------------------------------------------------------------------
  // Config & State
  // -----------------------------------------------------------------------
  const API_BASE = window.Navix_API_BASE || "http://localhost:5000";
  const STORAGE_KEY = "Navix_session_id";

  let currentUser = null;
  let activeConversationId = null;
  let activeConversationTitle = "New Career Guidance";
  let activeMessages = [];
  let activeProfile = {
    education: null,
    field: null,
    skills: [],
    interests: [],
    experience: null,
    workStyle: null,
    constraints: null,
    strengths: [],
    goals: null,
    stage: "gathering",
  };
  let isSending = false;

  // -----------------------------------------------------------------------
  // DOM refs
  // -----------------------------------------------------------------------
  const appAuthSplash = document.getElementById("appAuthSplash");
  const appEl = document.getElementById("app");
  const chatArea = document.getElementById("chatArea");
  const messagesEl = document.getElementById("messages");
  const welcomeEl = document.getElementById("welcome");
  const typingRow = document.getElementById("typingRow");

  const form = document.getElementById("composerForm");
  const input = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");

  const sidebar = document.getElementById("sidebar");
  const sidebarOpenBtn = document.getElementById("sidebarOpenBtn");
  const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  const newChatBtn = document.getElementById("newChatBtn");
  const mobileNewChatBtn = document.getElementById("mobileNewChatBtn");
  const clearChatBtn = document.getElementById("clearChatBtn");
  const promptList = document.getElementById("promptList");

  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  const profileEmpty = document.getElementById("profileEmpty");
  const profileRows = document.getElementById("profileRows");
  const profileStage = document.getElementById("profileStage");

  // User Profile & Conversations in Sidebar
  const userDisplayName = document.getElementById("userDisplayName");
  const userEmailText = document.getElementById("userEmailText");
  const userAvatarBadge = document.getElementById("userAvatarBadge");
  const userAvatarInitials = document.getElementById("userAvatarInitials");
  const logoutBtn = document.getElementById("logoutBtn");
  const conversationsList = document.getElementById("conversationsList");

  // -----------------------------------------------------------------------
  // Auth Guard & User Profile Header
  // -----------------------------------------------------------------------
  onAuthChange(async (user) => {
    if (!user) {
      // Unauthenticated -> Redirect immediately to login page
      window.location.replace("login.html");
      return;
    }

    currentUser = user;

    // Render User Info in Sidebar
    if (userDisplayName) {
      userDisplayName.textContent = user.displayName || user.email?.split("@")[0] || "Career Seeker";
    }
    if (userEmailText) {
      userEmailText.textContent = user.email || "";
    }
    if (userAvatarBadge && userAvatarInitials) {
      if (user.photoURL) {
        userAvatarBadge.innerHTML = `<img src="${escapeHtml(user.photoURL)}" alt="Avatar" />`;
      } else {
        const name = user.displayName || user.email || "U";
        userAvatarInitials.textContent = name.charAt(0).toUpperCase();
      }
    }

    // Hide splash shield & show app
    if (appAuthSplash) appAuthSplash.style.display = "none";
    if (appEl) appEl.style.display = "grid";

    // Initialize Conversation Context
    initActiveConversation();

    // Fetch and render user's saved conversations from Firestore
    await refreshConversationsList();
  });

  function generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  function initActiveConversation() {
    activeConversationId = generateConversationId();
    activeConversationTitle = "New Career Guidance";
    activeMessages = [];
    activeProfile = {
      education: null,
      field: null,
      skills: [],
      interests: [],
      experience: null,
      workStyle: null,
      constraints: null,
      strengths: [],
      goals: null,
      stage: "gathering",
    };
    resetChatUI();
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------
  function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /** Formatter: turns **bold**, dashed/numbered lists and paragraphs into clean HTML */
  function formatReply(raw) {
    const escaped = escapeHtml(raw);
    const blocks = escaped.split(/\n{2,}/);

    const html = blocks
      .map((block) => {
        const lines = block.split("\n").filter((l) => l.trim().length);
        if (!lines.length) return "";

        const isBulleted = lines.every((l) => /^\s*[-*]\s+/.test(l));
        const isNumbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));

        const inline = (text) =>
          text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

        if (isBulleted) {
          const items = lines
            .map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`)
            .join("");
          return `<ul>${items}</ul>`;
        }
        if (isNumbered) {
          const items = lines
            .map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`)
            .join("");
          return `<ol>${items}</ol>`;
        }
        return `<p>${inline(lines.join("<br>"))}</p>`;
      })
      .join("");

    return html || `<p>${escapeHtml(raw)}</p>`;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatArea.scrollTop = chatArea.scrollHeight;
    });
  }

  function setSending(state) {
    isSending = state;
    sendBtn.disabled = state || !input.value.trim();
  }

  function autoResize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }

  function formatRelativeDate(isoStr) {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 2) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch (e) {
      return "";
    }
  }

  // -----------------------------------------------------------------------
  // Tiny Navix Pixel-Art SVG Mascot & Reaction Engine
  // -----------------------------------------------------------------------
  function getNavixReactionSvg(type) {
    switch (type) {
      case "excited":
        return `
          <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="18" height="13" rx="4" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.4"/>
            <rect x="7" y="7" width="14" height="9" rx="2.5" fill="#1E1B4B"/>
            <path d="M9.5 12 Q11 10 12.5 12" stroke="#38BDF8" stroke-width="1.3" stroke-linecap="round" fill="none"/>
            <path d="M15.5 12 Q17 10 18.5 12" stroke="#38BDF8" stroke-width="1.3" stroke-linecap="round" fill="none"/>
            <circle cx="8" cy="13.5" r="1" fill="#F472B6"/>
            <circle cx="20" cy="13.5" r="1" fill="#F472B6"/>
            <rect x="13.5" y="2" width="1" height="3" fill="#8B5CF6"/>
            <circle cx="14" cy="2" r="1.8" fill="#F472B6"/>
            <rect x="8" y="19" width="12" height="6" rx="2.5" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.2"/>
            <circle cx="14" cy="22" r="1.2" fill="#38BDF8"/>
          </svg>`;

      case "thinking":
        return `
          <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="18" height="13" rx="4" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.4"/>
            <rect x="7" y="7" width="14" height="9" rx="2.5" fill="#1E1B4B"/>
            <circle cx="10.5" cy="11.5" r="1.5" fill="#38BDF8"/>
            <circle cx="17.5" cy="10" r="1.5" fill="#38BDF8"/>
            <rect x="13.5" y="2" width="1" height="3" fill="#8B5CF6"/>
            <circle cx="14" cy="2" r="1.8" fill="#A78BFA"/>
            <rect x="8" y="19" width="12" height="6" rx="2.5" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.2"/>
            <circle cx="14" cy="22" r="1.2" fill="#A78BFA"/>
          </svg>`;

      case "explaining":
        return `
          <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="18" height="13" rx="4" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.4"/>
            <rect x="7" y="7" width="14" height="9" rx="2.5" fill="#1E1B4B"/>
            <rect x="9" y="10" width="3" height="3.5" rx="1" fill="#38BDF8"/>
            <rect x="16" y="10" width="3" height="3.5" rx="1" fill="#38BDF8"/>
            <path d="M12.5 13.5 Q14 14.5 15.5 13.5" stroke="#38BDF8" stroke-width="1" stroke-linecap="round" fill="none"/>
            <rect x="13.5" y="2" width="1" height="3" fill="#8B5CF6"/>
            <circle cx="14" cy="2" r="1.8" fill="#38BDF8"/>
            <rect x="8" y="19" width="12" height="6" rx="2.5" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.2"/>
            <path d="M20 21 L23 18" stroke="#8B5CF6" stroke-width="1.4" stroke-linecap="round"/>
            <circle cx="14" cy="22" r="1.2" fill="#38BDF8"/>
          </svg>`;

      case "celebrating":
      case "success":
        return `
          <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="18" height="13" rx="4" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.4"/>
            <rect x="7" y="7" width="14" height="9" rx="2.5" fill="#1E1B4B"/>
            <path d="M10.5 9.5 L11 11.5 L13 11.5 L11.5 12.5 L12 14.5 L10.5 13.2 L9 14.5 L9.5 12.5 L8 11.5 L10 11.5 Z" fill="#FBBF24"/>
            <path d="M17.5 9.5 L18 11.5 L20 11.5 L18.5 12.5 L19 14.5 L17.5 13.2 L16 14.5 L16.5 12.5 L15 11.5 L17 11.5 Z" fill="#FBBF24"/>
            <rect x="13.5" y="2" width="1" height="3" fill="#8B5CF6"/>
            <circle cx="14" cy="2" r="2" fill="#FBBF24"/>
            <rect x="8" y="19" width="12" height="6" rx="2.5" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.2"/>
            <circle cx="14" cy="22" r="1.2" fill="#FBBF24"/>
          </svg>`;

      case "support":
        return `
          <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="18" height="13" rx="4" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.4"/>
            <rect x="7" y="7" width="14" height="9" rx="2.5" fill="#1E1B4B"/>
            <path d="M9.5 11.5 Q11 13 12.5 11.5" stroke="#38BDF8" stroke-width="1.3" stroke-linecap="round" fill="none"/>
            <path d="M15.5 11.5 Q17 13 18.5 11.5" stroke="#38BDF8" stroke-width="1.3" stroke-linecap="round" fill="none"/>
            <rect x="13.5" y="2" width="1" height="3" fill="#8B5CF6"/>
            <circle cx="14" cy="2" r="1.8" fill="#F472B6"/>
            <rect x="8" y="19" width="12" height="6" rx="2.5" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.2"/>
            <circle cx="14" cy="22" r="1.2" fill="#F472B6"/>
          </svg>`;

      default:
        return `
          <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="18" height="13" rx="4" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.4"/>
            <rect x="7" y="7" width="14" height="9" rx="2.5" fill="#1E1B4B"/>
            <rect x="9" y="10" width="3" height="4" rx="1" fill="#38BDF8"/>
            <rect x="16" y="10" width="3" height="4" rx="1" fill="#38BDF8"/>
            <rect x="13.5" y="2" width="1" height="3" fill="#8B5CF6"/>
            <circle cx="14" cy="2" r="1.8" fill="#A78BFA"/>
            <rect x="8" y="19" width="12" height="6" rx="2.5" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.2"/>
            <circle cx="14" cy="22" r="1.2" fill="#38BDF8"/>
          </svg>`;
    }
  }

  function determineNavixReaction(userMsg, botReply, profile) {
    if (!botReply) return null;
    const userLower = (userMsg || "").toLowerCase();
    const botLower = botReply.toLowerCase();

    if (/confus|don'?t know|not sure|lost|stuck|help me decide|unclear|no idea|clueless|overwhelm/i.test(userLower)) {
      return { type: "support", label: "Navix is here to guide you" };
    }
    if (profile?.stage === "recommending" || /ranked|career options|top choices|recommended path|best suited|career choices for you/i.test(botLower)) {
      return { type: "celebrating", label: "Tailored Career Paths" };
    }
    if (/thank|awesome|great|excited|love|interested in|passion/i.test(userLower)) {
      return { type: "excited", label: "Great direction!" };
    }
    if (/step 1|why this fits|first step|actionable|roadmap|skill-building|how to start/i.test(botLower)) {
      return { type: "explaining", label: "Action Plan" };
    }
    if (/tell me more|what kind of|could you share|do you prefer|what is your/i.test(botLower) && botLower.includes("?")) {
      return { type: "thinking", label: "Analyzing details" };
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Rendering Messages
  // -----------------------------------------------------------------------
  const botAvatarSvg = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="16" height="12" rx="4" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.5"/>
      <circle cx="8.5" cy="10" r="1.5" fill="#38BDF8"/>
      <circle cx="15.5" cy="10" r="1.5" fill="#38BDF8"/>
      <path d="M10 13 Q12 14.5 14 13" stroke="#8B5CF6" stroke-width="1.2" stroke-linecap="round" fill="none"/>
      <rect x="7" y="16" width="10" height="5" rx="2" fill="#FFFFFF" stroke="#8B5CF6" stroke-width="1.2"/>
    </svg>`;

  const userAvatarSvg = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" stroke-width="1.8"/>
      <path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;

  function addMessage(role, text, opts = {}) {
    if (welcomeEl) welcomeEl.style.display = "none";

    const row = document.createElement("div");
    row.className = `msg-row ${role === "user" ? "user" : "bot"}`;

    const avatar = document.createElement("span");
    avatar.className = `avatar ${role === "user" ? "user-avatar" : "bot-avatar"}`;
    avatar.setAttribute("aria-hidden", "true");
    avatar.innerHTML = role === "user" ? userAvatarSvg : botAvatarSvg;

    const col = document.createElement("div");
    col.className = "bubble-col";

    if (role === "bot" && opts.reaction) {
      const badge = document.createElement("div");
      badge.className = `robot-reaction-badge reaction-${opts.reaction.type}`;
      badge.innerHTML = `
        <span class="reaction-robot-icon">${getNavixReactionSvg(opts.reaction.type)}</span>
        <span class="reaction-label">${opts.reaction.label}</span>
      `;
      col.appendChild(badge);
    }

    const bubble = document.createElement("div");
    bubble.className = `bubble${opts.error ? " error-bubble" : ""}`;

    if (role === "user") {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = formatReply(text);
    }

    col.appendChild(bubble);

    const meta = document.createElement("span");
    meta.className = "msg-meta";
    meta.textContent = opts.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    col.appendChild(meta);

    row.appendChild(avatar);
    row.appendChild(col);
    messagesEl.appendChild(row);

    scrollToBottom();
    return row;
  }

  function showTyping(show) {
    if (typingRow) typingRow.hidden = !show;
    if (show) scrollToBottom();
  }

  // -----------------------------------------------------------------------
  // Profile Panel
  // -----------------------------------------------------------------------
  const PROFILE_LABELS = {
    education: "Education",
    field: "Field",
    experience: "Experience",
    workStyle: "Work style",
    constraints: "Constraints",
    goals: "Goals",
  };
  const PROFILE_LIST_FIELDS = {
    skills: "Skills",
    interests: "Interests",
    strengths: "Strengths",
  };

  function renderProfile(profile) {
    if (!profile) return;
    activeProfile = profile;

    const scalarRows = Object.entries(PROFILE_LABELS)
      .filter(([key]) => profile[key])
      .map(
        ([key, label]) => `
        <div class="profile-row">
          <span class="profile-row-label">${label}</span>
          <span class="profile-value">${escapeHtml(String(profile[key]))}</span>
        </div>`
      );

    const listRows = Object.entries(PROFILE_LIST_FIELDS)
      .filter(([key]) => Array.isArray(profile[key]) && profile[key].length)
      .map(
        ([key, label]) => `
        <div class="profile-row">
          <span class="profile-row-label">${label}</span>
          <div class="profile-badges">
            ${profile[key].map((v) => `<span class="profile-badge">${escapeHtml(v)}</span>`).join("")}
          </div>
        </div>`
      );

    const rowsHtml = [...scalarRows, ...listRows].join("");

    if (!rowsHtml) {
      if (profileEmpty) profileEmpty.hidden = false;
      if (profileRows) profileRows.hidden = true;
      if (profileStage) profileStage.hidden = true;
      return;
    }

    if (profileEmpty) profileEmpty.hidden = true;
    if (profileRows) {
      profileRows.hidden = false;
      profileRows.innerHTML = rowsHtml;
    }

    if (profileStage) {
      profileStage.hidden = false;
      profileStage.innerHTML =
        profile.stage === "recommending"
          ? "Status: <strong>Ready with specific recommendations ✨</strong>"
          : "Status: <strong>Navix is gathering your background details…</strong>";
    }
  }

  // -----------------------------------------------------------------------
  // Status Indicator
  // -----------------------------------------------------------------------
  async function checkHealth() {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      const data = await res.json();
      if (data.status === "ok" && data.apiKeyConfigured) {
        statusDot.className = "status-dot online";
        statusText.textContent = "Ready to guide your career";
      } else if (data.status === "ok" && !data.apiKeyConfigured) {
        statusDot.className = "status-dot error";
        statusText.textContent = "Server missing Gemini API key";
      } else {
        statusDot.className = "status-dot error";
        statusText.textContent = "Backend unavailable";
      }
    } catch (err) {
      statusDot.className = "status-dot error";
      statusText.textContent = "Cannot reach backend server";
    }
  }

  // -----------------------------------------------------------------------
  // Previous Conversations & Firestore Persistence
  // -----------------------------------------------------------------------
  async function refreshConversationsList() {
    if (!currentUser || !conversationsList) return;

    try {
      const conversations = await getUserConversations(currentUser.uid);
      if (!conversations.length) {
        conversationsList.innerHTML = `<li class="conversations-empty">No saved conversations yet.</li>`;
        return;
      }

      conversationsList.innerHTML = conversations
        .map(
          (conv) => `
          <li class="conversation-item ${conv.id === activeConversationId ? "active" : ""}" data-id="${escapeHtml(conv.id)}">
            <div class="conv-info">
              <span class="conv-title">${escapeHtml(conv.title || "Career Discussion")}</span>
              <span class="conv-time">${formatRelativeDate(conv.updatedAt)}</span>
            </div>
            <button type="button" class="conv-delete-btn" data-delete-id="${escapeHtml(conv.id)}" title="Delete conversation" aria-label="Delete conversation">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </li>
        `
        )
        .join("");
    } catch (err) {
      console.warn("Could not refresh conversations list:", err);
    }
  }

  async function persistActiveConversation() {
    if (!currentUser || !activeConversationId || !activeMessages.length) return;

    // Derive a clean title from the first user message if needed
    if (activeConversationTitle === "New Career Guidance") {
      const firstUserMsg = activeMessages.find((m) => m.role === "user");
      if (firstUserMsg && firstUserMsg.text) {
        activeConversationTitle =
          firstUserMsg.text.length > 36
            ? firstUserMsg.text.substring(0, 36).trim() + "…"
            : firstUserMsg.text;
      }
    }

    await saveConversation(currentUser.uid, activeConversationId, {
      title: activeConversationTitle,
      messages: activeMessages,
      profile: activeProfile,
    });

    await refreshConversationsList();
  }

  async function switchConversation(id) {
    if (!currentUser || !id || id === activeConversationId) return;

    try {
      const convData = await loadConversation(currentUser.uid, id);
      if (!convData) return;

      activeConversationId = id;
      activeConversationTitle = convData.title || "Career Guidance";
      activeMessages = convData.messages || [];
      activeProfile = convData.profile || {};

      resetChatUI();

      // Render loaded messages
      activeMessages.forEach((msg) => {
        addMessage(msg.role, msg.text, { reaction: msg.reaction, time: msg.time });
      });

      renderProfile(activeProfile);
      refreshConversationsList();
      closeSidebarOnMobile();
    } catch (err) {
      console.error("Failed to switch conversation:", err);
    }
  }

  function resetChatUI() {
    if (messagesEl) messagesEl.innerHTML = "";
    if (welcomeEl) welcomeEl.style.display = "";
    if (profileEmpty) profileEmpty.hidden = false;
    if (profileRows) {
      profileRows.hidden = true;
      profileRows.innerHTML = "";
    }
    if (profileStage) profileStage.hidden = true;
  }

  async function startNewChat() {
    initActiveConversation();
    await refreshConversationsList();
    closeSidebarOnMobile();
  }

  async function clearChat() {
    if (currentUser && activeConversationId) {
      await deleteConversation(currentUser.uid, activeConversationId);
    }
    await startNewChat();
  }

  // -----------------------------------------------------------------------
  // Sending Messages & Gemini Communication
  // -----------------------------------------------------------------------
  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Add User message
    addMessage("user", trimmed, { time });
    activeMessages.push({ role: "user", text: trimmed, time });

    input.value = "";
    autoResize();
    setSending(true);
    showTyping(true);

    try {
      // Send turn to backend API (Gemini). Only the active conversation context is used!
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeConversationId,
          message: trimmed,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      showTyping(false);

      // Determine reaction for Navix robot
      const reaction = determineNavixReaction(trimmed, data.reply, data.profile);

      // Add Bot message
      addMessage("bot", data.reply, { reaction, time });
      activeMessages.push({ role: "bot", text: data.reply, reaction, time });

      renderProfile(data.profile);
      statusDot.className = "status-dot online";
      statusText.textContent = "Ready to guide your career";

      // Persist updated conversation under user's Firebase UID
      await persistActiveConversation();
    } catch (err) {
      showTyping(false);
      addMessage(
        "bot",
        err.message || "Navix could not respond right now. Please try again in a moment.",
        { error: true }
      );
      statusDot.className = "status-dot error";
      statusText.textContent = "Trouble reaching Navix";
    } finally {
      setSending(false);
      input.focus();
    }
  }

  // -----------------------------------------------------------------------
  // Sidebar (Mobile) Toggling
  // -----------------------------------------------------------------------
  function openSidebar() {
    appEl.classList.add("sidebar-visible");
  }
  function closeSidebarOnMobile() {
    appEl.classList.remove("sidebar-visible");
  }

  // -----------------------------------------------------------------------
  // Event Wiring
  // -----------------------------------------------------------------------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener("input", () => {
    autoResize();
    sendBtn.disabled = isSending || !input.value.trim();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  promptList.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-prompt]");
    if (!li) return;
    sendMessage(li.getAttribute("data-prompt"));
    closeSidebarOnMobile();
  });

  if (welcomeEl) {
    welcomeEl.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-prompt]");
      if (!chip) return;
      sendMessage(chip.getAttribute("data-prompt"));
    });
  }

  if (conversationsList) {
    conversationsList.addEventListener("click", async (e) => {
      // Check if delete button clicked
      const deleteBtn = e.target.closest("[data-delete-id]");
      if (deleteBtn) {
        e.stopPropagation();
        const delId = deleteBtn.getAttribute("data-delete-id");
        if (currentUser && delId) {
          await deleteConversation(currentUser.uid, delId);
          if (delId === activeConversationId) {
            await startNewChat();
          } else {
            await refreshConversationsList();
          }
        }
        return;
      }

      // Conversation item clicked
      const convItem = e.target.closest(".conversation-item[data-id]");
      if (convItem) {
        const id = convItem.getAttribute("data-id");
        await switchConversation(id);
      }
    });
  }

  newChatBtn.addEventListener("click", startNewChat);
  if (mobileNewChatBtn) {
    mobileNewChatBtn.addEventListener("click", startNewChat);
  }
  clearChatBtn.addEventListener("click", clearChat);

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await logoutUser();
        window.location.replace("login.html");
      } catch (err) {
        console.error("Logout error:", err);
      }
    });
  }

  sidebarOpenBtn.addEventListener("click", openSidebar);
  sidebarCloseBtn.addEventListener("click", closeSidebarOnMobile);
  sidebarOverlay.addEventListener("click", closeSidebarOnMobile);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSidebarOnMobile();
    }
  });

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------
  sendBtn.disabled = true;
  checkHealth();
})();
