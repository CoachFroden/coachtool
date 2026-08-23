const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { OpenAI } = require("openai");

function cleanFiksId(value) {
  const text = String(value || "").trim();
  const explicit = text.match(/[?&]fiksId=(\d{5,})/i);
  if (explicit) return explicit[1];
  const plain = text.match(/\b(\d{5,})\b/);
  return plain ? plain[1] : "";
}

function firstOutputText(response) {
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        return {
          text: part.text,
          annotations: Array.isArray(part.annotations) ? part.annotations : []
        };
      }
    }
  }

  return {
    text: String(response?.output_text || ""),
    annotations: []
  };
}

function normalizeCitations(annotations) {
  const rows = [];

  for (const annotation of annotations || []) {
    const citation = annotation?.url_citation || annotation;
    if (citation?.type && citation.type !== "url_citation") continue;

    const url = String(citation?.url || "").trim();
    if (!url) continue;

    rows.push({
      url,
      title: String(citation?.title || url),
      startIndex: Number.isFinite(citation?.start_index) ? citation.start_index : null,
      endIndex: Number.isFinite(citation?.end_index) ? citation.end_index : null
    });
  }

  return rows.slice(0, 50);
}

function parseHeadlineStatus(text) {
  const statusMatch = String(text || "").match(/^STATUS:\s*(GREEN|YELLOW|ORANGE|RED)/im);
  const findingsMatch = String(text || "").match(/^FUNN:\s*(\d+)/im);

  return {
    status: statusMatch ? statusMatch[1] : "YELLOW",
    findings: findingsMatch ? Number(findingsMatch[1]) : null
  };
}

function buildPrompt({ matchId, fiksId, match, manualFiksData }) {
  const meta = match?.meta || {};
  const matchDate = meta.date || "ukjent dato";
  const matchTime = meta.startTime || meta.time || "ukjent klokkeslett";
  const opponent = meta.opponent || "ukjent motstander";
  const ourTeam = meta.ourTeam || "Samnanger";
  const venue = meta.venueName || "ukjent bane";
  const competitionType = meta.type || "ukjent kamptype";
  const seasonMatch = String(matchDate).match(/^(\d{4})-/);
  const season = seasonMatch ? seasonMatch[1] : new Date().getFullYear();
  const publicMatchUrl = `https://www.fotball.no/fotballdata/kamp/?fiksId=${fiksId}`;

  return `
Du er en regelkontrollør for norsk breddefotball. Gjør en grundig, kildebasert motstandersjekk av denne kampen.

KAMP
- App-kamp-ID: ${matchId}
- FIKS-kamp-ID: ${fiksId}
- Offentlig kamp-URL: ${publicMatchUrl}
- Vårt lag: ${ourTeam}
- Motstander: ${opponent}
- Dato: ${matchDate}
- Klokkeslett: ${matchTime}
- Bane: ${venue}
- Kamptype: ${competitionType}
- Sesong: ${season}
- Krets: NFF Hordaland

DATAGRENSER
- Bruk bare offentlig tilgjengelig informasjon du finner på fotball.no/NFF-sider.
- Ikke gjett fødselsår, dispensasjoner, faktisk deltakelse eller identitet hvis det ikke kan dokumenteres.
- Opplysninger fra FIKS som eventuelt er limt inn av brukeren under, skal behandles som brukeroppgitt informasjon, ikke som offentlig verifisert informasjon.
- Ikke forsøk å omgå innlogging, skjulte sider eller tilgangsbegrensninger.

${manualFiksData ? `BRUKEROPPGITTE FIKS-OPPLYSNINGER\n${String(manualFiksData).slice(0, 12000)}\n` : ""}

UNDERSØKELSEN SKAL VÆRE GRUNDIG
1. Finn riktig offentlig kampside via FIKS-ID og kontroller motstander, dato, serie/avdeling, spillform og kamptropp hvis den er offentlig publisert.
2. Identifiser om motstanderen er et ordinært lag eller et sammensatt/samarbeidslag. Hvis lagnavnet eller NFF-data viser flere klubber, for eksempel et navn med skråstrek, skal du kartlegge relevante lag og spillerhistorikk hos alle klubbene som inngår i laget, ikke bare den første klubben.
3. Kartlegg relevante lag i gutte- og jentefotball fra aktuelle yngre klasser og opp til G16/J16. I Hordaland finnes det ikke egne G15/J15-klasser, så spill på G16/J16 må ikke tolkes som at spilleren nødvendigvis er 16 år. Bruk faktisk fødselsår bare dersom det er offentlig dokumentert.
4. For hver spiller i dagens offentlige kamptropp: undersøk offentlig kamphistorikk på de relevante lagene. Prioriter de siste obligatoriske kampene før denne kampen.
5. Vurder spill på flere lag opp mot gjeldende NFF-regelverk for den aktuelle sesongen og NFF Hordalands veiledning. Kontroller særlig regler om nærmeste høyere rangerte lag, likestilte lag, antallsgrenser for aktuell spillform, siste obligatoriske kamp, ulik spillform, overårige spillere, alderskrav, sammensatte lag og relevante kjønnsregler.
6. Undersøk alle relevante klubbers andre kamper samme dag og noter mulige samtidige eller tettliggende kamper for spillere som også finnes i dagens tropp. Ikke påstå faktisk deltakelse uten offentlig dokumentasjon.
7. Kontroller draktnummer i offentlig kamptropp og marker duplikater eller andre tydelige registreringsavvik.
8. Dersom et forhold kan være lovlig på grunn av dispensasjon eller informasjon som ikke er offentlig, skal du merke det som 'må kontrolleres manuelt', ikke som regelbrudd.
9. Skille tydelig mellom dokumenterte fakta, regelvurdering og usikkerhet.

SVARFORMAT
Start svaret nøyaktig med to linjer:
STATUS: GREEN, YELLOW, ORANGE eller RED
FUNN: <antall forhold som bør følges opp>

Bruk deretter disse overskriftene:
SAMMENDRAG
KAMPTROPP OG SPILLERHISTORIKK
REGELKONTROLL SPILL PÅ FLERE LAG
ALDER / OVERÅRIGE / G16-J16
SAMME DAG / ANDRE LAG
DRAKTNUMMER OG REGISTRERING
MÅ KONTROLLERES MANUELT
KONKLUSJON

Status betyr:
- GREEN: ingen relevante avvik funnet i tilgjengelige data.
- YELLOW: manglende data eller mindre forhold verdt å merke seg.
- ORANGE: konkrete forhold som bør kontrolleres mot dommer/FIKS/reglement før konklusjon.
- RED: et tydelig avvik kan dokumenteres fra offentlig tilgjengelige data og gjeldende regelverk. Bruk RED svært konservativt.

Viktig: Ikke bruk ord som 'juks' eller beskyld personer/klubb for uredelighet. Oppgi hvilken regel eller NFF-veiledning vurderingen bygger på, og bruk kildehenvisninger for faktiske påstander.
`;
}

exports.analyzeOpponentMatch = onCall({
  region: "us-central1",
  timeoutSeconds: 300,
  memory: "512MiB",
  secrets: ["OPENAI_API_KEY"]
}, async request => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Du må være logget inn.");
  }

  const matchId = String(request.data?.matchId || "").trim();
  const suppliedFiksId = cleanFiksId(request.data?.fiksId);
  const manualFiksData = String(request.data?.manualFiksData || "").trim();

  if (!matchId) {
    throw new HttpsError("invalid-argument", "Kamp-ID mangler.");
  }

  const db = admin.firestore();
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== "coach" && role !== "assistantCoach") {
    throw new HttpsError("permission-denied", "Kun trenerteamet kan kjøre motstandersjekk.");
  }

  const matchRef = db.collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new HttpsError("not-found", "Kampen finnes ikke.");
  }

  const match = matchSnap.data() || {};
  const fiksId = suppliedFiksId || cleanFiksId(match?.meta?.fiksId);
  if (!fiksId) {
    throw new HttpsError("failed-precondition", "FIKS kamp-ID mangler.");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new HttpsError("failed-precondition", "OPENAI_API_KEY er ikke konfigurert.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = buildPrompt({
    matchId,
    fiksId,
    match,
    manualFiksData
  });

  let response;
  try {
    response = await openai.responses.create({
      model: "gpt-5.6",
      reasoning: { effort: "medium" },
      tools: [
        {
          type: "web_search",
          search_context_size: "high",
          filters: {
            allowed_domains: ["fotball.no"]
          }
        }
      ],
      tool_choice: "auto",
      input: prompt
    });
  } catch (error) {
    console.error("Motstandersjekk feilet:", error);
    throw new HttpsError(
      "internal",
      error?.message || "Kunne ikke gjennomføre motstandersjekken."
    );
  }

  const output = firstOutputText(response);
  const text = output.text.trim();
  if (!text) {
    throw new HttpsError("internal", "Analysen ga ikke noe svar.");
  }

  const citations = normalizeCitations(output.annotations);
  const headline = parseHeadlineStatus(text);
  const generatedAt = admin.firestore.Timestamp.now();

  const storedAnalysis = {
    status: headline.status,
    findings: headline.findings,
    text,
    citations,
    fiksId,
    generatedAt,
    generatedBy: request.auth.uid,
    model: "gpt-5.6",
    sourcePolicy: "public-fotball-no-and-user-supplied-fiks"
  };

  await matchRef.update({
    "meta.fiksId": fiksId,
    opponentAnalysis: storedAnalysis
  });

  return {
    ...storedAnalysis,
    generatedAt: generatedAt.toDate().toISOString()
  };
});
