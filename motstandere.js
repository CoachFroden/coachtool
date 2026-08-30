import { auth } from "./firebase-refleksjon.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

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

let currentUid = null;
let state = { opponents: [] };
let currentOpponentId = null;

const els = {
  opponentSelect: document.getElementById("opponentSelect"),
  opponentTitle: document.getElementById("opponentTitle"),
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

onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUid = user.uid;
  loadState();
  ensureDefaultOpponents();
  renderOpponentSelect();
  currentOpponentId = state.opponents[0]?.id || null;
  renderCurrentOpponent();
});

function storageKey() {
  return `samnanger-scouting-v1:${currentUid}`;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || "null");
    if (saved?.opponents && Array.isArray(saved.opponents)) state = saved;
  } catch (error) {
    console.warn("Kunne ikke lese scouting-data", error);
  }
}

function saveState(message = "Lagret") {
  localStorage.setItem(storageKey(), JSON.stringify(state));
  els.saveStatus.textContent = message;
  setTimeout(() => { els.saveStatus.textContent = ""; }, 1600);
}

function ensureDefaultOpponents() {
  DEFAULT_OPPONENTS.forEach(name => {
    if (state.opponents.some(o => normalize(o.name) === normalize(name))) return;
    state.opponents.push(newOpponent(name));
  });
  state.opponents.sort((a, b) => a.name.localeCompare(b.name, "no"));
  saveState("");
}

function newOpponent(name) {
  return {
    id: crypto.randomUUID(),
    name,
    level: "unknown",
    reinforcementRisk: "unknown",
    notes: "",
    teamPlan: "",
    players: []
  };
}

function currentOpponent() {
  return state.opponents.find(o => o.id === currentOpponentId) || null;
}

function renderOpponentSelect() {
  els.opponentSelect.innerHTML = "";
  state.opponents.forEach(opponent => {
    const option = document.createElement("option");
    option.value = opponent.id;
    option.textContent = opponent.name;
    els.opponentSelect.appendChild(option);
  });
  if (currentOpponentId) els.opponentSelect.value = currentOpponentId;
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
  renderWatchList();
  els.rosterResult.innerHTML = "";
}

els.opponentSelect.addEventListener("change", () => {
  currentOpponentId = els.opponentSelect.value;
  hidePlayerForm();
  renderCurrentOpponent();
});

document.getElementById("addOpponentBtn").addEventListener("click", () => {
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
    saveState();
  }
  renderOpponentSelect();
  renderCurrentOpponent();
});

document.getElementById("saveOpponentBtn").addEventListener("click", () => {
  const opponent = currentOpponent();
  if (!opponent) return;
  opponent.level = els.levelRating.value;
  opponent.reinforcementRisk = els.reinforcementRisk.value;
  opponent.notes = els.opponentNotes.value.trim();
  opponent.teamPlan = els.teamPlan.value.trim();
  saveState("Motstanderprofil lagret");
});

document.getElementById("newPlayerBtn").addEventListener("click", () => openPlayerForm());
document.getElementById("cancelPlayerBtn").addEventListener("click", hidePlayerForm);

document.getElementById("savePlayerBtn").addEventListener("click", () => {
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

  saveState("Spiller lagret");
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
    card.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (!confirm(`Slette ${player.name} fra watchlisten?`)) return;
      opponent.players = opponent.players.filter(p => p.id !== player.id);
      saveState("Spiller slettet");
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
