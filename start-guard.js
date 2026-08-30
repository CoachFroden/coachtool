// Hindrer flere raske trykk på Start fra å registrere flere start-hendelser.
(() => {
  let startLocked = false;
  let unlockTimer = null;

  function setStartButtonState(button, locked) {
    if (!button) return;
    button.disabled = locked;

    if (locked) {
      button.dataset.originalText = button.textContent || "Start";
      button.textContent = "Starter…";
      button.setAttribute("aria-busy", "true");
    } else {
      button.textContent = button.dataset.originalText || "Start";
      button.removeAttribute("aria-busy");
    }
  }

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

    // La kampmotorens vanlige validering håndtere ufullstendige kampdata.
    if (!opponent || !date || !time) return;

    startLocked = true;
    setStartButtonState(button, true);

    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => {
      const stillVisible = getComputedStyle(button).display !== "none";
      if (stillVisible) {
        startLocked = false;
        setStartButtonState(button, false);
      }
    }, 12000);
  }, true);
})();
