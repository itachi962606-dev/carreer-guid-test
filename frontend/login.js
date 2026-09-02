/**
 * Navix — Authentication Page Logic (login.js)
 * Manages Auth State Guard, Google Sign-In, Email/Password, Sign-Up, Password Reset, and Mascot Reactions
 */

import {
  onAuthChange,
  loginWithGoogle,
  loginWithEmail,
  signupWithEmail,
  sendPasswordReset,
  getFriendlyErrorMessage,
} from "./firebase-config.js";

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // DOM Elements
  // ---------------------------------------------------------------------------
  const authSplash = document.getElementById("authSplash");
  const authPage = document.getElementById("authPage");

  // Mascot Elements
  const mascotFrame = document.getElementById("mascotFrame");
  const robotAntenna = document.getElementById("robotAntenna");
  const robotEyeL = document.getElementById("robotEyeL");
  const robotEyeR = document.getElementById("robotEyeR");
  const robotMouth = document.getElementById("robotMouth");

  // Views & Tabs
  const signInView = document.getElementById("signInView");
  const signUpView = document.getElementById("signUpView");
  const goToSignUpBtn = document.getElementById("goToSignUpBtn");
  const goToSignInBtn = document.getElementById("goToSignInBtn");

  // Forms & Inputs
  const signInForm = document.getElementById("signInForm");
  const signInEmail = document.getElementById("signInEmail");
  const signInPassword = document.getElementById("signInPassword");
  const signInSubmitBtn = document.getElementById("signInSubmitBtn");
  const googleSignInBtn = document.getElementById("googleSignInBtn");

  const signUpForm = document.getElementById("signUpForm");
  const signUpName = document.getElementById("signUpName");
  const signUpEmail = document.getElementById("signUpEmail");
  const signUpPassword = document.getElementById("signUpPassword");
  const signUpConfirmPassword = document.getElementById("signUpConfirmPassword");
  const signUpSubmitBtn = document.getElementById("signUpSubmitBtn");
  const googleSignUpBtn = document.getElementById("googleSignUpBtn");

  // Forgot Password Modal
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const forgotModalBackdrop = document.getElementById("forgotModalBackdrop");
  const closeForgotModalBtn = document.getElementById("closeForgotModalBtn");
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");
  const forgotEmail = document.getElementById("forgotEmail");
  const forgotSubmitBtn = document.getElementById("forgotSubmitBtn");

  // Alert Banners
  const authAlert = document.getElementById("authAlert");
  const authAlertText = document.getElementById("authAlertText");
  const modalAlert = document.getElementById("modalAlert");
  const modalAlertText = document.getElementById("modalAlertText");

  // ---------------------------------------------------------------------------
  // Mascot Reaction States
  // ---------------------------------------------------------------------------
  function setMascotState(state) {
    if (!mascotFrame) return;

    // Reset base classes
    mascotFrame.classList.remove(
      "mascot-idle",
      "mascot-hover",
      "mascot-thinking",
      "mascot-celebrating",
      "mascot-supportive"
    );

    switch (state) {
      case "hover":
        mascotFrame.classList.add("mascot-hover");
        if (robotMouth) robotMouth.setAttribute("d", "M26 29 Q32 34 38 29");
        break;

      case "thinking":
        mascotFrame.classList.add("mascot-thinking");
        if (robotMouth) robotMouth.setAttribute("d", "M29 30 Q32 30 35 30");
        break;

      case "celebrating":
        mascotFrame.classList.add("mascot-celebrating");
        if (robotMouth) robotMouth.setAttribute("d", "M26 28 Q32 35 38 28");
        break;

      case "supportive":
        mascotFrame.classList.add("mascot-supportive");
        if (robotMouth) robotMouth.setAttribute("d", "M28 31 Q32 29 36 31");
        break;

      case "idle":
      default:
        mascotFrame.classList.add("mascot-idle");
        if (robotMouth) robotMouth.setAttribute("d", "M28 29 Q32 32 36 29");
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Alert Helpers
  // ---------------------------------------------------------------------------
  function showAlert(message, type = "error") {
    if (!authAlert || !authAlertText) return;
    authAlertText.textContent = message;
    authAlert.className = `auth-alert-banner alert-${type}`;
    authAlert.hidden = false;
    authAlert.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideAlert() {
    if (authAlert) authAlert.hidden = true;
  }

  function showModalAlert(message, type = "error") {
    if (!modalAlert || !modalAlertText) return;
    modalAlertText.textContent = message;
    modalAlert.className = `auth-alert-banner alert-${type}`;
    modalAlert.hidden = false;
  }

  function hideModalAlert() {
    if (modalAlert) modalAlert.hidden = true;
  }

  // ---------------------------------------------------------------------------
  // Button Loading State Helper
  // ---------------------------------------------------------------------------
  function setButtonLoading(btn, isLoading, defaultText = "Submit") {
    if (!btn) return;
    const label = btn.querySelector(".btn-label");
    const spinner = btn.querySelector(".btn-spinner");

    btn.disabled = isLoading;
    if (isLoading) {
      if (label) label.textContent = "Please wait…";
      if (spinner) spinner.hidden = false;
    } else {
      if (label) label.textContent = defaultText;
      if (spinner) spinner.hidden = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Auth State Guard
  // ---------------------------------------------------------------------------
  let isAuthResolved = false;

  onAuthChange((user) => {
    isAuthResolved = true;
    if (user) {
      // User is authenticated -> Forward to main chat application
      window.location.replace("index.html");
    } else {
      // User is not authenticated -> Show Login UI
      if (authSplash) authSplash.style.display = "none";
      if (authPage) authPage.style.display = "flex";
      setMascotState("idle");
    }
  });

  // Fallback safety timeout if network is slow
  setTimeout(() => {
    if (!isAuthResolved) {
      if (authSplash) authSplash.style.display = "none";
      if (authPage) authPage.style.display = "flex";
    }
  }, 3500);

  // ---------------------------------------------------------------------------
  // View Toggling (Sign In <-> Sign Up)
  // ---------------------------------------------------------------------------
  if (goToSignUpBtn) {
    goToSignUpBtn.addEventListener("click", () => {
      hideAlert();
      signInView.style.display = "none";
      signUpView.style.display = "block";
      setMascotState("idle");
      if (signUpName) signUpName.focus();
    });
  }

  if (goToSignInBtn) {
    goToSignInBtn.addEventListener("click", () => {
      hideAlert();
      signUpView.style.display = "none";
      signInView.style.display = "block";
      setMascotState("idle");
      if (signInEmail) signInEmail.focus();
    });
  }

  // ---------------------------------------------------------------------------
  // Password Visibility Toggle
  // ---------------------------------------------------------------------------
  document.querySelectorAll(".btn-toggle-pw").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const targetInput = document.getElementById(targetId);
      if (!targetInput) return;

      if (targetInput.type === "password") {
        targetInput.type = "text";
        btn.classList.add("showing-pw");
      } else {
        targetInput.type = "password";
        btn.classList.remove("showing-pw");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Mascot Interactive Hover Reactions
  // ---------------------------------------------------------------------------
  const interactiveElements = [
    googleSignInBtn,
    googleSignUpBtn,
    signInSubmitBtn,
    signUpSubmitBtn,
  ].filter(Boolean);

  interactiveElements.forEach((el) => {
    el.addEventListener("mouseenter", () => setMascotState("hover"));
    el.addEventListener("mouseleave", () => setMascotState("idle"));
  });

  // ---------------------------------------------------------------------------
  // Google Sign-In Handler
  // ---------------------------------------------------------------------------
  async function handleGoogleAuth(btn) {
    hideAlert();
    setMascotState("thinking");
    if (btn) btn.disabled = true;

    try {
      await loginWithGoogle();
      setMascotState("celebrating");
      showAlert("Success! Redirecting to Navix…", "success");
      setTimeout(() => {
        window.location.replace("index.html");
      }, 500);
    } catch (err) {
      setMascotState("supportive");
      showAlert(getFriendlyErrorMessage(err), "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  if (googleSignInBtn) {
    googleSignInBtn.addEventListener("click", () => handleGoogleAuth(googleSignInBtn));
  }
  if (googleSignUpBtn) {
    googleSignUpBtn.addEventListener("click", () => handleGoogleAuth(googleSignUpBtn));
  }

  // ---------------------------------------------------------------------------
  // Email & Password Sign-In Form
  // ---------------------------------------------------------------------------
  if (signInForm) {
    signInForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAlert();

      const email = signInEmail.value.trim();
      const password = signInPassword.value;

      if (!email || !password) {
        showAlert("Please enter both your email and password.");
        return;
      }

      setMascotState("thinking");
      setButtonLoading(signInSubmitBtn, true, "Sign In");

      try {
        await loginWithEmail(email, password);
        setMascotState("celebrating");
        showAlert("Success! Redirecting to Navix…", "success");
        setTimeout(() => {
          window.location.replace("index.html");
        }, 500);
      } catch (err) {
        setMascotState("supportive");
        showAlert(getFriendlyErrorMessage(err), "error");
      } finally {
        setButtonLoading(signInSubmitBtn, false, "Sign In");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Sign-Up Form
  // ---------------------------------------------------------------------------
  if (signUpForm) {
    signUpForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAlert();

      const name = signUpName.value.trim();
      const email = signUpEmail.value.trim();
      const password = signUpPassword.value;
      const confirmPassword = signUpConfirmPassword.value;

      if (!name) {
        showAlert("Please enter your full name.");
        return;
      }
      if (!email) {
        showAlert("Please enter a valid email address.");
        return;
      }
      if (password.length < 6) {
        showAlert("Password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        showAlert("Passwords do not match. Please double check.");
        return;
      }

      setMascotState("thinking");
      setButtonLoading(signUpSubmitBtn, true, "Create Account");

      try {
        await signupWithEmail(name, email, password);
        setMascotState("celebrating");
        showAlert("Account created successfully! Redirecting…", "success");
        setTimeout(() => {
          window.location.replace("index.html");
        }, 600);
      } catch (err) {
        setMascotState("supportive");
        showAlert(getFriendlyErrorMessage(err), "error");
      } finally {
        setButtonLoading(signUpSubmitBtn, false, "Create Account");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Forgot Password Modal
  // ---------------------------------------------------------------------------
  function openForgotModal() {
    hideModalAlert();
    if (forgotEmail && signInEmail && signInEmail.value) {
      forgotEmail.value = signInEmail.value.trim();
    }
    if (forgotModalBackdrop) {
      forgotModalBackdrop.hidden = false;
      forgotModalBackdrop.style.display = "flex";
      if (forgotEmail) forgotEmail.focus();
    }
    setMascotState("thinking");
  }

  function closeForgotModal() {
    if (forgotModalBackdrop) {
      forgotModalBackdrop.hidden = true;
      forgotModalBackdrop.style.display = "none";
    }
    setMascotState("idle");
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", openForgotModal);
  }
  if (closeForgotModalBtn) {
    closeForgotModalBtn.addEventListener("click", closeForgotModal);
  }
  if (forgotModalBackdrop) {
    forgotModalBackdrop.addEventListener("click", (e) => {
      if (e.target === forgotModalBackdrop) closeForgotModal();
    });
  }

  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideModalAlert();

      const email = forgotEmail.value.trim();
      if (!email) {
        showModalAlert("Please enter your registered email address.");
        return;
      }

      setButtonLoading(forgotSubmitBtn, true, "Send Reset Link");

      try {
        await sendPasswordReset(email);
        showModalAlert(
          "Password reset link sent! Please check your email inbox and spam folder.",
          "success"
        );
        forgotEmail.value = "";
      } catch (err) {
        showModalAlert(getFriendlyErrorMessage(err), "error");
      } finally {
        setButtonLoading(forgotSubmitBtn, false, "Send Reset Link");
      }
    });
  }

  // Keyboard shortcut: Escape closes modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && forgotModalBackdrop && !forgotModalBackdrop.hidden) {
      closeForgotModal();
    }
  });
})();
