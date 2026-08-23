import {
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const matchId = new URLSearchParams(window.location.search).get("matchId");
const playingTimeList = document.getElementById("playingTimeList");

let latestMatchData = null;
let unsubscribeMatch = null;
let renderTimer = null;

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("nb-NO")
    .replace(/\s+/g, " ");
}

function formatTime(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function timestampToMs(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (Number.isFinite(Number(value?.seconds))) {
    return Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getCurrentMatchTimeMs(data) {
  const elapsedMs = Math.max(0, Number(data?.timer?.elapsedMs) || 0);
  if (data?.status !== "LIVE") return elapsedMs;

  const startMs = timestampToMs(data?.timer?.startTimestamp);
  if (!Number.isFinite(startMs)) return elapsedMs;

  return elapsedMs + Math.max(0, Date.now() - startMs);
}

function overlapMs(start, end, rangeStart, rangeEnd) {
  const from = Math.max(start, rangeStart);
  const to = Math.min(end, rangeEnd);
  return Math.max(0, to - from);
}

function getPlayingTimeBreakdown(player, data) {
  const halfMinutes = Math.max(1, Number(data?.meta?.halfLengthMin) || 35);
  const halfMs = halfMinutes * 60 * 1000;
  const fullTimeMs = halfMs * 2;
  const currentTimeMs = getCurrentMatchTimeMs(data);
  const period = Number(data?.period) === 2 ? 2 : 1;
  const intervals = Array.isArray(player?.intervals) ? player.intervals : [];

  let regularMs = 0;
  let overtimeMs = Math.max(0, Number(player?.extraPlayingTimeMs) || 0);

  intervals.forEach(interval => {
    const start = Math.max(0, Number(interval?.in) || 0);
    const rawEnd = interval?.out == null
      ? currentTimeMs
      : Math.max(0, Number(interval.out) || 0);
    const end = Math.max(start, rawEnd);

    if (period === 1) {
      // I 1. omgang er alt etter ordinær omgangslengde tilleggstid.
      regularMs += overlapMs(start, end, 0, halfMs);
      overtimeMs += Math.max(0, end - Math.max(start, halfMs));
      return;
    }

    // Etter pausen er eventuell tilleggstid fra 1. omgang flyttet til
    // extraPlayingTimeMs, mens intervallene følger ordinær kampklokke.
    regularMs += overlapMs(start, end, 0, fullTimeMs);
    overtimeMs += Math.max(0, end - Math.max(start, fullTimeMs));
  });

  return {
    regularMs,
    overtimeMs,
    totalMs: regularMs + overtimeMs
  };
}

function getPlayerNameFromRow(row) {
  const nameElement = row.querySelector(".player-name");
  if (!nameElement) return "";

  const firstTextNode = [...nameElement.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
  return normalizeName(firstTextNode?.textContent || nameElement.textContent);
}

function applyPlayingTimeDisplay() {
  if (!playingTimeList || !latestMatchData) return;

  const players = Object.values(latestMatchData?.players?.home || {});
  const playersByName = new Map(
    players
      .filter(player => player?.name)
      .map(player => [normalizeName(player.name), player])
  );

  playingTimeList.querySelectorAll("li:not(.pt-header)").forEach(row => {
    const player = playersByName.get(getPlayerNameFromRow(row));
    const valueElement = row.querySelector(".minutes-value");
    if (!player || !valueElement) return;

    const { regularMs, overtimeMs } = getPlayingTimeBreakdown(player, latestMatchData);
    const overtimeHtml = overtimeMs > 0
      ? ` <span class="player-overtime">(+${formatTime(overtimeMs)})</span>`
      : "";
    const wantedHtml = `${formatTime(regularMs)}${overtimeHtml}`;

    if (valueElement.innerHTML !== wantedHtml) {
      valueElement.innerHTML = wantedHtml;
    }
  });
}

function ensureStyles() {
  if (document.getElementById("playing-time-overtime-style")) return;

  const style = document.createElement("style");
  style.id = "playing-time-overtime-style";
  style.textContent = `
    .minutes-value .player-overtime {
      margin-left: 4px;
      color: #94a3b8;
      font-size: 0.78em;
      font-weight: 650;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

function startRendering() {
  ensureStyles();

  if (playingTimeList) {
    const observer = new MutationObserver(applyPlayingTimeDisplay);
    observer.observe(playingTimeList, {
      childList: true,
      subtree: true
    });
  }

  if (!renderTimer) {
    renderTimer = setInterval(applyPlayingTimeDisplay, 500);
  }

  applyPlayingTimeDisplay();
}

async function subscribeToMatch(user) {
  if (!matchId || !user || getApps().length === 0) return;

  const app = getApp();
  const db = getFirestore(app);
  const coachRef = doc(db, "matches", matchId);
  const assistantRef = doc(db, "assistantMatches", user.uid, "matches", matchId);

  let selectedRef = null;

  try {
    const coachSnap = await getDoc(coachRef);
    if (coachSnap.exists()) selectedRef = coachRef;
  } catch (error) {
    console.debug("Spilletid: hovedkamp ikke tilgjengelig for denne brukeren.", error);
  }

  if (!selectedRef) {
    try {
      const assistantSnap = await getDoc(assistantRef);
      if (assistantSnap.exists()) selectedRef = assistantRef;
    } catch (error) {
      console.debug("Spilletid: assistentkamp ikke tilgjengelig.", error);
    }
  }

  if (!selectedRef) return;

  unsubscribeMatch?.();
  unsubscribeMatch = onSnapshot(selectedRef, snapshot => {
    if (!snapshot.exists()) return;
    latestMatchData = snapshot.data();
    applyPlayingTimeDisplay();
  });
}

function init() {
  startRendering();

  if (!matchId || getApps().length === 0) return;

  const auth = getAuth(getApp());
  onAuthStateChanged(auth, user => {
    if (user) subscribeToMatch(user);
  });
}

init();
