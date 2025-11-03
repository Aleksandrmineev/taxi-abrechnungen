// ===== Утилиты и состояние =====
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt = (n) => (Number(n) || 0).toFixed(2);
const uuid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
const num = (val) => Number(String(val ?? 0).replace(",", ".")) || 0;

function creds() {
  return {
    driver_id: localStorage.getItem("driver_id") || "",
    token: localStorage.getItem("token") || "",
  };
}
function storeCreds() {
  localStorage.setItem("driver_id", $("#driver_id").value.trim());
  localStorage.setItem("token", $("#token").value.trim());
  updateLoginTag();
}
function updateLoginTag() {
  const c = creds();
  const el = $("#loginTag");
  if (el)
    el.textContent = c.driver_id
      ? `Fahrer: ${c.driver_id}`
      : "Nicht angemeldet";
}

// ===== Верхние табы (только главный таббар, не внутренние) =====
function initTabs() {
  const topTabBtns = $$("nav.tabs:not(.tabs--sub) .tab-btn");
  topTabBtns.forEach((b) => {
    b.addEventListener("click", () => {
      topTabBtns.forEach((x) => x.setAttribute("aria-selected", "false"));
      b.setAttribute("aria-selected", "true");
      const tab = b.dataset.tab; // report | remit | summary | token | dashboard
      $$('section[role="tabpanel"]').forEach((sec) => {
        sec.style.display = sec.id === "tab-" + tab ? "block" : "none";
      });
    });
  });
}

// ===== Динамические строки таблиц =====
function rowInv(type = "KT", note = "", amount = 0) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>
      <select class="inv-type">
        <option value="KT"${
          type === "KT" ? " selected" : ""
        }>KT (Krankentransport)</option>
        <option value="Invoice"${
          type === "Invoice" ? " selected" : ""
        }>Invoice (Rechnung)</option>
      </select>
    </td>
    <td><input class="inv-note" placeholder="Beschreibung / Patient / Firma" value="${
      note || ""
    }"></td>
    <td><input class="inv-amount" type="number" step="0.01" value="${
      amount || 0
    }"></td>
    <td><button type="button" class="btn danger small del">×</button></td>
  `;
  tr.querySelector(".del").addEventListener("click", () => {
    tr.remove();
    recalc();
    Receipt.refreshIfVisible();
  });
  tr.querySelector(".inv-amount").addEventListener("input", () => {
    recalc();
    Receipt.refreshIfVisible();
  });
  return tr;
}
function rowKT(desc = "", amount = "") {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="kt-desc" placeholder="Beschreibung KT" value="${
      desc || ""
    }"></td>
    <td><input class="kt-amount" type="number" step="0.01" placeholder="optional" value="${
      amount || ""
    }"></td>
    <td><button type="button" class="btn danger small del">×</button></td>
  `;
  tr.querySelector(".del").addEventListener("click", () => {
    tr.remove();
    recalc();
    Receipt.refreshIfVisible();
  });
  tr.querySelector(".kt-amount").addEventListener("input", () => {
    recalc();
    Receipt.refreshIfVisible();
  });
  return tr;
}
function rowMisc(desc = "", note = "") {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="misc-desc" placeholder="Beschreibung" value="${
      desc || ""
    }"></td>
    <td><input class="misc-note" placeholder="Hinweis" value="${
      note || ""
    }"></td>
    <td><button type="button" class="btn danger small del">×</button></td>
  `;
  tr.querySelector(".del").addEventListener("click", () => {
    tr.remove();
    Receipt.refreshIfVisible();
  });
  return tr;
}

const invTbody = $("#invTable tbody");
const ktTbody = $("#ktTable tbody");
const msTbody = $("#miscTable tbody");

function bindDynamicButtons() {
  $("#addInv")?.addEventListener("click", () => invTbody.appendChild(rowInv()));
  $("#addKT")?.addEventListener("click", () => ktTbody.appendChild(rowKT()));
  $("#addMisc")?.addEventListener("click", () =>
    msTbody.appendChild(rowMisc())
  );
  if (invTbody && !invTbody.children.length) invTbody.appendChild(rowInv());
}

// ===== Сбор данных и расчёты =====
function collectInvoiceTrips() {
  return $$("#invTable tbody tr")
    .map((tr) => {
      return {
        type: tr.querySelector(".inv-type").value,
        note: tr.querySelector(".inv-note").value.trim(),
        amount: num(tr.querySelector(".inv-amount").value),
      };
    })
    .filter((x) => x.amount > 0 || x.note);
}
function collectKtLog() {
  return $$("#ktTable tbody tr")
    .map((tr) => {
      const desc = tr.querySelector(".kt-desc").value.trim();
      const amountVal = tr.querySelector(".kt-amount").value;
      return { desc, amount: amountVal ? num(amountVal) : undefined };
    })
    .filter((x) => x.desc || x.amount);
}
function collectMisc() {
  return $$("#miscTable tbody tr")
    .map((tr) => {
      return {
        desc: tr.querySelector(".misc-desc").value.trim(),
        note: tr.querySelector(".misc-note").value.trim(),
      };
    })
    .filter((x) => x.desc || x.note);
}

function recalc() {
  const f = $("#fReport");
  if (!f) return;

  const meter = num(f.meter_sales_total.value);
  const exp = num(f.expenses_cash.value);
  const card = num(f.card_payments_total.value);
  const qr = num(f.qr_payments_total.value);
  const loy = num(f.loyalty_sum.value);

  const invList = collectInvoiceTrips();
  const invSum = invList.reduce((s, i) => s + num(i.amount), 0);

  const ktList = collectKtLog();
  const ktSum = ktList.reduce((s, i) => s + (i.amount ? num(i.amount) : 0), 0);

  const due = meter - exp - invSum - card - qr - loy;

  $("#invSum") && ($("#invSum").textContent = fmt(invSum));
  $("#ktSum") && ($("#ktSum").textContent = fmt(ktSum));
  $("#sumInvPill") && ($("#sumInvPill").textContent = fmt(invSum) + " €");
  $("#sumKtPill") && ($("#sumKtPill").textContent = fmt(ktSum) + " €");
  const dueEl = $("#dueNow");
  if (dueEl) {
    dueEl.textContent = fmt(due) + " €";
    dueEl.className = "mono " + (due >= 0 ? "ok" : "bad");
  }
}

// ===== «Чек» (Summary в 6-м табе "send") =====
const Receipt = (() => {
  const f = () => $("#fReport");
  const box = () => $("#receipt");
  const sendTab = () => $("#sub-send");

  function numSafe(v) {
    const n = parseFloat(String(v).replace(",", "."));
    return isFinite(n) ? n : 0;
  }
  function sumBy(arr, key) {
    return arr.reduce((s, x) => s + numSafe(x[key]), 0);
  }
  function esc(s = "") {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function collectAll() {
    const form = f();
    if (!form) return {};

    // Явно читаем даже если поле disabled
    const get = (name) => {
      const el = form.elements[name];
      return el ? el.value : "";
    };

    const data = {
      driver_id: get("driver_id"),
      date: get("date"),
      shift_no: get("shift_no"),
      car_no: get("car_no"),
      km_driven: get("km_driven"),
      shift_start: get("shift_start"),
      shift_end: get("shift_end"),
      odo_end: get("odo_end"),
      meter_sales_total: get("meter_sales_total"),
      expenses_cash: get("expenses_cash"),
      card_payments_total: get("card_payments_total"),
      qr_payments_total: get("qr_payments_total"),
      loyalty_count: get("loyalty_count"),
      loyalty_sum: get("loyalty_sum"),
      comment: (get("comment") || "").trim(),
    };

    // Таблицы читаем как и раньше
    data.invoice_trips = collectInvoiceTrips();
    data.kt_log = collectKtLog();
    data.misc_log = collectMisc();

    // Подсчёты
    const invSum = data.invoice_trips.reduce(
      (s, x) => s + (Number(x.amount) || 0),
      0
    );
    const ktSum = data.kt_log.reduce(
      (s, x) => s + (x.amount ? Number(x.amount) : 0),
      0
    );
    const tm = Number(String(data.meter_sales_total).replace(",", ".")) || 0;
    const out =
      (Number(String(data.expenses_cash).replace(",", ".")) || 0) +
      invSum +
      (Number(String(data.card_payments_total).replace(",", ".")) || 0) +
      (Number(String(data.qr_payments_total).replace(",", ".")) || 0) +
      (Number(String(data.loyalty_sum).replace(",", ".")) || 0);

    data._calc = { invSum, ktSum, dueNow: Math.max(0, tm - out) };
    return data;
  }

  function row(label, value) {
    return `
      <div class="receipt__row">
        <div class="receipt__label">${esc(label)}</div>
        <div class="receipt__value">${esc(value)}</div>
      </div>`;
  }

  function render() {
    const target = box();
    if (!target) return;
    const d = collectAll();

    let html = `
      <div class="receipt__title">MurtalTaxi — Schichtbericht</div>
      <div class="receipt__meta">${new Date().toLocaleString()}</div>
      <div class="receipt__sep"></div>

      <div class="receipt__section">
        <div class="receipt__sub">1) Fahrer & Zeiten</div>
        ${row("Driver ID", d.driver_id || "—")}
        ${row("Datum", d.date || "—")}
        ${row("Schichtnummer", d.shift_no || "—")}
        ${row("Fahrzeug", d.car_no || "—")}
        ${row("km (gefahren)", d.km_driven || "0")}
        ${row("Start", d.shift_start || "—")}
        ${row("Ende", d.shift_end || "—")}
        ${row("Odometer Ende", d.odo_end || "0")}
      </div>

      <div class="receipt__sep"></div>

      <div class="receipt__section">
        <div class="receipt__sub">2) Einnahmen / Ausgaben</div>
        ${row("Taxameter-Umsatz €", fmt(d.meter_sales_total))}
        ${row("Barausgaben €", fmt(d.expenses_cash))}
        ${row("Karte (Summe) €", fmt(d.card_payments_total))}
        ${row("QR (Summe) €", fmt(d.qr_payments_total))}
        ${row("Treuekarten (Anzahl)", d.loyalty_count || "0")}
        ${row("Treuekarten (Betrag) €", fmt(d.loyalty_sum))}
      </div>

      <div class="receipt__sep"></div>

      <div class="receipt__section">
        <div class="receipt__sub">3) Fahrten auf Rechnung</div>
        ${
          d.invoice_trips && d.invoice_trips.length
            ? d.invoice_trips
                .map((x, i) =>
                  row(
                    `${i + 1}. ${x.type || "Typ"} — ${x.note || ""}`,
                    `${fmt(x.amount)} €`
                  )
                )
                .join("")
            : row("—", "—")
        }
        ${row("Summe Rechnung/KT €", fmt(d._calc.invSum))}
      </div>

      <div class="receipt__sep"></div>

      <div class="receipt__section">
        <div class="receipt__sub">4) Krankentransporte (Info)</div>
        ${
          d.kt_log && d.kt_log.length
            ? d.kt_log
                .map((x, i) =>
                  row(
                    `${i + 1}. ${x.desc || ""}`,
                    x.amount ? `${fmt(x.amount)} €` : "—"
                  )
                )
                .join("")
            : row("—", "—")
        }
        ${row("KT Summe (Info) €", fmt(d._calc.ktSum))}
      </div>

      <div class="receipt__sep"></div>

      <div class="receipt__section">
        <div class="receipt__sub">5) Kommentar</div>
        ${row(
          "Kommentar",
          d.comment && d.comment.trim() ? d.comment.trim() : "—"
        )}
      </div>

      <div class="receipt__sep"></div>

      <div class="receipt__section">
        <div class="receipt__sub">Ergebnis</div>
        ${row("Abzugeben pro Schicht €", fmt(d._calc.dueNow))}
      </div>
    `;

    target.innerHTML = html;

    // синхронизируем «пилюли», если они существуют
    $("#sumInvPill") &&
      ($("#sumInvPill").textContent = `${fmt(d._calc.invSum)} €`);
    $("#sumKtPill") &&
      ($("#sumKtPill").textContent = `${fmt(d._calc.ktSum)} €`);
    const dueNow = $("#dueNow");
    if (dueNow) dueNow.textContent = `${fmt(d._calc.dueNow)} €`;
  }

  function buildPlainText() {
    const d = collectAll();
    const lines = [];
    const add = (k, v) => lines.push(`${k}: ${v ?? ""}`);

    lines.push(`MurtalTaxi — Schichtbericht`);
    lines.push(`${new Date().toLocaleString()}`);
    lines.push(`----------------------------------------`);
    lines.push(`1) Fahrer & Zeiten`);
    add("Driver ID", d.driver_id || "—");
    add("Datum", d.date || "—");
    add("Schichtnummer", d.shift_no || "—");
    add("Fahrzeug", d.car_no || "—");
    add("km (gefahren)", d.km_driven || "0");
    add("Start", d.shift_start || "—");
    add("Ende", d.shift_end || "—");
    add("Odometer Ende", d.odo_end || "0");

    lines.push(`----------------------------------------`);
    lines.push(`2) Einnahmen / Ausgaben`);
    add("Taxameter-Umsatz €", fmt(d.meter_sales_total));
    add("Barausgaben €", fmt(d.expenses_cash));
    add("Karte (Summe) €", fmt(d.card_payments_total));
    add("QR (Summe) €", fmt(d.qr_payments_total));
    add("Treuekarten (Anzahl)", d.loyalty_count || "0");
    add("Treuekarten (Betrag) €", fmt(d.loyalty_sum));

    lines.push(`----------------------------------------`);
    lines.push(`3) Fahrten auf Rechnung`);
    if (d.invoice_trips?.length) {
      d.invoice_trips.forEach((x, i) =>
        add(
          `${i + 1}. ${x.type || "Typ"} — ${x.note || ""}`,
          `${fmt(x.amount)} €`
        )
      );
    } else {
      lines.push("—");
    }
    add("Summe Rechnung/KT €", fmt(d._calc.invSum));

    lines.push(`----------------------------------------`);
    lines.push(`4) Krankentransporte (Info)`);
    if (d.kt_log?.length) {
      d.kt_log.forEach((x, i) =>
        add(`${i + 1}. ${x.desc || ""}`, x.amount ? `${fmt(x.amount)} €` : "—")
      );
    } else {
      lines.push("—");
    }
    add("KT Summe (Info) €", fmt(d._calc.ktSum));

    lines.push(`----------------------------------------`);
    lines.push(`5) Kommentar`);
    lines.push(d.comment && d.comment.trim() ? d.comment.trim() : "—");

    lines.push(`----------------------------------------`);
    lines.push(`Ergebnis`);
    add("Abzugeben pro Schicht €", fmt(d._calc.dueNow));

    return lines.join("\n");
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function dateStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(
      d.getHours()
    )}-${p(d.getMinutes())}`;
  }

  function bindButtons() {
    $("#copyReceipt")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(buildPlainText());
      const btn = $("#copyReceipt");
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = "Kopiert ✓";
        setTimeout(() => (btn.textContent = prev), 1200);
      }
    });
    $("#saveReceipt")?.addEventListener("click", () => {
      downloadBlob(
        buildPlainText(),
        `schichtbericht_${dateStamp()}.txt`,
        "text/plain;charset=utf-8"
      );
    });
    $("#saveJson")?.addEventListener("click", () => {
      const d = collectAll();
      downloadBlob(
        JSON.stringify(d, null, 2),
        `schichtbericht_${dateStamp()}.json`,
        "application/json"
      );
    });
  }

  function isVisible() {
    const el = sendTab();
    return !!el && el.style.display !== "none";
  }

  function refreshIfVisible() {
    if (isVisible()) render();
  }

  function onTabSwitchHook() {
    // вызывай при переключении на sub-send
    render();
    bindButtons();
  }

  return { render, refreshIfVisible, onTabSwitchHook };
})();

// ===== Remit Receipt (Bargeld abgeben) =====
const RemitReceipt = (() => {
  let server = null; // { remit_id, cash_to_bring } — после ответа API

  const f = () => $("#fRemit");
  const box = () => $("#remitReceipt");
  const btnCopy = () => $("#copyRemit");
  const btnSaveTxt = () => $("#saveRemitTxt");
  const btnSaveJson = () => $("#saveRemitJson");

  function esc(s = "") {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  function dateStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(
      d.getHours()
    )}-${p(d.getMinutes())}`;
  }
  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function ensureUI() {
    if (!f()) return;
    // контейнер чека + кнопки под формой
    if (!box()) {
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="receipt" id="remitReceipt" style="margin-top:16px"></div>
        <div class="actions" style="margin-top:12px; gap:8px">
          <button class="btn" type="button" id="copyRemit">Kopieren</button>
          <button class="btn ghost" type="button" id="saveRemitTxt">Speichern (.txt)</button>
          <button class="btn ghost" type="button" id="saveRemitJson">Speichern (.json)</button>
        </div>`;
      // Вставим сразу под формой
      f().insertAdjacentElement("afterend", wrap);
    }
    // события кнопок
    btnCopy()?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(buildPlainText());
      const b = btnCopy();
      if (!b) return;
      const prev = b.textContent;
      b.textContent = "Kopiert ✓";
      setTimeout(() => (b.textContent = prev), 1200);
    });
    btnSaveTxt()?.addEventListener("click", () => {
      downloadBlob(
        buildPlainText(),
        `remit_${dateStamp()}.txt`,
        "text/plain;charset=utf-8"
      );
    });
    btnSaveJson()?.addEventListener("click", () => {
      downloadBlob(
        JSON.stringify(collect(), null, 2),
        `remit_${dateStamp()}.json`,
        "application/json"
      );
    });
  }

  function collect() {
    const form = f();
    if (!form) return {};
    const { driver_id } = creds();
    const date = form.date?.value || "";
    const amount = num(form.amount?.value);
    const comment = (form.comment?.value || "").trim();
    return {
      driver_id,
      date,
      amount,
      comment,
      // добавим серверные поля, если уже есть
      remit_id: server?.remit_id || "",
      cash_to_bring:
        typeof server?.cash_to_bring === "number"
          ? server.cash_to_bring
          : undefined,
      _printed_at: new Date().toISOString(),
    };
  }

  function row(label, value) {
    return `
      <div class="receipt__row">
        <div class="receipt__label">${esc(label)}</div>
        <div class="receipt__value">${esc(value)}</div>
      </div>`;
  }

  function render() {
    ensureUI();
    const target = box();
    if (!target) return;
    const d = collect();

    const dtHuman = new Date().toLocaleString();
    let html = `
      <div class="receipt__title">MurtalTaxi — Bargeldabgabe</div>
      <div class="receipt__meta">${dtHuman}</div>
      <div class="receipt__sep"></div>

      <div class="receipt__section">
        ${row("Fahrer", d.driver_id || "—")}
        ${row("Datum", d.date || "—")}
        ${d.remit_id ? row("Abgabe ID", d.remit_id) : ""}
        ${row("Betrag (Bar) €", fmt(d.amount))}
        ${
          typeof d.cash_to_bring === "number"
            ? row("Rest nach Abgabe €", fmt(d.cash_to_bring))
            : ""
        }
      </div>

      ${
        d.comment
          ? `
        <div class="receipt__sep"></div>
        <div class="receipt__section">
          <div class="receipt__sub">Kommentar</div>
          ${row("Hinweis", d.comment)}
        </div>
      `
          : ""
      }
    `;
    target.innerHTML = html;
  }

  function buildPlainText() {
    const d = collect();
    const lines = [];
    const add = (k, v) => lines.push(`${k}: ${v ?? ""}`);
    lines.push("MurtalTaxi — Bargeldabgabe");
    lines.push(new Date().toLocaleString());
    lines.push("----------------------------------------");
    add("Fahrer", d.driver_id || "—");
    add("Datum", d.date || "—");
    if (d.remit_id) add("Abgabe ID", d.remit_id);
    add("Betrag (Bar) €", fmt(d.amount));
    if (typeof d.cash_to_bring === "number")
      add("Rest nach Abgabe €", fmt(d.cash_to_bring));
    if (d.comment) {
      lines.push("----------------------------------------");
      lines.push("Kommentar");
      lines.push(d.comment);
    }
    return lines.join("\n");
  }

  function applyServerData(r) {
    server = { remit_id: r?.remit_id || "", cash_to_bring: r?.cash_to_bring };
    render();
  }

  function mount() {
    ensureUI();
    render();
    // live-обновление при вводе
    f()?.addEventListener("input", render);
  }

  return { mount, render, applyServerData };
})();

// ===== Формы: отчёт, сдача, свод, смена PIN, дашборд =====
function bindForms() {
  // Сохранение логина
  $("#saveCreds")?.addEventListener("click", storeCreds);

  // Пересчёт
  $("#calcBtn")?.addEventListener("click", () => {
    recalc();
    Receipt.refreshIfVisible();
  });
  $$("#fReport input, #fReport select, #fReport textarea").forEach((el) => {
    el.addEventListener("input", () => {
      if (
        [
          "meter_sales_total",
          "expenses_cash",
          "card_payments_total",
          "qr_payments_total",
          "loyalty_sum",
        ].includes(el.name)
      ) {
        recalc();
      }
      Receipt.refreshIfVisible();
    });
  });

  // Отправка отчёта
  $("#fReport")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { driver_id, token } = creds();
    if (!driver_id || !token) {
      alert(
        'Geben Sie zuerst Driver ID und PIN/Token ein und klicken Sie auf "Speichern".'
      );
      return;
    }

    const f = e.target;
    const payload = {
      driver_id,
      token,
      report_id: uuid(),
      date: f.date.value,
      shift_no: f.shift_no.value.trim(),
      car_no: f.car_no.value,
      shift_start: f.shift_start.value,
      shift_end: f.shift_end.value,
      odo_end: num(f.odo_end.value),
      km_driven: num(f.km_driven.value),
      meter_sales_total: num(f.meter_sales_total.value),
      expenses_cash: num(f.expenses_cash.value),
      card_payments_total: num(f.card_payments_total.value),
      qr_payments_total: num(f.qr_payments_total.value),
      loyalty_count: num(f.loyalty_count.value),
      loyalty_sum: num(f.loyalty_sum.value),
      invoice_trips: collectInvoiceTrips(),
      kt_log: collectKtLog(),
      misc_log: collectMisc(),
      comment: f.comment.value.trim(),
    };

    const btn = e.submitter; // та самая «Bericht senden»
    const box = $("#reportResult"); // куда рисуем подтверждение
    setBusy(box, true);

    try {
      recalc();
      const r = await withButtonLoading(btn, () =>
        TaxiApi.api("report", payload)
      );
      box.innerHTML = `
        <div class="row" style="gap:12px; flex-wrap:wrap">
          <span class="pill mono">Bericht ID: ${r.report_id}</span>
          <span class="pill mono">Abzugeben pro Schicht: <b>${fmt(
            r.cash_due_per_shift
          )} €</b></span>
          <span class="pill mono">Kumulativer Restbetrag: <b>${fmt(
            r.cash_to_bring
          )} €</b></span>
          <span class="pill mono">KT (Info): ${fmt(r.kt_info_total)} €</span>
        </div>
        <div class="hint">Erneutes Senden mit derselben report_id erzeugt kein Duplikat.</div>`;
    } catch (err) {
      box.innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
    } finally {
      setBusy(box, false);
    }
  });

  // Сдача наличных
  $("#fRemit")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { driver_id, token } = creds();
    if (!driver_id || !token) {
      alert("Geben Sie Driver ID und PIN/Token ein und speichern Sie.");
      return;
    }

    const f = e.target;
    const payload = {
      driver_id,
      token,
      date: f.date.value,
      amount: num(f.amount.value),
      comment: f.comment.value.trim(),
      remit_id: uuid(),
    };

    const btn = e.submitter; // кнопка «Abgabe speichern»
    const box = $("#remitResult"); // контейнер результата под формой
    setBusy(box, true);

    try {
      const r = await withButtonLoading(btn, () =>
        TaxiApi.api("remit", payload)
      );
      box.innerHTML = `
      <div class="row" style="gap:12px; flex-wrap:wrap">
        <span class="pill mono">Abgabe ID: ${r.remit_id}</span>
        <span class="pill mono">Rest nach Abgabe: <b>${fmt(
          r.cash_to_bring
        )} €</b></span>
      </div>`;

      // 👉 Обновляем «чек» Bargeldabgabe: передаём remit_id и остаток
      RemitReceipt.applyServerData(r);
    } catch (err) {
      box.innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
    } finally {
      setBusy(box, false);
    }
  });

  // Свод по водителю
  $("#loadSummary")?.addEventListener("click", async (e) => {
    const { driver_id, token } = creds();
    if (!driver_id || !token) {
      alert("Geben Sie Driver ID und PIN/Token ein und speichern Sie.");
      return;
    }
    const btn = e.currentTarget;
    const box = $("#summaryBox");
    setBusy(box, true);

    try {
      const r = await withButtonLoading(btn, () =>
        TaxiApi.api("driver_summary", { driver_id, token })
      );
      box.innerHTML = `
        <div class="grid">
          <div class="col6 card"><div><b>Kumulativer Bargeldbetrag abzugeben</b><div class="total mono">${fmt(
            r.cash_to_bring
          )} €</div></div></div>
          <div class="col6 card"><div><b>Gesamt (Bar abzugeben)</b><div class="mono">${fmt(
            r.cash_due_total
          )} €</div></div></div>
          <div class="col6 card"><div><b>Bar abgegeben</b><div class="mono">${fmt(
            r.cash_remitted
          )} €</div></div></div>
          <div class="col6 card"><div><b>KT (Info)</b><div class="mono">${fmt(
            r.kt_info_total
          )} €</div></div></div>
        </div>`;
    } catch (err) {
      box.innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
    } finally {
      setBusy(box, false);
    }
  });

  // Смена PIN
  $("#fToken")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { driver_id } = creds();
    const old_token = e.target.old_token.value;
    const new_token = e.target.new_token.value;
    if (!driver_id) {
      alert("Speichern Sie zuerst die Driver ID oben.");
      return;
    }
    const btn = e.submitter; // «Ändern»
    const box = $("#tokenResult");
    setBusy(box, true);

    try {
      await withButtonLoading(btn, () =>
        TaxiApi.api("change_token", { driver_id, old_token, new_token })
      );
      box.innerHTML = `<div class="ok">PIN/Token geändert. Aktualisieren Sie das Feld „PIN/Token“ oben und klicken Sie auf „Speichern“.</div>`;
    } catch (err) {
      box.innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
    } finally {
      setBusy(box, false);
    }
  });

  // Дашборд
  $("#loadDashboard")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget; // «Dashboard laden»
    const box = $("#dashBox");
    setBusy(box, true);

    try {
      const r = await withButtonLoading(btn, () =>
        TaxiApi.api("dashboard", {}, "POST")
      );
      const rows = (r.drivers || []).sort(
        (a, b) => (b.cash_to_bring || 0) - (a.cash_to_bring || 0)
      );
      if (!rows.length) {
        box.innerHTML = '<div class="hint">Keine aktiven Fahrer.</div>';
        return;
      }
      const html = `
        <table>
          <thead><tr><th>Fahrer</th><th class="right">Abzugeben (gesamt) €</th><th class="right">Gesamt €</th><th class="right">Abgegeben €</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (d) => `
              <tr>
                <td class="mono">${d.driver_id} — ${d.name || ""}</td>
                <td class="right mono">${fmt(d.cash_to_bring)}</td>
                <td class="right mono">${fmt(d.cash_due_total)}</td>
                <td class="right mono">${fmt(d.cash_remitted)}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>`;
      box.innerHTML = html;
    } catch (err) {
      box.innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
    } finally {
      setBusy(box, false);
    }
  });
}

// ===== ВНУТРЕННИЕ ТАБЫ ШИХТБЕРИХТА (+ безопасная валидация) =====
// ВНИМАНИЕ: это единственная (обновлённая) версия initReportSubTabs
function initReportSubTabs() {
  const scope = $("#tab-report");
  const form = $("#fReport");
  if (!scope || !form) return;

  // A. переносим native required в data-req
  $$("[required]", form).forEach((el) => {
    el.dataset.req = "1";
    el.removeAttribute("required");
  });

  const buttons = $$(".tabs--sub .tab-btn", form);
  const panels = {
    intro: $("#sub-intro", form),
    money: $("#sub-money", form),
    invoice: $("#sub-invoice", form),
    medical: $("#sub-medical", form),
    comment: $("#sub-comment", form), // был summary — теперь comment
    send: $("#sub-send", form), // новый 6-й таб
  };

  const inputsOf = (root) => $$("input,select,textarea", root);
  const setDisabled = (root, v) =>
    inputsOf(root).forEach((el) => {
      if (el.type !== "button" && el.getAttribute("type") !== "button")
        el.disabled = v;
    });
  const setRequiredIn = (root, v) =>
    inputsOf(root).forEach((el) => {
      if (el.dataset.req === "1") {
        if (v) el.setAttribute("required", "");
        else el.removeAttribute("required");
      }
    });

  function showSub(id) {
    buttons.forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.subtab === id))
    );
    Object.entries(panels).forEach(([key, panel]) => {
      if (!panel) return;
      const active = key === id;
      panel.style.display = active ? "block" : "none";
      setDisabled(panel, !active);
      setRequiredIn(panel, active);
    });

    // при открытии send — рендерим чек
    if (id === "send") {
      Receipt.onTabSwitchHook();
    }
  }

  // Кнопки сабов
  buttons.forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      showSub(b.dataset.subtab);
    })
  );

  // первичное раскрытие (+ deep-link ?sub=money или #money)
  const url = new URL(location.href);
  const initial =
    url.searchParams.get("sub") ||
    (location.hash || "").replace("#", "") ||
    "intro";
  showSub(panels[initial] ? initial : "intro");

  // Валидация перед submit
  function validateAllRequired() {
    // Порядок с учётом новой структуры
    const order = ["intro", "money", "invoice", "medical", "comment"];
    for (const id of order) {
      const panel = panels[id];
      if (!panel) continue;
      const reqs = inputsOf(panel).filter((el) => el.dataset.req === "1");
      for (const el of reqs) {
        const val = (el.value ?? "").trim();
        const empty =
          el.type === "checkbox" || el.type === "radio"
            ? !el.checked
            : val === "";
        if (empty) {
          showSub(id);
          el.setAttribute("required", "");
          el.reportValidity?.();
          el.focus({ preventScroll: false });
          return false;
        }
      }
    }
    return true;
  }

  form.addEventListener(
    "submit",
    (e) => {
      if (!validateAllRequired()) {
        e.preventDefault();
        e.stopImmediatePropagation?.();
      }
    },
    { capture: true }
  );
}

// ===== Автоматическое добавление кнопок "Назад" / "Далее" между субтабами =====
function initStepNavigation() {
  const form = $("#fReport");
  if (!form) return;

  const order = ["intro", "money", "invoice", "medical", "comment", "send"];
  const panels = order.map((id) => $("#sub-" + id)).filter(Boolean);
  const showSub = (id) => {
    const btn = $(`.tabs--sub .tab-btn[data-subtab="${id}"]`, form);
    if (btn) btn.click();
  };

  panels.forEach((panel, i) => {
    const nav = document.createElement("div");
    nav.className = "step-nav";
    if (i > 0) {
      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "prev";
      prevBtn.textContent = "← Zurück";
      prevBtn.addEventListener("click", () => showSub(order[i - 1]));
      nav.appendChild(prevBtn);
    }
    if (i < panels.length - 1) {
      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "next";
      nextBtn.textContent = "Weiter →";
      nextBtn.addEventListener("click", () => showSub(order[i + 1]));
      nav.appendChild(nextBtn);
    }
    panel.appendChild(nav);
  });
}

function setBusy(el, busy = true) {
  if (!el) return;
  el.setAttribute("aria-busy", busy ? "true" : "false");
}

async function withButtonLoading(btn, task) {
  try {
    if (btn) {
      btn.classList.add("is-loading");
      btn.setAttribute("disabled", "");
    }
    return await task();
  } finally {
    if (btn) {
      btn.classList.remove("is-loading");
      btn.removeAttribute("disabled");
    }
  }
}

// ===== Инициализация =====
window.addEventListener("DOMContentLoaded", () => {
  // заполнить сохранённые учётки
  const d = localStorage.getItem("driver_id") || "";
  const t = localStorage.getItem("token") || "";
  if (d) $("#driver_id").value = d;
  if (t) $("#token").value = t;
  updateLoginTag();

  // дефолты дат
  $('input[name="date"]') && ($('input[name="date"]').valueAsDate = new Date());
  $('#fRemit input[name="date"]') &&
    ($('#fRemit input[name="date"]').valueAsDate = new Date());

  initTabs(); // верхние
  initReportSubTabs();
  initStepNavigation();
  bindDynamicButtons();
  bindForms();
  RemitReceipt.mount();
  recalc();

  // живое обновление чека при вводе
  document.addEventListener("input", () => Receipt.refreshIfVisible());
});
