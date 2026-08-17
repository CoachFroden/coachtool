import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,   // ← LEGG TIL DENNE
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const userLine = document.getElementById("userLine");
const roleLine = document.getElementById("roleLine");
const logoutBtn = document.getElementById("logoutBtn");
const errorMsg = document.getElementById("errorMsg");
const tabPlayers = document.getElementById("tabPlayers");
const tabMatch = document.getElementById("tabMatch");
const playersPanel = document.getElementById("playersPanel");
const matchPanel = document.getElementById("matchPanel");
const matchSelect = document.getElementById("matchSelect");
const matchArea = document.getElementById("matchArea");

const playersSelect = document.getElementById("playersSelect");const entriesEl = document.getElementById("entries");
const selectedPlayerEl = document.getElementById("selectedPlayer");



let utviklingsbank = {};
let openPlayedMatchId = null;

async function loadUtviklingsbank() {
  const response = await fetch("utviklingsbank.json");
  utviklingsbank = await response.json();
}

const rightPanel = document.getElementById("rightPanel");
const rightTitle = document.getElementById("rightTitle");

function hideRightPanel() {
  rightPanel?.classList.add("isHidden");
}

function showRightPanel(title, hintText = "") {
  if (rightTitle) rightTitle.textContent = title;
  if (hintText && selectedPlayerEl) selectedPlayerEl.textContent = hintText;
  rightPanel?.classList.remove("isHidden");
}

let currentUid = null;

function setError(msg) {
  errorMsg.textContent = msg || "";
}

logoutBtn.onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html"; // tilbake til login
};

async function loadPlayers() {
  playersSelect.innerHTML = `<option value="">Laster spillere…</option>`;

  try {
    const snap = await getDocs(collection(db, "spillere"));

    if (snap.empty) {
      playersSelect.innerHTML = `<option value="">Ingen spillere funnet</option>`;
      return;
    }

    const rows = [];
snap.forEach(d => {
  const data = d.data() || {};
  const navn = data.navn || data.name || d.id;

  // Bruk uid hvis det finnes, ellers fallback til docId
  const uid = data.uid;

  rows.push({ id: uid || d.id, navn });
});

    rows.sort((a, b) => a.navn.localeCompare(b.navn, "no"));

    playersSelect.innerHTML = `<option value="">Velg spiller…</option>`;

    rows.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.navn;
      opt.dataset.name = p.navn;
      playersSelect.appendChild(opt);
    });

  } catch (e) {
    playersSelect.innerHTML = `<option value="">Feil ved lasting</option>`;
    setError(String(e?.message || e));
  }
}

playersSelect.addEventListener("change", (e) => {
  const playerId = e.target.value;
  const selectedOption = e.target.selectedOptions[0];
  const playerName = selectedOption?.dataset?.name;

  if (!playerId) {
    selectedPlayerEl.textContent = "Velg en spiller.";
    entriesEl.innerHTML = "";
    return;
  }
  showRightPanel("Refleksjoner", `Valgt: ${playerName || ""}`);
  initReflections(playerId, playerName);
});

async function initReflections(playerId, playerName) {
  setError("");
  selectedPlayerEl.textContent = `Valgt: ${playerName}`;
  entriesEl.innerHTML = `<div class="item">Laster uker…</div>`;

  try {
    const weeks = await loadAvailableWeeks(playerId);

    if (weeks.length === 0) {
      entriesEl.innerHTML = `<div class="item">Ingen refleksjoner funnet for denne spilleren.</div>`;
      return;
    }

    renderPlayerTabs(playerId, playerName, weeks);

  } catch (e) {
    entriesEl.innerHTML = `<div class="item">Kunne ikke hente refleksjoner.</div>`;
    setError(String(e?.message || e));
  }
}

function renderPlayerTabs(playerId, playerName, weeks) {

  entriesEl.innerHTML = `
<div class="tabRow">
  <button id="tabReflection" class="tabBtn tabBtnActive" type="button">
    Refleksjoner
  </button>
  <button id="tabPlan" class="tabBtn" type="button">
    Utviklingsplan
  </button>
</div>

    <div id="playerContent"></div>
  `;

  const reflectionBtn = document.getElementById("tabReflection");
  const planBtn = document.getElementById("tabPlan");

reflectionBtn.addEventListener("click", () => {
  reflectionBtn.classList.add("tabBtnActive");
  planBtn.classList.remove("tabBtnActive");

  document.getElementById("rightTitle").textContent = "Refleksjoner";

  renderReflectionView(playerId, weeks);
});

planBtn.addEventListener("click", () => {
  planBtn.classList.add("tabBtnActive");
  reflectionBtn.classList.remove("tabBtnActive");

  document.getElementById("rightTitle").textContent = "Utviklingsplan";

  renderDevelopmentPlan(playerId);
});

  // Default = refleksjon
  renderReflectionView(playerId, weeks);
}

function finnUtviklingsOmradeGlobal(omradeId) {
  for (const kategori in utviklingsbank) {
    const liste = utviklingsbank[kategori];
    const match = liste.find(item => item.id === omradeId);
    if (match) return match;
  }
  return null;
}

async function loadAvailableWeeks(playerId) {
  // Hent en bunt entries og bygg liste over unike (year, week)
  const entriesRef = collection(db, `refleksjoner/${playerId}/entries`);

  // Prøver createdAt-sorting hvis den finnes, men vi tåler også at den mangler.
  let snap;
  try {
    const q = query(entriesRef, orderBy("createdAt", "desc"), limit(50));
    snap = await getDocs(q);
  } catch (_) {
    // fallback hvis createdAt/orderBy gir index/field-feil
    const q = query(entriesRef, limit(50));
    snap = await getDocs(q);
  }

  const seen = new Set();
  const weeks = [];

  snap.forEach(d => {
    const data = d.data() || {};
    const week = Number(data.week);
    const year = Number(data.year);

    if (!Number.isFinite(week) || !Number.isFinite(year)) return;

    const key = `${year}-${week}`;
    if (seen.has(key)) return;

    seen.add(key);
    weeks.push({ year, week });
  });

  // Sorter: nyeste først
  weeks.sort((a, b) => (b.year - a.year) || (b.week - a.week));

  return weeks;
}

function renderReflectionView(playerId, weeks) {

  const content = document.getElementById("playerContent");

  const options = [
    `<option value="" selected disabled>Velg uke…</option>`,
    ...weeks.map(w => {
      const label = `Uke ${w.week} (${w.year})`;
      const value = `${w.year}|${w.week}`;
      return `<option value="${value}">${label}</option>`;
    })
  ].join("");

  content.innerHTML = `
    <div class="item">
      <div class="itemTitle">Velg uke</div>
      <select id="weekSelect" class="playerSelect statsSelect">
        ${options}
      </select>
    </div>

    <div id="reflectionView">
      <div class="item">Velg uke for å se refleksjonen.</div>
    </div>
  `;

  const weekSelect = document.getElementById("weekSelect");

  weekSelect.addEventListener("change", async () => {
    if (!weekSelect.value) return;

    const [yearStr, weekStr] = weekSelect.value.split("|");
    const year = Number(yearStr);
    const week = Number(weekStr);

    await loadAndRenderReflection(playerId, year, week);
  });
}

async function renderDevelopmentPlan(playerId) {

  const content = document.getElementById("playerContent");
  content.innerHTML = `<div class="item">Laster utviklingsplan…</div>`;

  try {
    const snap = await getDoc(doc(db, "utviklingsplan", playerId));

    if (!snap.exists()) {
      content.innerHTML = `<div class="item">Ingen utviklingsplan funnet.</div>`;
      return;
    }

    const data = snap.data();
	
	const omrade = finnUtviklingsOmradeGlobal(data.mainFocus);
    const focusTitle = omrade?.title || data.mainFocus || "";
	
	const treningHtml = omrade?.trening
  ? `<ul class="planList">${omrade.trening.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
  : escapeHtml(data.trainingGoal || "");

const kampHtml = omrade?.kamp
  ? `<ul class="planList">${omrade.kamp.map(k => `<li>${escapeHtml(k)}</li>`).join("")}</ul>`
  : escapeHtml(data.matchBehaviour || "");

    content.innerHTML = `
      <div class="item">
        <div class="itemTitle">Hovedfokus</div>
        <div class="itemSub">${escapeHtml(focusTitle)}</div>
      </div>

      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Utviklingsmål</div>
        <div class="itemSub">${escapeHtml(data.utviklingsmaal || "")}</div>
      </div>

      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Treningsmål</div>
        <div class="itemSub">${treningHtml}</div>
      </div>

      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Kampatferd</div>
        <div class="itemSub">${kampHtml}</div>
      </div>
    `;

  } catch (e) {
    content.innerHTML = `<div class="item">Kunne ikke hente utviklingsplan.</div>`;
    setError(String(e?.message || e));
  }
}

async function loadAndRenderReflection(playerId, year, week) {
  const view = document.getElementById("reflectionView");
  if (!view) return;

  view.innerHTML = `<div class="item">Laster refleksjon…</div>`;
  setError("");

  try {
    const entry = await getReflectionByWeek(playerId, year, week);

    if (!entry) {
      view.innerHTML = `<div class="item">Ingen refleksjon funnet for uke ${week} (${year}).</div>`;
      return;
    }

    view.innerHTML = renderReflection(entry, { playerId, year, week });
setupCoachFeedbackButton(entry);

  } catch (e) {
    view.innerHTML = `<div class="item">Kunne ikke hente refleksjon for valgt uke.</div>`;
    setError(String(e?.message || e));
  }
}

async function setupCoachFeedbackButton(entry) {
  const btn = document.getElementById("toggleCoachFbBtn");
  const box = document.getElementById("coachFeedbackBox");
  if (!btn || !box) return;

  btn.addEventListener("click", async () => {

    const isHidden = box.style.display === "none";
    box.style.display = isHidden ? "block" : "none";
    if (!isHidden) return;

    box.innerHTML = `<div class="itemSub">Laster tilbakemelding…</div>`;

    try {
      const fb = await loadCoachFeedback(entry.playerId || entry.uid || playersSelect.value);

      if (!fb) {
        box.innerHTML = `<div class="itemSub">Ingen tilbakemelding fra trener for denne uken.</div>`;
        return;
      }

      box.innerHTML = renderCoachFeedback(fb);

    } catch (e) {
      box.innerHTML = `<div class="itemSub">Kunne ikke hente tilbakemelding.</div>`;
      setError(String(e?.message || e));
    }
  });
}

async function loadCoachFeedback(playerId) {
  const fbRef = collection(db, "feedback");

  const q = query(
    fbRef,
    where("playerId", "==", playerId),
    where("type", "==", "weekly"),
    where("status", "==", "sent"),
    limit(20)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // sorter på updatedAt (nyeste først)
  rows.sort((a, b) => {
    const aT = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
    const bT = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
    return bT - aT;
  });

  return rows[0];
}

function renderCoachFeedback(fb) {
  const text = fb?.editedText || "";

  if (!text) {
    return `<div class="itemSub">Ingen tilbakemelding fra trener for denne uken.</div>`;
  }

  return `
    <div class="itemSub" style="opacity:.95;">
      ${escapeHtml(text)}
    </div>
  `;
}

async function getReflectionByWeek(playerId, year, week) {
  const entriesRef = collection(db, `refleksjoner/${playerId}/entries`);

  // Vi bruker kun equality-filters + limit og velger “nyeste” i minnet
  // (unngår orderBy+where som ofte trigger composite index).
  const q = query(
    entriesRef,
    where("year", "==", year),
    where("week", "==", week),
    limit(10)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  // Hvis det finnes flere docs samme uke, velg den med høyest createdAt (om feltet finnes)
const rows = [];
snap.forEach(d => {
  const data = d.data() || {};
  rows.push({ id: d.id, ...data });
});

  rows.sort((a, b) => {
    const aT = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const bT = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return bT - aT;
  });

  return rows[0];
}

function renderReflection(data, ctx) {
  const createdAt =
    data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString("no-NO") : "";

  const type = data.type || "";
  const effort = data.effort ?? "";
  const energy = data.energy ?? "";
  const goodThing = data.goodThing || "";
  const improveThing = data.improveThing || "";
  const workedOnSeasonGoal = data.workedOnSeasonGoal || "";

  const coachNote = data.coachNote || "";
  const coachEffort = data.coachEffort ?? "";
  const coachEnergy = data.coachEnergy ?? "";

  return `
    <div class="item">
      <div class="itemTitle">Refleksjon</div>
      <div class="itemSub">${createdAt}${type ? " · " + escapeHtml(type) : ""}</div>
    </div>

    <div class="item" style="margin-top:10px;">
      <div class="itemTitle">Oppsummering</div>
      <div class="itemSub" style="margin-top:6px;">
        Innsats: <b>${escapeHtml(String(effort))}</b> · Energi: <b>${escapeHtml(String(energy))}</b>
      </div>
      ${workedOnSeasonGoal ? `<div class="itemSub" style="margin-top:6px;">Jobbet med sesongmål: <b>${escapeHtml(workedOnSeasonGoal)}</b></div>` : ""}
    </div>

    ${goodThing ? `
      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Dette fungerte bra</div>
        <div class="itemSub" style="margin-top:6px; opacity:.9;">${escapeHtml(goodThing)}</div>
      </div>
    ` : ""}

    ${improveThing ? `
      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Dette kan forbedres</div>
        <div class="itemSub" style="margin-top:6px; opacity:.9;">${escapeHtml(improveThing)}</div>
      </div>
    ` : ""}
	
	  ${ctx ? `
    <div class="item" style="margin-top:10px;">
      <button id="toggleCoachFbBtn" class="statsSelect" style="width:100%;">
        Tilbakemelding fra trener
      </button>
      <div id="coachFeedbackBox" style="display:none; margin-top:10px;"></div>
    </div>
  ` : ""}

  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function placeLabelFromVenue(venue) {
  if (venue === "home") return "Hjemme";
  if (venue === "away") return "Borte";
  return "Ukjent sted";
}

function formatDateStringNo(isoDate) {
  // isoDate: "2026-01-31"
  if (!isoDate || typeof isoDate !== "string") return "(ukjent dato)";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}

async function loadPlayedMatches(coachUid) {
	
  setError("");
  selectedPlayerEl.textContent = "Spilte kamper";
entriesEl.innerHTML = `
  <div class="item">
    <div class="statsTypeRow">
      <button class="typeFilterBtn active" data-type="all">Alle</button>
      <button class="typeFilterBtn" data-type="league">Seriekamp</button>
      <button class="typeFilterBtn" data-type="cup">Cupkamp</button>
      <button class="typeFilterBtn" data-type="friendly">Treningskamp</button>
    </div>
  </div>
  <div id="playedMatchesContainer"></div>
`;

const container = document.getElementById("playedMatchesContainer");

  try {
    const matchesRef = collection(db, "matches");
    const q = query(matchesRef, limit(50));
    const snap = await getDocs(q);

    const rows = [];
    snap.forEach(d => {
      const m = d.data() || {};

      const opponent = m?.meta?.opponent || "(ukjent motstander)";
      const date = m?.meta?.date || null;
      const venue = m?.meta?.venue || null;

      const our = m?.score?.our;
      const their = m?.score?.their;

if (m.status !== "ENDED") return;

rows.push({
  id: d.id,
  opponent,
  date,
  venue,
  our,
  their,
  result: m.result,
  type: m?.meta?.type || null
});
    });
	
 rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

let activeType = "all";

function renderFiltered() {
  container.innerHTML = "";

const filtered = rows.filter(m => {

  if (activeType === "all") return true;

  if (!m.type) return false;

  if (activeType === "league")
    return m.type === "league" || m.type === "Seriekamp";

  if (activeType === "cup")
    return m.type === "cup" || m.type === "Cupkamp";

  if (activeType === "friendly")
    return m.type === "friendly" || m.type === "Treningskamp";

  return false;
});

  if (!filtered.length) {
    container.innerHTML = `<div class="item">Ingen kamper av valgt type.</div>`;
    return;
  }

  filtered.forEach(m => {
    const div = document.createElement("div");
    div.className = "item";
	
div.style.cursor = "pointer";
div.addEventListener("click", () => {
  showPlayedMatchDetails(m.id, div);
});

const resultLabel =
  m.our > m.their ? "Seier" :
  m.our < m.their ? "Tap" :
  "Uavgjort";
  
  const resultClass =
  m.our > m.their ? "result-win" :
  m.our < m.their ? "result-loss" :
  "result-draw";
  
const venueText =
  m.venue === "home" ? "Hjemme" :
  m.venue === "away" ? "Borte" :
  "";

div.innerHTML = `
  <div class="itemTitle">${m.opponent}</div>
  <div class="itemSub">
    ${formatDateStringNo(m.date)} • 
    ${venueText} • 
    ${m.our}-${m.their} • 
    <span class="${resultClass}">${resultLabel}</span>
  </div>
`;
    container.appendChild(div);
  });
}

renderFiltered();

document.querySelectorAll(".typeFilterBtn").forEach(btn => {
  btn.addEventListener("click", () => {

    document.querySelectorAll(".typeFilterBtn")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");
    activeType = btn.dataset.type;

    renderFiltered();
  });
});

  } catch (e) {
    entriesEl.innerHTML = `<div class="item">Kunne ikke hente spilte kamper.</div>`;
    setError(String(e?.message || e));
  }
}

function showPlayersView() {
  tabPlayers.classList.add("isActive");
  tabMatch.classList.remove("isActive");
  tabPlayers.setAttribute("aria-selected", "true");
  tabMatch.setAttribute("aria-selected", "false");

  playersPanel.classList.remove("isHidden");
  matchPanel.classList.add("isHidden");
  
  playersSelect.value = "";
  hideRightPanel();
  document.getElementById("rightTitle").textContent = "Refleksjoner";
  selectedPlayerEl.textContent = "Velg en spiller.";
  entriesEl.innerHTML = "";
  setError("");
}

function showMatchView() {
  tabMatch.classList.add("isActive");
  tabPlayers.classList.remove("isActive");
  tabMatch.setAttribute("aria-selected", "true");
  tabPlayers.setAttribute("aria-selected", "false");

  matchPanel.classList.remove("isHidden");
  playersPanel.classList.add("isHidden");

  // ✅ Nullstill kampvalg og skjul høyre panel til noe velges
  matchSelect.value = "";
  hideRightPanel();
  document.getElementById("rightTitle").textContent = "Kamp";
  selectedPlayerEl.textContent = "Velg kamp.";
  entriesEl.innerHTML = "";
  setError("");
}

tabPlayers.addEventListener("click", showPlayersView);
tabMatch.addEventListener("click", showMatchView);

matchSelect.addEventListener("change", async () => {
  const v = matchSelect.value;

  if (!v) return;
  showRightPanel("Kamp");

  if (v === "played") {
    await loadPlayedMatches(currentUid);

  } else if (v === "upcoming") {
    await loadUpcomingMatches();

  } else if (v === "stats") {
    selectedPlayerEl.textContent = "Statistikk";
    const matches = await loadAllEndedMatches();
    renderStatsSelector(matches);
  }
});

async function loadUpcomingMatches() {
	
  setError("");
  selectedPlayerEl.textContent = "Kommende kamper";
  
  entriesEl.innerHTML = `
  <div class="item">
    <button id="addUpcomingMatchBtn" class="statsSelect addMatchBtn" style="width:100%;">
      Legg til kamp
    </button>
  </div>
  <div id="addMatchFormContainer"></div>
`;

const addBtn = document.getElementById("addUpcomingMatchBtn");
const formContainer = document.getElementById("addMatchFormContainer");

if (addBtn && formContainer) {
  addBtn.addEventListener("click", () => {
    const isOpen = formContainer.innerHTML.trim() !== "";

    if (isOpen) {
      formContainer.innerHTML = "";
      return;
    }

    formContainer.innerHTML = `
      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Ny kamp</div>

<div class="itemSub" style="margin-top:8px;">
  <input id="opponentInput" class="playerSelect" placeholder="Motstander" />
</div>

        <div class="itemSub" style="margin-top:8px;">
  <select id="venueTypeInput" class="playerSelect">
    <option value="">Hjemme eller borte?</option>
    <option value="home">Hjemme</option>
    <option value="away">Borte</option>
  </select>
</div>

<div class="itemSub" style="margin-top:8px;">
  <input id="venueNameInput" class="playerSelect" placeholder="Stedsnavn (valgfritt)" />
</div>
		
		<div class="itemSub" style="margin-top:8px;">
  <input id="dateInput" type="date" class="playerSelect" />
</div>

        <div class="itemSub" style="margin-top:8px;">
          <input id="timeInput" type="time" class="playerSelect" />
        </div>

        <div class="itemSub" style="margin-top:8px;">
          <select id="typeInput" class="playerSelect">
  <option value="">Type kamp</option>
  <option value="league">Seriekamp</option>
  <option value="cup">Cupkamp</option>
  <option value="friendly">Treningskamp</option>
</select>
        </div>

        <div class="matchFormActions">
          <button id="saveMatchBtn" class="matchFormBtn saveMatchAction" type="button">Lagre</button>
          <button id="cancelMatchBtn" class="matchFormBtn cancelMatchAction" type="button">Avbryt</button>
        </div>
      </div>
    `;

document.getElementById("cancelMatchBtn").onclick = () => {
  formContainer.innerHTML = "";
};

document.getElementById("saveMatchBtn").onclick = async () => {

  const opponent = document.getElementById("opponentInput").value.trim();
  const venueType = document.getElementById("venueTypeInput").value;
  const venueName = document.getElementById("venueNameInput").value.trim();
  const date = document.getElementById("dateInput").value;
  const time = document.getElementById("timeInput").value;
  const type = document.getElementById("typeInput").value;

  if (!opponent) {
  alert("Du må skrive inn motstander.");
  return;
}

  try {
await addDoc(collection(db, "matches"), {
  meta: {
    opponent,
    venueType: venueType || null,
    venueName: venueName || "",
    date: date || null,
    time: time || "",
    type: type || null
  },
  status: "UPCOMING",
  createdAt: serverTimestamp()
});

    formContainer.innerHTML = "";
    await loadUpcomingMatches();

  } catch (e) {
    console.error(e);
    alert("Kunne ikke lagre kamp.");
  }
};
  });
}

  try {
    const matchesRef = collection(db, "matches");
    const snap = await getDocs(matchesRef);

const rows = [];
snap.forEach(d => {
  const m = d.data() || {};

  console.log("MATCH:", d.id, m.status); // 🔥 HER SKAL DEN VÆRE

  if ((m.status || "").toUpperCase() !== "ENDED") {
    rows.push({
      id: d.id,
      opponent: m?.meta?.opponent || "(ukjent)",
      date: m?.meta?.date || null,
      time: m?.meta?.time || "",
      venueType: m?.meta?.venueType || null,
      venueName: m?.meta?.venueName || "",
      type: m?.meta?.type || null
    });
  }
});

rows.sort((a, b) => {

  const aHasDate = !!a.date;
  const bHasDate = !!b.date;

  // 1️⃣ Begge har dato → sorter på dato
  if (aHasDate && bHasDate) {
    return a.date.localeCompare(b.date);
  }

  // 2️⃣ Kun én har dato → den med dato først
  if (aHasDate && !bHasDate) return -1;
  if (!aHasDate && bHasDate) return 1;

  // 3️⃣ Ingen har dato → sorter alfabetisk på motstander
  return (a.opponent || "").localeCompare(b.opponent || "", "no");
});

if (rows.length === 0) {
  const emptyDiv = document.createElement("div");
  emptyDiv.className = "item";
  emptyDiv.textContent = "Ingen kommende kamper funnet.";
  entriesEl.appendChild(emptyDiv);
  return;
}

rows.forEach((m, index) => {
	
      const div = document.createElement("div");
      div.className = "item";
	  div.style.cursor = "pointer";
div.addEventListener("click", () => openEditUpcomingMatch(m));
div.innerHTML = `
  <div class="itemTitle">${m.opponent}</div>

  <div class="itemSub">
    ${m.type === "league" ? "Seriekamp • " :
      m.type === "cup" ? "Cupkamp • " :
      m.type === "friendly" ? "Treningskamp • " : ""}
    ${m.date ? formatDateStringNo(m.date) : "Dato ikke satt"}
    ${m.time ? " kl. " + m.time : ""}
  </div>

  <div class="itemSub">
    ${
      m.venueType === "home"
        ? "Hjemme"
        : m.venueType === "away"
        ? "Borte"
        : "Ukjent"
    }
    ${m.venueName ? " – " + m.venueName : ""}
  </div>

  <div class="matchActions">
    <button class="startMatchBtn">Start kamp</button>

    ${index === 0 ? `<span class="lineupBtn">Lagoppstilling</span>` : ``}
  </div>
`;

// Start kamp
const startBtn = div.querySelector(".startMatchBtn");

if (startBtn) {
  startBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    window.location.href = `kamp.html?matchId=${m.id}`;
  });
}

// Lagoppstilling
const lineupBtn = div.querySelector(".lineupBtn");

if (lineupBtn) {
  lineupBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    window.location.href = `kamper.html?matchId=${m.id}&openLineup=true`;
  });
}
	  
      entriesEl.appendChild(div);
    });

  } catch (e) {
    entriesEl.innerHTML = `<div class="item">Kunne ikke hente kommende kamper.</div>`;
    setError(String(e?.message || e));
  }
}

function renderStatsSelector(matches) {

  if (!matches.length) {
    entriesEl.innerHTML = `<div class="item">Ingen kamper funnet.</div>`;
    return;
  }

  let activeType = "all";

  function filterMatchesByType(list) {

    if (activeType === "all") return list;

    return list.filter(m => {
      const type = m.meta?.type;

      if (!type) return false;

      if (activeType === "league")
        return type === "league" || type === "Seriekamp";

      if (activeType === "cup")
        return type === "cup" || type === "Cupkamp";

      if (activeType === "friendly")
        return type === "friendly" || type === "Treningskamp";

      return false;
    });
  }

  function buildDropdown(filteredMatches) {

    let options = `<option value="total">Total</option>`;

filteredMatches.forEach(m => {

  const date = m.meta?.date ? formatDateStringNo(m.meta.date) : "";
  const opponent = m.meta?.opponent || "";

  const our = m.score?.our;
  const their = m.score?.their;

  let resultLabel = "";

  if (Number.isFinite(our) && Number.isFinite(their)) {
    if (our > their) resultLabel = "Seier";
    else if (our < their) resultLabel = "Tap";
    else resultLabel = "Uavgjort";
  }

const venueText =
  m.meta?.venue === "home" ? "Hjemme" :
  m.meta?.venue === "away" ? "Borte" :
  "";

options += `
  <option value="${m.id}">
    ${opponent} — ${date} • ${venueText} • ${our}-${their} • ${resultLabel}
  </option>
`;
});

    document.getElementById("statsMatchSelect").innerHTML = options;
  }

  // 🔹 Bygg UI én gang
  entriesEl.innerHTML = `
    <div class="item">
      <div class="statsTypeRow">
        <button class="statsTypeBtn active" data-type="all">Alle</button>
        <button class="statsTypeBtn" data-type="league">Seriekamp</button>
        <button class="statsTypeBtn" data-type="cup">Cupkamp</button>
        <button class="statsTypeBtn" data-type="friendly">Treningskamp</button>
      </div>

      <select id="statsMatchSelect" class="playerSelect statsSelect"></select>
    </div>

    <div id="statsContent"></div>
    <div id="matchDetailsArea"></div>
  `;

  const select = document.getElementById("statsMatchSelect");

  function renderAll() {

    const filteredMatches = filterMatchesByType(matches);

    buildDropdown(filteredMatches);

    renderStatsContent(filteredMatches);

    const detailsArea = document.getElementById("matchDetailsArea");
    if (detailsArea) detailsArea.innerHTML = "";

    select.value = "total";
  }

  // 🔹 Type-knapper
  document.querySelectorAll(".statsTypeBtn").forEach(btn => {
    btn.addEventListener("click", () => {

      document.querySelectorAll(".statsTypeBtn")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");
      activeType = btn.dataset.type;

      renderAll();
    });
  });

  // 🔹 Dropdown
  select.addEventListener("change", () => {

    const filteredMatches = filterMatchesByType(matches);
    const detailsArea = document.getElementById("matchDetailsArea");
    if (detailsArea) detailsArea.innerHTML = "";

    if (select.value === "total") {
      renderStatsContent(filteredMatches);
    } else {
      const singleMatch = filteredMatches.find(m => m.id === select.value);

      if (singleMatch) {
        renderStatsContent([singleMatch]);
        renderDetailsButton(singleMatch);
      }
    }

  });

  // 🔹 Default render
  renderAll();
}

function renderStatsContent(matches) {
  const stats = calculateStats(matches);
  renderStatsTable(stats, "statsContent");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  userLine.textContent = `Innlogget: ${user.email || user.uid}`;
  currentUid = user.uid;

  // Les rolle fra users/{uid}
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  const role = snap.data()?.role;
  
const coachOnlyBtn = document.getElementById("coachOnlyBtn");

if (coachOnlyBtn) {
  // Skjul alltid først
  coachOnlyBtn.style.display = "none";

  if (role === "coach") {
    coachOnlyBtn.style.display = "inline-block";

    coachOnlyBtn.onclick = () => {
      window.location.href = "fremside.html";
    };
  }
}
  
if (roleLine) {
  roleLine.textContent = `Rolle: ${role || "ukjent"}`;
}

  // Tillat assistantCoach og coach (praktisk for deg å teste)
  if (role !== "assistantCoach" && role !== "coach") {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

 await loadUtviklingsbank();
await loadPlayers();
showPlayersView();
});

async function loadAllEndedMatches() {
  const matchesRef = collection(db, "matches");
  const snap = await getDocs(matchesRef);

  const matches = [];

  snap.forEach(d => {
    const data = d.data();
    if (data.status === "ENDED") {
      matches.push({
        id: d.id,
        ...data
      });
    }
  });

  return matches;
}

function normalizeLoanPlayerName(name) {
  return String(name || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("no");
}

function getStatsPlayerKey(player, loanPlayerNames = new Set()) {
  const playerId = String(player?.id || "");
  const normalizedName = normalizeLoanPlayerName(player?.name);

  if (
    playerId.startsWith("loan_") ||
    player?.isLoan === true ||
    loanPlayerNames.has(normalizedName)
  ) {
    return normalizedName ? `loan:${normalizedName}` : "";
  }

  return playerId || (normalizedName ? `name:${normalizedName}` : "");
}

function collectLoanPlayerNames(matches) {
  const names = new Set();

  matches.forEach(match => {
    (match.playingTime || []).forEach(player => {
      const playerId = String(player?.id || "");
      if (playerId.startsWith("loan_") || player?.isLoan === true) {
        const name = normalizeLoanPlayerName(player?.name);
        if (name) names.add(name);
      }
    });

    Object.entries(match.players || {}).forEach(([playerId, player]) => {
      if (playerId.startsWith("loan_") || player?.isLoan === true) {
        const name = normalizeLoanPlayerName(player?.name);
        if (name) names.add(name);
      }
    });

    (match.events || []).forEach(event => {
      if (String(event?.playerId || "").startsWith("loan_")) {
        const name = normalizeLoanPlayerName(event?.playerName);
        if (name) names.add(name);
      }
    });
  });

  return names;
}

function calculateStats(matches) {
  const stats = {};
  // Eldre kamper kan ha mistet loan_-ID-en. Navn som er bekreftet som
  // lånespillere i minst én kamp slås derfor sammen på tvers av alle kamper.
  const loanPlayerNames = collectLoanPlayerNames(matches);

  matches.forEach(match => {

    const statsKeyByMatchPlayerId = {};
    const countedInThisMatch = new Set();

    // 🔹 Spillertid + kort
    (match.playingTime || []).forEach(p => {

      const statsKey = getStatsPlayerKey(p, loanPlayerNames);
      if (!statsKey) return;

      if (p.id) statsKeyByMatchPlayerId[p.id] = statsKey;

      if (!stats[statsKey]) {
        stats[statsKey] = {
          name: String(p.name || "Ukjent").trim(),
          matches: 0,
          minutes: 0,
          goals: 0,
          yellow: 0,
          red: 0
        };
      }

      // Samme lånespiller skal bare telle én kamp selv om eldre data
      // inneholder mer enn én tilfeldig ID i samme kamp.
      if (!countedInThisMatch.has(statsKey)) {
        stats[statsKey].matches += 1;
        countedInThisMatch.add(statsKey);
      }

      stats[statsKey].minutes += p.minutes || 0;

      (p.cards || []).forEach(c => {
        if (c.type === "yellow") stats[statsKey].yellow += 1;
        if (c.type === "red") stats[statsKey].red += 1;
      });
    });

    // 🔹 Mål
    (match.events || []).forEach(e => {
      if (e.type === "goal" && e.team === "home" && e.playerId) {
        let statsKey = statsKeyByMatchPlayerId[e.playerId];

        // Fallback for eldre lånespillermål der spiller-ID-en ikke lenger
        // finnes i playingTime, men navnet fortsatt er lagret i hendelsen.
        if (!statsKey && (
          String(e.playerId).startsWith("loan_") ||
          loanPlayerNames.has(normalizeLoanPlayerName(e.playerName))
        )) {
          const loanKey = `loan:${normalizeLoanPlayerName(e.playerName)}`;
          if (stats[loanKey]) statsKey = loanKey;
        }

        if (statsKey && stats[statsKey]) {
          stats[statsKey].goals += 1;
        }
      }
    });

  });

  return stats;
}

function renderStatsTable(stats, targetId = null) {

  const container = targetId
    ? document.getElementById(targetId)
    : entriesEl;

  const players = Object.values(stats);

  if (players.length === 0) {
    container.innerHTML = `<div class="item">Ingen statistikk funnet.</div>`;
    return;
  }

  players.sort((a, b) => b.minutes - a.minutes);

  let html = `
    <table class="statsTable">
      <thead>
        <tr>
          <th>Spiller</th>
          <th title="Kamper spilt">👟</th>
          <th title="Mål">⚽</th>
          <th title="Gule kort">🟨</th>
          <th title="Røde kort">🟥</th>
          <th title="Totale minutter">⏱</th>

        </tr>
      </thead>
      <tbody>
  `;

  players.forEach(p => {
    html += `
      <tr>
  <td>${p.name}</td>
  <td>${p.matches}</td>
  <td>${p.goals}</td>
  <td>${p.yellow}</td>
  <td>${p.red}</td>
  <td>${p.minutes}</td>
</tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

function renderDetailsButton(match) {
  const area = document.getElementById("matchDetailsArea");
  if (!match || !area) return;

  area.innerHTML = `
    <div class="item" style="margin-top:10px;">
      <button id="showMatchDetailsBtn" class="btn" style="width:100%;">
        Detaljer
      </button>
      <div id="matchDetailsBox" style="display:none; margin-top:10px;"></div>
    </div>
  `;

  const btn = document.getElementById("showMatchDetailsBtn");
  const box = document.getElementById("matchDetailsBox");

  btn.addEventListener("click", () => {
    const isHidden = box.style.display === "none";
    box.style.display = isHidden ? "block" : "none";

    if (!isHidden) return;

    box.innerHTML = renderMatchDetails(match);
  });
}

function renderMatchDetails(match) {

  const events = match.events || [];

  if (!events.length) {
    return `<div class="itemSub">Ingen hendelser registrert.</div>`;
  }

  let html = `<div class="itemSub" style="opacity:.95;">`;

  // Hendelser fra ulike versjoner av kampføringen kan være lagret i
  // forskjellig rekkefølge. Sorter på faktisk registreringstid i stedet
  // for å anta at hele listen alltid er lagret nyeste først.
  const sorted = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const periodDifference = getOverviewEventPeriod(a.event) - getOverviewEventPeriod(b.event);
      if (periodDifference !== 0) return periodDifference;

      const aTime = getEventClockTime(a.event, match);
      const bTime = getEventClockTime(b.event, match);

      if (aTime !== null && bTime !== null && aTime !== bTime) {
        return aTime - bTime;
      }

      // Eldre hendelser uten tidspunkt ligger normalt nyeste først.
      return b.index - a.index;
    })
    .map(entry => entry.event);

  sorted.forEach(e => {
    html += `
      <div style="margin-bottom:6px;">
        ${escapeHtml(getOverviewEventDisplayText(e))}
      </div>
    `;
  });

  html += `</div>`;

  return html;
}

function getOverviewEventDisplayText(event) {
  const rawText = String(event?.rawText || event?.text || "Hendelse")
    .replace(/^\s*\d{1,2}:\d{2}\s*[–-]\s*/, "");
  const isMatchMilestone =
    /kamp(?:en)? startet|pause|1\. omgang avsluttet|2\. omgang startet|kamp avsluttet/i
      .test(rawText);

  if (!isMatchMilestone) return rawText;

  const clock = event?.createdClock ||
    String(event?.text || "").match(/^\s*(\d{1,2}:\d{2})/)?.[1];
  return clock ? `${clock} – ${rawText}` : rawText;
}

function getOverviewEventPeriod(event) {
  if (Number.isFinite(event?.period)) return event.period;
  const text = String(event?.rawText || event?.text || "");
  if (/kamp avsluttet/i.test(text)) return 3;
  if (/2\. omgang/i.test(text)) return 2;
  return 1;
}

function getEventClockTime(event, matchData = {}) {
  if (Number.isFinite(event?.timeMs)) {
    return event.timeMs;
  }

  const minuteText = String(event?.minute || "").trim();
  const minuteMatch = minuteText.match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$/);
  if (minuteMatch) {
    return (Number(minuteMatch[1]) + Number(minuteMatch[2] || 0)) * 60 * 1000;
  }

  const rawText = String(event?.rawText || event?.text || "");
  const rawMinuteMatch = rawText.match(
    /(?:^|\s)(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*[–-]/u
  );
  if (rawMinuteMatch) {
    return (Number(rawMinuteMatch[1]) + Number(rawMinuteMatch[2] || 0)) * 60 * 1000;
  }

  const halfMinutes = Number(matchData?.meta?.halfLengthMin) || 35;
  if (/kamp(?:en)? startet/i.test(rawText)) return 0;
  if (/pause|2\. omgang startet/i.test(rawText)) return halfMinutes * 60 * 1000;
  if (/kamp avsluttet/i.test(rawText)) return halfMinutes * 2 * 60 * 1000;

  const clockText = String(
    event?.createdClock || event?.text || ""
  );
  const clockMatch = clockText.match(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$)/);
  if (clockMatch) {
    return (Number(clockMatch[1]) * 60 + Number(clockMatch[2])) * 60 * 1000;
  }

  const reportedAt = new Date(event?.reportedAt || "");
  if (!Number.isNaN(reportedAt.getTime())) {
    return (
      reportedAt.getHours() * 60 * 60 * 1000 +
      reportedAt.getMinutes() * 60 * 1000 +
      reportedAt.getSeconds() * 1000 +
      reportedAt.getMilliseconds()
    );
  }

  return null;
}

async function showPlayedMatchDetails(matchId, clickedDiv) {

  // Hvis samme kamp klikkes igjen → lukk
  if (openPlayedMatchId === matchId) {
    const existingDetails = clickedDiv.nextElementSibling;
    if (existingDetails && existingDetails.classList.contains("matchDetailsBlock")) {
      existingDetails.remove();
    }
    openPlayedMatchId = null;
    return;
  }

  // Hvis en annen kamp er åpen → lukk den først
  const oldDetails = document.querySelector(".matchDetailsBlock");
  if (oldDetails) oldDetails.remove();

  openPlayedMatchId = matchId;

  try {
    const snap = await getDoc(doc(db, "matches", matchId));
    if (!snap.exists()) return;

    const match = snap.data();
    const canRepairLeander = findLeanderGoalRepairEvent(match) !== null;
    const canRepairBjargDuration = findBjargDurationRepair(match);

    const detailsDiv = document.createElement("div");
    detailsDiv.className = "item matchDetailsBlock";
    detailsDiv.style.marginTop = "6px";

    detailsDiv.innerHTML = `
      <div class="itemSub" style="margin-bottom:6px;">
        ${formatDateStringNo(match.meta?.date)} ·
        ${placeLabelFromVenue(match.meta?.venue)} ·
        ${match.score?.our ?? 0}–${match.score?.their ?? 0}
      </div>
      <div class="matchEventDetails">${renderMatchDetails(match)}</div>
      ${canRepairLeander ? `
        <button class="statsSelect repairLeanderBtn" style="width:100%; margin-top:10px;">
          Rett mål og spilletid for Leander
        </button>
        <div class="itemSub repairLeanderStatus" style="margin-top:8px;"></div>
      ` : ""}
      ${canRepairBjargDuration ? `
        <button class="statsSelect repairBjargDurationBtn" style="width:100%; margin-top:10px;">
          Rett sluttid til 70 + 3
        </button>
        <div class="itemSub repairBjargDurationStatus" style="margin-top:8px;"></div>
      ` : ""}
    `;

    clickedDiv.after(detailsDiv);

    const repairBtn = detailsDiv.querySelector(".repairLeanderBtn");
    if (repairBtn) {
      repairBtn.addEventListener("click", async () => {
        const confirmed = confirm(
          "Dette flytter målet i 48. minutt fra Snorre til Leander, " +
          "gir Leander 25 minutter og trekker 25 minutter fra Lukas. Fortsette?"
        );
        if (!confirmed) return;

        const status = detailsDiv.querySelector(".repairLeanderStatus");
        repairBtn.disabled = true;
        status.textContent = "Retter kampdata…";

        try {
          await repairLeanderGoalAndPlayingTime(matchId);
          status.textContent = "Rettet: Leander har fått målet og 25 minutter.";
          repairBtn.remove();

          const updatedSnap = await getDoc(doc(db, "matches", matchId));
          if (updatedSnap.exists()) {
            const details = detailsDiv.querySelector(".matchEventDetails");
            if (details) details.innerHTML = renderMatchDetails(updatedSnap.data());
          }
        } catch (error) {
          console.error(error);
          status.textContent = `Kunne ikke rette kampen: ${error.message}`;
          repairBtn.disabled = false;
        }
      });
    }

    const durationBtn = detailsDiv.querySelector(".repairBjargDurationBtn");
    if (durationBtn) {
      durationBtn.addEventListener("click", async () => {
        const confirmed = confirm(
          "Dette setter Bjarg 4-kampen til 73 minutter og beregner " +
          "spillertiden på nytt. Fortsette?"
        );
        if (!confirmed) return;

        const status = detailsDiv.querySelector(".repairBjargDurationStatus");
        durationBtn.disabled = true;
        status.textContent = "Retter sluttid og spilletid…";

        try {
          await repairEndedMatchDuration(matchId, 73, "70 + 3");
          status.textContent = "Rettet: kampen og spillertiden er avgrenset til 70 + 3.";
          durationBtn.remove();

          const updatedSnap = await getDoc(doc(db, "matches", matchId));
          if (updatedSnap.exists()) {
            const details = detailsDiv.querySelector(".matchEventDetails");
            if (details) details.innerHTML = renderMatchDetails(updatedSnap.data());
          }
        } catch (error) {
          console.error(error);
          status.textContent = `Kunne ikke rette kampen: ${error.message}`;
          durationBtn.disabled = false;
        }
      });
    }

  } catch (e) {
    console.error(e);
  }
}

function findBjargDurationRepair(match) {
  return (
    match?.meta?.date === "2026-06-18" &&
    normalizePlayerName(match?.meta?.opponent) === "bjarg 4" &&
    Number(match?.score?.our) === 1 &&
    Number(match?.score?.their) === 3 &&
    Number(match?.durationRepair?.finalMinutes) !== 73
  );
}

function clampPlayerIntervals(intervals, finalTimeMs) {
  return (Array.isArray(intervals) ? intervals : [])
    .map(interval => ({
      ...interval,
      in: Math.max(0, Number(interval?.in) || 0),
      out: Math.min(
        interval?.out == null ? finalTimeMs : Number(interval.out),
        finalTimeMs
      )
    }))
    .filter(interval => interval.in < finalTimeMs && interval.out > interval.in);
}

function calculateMergedIntervalMinutes(intervals) {
  const sorted = [...intervals].sort((a, b) => a.in - b.in);
  const merged = [];

  sorted.forEach(interval => {
    const last = merged.at(-1);
    if (!last || interval.in > last.out) {
      merged.push({ in: interval.in, out: interval.out });
    } else {
      last.out = Math.max(last.out, interval.out);
    }
  });

  const totalMs = merged.reduce(
    (sum, interval) => sum + interval.out - interval.in,
    0
  );
  return Math.floor(totalMs / 60000);
}

async function repairEndedMatchDuration(matchId, finalMinutes, minuteLabel) {
  const matchRef = doc(db, "matches", matchId);
  const snap = await getDoc(matchRef);
  if (!snap.exists()) throw new Error("Kampen finnes ikke lenger.");

  const match = snap.data();
  if (!findBjargDurationRepair(match)) {
    throw new Error("Kampen matcher ikke Bjarg 4-kampen som skal rettes.");
  }

  const finalTimeMs = finalMinutes * 60 * 1000;
  const players = {};

  Object.entries(match.players || {}).forEach(([id, player]) => {
    players[id] = {
      ...player,
      intervals: clampPlayerIntervals(player?.intervals, finalTimeMs)
    };
  });

  const playerValues = Object.values(players);
  const playingTime = (Array.isArray(match.playingTime) ? match.playingTime : [])
    .map(player => {
      const storedPlayer = players[player.id] || playerValues.find(candidate =>
        normalizePlayerName(candidate?.name) === normalizePlayerName(player?.name)
      );
      const intervals = storedPlayer?.intervals || [];
      const minutes = intervals.length > 0
        ? calculateMergedIntervalMinutes(intervals)
        : Math.min(Number(player.minutes || 0), finalMinutes);

      return { ...player, minutes };
    });

  const events = (Array.isArray(match.events) ? match.events : [])
    .map(event => ({ ...event }));
  const endEvent = events.find(event =>
    String(event?.rawText || event?.text || "").includes("Kamp avsluttet")
  );
  const priorEvents = events.filter(event => event !== endEvent);
  const lastPriorEvent = priorEvents
    .map(event => ({ event, time: getEventClockTime(event) }))
    .filter(entry => entry.time !== null)
    .sort((a, b) => b.time - a.time)[0]?.event;

  if (endEvent) {
    const clock = lastPriorEvent?.createdClock ||
      String(lastPriorEvent?.text || "").match(/^(\d{1,2}:\d{2})/)?.[1] ||
      endEvent.createdClock;
    const rawText = `🏁 Kamp avsluttet (${minuteLabel} min)`;
    endEvent.rawText = rawText;
    endEvent.createdClock = clock;
    endEvent.text = clock ? `${clock} – ${rawText}` : rawText;
    endEvent.edited = true;
    endEvent.editedAt = new Date().toISOString();
  }

  await updateDoc(matchRef, {
    players,
    playingTime,
    events,
    "timer.elapsedMs": finalTimeMs,
    "timer.startTimestamp": null,
    durationRepair: {
      finalMinutes,
      appliedAt: serverTimestamp()
    }
  });
}

function normalizePlayerName(name) {
  return String(name || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("no");
}

function eventMinuteNumber(event) {
  const minute = String(event?.minute || event?.rawText || event?.text || "");
  const match = minute.match(/(?:^|[^0-9])(\d{1,3})(?:\s*\+\s*\d+)?(?:[^0-9]|$)/);
  return match ? Number(match[1]) : null;
}

function findLeanderGoalRepairEvent(match) {
  if (
    match?.meta?.date !== "2026-04-19" ||
    Number(match?.score?.our) !== 5 ||
    Number(match?.score?.their) !== 2
  ) {
    return null;
  }

  const events = Array.isArray(match?.events) ? match.events : [];
  const index = events.findIndex(event =>
    event?.type === "goal" &&
    event?.team === "home" &&
    normalizePlayerName(event?.playerName) === "snorre" &&
    eventMinuteNumber(event) === 48
  );

  return index >= 0 ? { index, event: events[index] } : null;
}

async function repairLeanderGoalAndPlayingTime(matchId) {
  const matchRef = doc(db, "matches", matchId);
  const snap = await getDoc(matchRef);
  if (!snap.exists()) throw new Error("Kampen finnes ikke lenger.");

  const match = snap.data();
  const target = findLeanderGoalRepairEvent(match);
  if (!target) {
    throw new Error("Fant ikke Snorre-målet i 48. minutt. Ingen data ble endret.");
  }

  const playingTime = Array.isArray(match.playingTime)
    ? match.playingTime.map(player => ({ ...player }))
    : [];
  const lukas = playingTime.find(player => normalizePlayerName(player.name) === "lukas");
  const existingLeander = playingTime.find(
    player => normalizePlayerName(player.name) === "leander"
  );

  if (!lukas || Number(lukas.minutes || 0) < 25) {
    throw new Error("Lukas har ikke minst 25 registrerte minutter. Ingen data ble endret.");
  }
  if (existingLeander) {
    throw new Error("Leander finnes allerede i denne kampens spilletid. Ingen data ble endret.");
  }

  const players = { ...(match.players || {}) };
  const existingPlayerEntry = Object.entries(players).find(
    ([, player]) => normalizePlayerName(player?.name) === "leander"
  );
  const leanderId = existingPlayerEntry?.[0] || `loan_leander_${matchId}`;

  players[leanderId] = {
    ...(existingPlayerEntry?.[1] || {}),
    id: leanderId,
    name: "Leander",
    isLoan: true,
    present: true,
    starter: existingPlayerEntry?.[1]?.starter === true,
    intervals: Array.isArray(existingPlayerEntry?.[1]?.intervals)
      ? existingPlayerEntry[1].intervals
      : [],
    cards: Array.isArray(existingPlayerEntry?.[1]?.cards)
      ? existingPlayerEntry[1].cards
      : []
  };

  lukas.minutes = Number(lukas.minutes || 0) - 25;
  playingTime.push({
    id: leanderId,
    name: "Leander",
    minutes: 25,
    cards: []
  });

  const events = match.events.map(event => ({ ...event }));
  const event = events[target.index];
  const rawText = `⚽ ${event.minute || "48"} – Leander (${match.meta?.ourTeam || "Samnanger"})`;
  const clock = event.createdClock || String(event.text || "").match(/^(\d{1,2}:\d{2})/)?.[1];

  events[target.index] = {
    ...event,
    playerId: leanderId,
    playerName: "Leander",
    rawText,
    text: clock ? `${clock} – ${rawText}` : rawText,
    edited: true,
    editedAt: new Date().toISOString()
  };

  await updateDoc(matchRef, {
    players,
    playingTime,
    events,
    leanderRepair: {
      appliedAt: serverTimestamp(),
      minutesMovedFromLukas: 25,
      goalMinute: 48
    }
  });
}

function openEditUpcomingMatch(match) {

  const formContainer = document.getElementById("addMatchFormContainer");
  if (!formContainer) return;

  formContainer.innerHTML = `
    <div class="item" style="margin-top:10px;">
      <div class="itemTitle">Rediger kamp</div>

      <div class="itemSub" style="margin-top:8px;">
        <input id="opponentInput" class="playerSelect" placeholder="Motstander"
          value="${escapeHtml(match.opponent || "")}" />
      </div>

      <div class="itemSub" style="margin-top:8px;">
        <select id="venueTypeInput" class="playerSelect">
          <option value="">Hjemme eller borte?</option>
          <option value="home" ${match.venueType === "home" ? "selected" : ""}>Hjemme</option>
          <option value="away" ${match.venueType === "away" ? "selected" : ""}>Borte</option>
        </select>
      </div>

      <div class="itemSub" style="margin-top:8px;">
        <input id="venueNameInput" class="playerSelect"
          placeholder="Stedsnavn (valgfritt)"
          value="${escapeHtml(match.venueName || "")}" />
      </div>

      <div class="itemSub" style="margin-top:8px;">
        <input id="dateInput" type="date" class="playerSelect"
          value="${match.date || ""}" />
      </div>

      <div class="itemSub" style="margin-top:8px;">
        <input id="timeInput" type="time" class="playerSelect"
          value="${match.time || ""}" />
      </div>
	  
	  <div class="itemSub" style="margin-top:8px;">
  <select id="typeInput" class="playerSelect">
    <option value="">Type kamp</option>
    <option value="league" ${match.type === "league" ? "selected" : ""}>Seriekamp</option>
    <option value="cup" ${match.type === "cup" ? "selected" : ""}>Cupkamp</option>
    <option value="friendly" ${match.type === "friendly" ? "selected" : ""}>Treningskamp</option>
  </select>
</div>

<div class="actionRow">
  <button id="updateMatchBtn" class="updateBtn">Oppdater</button>
  <button id="deleteMatchBtn" class="deleteBtn">Slett</button>
  <button id="cancelMatchBtn" class="cancelBtn">Avbryt</button>
</div>
    </div>
  `;

  document.getElementById("cancelMatchBtn").onclick = () => {
    formContainer.innerHTML = "";
  };

  document.getElementById("updateMatchBtn").onclick = async () => {
    await updateUpcomingMatch(match.id);
  };
  
  document.getElementById("deleteMatchBtn").onclick = async () => {

  const confirmDelete = confirm("Er du sikker på at du vil slette denne kampen?");
  if (!confirmDelete) return;

  try {
await updateDoc(doc(db, "matches", match.id), {
  status: "ENDED"
});

    const formContainer = document.getElementById("addMatchFormContainer");
    if (formContainer) formContainer.innerHTML = "";

    await loadUpcomingMatches();

  } catch (e) {
    console.error(e);
    alert("Kunne ikke slette kamp.");
  }
};
}

async function updateUpcomingMatch(matchId) {

  const opponent = document.getElementById("opponentInput").value.trim();
  const venueType = document.getElementById("venueTypeInput").value;
  const venueName = document.getElementById("venueNameInput").value.trim();
  const date = document.getElementById("dateInput").value;
  const time = document.getElementById("timeInput").value;
  const type = document.getElementById("typeInput").value;

if (!opponent) {
  alert("Du må skrive inn motstander.");
  return;
}

  try {
await updateDoc(doc(db, "matches", matchId), {
  "meta.opponent": opponent,
  "meta.venueType": venueType,
  "meta.venueName": venueName,
  "meta.date": date,
  "meta.time": time,
  "meta.type": type || null
});

    // Lukk skjema
    const formContainer = document.getElementById("addMatchFormContainer");
    if (formContainer) formContainer.innerHTML = "";

    // Reload liste
    await loadUpcomingMatches();

  } catch (e) {
    console.error(e);
    alert("Kunne ikke oppdatere kamp.");
  }
}

document.addEventListener("click", (e) => {
  const rightPanel = document.getElementById("rightPanel");
  const weekSelect = document.getElementById("weekSelect");
  const reflectionView = document.getElementById("reflectionView");

  if (!rightPanel || rightPanel.classList.contains("isHidden")) return;

  // Hvis vi klikker utenfor høyre panel
  if (!rightPanel.contains(e.target)) {

    // Nullstill uke
    if (weekSelect) {
      weekSelect.selectedIndex = 0;
    }

    // Lukk refleksjon
    if (reflectionView) {
      reflectionView.innerHTML =
        `<div class="item">Velg uke for å se refleksjonen.</div>`;
    }
  }
});

document.getElementById("openMatchAppBtn")
  ?.addEventListener("click", () => {
    window.location.href = "kamp.html";
  });
  
  window.fixMatch = async function (oldId, newId) {
  const oldRef = doc(db, "matches", oldId);
  const newRef = doc(db, "matches", newId);

  const newSnap = await getDoc(newRef);

  if (!newSnap.exists()) {
    console.error("Ny kamp finnes ikke");
    return;
  }

  const newData = newSnap.data();

  await setDoc(oldRef, {
    ...newData,
    status: "ENDED"
  }, { merge: true });

  await deleteDoc(newRef);

  console.log("Ferdig. Kamp fikset.");
};
