import "./retired-players.js?v=20260829-1";

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
let activeMatchRef = null;
let unsubscribeMatch = null;
let pendingExactFirstHalfMs = null;
let halfTimeInputWasEdited = false;
let precisionPatchRunning = false;
let repairRunning = false;

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("nb-NO")
    .replace(/\s+/g, " ");
}

function firstNameKey(value) {
  return normalizeName(value).split(" ")[0] || "";
}

function formatTime(ms) {
  const totalSeconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRegularPlusOvertime(regularMs, overtimeMs, className) {
  const extra = Math.max(0, Number(overtimeMs) || 0);
  return extra > 0
    ? `${formatTime(regularMs)} <span class="${className}">(+${formatTime(extra)})</span>`
    : formatTime(regularMs);
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
  if (String(data?.status || "").toUpperCase() !== "LIVE") return elapsedMs;

  const startMs = timestampToMs(data?.timer?.startTimestamp);
  if (!Number.isFinite(startMs)) return elapsedMs;
  return elapsedMs + Math.max(0, Date.now() - startMs);
}

function getPlayersInfo(data) {
  const players = data?.players;

  if (players && typeof players === "object" && !Array.isArray(players)) {
    const directValues = Object.values(players);
    const looksDirect = directValues.some(value =>
      value && typeof value === "object" && ("name" in value || "intervals" in value)
    );

    if (looksDirect) {
      return {
        playersObject: players,
        updateField: "players"
      };
    }
  }

  if (players?.home && typeof players.home === "object") {
    return {
      playersObject: players.home,
      updateField: "players.home"
    };
  }

  return {
    playersObject: {},
    updateField: "players"
  };
}

function getDisplayedClockMs() {
  const text = String(gameClock?.textContent || "");
  const matches = [...text.matchAll(/(\d+):(\d{2})/g)];
  if (matches.length === 0) return null;

  let ms = (Number(matches[0][1]) * 60 + Number(matches[0][2])) * 1000;

  if (matches.length > 1 && text.includes("(+")) {
    ms += (Number(matches[1][1]) * 60 + Number(matches[1][2])) * 1000;
  }

  return ms;
}

function getFootballMinuteLabel(timeMs, halfMinutes) {
  const halfMs = halfMinutes * 60 * 1000;
  if (timeMs <= halfMs) return String(Math.max(1, Math.ceil(timeMs / 60000)));

  const overtimeMinute = Math.max(1, Math.ceil((timeMs - halfMs) / 60000));
  return `${halfMinutes} + ${overtimeMinute}`;
}

function overlapMs(start, end, rangeStart, rangeEnd) {
  return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
}

function getPlayingTimeBreakdown(player, data) {
  const halfMinutes = Math.max(1, Number(data?.meta?.halfLengthMin) || 35);
  const halfMs = halfMinutes * 60 * 1000;
  const fullTimeMs = halfMs * 2;
  const period = Number(data?.period) === 2 ? 2 : 1;
  const currentTimeMs = getCurrentMatchTimeMs(data);
  const intervals = Array.isArray(player?.intervals) ? player.intervals : [];

  let regularMs = 0;
  let overtimeMs = Math.max(0, Number(player?.extraPlayingTimeMs) || 0);

  for (const interval of intervals) {
    const start = Math.max(0, Number(interval?.in) || 0);
    const rawEnd = interval?.out == null ? currentTimeMs : Number(interval.out);
    const end = Math.max(start, Number.isFinite(rawEnd) ? rawEnd : start);

    if (period === 1) {
      regularMs += overlapMs(start, end, 0, halfMs);
      overtimeMs += Math.max(0, end - Math.max(start, halfMs));
    } else {
      regularMs += overlapMs(start, end, 0, fullTimeMs);
      overtimeMs += Math.max(0, end - Math.max(start, fullTimeMs));
    }
  }

  return { regularMs, overtimeMs, totalMs: regularMs + overtimeMs };
}

function getPlayerNameFromRow(row) {
  const nameElement = row.querySelector(".player-name");
  if (!nameElement) return "";

  const textNode = [...nameElement.childNodes]
    .find(node => node.nodeType === Node.TEXT_NODE);

  return normalizeName(textNode?.textContent || nameElement.textContent);
}

function buildPlayerLookup(players) {
  const exact = new Map();
  const first = new Map();
  const duplicates = new Set();

  for (const player of players) {
    if (!player?.name) continue;

    exact.set(normalizeName(player.name), player);
    const key = firstNameKey(player.name);

    if (!key) continue;
    if (first.has(key)) duplicates.add(key);
    else first.set(key, player);
  }

  for (const key of duplicates) first.delete(key);
  return { exact, first };
}

function applyMatchClockDisplay() {
  if (!gameClock || !latestMatchData) return;

  const status = String(latestMatchData?.status || "").toUpperCase();
  const period = Number(latestMatchData?.period) === 2 ? 2 : 1;

  if (!["HALFTIME", "PAUSED"].includes(status) || period !== 1) return;

  const halfMinutes = Math.max(1, Number(latestMatchData?.meta?.halfLengthMin) || 35);
  const halfMs = halfMinutes * 60 * 1000;
  const actualEndMs = Number.isFinite(Number(latestMatchData?.firstHalfActualEndMs))
    ? Number(latestMatchData.firstHalfActualEndMs)
    : Math.max(0, Number(latestMatchData?.timer?.elapsedMs) || 0);

  const regularMs = Math.min(actualEndMs, halfMs);
  const overtimeMs = Math.max(0, actualEndMs - halfMs);
  const wanted = formatRegularPlusOvertime(regularMs, overtimeMs, "overtime");

  if (gameClock.innerHTML !== wanted) gameClock.innerHTML = wanted;
}

function applyPlayingTimeDisplay() {
  if (!playingTimeList || !latestMatchData) return;

  const { playersObject } = getPlayersInfo(latestMatchData);
  const players = Object.values(playersObject);
  const lookup = buildPlayerLookup(players);

  playingTimeList.querySelectorAll("li:not(.pt-header)").forEach(row => {
    const rowName = getPlayerNameFromRow(row);
    const player = lookup.exact.get(rowName) || lookup.first.get(firstNameKey(rowName));
    const valueElement = row.querySelector(".minutes-value");

    if (!player || !valueElement) return;

    const { regularMs, overtimeMs } = getPlayingTimeBreakdown(player, latestMatchData);
    const wanted = formatRegularPlusOvertime(
      regularMs,
      overtimeMs,
      "player-overtime"
    );

    if (valueElement.innerHTML !== wanted) valueElement.innerHTML = wanted;
  });
}

function applyDisplays() {
  applyMatchClockDisplay();
  applyPlayingTimeDisplay();
}

function ensureStyles() {
  if (document.getElementById("playing-time-overtime-style")) return;

  const style = document.createElement("style");
  style.id = "playing-time-overtime-style";
  style.textContent = `
    .minutes-value .player-overtime {
      margin-left: 4px;
      color: #94a3b8;
      font-size: 0.82em;
      font-weight: 650;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

function installDisplayObservers() {
  if (playingTimeList) {
    const playerObserver = new MutationObserver(() => {
      applyPlayingTimeDisplay();
    });

    playerObserver.observe(playingTimeList, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (gameClock) {
    const clockObserver = new MutationObserver(() => {
      applyMatchClockDisplay();
    });

    clockObserver.observe(gameClock, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
}

async function repairHalfTimePlayers(data) {
  if (!activeMatchRef || repairRunning) return;
  if (String(data?.status || "").toUpperCase() !== "HALFTIME") return;
  if (Number(data?.period) !== 1) return;

  const exactEndMs = Number(data?.firstHalfActualEndMs);
  if (!Number.isFinite(exactEndMs) || exactEndMs <= 0) return;

  const halfMinutes = Math.max(1, Number(data?.meta?.halfLengthMin) || 35);
  const halfMs = halfMinutes * 60 * 1000;
  const actualOvertimeMs = Math.max(0, exactEndMs - halfMs);
  const { playersObject, updateField } = getPlayersInfo(data);
  const corrected = {};
  let changed = false;

  for (const [id, player] of Object.entries(playersObject)) {
    const intervals = Array.isArray(player?.intervals) ? player.intervals : [];

    const fixedIntervals = intervals
      .map(interval => {
        const next = { ...interval };
        const start = Math.max(0, Number(next.in) || 0);
        const out = next.out == null ? null : Number(next.out);

        if (Number.isFinite(out) && out > exactEndMs && start < exactEndMs) {
          next.out = exactEndMs;
          changed = true;
        }

        return next;
      })
      .filter(interval => {
        const start = Math.max(0, Number(interval?.in) || 0);
        const out = interval?.out == null ? exactEndMs : Number(interval.out);
        const keep = start < exactEndMs && Number.isFinite(out) && out > start;
        if (!keep) changed = true;
        return keep;
      });

    let extra = Math.max(0, Number(player?.extraPlayingTimeMs) || 0);
    if (extra > actualOvertimeMs) {
      extra = actualOvertimeMs;
      changed = true;
    }

    corrected[id] = {
      ...player,
      intervals: fixedIntervals,
      extraPlayingTimeMs: extra
    };
  }

  if (!changed) return;

  repairRunning = true;
  try {
    await updateDoc(activeMatchRef, {
      [updateField]: corrected,
      updatedAt: serverTimestamp()
    });
    console.log("✅ Spilletid ved pause korrigert til eksakt tid");
  } catch (error) {
    console.error("Kunne ikke korrigere spillerintervall ved pause:", error);
  } finally {
    repairRunning = false;
  }
}

async function waitForHalfTimeAndPatch(exactMs) {
  if (!activeMatchRef || precisionPatchRunning || !Number.isFinite(exactMs)) return;

  precisionPatchRunning = true;

  try {
    let data = null;

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const snapshot = await getDoc(activeMatchRef);
      if (snapshot.exists()) {
        const candidate = snapshot.data();
        if (String(candidate?.status || "").toUpperCase() === "HALFTIME") {
          data = candidate;
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (!data) return;

    await new Promise(resolve => setTimeout(resolve, 250));
    const stableSnapshot = await getDoc(activeMatchRef);
    if (!stableSnapshot.exists()) return;
    data = stableSnapshot.data();

    if (String(data?.status || "").toUpperCase() !== "HALFTIME") return;

    const storedEndMs = Number(data?.firstHalfActualEndMs ?? data?.timer?.elapsedMs);
    if (!Number.isFinite(storedEndMs)) return;
    if (Math.abs(storedEndMs - exactMs) > 65000) return;

    const halfMinutes = Math.max(1, Number(data?.meta?.halfLengthMin) || 35);
    const halfMs = halfMinutes * 60 * 1000;
    const actualOvertimeMs = Math.max(0, exactMs - halfMs);
    const { playersObject, updateField } = getPlayersInfo(data);
    const correctedPlayers = {};

    for (const [id, player] of Object.entries(playersObject)) {
      const intervals = Array.isArray(player?.intervals) ? player.intervals : [];

      const correctedIntervals = intervals
        .map(interval => {
          const next = { ...interval };
          const start = Math.max(0, Number(next.in) || 0);
          const out = next.out == null ? null : Number(next.out);

          if (Number.isFinite(out) && out > exactMs && start < exactMs) {
            next.out = exactMs;
          }

          return next;
        })
        .filter(interval => {
          const start = Math.max(0, Number(interval?.in) || 0);
          const out = interval?.out == null ? exactMs : Number(interval.out);
          return start < exactMs && Number.isFinite(out) && out > start;
        });

      correctedPlayers[id] = {
        ...player,
        intervals: correctedIntervals,
        extraPlayingTimeMs: Math.min(
          Math.max(0, Number(player?.extraPlayingTimeMs) || 0),
          actualOvertimeMs
        )
      };
    }

    const label = getFootballMinuteLabel(exactMs, halfMinutes);
    const events = Array.isArray(data?.events)
      ? data.events.map(event => {
          if (!/1\. omgang avsluttet/i.test(event?.rawText || event?.text || "")) return event;
          return { ...event, timeMs: exactMs, minute: label, period: 1 };
        })
      : [];

    await updateDoc(activeMatchRef, {
      timer: {
        ...(data?.timer || {}),
        elapsedMs: exactMs,
        startTimestamp: null
      },
      firstHalfActualEndMs: exactMs,
      [updateField]: correctedPlayers,
      events,
      updatedAt: serverTimestamp()
    });

    console.log(`✅ Eksakt pausetid og spillerdata lagret: ${formatTime(exactMs)}`);
  } catch (error) {
    console.error("Kunne ikke lagre eksakt pausetid:", error);
  } finally {
    precisionPatchRunning = false;
    pendingExactFirstHalfMs = null;
  }
}

function installPreciseHalfTimeCapture() {
  if (!halfTimeBtn || !confirmHalfTimeEndBtn) return;

  halfTimeBtn.addEventListener("click", () => {
    const exactMs = getDisplayedClockMs();
    if (Number.isFinite(exactMs) && exactMs > 0) pendingExactFirstHalfMs = exactMs;
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
    console.debug("Spilletid: hovedkamp ikke tilgjengelig.", error);
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
    applyDisplays();
    repairHalfTimePlayers(latestMatchData);
  });
}

function init() {
  ensureStyles();
  installDisplayObservers();
  installPreciseHalfTimeCapture();

  if (!matchId || getApps().length === 0) return;

  const auth = getAuth(getApp());
  onAuthStateChanged(auth, user => {
    if (user) subscribeToMatch(user);
  });
}

init();
