import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const userLine = document.getElementById("userLine");
const logoutBtn = document.getElementById("logoutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const starterFilter = document.getElementById("starterFilter");
const matchTotal = document.getElementById("matchTotal");
const starterTotal = document.getElementById("starterTotal");
const unknownTotal = document.getElementById("unknownTotal");
const starterSummary = document.getElementById("starterSummary");
const matchList = document.getElementById("matchList");
const visibleCount = document.getElementById("visibleCount");

const ACTIVE_STATUSES = new Set(["LIVE", "PAUSED", "TEMP_STOPPED", "HALFTIME"]);
const STARTED_STATUSES = new Set([...ACTIVE_STATUSES, "ENDED"]);
const UNKNOWN_KEY = "__unknown__";

let currentUser = null;
let rows = [];

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

refreshBtn.addEventListener("click", loadOverview);
starterFilter.addEventListener("change", renderMatches);

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function asText(value) {
  return String(value ?? "").trim();
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "number") return new Date(value);

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function scheduledDate(match) {
  const date = asText(match.meta?.date);
  if (!date) return null;
  const time = asText(match.meta?.startTime) || "00:00";
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findStartEvent(match) {
  if (!Array.isArray(match.events)) return null;
  return match.events.find((event) => {
    const text = asText(event?.rawText || event?.text);
    return /kamp startet/i.test(text);
  }) || null;
}

function profileName(profile, uid) {
  const name = asText(profile?.name || profile?.navn || profile?.displayName || profile?.email);
  if (name) return name;
  if (uid && currentUser?.uid === uid) return currentUser.email || "Innlogget trener";
  return "Ukjent / eldre kamp";
}

function roleLabel(role) {
  if (role === "coach") return "Hovedtrener";
  if (role === "assistantCoach") return "Assistenttrener";
  return "Trenerrolle mangler";
}

function statusLabel(status) {
  const labels = {
    LIVE: "Pågår",
    PAUSED: "Pause",
    TEMP_STOPPED: "Stoppet",
    HALFTIME: "Pause",
    ENDED: "Ferdig"
  };
  return labels[status] || status || "Ukjent";
}

function typeLabel(type) {
  const labels = {
    league: "Serie",
    cup: "Cup",
    friendly: "Treningskamp",
    tournament: "Turnering"
  };
  return labels[type] || type || "Kamp";
}

function initials(name, unknown = false) {
  if (unknown) return "?";
  const parts = asText(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function dateBadgeParts(match) {
  const date = scheduledDate(match);
  if (!date) return { day: "–", month: "UKJ" };
  return {
    day: new Intl.DateTimeFormat("no-NO", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("no-NO", { month: "short" }).format(date).replace(".", "").toUpperCase()
  };
}

function formatScheduled(match) {
  const date = scheduledDate(match);
  if (!date) return "Dato mangler";
  const dateText = new Intl.DateTimeFormat("no-NO", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
  const time = asText(match.meta?.startTime);
  return time ? `${dateText} · kl. ${time}` : dateText;
}

function formatStartedAt(date) {
  if (!date) return "Starttid mangler";
  const dateText = new Intl.DateTimeFormat("no-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(date);
  const timeText = new Intl.DateTimeFormat("no-NO", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
  return `${dateText} · ${timeText}`;
}

function fixtureLabel(match) {
  const ourTeam = asText(match.meta?.ourTeam) || "Samnanger";
  const opponent = asText(match.meta?.opponent) || "Ukjent motstander";
  const venue = asText(match.meta?.venue).toLowerCase();
  const away = venue === "away" || venue === "borte";
  return away ? `${opponent} – ${ourTeam}` : `${ourTeam} – ${opponent}`;
}

function scoreLabel(match) {
  const our = Number(match.score?.our);
  const their = Number(match.score?.their);
  if (!Number.isFinite(our) || !Number.isFinite(their)) return "";
  return `${our}–${their}`;
}

function isStartedMatch(match) {
  return Boolean(
    match.startedAt ||
    findStartEvent(match) ||
    STARTED_STATUSES.has(asText(match.status).toUpperCase())
  );
}

function rowSortTime(row) {
  return row.startedDate?.getTime() || scheduledDate(row)?.getTime() || 0;
}

function buildRow(match, profiles) {
  const startEvent = findStartEvent(match);
  const starterUid = asText(
    startEvent?.reportedBy ||
    match.ownerUid ||
    match.approvedFromAssistant ||
    match.assistantUid
  );
  const profile = profiles.get(starterUid);
  const startedDate = toDate(match.startedAt) || toDate(startEvent?.reportedAt);
  const unknown = !starterUid || !profileName(profile, starterUid) || profileName(profile, starterUid) === "Ukjent / eldre kamp";

  return {
    ...match,
    starterUid,
    starterKey: unknown ? UNKNOWN_KEY : starterUid,
    starterName: profileName(profile, starterUid),
    starterRole: roleLabel(profile?.role || match.role),
    startedDate,
    unknown
  };
}

function setLoading(isLoading) {
  refreshBtn.disabled = isLoading;
  starterFilter.disabled = isLoading;
  refreshBtn.textContent = isLoading ? "Laster…" : "Oppdater";
}

function renderError(error) {
  console.error("Kunne ikke laste kampstartere:", error);
  matchList.replaceChildren();
  const card = makeElement("div", "stateCard");
  card.append(
    makeElement("strong", "", "Kunne ikke laste oversikten"),
    makeElement("p", "", "Prøv å oppdatere siden. Hvis problemet fortsetter, sjekk tilgangen til kampdataene.")
  );
  matchList.appendChild(card);
  starterSummary.innerHTML = '<div class="loadingRow">Ingen data tilgjengelig.</div>';
  visibleCount.textContent = "";
}

function renderStats() {
  const knownStarters = new Set(rows.filter((row) => !row.unknown).map((row) => row.starterUid));
  const unknownMatches = rows.filter((row) => row.unknown).length;

  matchTotal.textContent = String(rows.length);
  starterTotal.textContent = String(knownStarters.size);
  unknownTotal.textContent = String(unknownMatches);
}

function groupedStarters() {
  const groups = new Map();
  rows.forEach((row) => {
    const current = groups.get(row.starterKey) || {
      key: row.starterKey,
      name: row.starterName,
      unknown: row.unknown,
      count: 0
    };
    current.count += 1;
    groups.set(row.starterKey, current);
  });

  return [...groups.values()].sort((a, b) => {
    if (a.unknown !== b.unknown) return a.unknown ? 1 : -1;
    if (a.count !== b.count) return b.count - a.count;
    return a.name.localeCompare(b.name, "no");
  });
}

function renderStarterSummary() {
  starterSummary.replaceChildren();
  const groups = groupedStarters();

  if (!groups.length) {
    starterSummary.appendChild(makeElement("div", "loadingRow", "Ingen startede kamper registrert."));
    return;
  }

  groups.forEach((group) => {
    const card = makeElement("article", `personSummary${group.unknown ? " unknown" : ""}`);
    card.append(
      makeElement("span", "personAvatar", initials(group.name, group.unknown)),
      makeElement("strong", "personName", group.name),
      makeElement("span", "personCount", String(group.count))
    );
    starterSummary.appendChild(card);
  });
}

function renderFilter() {
  const previous = starterFilter.value;
  starterFilter.replaceChildren();
  starterFilter.appendChild(new Option("Alle", "all"));

  groupedStarters().forEach((group) => {
    const suffix = group.count === 1 ? "1 kamp" : `${group.count} kamper`;
    starterFilter.appendChild(new Option(`${group.name} · ${suffix}`, group.key));
  });

  if ([...starterFilter.options].some((option) => option.value === previous)) {
    starterFilter.value = previous;
  }
}

function buildMatchCard(row) {
  const card = makeElement("article", "matchCard");
  const main = makeElement("div", "matchMain");
  const dateParts = dateBadgeParts(row);
  const dateBadge = makeElement("div", "dateBadge");
  dateBadge.append(
    makeElement("strong", "", dateParts.day),
    makeElement("small", "", dateParts.month)
  );

  const fixture = makeElement("div", "fixtureInfo");
  fixture.append(
    makeElement("span", "", formatScheduled(row)),
    makeElement("strong", "", fixtureLabel(row)),
    makeElement("small", "", [typeLabel(row.meta?.type || row.type), scoreLabel(row)].filter(Boolean).join(" · "))
  );

  const status = makeElement("span", `statusBadge${ACTIVE_STATUSES.has(asText(row.status).toUpperCase()) ? " live" : ""}`, statusLabel(asText(row.status).toUpperCase()));
  main.append(dateBadge, fixture, status);

  const starter = makeElement("div", "starterRow");
  starter.appendChild(makeElement("span", `starterAvatar${row.unknown ? " unknown" : ""}`, initials(row.starterName, row.unknown)));

  const starterInfo = makeElement("div", "starterInfo");
  starterInfo.append(
    makeElement("span", "", "STARTET AV"),
    makeElement("strong", row.unknown ? "unknownText" : "", row.starterName),
    makeElement("small", "", row.starterRole)
  );
  starter.append(starterInfo, makeElement("span", `startedTime${row.startedDate ? "" : " unknownText"}`, formatStartedAt(row.startedDate)));

  card.append(main, starter);
  return card;
}

function renderMatches() {
  const selected = starterFilter.value;
  const filtered = selected === "all"
    ? rows
    : rows.filter((row) => row.starterKey === selected);

  visibleCount.textContent = filtered.length === 1 ? "1 kamp" : `${filtered.length} kamper`;
  matchList.replaceChildren();

  if (!filtered.length) {
    const card = makeElement("div", "stateCard");
    card.append(
      makeElement("strong", "", "Ingen kamper å vise"),
      makeElement("p", "", "Det finnes ingen startede kamper for dette valget.")
    );
    matchList.appendChild(card);
    return;
  }

  filtered.forEach((row) => matchList.appendChild(buildMatchCard(row)));
}

async function loadOverview() {
  setLoading(true);
  visibleCount.textContent = "";

  try {
    const [matchesSnapshot, usersSnapshot] = await Promise.all([
      getDocs(collection(db, "matches")),
      getDocs(collection(db, "users"))
    ]);

    const profiles = new Map();
    usersSnapshot.forEach((snapshot) => profiles.set(snapshot.id, snapshot.data() || {}));

    const matches = [];
    matchesSnapshot.forEach((snapshot) => {
      const match = { id: snapshot.id, ...snapshot.data() };
      if (isStartedMatch(match)) matches.push(buildRow(match, profiles));
    });

    rows = matches.sort((a, b) => rowSortTime(b) - rowSortTime(a));
    renderStats();
    renderStarterSummary();
    renderFilter();
    renderMatches();
  } catch (error) {
    renderError(error);
  } finally {
    setLoading(false);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const profileSnapshot = await getDoc(doc(db, "users", user.uid));
    if (!profileSnapshot.exists() || profileSnapshot.data()?.role !== "coach") {
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    currentUser = user;
    userLine.textContent = user.email || "Innlogget trener";
    await loadOverview();
  } catch (error) {
    renderError(error);
    setLoading(false);
  }
});
