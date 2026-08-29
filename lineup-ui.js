const playerList = document.getElementById("playerList");

if (playerList) {
  let scheduled = false;
  let processing = false;

  const buildGroup = (type, title, subtitle, icon, items) => {
    if (!items.length) return null;

    const group = document.createElement("section");
    group.className = `lineup-group lineup-group-${type}`;

    const header = document.createElement("div");
    header.className = "lineup-group-header";
    header.innerHTML = `
      <div class="lineup-group-heading">
        <span class="lineup-group-icon">${icon}</span>
        <div>
          <strong>${title}</strong>
          <small>${subtitle}</small>
        </div>
      </div>
      <span class="lineup-group-count">${items.length}</span>
    `;
    group.appendChild(header);

    const list = document.createElement("div");
    list.className = "lineup-group-list";

    items.forEach((item, index) => {
      item.classList.remove("lineup-starter", "lineup-bench", "lineup-absent");
      item.classList.add(`lineup-${type}`);
      item.style.background = "";
      item.style.opacity = "";
      item.style.textDecoration = "";

      const name = item.querySelector(".player-name");
      if (name) {
        name.insertAdjacentHTML(
          "beforebegin",
          `<span class="lineup-number">${index + 1}</span>`
        );
      }

      list.appendChild(item);
    });

    group.appendChild(list);
    return group;
  };

  const processList = () => {
    scheduled = false;
    if (processing) return;

    const directChildren = Array.from(playerList.children);
    if (!directChildren.length) return;

    // Already grouped and untouched since last render.
    if (directChildren.every(child => child.classList.contains("lineup-group"))) return;

    processing = true;

    const starters = [];
    const bench = [];
    const absent = [];
    let section = "";

    directChildren.forEach(child => {
      if (child.classList.contains("player-item")) {
        const isAbsent = child.style.opacity === "0.4" || child.style.textDecoration.includes("line-through");
        if (isAbsent) {
          absent.push(child);
        } else if (section === "pitch") {
          starters.push(child);
        } else {
          bench.push(child);
        }
        return;
      }

      const text = (child.textContent || "").trim().toLowerCase();
      if (text.includes("på banen")) section = "pitch";
      if (text.includes("benk")) section = "bench";
    });

    const fragment = document.createDocumentFragment();
    const starterGroup = buildGroup("starter", "STARTERE", "Fra start", "★", starters);
    const benchGroup = buildGroup("bench", "INNBYTTERE", "Starter på benken", "↔", bench);
    const absentGroup = buildGroup("absent", "IKKE TIL STEDE", "Ikke med i kamptroppen", "○", absent);

    [starterGroup, benchGroup, absentGroup].filter(Boolean).forEach(group => fragment.appendChild(group));

    playerList.replaceChildren(fragment);
    processing = false;
  };

  const observer = new MutationObserver(() => {
    if (processing || scheduled) return;
    scheduled = true;
    requestAnimationFrame(processList);
  });

  observer.observe(playerList, { childList: true });
  processList();
}
