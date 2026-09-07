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
const playerFilter = document.getElementById("playerFilter");
const matchTotal = document.getElementById("matchTotal");
const playerTotal = document.getElementById("playerTotal");
const incompleteTotal = document.getElementById("incompleteTotal");
const playerSummary = document.getElementById("playerSummary");
const matchList = document.getElementById("matchList");
const visibleCount = document.getElementById("visibleCount");

const ACTIVE_STATUSES = new Set(["LIVE", "PAUSED", "TEMP_STOPPED", "HALFTIME"]);
const STARTED_STATUSES = new Set([...ACTIVE_STATUSES, "ENDED"]);
const EXPECTED_STARTERS = 11;

let rows = [];

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

refreshBtn.addEventListener("click", loadOverview);
playerFilter.addEventListener("change", renderMatches);

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function asText(value) {
  return String(value ?? "").trim();
}

function normalizedName(value) {
  return asText(value).toLocaleLowerCase("no").replace(/\s+/g, " ");
}

function shortName(value) {
  return asText(value).split(/\s+/).filter(Boolean)[0] || "Ukjent";
}

function playerKey(player) {
  return normalizedName(shortName(player?.name));
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
  return match.events.find((event) =>
    /kamp startet/i.test(asText(event?.rawText || event?.text))
  ) || null;
}

function isStartedMatch(match) {
  return Boolean(
    match.startedAt ||
    findStartEvent(match) ||
    STARTED_STATUSES.has(asText(match.status).toUpperCase())
  );
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

function dateBadgeParts(match) {
  const date = scheduledDate(match);
  if (!date) return { day: "–", month: "UKJ" };
  return {
    day: new Intl.DateTimeFormat("no-NO", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("no-NO", { month: "short" })
      .format(date)
      .replace(".", "")
      .toUpperCase()
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

function normalizePlayer(player, fallbackId = "") {
  if (!player) return null;
  const name = asText(player.fullName || player.name);
  if (!name) return null;
  return {
    id: asText(player.id || fallbackId),
    name,
    isLoan: player.isLoan === true || asText(player.id || fallbackId).startsWith("loan_")
  };
}

function playerEntries(players) {
  if (Array.isArray(players)) {
    return players.map((player, index) => [asText(player?.id) || String(index), player]);
  }
  if (!players || typeof players !== "object") return [];
  return Object.entries(players);
}

function isMinuteZeroInterval(player) {
  if (!Array.isArray(player?.intervals)) return false;
  return player.intervals.some((interval) => Number(interval?.in) === 0);
}

function lineupPlayers(match) {
  if (!Array.isArray(match.lineup)) return [];
  return match.lineup
    .map((player, index) => normalizePlayer(player, `lineup-${index}`))
    .filter(Boolean);
}

function squadStarters(match) {
  if (!Array.isArray(match.squad?.starters)) return [];
  return match.squad.starters
    .map((player, index) => normalizePlayer(player, `squad-${index}`))
    .filter(Boolean);
}

function storedPlayerStarters(match) {
  return playerEntries(match.players)
    .filter(([, player]) => player?.starter === true || isMinuteZeroInterval(player))
    .map(([id, player]) => normalizePlayer(player, id))
    .filter(Boolean);
}

function samePlayer(a, b) {
  if (a.id && b.id && a.id === b.id) return true;
  return playerKey(a) === playerKey(b);
}

function uniquePlayers(players) {
  const unique = [];
  players.forEach((player) => {
    if (!player || unique.some((current) => samePlayer(current, player))) return;
    unique.push(player);
  });
  return unique;
}

function getStarters(match) {
  const stored = storedPlayerStarters(match);
  const lineup = lineupPlayers(match);
  const squad = squadStarters(match);

  if (stored.length) {
    const ordered = lineup.filter((lineupPlayer) =>
      stored.some((storedPlayer) => samePlayer(lineupPlayer, storedPlayer))
    );
    const missingStored = stored.filter((storedPlayer) =>
      !ordered.some((lineupPlayer) => samePlayer(lineupPlayer, storedPlayer))
    );
    const starters = uniquePlayers([...ordered, ...missingStored]);

    if (starters.length < EXPECTED_STARTERS) {
      return uniquePlayers([...starters, ...squad, ...lineup]).slice(0, EXPECTED_STARTERS);
    }
    return starters.slice(0, EXPECTED_STARTERS);
  }

  if (squad.length) {
    return uniquePlayers([...squad, ...lineup]).slice(0, EXPECTED_STARTERS);
  }

  return uniquePlayers(lineup).slice(0, EXPECTED_STARTERS);
}

function rowSortTime(row) {
  return toDate(row.startedAt)?.getTime() || scheduledDate(row)?.getTime() || 0;
}

function buildRow(match) {
  return {
    ...match,
    starters: getStarters(match)
  };
}

function setLoading(isLoading) {
  refreshBtn.disabled = isLoading;
  playerFilter.disabled = isLoading;
  refreshBtn.textContent = isLoading ? "Laster…" : "Oppdater";
}

function renderError(error) {
  console.error("Kunne ikke laste startellevere:", error);
  matchList.replaceChildren();
  const card = makeElement("div", "stateCard");
  card.append(
    makeElement("strong", "", "Kunne ikke laste oversikten"),
    makeElement("p", "", "Prøv å oppdatere siden. Hvis problemet fortsetter, sjekk tilgangen til kampdataene.")
  );
  matchList.appendChild(card);
  playerSummary.innerHTML = '<div class="loadingRow">Ingen data tilgjengelig.</div>';
  visibleCount.textContent = "";
}

function playerGroups() {
  const groups = new Map();
  rows.forEach((row) => {
    row.starters.forEach((player) => {
      const key = playerKey(player);
      const current = groups.get(key) || {
        key,
        name: shortName(player.name),
        isLoan: player.isLoan,
        count: 0
      };
      current.count += 1;
      current.isLoan = current.isLoan || player.isLoan;
      groups.set(key, current);
    });
  });

  return [...groups.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.name.localeCompare(b.name, "no");
  });
}

function initials(name) {
  const parts = asText(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function renderStats() {
  const incompleteMatches = rows.filter((row) => row.starters.length !== EXPECTED_STARTERS).length;
  matchTotal.textContent = String(rows.length);
  playerTotal.textContent = String(playerGroups().length);
  incompleteTotal.textContent = String(incompleteMatches);
}

function renderPlayerSummary() {
  playerSummary.replaceChildren();
  const groups = playerGroups();

  if (!groups.length) {
    playerSummary.appendChild(makeElement("div", "loadingRow", "Ingen lagrede startellevere funnet."));
    return;
  }

  groups.forEach((group) => {
    const card = makeElement("article", `personSummary${group.isLoan ? " unknown" : ""}`);
    card.append(
      makeElement("span", "personAvatar", initials(group.name)),
      makeElement("strong", "personName", group.name),
      makeElement("span", "personCount", String(group.count))
    );
    playerSummary.appendChild(card);
  });
}

function renderFilter() {
  const previous = playerFilter.value;
  playerFilter.replaceChildren();
  playerFilter.appendChild(new Option("Alle kamper", "all"));

  playerGroups()
    .sort((a, b) => a.name.localeCompare(b.name, "no"))
    .forEach((group) => {
      const suffix = group.count === 1 ? "1 start" : `${group.count} starter`;
      playerFilter.appendChild(new Option(`${group.name} · ${suffix}`, group.key));
    });

  if ([...playerFilter.options].some((option) => option.value === previous)) {
    playerFilter.value = previous;
  }
}

function buildLineup(row) {
  const panel = makeElement("div", "lineupPanel");
  const header = makeElement("div", "lineupHeader");
  header.append(
    makeElement("strong", "", "Startellever"),
    makeElement(
      "span",
      row.starters.length === EXPECTED_STARTERS ? "" : "unknownText",
      `${row.starters.length} av ${EXPECTED_STARTERS} spillere`
    )
  );
  panel.appendChild(header);

  if (!row.starters.length) {
    panel.appendChild(
      makeElement(
        "div",
        "lineupMissing",
        "Denne kampen har ingen startellever lagret. Dette gjelder trolig en eldre kamp."
      )
    );
    return panel;
  }

  const grid = makeElement("div", "lineupGrid");
  row.starters.forEach((player, index) => {
    const chip = makeElement("div", `playerChip${player.isLoan ? " loan" : ""}`);
    chip.title = player.isLoan ? `${player.name} · lånespiller` : player.name;
    chip.append(
      makeElement("span", "playerNumber", String(index + 1)),
      makeElement("strong", "", shortName(player.name))
    );
    grid.appendChild(chip);
  });
  panel.appendChild(grid);
  return panel;
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
  const details = [
    typeLabel(row.meta?.type || row.type),
    scoreLabel(row),
    asText(row.formation) ? `Formasjon ${asText(row.formation)}` : ""
  ].filter(Boolean);
  fixture.append(
    makeElement("span", "", formatScheduled(row)),
    makeElement("strong", "", fixtureLabel(row)),
    makeElement("small", "", details.join(" · "))
  );

  const statusValue = asText(row.status).toUpperCase();
  const status = makeElement(
    "span",
    `statusBadge${ACTIVE_STATUSES.has(statusValue) ? " live" : ""}`,
    statusLabel(statusValue)
  );
  main.append(dateBadge, fixture, status);
  card.append(main, buildLineup(row));
  return card;
}

function renderMatches() {
  const selected = playerFilter.value;
  const filtered = selected === "all"
    ? rows
    : rows.filter((row) =>
        row.starters.some((player) => playerKey(player) === selected)
      );

  visibleCount.textContent = filtered.length === 1 ? "1 kamp" : `${filtered.length} kamper`;
  matchList.replaceChildren();

  if (!filtered.length) {
    const card = makeElement("div", "stateCard");
    card.append(
      makeElement("strong", "", "Ingen kamper å vise"),
      makeElement("p", "", "Det finnes ingen startellevere for dette valget.")
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
    const matchesSnapshot = await getDocs(collection(db, "matches"));
    const matches = [];
    matchesSnapshot.forEach((snapshot) => {
      const match = { id: snapshot.id, ...snapshot.data() };
      if (isStartedMatch(match)) matches.push(buildRow(match));
    });

    rows = matches.sort((a, b) => rowSortTime(b) - rowSortTime(a));
    renderStats();
    renderPlayerSummary();
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

    userLine.textContent = user.email || "Innlogget trener";
    await loadOverview();
  } catch (error) {
    renderError(error);
    setLoading(false);
  }
});
