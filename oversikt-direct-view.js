const params = new URLSearchParams(window.location.search);
const requestedView = params.get("view");

if (["stats", "upcoming", "played"].includes(requestedView)) {
  const tryOpenRequestedView = () => {
    const userLine = document.getElementById("userLine");
    const matchTab = document.getElementById("tabMatch");
    const matchSelect = document.getElementById("matchSelect");

    // oversikt.js avslutter auth-initialisering med å fylle userLine og vise
    // spillervisningen. Vent til det er skjedd, så vår direktevisning ikke blir
    // overskrevet etterpå.
    if (!userLine?.textContent?.trim() || !matchTab || !matchSelect) return false;

    matchTab.click();
    matchSelect.value = requestedView;
    matchSelect.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (tryOpenRequestedView() || attempts >= 80) {
      window.clearInterval(timer);
    }
  }, 100);
}
