// Hindrer at flere raske trykk på Start kan starte samme kamp flere ganger.
(() => {
  let startLocked = false;
  let lockedButton = null;

  function buttonIsVisible(button) {
    if (!button || !button.isConnected) return false;
    const style = getComputedStyle(button);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function setStartButtonState(button, locked) {
    if (!button) return;

    if (locked) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent || "Start";
      }
      button.disabled = true;
      button.textContent = "Starter…";
      button.setAttribute("aria-busy", "true");
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || "Start";
      button.removeAttribute("aria-busy");
    }
  }

  function unlockAfterRealSaveFailure() {
    const status = document.getElementById("saveStatus");
    if (!status) return;

    const check = () => {
      if (!startLocked || !lockedButton) return;

      const text = String(status.textContent || "").toLocaleLowerCase("no");
      const failed =
        status.classList.contains("error") ||
        text.includes("kunne ikke lagre") ||
        text.includes("lagring feilet");

      // Bare gi brukeren en ny sjanse dersom oppstarten faktisk feilet
      // og Start-knappen fortsatt står igjen på skjermen.
      if (failed && buttonIsVisible(lockedButton)) {
        startLocked = false;
        setStartButtonState(lockedButton, false);
        lockedButton = null;
      }
    };

    new MutationObserver(check).observe(status, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  unlockAfterRealSaveFailure();

  // Capture-fasen kjører før app.js sin async start-handler. Dermed låses
  // knappen før findLiveMatch()/Firestore rekker å await-e, og alle ekstra
  // trykk stoppes før de når kampmotoren.
  document.addEventListener("click", event => {
    const button = event.target?.closest?.("#startBtn");
    if (!button) return;

    if (startLocked) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const opponent = document.getElementById("awayTeam")?.value?.trim();
    const date = document.getElementById("matchDate")?.value;
    const time = document.getElementById("matchTime")?.value;

    // Ufullstendige kampdata skal fortsatt håndteres av kampmotorens
    // eksisterende validering, uten at knappen blir låst.
    if (!opponent || !date || !time) return;

    startLocked = true;
    lockedButton = button;
    setStartButtonState(button, true);
  }, true);
})();
