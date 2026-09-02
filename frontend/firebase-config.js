/**
 * Navix — Firebase Configuration & Service Layer
 * Authentication (Google, Email/Password) & Cloud Firestore Data Persistence
 * Uses Firebase v10 Modular SDK (CDN)
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---------------------------------------------------------------------------
// Firebase Configuration
// Replace with your Firebase Project Configuration from Firebase Console:
// https://console.firebase.google.com/ -> Project Settings -> General -> Your apps
// ---------------------------------------------------------------------------
const defaultFirebaseConfig = {
  apiKey: "AIzaSyAvpvznO6bS5-N7Kqlisw5r9ehteIH_Y2c",
  authDomain: "student-attendece-11.firebaseapp.com",
  projectId: "student-attendece-11",
  storageBucket: "student-attendece-11.firebasestorage.app",
  messagingSenderId: "495290131606",
  appId: "1:495290131606:web:bcfcfe3d7b4477a7678eb7",
  measurementId: "G-HL68FMC506",
};

// Allow custom config injection via window or localStorage for quick deployment
const firebaseConfig =
  window.NAVIX_FIREBASE_CONFIG ||
  (() => {
    try {
      const stored = localStorage.getItem("navix_firebase_config");
      return stored ? JSON.parse(stored) : defaultFirebaseConfig;
    } catch (e) {
      return defaultFirebaseConfig;
    }
  })();

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ---------------------------------------------------------------------------
// Error Message Translation Helper
// ---------------------------------------------------------------------------
export function getFriendlyErrorMessage(error) {
  if (!error) return "An unexpected error occurred. Please try again.";
  const code = error.code || "";
  const msg = error.message || "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password. Please double check and try again.";
    case "auth/email-already-in-use":
      return "An account with this email address already exists. Please sign in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Please use at least 6 characters.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed before completing. Please try again.";
    case "auth/popup-blocked":
      return "Sign-in popup was blocked by your browser. Please allow popups for this site.";
    case "auth/too-many-requests":
      return "Too many unsuccessful attempts. Access is temporarily disabled. Please reset your password or try again later.";
    case "auth/network-request-failed":
      return "Network connection issue. Please check your internet connection.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/requires-recent-login":
      return "Please log in again to perform this sensitive action.";
    default:
      if (msg.includes("API key not valid") || code === "auth/invalid-api-key") {
        return "Firebase is not configured with your project API key yet. Please add your credentials in firebase-config.js.";
      }
      return msg || "Authentication error. Please try again.";
  }
}

// ---------------------------------------------------------------------------
// Authentication Methods
// ---------------------------------------------------------------------------

/** Listen to Authentication State changes */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/** Get Current Authenticated User */
export function getCurrentUser() {
  return auth.currentUser;
}

/** Continue with Google Sign-In */
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    await saveUserProfile(user, { provider: "google" });
    return user;
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw error;
  }
}

/** Email & Password Login */
export async function loginWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email.trim(), password);
    const user = result.user;
    await saveUserProfile(user, { provider: "password" });
    return user;
  } catch (error) {
    console.error("Email login error:", error);
    throw error;
  }
}

/** Create New Account with Email, Password & Display Name */
export async function signupWithEmail(name, email, password) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = result.user;
    if (name && name.trim()) {
      await updateProfile(user, { displayName: name.trim() });
    }
    await saveUserProfile(user, {
      displayName: name.trim() || user.displayName || "User",
      provider: "password",
    });
    return user;
  } catch (error) {
    console.error("Sign-up error:", error);
    throw error;
  }
}

/** Send Password Reset Email */
export async function sendPasswordReset(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return true;
  } catch (error) {
    console.error("Password reset error:", error);
    throw error;
  }
}

/** Logout Current User */
export async function logoutUser() {
  try {
    await signOut(auth);
    return true;
  } catch (error) {
    console.error("Sign-out error:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Firestore User Data & Conversation Persistence Methods
// ---------------------------------------------------------------------------

/** Save or update user profile details in Firestore */
export async function saveUserProfile(user, extraData = {}) {
  if (!user || !user.uid) return;
  try {
    const userRef = doc(db, "users", user.uid);
    const existingSnap = await getDoc(userRef);
    const now = new Date().toISOString();

    const userData = {
      uid: user.uid,
      displayName: user.displayName || extraData.displayName || "Career Seeker",
      email: user.email || "",
      photoURL: user.photoURL || null,
      provider: extraData.provider || (user.providerData?.[0]?.providerId === "google.com" ? "google" : "password"),
      lastLoginAt: now,
    };

    if (!existingSnap.exists()) {
      userData.createdAt = now;
    }

    await setDoc(userRef, userData, { merge: true });
  } catch (err) {
    console.warn("Could not save user profile to Firestore (check rules/config):", err.message);
  }
}

/** Get list of all previous conversations for an authenticated user */
export async function getUserConversations(uid) {
  if (!uid) return [];
  try {
    const convsRef = collection(db, "users", uid, "conversations");
    const q = query(convsRef, orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);

    const conversations = [];
    snapshot.forEach((docSnap) => {
      conversations.push({
        id: docSnap.id,
        ...docSnap.data(),
      });
    });
    return conversations;
  } catch (err) {
    console.warn("Could not fetch conversations from Firestore:", err.message);
    return [];
  }
}

/** Save a conversation's messages and profile data under the user's UID */
export async function saveConversation(uid, conversationId, data) {
  if (!uid || !conversationId) return;
  try {
    const convRef = doc(db, "users", uid, "conversations", conversationId);
    const now = new Date().toISOString();

    const convPayload = {
      conversationId,
      title: data.title || "Career Discussion",
      messages: data.messages || [],
      profile: data.profile || {},
      updatedAt: now,
    };

    if (data.createdAt) {
      convPayload.createdAt = data.createdAt;
    } else {
      convPayload.createdAt = now;
    }

    await setDoc(convRef, convPayload, { merge: true });
  } catch (err) {
    console.warn("Could not save conversation to Firestore:", err.message);
  }
}

/** Load a specific conversation by ID */
export async function loadConversation(uid, conversationId) {
  if (!uid || !conversationId) return null;
  try {
    const convRef = doc(db, "users", uid, "conversations", conversationId);
    const snap = await getDoc(convRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    console.warn("Could not load conversation from Firestore:", err.message);
    return null;
  }
}

/** Delete a specific conversation */
export async function deleteConversation(uid, conversationId) {
  if (!uid || !conversationId) return;
  try {
    const convRef = doc(db, "users", uid, "conversations", conversationId);
    await deleteDoc(convRef);
    return true;
  } catch (err) {
    console.warn("Could not delete conversation from Firestore:", err.message);
    return false;
  }
}

// Expose on window for easy global access across scripts
window.NavixFirebase = {
  auth,
  db,
  onAuthChange,
  getCurrentUser,
  loginWithGoogle,
  loginWithEmail,
  signupWithEmail,
  sendPasswordReset,
  logoutUser,
  saveUserProfile,
  getUserConversations,
  saveConversation,
  loadConversation,
  deleteConversation,
  getFriendlyErrorMessage,
};
