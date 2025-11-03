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
  $("#loginTag").textContent = c.driver_id
    ? `Fahrer: ${c.driver_id}`
    : "Nicht angemeldet";
}

// ===== Верхние табы (только главный таббар, не внутренние) =====
function initTabs() {
  // берём кнопки только из главной навигации
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

// ===== Внутренние табы в форме отчёта + безопасная валидация =====
function initReportSubTabs() {
  const form = $("#fReport");
  if (!form) return;

  const buttons = $$(".tabs--sub .tab-btn", form);
  const panels = {
    intro: $("#sub-intro", form),
    money: $("#sub-money", form),
    invoice: $("#sub-invoice", form),
    medical: $("#sub-medical", form),
    summary: $("#sub-summary", form),
  };

  // Переносим required в data-req, чтобы управлять сами
  $$("[required]", form).forEach((el) => {
    el.dataset.req = "1";
    el.removeAttribute("required");
  });

  const inputsOf = (root) => $$("input,select,textarea", root);
  const setDisabled = (root, v) =>
    inputsOf(root).forEach((el) => {
      if (el.type !== "button") el.disabled = v;
    });
  const setRequiredIn = (root, v) =>
    inputsOf(root).forEach((el) => {
      if (el.dataset.req === "1")
        v ? el.setAttribute("required", "") : el.removeAttribute("required");
    });

  function showSub(id) {
    buttons.forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.subtab === id))
    );
    Object.entries(panels).forEach(([key, panel]) => {
      const active = key === id;
      panel.style.display = active ? "block" : "none";
      setDisabled(panel, !active);
      setRequiredIn(panel, active);
    });
  }

  buttons.forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation(); // не пускаем событие наверх
      showSub(b.dataset.subtab);
    })
  );

  // первая вкладка активна
  showSub("intro");

  // Проверка перед submit: если пусто — открываем нужную вкладку и фокусим поле
  function validateAllRequired() {
    const order = ["intro", "money", "invoice", "medical", "summary"];
    for (const id of order) {
      const reqs = inputsOf(panels[id]).filter((el) => el.dataset.req === "1");
      for (const el of reqs) {
        const empty =
          el.type === "checkbox" || el.type === "radio"
            ? !el.checked
            : (el.value ?? "").trim() === "";
        if (empty) {
          showSub(id);
          el.setAttribute("required", "");
          el.reportValidity?.();
          el.focus();
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
  });
  tr.querySelector(".inv-amount").addEventListener("input", recalc);
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
  });
  tr.querySelector(".kt-amount").addEventListener("input", recalc);
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
  });
  return tr;
}

const invTbody = $("#invTable tbody");
const ktTbody = $("#ktTable tbody");
const msTbody = $("#miscTable tbody");

function bindDynamicButtons() {
  $("#addInv").addEventListener("click", () => invTbody.appendChild(rowInv()));
  $("#addKT").addEventListener("click", () => ktTbody.appendChild(rowKT()));
  $("#addMisc").addEventListener("click", () => msTbody.appendChild(rowMisc()));
  // стартовая строка в «по счёту»
  invTbody.appendChild(rowInv());
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

  $("#invSum").textContent = fmt(invSum);
  $("#ktSum").textContent = fmt(ktSum);
  $("#sumInvPill").textContent = fmt(invSum) + " €";
  $("#sumKtPill").textContent = fmt(ktSum) + " €";
  const dueEl = $("#dueNow");
  dueEl.textContent = fmt(due) + " €";
  dueEl.className = "mono " + (due >= 0 ? "ok" : "bad");
}

// ===== Формы: отчёт, сдача, свод, смена PIN, дашборд =====
function bindForms() {
  // Сохранение логина
  $("#saveCreds").addEventListener("click", storeCreds);

  // Пересчёт
  $("#calcBtn").addEventListener("click", recalc);
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
      )
        recalc();
    });
  });

  // Отправка отчёта
  $("#fReport").addEventListener("submit", async (e) => {
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
      shift_no: f.shift_no.value.trim(), // <-- НОВОЕ
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

    try {
      recalc();
      const r = await TaxiApi.api("report", payload);
      $("#reportResult").innerHTML = `
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
      $(
        "#reportResult"
      ).innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
    }
  });

  // Сдача наличных
  $("#fRemit").addEventListener("submit", async (e) => {
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
    try {
      const r = await TaxiApi.api("remit", payload);
      $("#remitResult").innerHTML = `
        <div class="row" style="gap:12px; flex-wrap:wrap">
          <span class="pill mono">Abgabe ID: ${r.remit_id}</span>
          <span class="pill mono">Rest nach Abgabe: <b>${fmt(
            r.cash_to_bring
          )} €</b></span>
        </div>`;
    } catch (err) {
      $(
        "#remitResult"
      ).innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
    }
  });

  // Свод по водителю
  $("#loadSummary").addEventListener("click", async () => {
    const { driver_id, token } = creds();
    if (!driver_id || !token) {
      alert("Geben Sie Driver ID und PIN/Token ein und speichern Sie.");
      return;
    }
    try {
      const r = await TaxiApi.api("driver_summary", { driver_id, token });
      $("#summaryBox").innerHTML = `
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
      $(
        "#summaryBox"
      ).innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
    }
  });

  // Смена PIN
  $("#fToken").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { driver_id } = creds();
    const old_token = e.target.old_token.value;
    const new_token = e.target.new_token.value;
    if (!driver_id) {
      alert("Speichern Sie zuerst die Driver ID oben.");
      return;
    }
    try {
      await TaxiApi.api("change_token", { driver_id, old_token, new_token });
      $(
        "#tokenResult"
      ).innerHTML = `<div class="ok">PIN/Token geändert. Aktualisieren Sie das Feld „PIN/Token“ oben und klicken Sie auf „Speichern“.</div>`;
    } catch (err) {
      $(
        "#tokenResult"
      ).innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
    }
  });

  // Дашборд
  $("#loadDashboard").addEventListener("click", async () => {
    try {
      const r = await TaxiApi.api("dashboard", {}, "POST");
      const rows = (r.drivers || []).sort(
        (a, b) => (b.cash_to_bring || 0) - (a.cash_to_bring || 0)
      );
      if (!rows.length) {
        $("#dashBox").innerHTML =
          '<div class="hint">Keine aktiven Fahrer.</div>';
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
      $("#dashBox").innerHTML = html;
    } catch (err) {
      $("#dashBox").innerHTML = `<div class="bad">Fehler: ${err.message}</div>`;
    }
  });
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
  $('input[name="date"]').valueAsDate = new Date();
  $('#fRemit input[name="date"]').valueAsDate = new Date();

  initTabs(); // верхние
  initReportSubTabs(); // внутренние
  bindDynamicButtons();
  bindForms();
  recalc();
});

// ===== ВНУТРЕННИЕ ТАБЫ ШИХТБЕРИХТА (+ безопасная валидация) =====
function initReportSubTabs() {
  const scope = $("#tab-report");
  const form = $("#fReport");
  if (!scope || !form) return;

  // A. Переносим native-required в data-req, чтобы управлять сами
  $$("[required]", form).forEach((el) => {
    el.dataset.req = "1";
    el.removeAttribute("required");
  });

  const subbar = $(".tabs--sub", form);
  const buttons = $$(".tabs--sub .tab-btn", form);
  const panels = {
    intro: $("#sub-intro", form),
    money: $("#sub-money", form),
    invoice: $("#sub-invoice", form),
    medical: $("#sub-medical", form),
    summary: $("#sub-summary", form),
  };

  // полезки
  const inputsOf = (root) => $$("input,select,textarea", root);
  const setDisabled = (root, v) =>
    inputsOf(root).forEach((el) => {
      // кнопки не трогаем
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
  }

  // кнопки
  buttons.forEach((b) =>
    b.addEventListener("click", () => showSub(b.dataset.subtab))
  );

  // первичное раскрытие (+ deep-link ?sub=money или #money)
  const url = new URL(location.href);
  const initial =
    url.searchParams.get("sub") ||
    (location.hash || "").replace("#", "") ||
    "intro";
  showSub(panels[initial] ? initial : "intro");

  // B. Общая проверка перед submit: если пусто — открываем нужную вкладку и фокусим
  function validateAllRequired() {
    const order = ["intro", "money", "invoice", "medical", "summary"];
    for (const id of order) {
      const panel = panels[id];
      const reqs = inputsOf(panel).filter((el) => el.dataset.req === "1");
      for (const el of reqs) {
        const val = (el.value ?? "").trim();
        const empty =
          el.type === "checkbox" || el.type === "radio"
            ? !el.checked
            : val === "";
        if (empty) {
          showSub(id);
          el.setAttribute("required", ""); // дать браузеру показать подсказку
          el.reportValidity?.();
          el.focus({ preventScroll: false });
          return false;
        }
      }
    }
    return true;
  }

  // C. Встраиваем в submit (через capture — перехватываем раньше твоей логики)
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
