import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore,
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const db = getFirestore(firebaseApp);
const pageParams = new URLSearchParams(window.location.search);
const requestedMatchId = pageParams.get("matchId");

const elements = {
  connectionBadge: document.getElementById("connectionBadge"),
  statusBadge: document.getElementById("statusBadge"),
  matchDate: document.getElementById("matchDate"),
  homeTeam: document.getElementById("homeTeam"),
  awayTeam: document.getElementById("awayTeam"),
  homeScore: document.getElementById("homeScore"),
  awayScore: document.getElementById("awayScore"),
  gameClock: document.getElementById("gameClock"),
  periodLabel: document.getElementById("periodLabel"),
  kickoffTime: document.getElementById("kickoffTime"),
  matchType: document.getElementById("matchType"),
  lastUpdated: document.getElementById("lastUpdated"),
  eventCount: document.getElementById("eventCount"),
  eventList: document.getElementById("eventList"),
  emptyEvents: document.getElementById("emptyEvents"),
  pageMessage: document.getElementById("pageMessage")
};

let matchData = null;
let clockInterval = null;

function timestampToMs(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (Number.isFinite(value?.seconds)) {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  return null;
}

function formatClock(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getCurrentElapsedMs() {
  if (!matchData) return 0;
  const elapsedMs = Number(matchData.timer?.elapsedMs) || 0;
  const startTimestamp = timestampToMs(matchData.timer?.startTimestamp);

  if (String(matchData.status).toUpperCase() === "LIVE" && startTimestamp) {
    return elapsedMs + Math.max(0, Date.now() - startTimestamp);
  }

  return elapsedMs;
}

function renderClock() {
  if (!matchData) return;
  const elapsedMs = getCurrentElapsedMs();
  const halfLengthMs = (Number(matchData.meta?.halfLengthMin) || 35) * 60 * 1000;
  const period = Number(matchData.period) || 1;
  const ordinaryEndMs = period === 1 ? halfLengthMs : halfLengthMs * 2;

  if (elapsedMs > ordinaryEndMs) {
    elements.gameClock.innerHTML =
      `${formatClock(ordinaryEndMs)} <span class="overtime">+${formatClock(elapsedMs - ordinaryEndMs)}</span>`;
  } else {
    elements.gameClock.textContent = formatClock(elapsedMs);
  }
}

function getFixture(data) {
  const ourTeam = data.meta?.ourTeam || "Samnanger";
  const opponent = data.meta?.opponent || "Motstander";
  const isAway = [data.meta?.venue, data.meta?.venueType].includes("away");

  return isAway
    ? {
        homeTeam: opponent,
        awayTeam: ourTeam,
        homeScore: Number(data.score?.their) || 0,
        awayScore: Number(data.score?.our) || 0,
        ourTeam,
        opponent
      }
    : {
        homeTeam: ourTeam,
        awayTeam: opponent,
        homeScore: Number(data.score?.our) || 0,
        awayScore: Number(data.score?.their) || 0,
        ourTeam,
        opponent
      };
}

function formatDate(dateString) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const text = new Intl.DateTimeFormat("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getStatusInfo(status, period) {
  const normalized = String(status || "UPCOMING").toUpperCase();
  if (normalized === "LIVE") {
    return { text: "Live", className: "is-live", period: `${period || 1}. omgang` };
  }
  if (normalized === "TEMP_STOPPED") {
    return { text: "Stoppet", className: "is-paused", period: `${period || 1}. omgang · klokken stoppet` };
  }
  if (["HALFTIME", "PAUSED"].includes(normalized)) {
    return { text: "Pause", className: "is-paused", period: "Pause mellom omgangene" };
  }
  if (normalized === "ENDED") {
    return { text: "Slutt", className: "is-ended", period: "Kampen er ferdig" };
  }
  return { text: "Kommende", className: "is-upcoming", period: "Klar for kamp" };
}

function getMatchTypeLabel(type) {
  return {
    league: "Seriekamp",
    cup: "Cupkamp",
    friendly: "Treningskamp"
  }[type] || "Kamp";
}

function cleanEventText(event) {
  let text = String(event.rawText || "").trim();
  if (!text) text = String(event.playerName || "Hendelse");
  return text
    .replace(/^(?:⚽|🔄|🟨|🟥|▶️|⏸️|🏁|⏸|▶)\s*/u, "")
    .replace(/^\d{1,3}(?:\s*\+\s*\d{1,2})?\s*[–-]\s*/u, "")
    .trim();
}

function getEventView(event, fixture) {
  const raw = String(event.rawText || "");
  const type = event.type || "text";

  if (type === "goal" || raw.includes("⚽")) {
    const team = event.team === "away" ? fixture.opponent : fixture.ourTeam;
    return {
      className: "is-goal",
      icon: "⚽",
      title: `Mål · ${team}`,
      description: event.playerName || cleanEventText(event)
    };
  }

  if (type === "substitution") {
    return {
      className: "is-substitution",
      icon: "↔",
      title: "Bytte",
      description: event.outPlayerName && event.inPlayerName
        ? `${event.outPlayerName} ut · ${event.inPlayerName} inn`
        : cleanEventText(event)
    };
  }

  if (type === "card" || /^[🟨🟥]/u.test(raw)) {
    const isRed = event.cardType === "red" || raw.startsWith("🟥");
    return {
      className: "is-card",
      icon: isRed ? "🟥" : "🟨",
      title: isRed ? "Rødt kort" : "Gult kort",
      description: event.playerName || cleanEventText(event)
    };
  }

  const milestone = /kamp(?:en)? startet|pause|omgang startet|omgang avsluttet|kamp avsluttet/i.test(raw);
  return {
    className: milestone ? "is-milestone" : "is-event",
    icon: /avsluttet/i.test(raw) ? "■" : /pause|stoppet/i.test(raw) ? "Ⅱ" : "▶",
    title: milestone ? "Kampstatus" : "Hendelse",
    description: cleanEventText(event)
  };
}

function getEventMinute(event) {
  if (String(event.minute || "").trim()) return `${event.minute}′`;
  const timeMs = Number(event.timeMs);
  if (Number.isFinite(timeMs) && timeMs > 0) {
    return `${Math.max(1, Math.ceil(timeMs / 60000))}′`;
  }
  return event.createdClock || "Start";
}

function renderEvents(data, fixture) {
  const events = Array.isArray(data.events) ? [...data.events] : [];
  events.sort((a, b) => {
    const periodDifference = (Number(b.period) || 1) - (Number(a.period) || 1);
    if (periodDifference !== 0) return periodDifference;
    const timeDifference = (Number(b.timeMs) || 0) - (Number(a.timeMs) || 0);
    if (timeDifference !== 0) return timeDifference;
    return String(b.reportedAt || "").localeCompare(String(a.reportedAt || ""));
  });

  elements.eventList.replaceChildren();
  elements.eventCount.textContent = String(events.length);
  elements.emptyEvents.classList.toggle("hidden", events.length > 0);

  events.forEach(event => {
    const view = getEventView(event, fixture);
    const item = document.createElement("li");
    item.className = `event-item ${view.className}`;

    const minute = document.createElement("span");
    minute.className = "event-minute";
    minute.textContent = getEventMinute(event);

    const icon = document.createElement("span");
    icon.className = "event-icon";
    icon.textContent = view.icon;

    const copy = document.createElement("div");
    copy.className = "event-copy";
    const title = document.createElement("strong");
    title.textContent = view.title;
    const description = document.createElement("span");
    description.textContent = `${view.description}${event.edited ? " · korrigert" : ""}`;
    copy.append(title, description);

    item.append(minute, icon, copy);
    elements.eventList.appendChild(item);
  });
}

function renderMatch(data) {
  matchData = data;
  const fixture = getFixture(data);
  const status = getStatusInfo(data.status, data.period);

  elements.homeTeam.textContent = fixture.homeTeam;
  elements.awayTeam.textContent = fixture.awayTeam;
  elements.homeScore.textContent = String(fixture.homeScore);
  elements.awayScore.textContent = String(fixture.awayScore);
  elements.statusBadge.textContent = status.text;
  elements.statusBadge.className = `status-badge ${status.className}`;
  elements.periodLabel.textContent = status.period;
  elements.matchDate.textContent = formatDate(data.meta?.date);
  elements.kickoffTime.textContent = data.meta?.startTime
    ? `Avspark ${data.meta.startTime}`
    : "Tid ikke satt";
  elements.matchType.textContent = getMatchTypeLabel(data.meta?.type);

  const updatedAt = timestampToMs(data.updatedAt);
  elements.lastUpdated.textContent = updatedAt
    ? `Oppdatert ${new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(updatedAt)}`
    : "Direkte oppdatering";

  document.title = `${fixture.homeTeam} ${fixture.homeScore}–${fixture.awayScore} ${fixture.awayTeam}`;
  renderClock();
  renderEvents(data, fixture);
}

function setConnectionState(state, text) {
  elements.connectionBadge.className = `connection-badge ${state}`;
  elements.connectionBadge.querySelector("span").textContent = text;
}

function showPageMessage(message) {
  elements.pageMessage.textContent = message;
  elements.pageMessage.classList.remove("hidden");
}

function handleMatchSnapshot(snapshot) {
  if (!snapshot.exists()) {
    setConnectionState("is-connecting", "Venter");
    showPageMessage("Livevisningen er ikke startet ennå. Siden oppdateres automatisk.");
    return;
  }

  elements.pageMessage.classList.add("hidden");
  setConnectionState("is-live", "Tilkoblet");
  renderMatch(snapshot.data());
}

function subscribeToRequestedMatch(matchId) {
  const matchRef = doc(db, "publicMatches", matchId);
  onSnapshot(
    matchRef,
    handleMatchSnapshot,
    error => {
      console.error("Kunne ikke lese livekampen:", error);
      setConnectionState("is-error", "Frakoblet");
      showPageMessage("Kunne ikke hente kampoppdateringene. Sjekk nettet og prøv igjen.");
    }
  );
}

function subscribeToFeaturedMatch() {
  subscribeToRequestedMatch("samnanger-g14-live");
}

if (requestedMatchId) {
  subscribeToRequestedMatch(requestedMatchId);
} else {
  subscribeToFeaturedMatch();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./kamp-live-sw.js").catch(error => {
      console.warn("Kunne ikke registrere appens hurtiglager:", error);
    });
  });
}

clockInterval = setInterval(renderClock, 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderClock();
});
