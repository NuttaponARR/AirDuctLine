const sessionStorageKey = "officeMesLineSession.v1";
const activeStatusesByRole = {
  sales: ["NEW_INQUIRY", "QUOTING", "WAITING_CUSTOMER_CONFIRM", "WAITING_SO", "PRODUCTION_DONE", "WAITING_DELIVERY_CONFIRM"],
  production: ["WAITING_DESIGN", "IN_PRODUCTION"],
  warehouse: ["WAITING_STOCK"],
  planning: ["WAITING_PRODUCTION_PLAN"],
  logistics: ["WAIT_BOOKING_TRUCK", "READY_TO_DELIVER"],
  admin: ["CONFIRMED", "DELIVERED", "CLOSED"],
};
const statusLabels = {
  NEW_INQUIRY: "รับเรื่องใหม่",
  WAITING_DESIGN: "รอถอดแบบ",
  WAITING_STOCK: "รอเช็คสต็อก",
  QUOTING: "รอเสนอราคา",
  WAITING_CUSTOMER_CONFIRM: "รอลูกค้ายืนยัน",
  CONFIRMED: "ยืนยันแล้ว",
  STOCK_REPLY: "ผลเช็คสต็อกจากคลัง",
  WAITING_SO: "รอฝ่ายขายออก SO",
  WAITING_PRODUCTION_PLAN: "รอวางแผนผลิต",
  IN_PRODUCTION: "กำลังผลิต",
  PRODUCTION_DONE: "ผลิตเสร็จ",
  WAITING_DELIVERY_CONFIRM: "รอยืนยันจัดส่ง",
  WAIT_BOOKING_TRUCK: "รอจองรถ",
  READY_TO_DELIVER: "พร้อมจัดส่ง",
  DELIVERED: "จัดส่งแล้ว",
  CLOSED: "สมบูรณ์แล้ว",
};

let session = { token: window.localStorage.getItem(sessionStorageKey) || "", user: null, source: "" };
let state = { jobs: [], users: [] };
let currentFilter = "mine";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("open");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("open"), 2600);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (session.token) headers.set("X-Session-Token", session.token);
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = "Request failed";
    try {
      message = (await response.json()).message || message;
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  }
  return response.json();
}

function setSession(nextSession) {
  session = { ...session, ...nextSession };
  if (session.token) {
    window.localStorage.setItem(sessionStorageKey, session.token);
  } else {
    window.localStorage.removeItem(sessionStorageKey);
  }
  renderSession();
  renderCreateAccess();
}

function renderSession() {
  document.getElementById("sessionName").textContent = session.user ? `${session.user.name} - ${roleLabel(session.user.role)}` : "ยังไม่ได้เข้าสู่ระบบ";
  document.getElementById("sessionSource").textContent = session.source === "line" ? "LINE" : session.source === "browser" ? "Browser" : "Pilot";
}

function renderCreateAccess() {
  const panel = document.getElementById("createJobPanel");
  if (!panel) return;
  panel.hidden = session.user?.role !== "sales";
}

function roleLabel(role) {
  return {
    sales: "ฝ่ายขาย",
    production: "ฝ่ายผลิต",
    warehouse: "คลัง",
    planning: "วางแผน",
    logistics: "ส่งของ",
    admin: "Admin",
  }[role] || role || "-";
}

function lineItemsPlain(job) {
  if (Array.isArray(job.lineItems) && job.lineItems.length) {
    return job.lineItems.map((item) => `${item.name} x ${item.quantity}`).join(", ");
  }
  return `${job.item || "-"} x ${job.quantity || 0}`;
}

function totalQuantity(job) {
  if (Array.isArray(job.lineItems) && job.lineItems.length) {
    return job.lineItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }
  return Number(job.quantity || 0);
}

function daysUntil(dateText) {
  if (!dateText) return 999;
  const target = new Date(`${dateText}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function relevantJobs() {
  if (!session.user) return [];
  const roleStatuses = activeStatusesByRole[session.user.role] || [];
  if (currentFilter === "urgent") return state.jobs.filter((job) => daysUntil(job.dueDate) <= 1 && job.status !== "CLOSED");
  if (currentFilter === "all") return state.jobs.filter((job) => job.status !== "CLOSED");
  return state.jobs.filter((job) => {
    if (session.user.role === "admin") return job.status !== "CLOSED";
    if (!roleStatuses.includes(job.status)) return false;
    if (session.user.role === "sales" && job.salesOwner && job.salesOwner !== session.user.name) return false;
    return true;
  });
}

function nextActions(job) {
  const actions = {
    QUOTING: [["WAITING_CUSTOMER_CONFIRM", "ส่งราคาแล้ว"]],
    WAITING_CUSTOMER_CONFIRM: [["CONFIRMED", "ลูกค้ายืนยัน"]],
    CONFIRMED: [["WAITING_SO", "ส่งฝ่ายขายออก SO"]],
    WAITING_SO: [["WAITING_PRODUCTION_PLAN", "สร้าง SO"]],
    WAITING_PRODUCTION_PLAN: [["IN_PRODUCTION", "สร้าง WO"]],
    PRODUCTION_DONE: [["WAITING_DELIVERY_CONFIRM", "แจ้งพร้อมส่ง"]],
    WAITING_DELIVERY_CONFIRM: [["WAIT_BOOKING_TRUCK", "ต้องจองรถ"], ["READY_TO_DELIVER", "ลูกค้ารับเอง"]],
    WAIT_BOOKING_TRUCK: [["READY_TO_DELIVER", "จองรถแล้ว"]],
    READY_TO_DELIVER: [["DELIVERED", "จัดส่งแล้ว"]],
    DELIVERED: [["CLOSED", "ปิดเอกสาร"]],
  };
  return actions[job.status] || [];
}

function actionHtml(job) {
  if (job.status === "WAITING_DESIGN") {
    return `
      <form class="task-actions" data-design-form="${escapeHtml(job.id)}">
        <textarea name="message" placeholder="ผลถอดแบบ / หมายเหตุฝ่ายผลิต"></textarea>
        <button class="action-button" type="submit">ส่งผลถอดแบบ</button>
      </form>`;
  }
  if (job.status === "WAITING_STOCK") {
    return `
      <form class="task-actions" data-stock-form="${escapeHtml(job.id)}">
        <textarea name="message" placeholder="ผลเช็คสต็อก / จำนวนพร้อมส่ง / หมายเหตุ"></textarea>
        <button class="action-button" type="submit">ส่งผลเช็คสต็อก</button>
      </form>`;
  }
  if (job.status === "IN_PRODUCTION") {
    return `
      <form class="close-grid" data-close-form="${escapeHtml(job.id)}">
        <label>ดี<input name="goodQty" inputmode="numeric" value="${escapeHtml(totalQuantity(job))}" /></label>
        <label>เสีย<input name="defectQty" inputmode="numeric" value="0" /></label>
        <textarea name="note" placeholder="หมายเหตุ"></textarea>
        <button class="action-button" type="submit">ปิดงานผลิต</button>
      </form>`;
  }
  return nextActions(job)
    .map(([status, label]) => `<button class="action-button" data-move="${escapeHtml(job.id)}" data-status="${escapeHtml(status)}" type="button">${escapeHtml(label)}</button>`)
    .join("");
}

function renderTasks() {
  const tasks = relevantJobs();
  const list = document.getElementById("taskList");
  if (!session.user) {
    list.innerHTML = `<article class="task-card empty">เข้าสู่ระบบเพื่อดูงาน</article>`;
    return;
  }
  if (!tasks.length) {
    list.innerHTML = `<article class="task-card empty">ยังไม่มีงานในหมวดนี้</article>`;
    return;
  }
  list.innerHTML = tasks
    .map(
      (job) => `
        <article class="task-card">
          <div class="task-top">
            <div class="task-title">
              <strong>${escapeHtml(job.woNo || job.soNo || job.id)}</strong>
              <span>${escapeHtml(job.customer || "-")}</span>
            </div>
            <span class="badge ${daysUntil(job.dueDate) <= 1 ? "warn" : ""}">${escapeHtml(statusLabels[job.status] || job.status)}</span>
          </div>
          <div class="task-meta">
            <span>${escapeHtml(lineItemsPlain(job))} / รวม ${escapeHtml(totalQuantity(job))}</span>
            <span>กำหนดส่ง ${escapeHtml(job.dueDate || "-")} / ฝ่ายขาย ${escapeHtml(job.salesOwner || "-")}</span>
            ${job.note ? `<span>${escapeHtml(job.note)}</span>` : ""}
          </div>
          <div class="task-actions">
            <button class="ghost-button" data-read="${escapeHtml(job.id)}" data-entry-status="${escapeHtml(job.status)}" type="button">เปิดอ่าน</button>
            ${actionHtml(job)}
          </div>
          <form class="task-actions" data-line-reply-form="${escapeHtml(job.id)}" data-entry-status="${escapeHtml(job.status)}">
            <textarea name="message" placeholder="ตอบกลับข้อความนี้"></textarea>
            <button class="ghost-button" type="submit">ส่งข้อความตอบกลับ</button>
          </form>
        </article>`
    )
    .join("");
}

async function loadState() {
  state = await api("/api/state");
  renderTasks();
}

async function restoreSession() {
  if (!session.token) return false;
  try {
    const result = await api("/api/session");
    setSession({ token: session.token, user: result.user, source: result.session?.source || "browser" });
    return true;
  } catch {
    setSession({ token: "", user: null, source: "" });
    return false;
  }
}

async function detectLineIdentity() {
  const params = new URLSearchParams(window.location.search);
  const lineUserId = params.get("lineUserId");
  if (lineUserId) return { lineUserId, displayName: params.get("lineDisplayName") || "" };
  const config = await api("/api/line/config");
  if (config.liffId && window.liff) {
    await window.liff.init({ liffId: config.liffId });
    if (!window.liff.isLoggedIn()) {
      window.liff.login();
      return null;
    }
    const profile = await window.liff.getProfile();
    return { lineUserId: profile.userId, displayName: profile.displayName || "" };
  }
  return null;
}

async function loginWithLine(identity) {
  try {
    const result = await api("/api/line/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(identity),
    });
    setSession({ token: result.token, user: result.user, source: "line" });
    document.getElementById("lineLinkPanel").hidden = true;
    return true;
  } catch (error) {
    document.getElementById("lineLinkPanel").hidden = false;
    document.getElementById("lineLinkText").textContent = `ส่ง LINE User ID นี้ให้ Admin ผูกกับผู้ใช้: ${identity.lineUserId}`;
    toast(error.message);
    return false;
  }
}

async function renderBrowserLogin() {
  const result = await api("/api/users");
  state.users = result.users;
  const select = document.getElementById("browserUserSelect");
  select.innerHTML = result.users
    .filter((user) => user.active !== false)
    .map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} - ${escapeHtml(roleLabel(user.role))}</option>`)
    .join("");
  document.getElementById("loginPanel").hidden = false;
}

async function browserLogin(userId) {
  const result = await api("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  setSession({ token: result.token, user: result.user, source: "browser" });
  document.getElementById("loginPanel").hidden = true;
  await loadState();
  toast(`เข้าใช้งานเป็น ${result.user.name}`);
}

async function moveJob(id, status) {
  state = await api(`/api/jobs/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  renderTasks();
  toast("บันทึกสถานะแล้ว");
}

async function sendDesignReply(form) {
  const id = form.dataset.designForm;
  const payload = new FormData();
  payload.set("designMessage", new FormData(form).get("message") || "ตอบกลับจาก LINE Pilot");
  state = await api(`/api/jobs/${encodeURIComponent(id)}/design-complete`, {
    method: "POST",
    body: payload,
  });
  renderTasks();
  toast("ส่งผลถอดแบบแล้ว");
}

async function sendStockReply(form) {
  const id = form.dataset.stockForm;
  const message = String(new FormData(form).get("message") || "").trim();
  if (!message) {
    toast("กรุณาใส่ผลเช็คสต็อก");
    return;
  }
  state = await api(`/api/jobs/${encodeURIComponent(id)}/stock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  renderTasks();
  toast("ส่งผลเช็คสต็อกแล้ว");
}

async function closeProduction(form) {
  const id = form.dataset.closeForm;
  const payload = new FormData(form);
  state = await api("/api/production/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId: id,
      goodQty: payload.get("goodQty"),
      defectQty: payload.get("defectQty"),
    }),
  });
  renderTasks();
  toast("ปิดงานผลิตแล้ว");
}

async function readJob(id, entryStatus) {
  await api(`/api/jobs/${encodeURIComponent(id)}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryStatus }),
  });
  toast("บันทึกการเปิดอ่านแล้ว");
}

async function sendLineReply(form) {
  const id = form.dataset.lineReplyForm;
  const entryStatus = form.dataset.entryStatus;
  const message = String(new FormData(form).get("message") || "").trim();
  if (!message) {
    toast("กรุณาใส่ข้อความตอบกลับ");
    return;
  }
  await api(`/api/jobs/${encodeURIComponent(id)}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryStatus, message }),
  });
  form.reset();
  await loadState();
  toast("ส่งข้อความตอบกลับแล้ว");
}

async function createJobFromLine(form) {
  if (session.user?.role !== "sales") {
    toast("สร้างงานใหม่ได้เฉพาะฝ่ายขาย");
    return;
  }
  const raw = new FormData(form);
  const itemName = String(raw.get("itemName") || "").trim();
  const quantity = Number(raw.get("quantity") || 0);
  if (!itemName || quantity <= 0) {
    toast("กรุณาใส่รายการสินค้าและจำนวน");
    return;
  }

  const payload = new FormData();
  payload.set("customer", String(raw.get("customer") || "").trim());
  payload.set("customerRef", String(raw.get("customerRef") || "").trim());
  payload.set("salesOwner", session.user.name);
  payload.set("jobType", String(raw.get("jobType") || "design"));
  payload.set("dueDate", String(raw.get("dueDate") || ""));
  payload.set("deliveryMode", String(raw.get("deliveryMode") || "บริษัทจัดส่ง"));
  payload.set("note", String(raw.get("note") || "").trim());
  payload.set("lineItems", JSON.stringify([{ name: itemName, quantity }]));
  payload.set("item", itemName);
  payload.set("quantity", String(quantity));

  state = await api("/api/jobs", {
    method: "POST",
    body: payload,
  });
  form.reset();
  const quantityInput = form.querySelector('input[name="quantity"]');
  if (quantityInput) quantityInput.value = "1";
  currentFilter = "mine";
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.filter === "mine"));
  renderTasks();
  toast(`สร้างงาน ${state.jobs[0]?.id || "ใหม่"} แล้ว`);
}

document.getElementById("browserLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await browserLogin(new FormData(event.currentTarget).get("userId"));
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById("createJobForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await createJobFromLine(event.currentTarget);
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById("refreshBtn").addEventListener("click", async () => {
  try {
    await loadState();
    toast("รีเฟรชแล้ว");
  } catch (error) {
    toast(error.message);
  }
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    renderTasks();
  });
});

document.getElementById("taskList").addEventListener("click", async (event) => {
  const target = event.target;
  try {
    if (target.matches("[data-move]")) await moveJob(target.dataset.move, target.dataset.status);
    if (target.matches("[data-read]")) await readJob(target.dataset.read, target.dataset.entryStatus);
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById("taskList").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (event.target.matches("[data-design-form]")) await sendDesignReply(event.target);
    if (event.target.matches("[data-stock-form]")) await sendStockReply(event.target);
    if (event.target.matches("[data-close-form]")) await closeProduction(event.target);
    if (event.target.matches("[data-line-reply-form]")) await sendLineReply(event.target);
  } catch (error) {
    toast(error.message);
  }
});

async function init() {
  renderSession();
  renderCreateAccess();
  try {
    const lineIdentity = await detectLineIdentity();
    if (lineIdentity) {
      await loginWithLine(lineIdentity);
    } else {
      const restored = await restoreSession();
      if (!restored) await renderBrowserLogin();
    }
    await loadState();
  } catch (error) {
    await renderBrowserLogin();
    toast(error.message);
  }
}

init();
