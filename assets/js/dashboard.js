// ===== Hilfsfunktionen
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt = (n) => (Number(n) || 0).toFixed(2);

function saveAdminSecret() {
  const v = $("#admin_secret").value.trim();
  localStorage.setItem("ADMIN_SECRET", v);
}
function getAdminSecret() {
  return localStorage.getItem("ADMIN_SECRET") || "";
}

function rowHtml(d) {
  return `
    <tr data-id="${d.driver_id}" data-name="${(d.name || "").toLowerCase()}">
      <td class="mono">${d.driver_id}</td>
      <td>${d.name || ""}</td>
      <td class="right mono">${fmt(d.cash_to_bring)}</td>
      <td class="right mono">${fmt(d.cash_due_total)}</td>
      <td class="right mono">${fmt(d.cash_remitted)}</td>
      <td class="right"><button class="btn small" data-view="${
        d.driver_id
      }" data-name="${d.name || ""}">Öffnen</button></td>
    </tr>`;
}

// ===== Dashboard laden
async function loadDashboard() {
  $("#dashBox").innerHTML = '<div class="hint">Wird geladen...</div>';
  try {
    const r = await TaxiApi.api("dashboard", {}, "POST");
    const rows = (r.drivers || []).sort(
      (a, b) => (b.cash_to_bring || 0) - (a.cash_to_bring || 0)
    );

    // Summen
    $("#countAll").textContent = String(rows.length);
    const sumAll = rows.reduce((s, x) => s + (Number(x.cash_to_bring) || 0), 0);
    $("#sumAll").textContent = fmt(sumAll) + " €";

    const html = `
      <table>
        <thead>
          <tr>
            <th style="width:120px">ID</th>
            <th>Name</th>
            <th class="right" style="width:160px">Abzugeben €</th>
            <th class="right" style="width:160px">Gesamt €</th>
            <th class="right" style="width:160px">Abgegeben €</th>
            <th style="width:120px"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(rowHtml).join("")}
        </tbody>
      </table>`;
    $("#dashBox").innerHTML = html;

    bindOpenButtons();
  } catch (err) {
    $("#dashBox").innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
  }
}

// ===== Suchfilter
function bindSearch() {
  $("#search").addEventListener("input", () => {
    const q = $("#search").value.trim().toLowerCase();
    $$("#dashBox tbody tr").forEach((tr) => {
      const id = tr.getAttribute("data-id") || "";
      const name = tr.getAttribute("data-name") || "";
      const txt = (id + " " + name).toLowerCase();
      tr.style.display = txt.includes(q) ? "" : "none";
    });
  });
}

// ===== Fahrer-Auswahl und Detailanzeige
function bindOpenButtons() {
  $$("#dashBox [data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const driver_id = btn.getAttribute("data-view");
      const name = btn.getAttribute("data-name") || "";
      // Werte aus der Zeile holen
      const tr = btn.closest("tr");
      const cash_to_bring = tr ? tr.children[2].textContent : "0";
      const cash_due_total = tr ? tr.children[3].textContent : "0";
      const cash_remitted = tr ? tr.children[4].textContent : "0";

      $("#driverPanel").style.display = "block";
      $("#drvTitle").textContent = `Fahrer — ${name || driver_id}`;
      $("#drvId").textContent = driver_id;
      $("#drvName").textContent = name || "—";
      $("#drvDue").textContent = cash_to_bring;
      $("#drvAcc").textContent = cash_due_total;
      $("#drvRem").textContent = cash_remitted;

      // Dokumentenblöcke zurücksetzen
      $("#docsWrap").style.display = "none";
      $("#docsHint").style.display = "none";
      $("#docInvoice").innerHTML = "";
      $("#docKT").innerHTML = "";
      $("#docMisc").innerHTML = "";

      // Button „Dokumente anzeigen“
      $("#btnShowDocs").onclick = () => loadDriverDocs(driver_id);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });
  });
}

// ===== Fahrerdokumente laden (Admin-Endpunkt)
async function loadDriverDocs(driver_id) {
  const admin_secret = getAdminSecret();
  if (!admin_secret) {
    $("#docsHint").style.display = "block";
    $(
      "#docsHint"
    ).innerHTML = `<div class="bad">ADMIN_SECRET (oben auf der Seite) ist nicht angegeben. Ohne dieses kann keine Abfrage der Fahrerdokumente erfolgen.</div>`;
    return;
  }

  try {
    const r = await TaxiApi.api("driver_reports_admin", {
      admin_secret,
      driver_id,
      days: 31,
    });
    if (!r.items || !r.items.length) {
      $("#docsWrap").style.display = "block";
      $("#docInvoice").innerHTML =
        '<div class="hint">Keine Einträge im Zeitraum.</div>';
      $("#docKT").innerHTML =
        '<div class="hint">Keine Einträge im Zeitraum.</div>';
      $("#docMisc").innerHTML =
        '<div class="hint">Keine Einträge im Zeitraum.</div>';
      return;
    }

    // Listen sammeln
    const invoices = [];
    const kts = [];
    const miscs = [];
    r.items.forEach((it) => {
      (it.invoice_trips || []).forEach((x) =>
        invoices.push({ date: it.date, car_no: it.car_no, ...x })
      );
      (it.kt_log || []).forEach((x) =>
        kts.push({ date: it.date, car_no: it.car_no, ...x })
      );
      (it.misc_log || []).forEach((x) =>
        miscs.push({ date: it.date, car_no: it.car_no, ...x })
      );
    });

    const invHtml = invoices.length
      ? `
      <table>
        <thead><tr><th style="width:120px">Datum</th><th style="width:120px">Auto</th><th style="width:120px">Typ</th><th>Beschreibung</th><th class="right" style="width:120px">Betrag €</th></tr></thead>
        <tbody>
          ${invoices
            .map(
              (r) => `
            <tr>
              <td class="mono">${r.date || ""}</td>
              <td class="mono">${r.car_no || ""}</td>
              <td>${r.type || ""}</td>
              <td>${r.note || ""}</td>
              <td class="right mono">${
                r.amount != null ? fmt(r.amount) : ""
              }</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`
      : '<div class="hint">Keine Positionen.</div>';

    const ktHtml = kts.length
      ? `
      <table>
        <thead><tr><th style="width:120px">Datum</th><th style="width:120px">Auto</th><th>Beschreibung</th><th class="right" style="width:120px">Betrag (Info) €</th></tr></thead>
        <tbody>
          ${kts
            .map(
              (r) => `
            <tr>
              <td class="mono">${r.date || ""}</td>
              <td class="mono">${r.car_no || ""}</td>
              <td>${r.desc || ""}</td>
              <td class="right mono">${
                r.amount != null ? fmt(r.amount) : ""
              }</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`
      : '<div class="hint">Keine Einträge.</div>';

    const miscHtml = miscs.length
      ? `
      <table>
        <thead><tr><th style="width:120px">Datum</th><th style="width:120px">Auto</th><th>Beschreibung</th><th>Hinweis</th></tr></thead>
        <tbody>
          ${miscs
            .map(
              (r) => `
            <tr>
              <td class="mono">${r.date || ""}</td>
              <td class="mono">${r.car_no || ""}</td>
              <td>${r.desc || ""}</td>
              <td>${r.note || ""}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`
      : '<div class="hint">Keine Einträge.</div>';

    $("#docsWrap").style.display = "block";
    $("#docInvoice").innerHTML = invHtml;
    $("#docKT").innerHTML = ktHtml;
    $("#docMisc").innerHTML = miscHtml;
  } catch (err) {
    $("#docsWrap").style.display = "none";
    $("#docsHint").style.display = "block";
    $("#docsHint").innerHTML = `
      <div class="bad">Dokumente konnten nicht geladen werden: ${err.message}</div>
      <div class="hint">Der Endpunkt <code>driver_reports_admin</code> scheint im Backend zu fehlen. Er lässt sich leicht hinzufügen (ca. 10–15 Zeilen Code zum Lesen aus dem Sheet „Reports“). Wenn gewünscht, kann ich den Codeblock senden.</div>
    `;
  }
}

// ===== Init
window.addEventListener("DOMContentLoaded", () => {
  const saved = getAdminSecret();
  if (saved) $("#admin_secret").value = saved;

  $("#saveAdmin").addEventListener("click", saveAdminSecret);
  $("#loadDashboard").addEventListener("click", loadDashboard);
  bindSearch();

  // Dashboard automatisch laden
  loadDashboard();
});
