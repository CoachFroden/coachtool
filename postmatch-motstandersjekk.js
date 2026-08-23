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

const analyzeOpponentPostMatch = httpsCallable(functions, "analyzeOpponentPostMatch", {
  timeout: 300000
});

let enhanceTimer = null;
let isEnhancing = false;
let endedRows = [];

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

function formatDateStringNo(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
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

async function loadEndedRows() {
  const snap = await getDocs(collection(db, "matches"));
  const rows = [];

  snap.forEach(snapshot => {
    const data = snapshot.data() || {};
    if ((data.status || "").toUpperCase() !== "ENDED") return;

    rows.push({
      id: snapshot.id,
      opponent: data?.meta?.opponent || "(ukjent)",
      date: data?.meta?.date || null,
      time: data?.meta?.time || data?.meta?.startTime || "",
      type: data?.meta?.type || null,
      fiksId: normalizeFiksId(data?.meta?.fiksId),
      opponentPostAnalysis: data?.opponentPostAnalysis || null
    });
  });

  rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return rows;
}

function getPlayedCards() {
  return [...document.querySelectorAll("#playedMatchesContainer > .item")];
}

function findMatchForCard(card) {
  const opponent = card.querySelector(".itemTitle")?.textContent?.trim() || "";
  const sub = card.querySelector(".itemSub")?.textContent || "";

  return endedRows.find(match => {
    const sameOpponent = match.opponent === opponent;
    const dateText = formatDateStringNo(match.date);
    const sameDate = !dateText || sub.includes(dateText);
    return sameOpponent && sameDate;
  }) || null;
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

function buttonLabel(match) {
  if (!match.fiksId) return "🔗 Legg inn FIKS-ID for ettersjekk";

  if (match.opponentPostAnalysis?.text) {
    const info = statusInfo(match.opponentPostAnalysis.status);
    return `${info.icon} Ettersjekk ferdig`;
  }

  return "🔍 Ettersjekk motstander";
}

function setButtonState(button, match) {
  if (button.dataset.loading === "true") {
    button.disabled = true;
    button.textContent = "⏳ Ettersjekker motstander…";
    return;
  }

  button.disabled = false;
  button.textContent = buttonLabel(match);
  button.classList.remove(
    "opponentStatusGreen",
    "opponentStatusYellow",
    "opponentStatusOrange",
    "opponentStatusRed"
  );

  if (match.opponentPostAnalysis?.text) {
    button.classList.add(statusInfo(match.opponentPostAnalysis.status).cls);
  }
}

function renderAnalysisPanel(card, match, analysis) {
  card.querySelector(".opponentPostAnalysisPanel")?.remove();

  const info = statusInfo(analysis?.status);
  const panel = document.createElement("div");
  panel.className = `opponentAnalysisPanel opponentPostAnalysisPanel ${info.cls}`;

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
        <div class="opponentAnalysisTitle">${info.icon} Ettersjekk: ${escapeHtml(info.label)}</div>
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
      <button class="opponentPostRerunBtn" type="button">🔄 Kjør ny ettersjekk</button>
    </div>
  `;

  panel.addEventListener("click", event => event.stopPropagation());
  panel.querySelector(".opponentCloseBtn")?.addEventListener("click", event => {
    event.stopPropagation();
    panel.remove();
  });

  panel.querySelector(".opponentPostRerunBtn")?.addEventListener("click", async event => {
    event.stopPropagation();
    await runPostAnalysis(match, card, true);
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
  return true;
}

async function runPostAnalysis(match, card, force = false) {
  const button = card.querySelector(".opponentPostCheckBtn");
  if (!button) return;

  if (!match.fiksId) {
    const saved = await askForFiksId(match, button);
    if (!saved) return;
  }

  if (!force && match.opponentPostAnalysis?.text) {
    renderAnalysisPanel(card, match, match.opponentPostAnalysis);
    return;
  }

  button.dataset.loading = "true";
  setButtonState(button, match);
  card.querySelector(".opponentPostAnalysisPanel")?.remove();

  const loading = document.createElement("div");
  loading.className = "opponentAnalysisLoading opponentPostAnalysisLoading";
  loading.textContent = "Sjekker endelig offentlig kamprapport, spillerhistorikk og gjeldende NFF-regler…";
  loading.addEventListener("click", event => event.stopPropagation());
  card.appendChild(loading);

  try {
    const result = await analyzeOpponentPostMatch({
      matchId: match.id,
      fiksId: match.fiksId
    });

    const analysis = result?.data || null;
    if (!analysis?.text) throw new Error("Ettersjekken kom tilbake uten innhold.");

    match.opponentPostAnalysis = analysis;
    loading.remove();
    delete button.dataset.loading;
    setButtonState(button, match);
    renderAnalysisPanel(card, match, analysis);
  } catch (error) {
    loading.remove();
    delete button.dataset.loading;
    setButtonState(button, match);

    const message = error?.message || "Kunne ikke gjennomføre ettersjekken.";
    window.alert(message);
    console.error("Ettersjekk motstander:", error);
  }
}

async function handleClick(event, match, card) {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget;

  if (!match.fiksId) {
    const saved = await askForFiksId(match, button);
    if (!saved) return;
  }

  if (match.opponentPostAnalysis?.text) {
    const existing = card.querySelector(".opponentPostAnalysisPanel");
    if (existing) {
      existing.remove();
    } else {
      renderAnalysisPanel(card, match, match.opponentPostAnalysis);
    }
    return;
  }

  await runPostAnalysis(match, card);
}

async function enhancePlayedCards() {
  if (isEnhancing) return;

  const selected = document.getElementById("selectedPlayer")?.textContent || "";
  if (!selected.includes("Spilte kamper")) return;

  const cards = getPlayedCards();
  if (!cards.length) return;

  isEnhancing = true;
  try {
    endedRows = await loadEndedRows();

    cards.forEach(card => {
      const match = findMatchForCard(card);
      if (!match) return;

      let button = card.querySelector(".opponentPostCheckBtn");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "opponentCheckBtn opponentPostCheckBtn";
        card.appendChild(button);
      }

      button.onclick = event => handleClick(event, match, card);
      setButtonState(button, match);
    });
  } catch (error) {
    console.error("Kunne ikke klargjøre ettersjekk:", error);
  } finally {
    isEnhancing = false;
  }
}

function scheduleEnhance() {
  clearTimeout(enhanceTimer);
  enhanceTimer = setTimeout(() => {
    enhancePlayedCards();
  }, 120);
}

const observer = new MutationObserver(scheduleEnhance);
observer.observe(document.body, {
  childList: true,
  subtree: true
});

scheduleEnhance();
