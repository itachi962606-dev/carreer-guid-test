# Navix — AI Career Guidance Chatbot

A full-stack career guidance AI platform. Navix gathers real facts about a person (education, skills, interests, experience, constraints) and turns them into exact, ranked career recommendations — instead of generic advice.

Built with plain HTML/CSS/JS with a **Light Pastel Glassmorphism** design on the frontend, Node.js/Express on the backend using the free-tier Google Gemini API, and **Firebase Authentication & Cloud Firestore** for persistent, secure user sessions.

```
Navix-career-ai/
├── api/
│   └── index.js             Vercel serverless entrypoint for the Express API
├── vercel.json              Vercel build and routing configuration
├── backend/
│   ├── server.js            Express API that proxies chat turns to Gemini
│   ├── package.json
│   └── .env.example          Copy to .env and add your GEMINI_API_KEY
├── frontend/
│   ├── index.html           Protected Career Chat UI & Sidebar
│   ├── login.html           Ultra-premium Light Pastel Login/Signup portal
│   ├── login.js             Login portal logic & animated mascot reactions
│   ├── firebase-config.js   Firebase v10 Auth & Firestore service layer
│   ├── script.js            Chat logic, Firestore persistence & profile handling
│   └── style.css            Light pastel glassmorphism styling & animations
└── firestore.rules          Firebase Firestore security rules (UID-isolated)
```

---

## 1. Firebase Setup (Authentication & Firestore)

1. Create a Firebase project at the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** in the Firebase Console:
   - **Google**: Enable Google sign-in provider.
   - **Email/Password**: Enable Email/Password provider.
3. Enable **Cloud Firestore** in the Firebase Console in production or test mode.
4. Apply the security rules from `firestore.rules` in your Firebase Console Firestore Rules tab.
5. In Project Settings &rarr; General &rarr; **Your apps**, register a Web App and copy your `firebaseConfig` object.
6. Paste your Firebase web app configuration into `frontend/firebase-config.js`:

```javascript
const defaultFirebaseConfig = {
  apiKey: "your_firebase_web_api_key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "your_sender_id",
  appId: "your_app_id",
};
```

The Firebase web API key is a public client identifier required by Firebase and
is protected by Firebase Authentication, authorized domains, and Firestore
rules. Never place the private Gemini key in frontend files.

---

## 2. Backend Setup (Gemini API)

1. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Set up the backend:

```bash
cd backend
npm install
cp .env.example .env
```

Open `backend/.env` and paste your key:

```ini
GEMINI_API_KEY=your_actual_key_here
GEMINI_MODEL=gemini-3.6-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-flash-lite-latest
PORT=5000
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000
```

Run the backend server:

```bash
npm start
```

---

## 3. Deploying to Vercel

Deploy the repository root, not the `frontend` directory. The included
`vercel.json` serves the static frontend and routes `/api/*` to the Express
serverless function.

In Vercel Project Settings:

- **Root Directory:** repository root (`tamizh-career-ai`)
- **Framework Preset:** Other
- **Build Command:** leave empty
- **Output Directory:** leave empty
- **Install Command:** use the value from `vercel.json`, or leave the project setting empty

Add these Environment Variables for Production, Preview, and Development:

```ini
GEMINI_API_KEY=your_private_gemini_key
GEMINI_MODEL=gemini-3.6-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-flash-lite-latest
ALLOWED_ORIGINS=*
```

Redeploy after adding or changing environment variables. Open `/login.html` on
the deployed domain. Add the Vercel production and preview domains to Firebase
Authentication > Settings > Authorized domains, and configure the Google OAuth
provider with the same domains if Google sign-in is enabled.

Do not set Vercel Root Directory to `frontend`; that prevents Vercel from
including `api/index.js` and `backend/server.js`, which makes the API unavailable.

## 4. Running the Frontend

The frontend uses standard static web technologies with modular Firebase SDK imports (zero build step needed).

1. Serve the `frontend/` directory with any static server:
   ```bash
   # Example with VS Code Live Server or npx serve:
   npx serve frontend
   ```
2. Open `http://localhost:3000/login.html` (or `http://localhost:5500/login.html`).
3. If unauthenticated, visitors are automatically sent to the Login portal. Once logged in (via Google or Email/Password), users are taken to the protected chat application (`index.html`) with their previous conversations loaded securely from Firestore.

---

## Key Features

- **Route Protection**: Direct access to `index.html` without logging in immediately redirects to `login.html`.
- **Firebase Auth**: Continue with Google, Email/Password login, Sign-Up with name, Password Reset email flow, and Logout.
- **User Data Isolation (Firestore)**:
  - User profiles saved under `users/{uid}`.
  - Conversation histories saved under `users/{uid}/conversations/{conversationId}`.
  - User A can never see User B's conversations.
- **Independent AI Context**: Gemini only receives the active conversation context — old conversation histories are stored for user viewing and are never mixed into new chats.
- **Light Pastel Glassmorphism & Animated Mascot**: Ambient mesh lighting, frosted glass cards, and an interactive pixel-art mascot that reacts to authentication states and chat advice.
