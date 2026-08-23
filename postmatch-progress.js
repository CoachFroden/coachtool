const STYLE_ID = "postmatchProgressStyles";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .postmatchProgressWrap {
      display: grid;
      gap: 10px;
    }

    .postmatchProgressTitle {
      font-weight: 750;
      color: #e5e7eb;
    }

    .postmatchProgressStatus {
      color: rgba(226, 232, 240, 0.92);
      font-size: 0.9rem;
      line-height: 1.4;
      min-height: 1.4em;
    }

    .postmatchProgressTrack {
      position: relative;
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.18);
    }

    .postmatchProgressSweep {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 42%;
      border-radius: inherit;
      background: linear-gradient(
        90deg,
        rgba(96, 165, 250, 0.15),
        rgba(96, 165, 250, 0.95),
        rgba(96, 165, 250, 0.15)
      );
      animation: postmatchProgressSweep 1.35s ease-in-out infinite;
    }

    .postmatchProgressMeta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      color: rgba(203, 213, 225, 0.76);
      font-size: 0.8rem;
    }

    .postmatchProgressHint {
      color: rgba(148, 163, 184, 0.82);
      font-size: 0.78rem;
      line-height: 1.4;
    }

    @keyframes postmatchProgressSweep {
      0% { left: -45%; }
      55% { left: 55%; }
      100% { left: 105%; }
    }

    @media (prefers-reduced-motion: reduce) {
      .postmatchProgressSweep {
        animation-duration: 2.8s;
      }
    }
  `;
  document.head.appendChild(style);
}

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function phaseFor(seconds) {
  if (seconds < 6) return "Starter kontrollen…";
  if (seconds < 22) return "Henter offentlig kampdata…";
  if (seconds < 48) return "Kontrollerer kamptropp og spillerhistorikk…";
  if (seconds < 80) return "Sammenholder spillerbruk med NFF-reglene…";
  if (seconds < 120) return "Undersøker andre lag og kamper samme dag…";
  if (seconds < 170) return "Samler funn, regelvurderinger og kilder…";
  return "Fortsatt i arbeid – denne ettersjekken er omfattende…";
}

function enhanceLoadingBox(box) {
  if (!box || box.dataset.progressEnhanced === "true") return;
  box.dataset.progressEnhanced = "true";
  ensureStyles();

  box.innerHTML = `
    <div class="postmatchProgressWrap" role="status" aria-live="polite">
      <div class="postmatchProgressTitle">🔎 Ettersjekk pågår</div>
      <div class="postmatchProgressStatus">Starter kontrollen…</div>
      <div class="postmatchProgressTrack" aria-hidden="true">
        <div class="postmatchProgressSweep"></div>
      </div>
      <div class="postmatchProgressMeta">
        <span>⏱ Tid brukt: <strong class="postmatchProgressElapsed">0:00</strong></span>
        <span>Jobber…</span>
      </div>
      <div class="postmatchProgressHint">
        En grundig ettersjekk kan ta fra under ett minutt til noen minutter. Linjen viser aktivitet, ikke en beregnet prosent.
      </div>
    </div>
  `;

  const startedAt = Date.now();
  const elapsedEl = box.querySelector(".postmatchProgressElapsed");
  const statusEl = box.querySelector(".postmatchProgressStatus");

  const update = () => {
    if (!box.isConnected) {
      clearInterval(timer);
      return;
    }

    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    if (elapsedEl) elapsedEl.textContent = formatElapsed(seconds);
    if (statusEl) statusEl.textContent = phaseFor(seconds);
  };

  const timer = setInterval(update, 1000);
  update();
}

function scan() {
  document.querySelectorAll(".opponentPostAnalysisLoading")
    .forEach(enhanceLoadingBox);
}

const observer = new MutationObserver(scan);
observer.observe(document.body, {
  childList: true,
  subtree: true
});

scan();
