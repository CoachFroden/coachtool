const startBtn = document.getElementById("startBtn");
const startScreen = document.getElementById("start");
const workoutScreen = document.getElementById("workout");

const title = document.getElementById("title");
const desc = document.getElementById("desc");
const next = document.getElementById("next");
const reaction = document.getElementById("reaction");
const info = document.getElementById("info");
const tip = document.getElementById("tip");
const step = document.getElementById("step");
const exerciseBox = document.getElementById("exerciseBox");

const modal = document.getElementById("modal");
const modalText = document.getElementById("modalText");
const hint = document.getElementById("hint");
const beep = new Audio("langbeep.mp3");

let inWorkout = false;

const exercises = [

{t:"Klar?", d:"15 min. Gjør det skikkelig.", i:"Dette er en kort økt. Gå maks på hver øvelse. Ta pauser når du trenger, men ikke slurv."},

// Oppvarming
{t:"Oppvarming", d:"Kneløft 2 x 20", i:"Løp på stedet. Løft knær opp mot hofta. Bruk armene aktivt. Hold høy fart hele tiden."},

{t:"Oppvarming", d:"Spark bak 2 x 20", i:"Løp på stedet og spark hælene opp mot rumpa. Hold rytme og fart."},

{t:"Oppvarming", d:"Skipping 20 steg", i:"Små raske steg fremover. Vær lett på tærne. Tenk korte, raske kontakter med bakken."},

{t:"Oppvarming", d:"Utfall 10 per bein", i:"Ta et langt steg frem. Senk kroppen kontrollert. Press deg opp igjen. Hold balansen."},

// Aktivering
{t:"Aktivering", d:"3 hopp rett opp", i:"Stå rolig. Hopp rett opp med maks kraft. Bruk armene. Land mykt og stabilt."},

{t:"Aktivering", d:"3 fallstarter", i:"Len deg frem til du må ta et steg. Eksploder frem i sprint. Første steg skal være raskt."},

// Start
{t:"Start", d:"3 fra stående", i:"Start helt rolig. Eksploder frem. Fokuser på første 3 steg – maks kraft."},

{t:"Start", d:"3 fra sittende", i:"Sitt på bakken. Reis deg raskt og sprint. Ikke nøl – gå rett i maks fart."},

{t:"Start", d:"3 fra liggende", i:"Ligg på magen. Reis deg så raskt du kan og sprint. Reaksjon + eksplosivitet."},

// Reaksjon
{t:"Reaksjon", d:"5 sprint på pip", r:true, i:"Vent på signal. Reager så raskt du kan og sprint. Ikke tjuvstart."},

// Sprint
{t:"Sprint", d:"5 x 10 meter", i:"Sprint maks fart i 10 meter. Full innsats hver gang. Pause mellom hvert drag."},

// Retning
{t:"Retning", d:"Frem + snu x5", i:"Sprint frem, stopp og snu raskt. Lav tyngde og raske steg."},

{t:"Retning", d:"Høyre/venstre x5", i:"Sprint og bytt retning til høyre/venstre. Korte steg og god balanse."},

// Hopp
{t:"Hopp", d:"5 hopp opp", i:"Hopp rett opp med maks kraft. Bruk armene. Land kontrollert."},

{t:"Hopp", d:"5 lengdehopp", i:"Hopp fremover så langt du kan. Bruk armene og sats kraftig."},

{t:"Hopp", d:"5 per bein", i:"Hopp på ett bein. Hold balansen. Stabil landing er viktig."},

// Combo
{t:"Combo", d:"5 hopp + sprint", i:"Hopp rett opp, land og sprint med en gang. Eksplosiv overgang."},

// Slutt
{t:"Ferdig", d:"Bra jobba", i:"Dette er det som gjør deg raskere. Gjør det jevnlig og gi full innsats hver gang."}

];

const tips = [
"Full fart eller ingen effekt",
"Pause mellom sprintene",
"Første steg avgjør",
"Kvalitet > kvantitet"
];

let i = 0;

startBtn.onclick = () => {
  startScreen.classList.remove("active");
  workoutScreen.classList.add("active");

  // aktiver lyd på mobil
  beep.play().then(() => {
    beep.pause();
    beep.currentTime = 0;
  });

  inWorkout = true;

  if (exerciseBox) {
    exerciseBox.classList.remove("hidden");
  }

  if (hint) {
    hint.classList.remove("hidden");
  }

  show();

  if (next) {
    next.innerText = "NESTE";
  }
};

function show(){
  let ex = exercises[i];

  if(title) title.innerText = ex.t;
  if(desc) desc.innerText = ex.d;
  if(step) step.innerText = "Øvelse " + (i+1) + " av " + exercises.length;

  if(tip){
    tip.innerText = tips[Math.floor(Math.random()*tips.length)];
  }

  if(reaction){
    if(ex.r){
      reaction.classList.remove("hidden");
    } else {
      reaction.classList.add("hidden");
    }
  }
}

if (next) {
  next.onclick = () => {

    i++;
    if(i >= exercises.length) i = 0;
    show();
  };
}

if (info) {
  info.onclick = () => {
    alert(exercises[i].i);
  };
}

if (reaction) {
  reaction.onclick = () => {

    reaction.innerText = "VENT...";

    let delay = Math.random() * 3000 + 2000;

    setTimeout(() => {
      beep.currentTime = 0;
      beep.play();

      reaction.innerText = "SPRINT!";
      
      setTimeout(() => {
        reaction.innerText = "START REAKSJON";
      }, 1000);

    }, delay);
  };
}

const backBtn = document.getElementById("backBtn");

if (backBtn) {
  backBtn.onclick = () => {
    workoutScreen.classList.remove("active");
    startScreen.classList.add("active");
  };
}

if (exerciseBox && modal && modalText) {
  exerciseBox.onclick = () => {
    modal.classList.remove("hidden");
    modalText.innerText = exercises[i].i;
  };
}

if (modal) {
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
    }
  };
}

const resetBtn = document.getElementById("resetBtn");

if (resetBtn) {
  resetBtn.onclick = () => {

    i = 0;                 // tilbake til første øvelse
    inWorkout = true;

    if (exerciseBox) {
      exerciseBox.classList.remove("hidden");
    }

    if (hint) {
      hint.classList.remove("hidden");
    }

    if (modal) {
      modal.classList.add("hidden");
    }

    if (next) {
      next.innerText = "NESTE";
    }

    show(); // vis første øvelse igjen
  };
}