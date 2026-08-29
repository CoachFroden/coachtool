const modal = document.getElementById("squadModal");
const list = document.getElementById("squadList");

function ensureSquadStatusStyles() {
  if (document.getElementById("squad-status-ui-style")) return;

  const style = document.createElement("style");
  style.id = "squad-status-ui-style";
  style.textContent = `
    #squadModal .modal-content {
      max-width: 430px;
    }

    #squadModal #squadList {
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding: 0;
      margin: 14px 0 0;
      list-style: none;
    }

    #squadModal .squad-group-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-top: 13px;
      padding: 12px 13px;
      border-radius: 15px;
      border: 1px solid rgba(148,163,184,.16);
    }

    #squadModal .squad-group-heading:first-child { margin-top: 0; }
    #squadModal .squad-group-heading div { min-width: 0; }
    #squadModal .squad-group-heading strong,
    #squadModal .squad-group-heading small { display: block; }
    #squadModal .squad-group-heading strong {
      font-size: 13px;
      letter-spacing: .045em;
    }
    #squadModal .squad-group-heading small {
      margin-top: 3px;
      color: #8da0b7;
      font-size: 9px;
    }
    #squadModal .squad-group-heading > span {
      min-width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 11px;
      font-weight: 850;
      font-size: 13px;
    }

    #squadModal .squad-group-heading.starter {
      background: rgba(22,163,74,.12);
      border-color: rgba(74,222,128,.30);
      color: #4ade80;
    }
    #squadModal .squad-group-heading.starter > span { background: rgba(22,163,74,.16); }

    #squadModal .squad-group-heading.bench {
      background: rgba(245,158,11,.10);
      border-color: rgba(245,158,11,.28);
      color: #fbbf24;
    }
    #squadModal .squad-group-heading.bench > span { background: rgba(245,158,11,.13); }

    #squadModal .squad-group-heading.absent {
      background: rgba(100,116,139,.09);
      border-color: rgba(148,163,184,.18);
      color: #94a3b8;
    }
    #squadModal .squad-group-heading.absent > span { background: rgba(100,116,139,.13); }

    #squadModal .squad-row {
      min-height: 56px;
      display: grid !important;
      grid-template-columns: minmax(0,1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 10px 11px !important;
      border-radius: 13px !important;
      border: 1px solid rgba(148,163,184,.12);
      background: #111b2c !important;
      color: #f8fafc;
    }

    #squadModal .squad-row.squad-starter {
      border-color: rgba(74,222,128,.20);
      background: linear-gradient(90deg,rgba(22,163,74,.15),rgba(17,27,44,.94)) !important;
    }
    #squadModal .squad-row.squad-bench {
      border-color: rgba(245,158,11,.17);
      background: linear-gradient(90deg,rgba(245,158,11,.09),rgba(17,27,44,.94)) !important;
    }
    #squadModal .squad-row.squad-absent {
      opacity: .64 !important;
      background: rgba(15,23,42,.76) !important;
    }

    #squadModal .squad-row .player-name {
      min-width: 0;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none !important;
    }

    #squadModal .squad-original-control {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0,0,0,0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }

    #squadModal .squad-status-select {
      width: 122px;
      min-height: 38px;
      padding: 0 31px 0 10px;
      border-radius: 11px;
      border: 1px solid rgba(148,163,184,.18);
      background: #0b1423;
      color: #e5edf7;
      font: inherit;
      font-size: 11px;
      font-weight: 750;
    }

    #squadModal .squad-starter .squad-status-select {
      border-color: rgba(74,222,128,.28);
      color: #4ade80;
      background: rgba(22,163,74,.10);
    }
    #squadModal .squad-bench .squad-status-select {
      border-color: rgba(245,158,11,.26);
      color: #fbbf24;
      background: rgba(245,158,11,.08);
    }
    #squadModal .squad-absent .squad-status-select {
      color: #94a3b8;
    }

    #squadModal .starter-counter {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 0 11px;
      border: 1px solid rgba(74,222,128,.22);
      border-radius: 999px;
      background: rgba(22,163,74,.08);
      color: #86efac;
      font-weight: 800;
      font-size: 12px;
    }

    @media (max-width: 390px) {
      #squadModal .squad-row { grid-template-columns: minmax(0,1fr) 112px; }
      #squadModal .squad-status-select { width: 112px; font-size: 10px; }
    }
  `;
  document.head.appendChild(style);
}

if (modal && list) {
  ensureSquadStatusStyles();

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

  function makeHeading(kind, title, subtitle, count) {
    const li = document.createElement("li");
    li.className = `squad-group-heading ${kind}`;
    li.innerHTML = `
      <div>
        <strong>${title}</strong>
        <small>${subtitle}</small>
      </div>
      <span>${count}</span>
    `;
    return li;
  }

  function renderSquadGroups() {
    const rows = [...list.querySelectorAll(":scope > .squad-row")];
    if (!rows.length) return;

    list.querySelectorAll(":scope > .squad-group-heading").forEach((el) => el.remove());

    const groups = { starter: [], bench: [], absent: [] };

    rows.forEach((row) => {
      const status = statusForRow(row);
      if (!status) return;

      row.classList.remove("squad-starter", "squad-bench", "squad-absent");
      row.classList.add(`squad-${status}`);

      const select = ensureStatusControl(row);
      select.value = status;

      row.querySelectorAll("label.checkbox").forEach((label) => {
        label.classList.add("squad-original-control");
      });

      groups[status].push(row);
    });

    list.innerHTML = "";

    const sections = [
      ["starter", "STARTERE", "Spiller fra start", groups.starter],
      ["bench", "INNBYTTERE", "Tilgjengelig fra benken", groups.bench],
      ["absent", "IKKE TIL STEDE", "Ikke med i kamptroppen", groups.absent]
    ];

    sections.forEach(([kind, title, subtitle, rowsInGroup]) => {
      if (!rowsInGroup.length) return;
      list.appendChild(makeHeading(kind, title, subtitle, rowsInGroup.length));
      rowsInGroup.forEach((row) => list.appendChild(row));
    });
  }

  const modalObserver = new MutationObserver(() => {
    if (!modal.classList.contains("hidden")) {
      requestAnimationFrame(renderSquadGroups);
    }
  });
  modalObserver.observe(modal, { attributes: true, attributeFilter: ["class"] });

  list.addEventListener("change", () => requestAnimationFrame(renderSquadGroups));

  if (!modal.classList.contains("hidden")) renderSquadGroups();
}
