console.log("🔥 firebase-refleksjon.js LASTET");

// firebase-refleksjon.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAKZMu2HZPmmoZ1fFT7DNA9Q6ystbKEPgE",
  authDomain: "samnanger-g14-f10a1.firebaseapp.com",
  projectId: "samnanger-g14-f10a1",
  storageBucket: "samnanger-g14-f10a1.firebasestorage.app",
  messagingSenderId: "926427862844",
  appId: "1:926427862844:web:5e6d11bb689c802d01b039",
  measurementId: "G-EJL3YYC63R"
};

// 🔑 ÉN felles app for refleksjon
export const app = initializeApp(firebaseConfig);

// 🔑 DELTE instanser (kritisk)
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");

console.log("FUNCTIONS REGION:", functions.region);

// Kampregistrering: små visuelle justeringer som skal ligge over kamp.html/styles.css.
function installMatchUiPolish() {
  if (document.getElementById("match-ui-polish")) return;

  const style = document.createElement("style");
  style.id = "match-ui-polish";
  style.textContent = `
    #halfTimeBtn {
      border: 1px solid rgba(248, 113, 113, 0.28) !important;
      background: rgba(127, 29, 29, 0.18) !important;
      color: #fca5a5 !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }

    #halfTimeBtn:hover {
      border-color: rgba(248, 113, 113, 0.46) !important;
      background: rgba(127, 29, 29, 0.28) !important;
      color: #fecaca !important;
    }

    #matchUI #clock-section {
      border: 1px solid rgba(96, 165, 250, 0.38) !important;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.055),
        inset 0 0 0 1px rgba(96, 165, 250, 0.025),
        0 14px 30px rgba(0, 0, 0, 0.18),
        0 0 28px rgba(37, 99, 235, 0.10) !important;
    }
  `;

  document.head.appendChild(style);
}

installMatchUiPolish();

// Kampregistrering: den synlige klokken viser samlet kamptid.
// En 2 x 35-kamp går derfor fra 35:00 til 70:00 i 2. omgang.
// Beskytt Slutt-knappen mot å få tidsutløpt-puls allerede ved 35:00.
function installEndButtonPulseGuard() {
  const endBtn = document.getElementById("endBtn");
  const gameClock = document.getElementById("game-clock");
  const halfLength = document.getElementById("halfLength");
  const periodIndicator = document.getElementById("period-indicator");

  if (!endBtn || !gameClock || !halfLength || !periodIndicator) return;

  const getClockSeconds = () => {
    const match = String(gameClock.textContent || "").match(/(\d+):(\d{2})/);
    if (!match) return 0;
    return Number(match[1]) * 60 + Number(match[2]);
  };

  const guardPulse = () => {
    const periodText = String(periodIndicator.textContent || "").toLowerCase();
    const isSecondHalf = periodText.includes("2.") || periodText.includes("2 ");
    if (!isSecondHalf) return;

    const halfMinutes = Math.max(1, Number(halfLength.value) || 35);
    const fullTimeSeconds = halfMinutes * 2 * 60;

    if (getClockSeconds() < fullTimeSeconds) {
      endBtn.classList.remove("time-ended-pulse");
    }
  };

  // kamp.html oppdaterer pulsklassen hvert 250 ms, derfor kjører vakten
  // litt oftere og slipper den automatisk gjennom når full tid er nådd.
  setInterval(guardPulse, 100);
  guardPulse();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installEndButtonPulseGuard, { once: true });
} else {
  installEndButtonPulseGuard();
}
