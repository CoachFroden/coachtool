import { db } from "./firebase-refleksjon.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const heroCard = document.querySelector(".heroCard");
const heroCopy = heroCard?.querySelector(".heroCopy");
const heroButton = document.getElementById("openMatchAppBtn");

function formatDateNo(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return "Dato ikke satt";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}.${month}.${year}`;
}

function venueLabel(match) {
  const venueType = match?.meta?.venueType || match?.meta?.venue;
  if (venueType === "home") return "Hjemme";
  if (venueType === "away") return "Borte";
  return "Sted ikke satt";
}

function typeLabel(type) {
  if (type === "league" || type === "Seriekamp") return "SERIEKAMP";
  if (type === "cup" || type === "Cupkamp") return "CUPKAMP";
  if (type === "friendly" || type === "Treningskamp") return "TRENINGSKAMP";
  return "NESTE KAMP";
}

function matchSortValue(match) {
  const date = match?.meta?.date || "9999-12-31";
  const time = match?.meta?.time || "23:59";
  return `${date}T${time}`;
}

async function loadNextMatchHero() {
  if (!heroCopy || !heroButton) return;

  try {
    const snap = await getDocs(collection(db, "matches"));
    const matches = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const status = String(data.status || "").toUpperCase();
      if (status === "ENDED") return;
      matches.push({ id: docSnap.id, ...data });
    });

    matches.sort((a, b) => matchSortValue(a).localeCompare(matchSortValue(b)));
    const next = matches[0];

    if (!next) {
      heroCopy.innerHTML = `
        <span class="livePill"><i></i> KAMPER</span>
        <h2>Ingen kommende<br><span>kamper registrert.</span></h2>
        <p>Legg inn neste kamp under Kamper når terminlisten er klar.</p>
      `;
      heroButton.innerHTML = `
        <span class="heroBtnIcon">＋</span>
        <span><small>Kamper</small><strong>Gå til kommende kamper</strong></span>
        <b>→</b>
      `;
      heroButton.onclick = () => {
        document.getElementById("tabMatch")?.click();
        const select = document.getElementById("matchSelect");
        if (select) {
          select.value = "upcoming";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      };
      return;
    }

    const opponent = next?.meta?.opponent || "Ukjent motstander";
    const date = formatDateNo(next?.meta?.date);
    const time = next?.meta?.time ? ` · kl. ${next.meta.time}` : "";
    const venue = venueLabel(next);
    const venueName = next?.meta?.venueName ? ` · ${next.meta.venueName}` : "";

    heroCopy.innerHTML = `
      <span class="livePill"><i></i> ${typeLabel(next?.meta?.type)}</span>
      <h2>Neste kamp<br><span>mot ${opponent}</span></h2>
      <p>${date}${time} · ${venue}${venueName}</p>
    `;

    heroButton.innerHTML = `
      <span class="heroBtnIcon">⚽</span>
      <span><small>Neste kamp</small><strong>Åpne kamp mot ${opponent}</strong></span>
      <b>→</b>
    `;

    heroButton.onclick = () => {
      window.location.href = `kamp.html?matchId=${encodeURIComponent(next.id)}`;
    };
  } catch (error) {
    console.error("Kunne ikke laste neste kamp i oversikten:", error);
  }
}

loadNextMatchHero();
