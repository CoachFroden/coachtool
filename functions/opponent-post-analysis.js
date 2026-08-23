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

function getRecordedScore(match) {
  const our = Number(match?.score?.our);
  const their = Number(match?.score?.their);

  if (!Number.isFinite(our) || !Number.isFinite(their)) return null;
  return { our, their };
}

function guardPublicationClaims(text, match) {
  let guarded = String(text || "");
  const recordedScore = getRecordedScore(match);

  // Web search can see an incomplete/cached rendering of dynamic fotball.no tabs.
  // Therefore absence from search results must never be presented as proof that
  // something is not published on the live public page.
  guarded = guarded.replace(
    /\b(?:fortsatt\s+|ennå\s+)?ikke\s+publisert\b/gi,
    "ikke verifisert via tilgjengelig offentlig søk"
  );

  guarded = guarded.replace(
    /\b(?:den\s+)?(?:endelige\s+)?offentlige\s+kamprapporten\s+mangler\b/gi,
    "den endelige offentlige kamprapporten kunne ikke verifiseres via tilgjengelig offentlig søk"
  );

  if (recordedScore) {
    guarded = guarded.replace(
      /\bresultatet\s+(?:er|var)\s+ikke\s+(?:publisert|tilgjengelig)\b/gi,
      `resultatet er registrert i appen som ${recordedScore.our}-${recordedScore.their}, men detaljene må fortsatt verifiseres mot offentlig NFF-kilde`
    );

    guarded = guarded.replace(
      /\b(?:ingen|uten)\s+publisert\s+resultat\b/gi,
      `med app-registrert sluttresultat ${recordedScore.our}-${recordedScore.their}, mens offentlig detaljvisning må verifiseres separat`
    );
  }

  return guarded;
}

function buildPrompt({ matchId, fiksId, match }) {
  const meta = match?.meta || {};
  const matchDate = meta.date || "ukjent dato";
  const matchTime = meta.startTime || meta.time || "ukjent klokkeslett";
  const opponent = meta.opponent || "ukjent motstander";
  const ourTeam = meta.ourTeam || "Samnanger";
  const venue = meta.venueName || "ukjent bane";
  const competitionType = meta.type || "ukjent kamptype";
  const matchNumber = String(meta.matchNumber || meta.kampnummer || "").trim();
  const recordedScore = getRecordedScore(match);
  const seasonMatch = String(matchDate).match(/^(\d{4})-/);
  const season = seasonMatch ? seasonMatch[1] : new Date().getFullYear();
  const publicMatchUrl = `https://www.fotball.no/fotballdata/kamp/?fiksId=${fiksId}`;

  return `
Du er en regelkontrollør for norsk breddefotball. Gjør en grundig ETTERKONTROLL av en ferdigspilt kamp.

KAMP
- App-kamp-ID: ${matchId}
- FIKS-kamp-ID: ${fiksId}
- Kampnummer: ${matchNumber || "ikke lagret i appen"}
- Offentlig kamp-URL: ${publicMatchUrl}
- Vårt lag: ${ourTeam}
- Motstander: ${opponent}
- Dato: ${matchDate}
- Klokkeslett: ${matchTime}
- Bane: ${venue}
- Kamptype: ${competitionType}
- Sesong: ${season}
- Krets: NFF Hordaland
- Appstatus: ${String(match?.status || "ukjent")}
- App-registrert sluttresultat: ${recordedScore ? `${ourTeam} ${recordedScore.our} - ${recordedScore.their} ${opponent}` : "ikke tilgjengelig"}

VIKTIG OM FOTBALL.NO OG SØKERESULTATER
Fotball.no har dynamiske faner som Kamptropper og Kamphendelser. Web-søk kan få en cachet eller ufullstendig representasjon av siden selv om den levende offentlige siden viser mer informasjon.

DERFOR ER DISSE REGLENE ABSOLUTTE:
- At du IKKE finner kamptropp, resultat eller kamphendelser i web-søket er IKKE bevis på at de ikke er publisert.
- Du skal ALDRI skrive «ikke publisert», «kamprapporten mangler» eller tilsvarende bare fordi søket ikke viste informasjonen.
- Hvis informasjonen ikke kan hentes/verifiseres med verktøyet, skriv nøyaktig at den «ikke kunne verifiseres via tilgjengelig offentlig søk».
- Dersom appen allerede har et registrert sluttresultat, skal du IKKE hevde at resultatet ikke er publisert eller at kampen mangler resultat. Bruk appresultatet som kryssjekk, men merk det som app-registrert og ikke som offentlig kilde.
- Hvis en offentlig kilde viser sluttresultat eller kamphendelser, skal dette veie tyngre enn en annen søkeresultat-side som mangler de samme feltene.
- Mangel på et felt i én søkeresultat-snutt skal aldri brukes som dokumentasjon på fravær.

OBLIGATORISK SØKESTRATEGI
1. Søk først på eksakt FIKS-ID ${fiksId} og åpne/bruk kamp-URL-en ${publicMatchUrl} som identitetsanker.
2. Kryssjekk motstander, dato og serie/avdeling mot kampen i appen.
${matchNumber ? `3. Kryssjekk også eksakt kampnummer ${matchNumber}.\n` : "3. Hvis du finner et offentlig kampnummer, bruk det som ekstra identitetskontroll.\n"}
4. Gjør målrettede søk etter kombinasjoner av FIKS-ID + «Kamptropper», FIKS-ID + «Kamphendelser», FIKS-ID + spiller-/lagnavn og kampnummer når det er kjent.
5. Hvis søket ikke kan hente de dynamiske detaljene, fortsett analysen av det som faktisk kan dokumenteres og merk resten «kunne ikke verifiseres via tilgjengelig offentlig søk».
6. Før du svarer, gjør en konsistenskontroll: svarteksten må ikke påstå at noe «ikke er publisert» bare fordi søket ikke fant det.

DATAGRENSER
- Bruk bare offentlig tilgjengelig informasjon du finner på fotball.no/NFF-sider, pluss appens egne kampdata som eksplisitt er merket som appdata.
- Ikke gjett fødselsår, dispensasjoner, faktisk deltakelse eller identitet hvis det ikke kan dokumenteres.
- Ikke forsøk å omgå innlogging, skjulte sider eller tilgangsbegrensninger.

MÅL FOR ETTERKONTROLLEN
1. Finn riktig offentlig kampside via FIKS-ID og bruk den endelige offentlige kamprapporten når den kan verifiseres.
2. Kontroller registrert kamptropp, målscorere, draktnumre og andre relevante registreringer etter kampen når disse kan verifiseres.
3. Identifiser om motstanderen er et ordinært lag eller et sammensatt/samarbeidslag. Hvis lagnavnet eller NFF-data viser flere klubber, skal du kartlegge relevante lag og spillerhistorikk hos alle klubbene som inngår i laget.
4. Kartlegg relevante lag i gutte- og jentefotball fra aktuelle yngre klasser og opp til G16/J16. I Hordaland finnes det ikke egne G15/J15-klasser, så spill på G16/J16 må ikke tolkes som at spilleren nødvendigvis er 16 år.
5. For hver offentlig verifiserbar spiller i den endelige kamptroppen: undersøk offentlig kamphistorikk på relevante lag. Prioriter de siste obligatoriske kampene før den aktuelle kampen.
6. Vurder spill på flere lag opp mot gjeldende NFF-regelverk for den aktuelle sesongen og NFF Hordalands veiledning. Kontroller særlig nærmeste høyere rangerte lag, likestilte lag, antallsgrenser for aktuell spillform, siste obligatoriske kamp, ulik spillform, overårige spillere, alderskrav, sammensatte lag og relevante kjønnsregler.
7. Undersøk andre kamper samme dag og noter dersom spillere i den endelige kamptroppen også er offentlig registrert i andre relevante kamper. Skille mellom samtidighet, mulig deltakelse og dokumentert deltakelse.
8. Kontroller draktnumre og marker duplikater eller andre tydelige registreringsavvik når dataene kan verifiseres.
9. Dersom et forhold kan være lovlig på grunn av dispensasjon eller informasjon som ikke er offentlig, merk det som «må kontrolleres manuelt», ikke som regelbrudd.
10. Skille tydelig mellom dokumenterte fakta, appdata, regelvurdering, manglende søkedekning og faktisk usikkerhet.

SVARFORMAT
Start svaret nøyaktig med to linjer:
STATUS: GREEN, YELLOW, ORANGE eller RED
FUNN: <antall forhold som bør følges opp>

Bruk deretter disse overskriftene:
SAMMENDRAG
ENDELIG KAMPRAPPORT
KAMPTROPP OG SPILLERHISTORIKK
REGELKONTROLL SPILL PÅ FLERE LAG
ALDER / OVERÅRIGE / G16-J16
SAMME DAG / ANDRE LAG
DRAKTNUMMER OG REGISTRERING
MÅ KONTROLLERES MANUELT
KONKLUSJON

Status betyr:
- GREEN: ingen relevante avvik funnet i tilgjengelige og verifiserbare data.
- YELLOW: manglende søkedekning, manglende verifisering eller mindre forhold verdt å merke seg.
- ORANGE: konkrete dokumenterte forhold som bør kontrolleres mot dommer/FIKS/reglement før konklusjon.
- RED: et tydelig avvik kan dokumenteres fra offentlig tilgjengelige data og gjeldende regelverk. Bruk RED svært konservativt.

Viktig: Ikke bruk ord som «juks» eller beskyld personer/klubb for uredelighet. Oppgi hvilken regel eller NFF-veiledning vurderingen bygger på, og bruk kildehenvisninger for faktiske påstander.
`;
}

exports.analyzeOpponentPostMatch = onCall({
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

  if (!matchId) {
    throw new HttpsError("invalid-argument", "Kamp-ID mangler.");
  }

  const db = admin.firestore();
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== "coach" && role !== "assistantCoach") {
    throw new HttpsError("permission-denied", "Kun trenerteamet kan kjøre ettersjekk.");
  }

  const matchRef = db.collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new HttpsError("not-found", "Kampen finnes ikke.");
  }

  const match = matchSnap.data() || {};
  if ((match.status || "").toUpperCase() !== "ENDED") {
    throw new HttpsError("failed-precondition", "Ettersjekk kan bare kjøres på avsluttede kamper.");
  }

  const fiksId = suppliedFiksId || cleanFiksId(match?.meta?.fiksId);
  if (!fiksId) {
    throw new HttpsError("failed-precondition", "FIKS kamp-ID mangler.");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new HttpsError("failed-precondition", "OPENAI_API_KEY er ikke konfigurert.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = buildPrompt({ matchId, fiksId, match });

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
    console.error("Ettersjekk motstander feilet:", error);
    throw new HttpsError(
      "internal",
      error?.message || "Kunne ikke gjennomføre ettersjekken."
    );
  }

  const output = firstOutputText(response);
  const rawText = output.text.trim();
  if (!rawText) {
    throw new HttpsError("internal", "Ettersjekken ga ikke noe svar.");
  }

  const text = guardPublicationClaims(rawText, match);
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
    analysisType: "post-match",
    sourcePolicy: "public-fotball-no-plus-app-crosscheck",
    verificationPolicy: "dynamic-page-safe-v2"
  };

  await matchRef.update({
    "meta.fiksId": fiksId,
    opponentPostAnalysis: storedAnalysis
  });

  return {
    ...storedAnalysis,
    generatedAt: generatedAt.toDate().toISOString()
  };
});