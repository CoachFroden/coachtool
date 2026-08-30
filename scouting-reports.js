const container = document.getElementById("trackedMatchReports");
const meta = document.getElementById("trackedReportsMeta");
const refreshButton = document.getElementById("refreshTrackedReports");
const opponentTitle = document.getElementById("opponentTitle");

let reportData = null;

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("no")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function formatDate(date, time) {
  if (!date) return "Dato ikke satt";
  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(parsed.getTime())) return `${date}${time ? ` ${time}` : ""}`;
  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: time ? "2-digit" : undefined,
    minute: time ? "2-digit" : undefined
  }).format(parsed);
}

function statusText(status) {
  return ({
    upcoming: "Planlagt",
    waiting: "Venter på kamprapport",
    complete: "Rapport klar"
  })[status] || "Ukjent status";
}

function profileForCurrentOpponent() {
  const title = normalize(opponentTitle?.textContent);
  if (!title || !Array.isArray(reportData?.profiles)) return null;

  return reportData.profiles.find(profile => {
    const aliases = [profile.opponent, ...(profile.aliases || [])].map(normalize);
    return aliases.some(alias => alias && (title === alias || title.includes(alias) || alias.includes(title)));
  }) || null;
}

function playerName(entry) {
  return typeof entry === "string" ? entry : entry?.name || "";
}

function renderSquad(match) {
  if (!Array.isArray(match.squad) || !match.squad.length) {
    return `<div class="report-empty">Tropp/startoppstilling fylles når den er offentlig registrert.</div>`;
  }

  const starters = match.squad.filter(player => typeof player === "object" && player.role === "starter");
  const bench = match.squad.filter(player => typeof player !== "object" || player.role !== "starter");
  const block = (title, players) => players.length ? `
    <div class="report-subblock">
      <strong>${escapeHtml(title)}</strong>
      <div class="report-player-chips">${players.map(player => {
        const name = playerName(player);
        const extra = typeof player === "object" && player.note ? ` <small>${escapeHtml(player.note)}</small>` : "";
        return `<span>${escapeHtml(name)}${extra}</span>`;
      }).join("")}</div>
    </div>` : "";

  return `${block("Startere", starters)}${block(starters.length ? "Innbyttere / øvrig tropp" : "Spillere", bench)}`;
}

function renderGoals(match) {
  if (!Array.isArray(match.goals) || !match.goals.length) {
    return `<div class="report-empty">Ingen registrerte målscorere i rapporten ennå.</div>`;
  }

  return `<ul class="report-list">${match.goals.map(goal => {
    if (typeof goal === "string") return `<li>${escapeHtml(goal)}</li>`;
    const minute = goal.minute ? `${escapeHtml(goal.minute)}' · ` : "";
    const team = goal.team ? ` <small>(${escapeHtml(goal.team)})</small>` : "";
    return `<li>${minute}${escapeHtml(goal.player || "Ukjent målscorer")}${team}</li>`;
  }).join("")}</ul>`;
}

function renderHigherTeamPlayers(match) {
  if (!Array.isArray(match.higherTeamPlayers) || !match.higherTeamPlayers.length) {
    return `<div class="report-empty">Ingen krysskoblinger mot G14-1/G16 registrert ennå.</div>`;
  }

  return `<ul class="report-list">${match.higherTeamPlayers.map(player => {
    if (typeof player === "string") return `<li>${escapeHtml(player)}</li>`;
    return `<li><strong>${escapeHtml(player.name || "")}</strong>${player.note ? ` – ${escapeHtml(player.note)}` : ""}</li>`;
  }).join("")}</ul>`;
}

function renderTakeaways(match) {
  if (!Array.isArray(match.takeaways) || !match.takeaways.length) {
    return `<div class="report-empty">Taktiske læringspunkter fylles når kampen er analysert.</div>`;
  }

  return `<ul class="report-list report-takeaways">${match.takeaways.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderSources(match) {
  const urls = (match.sourceUrls || []).map(safeUrl).filter(Boolean);
  if (!urls.length) return "";
  return `<div class="report-sources">${urls.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Offentlig kilde${urls.length > 1 ? ` ${index + 1}` : ""}</a>`).join(" · ")}</div>`;
}

function render() {
  if (!container) return;
  const profile = profileForCurrentOpponent();

  if (!profile) {
    container.innerHTML = `<div class="empty">Ingen fulgte kamper er satt opp for denne motstanderen ennå.</div>`;
    if (meta) meta.textContent = "";
    return;
  }

  const matches = [...(profile.matches || [])].sort((a, b) => `${a.date || ""}${a.time || ""}`.localeCompare(`${b.date || ""}${b.time || ""}`));
  if (meta) {
    const updated = reportData?.updatedAt ? new Date(reportData.updatedAt) : null;
    meta.textContent = updated && !Number.isNaN(updated.getTime())
      ? `Rapportfil sist oppdatert ${new Intl.DateTimeFormat("nb-NO", { dateStyle: "short", timeStyle: "short" }).format(updated)}`
      : "";
  }

  container.innerHTML = matches.map(match => `
    <article class="tracked-report ${escapeHtml(match.status || "upcoming")}">
      <div class="report-head">
        <div>
          <div class="report-date">${escapeHtml(formatDate(match.date, match.time))} · ${escapeHtml(match.teamScope || "")}</div>
          <h3>${escapeHtml(match.home || "")} – ${escapeHtml(match.away || "")}</h3>
          <div class="report-competition">${escapeHtml(match.competition || "")}${match.venue ? ` · ${escapeHtml(match.venue)}` : ""}</div>
        </div>
        <div class="report-status-wrap">
          ${match.score ? `<strong class="report-score">${escapeHtml(match.score)}</strong>` : ""}
          <span class="report-status">${escapeHtml(statusText(match.status))}</span>
        </div>
      </div>

      <p class="report-purpose">${escapeHtml(match.purpose || "")}</p>
      ${match.summary ? `<div class="report-summary">${escapeHtml(match.summary)}</div>` : ""}

      <details ${match.status === "complete" ? "open" : ""}>
        <summary>Spillere og kampdetaljer</summary>
        <div class="report-grid">
          <section><h4>Tropp / oppstilling</h4>${renderSquad(match)}</section>
          <section><h4>Mål</h4>${renderGoals(match)}</section>
          <section><h4>Spillere brukt høyere</h4>${renderHigherTeamPlayers(match)}</section>
          <section><h4>Hva betyr det for oss?</h4>${renderTakeaways(match)}</section>
        </div>
      </details>
      ${renderSources(match)}
    </article>
  `).join("");
}

async function loadReports() {
  if (!container) return;
  if (refreshButton) refreshButton.disabled = true;
  container.innerHTML = `<div class="empty">Henter kamprapporter …</div>`;

  try {
    const response = await fetch(`./scouting-reports.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    reportData = await response.json();
    render();
  } catch (error) {
    console.warn("Kunne ikke hente scouting-rapporter", error);
    container.innerHTML = `<div class="roster-alert"><strong>Kunne ikke hente rapportene.</strong><br>Prøv Oppdater på nytt.</div>`;
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

refreshButton?.addEventListener("click", loadReports);

if (opponentTitle) {
  new MutationObserver(render).observe(opponentTitle, { childList: true, subtree: true, characterData: true });
}

loadReports();
