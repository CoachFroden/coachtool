const modal = document.getElementById("squadModal");
const list = document.getElementById("squadList");

function ensureSquadStatusStyles() {
  if (document.getElementById("squad-status-ui-style")) return;

  const style = document.createElement("style");
  style.id = "squad-status-ui-style";
  style.textContent = `
    #squadModal .modal-content { max-width: 430px; }
    #squadModal #squadList {
      padding:0;
      margin:14px 0 0;
      list-style:none;
      display:block;
    }

    #squadModal .squad-group-heading {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      margin:18px 0 0;
      padding:0 2px 8px;
      border:0;
      background:transparent;
    }
    #squadModal .squad-group-heading:first-child { margin-top:0; }
    #squadModal .squad-group-heading strong { font-size:12px; letter-spacing:.08em; }
    #squadModal .squad-group-heading small { display:none; }
    #squadModal .squad-group-heading > span {
      min-width:28px;
      height:28px;
      display:grid;
      place-items:center;
      border-radius:999px;
      font-size:11px;
      font-weight:850;
      background:rgba(148,163,184,.10);
    }
    #squadModal .squad-group-heading.starter { color:#4ade80; }
    #squadModal .squad-group-heading.bench { color:#fbbf24; }
    #squadModal .squad-group-heading.absent { color:#94a3b8; }

    #squadModal .squad-row {
      min-height:46px;
      display:grid !important;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:center;
      gap:10px;
      padding:0 2px !important;
      margin:0 !important;
      border:0 !important;
      border-radius:0 !important;
      border-bottom:1px solid rgba(148,163,184,.12) !important;
      background:transparent !important;
      color:#f8fafc;
      opacity:1 !important;
    }
    #squadModal .squad-row:last-of-type { border-bottom-color:transparent !important; }
    #squadModal .squad-row .player-name {
      min-width:0;
      font-size:15px;
      font-weight:650;
      text-decoration:none !important;
      color:#f8fafc !important;
    }
    #squadModal .squad-starter .player-name { color:#dffbe8 !important; }
    #squadModal .squad-bench .player-name { color:#fff6dd !important; }
    #squadModal .squad-absent .player-name { color:#94a3b8 !important; }

    #squadModal .squad-original-control {
      position:absolute !important;
      width:1px !important;
      height:1px !important;
      padding:0 !important;
      margin:-1px !important;
      overflow:hidden !important;
      clip:rect(0,0,0,0) !important;
      white-space:nowrap !important;
      border:0 !important;
    }

    #squadModal .squad-status-select {
      width:112px;
      min-height:32px;
      padding:0 28px 0 9px;
      border-radius:9px;
      border:1px solid rgba(148,163,184,.18);
      background:#0b1423;
      color:#e5edf7;
      font:inherit;
      font-size:10px;
      font-weight:750;
    }
    #squadModal .squad-starter .squad-status-select {
      border-color:rgba(74,222,128,.28);
      color:#4ade80;
      background:rgba(22,163,74,.08);
    }
    #squadModal .squad-bench .squad-status-select {
      border-color:rgba(245,158,11,.26);
      color:#fbbf24;
      background:rgba(245,158,11,.07);
    }
    #squadModal .squad-absent .squad-status-select {
      color:#94a3b8;
      background:rgba(100,116,139,.06);
    }

    #squadModal .starter-counter {
      display:inline-flex;
      align-items:center;
      min-height:32px;
      padding:0 10px;
      border:1px solid rgba(74,222,128,.20);
      border-radius:999px;
      background:rgba(22,163,74,.06);
      color:#86efac;
      font-weight:800;
      font-size:11px;
    }

    @media (max-width:390px) {
      #squadModal .squad-status-select { width:104px; font-size:9.5px; }
      #squadModal .squad-row .player-name { font-size:14px; }
    }
  `;
  document.head.appendChild(style);
}

if (modal && list) {
  ensureSquadStatusStyles();
  let rendering = false;

  const statusForRow = (row) => {
    const checks = row.querySelectorAll('input[type="checkbox"]');
    const present = checks[0];
    const starter = checks[1];
    if (!present || !starter) return null;
    if (!present.checked) return "absent";
    return starter.checked ? "starter" : "bench";
  };

  const applyStatus = (row, value) => {
    const checks = row.querySelectorAll('input[type="checkbox"]');
    const present = checks[0];
    const starter = checks[1];
    if (!present || !starter) return;

    const change = (input, checked) => {
      if (input.checked === checked) return;
      input.checked = checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    if (value === "starter") {
      change(present, true);
      change(starter, true);
    } else if (value === "bench") {
      change(present, true);
      change(starter, false);
    } else {
      change(starter, false);
      change(present, false);
    }

    requestAnimationFrame(renderSquadGroups);
  };

  const ensureStatusControl = (row) => {
    let select = row.querySelector(".squad-status-select");
    if (!select) {
      select = document.createElement("select");
      select.className = "squad-status-select";
      select.setAttribute("aria-label", "Spillerstatus");
      select.innerHTML = `
        <option value="starter">Starter</option>
        <option value="bench">Innbytter</option>
        <option value="absent">Ikke til stede</option>
      `;
      select.addEventListener("click", (event) => event.stopPropagation());
      select.addEventListener("change", (event) => {
        event.stopPropagation();
        applyStatus(row, select.value);
      });
      row.appendChild(select);
    }
    return select;
  };

  function makeHeading(kind, title, count) {
    const li = document.createElement("li");
    li.className = `squad-group-heading ${kind}`;
    li.innerHTML = `<div><strong>${title}</strong></div><span>${count}</span>`;
    return li;
  }

  function renderSquadGroups() {
    if (rendering) return;
    const rows = [...list.querySelectorAll(":scope > .squad-row")];
    if (!rows.length) return;
    rendering = true;

    try {
      list.querySelectorAll(":scope > .squad-group-heading").forEach((el) => el.remove());
      const groups = { starter: [], bench: [], absent: [] };

      rows.forEach((row) => {
        const status = statusForRow(row);
        if (!status) return;
        row.classList.remove("squad-starter", "squad-bench", "squad-absent");
        row.classList.add(`squad-${status}`);
        const select = ensureStatusControl(row);
        select.value = status;
        row.querySelectorAll("label.checkbox").forEach((label) => label.classList.add("squad-original-control"));
        groups[status].push(row);
      });

      const fragment = document.createDocumentFragment();
      const sections = [
        ["starter", "STARTERE", groups.starter],
        ["bench", "INNBYTTERE", groups.bench],
        ["absent", "IKKE TIL STEDE", groups.absent]
      ];

      sections.forEach(([kind, title, rowsInGroup]) => {
        if (!rowsInGroup.length) return;
        fragment.appendChild(makeHeading(kind, title, rowsInGroup.length));
        rowsInGroup.forEach((row) => fragment.appendChild(row));
      });
      list.replaceChildren(fragment);
    } finally {
      rendering = false;
    }
  }

  const scheduleRender = () => {
    if (modal.classList.contains("hidden")) return;
    requestAnimationFrame(renderSquadGroups);
  };

  new MutationObserver(scheduleRender).observe(modal, { attributes:true, attributeFilter:["class"] });
  new MutationObserver(scheduleRender).observe(list, { childList:true });
  list.addEventListener("change", scheduleRender);
  scheduleRender();
}
