import { db, functions } from "./firebase-refleksjon.js";
import {
  collection,
  doc,
  getDocs,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import {
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

const DEFAULT_SQUAD_RELEASE_MINUTES = 75;
const analyzeOpponentMatch = httpsCallable(functions, "analyzeOpponentMatch", {
  timeout: 300000
});

let enhanceTimer = null;
let currentRows = [];
let isEnhancing = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeFiksId(value) {
  const text = String(value || "").trim();
  const explicit = text.match(/[?&]fiksId=(\d{5,})/i);
  if (explicit) return explicit[1];

  const plain = text.match(/\b(\d{5,})\b/);
  return plain ? plain[1] : "";
}

function analysisDate(value) {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("no-NO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getReleaseDate(match) {
  if (!match?.date || !match?.time) return null;
  const start = new Date(`${match.date}T${match.time}:00`);
  if (Number.isNaN(start.getTime())) return null;

  const offset = Number(match?.squadReleaseMinutes);
  const minutes = Number.isFinite(offset) ? offset : DEFAULT_SQUAD_RELEASE_MINUTES;
  return new Date(start.getTime() - minutes * 60 * 1000);
}

function formatClock(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("no-NO", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusInfo(status) {
  const normalized = String(status || "YELLOW").toUpperCase();
  const map = {
    GREEN: { icon: "✅", label: "Ingen klare avvik", cls: "opponentStatusGreen" },
    YELLOW: { icon: "🟡", label: "Noe bør leses", cls: "opponentStatusYellow" },
    ORANGE: { icon: "⚠️", label: "Bør kontrolleres", cls: "opponentStatusOrange" },
    RED: { icon: "🔴", label: "Tydelig avvik funnet", cls: "opponentStatusRed" }
  };
  return map[normalized] || map.YELLOW;
}

async function loadUpcomingRows() {
  const snap = await getDocs(collection(db, "matches"));
  const rows = [];

  snap.forEach(snapshot => {
    const data = snapshot.data() || {};
    if ((data.status || "").toUpperCase() === "ENDED") return;

    rows.push({
      id: snapshot.id,
      opponent: data?.meta?.opponent || "(ukjent)",
      date: data?.meta?.date || null,
      time: data?.meta?.time || data?.meta?.startTime || "",
      venueType: data?.meta?.venueType || null,
      venueName: data?.meta?.venueName || "",
      type: data?.meta?.type || null,
      fiksId: normalizeFiksId(data?.meta?.fiksId),
      squadReleaseMinutes: data?.meta?.squadReleaseMinutes,
      opponentAnalysis: data?.opponentAnalysis || null
    });
  });

  rows.sort((a, b) => {
    const aHasDate = !!a.date;
    const bHasDate = !!b.date;

    if (aHasDate && bHasDate) return a.date.localeCompare(b.date);
    if (aHasDate && !bHasDate) return -1;
    if (!aHasDate && bHasDate) return 1;
    return (a.opponent || "").localeCompare(b.opponent || "", "no");
  });

  return rows;
}

function getMatchCards() {
  return [...document.querySelectorAll("#entries .matchActions")]
    .map(actions => actions.closest(".item"))
    .filter(Boolean);
}

function buttonLabel(match) {
  if (!match.fiksId) return "🔗 Legg inn FIKS-ID";

  const analysis = match.opponentAnalysis;
  if (analysis?.text) {
    const info = statusInfo(analysis.status);
    return `${info.icon} Motstander sjekket`;
  }

  const release = getReleaseDate(match);
  if (release && Date.now() < release.getTime()) {
    return `🔒 Sjekk fra ca. ${formatClock(release)}`;
  }

  return "🔍 Sjekk motstander";
}

function setButtonState(button, match) {
  const nextLabel = buttonLabel(match);
  if (button.textContent !== nextLabel) {
    button.textContent = nextLabel;
  }

  button.disabled = false;
  button.classList.remove(
    "opponentStatusGreen",
    "opponentStatusYellow",
    "opponentStatusOrange",
    "opponentStatusRed"
  );

  if (match.opponentAnalysis?.text) {
    button.classList.add(statusInfo(match.opponentAnalysis.status).cls);
    return;
  }

  if (!match.fiksId) return;

  const release = getReleaseDate(match);
  if (release && Date.now() < release.getTime()) {
    button.disabled = true;
  }
}

function uniqueSources(citations) {
  const seen = new Set();
  const rows = [];

  for (const citation of citations || []) {
    const url = String(citation?.url || "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    rows.push(citation);
  }

  return rows;
}

function renderCitedText(text, citations) {
  const sourceText = String(text || "");
  const ranged = (citations || [])
    .filter(c => Number.isFinite(c?.startIndex) && Number.isFinite(c?.endIndex))
    .filter(c => c.startIndex >= 0 && c.endIndex > c.startIndex && c.endIndex <= sourceText.length)
    .sort((a, b) => a.startIndex - b.startIndex);

  if (!ranged.length) {
    return escapeHtml(sourceText).replaceAll("\n", "<br>");
  }

  let cursor = 0;
  let html = "";

  for (const citation of ranged) {
    if (citation.startIndex < cursor) continue;

    html += escapeHtml(sourceText.slice(cursor, citation.startIndex));
    const citedText = sourceText.slice(citation.startIndex, citation.endIndex) || "[kilde]";
    html += `<a class="opponentInlineSource" href="${escapeHtml(citation.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(citedText)}</a>`;
    cursor = citation.endIndex;
  }

  html += escapeHtml(sourceText.slice(cursor));
  return html.replaceAll("\n", "<br>");
}

function renderAnalysisPanel(card, match, analysis) {
  card.querySelector(".opponentAnalysisPanel")?.remove();

  const info = statusInfo(analysis?.status);
  const panel = document.createElement("div");
  panel.className = `opponentAnalysisPanel ${info.cls}`;

  const generated = analysisDate(analysis?.generatedAt);
  const sources = uniqueSources(analysis?.citations);
  const sourceHtml = sources.length
    ? `
      <div class="opponentSources">
        <div class="opponentAnalysisTitle">Kilder</div>
        ${sources.map((source, index) => `
          <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
            ${index + 1}. ${escapeHtml(source.title || source.url)}
          </a>
        `).join("")}
      </div>
    `
    : `<div class="opponentAnalysisHint">Ingen klikkbare kilder ble returnert.</div>`;

  panel.innerHTML = `
    <div class="opponentAnalysisHeader">
      <div>
        <div class="opponentAnalysisTitle">${info.icon} ${escapeHtml(info.label)}</div>
        <div class="opponentAnalysisHint">
          ${generated ? `Sjekket ${escapeHtml(generated)}` : "Sjekket nå"}
          ${match.fiksId ? ` · FIKS ${escapeHtml(match.fiksId)}` : ""}
        </div>
      </div>
      <button class="opponentCloseBtn" type="button" aria-label="Lukk">×</button>
    </div>

    <div class="opponentAnalysisText">
      ${renderCitedText(analysis?.text || "", analysis?.citations || [])}
    </div>

    ${sourceHtml}

    <div class="opponentAnalysisActions">
      <button class="opponentRerunBtn" type="button">🔄 Kjør ny kontroll</button>
    </div>
  `;

  panel.addEventListener("click", event => event.stopPropagation());
  panel.querySelector(".opponentCloseBtn")?.addEventListener("click", event => {
    event.stopPropagation();
    panel.remove();
  });

  panel.querySelector(".opponentRerunBtn")?.addEventListener("click", async event => {
    event.stopPropagation();
    await runAnalysis(match, card, true);
  });

  card.appendChild(panel);
}

async function askForFiksId(match, button) {
  const value = window.prompt(
    `Lim inn FIKS kamp-ID eller hele fotball.no-lenken for ${match.opponent}:`,
    match.fiksId || ""
  );

  if (value === null) return false;

  const fiksId = normalizeFiksId(value);
  if (!fiksId) {
    window.alert("Jeg fant ingen gyldig FIKS-ID i det du limte inn.");
    return false;
  }

  await updateDoc(doc(db, "matches", match.id), {
    "meta.fiksId": fiksId
  });

  match.fiksId = fiksId;
  setButtonState(button, match);

  const release = getReleaseDate(match);
  if (release && Date.now() < release.getTime()) {
    window.alert(
      `FIKS-ID er lagret. Motstandersjekken blir tilgjengelig ca. ${formatClock(release)}.`
    );
  }

  return true;
}

async function runAnalysis(match, card, force = false) {
  const button = card.querySelector(".opponentCheckBtn");
  if (!button) return;

  if (!match.fiksId) {
    const saved = await askForFiksId(match, button);
    if (!saved) return;
  }

  const release = getReleaseDate(match);
  if (!force && release && Date.now() < release.getTime()) {
    setButtonState(button, match);
    return;
  }

  button.disabled = true;
  button.textContent = "⏳ Sjekker motstander…";
  card.querySelector(".opponentAnalysisPanel")?.remove();

  const loading = document.createElement("div");
  loading.className = "opponentAnalysisLoading";
  loading.textContent = "Går gjennom offentlig kamptropp, spillerhistorikk og gjeldende NFF-regler. Dette kan ta litt tid…";
  loading.addEventListener("click", event => event.stopPropagation());
  card.appendChild(loading);

  try {
    const result = await analyzeOpponentMatch({
      matchId: match.id,
      fiksId: match.fiksId
    });

    const analysis = result?.data || null;
    if (!analysis?.text) throw new Error("Analysen kom tilbake uten innhold.");

    match.opponentAnalysis = analysis;
    loading.remove();
    setButtonState(button, match);
    renderAnalysisPanel(card, match, analysis);
  } catch (error) {
    loading.remove();
    setButtonState(button, match);

    const message = error?.message || "Kunne ikke gjennomføre motstandersjekken.";
    window.alert(message);
    console.error("Motstandersjekk:", error);
  }
}

async function handleCheckClick(event, match, card) {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget;

  if (!match.fiksId) {
    const saved = await askForFiksId(match, button);
    if (!saved) return;
  }

  if (match.opponentAnalysis?.text) {
    const existing = card.querySelector(".opponentAnalysisPanel");
    if (existing) {
      existing.remove();
    } else {
      renderAnalysisPanel(card, match, match.opponentAnalysis);
    }
    return;
  }

  await runAnalysis(match, card);
}

async function enhanceUpcomingCards() {
  if (isEnhancing) return;

  const selected = document.getElementById("selectedPlayer")?.textContent || "";
  if (!selected.includes("Kommende kamper")) return;

  const cards = getMatchCards();
  if (!cards.length) return;

  isEnhancing = true;
  try {
    currentRows = await loadUpcomingRows();

    cards.forEach((card, index) => {
      const match = currentRows[index];
      if (!match) return;

      let button = card.querySelector(".opponentCheckBtn");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "opponentCheckBtn";
        card.appendChild(button);
      }

      button.onclick = event => handleCheckClick(event, match, card);
      setButtonState(button, match);
    });
  } catch (error) {
    console.error("Kunne ikke klargjøre motstandersjekk:", error);
  } finally {
    isEnhancing = false;
  }
}

function scheduleEnhance() {
  clearTimeout(enhanceTimer);
  enhanceTimer = setTimeout(() => {
    enhanceUpcomingCards();
  }, 120);
}

const observer = new MutationObserver(scheduleEnhance);
observer.observe(document.body, {
  childList: true,
  subtree: true
});

setInterval(() => {
  document.querySelectorAll(".opponentCheckBtn").forEach((button, index) => {
    const match = currentRows[index];
    if (match) setButtonState(button, match);
  });
}, 30000);

scheduleEnhance();
