import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAKZMu2HZPmmoZ1fFT7DNA9Q6ystbKEPgE",
  authDomain: "samnanger-g14-f10a1.firebaseapp.com",
  projectId: "samnanger-g14-f10a1",
  storageBucket: "samnanger-g14-f10a1.firebasestorage.app",
  messagingSenderId: "926427862844",
  appId: "1:926427862844:web:5e6d11bb689c802d01b039",
  measurementId: "G-EJL3YYC63R"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth();

const loginBox = document.getElementById("loginBox");
const appSection = document.getElementById("app");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const errorEl = document.getElementById("loginError");
const listEl = document.getElementById("matchList");
const statusEl = document.getElementById("status");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const KAMP_PAGE_VERSION = "20260818-4";

function getTodayString() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(dateString) {
  if (!dateString) return "I dag";
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const formatted = new Intl.DateTimeFormat("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getMatchTypeLabel(type) {
  return {
    league: "Seriekamp",
    cup: "Cupkamp",
    friendly: "Treningskamp"
  }[type] || "Kamp";
}

function getStatusInfo(status) {
  const normalized = String(status || "UPCOMING").toUpperCase();

  if (["LIVE", "TEMP_STOPPED", "HALFTIME", "PAUSED"].includes(normalized)) {
    return {
      label: normalized === "LIVE" ? "Kampen pågår" : "Kampen er satt på pause",
      button: "Fortsett kampen",
      className: "is-live"
    };
  }

  return {
    label: "Klar til kamp",
    button: "Åpne kampregistrering",
    className: "is-upcoming"
  };
}

function getInitials(teamName) {
  const parts = String(teamName || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildMatchCard(match) {
  const meta = match.data.meta || {};
  const opponent = meta.opponent?.trim() || "Motstander";
  const isAway = (meta.venueType || meta.venue) === "away";
  const homeTeam = isAway ? opponent : "Samnanger";
  const awayTeam = isAway ? "Samnanger" : opponent;
  const homeBadgeClass = homeTeam === "Samnanger" ? "samnanger-badge" : "opponent-badge";
  const awayBadgeClass = awayTeam === "Samnanger" ? "samnanger-badge" : "opponent-badge";
  const venueLabel = isAway ? "Bortekamp" : "Hjemmekamp";
  const venueName = meta.venueName?.trim();
  const status = getStatusInfo(match.data.status);
  const kickoff = meta.time || meta.startTime || "Tid ikke satt";

  const card = document.createElement("article");
  card.className = `match-card ${status.className}`;
  card.innerHTML = `
    <div class="match-card-topline">
      <span class="match-status"><span></span>${escapeHtml(status.label)}</span>
      <span class="kickoff-time">${kickoff === "Tid ikke satt" ? "" : "Kl. "}${escapeHtml(kickoff)}</span>
    </div>

    <div class="fixture">
      <div class="team">
        <div class="team-badge ${homeBadgeClass}">${escapeHtml(getInitials(homeTeam))}</div>
        <strong>${escapeHtml(homeTeam)}</strong>
        <span>Hjemme</span>
      </div>

      <div class="versus">
        <span>${escapeHtml(formatDate(meta.date))}</span>
        <strong>VS</strong>
        <i></i>
      </div>

      <div class="team">
        <div class="team-badge ${awayBadgeClass}">${escapeHtml(getInitials(awayTeam))}</div>
        <strong>${escapeHtml(awayTeam)}</strong>
        <span>Borte</span>
      </div>
    </div>

    <div class="match-meta">
      <span><b aria-hidden="true">●</b>${escapeHtml(getMatchTypeLabel(meta.type))}</span>
      <span><b aria-hidden="true">⌖</b>${escapeHtml(venueLabel)}${venueName ? ` · ${escapeHtml(venueName)}` : ""}</span>
    </div>

    <button class="open-match-button" type="button">
      <span>${escapeHtml(status.button)}</span>
      <span class="button-arrow" aria-hidden="true">→</span>
    </button>
  `;

  card.querySelector(".open-match-button").addEventListener("click", () => {
    localStorage.setItem("activeMatchId", match.id);
    window.location.href =
      `kamp.html?matchId=${encodeURIComponent(match.id)}&v=${KAMP_PAGE_VERSION}`;
  });

  return card;
}

async function logIn() {
  errorEl.textContent = "";
  loginBtn.disabled = true;
  loginBtn.textContent = "Logger inn …";

  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );
  } catch (error) {
    console.error(error);
    errorEl.textContent = "Feil e-post eller passord.";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Logg inn";
  }
}

loginBtn.addEventListener("click", logIn);
passwordInput.addEventListener("keydown", event => {
  if (event.key === "Enter") logIn();
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, user => {
  if (user) {
    loginBox.hidden = true;
    appSection.hidden = false;
    loadMatches();
  } else {
    loginBox.hidden = false;
    appSection.hidden = true;
  }
});

async function loadMatches() {
  const todayString = getTodayString();
  statusEl.hidden = false;
  statusEl.className = "status-message is-loading";
  statusEl.textContent = "Finner dagens kamp …";
  listEl.replaceChildren();

  try {
    const matchesQuery = query(
      collection(db, "matches"),
      where("meta.date", "==", todayString)
    );
    const snapshot = await getDocs(matchesQuery);
    const matches = snapshot.docs
      .map(docSnapshot => ({ id: docSnapshot.id, data: docSnapshot.data() }))
      .filter(match => String(match.data.status || "").toUpperCase() !== "ENDED")
      .sort((a, b) => {
        const aTime = a.data.meta?.time || a.data.meta?.startTime || "99:99";
        const bTime = b.data.meta?.time || b.data.meta?.startTime || "99:99";
        return aTime.localeCompare(bTime);
      });

    if (matches.length === 0) {
      statusEl.className = "status-message is-empty";
      statusEl.innerHTML = `
        <span class="empty-icon" aria-hidden="true">✓</span>
        <strong>Ingen kamp i dag</strong>
        <span>Neste kamp finner du i oversikten.</span>
      `;
      return;
    }

    statusEl.hidden = true;
    matches.forEach(match => listEl.appendChild(buildMatchCard(match)));
  } catch (error) {
    console.error(error);
    statusEl.className = "status-message is-error";
    statusEl.innerHTML = `
      <strong>Kunne ikke hente dagens kamp</strong>
      <span>Sjekk nettet og prøv å laste siden på nytt.</span>
    `;
  }
}
