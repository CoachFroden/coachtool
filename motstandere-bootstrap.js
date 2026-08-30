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

const VERSION = "2026-08-30-mathopen-v2";
const OPPONENT_NAME = "Mathopen/Vadmyra 2";

const SOURCES = {
  sebastian: "https://www.fotball.no/fotballdata/person/profil/?fiksId=4107502",
  torfinn: "https://www.fotball.no/fotballdata/person/profil/?fiksId=4107496",
  orion: "https://www.fotball.no/fotballdata/person/profil/?fiksId=4071030",
  recent: "https://www.fotball.no/fotballdata/kamp/?fiksId=9185058",
  sixThree: "https://www.fotball.no/fotballdata/kamp/?fiksId=9067088",
  fourOne: "https://www.fotball.no/fotballdata/kamp/?fiksId=9067108",
  firstTeam: "https://www.fotball.no/fotballdata/kamp/?fiksId=9067278",
  g16: "https://www.fotball.no/fotballdata/lag/hjem/?fiksId=135050&underside=tabeller"
};

const PUBLIC_ANALYSIS = {
  name: OPPONENT_NAME,
  level: "strong",
  reinforcementRisk: "high",
  notes: "Offentlig NFF/Fotball.no-data viser at Mathopen/Vadmyra 2 har flere spillere som brukes både på G14-2 og G14-1, og enkelte også på G16. Sebastian Milde Berland har 16 mål på 6 G14-2-kamper i 2026. Torfinn Steine Faugstad har 3 mål på 3 G14-2-kamper og 5 mål på 9 kamper for G14-1. Orion Jakobsen Evjen har 4 mål på 5 G14-2-kamper og 4 mål på 8 kamper for G14-1. Laget kan derfor bli betydelig sterkere dersom flere av spillerne som normalt brukes høyere opp er tilgjengelige.",
  teamPlan: "Sjekk offentlig kamptropp før avspark. Første prioritet er å identifisere Sebastian Berland, Torfinn Faugstad og Orion Evjen. Dersom flere G14-1/G16-spillere er med, behandle laget som forsterket: vær kompakte sentralt, unngå enkle balltap foran egen bakre firer og ha tydelig sikring når backene går. Ikke lås kampplanen til antatt formasjon; bruk de første minuttene til å bekrefte roller og hvor måltruslene faktisk starter.",
  players: [
    {
      name: "Sebastian Milde Berland",
      position: "Angrep / offensiv",
      priority: "red",
      reason: "16 mål på 6 G14-2-kamper i 2026 og 5 mål på 8 kamper for G14-1. Scorede også Mathopen/Vadmyra 2 sitt mål mot Austevoll 2 22. august.",
      observation: "Den klart høyeste dokumenterte målproduksjonen på toerlaget. Har også gjentatt bruk på førstelaget.",
      plan: "Ikke gi fri vending eller mottak rettvendt nær boksen. Sørg for sikring bak nærmeste forsvarer og vær ekstra nøye med markering i boksen.",
      source: "NFF/Fotball.no – offentlig spillerstatistikk og kamprapporter",
      sourceUrl: SOURCES.sebastian
    },
    {
      name: "Torfinn Steine Faugstad",
      position: "Angrep / offensiv",
      priority: "red",
      reason: "3 mål på 3 G14-2-kamper og 5 mål på 9 kamper for G14-1 i 2026. Scorede to ganger mot Lyngbø 2.",
      observation: "Høy målrate på toerlaget og fast bruk på nivået over gjør ham til et tydelig forsterkningssignal dersom han er i troppen.",
      plan: "Identifiser posisjonen før avspark. Hindre rettvendte mottak rundt boksen og ha forsvarsside tidlig ved innlegg og andreballer.",
      source: "NFF/Fotball.no – offentlig spillerstatistikk",
      sourceUrl: SOURCES.torfinn
    },
    {
      name: "Orion Jakobsen Evjen",
      position: "Offensiv / kant",
      priority: "red",
      reason: "4 mål på 5 G14-2-kamper og 4 mål på 8 kamper for G14-1 i 2026. Scorede to ganger i 6–3-seieren mot Loddefjord/Olsvik/Kjøkkelvik 3 og scorede også mot Lyngbø 2.",
      observation: "Går igjen på begge G14-lag og har målbidrag på begge nivåer.",
      plan: "Ikke la ham få enkelt førstetouch framover. Ha sikring på utsiden og vær klar for løp inn bak back eller inn i mellomrom.",
      source: "NFF/Fotball.no – offentlig spillerstatistikk og kamprapporter",
      sourceUrl: SOURCES.orion
    },
    {
      name: "Simon Rong Sværen",
      position: "Midtbane / offensiv",
      priority: "orange",
      reason: "Har spilt for både G14-1 og G14-2 og har 8 registrerte kamper og 1 mål for Vadmyra/Mathopen 2 på G16-nivå i 2026.",
      observation: "Gjenta bruk på G16 er et tydelig tegn på nivå og gjør ham viktig å flagge hvis han er med på toerlaget.",
      plan: "Finn rollen hans tidlig og ikke gi gratis tid sentralt. Press mottak med sikring bak første pressledd.",
      source: "NFF/Fotball.no – offentlig G16-statistikk",
      sourceUrl: SOURCES.g16
    },
    {
      name: "Isak Arthur Soedermann",
      position: "Midtbane / sentral",
      priority: "orange",
      reason: "Går igjen for G14-1 og G14-2 og har 8 registrerte G16-kamper i 2026. Har også vært kaptein for G14-2 i offentlige kamprapporter.",
      observation: "Kombinasjonen av kapteinsrolle, førstelagsbruk og G16-kamper tyder på en sentral spiller når han er tilgjengelig.",
      plan: "Steng sentrale pasningslinjer og unngå at han får styre med blikket framover. Vær tett nok til å hindre enkel vending.",
      source: "NFF/Fotball.no – G14-kamprapporter og offentlig G16-statistikk",
      sourceUrl: SOURCES.g16
    }
  ]
};

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("no")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function dateValue(match) {
  const date = match?.meta?.date || "";
  const time = match?.meta?.time || match?.meta?.startTime || "00:00";
  if (!date) return Number.POSITIVE_INFINITY;
  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function makeOpponent() {
  return {
    id: crypto.randomUUID(),
    name: OPPONENT_NAME,
    level: "unknown",
    reinforcementRisk: "unknown",
    notes: "",
    teamPlan: "",
    players: [],
    linkedMatches: [],
    publicResearchVersion: ""
  };
}

function publicPlayer(seed) {
  return {
    id: crypto.randomUUID(),
    ...seed,
    updatedAt: new Date().toISOString(),
    seededFromPublicSource: true,
    publicResearchVersion: VERSION
  };
}

async function seedForUser(uid) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const currentScouting = userSnap.exists() ? userSnap.data()?.scouting : null;
  const scouting = currentScouting?.opponents && Array.isArray(currentScouting.opponents)
    ? structuredClone(currentScouting)
    : { opponents: [] };

  let opponent = scouting.opponents.find(item => normalize(item?.name) === normalize(OPPONENT_NAME));
  if (!opponent) {
    opponent = makeOpponent();
    scouting.opponents.push(opponent);
  }

  if (!opponent.level || opponent.level === "unknown") opponent.level = PUBLIC_ANALYSIS.level;
  if (!opponent.reinforcementRisk || opponent.reinforcementRisk === "unknown") {
    opponent.reinforcementRisk = PUBLIC_ANALYSIS.reinforcementRisk;
  }

  const previousWasPublic = String(opponent.publicResearchVersion || "").startsWith("2026-08-30-mathopen");
  if (!opponent.notes?.trim() || previousWasPublic) opponent.notes = PUBLIC_ANALYSIS.notes;
  if (!opponent.teamPlan?.trim() || previousWasPublic) opponent.teamPlan = PUBLIC_ANALYSIS.teamPlan;
  if (!Array.isArray(opponent.players)) opponent.players = [];
  if (!Array.isArray(opponent.linkedMatches)) opponent.linkedMatches = [];

  for (const seed of PUBLIC_ANALYSIS.players) {
    const index = opponent.players.findIndex(player => normalize(player?.name) === normalize(seed.name));
    if (index < 0) {
      opponent.players.push(publicPlayer(seed));
      continue;
    }

    const existing = opponent.players[index];
    if (existing.seededFromPublicSource || String(existing.publicResearchVersion || "").startsWith("2026-08-30-mathopen")) {
      opponent.players[index] = { ...existing, ...seed, seededFromPublicSource: true, publicResearchVersion: VERSION, updatedAt: new Date().toISOString() };
    }
  }

  opponent.publicResearchVersion = VERSION;

  const matchesSnap = await getDocs(query(collection(db, "matches"), limit(100)));
  const matches = matchesSnap.docs.map(snap => ({ id: snap.id, ...snap.data() }));
  const now = Date.now() - 12 * 60 * 60 * 1000;
  const upcoming = matches
    .filter(match => String(match.status || "").toUpperCase() !== "ENDED")
    .filter(match => dateValue(match) >= now)
    .filter(match => normalize(match?.meta?.opponent) === normalize(OPPONENT_NAME))
    .sort((a, b) => dateValue(a) - dateValue(b));

  for (const match of upcoming) {
    const linked = {
      matchId: match.id,
      date: match.meta?.date || "",
      time: match.meta?.time || match.meta?.startTime || "",
      venue: match.meta?.venueType || match.meta?.venue || "",
      venueName: match.meta?.venueName || "",
      type: match.meta?.type || ""
    };
    const linkedIndex = opponent.linkedMatches.findIndex(item => item?.matchId === match.id);
    if (linkedIndex >= 0) opponent.linkedMatches[linkedIndex] = linked;
    else opponent.linkedMatches.push(linked);
  }

  await setDoc(userRef, {
    scouting,
    scoutingUpdatedAt: serverTimestamp()
  }, { merge: true });

  const nextMatch = upcoming[0];
  if (nextMatch) {
    try {
      await setDoc(doc(db, "matches", nextMatch.id), {
        opponentAnalysis: {
          opponent: OPPONENT_NAME,
          publicResearchVersion: VERSION,
          level: PUBLIC_ANALYSIS.level,
          reinforcementRisk: PUBLIC_ANALYSIS.reinforcementRisk,
          summary: PUBLIC_ANALYSIS.notes,
          teamPlan: PUBLIC_ANALYSIS.teamPlan,
          players: PUBLIC_ANALYSIS.players.map(player => ({
            name: player.name,
            position: player.position,
            priority: player.priority,
            reason: player.reason,
            observation: player.observation,
            plan: player.plan,
            source: player.source,
            sourceUrl: player.sourceUrl
          })),
          sources: Object.values(SOURCES),
          updatedAt: serverTimestamp()
        }
      }, { merge: true });
    } catch (error) {
      console.warn("Kunne ikke lagre motstanderanalysen direkte på kampen", error);
    }
  }
}

let started = false;
onAuthStateChanged(auth, async user => {
  if (started) return;
  started = true;

  if (user) {
    try {
      await seedForUser(user.uid);
    } catch (error) {
      console.warn("Kunne ikke oppdatere offentlig Mathopen/Vadmyra-analyse", error);
    }
  }

  await import("./motstandere.js?v=20260830-3");
});
