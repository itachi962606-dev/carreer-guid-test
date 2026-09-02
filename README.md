# Navix — AI Career Guidance Chatbot

A full-stack career guidance AI platform. Navix gathers real facts about a person (education, skills, interests, experience, constraints) and turns them into exact, ranked career recommendations — instead of generic advice.

Built with plain HTML/CSS/JS with a **Light Pastel Glassmorphism** design on the frontend, Node.js/Express on the backend using the free-tier Google Gemini API, and **Firebase Authentication & Cloud Firestore** for persistent, secure user sessions.

```
Navix-career-ai/
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
6. Paste your credentials into `frontend/firebase-config.js`:

```javascript
const defaultFirebaseConfig = {
  apiKey: "AIzaSyAvpvznO6bS5-N7Kqlisw5r9ehteIH_Y2c",
  authDomain: "student-attendece-11.firebaseapp.com",
  projectId: "student-attendece-11",
  storageBucket: "student-attendece-11.firebasestorage.app",
  messagingSenderId: "495290131606",
  appId: "1:495290131606:web:bcfcfe3d7b4477a7678eb7",
  measurementId: "G-HL68FMC506",
};
```

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
PORT=5000
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000
```

Run the backend server:

```bash
npm start
```

---

## 3. Running the Frontend

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
