import {
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const matchId = new URLSearchParams(window.location.search).get("matchId");
const playingTimeList = document.getElementById("playingTimeList");
const gameClock = document.getElementById("game-clock");
const halfTimeBtn = document.getElementById("halfTimeBtn");
const halfTimeEndInput = document.getElementById("halfTimeEndInput");
const confirmHalfTimeEndBtn = document.getElementById("confirmHalfTimeEndBtn");

let latestMatchData = null;
let unsubscribeMatch = null;
let renderTimer = null;
let activeMatchRef = null;
let pendingExactFirstHalfMs = null;
let halfTimeInputWasEdited = false;
let precisionPatchRunning = false;

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

function getDisplayedClockMs() {
  const clockText = String(gameClock?.textContent || "");
  const matches = [...clockText.matchAll(/(\d+):(\d{2})/g)];
  if (matches.length === 0) return null;

  let totalMs = (Number(matches[0][1]) * 60 + Number(matches[0][2])) * 1000;

  // Ved tilleggstid viser klokken f.eks. 35:00 (+00:18).
  // Den faktiske tiden er da 35:18, ikke 36:00.
  if (matches.length > 1 && clockText.includes("(+")) {
    totalMs += (Number(matches[1][1]) * 60 + Number(matches[1][2])) * 1000;
  }

  return totalMs;
}

function getFootballMinuteLabel(timeMs, halfMinutes) {
  const halfMs = halfMinutes * 60 * 1000;
  if (timeMs <= halfMs) {
    return String(Math.max(1, Math.ceil(timeMs / 60000)));
  }

  const overtimeMs = Math.max(0, timeMs - halfMs);
  const overtimeMinute = Math.max(1, Math.ceil(overtimeMs / 60000));
  return `${halfMinutes} + ${overtimeMinute}`;
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
      regularMs += overlapMs(start, end, 0, halfMs);
      overtimeMs += Math.max(0, end - Math.max(start, halfMs));
      return;
    }

    // Etter pausen er tilleggstid fra 1. omgang bevart separat på spilleren.
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

async function waitForHalfTimeAndPatch(exactMs) {
  if (!activeMatchRef || precisionPatchRunning || !Number.isFinite(exactMs)) return;

  precisionPatchRunning = true;

  try {
    let data = null;

    // Vent til app.js har fullført sin ordinære lagring av pausen.
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const snapshot = await getDoc(activeMatchRef);
      if (snapshot.exists()) {
        const candidate = snapshot.data();
        if (candidate?.status === "HALFTIME") {
          data = candidate;
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (!data) return;

    // Gi den vanlige pause-lagringen et lite øyeblikk til å bli helt ferdig.
    await new Promise(resolve => setTimeout(resolve, 300));
    const stableSnapshot = await getDoc(activeMatchRef);
    if (!stableSnapshot.exists()) return;
    data = stableSnapshot.data();
    if (data?.status !== "HALFTIME") return;

    const storedEndMs = Number(data?.firstHalfActualEndMs ?? data?.timer?.elapsedMs);
    if (!Number.isFinite(storedEndMs)) return;

    // Denne korreksjonen er bare ment å fjerne avrunding til helt kampminutt.
    // Større avvik tyder på at brukeren har gjort en bevisst manuell korreksjon.
    if (Math.abs(storedEndMs - exactMs) > 65000) return;

    const playersHome = { ...(data?.players?.home || {}) };

    Object.entries(playersHome).forEach(([id, player]) => {
      const intervals = Array.isArray(player?.intervals) ? player.intervals : [];
      const correctedIntervals = intervals
        .map(interval => {
          const next = { ...interval };
          const outMs = next.out == null ? null : Number(next.out);

          // Spillere som var på banen ved pausesignalet fikk ut-tid satt til
          // det avrundede minuttet. Flytt bare disse til eksakt sekundtid.
          if (Number.isFinite(outMs) && Math.abs(outMs - storedEndMs) <= 1500) {
            next.out = exactMs;
          }

          return next;
        })
        .filter(interval => {
          const inMs = Math.max(0, Number(interval?.in) || 0);
          const outMs = interval?.out == null ? exactMs : Number(interval.out);
          return Number.isFinite(outMs) && outMs > inMs;
        });

      playersHome[id] = {
        ...player,
        intervals: correctedIntervals
      };
    });

    const halfMinutes = Math.max(1, Number(data?.meta?.halfLengthMin) || 35);
    const footballMinuteLabel = getFootballMinuteLabel(exactMs, halfMinutes);
    const events = Array.isArray(data?.events)
      ? data.events.map(event => {
          if (!/1\. omgang avsluttet/i.test(event?.rawText || event?.text || "")) {
            return event;
          }

          return {
            ...event,
            timeMs: exactMs,
            minute: footballMinuteLabel,
            period: 1
          };
        })
      : [];

    await updateDoc(activeMatchRef, {
      timer: {
        ...(data?.timer || {}),
        elapsedMs: exactMs,
        startTimestamp: null
      },
      firstHalfActualEndMs: exactMs,
      "players.home": playersHome,
      events,
      updatedAt: serverTimestamp()
    });

    console.log(`✅ Eksakt pausetid lagret: ${formatTime(exactMs)}`);
  } catch (error) {
    console.error("Kunne ikke korrigere pausetiden med sekundpresisjon:", error);
  } finally {
    precisionPatchRunning = false;
    pendingExactFirstHalfMs = null;
  }
}

function installPreciseHalfTimeCapture() {
  if (!halfTimeBtn || !confirmHalfTimeEndBtn) return;

  halfTimeBtn.addEventListener("click", () => {
    const exactMs = getDisplayedClockMs();
    if (Number.isFinite(exactMs) && exactMs > 0) {
      pendingExactFirstHalfMs = exactMs;
    }
    halfTimeInputWasEdited = false;
  }, true);

  halfTimeEndInput?.addEventListener("input", () => {
    halfTimeInputWasEdited = true;
  });

  confirmHalfTimeEndBtn.addEventListener("click", () => {
    if (confirmHalfTimeEndBtn.textContent.trim() !== "Start pause") return;
    if (halfTimeInputWasEdited) return;
    if (!Number.isFinite(pendingExactFirstHalfMs)) return;

    const exactMs = pendingExactFirstHalfMs;
    setTimeout(() => waitForHalfTimeAndPatch(exactMs), 0);
  }, true);
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

  activeMatchRef = selectedRef;
  unsubscribeMatch?.();
  unsubscribeMatch = onSnapshot(selectedRef, snapshot => {
    if (!snapshot.exists()) return;
    latestMatchData = snapshot.data();
    applyPlayingTimeDisplay();
  });
}

function init() {
  startRendering();
  installPreciseHalfTimeCapture();

  if (!matchId || getApps().length === 0) return;

  const auth = getAuth(getApp());
  onAuthStateChanged(auth, user => {
    if (user) subscribeToMatch(user);
  });
}

init();
