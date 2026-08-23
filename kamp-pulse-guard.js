function getMainClockSeconds(clockElement) {
  const clockText = String(clockElement?.textContent || "");
  const match = clockText.match(/(\d+):(\d{2})/);
  if (!match) return 0;

  return Number(match[1]) * 60 + Number(match[2]);
}

function installMatchEndPulseGuard() {
  const endBtn = document.getElementById("endBtn");
  const gameClock = document.getElementById("game-clock");
  const halfLength = document.getElementById("halfLength");
  const periodIndicator = document.getElementById("period-indicator");

  if (!endBtn || !gameClock || !halfLength || !periodIndicator) return;

  const style = document.createElement("style");
  style.textContent = `
    #endBtn.time-ended-pulse.match-end-pulse-blocked {
      animation: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);

  const sync = () => {
    const halfMinutes = Math.max(1, Number(halfLength.value) || 35);
    const matchEndSeconds = halfMinutes * 2 * 60;
    const elapsedSeconds = getMainClockSeconds(gameClock);
    const periodText = String(periodIndicator.textContent || "").toLowerCase();
    const isSecondHalf = periodText.includes("2.") || periodText.includes("2 ");

    // Kampklokken viser samlet kamptid. I 2. omgang skal Slutt derfor
    // først pulsere ved 2 x omgangslengden (70:00 ved 2 x 35 min).
    const shouldBlockPulse = isSecondHalf && elapsedSeconds < matchEndSeconds;
    endBtn.classList.toggle("match-end-pulse-blocked", shouldBlockPulse);
  };

  const observer = new MutationObserver(sync);
  observer.observe(gameClock, {
    childList: true,
    characterData: true,
    subtree: true
  });
  observer.observe(periodIndicator, {
    childList: true,
    characterData: true,
    subtree: true
  });

  halfLength.addEventListener("change", sync);
  sync();
}

installMatchEndPulseGuard();
