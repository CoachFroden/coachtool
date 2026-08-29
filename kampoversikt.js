import { auth, db } from "./firebase-refleksjon.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, limit, query } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const content = document.getElementById("content");
const pageTitle = document.getElementById("pageTitle");
const upcomingTab = document.getElementById("upcomingTab");
const playedTab = document.getElementById("playedTab");
const backBtn = document.getElementById("backBtn");
const logoutBtn = document.getElementById("logoutBtn");
const errorMsg = document.getElementById("errorMsg");

let matches = [];
let currentView = new URLSearchParams(window.location.search).get("view") === "played" ? "played" : "upcoming";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function matchTimeValue(match) {
  const date = match?.meta?.date;
  if (!date) return Number.POSITIVE_INFINITY;
  const time = match?.meta?.time || "00:00";
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function formatDate(dateString) {
  if (!dateString) return "Dato ikke satt";
  const d = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateString;
  return new Intl.DateTimeFormat("no-NO", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
}

function venueLabel(meta = {}) {
  const venue = meta.venueType || meta.venue;
  const base = venue === "home" ? "Hjemme" : venue === "away" ? "Borte" : "Sted ikke satt";
  return meta.venueName ? `${base} · ${meta.venueName}` : base;
}

function typeLabel(type) {
  if (type === "league" || type === "Seriekamp") return "Seriekamp";
  if (type === "cup" || type === "Cupkamp") return "Cupkamp";
  if (type === "friendly" || type === "Treningskamp") return "Treningskamp";
  return "Kamp";
}

function renderUpcoming() {
  const rows = matches
    .filter(m => String(m.status || "").toUpperCase() !== "ENDED")
    .sort((a, b) => matchTimeValue(a) - matchTimeValue(b));

  pageTitle.textContent = "Kommende kamper";
  upcomingTab.classList.add("active");
  playedTab.classList.remove("active");

  if (!rows.length) {
    content.innerHTML = `<div class="empty">Ingen kommende kamper.</div>`;
    return;
  }

  content.innerHTML = rows.map(m => {
    const meta = m.meta || {};
    return `<article class="matchCard">
      <div class="matchTop">
        <div class="matchTitle">
          <span class="matchType">${esc(typeLabel(meta.type))}</span>
          <h2>${esc(meta.opponent || "Ukjent motstander")}</h2>
          <p>${esc(formatDate(meta.date))}${meta.time ? ` · kl. ${esc(meta.time)}` : ""}<br>${esc(venueLabel(meta))}</p>
        </div>
      </div>
      <div class="actions">
        <button class="lineup" type="button" data-action="lineup" data-id="${esc(m.id)}">Lagoppstilling</button>
        <button class="start" type="button" data-action="start" data-id="${esc(m.id)}">Start kamp</button>
      </div>
    </article>`;
  }).join("");

  content.querySelectorAll("button[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const id = encodeURIComponent(button.dataset.id);
      if (button.dataset.action === "lineup") {
        window.location.href = `kamper.html?matchId=${id}&openLineup=true`;
      } else {
        window.location.href = `kamp.html?matchId=${id}`;
      }
    });
  });
}

function renderPlayed() {
  const rows = matches
    .filter(m => String(m.status || "").toUpperCase() === "ENDED")
    .sort((a, b) => matchTimeValue(b) - matchTimeValue(a));

  pageTitle.textContent = "Spilte kamper";
  playedTab.classList.add("active");
  upcomingTab.classList.remove("active");

  if (!rows.length) {
    content.innerHTML = `<div class="empty">Ingen spilte kamper funnet.</div>`;
    return;
  }

  content.innerHTML = rows.map(m => {
    const meta = m.meta || {};
    const our = Number.isFinite(m?.score?.our) ? m.score.our : "–";
    const their = Number.isFinite(m?.score?.their) ? m.score.their : "–";
    let scoreClass = "draw";
    if (Number.isFinite(m?.score?.our) && Number.isFinite(m?.score?.their)) {
      scoreClass = m.score.our > m.score.their ? "win" : m.score.our < m.score.their ? "loss" : "draw";
    }
    return `<article class="matchCard">
      <div class="matchTop">
        <div class="matchTitle">
          <span class="matchType">${esc(typeLabel(meta.type))}</span>
          <h2>${esc(meta.opponent || "Ukjent motstander")}</h2>
          <p>${esc(formatDate(meta.date))}${meta.time ? ` · kl. ${esc(meta.time)}` : ""}<br>${esc(venueLabel(meta))}</p>
        </div>
        <div class="score ${scoreClass}">${esc(our)}–${esc(their)}</div>
      </div>
    </article>`;
  }).join("");
}

function setView(view) {
  currentView = view;
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  window.history.replaceState({}, "", url);
  if (view === "played") renderPlayed();
  else renderUpcoming();
}

upcomingTab.addEventListener("click", () => setView("upcoming"));
playedTab.addEventListener("click", () => setView("played"));
backBtn.addEventListener("click", () => window.location.href = "oversikt.html");
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const role = userSnap.exists() ? userSnap.data()?.role : null;
    if (role !== "coach" && role !== "assistantCoach") {
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    const snap = await getDocs(query(collection(db, "matches"), limit(100)));
    matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setView(currentView);
  } catch (error) {
    console.error(error);
    content.innerHTML = "";
    errorMsg.textContent = "Kunne ikke hente kampene. Prøv å laste siden på nytt.";
  }
});
