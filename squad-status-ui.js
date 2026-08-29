const modal = document.getElementById("squadModal");
const list = document.getElementById("squadList");

if (modal && list) {
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

      // De opprinnelige to checkboxene beholdes for eksisterende logikk,
      // men skjules visuelt. Det nye statusfeltet styrer dem.
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

  list.addEventListener("change", () => {
    requestAnimationFrame(renderSquadGroups);
  });

  if (!modal.classList.contains("hidden")) renderSquadGroups();
}
