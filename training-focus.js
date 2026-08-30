const TRAINING_FOCUS_BY_OPPONENT = {
  "mathopen vadmyra 2": {
    intro: "Dette er det viktigste vi trener på ut fra scoutingen vi har nå. Kamprapportene 3/9 og 12/9 skal brukes til å justere prioriteringene – ikke starte planen på nytt.",
    priorities: [
      {
        number: "1",
        title: "Steng mellomrom sentralt",
        detail: "Nico foran stopperne. Når en angriper mottar mellom ledd: én støter, én sikrer. Målet er å nekte rettvendt mottak mot mål."
      },
      {
        number: "2",
        title: "Restforsvar når vi angriper",
        detail: "Én back om gangen. Når vi angriper høyt skal vi normalt ha tre forsvarere + Nico i sikring bak ballen, så Mathopen ikke får gratis overganger."
      },
      {
        number: "3",
        title: "De første 3–5 sekundene etter balltap",
        detail: "Nærmeste spiller presser ballfører, resten beskytter midten. Hvis vi ikke kan vinne ballen raskt, faller vi samlet tilbake i 4-1-4-1."
      },
      {
        number: "4",
        title: "Angrip raskt etter gjenvinning",
        detail: "Første blikk fram. Spiss eller kant truer bakrom, én indreløper følger angrepet og den andre sikrer sammen med Nico."
      }
    ],
    cues: [
      "Ingen vending sentralt",
      "Én støter – én sikrer",
      "Én back om gangen",
      "Press eller fall etter balltap",
      "Første blikk fram etter brudd"
    ]
  }
};

const card = document.getElementById("trainingFocusCard");
const intro = document.getElementById("trainingFocusIntro");
const list = document.getElementById("trainingFocusList");
const cues = document.getElementById("trainingFocusCues");
const opponentTitle = document.getElementById("opponentTitle");
const opponentSelect = document.getElementById("opponentSelect");

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

function currentOpponentName() {
  const title = String(opponentTitle?.textContent || "").trim();
  if (title && title !== "–") return title;

  const selectedOption = opponentSelect?.selectedOptions?.[0];
  return String(selectedOption?.textContent || "").trim();
}

function renderTrainingFocus() {
  if (!card || !intro || !list || !cues) return;

  const opponentName = currentOpponentName();
  const focus = TRAINING_FOCUS_BY_OPPONENT[normalize(opponentName)];

  if (!focus) {
    card.classList.add("hidden");
    list.innerHTML = "";
    cues.innerHTML = "";
    return;
  }

  card.classList.remove("hidden");
  intro.textContent = focus.intro;
  list.innerHTML = focus.priorities.map(item => `
    <article class="training-focus-item">
      <span class="training-focus-number">${escapeHtml(item.number)}</span>
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
      </div>
    </article>
  `).join("");

  cues.innerHTML = focus.cues.map(cue => `<span>${escapeHtml(cue)}</span>`).join("");
}

if (opponentTitle) {
  new MutationObserver(renderTrainingFocus).observe(opponentTitle, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

opponentSelect?.addEventListener("change", () => {
  setTimeout(renderTrainingFocus, 0);
});

renderTrainingFocus();
