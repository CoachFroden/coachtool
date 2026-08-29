import "./squad-status-ui.js?v=20260830-4";

// Spillere som ikke lenger skal vises i aktive valg i appen.
// Historiske kampdata og statistikk beholdes urørt.
const RETIRED_PLAYER_NAMES = new Set(["torvald"]);

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("no");
}

function isRetiredPlayerText(value) {
  const text = normalizeName(value);
  if (!text) return false;

  return [...RETIRED_PLAYER_NAMES].some((name) =>
    text === name || text.startsWith(`${name} `)
  );
}

function removeRetiredOptions(root = document) {
  root.querySelectorAll?.("select option").forEach((option) => {
    if (isRetiredPlayerText(option.textContent)) {
      option.remove();
    }
  });
}

function hideRetiredInteractivePlayers(root = document) {
  const selectors = [
    "#squadList li",
    "#playerList .player-item",
    "#subPlayerGrid > *",
    "#goalScorerGrid > *"
  ];

  root.querySelectorAll?.(selectors.join(",")).forEach((element) => {
    const name =
      element.dataset?.playerName ||
      element.querySelector?.(".player-name")?.textContent ||
      element.textContent;

    if (isRetiredPlayerText(name)) {
      element.remove();
    }
  });
}

function applyRetiredPlayerFilter(root = document) {
  removeRetiredOptions(root);
  hideRetiredInteractivePlayers(root);
}

function startRetiredPlayerFilter() {
  applyRetiredPlayerFilter(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        applyRetiredPlayerFilter(node);
        if (node.parentElement) applyRetiredPlayerFilter(node.parentElement);
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startRetiredPlayerFilter, { once: true });
} else {
  startRetiredPlayerFilter();
}
