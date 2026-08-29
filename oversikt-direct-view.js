const params = new URLSearchParams(window.location.search);
const requestedView = params.get("view");

if (["stats", "upcoming", "played"].includes(requestedView)) {
  const tryOpenRequestedView = () => {
    const matchTab = document.getElementById("tabMatch");
    const matchPanel = document.getElementById("matchPanel");
    const matchSelect = document.getElementById("matchSelect");

    if (!matchTab || !matchPanel || !matchSelect) return false;

    // Vent til oversikt.js/auth har initialisert siden. Når spillervisningen er
    // aktiv, kan vi trygt bytte til kampfanen og sende riktig valg direkte.
    matchTab.click();
    matchSelect.value = requestedView;
    matchSelect.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (tryOpenRequestedView() || attempts >= 40) {
      window.clearInterval(timer);
    }
  }, 100);
}
