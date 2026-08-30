import { auth, db } from "./firebase-refleksjon.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const DEFAULT_OPPONENTS = [
  "Austevoll 2",
  "Austrheim",
  "Bønes 2",
  "Eikelandsfjorden",
  "Flaktveit 2",
  "Mathopen/Vadmyra 2",
  "Sandviken/Varegg 3",
  "Stanghelle/Dale/Vaksdal"
];

const PUBLIC_RESEARCH_VERSION = "2026-08-30-austevoll-v1";
const AUSTEVOLL_TEAM_URL = "https://www.fotball.no/fotballdata/lag/hjem/?fiksId=121292";
const AUSTEVOLL_RECENT_MATCH_URL = "https://www.fotball.no/fotballdata/kamp/?fiksId=9185058";
const AUSTEVOLL_G14_1_URL = "https://www.fotball.no/fotballdata/lag/hjem/?fiksId=188209";

const AUSTEVOLL_PUBLIC_SEED = {
  name: "Austevoll 2",
  level: "strong",
  reinforcementRisk: "high",
  notes: "Offentlig NFF-data viser et sterkt 3.-divisjonslag. Austevoll 2 vant 4–1 mot Mathopen/Vadmyra 2 i høstpremieren. I vårsesongen finnes blant annet 9–0 mot Smørås/Kalandseid 2, 5–2 mot Os 3, 5–0 mot Nore Neset 2 og 2–2 mot Gneist 3. Flere spillere er samtidig registrert på Austevoll G14-1 i 1. divisjon, så troppen kan variere betydelig fra kamp til kamp.",
  teamPlan: "Sjekk den publiserte kamptroppen før avspark. Vær spesielt obs dersom flere spillere fra G14-1 eller spillere som også brukes på G16 er med. Vi har sikre data på hvem som går mellom lagene, men ikke nok offentlig informasjon til å slå fast Austevolls formasjon eller pressmønster. Bruk derfor de første minuttene til å bekrefte hvem som spiller hvor før vi gjør større taktiske justeringer.",
  players: [
    {
      name: "Eric Johannes Løvås Storebø",
      position: "Forsvar",
      priority: "red",
      reason: "Registrert på Austevoll G14-1 og samtidig brukt mye på G14-2. Scorede mot Gneist 3 og Nore Neset 2 for Austevoll 2, og var med i 4–1-seieren mot Mathopen/Vadmyra 2.",
      observation: "Offentlig kampdata viser både nivå opp på G14-1 og målbidrag for G14-2. Det gjør ham til en av de tydeligste spillerne å identifisere i kamptroppen.",
      plan: "Finn rollen hans tidlig. Hvis han kommer høyt fra forsvar eller på dødball, sørg for tydelig ansvar i boksen og ikke gi gratis andreballer.",
      source: "NFF/Fotball.no – Austevoll G14-1 og kamprapporter",
      sourceUrl: AUSTEVOLL_G14_1_URL
    },
    {
      name: "Even-Andreas Drønen",
      position: "Forsvar",
      priority: "red",
      reason: "Registrert på Austevoll G14-1, var kaptein for Austevoll 2 i 4–1-seieren mot Mathopen/Vadmyra 2 og har scoret for G14-2 mot Bjarg 3.",
      observation: "Kapteinsrollen i den siste registrerte G14-2-kampen tyder på en sentral rolle i laget.",
      plan: "Se om han organiserer oppspillet eller står høyt. Press mottak når det er mulig, men unngå å åpne rom bak første pressledd.",
      source: "NFF/Fotball.no – Austevoll 2 mot Mathopen/Vadmyra 2",
      sourceUrl: AUSTEVOLL_RECENT_MATCH_URL
    },
    {
      name: "Lloyd Utkilen",
      position: "Keeper",
      priority: "orange",
      reason: "Registrert som keeper på både G14-1 og G14-2. Startet også for Austevoll 2 i G16 3. divisjon mot Flaktveit 2.",
      observation: "At han brukes opp på G16 er et tydelig tegn på at han er en keeper klubben stoler på på høyere aldersnivå.",
      plan: "Test tidlig med avslutninger og innlegg. Følg med på om han er aktiv i frispillingen før vi bestemmer presshøyde.",
      source: "NFF/Fotball.no – lagtropp og G16-kamprapport",
      sourceUrl: AUSTEVOLL_TEAM_URL
    },
    {
      name: "Philip Østervold Hatlevik",
      position: "Midtbane",
      priority: "orange",
      reason: "Registrert på Austevoll G14-1 og har også spilt for G14-2. Scorede mot Gneist 3 i vår.",
      observation: "En dokumentert spiller som går mellom første- og andrelaget og som har mål fra midtbanen.",
      plan: "Hvis han starter sentralt, vær tett nok til å hindre fri vending og løp inn i mellomrommet.",
      source: "NFF/Fotball.no – G14-1 tropp og Gneist 3–Austevoll 2",
      sourceUrl: AUSTEVOLL_G14_1_URL
    },
    {
      name: "Harald Mikal Forland Njåstad",
      position: "Angrep",
      priority: "red",
      reason: "Registrert som angrepsspiller på Austevoll G14-1. Da han spilte for G14-2 mot Smørås/Kalandseid 2 scorede han fire mål i 9–0-seieren.",
      observation: "Dette er den tydeligste dokumenterte måltrusselen blant spillerne som kan komme ned fra G14-1.",
      plan: "Hvis han er i troppen: identifiser posisjonen før avspark, ikke la ham motta rettvendt rundt boksen og ha sikring bak nærmeste forsvarer.",
      source: "NFF/Fotball.no – G14-1 tropp og Smørås/Kalandseid 2–Austevoll 2",
      sourceUrl: AUSTEVOLL_G14_1_URL
    },
    {
      name: "Theodor Hovland",
      position: "Midtbane",
      priority: "orange",
      reason: "Registrert på Austevoll G14-1 og har startet og scoret for Austevoll 2 på G16-nivå.",
      observation: "Spiller opp på G16 og har mål der. Det gjør ham relevant å flagge dersom han dukker opp i G14-2-troppen.",
      plan: "Hvis han er med, sjekk om han spiller sentralt eller offensivt og nekt enkel rettvendt mottak mellom ledd.",
      source: "NFF/Fotball.no – G14-1 tropp og Austevoll 2–Flaktveit 2 G16",
      sourceUrl: AUSTEVOLL_G14_1_URL
    },
    {
      name: "Ulrik Larsen-Njåstad",
      position: "Angrep",
      priority: "orange",
      reason: "Registrert som angrepsspiller på G14-2. Scorede to ganger mot Smørås/Kalandseid 2 og også mot Nore Neset 2.",
      observation: "Flere dokumenterte mål for G14-2 gjør ham relevant selv uten forsterkning fra førstelaget.",
      plan: "Vær oppmerksom på bevegelser inn i boksen og ha forsvarsside før innlegg og andreballer.",
      source: "NFF/Fotball.no – Austevoll G14-2 kamprapporter",
      sourceUrl: AUSTEVOLL_TEAM_URL
    },
    {
      name: "Aleksander Sjonbotten",
      position: "Midtbane",
      priority: "yellow",
      reason: "Fast innslag i flere registrerte G14-2-tropper og scorede mot Nore Neset 2.",
      observation: "Ser ut som en del av kjernen på andrelaget og var også i troppen som slo Mathopen/Vadmyra 2 4–1.",
      plan: "Følg rollen hans i første del av kampen og juster dersom han får mye ball sentralt.",
      source: "NFF/Fotball.no – Austevoll G14-2 kamprapporter",
      sourceUrl: AUSTEVOLL_RECENT_MATCH_URL
    }
  ]
};

let currentUid = null;
let state = { opponents: [] };
let currentOpponentId = null;
let saveMessageTimer = null;

const els = {
  opponentSelect: document.getElementById("opponentSelect"),
  opponentTitle: document.getElementById("opponentTitle"),
  linkedMatchInfo: document.getElementById("linkedMatchInfo"),
  levelRating: document.getElementById("levelRating"),
  reinforcementRisk: document.getElementById("reinforcementRisk"),
  opponentNotes: document.getElementById("opponentNotes"),
  teamPlan: document.getElementById("teamPlan"),
  saveStatus: document.getElementById("saveStatus"),
  watchList: document.getElementById("watchList"),
  playerFormCard: document.getElementById("playerFormCard"),
  playerFormTitle: document.getElementById("playerFormTitle"),
  playerId: document.getElementById("playerId"),
  playerName: document.getElementById("playerName"),
  playerPosition: document.getElementById("playerPosition"),
  playerPriority: document.getElementById("playerPriority"),
  playerReason: document.getElementById("playerReason"),
  playerObservation: document.getElementById("playerObservation"),
  playerPlan: document.getElementById("playerPlan"),
  playerSource: document.getElementById("playerSource"),
  playerSourceUrl: document.getElementById("playerSourceUrl"),
  rosterInput: document.getElementById("rosterInput"),
  rosterResult: document.getElementById("rosterResult")
};

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUid = user.uid;

  try {
    await initializeScouting();
  } catch (error) {
    console.error("Kunne ikke initialisere scouting", error);
    loadLocalState();
    ensureDefaultOpponents();
    renderOpponentSelect();
    currentOpponentId = state.opponents[0]?.id || null;
    renderCurrentOpponent();
    setSaveStatus("Kun lokal lagring tilgjengelig", true);
  }
});

async function initializeScouting() {
  const cloudLoaded = await loadCloudState();
  if (!cloudLoaded) loadLocalState();

  ensureDefaultOpponents();

  const matches = await loadMatches();
  const nextOpponentName = syncOpponentsFromMatches(matches);
  applyAustevollPublicSeed();

  renderOpponentSelect();

  const requestedOpponent = new URLSearchParams(window.location.search).get("opponent");
  const requested = requestedOpponent
    ? state.opponents.find(o => normalize(o.name) === normalize(requestedOpponent))
    : null;
  const nextOpponent = nextOpponentName
    ? state.opponents.find(o => normalize(o.name) === normalize(nextOpponentName))
    : null;

  currentOpponentId = requested?.id || nextOpponent?.id || state.opponents[0]?.id || null;
  renderCurrentOpponent();

  await persistState(cloudLoaded ? "" : "Scouting synkronisert");
}

function storageKey() {
  return `samnanger-scouting-v1:${currentUid}`;
}

async function loadCloudState() {
  const userSnap = await getDoc(doc(db, "users", currentUid));
  const scouting = userSnap.exists() ? userSnap.data()?.scouting : null;
  if (!scouting?.opponents || !Array.isArray(scouting.opponents)) return false;
  state = sanitizeState(scouting);
  return true;
}

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || "null");
    if (saved?.opponents && Array.isArray(saved.opponents)) {
      state = sanitizeState(saved);
    }
  } catch (error) {
    console.warn("Kunne ikke lese lokale scouting-data", error);
  }
}

function sanitizeState(value) {
  return {
    opponents: Array.isArray(value?.opponents)
      ? value.opponents.map(opponent => ({
          id: opponent.id || crypto.randomUUID(),
          name: String(opponent.name || "").trim(),
          level: opponent.level || "unknown",
          reinforcementRisk: opponent.reinforcementRisk || "unknown",
          notes: opponent.notes || "",
          teamPlan: opponent.teamPlan || "",
          players: Array.isArray(opponent.players) ? opponent.players : [],
          linkedMatches: Array.isArray(opponent.linkedMatches) ? opponent.linkedMatches : [],
          publicResearchVersion: opponent.publicResearchVersion || ""
        })).filter(opponent => opponent.name)
      : []
  };
}

async function persistState(message = "Lagret") {
  if (!currentUid) return;

  localStorage.setItem(storageKey(), JSON.stringify(state));
  if (message) setSaveStatus("Lagrer …");

  try {
    await setDoc(doc(db, "users", currentUid), {
      scouting: state,
      scoutingUpdatedAt: serverTimestamp()
    }, { merge: true });
    if (message) setSaveStatus(message);
  } catch (error) {
    console.error("Firestore-lagring av scouting feilet", error);
    if (message) setSaveStatus("Lagret lokalt – Firestore feilet", true);
  }
}

function setSaveStatus(message, isError = false) {
  clearTimeout(saveMessageTimer);
  els.saveStatus.textContent = message;
  els.saveStatus.classList.toggle("error", isError);
  if (!message) return;
  saveMessageTimer = setTimeout(() => {
    els.saveStatus.textContent = "";
    els.saveStatus.classList.remove("error");
  }, 2200);
}

async function loadMatches() {
  const snap = await getDocs(query(collection(db, "matches"), limit(100)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function dateValue(match) {
  const date = match?.meta?.date || "";
  const time = match?.meta?.time || match?.meta?.startTime || "00:00";
  if (!date) return Number.POSITIVE_INFINITY;
  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function syncOpponentsFromMatches(matches) {
  const now = Date.now() - 12 * 60 * 60 * 1000;
  const upcoming = matches
    .filter(match => String(match.status || "").toUpperCase() !== "ENDED")
    .filter(match => dateValue(match) >= now)
    .filter(match => match?.meta?.opponent)
    .sort((a, b) => dateValue(a) - dateValue(b));

  for (const match of upcoming) {
    const name = String(match.meta.opponent).trim();
    let opponent = state.opponents.find(o => normalize(o.name) === normalize(name));
    if (!opponent) {
      opponent = newOpponent(name);
      state.opponents.push(opponent);
    }

    const linked = {
      matchId: match.id,
      date: match.meta?.date || "",
      time: match.meta?.time || match.meta?.startTime || "",
      venue: match.meta?.venueType || match.meta?.venue || "",
      venueName: match.meta?.venueName || "",
      type: match.meta?.type || ""
    };

    const existingIndex = opponent.linkedMatches.findIndex(item => item.matchId === match.id);
    if (existingIndex >= 0) opponent.linkedMatches[existingIndex] = linked;
    else opponent.linkedMatches.push(linked);

    opponent.linkedMatches.sort((a, b) => linkedDateValue(a) - linkedDateValue(b));
  }

  state.opponents.sort((a, b) => a.name.localeCompare(b.name, "no"));
  return upcoming[0]?.meta?.opponent || "";
}

function linkedDateValue(match) {
  if (!match?.date) return Number.POSITIVE_INFINITY;
  const parsed = new Date(`${match.date}T${match.time || "00:00"}:00`);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function ensureDefaultOpponents() {
  DEFAULT_OPPONENTS.forEach(name => {
    if (state.opponents.some(o => normalize(o.name) === normalize(name))) return;
    state.opponents.push(newOpponent(name));
  });
  state.opponents.sort((a, b) => a.name.localeCompare(b.name, "no"));
}

function newOpponent(name) {
  return {
    id: crypto.randomUUID(),
    name,
    level: "unknown",
    reinforcementRisk: "unknown",
    notes: "",
    teamPlan: "",
    players: [],
    linkedMatches: [],
    publicResearchVersion: ""
  };
}

function applyAustevollPublicSeed() {
  const opponent = state.opponents.find(o => normalize(o.name) === normalize(AUSTEVOLL_PUBLIC_SEED.name));
  if (!opponent || opponent.publicResearchVersion === PUBLIC_RESEARCH_VERSION) return;

  if (!opponent.level || opponent.level === "unknown") opponent.level = AUSTEVOLL_PUBLIC_SEED.level;
  if (!opponent.reinforcementRisk || opponent.reinforcementRisk === "unknown") {
    opponent.reinforcementRisk = AUSTEVOLL_PUBLIC_SEED.reinforcementRisk;
  }
  if (!opponent.notes?.trim()) opponent.notes = AUSTEVOLL_PUBLIC_SEED.notes;
  if (!opponent.teamPlan?.trim()) opponent.teamPlan = AUSTEVOLL_PUBLIC_SEED.teamPlan;

  for (const seedPlayer of AUSTEVOLL_PUBLIC_SEED.players) {
    if (opponent.players.some(player => normalize(player.name) === normalize(seedPlayer.name))) continue;
    opponent.players.push({
      id: crypto.randomUUID(),
      ...seedPlayer,
      updatedAt: new Date().toISOString(),
      seededFromPublicSource: true
    });
  }

  opponent.publicResearchVersion = PUBLIC_RESEARCH_VERSION;
}

function currentOpponent() {
  return state.opponents.find(o => o.id === currentOpponentId) || null;
}

function renderOpponentSelect() {
  els.opponentSelect.innerHTML = "";
  state.opponents.forEach(opponent => {
    const option = document.createElement("option");
    option.value = opponent.id;
    const nextMatch = nextLinkedMatch(opponent);
    option.textContent = nextMatch
      ? `${opponent.name} · ${formatShortDate(nextMatch.date)}`
      : opponent.name;
    els.opponentSelect.appendChild(option);
  });
  if (currentOpponentId) els.opponentSelect.value = currentOpponentId;
}

function nextLinkedMatch(opponent) {
  const now = Date.now() - 12 * 60 * 60 * 1000;
  return [...(opponent?.linkedMatches || [])]
    .filter(match => linkedDateValue(match) >= now)
    .sort((a, b) => linkedDateValue(a) - linkedDateValue(b))[0] || null;
}

function renderCurrentOpponent() {
  const opponent = currentOpponent();
  if (!opponent) return;
  els.opponentSelect.value = opponent.id;
  els.opponentTitle.textContent = opponent.name;
  els.levelRating.value = opponent.level || "unknown";
  els.reinforcementRisk.value = opponent.reinforcementRisk || "unknown";
  els.opponentNotes.value = opponent.notes || "";
  els.teamPlan.value = opponent.teamPlan || "";
  renderLinkedMatchInfo(opponent);
  renderWatchList();
  els.rosterResult.innerHTML = "";
}

function renderLinkedMatchInfo(opponent) {
  if (!els.linkedMatchInfo) return;
  const match = nextLinkedMatch(opponent);
  if (!match) {
    els.linkedMatchInfo.textContent = "Ingen kommende kamp koblet til denne motstanderen.";
    return;
  }

  const venue = match.venue === "away" ? "Bortekamp" : match.venue === "home" ? "Hjemmekamp" : "Kamp";
  const venueName = match.venueName ? ` · ${match.venueName}` : "";
  els.linkedMatchInfo.textContent = `Neste: ${formatLongDate(match.date)}${match.time ? ` kl. ${match.time}` : ""} · ${venue}${venueName}`;
}

function formatShortDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("no-NO", { day: "numeric", month: "short" }).format(date);
}

function formatLongDate(dateString) {
  if (!dateString) return "Dato ikke satt";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("no-NO", { weekday: "short", day: "numeric", month: "short" }).format(date);
}

els.opponentSelect.addEventListener("change", () => {
  currentOpponentId = els.opponentSelect.value;
  hidePlayerForm();
  renderCurrentOpponent();
});

document.getElementById("addOpponentBtn").addEventListener("click", async () => {
  const name = prompt("Navn på motstander:")?.trim();
  if (!name) return;
  const existing = state.opponents.find(o => normalize(o.name) === normalize(name));
  if (existing) {
    currentOpponentId = existing.id;
  } else {
    const opponent = newOpponent(name);
    state.opponents.push(opponent);
    state.opponents.sort((a, b) => a.name.localeCompare(b.name, "no"));
    currentOpponentId = opponent.id;
    await persistState();
  }
  renderOpponentSelect();
  renderCurrentOpponent();
});

document.getElementById("saveOpponentBtn").addEventListener("click", async () => {
  const opponent = currentOpponent();
  if (!opponent) return;
  opponent.level = els.levelRating.value;
  opponent.reinforcementRisk = els.reinforcementRisk.value;
  opponent.notes = els.opponentNotes.value.trim();
  opponent.teamPlan = els.teamPlan.value.trim();
  await persistState("Motstanderprofil lagret");
});

document.getElementById("newPlayerBtn").addEventListener("click", () => openPlayerForm());
document.getElementById("cancelPlayerBtn").addEventListener("click", hidePlayerForm);

document.getElementById("savePlayerBtn").addEventListener("click", async () => {
  const opponent = currentOpponent();
  if (!opponent) return;
  const name = els.playerName.value.trim();
  if (!name) {
    alert("Skriv inn spillernavn slik det står i den offentlige kilden.");
    return;
  }
  const source = els.playerSource.value.trim();
  if (!source) {
    alert("Legg inn hvilken offentlig kilde opplysningene kommer fra.");
    return;
  }

  const payload = {
    id: els.playerId.value || crypto.randomUUID(),
    name,
    position: els.playerPosition.value.trim(),
    priority: els.playerPriority.value,
    reason: els.playerReason.value.trim(),
    observation: els.playerObservation.value.trim(),
    plan: els.playerPlan.value.trim(),
    source,
    sourceUrl: els.playerSourceUrl.value.trim(),
    updatedAt: new Date().toISOString()
  };

  const index = opponent.players.findIndex(p => p.id === payload.id);
  if (index >= 0) opponent.players[index] = payload;
  else opponent.players.push(payload);

  await persistState("Spiller lagret");
  hidePlayerForm();
  renderWatchList();
});

function openPlayerForm(player = null) {
  els.playerFormCard.classList.remove("hidden");
  els.playerFormTitle.textContent = player ? `Rediger ${player.name}` : "Ny spiller";
  els.playerId.value = player?.id || "";
  els.playerName.value = player?.name || "";
  els.playerPosition.value = player?.position || "";
  els.playerPriority.value = player?.priority || "red";
  els.playerReason.value = player?.reason || "";
  els.playerObservation.value = player?.observation || "";
  els.playerPlan.value = player?.plan || "";
  els.playerSource.value = player?.source || "";
  els.playerSourceUrl.value = player?.sourceUrl || "";
  els.playerFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hidePlayerForm() {
  els.playerFormCard.classList.add("hidden");
}

function renderWatchList() {
  const opponent = currentOpponent();
  const players = [...(opponent?.players || [])].sort(prioritySort);
  els.watchList.innerHTML = "";

  if (!players.length) {
    els.watchList.innerHTML = `<div class="empty">Ingen spillere er flagget ennå.</div>`;
    return;
  }

  players.forEach(player => {
    const card = document.createElement("article");
    card.className = "watch-card";
    const safeUrl = safePublicUrl(player.sourceUrl);
    card.innerHTML = `
      <div class="watch-top">
        <div>
          <div class="watch-name"><span class="priority-dot">${priorityIcon(player.priority)}</span>${escapeHtml(player.name)}</div>
          <div class="watch-position">${escapeHtml(player.position || "Posisjon ikke registrert")}</div>
        </div>
        <div class="watch-actions">
          <button type="button" data-action="edit">Rediger</button>
          <button type="button" data-action="delete">Slett</button>
        </div>
      </div>
      <div class="watch-sections">
        <div class="watch-section"><span>Hvorfor følger vi ham?</span><p>${escapeHtml(player.reason || "–")}</p></div>
        <div class="watch-section"><span>Observasjon</span><p>${escapeHtml(player.observation || "–")}</p></div>
        <div class="watch-section"><span>Kampgrep</span><p>${escapeHtml(player.plan || "–")}</p></div>
      </div>
      <div class="source-line">Kilde: ${escapeHtml(player.source || "–")}${safeUrl ? ` · <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">åpne offentlig kilde</a>` : ""}</div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener("click", () => openPlayerForm(player));
    card.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`Slette ${player.name} fra watchlisten?`)) return;
      opponent.players = opponent.players.filter(p => p.id !== player.id);
      await persistState("Spiller slettet");
      renderWatchList();
    });
    els.watchList.appendChild(card);
  });
}

document.getElementById("checkRosterBtn").addEventListener("click", () => {
  const opponent = currentOpponent();
  if (!opponent) return;
  const names = els.rosterInput.value
    .split(/[\n,;]+/)
    .map(name => name.trim())
    .filter(Boolean);

  if (!names.length) {
    els.rosterResult.innerHTML = `<div class="empty">Lim inn lagoppstillingen først.</div>`;
    return;
  }

  const rosterNormalized = names.map(name => ({ raw: name, normalized: normalize(name) }));
  const hits = opponent.players.filter(player =>
    rosterNormalized.some(entry => namesMatch(entry.normalized, normalize(player.name)))
  ).sort(prioritySort);

  if (!hits.length) {
    els.rosterResult.innerHTML = `<div class="roster-clear"><strong>Ingen watchlist-treff.</strong><br>Ingen av de lagrede spillerne å følge ble funnet i teksten du limte inn.</div>`;
    return;
  }

  els.rosterResult.innerHTML = hits.map(player => `
    <div class="roster-alert ${escapeHtml(player.priority)}">
      <strong>${priorityIcon(player.priority)} ${escapeHtml(player.name)}</strong>
      <div>${escapeHtml(player.reason || "Flagget spiller")}</div>
      ${player.plan ? `<div><b>Kampgrep:</b> ${escapeHtml(player.plan)}</div>` : ""}
    </div>
  `).join("");
});

function prioritySort(a, b) {
  const rank = { red: 0, orange: 1, yellow: 2 };
  return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) || a.name.localeCompare(b.name, "no");
}

function priorityIcon(priority) {
  return ({ red: "🔴", orange: "🟠", yellow: "🟡" })[priority] || "⚪";
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("no")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function namesMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return (a.length >= 6 && b.includes(a)) || (b.length >= 6 && a.includes(b));
}

function safePublicUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return escapeHtml(url.href);
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
