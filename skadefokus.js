const start = document.getElementById("start");
const workout = document.getElementById("workout");

const buttons = document.querySelectorAll(".menu");
const back = document.getElementById("back");

const title = document.getElementById("title");
const intro = document.getElementById("intro");
const stepTitle = document.getElementById("stepTitle");
const stepDesc = document.getElementById("stepDesc");
const dose = document.getElementById("dose");
const tip = document.getElementById("tip");
const progress = document.getElementById("progress");

const next = document.getElementById("next");
const prev = document.getElementById("prev");

let mode = "";
let index = 0;

const programs = {

  return: {
    title: "Tilbake til 100%",
    intro: "Følg stegene. Ikke hopp videre hvis det gjør vondt.",
    steps: [
      {
        title: "Start rolig",
        desc: "Hvis du halter → stopp. Du skal kunne gå normalt.",
        dose: "1 dag",
        tip: "Ikke spill kamp enda."
      },
      {
        title: "Glute bridge",
        desc: "Ligg på ryggen. Løft hofta rolig opp.",
        dose: "2 x 12",
        tip: "Bruk rumpa."
      },
      {
        title: "Heel slides",
        desc: "Dra hælen inn mot rumpa rolig.",
        dose: "2 x 10",
        tip: "Ingen rykk."
      },
      {
        title: "Isometrisk press",
        desc: "Press hælen ned i bakken og hold.",
        dose: "3 x 20 sek",
        tip: "Bygger styrke uten smerte."
      },
      {
        title: "Lett jogging",
        desc: "Test rolig jogg.",
        dose: "3 min",
        tip: "Ingen smerte = gå videre."
      },
      {
        title: "Sprint 50%",
        desc: "Rolig sprint.",
        dose: "3 drag",
        tip: "Føles det bra? Gå videre."
      },
      {
        title: "Sprint 100%",
        desc: "Full fart igjen.",
        dose: "3 drag",
        tip: "Nå er du tilbake."
      }
    ]
  },

  prevent: {
    title: "Unngå skade",
    intro: "Gjør dette 2 ganger i uka.",
    steps: [
      {
        title: "Nordic",
        desc: "Brems deg framover.",
        dose: "2 x 5",
        tip: "Beste øvelsen."
      },
      {
        title: "Ettbeins balanse",
        desc: "Stå på ett bein.",
        dose: "2 x 20 sek",
        tip: "Kontroll."
      },
      {
        title: "Sprint",
        desc: "Korte sprinter.",
        dose: "5 drag",
        tip: "Full innsats."
      }
    ]
  },

  calf: {
    title: "Unngå leggkrampe",
    intro: "Før kamp + litt gjennom uka.",
    steps: [
      {
        title: "Tåhev",
        desc: "Opp på tå.",
        dose: "2 x 20",
        tip: "Sterkere legg = mindre krampe."
      },
      {
        title: "Små hopp",
        desc: "Raske små hopp.",
        dose: "2 x 15",
        tip: "Vekker leggene."
      },
      {
        title: "Løp opp",
        desc: "Rolig → rask.",
        dose: "3 drag",
        tip: "Ikke rett i maks."
      },
      {
        title: "Drikk vann",
        desc: "Drikk før kamp.",
        dose: "Hele dagen",
        tip: "Viktig."
      }
    ]
  }

};

function open(modeName) {
  mode = modeName;
  index = 0;

  start.classList.remove("active");
  workout.classList.add("active");

  render();
}

function render() {
  const p = programs[mode];
  const s = p.steps[index];

  title.textContent = p.title;
  intro.textContent = p.intro;

  stepTitle.textContent = s.title;
  stepDesc.textContent = s.desc;
  dose.textContent = s.dose;
  tip.textContent = s.tip;

  progress.textContent = `${index + 1} / ${p.steps.length}`;
}

function nextStep() {
  if (index < programs[mode].steps.length - 1) {
    index++;
  }
  render();
}

function prevStep() {
  if (index > 0) {
    index--;
  }
  render();
}

buttons.forEach(btn => {
  btn.onclick = () => open(btn.dataset.mode);
});

back.onclick = () => {
  workout.classList.remove("active");
  start.classList.add("active");
};

next.onclick = nextStep;
prev.onclick = prevStep;