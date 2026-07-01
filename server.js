const http = require("http");
const https = require("https");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";
const dataDir = path.join(root, "data");
const uploadDir = path.join(root, "uploads");
const dbFile = path.join(dataDir, "state.json");
const liffId = process.env.LIFF_ID || "";
const lineAppUrl = process.env.LINE_APP_URL || "";
const lineChannelSecret = process.env.LINE_CHANNEL_SECRET || process.env.CHANNEL_SECRET || "";
const lineChannelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || process.env.CHANNEL_ACCESS_TOKEN || "";
const liffIdPlaceholders = new Set(["PUT_YOUR_LIFF_ID_HERE", "your-liff-id"]);

const today = new Date("2026-06-02T09:00:00+07:00");

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

const departmentByStatus = {
  NEW_INQUIRY: "ฝ่ายขาย",
  WAITING_DESIGN: "ถอดแบบ/ผลิต",
  WAITING_STOCK: "คลัง",
  QUOTING: "ฝ่ายขาย",
  WAITING_CUSTOMER_CONFIRM: "ฝ่ายขาย",
  CONFIRMED: "Admin",
  WAITING_SO: "ฝ่ายขาย",
  WAITING_PRODUCTION_PLAN: "วางแผน",
  IN_PRODUCTION: "ผลิต",
  PRODUCTION_DONE: "ฝ่ายขาย",
  WAITING_DELIVERY_CONFIRM: "ฝ่ายขาย",
  WAIT_BOOKING_TRUCK: "ขนส่ง",
  READY_TO_DELIVER: "ขนส่ง",
  DELIVERED: "Admin",
  CLOSED: "Admin",
};

const ownersByDepartment = {
  "ถอดแบบ/ผลิต": ["คุณ แป๊ะ", "คุณ โรง", "คุณ เปรมสุข"],
  ผลิต: ["คุณ แป๊ะ", "คุณ โรง", "คุณ เปรมสุข"],
  วางแผน: ["คุณ แพ็ด"],
  คลัง: ["คุณ พล"],
  ขนส่ง: ["คุณ เรณู"],
  Admin: ["Admin", "คุณ ธนา"],
};

const defaultUsers = [
  { id: "sales-pamon", name: "คุณ ภมร", role: "sales", department: "ฝ่ายขาย" },
  { id: "sales-monthian", name: "คุณ มณเทียร", role: "sales", department: "ฝ่ายขาย" },
  { id: "sales-saknarong", name: "คุณ ศักดิ์ณรงค์", role: "sales", department: "ฝ่ายขาย" },
  { id: "sales-pakin", name: "คุณ ภาคิน", role: "sales", department: "ฝ่ายขาย" },
  { id: "sales-lakkana", name: "คุณ ลัคนา", role: "sales", department: "ฝ่ายขาย" },
  { id: "sales-wanida", name: "คุณ วนิดา", role: "sales", department: "ฝ่ายขาย" },
  { id: "sales-sathinee", name: "คุณ สาธินี", role: "sales", department: "ฝ่ายขาย" },
  { id: "sales-wachirawan", name: "คุณ วชิราวรรณ", role: "sales", department: "ฝ่ายขาย" },
  { id: "sales-supansa", name: "คุณ สุพรรษา", role: "sales", department: "ฝ่ายขาย" },
  { id: "sales-chokepisit", name: "คุณ โชคพิสิฐ", role: "sales", department: "ฝ่ายขาย" },
  { id: "sales-thana", name: "คุณ ธนา", role: "sales", department: "ฝ่ายขาย" },
  { id: "prod-pae", name: "คุณ แป๊ะ", role: "production", department: "ถอดแบบ/ผลิต" },
  { id: "prod-rong", name: "คุณ โรง", role: "production", department: "ถอดแบบ/ผลิต" },
  { id: "prod-premsuk", name: "คุณ เปรมสุข", role: "production", department: "ถอดแบบ/ผลิต" },
  { id: "plan-pad", name: "คุณ แพ็ด", role: "planning", department: "วางแผน" },
  { id: "wh-pon", name: "คุณ พล", role: "warehouse", department: "คลัง" },
  { id: "log-renu", name: "คุณ เรณู", role: "logistics", department: "ขนส่ง" },
  { id: "admin", name: "Admin", role: "admin", department: "Admin" },
  { id: "admin-thana", name: "คุณ ธนา", role: "admin", department: "Admin" },
];

const defaultState = {
  counters: {},
  users: defaultUsers,
  sessions: [],
  activityLog: [],
  jobs: [
    {
      id: "INQ20260602001",
      customer: "บริษัท สยามเมทัล จำกัด",
      item: "โครงเหล็กตามแบบลูกค้า",
      quantity: 40,
      customerRef: "RFQ-LINE-001",
      salesOwner: "คุณ ภมร",
      files: [{ name: "แบบงาน.pdf", size: 0, type: "application/pdf", url: "" }],
      status: "WAITING_DESIGN",
      dueDate: "2026-06-04",
      deliveryMode: "บริษัทจัดส่ง",
      quoteNo: "",
      soNo: "",
      woNo: "",
      note: "ลูกค้าต้องการทราบ lead time ก่อนเที่ยง",
    },
    {
      id: "INQ20260602002",
      customer: "เอเชียแพ็ค",
      item: "สินค้ามาตรฐาน รุ่น ST-22",
      quantity: 300,
      customerRef: "โทรเข้า",
      salesOwner: "คุณ มณเทียร",
      files: [{ name: "ภาพถ่ายเอกสาร.jpg", size: 0, type: "image/jpeg", url: "" }],
      status: "WAITING_STOCK",
      dueDate: "2026-06-03",
      deliveryMode: "ลูกค้ารับเอง",
      quoteNo: "",
      soNo: "",
      woNo: "",
      note: "ฝ่ายขายถอดรายการเอง รอคลังยืนยันจำนวน",
    },
    {
      id: "INQ20260602003",
      customer: "North Factory",
      item: "ชุดประกอบพิเศษ",
      quantity: 120,
      customerRef: "PO-NF-778",
      salesOwner: "คุณ ศักดิ์ณรงค์",
      files: [{ name: "PO-NF-778.pdf", size: 0, type: "application/pdf", url: "" }],
      status: "IN_PRODUCTION",
      dueDate: "2026-06-02",
      deliveryMode: "บริษัทจัดส่ง",
      quoteNo: "QT20260602001",
      soNo: "SO20260602001",
      woNo: "WO20260602001",
      note: "ต้องจองรถก่อน 10:00 วันนี้",
    },
  ],
  notifications: [
    "LINE -> ถอดแบบ/ผลิต คุณ แป๊ะ: มีงานใหม่ INQ20260602001 รอถอดแบบ",
    "LINE -> คลัง คุณ พล: มีคำขอเช็คสต็อก INQ20260602002",
    "LINE -> ขนส่ง คุณ เรณู: SO20260602001 ต้องจองรถก่อน 10:00",
  ],
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function ensureStorage() {
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(uploadDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    await writeState(defaultState);
  }
}

async function readState() {
  await ensureStorage();
  const text = await fsp.readFile(dbFile, "utf8");
  const state = JSON.parse(text);
  return normalizeState(state);
}

async function writeState(state) {
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.writeFile(dbFile, JSON.stringify(normalizeState(state), null, 2), "utf8");
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function error(res, status, message) {
  json(res, status, { error: message });
}

function safeLiffId() {
  const value = String(liffId || "").trim();
  return liffIdPlaceholders.has(value) ? "" : value;
}

function requireSales(req, res, state) {
  const user = sessionToken(req) ? currentUser(req, state) : null;
  if (user?.role === "sales" || user?.role === "admin") return user;
  error(res, 403, "สร้างงานใหม่ได้เฉพาะฝ่ายขาย");
  return null;
}

function normalizeState(state) {
  const existingUsers = Array.isArray(state.users) ? state.users : [];
  const userById = new Map(existingUsers.map((user) => [user.id, user]));
  defaultUsers.forEach((user) => {
    if (!userById.has(user.id)) userById.set(user.id, user);
  });
  state.users = [...userById.values()].map((user) => ({
    lineUserId: "",
    active: true,
    ...user,
  }));
  state.sessions = Array.isArray(state.sessions) ? state.sessions : [];
  state.activityLog = Array.isArray(state.activityLog) ? state.activityLog : [];
  state.notifications = Array.isArray(state.notifications) ? state.notifications : [];
  state.lineEvents = Array.isArray(state.lineEvents) ? state.lineEvents : [];
  state.lineWebhookDiagnostics = Array.isArray(state.lineWebhookDiagnostics) ? state.lineWebhookDiagnostics : [];
  state.jobs = Array.isArray(state.jobs) ? state.jobs : [];
  state.counters = state.counters || {};
  state.jobs.forEach((job) => {
    job.reads = Array.isArray(job.reads) ? job.reads : [];
    job.replies = Array.isArray(job.replies) ? job.replies : [];
  });
  return state;
}

function createSession(state, user, source = "browser", metadata = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  state.sessions.unshift({
    token,
    source,
    userId: user.id,
    userName: user.name,
    role: user.role,
    lineUserId: metadata.lineUserId || user.lineUserId || "",
    lineDisplayName: metadata.lineDisplayName || "",
    startedAt: new Date().toISOString(),
  });
  state.sessions = state.sessions.slice(0, 200);
  recordActivity(state, user, "login", null, `${source} login`);
  return token;
}

function sessionToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers["x-session-token"] || "";
}

function currentUser(req, state) {
  const token = sessionToken(req);
  if (token) {
    const session = (state.sessions || []).find((item) => item.token === token && !item.endedAt);
    if (session) {
      const sessionUser = state.users.find((item) => item.id === session.userId);
      if (sessionUser) return sessionUser;
    }
  }
  const userId = req.headers["x-user-id"];
  const user = state.users.find((item) => item.id === userId);
  if (user) return user;
  const role = (req.headers["x-user-role"] || "").toLowerCase();
  if (role) return state.users.find((item) => item.role === role) || null;
  return null;
}

async function login(req, res) {
  const { userId } = await readJson(req);
  const state = await readState();
  const user = state.users.find((item) => item.id === userId && item.active !== false);
  if (!user) return error(res, 404, "User not found");
  const token = createSession(state, user, "browser");
  await writeState(state);
  json(res, 200, { token, user });
}

async function lineSession(req, res) {
  const { lineUserId, displayName } = await readJson(req);
  const normalizedLineUserId = String(lineUserId || "").trim();
  if (!normalizedLineUserId) return error(res, 400, "Missing LINE user id");
  const state = await readState();
  const user = state.users.find((item) => item.active !== false && item.lineUserId === normalizedLineUserId);
  if (!user) {
    return error(res, 403, "LINE user นี้ยังไม่ได้ผูกกับผู้ใช้ในระบบ Office MES");
  }
  const token = createSession(state, user, "line", {
    lineUserId: normalizedLineUserId,
    lineDisplayName: String(displayName || ""),
  });
  await writeState(state);
  json(res, 200, { token, user });
}

async function linkLineUser(req, res, id) {
  const state = await readState();
  const admin = requireCurrentUser(req, res, state);
  if (!admin) return;
  if (admin.role !== "admin") return error(res, 403, "ผูก LINE user ได้เฉพาะ Admin");
  const { lineUserId } = await readJson(req);
  const normalizedLineUserId = String(lineUserId || "").trim();
  const user = state.users.find((item) => item.id === id);
  if (!user) return error(res, 404, "User not found");
  if (normalizedLineUserId) {
    const duplicate = state.users.find((item) => item.id !== id && item.lineUserId === normalizedLineUserId);
    if (duplicate) return error(res, 409, "LINE user id นี้ถูกผูกกับผู้ใช้อื่นแล้ว");
  }
  user.lineUserId = normalizedLineUserId;
  recordActivity(state, admin, "link_line_user", null, `${user.name} -> ${normalizedLineUserId || "clear"}`);
  await writeState(state);
  json(res, 200, { user });
}

function verifyLineSignature(rawBody, signature) {
  if (!lineChannelSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", lineChannelSecret).update(rawBody).digest("base64");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(String(signature), "utf8");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

function callLineApi(apiPath, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload));
    const request = https.request(
      {
        hostname: "api.line.me",
        path: apiPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lineChannelAccessToken}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(text);
          else reject(new Error(`LINE API ${apiPath} failed: ${res.statusCode} ${text}`));
        });
      }
    );
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function replyLineMessage(replyToken, messages) {
  if (!lineChannelAccessToken || !replyToken) return Promise.resolve();
  return callLineApi("/v2/bot/message/reply", { replyToken, messages }).catch((err) => {
    console.error("LINE reply failed:", err.message);
  });
}

async function handleLineEvent(state, event) {
  const lineUserId = event.source?.userId || "";
  const user = lineUserId ? state.users.find((item) => item.lineUserId === lineUserId) : null;

  if (event.type === "follow") {
    const text = user
      ? `สวัสดีคุณ ${user.name} เชื่อมต่อ LINE กับระบบ Office MES เรียบร้อยแล้วครับ`
      : `สวัสดีครับ ระบบยังไม่พบบัญชีของคุณ กรุณาแจ้ง Admin เพื่อผูก LINE user id นี้:\n${lineUserId}`;
    await replyLineMessage(event.replyToken, [{ type: "text", text }]);
    recordActivity(state, user, "line_follow", null, `LINE follow: ${lineUserId}`);
    return;
  }

  if (event.type === "message" && event.message?.type === "text") {
    const text = user
      ? "รับข้อความแล้วครับ กรุณาเปิดแอป Office MES ผ่านเมนู LINE เพื่อดำเนินการต่อ"
      : `บัญชี LINE นี้ยังไม่ได้ผูกกับผู้ใช้ในระบบ กรุณาแจ้ง Admin พร้อม LINE user id นี้:\n${lineUserId}`;
    await replyLineMessage(event.replyToken, [{ type: "text", text }]);
    recordActivity(state, user, "line_message", null, `${lineUserId}: ${event.message.text}`);
  }
}

async function lineWebhook(req, res) {
  const rawBody = await collectBody(req, 2 * 1024 * 1024);
  const signature = req.headers["x-line-signature"];
  if (!verifyLineSignature(rawBody, signature)) {
    return error(res, 401, "Invalid LINE signature");
  }
  json(res, 200, { ok: true });

  let payload;
  try {
    payload = JSON.parse(rawBody.length ? rawBody.toString("utf8") : "{}");
  } catch {
    return;
  }
  const events = Array.isArray(payload.events) ? payload.events : [];
  if (!events.length) return;

  const state = await readState();
  for (const event of events) {
    try {
      await handleLineEvent(state, event);
    } catch (err) {
      console.error("LINE event handling failed:", err);
    }
  }
  await writeState(state);
}

async function getSession(req, res) {
  const state = await readState();
  const token = sessionToken(req);
  const session = (state.sessions || []).find((item) => item.token === token && !item.endedAt);
  if (!session) return error(res, 401, "Session not found");
  const user = state.users.find((item) => item.id === session.userId);
  if (!user) return error(res, 401, "User not found");
  json(res, 200, { user, session: { startedAt: session.startedAt, source: session.source || "browser" } });
}

async function logout(req, res) {
  const state = await readState();
  const token = sessionToken(req);
  const session = (state.sessions || []).find((item) => item.token === token && !item.endedAt);
  if (session) {
    session.endedAt = new Date().toISOString();
    const user = state.users.find((item) => item.id === session.userId);
    recordActivity(state, user, "logout", null, "browser logout");
    await writeState(state);
  }
  json(res, 200, { ok: true });
}

function readTarget(job, status = job.status) {
  const salesTarget = { role: "sales", name: job.salesOwner || "" };
  const productionTeam = {
    role: "production",
    name: "ฝ่ายผลิต (คุณ แป๊ะ, คุณ โรง, คุณ เปรมสุข)",
    userIds: ["prod-pae", "prod-rong", "prod-premsuk"],
  };
  const targets = {
    NEW_INQUIRY: salesTarget,
    WAITING_DESIGN: productionTeam,
    WAITING_STOCK: { role: "warehouse", name: "คุณ พล" },
    QUOTING: salesTarget,
    WAITING_CUSTOMER_CONFIRM: salesTarget,
    CONFIRMED: { role: "admin", name: "Admin" },
    DESIGN_REPLY: salesTarget,
    STOCK_REPLY: salesTarget,
    WAITING_SO: salesTarget,
    WAITING_PRODUCTION_PLAN: { role: "planning", name: "คุณ แพ็ด" },
    IN_PRODUCTION: productionTeam,
    PRODUCTION_DONE: salesTarget,
    WAITING_DELIVERY_CONFIRM: salesTarget,
    WAIT_BOOKING_TRUCK: { role: "logistics", name: "คุณ เรณู" },
    READY_TO_DELIVER: { role: "logistics", name: "คุณ เรณู" },
    DELIVERED: { role: "admin", name: "Admin" },
    CLOSED: { role: "admin", name: "Admin" },
  };
  return targets[status] || { role: "admin", name: "Admin" };
}

function canReadJob(user, job, status = job.status) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const target = readTarget(job, status);
  if (Array.isArray(target.userIds) && target.userIds.includes(user.id)) return true;
  if (Array.isArray(target.names) && target.names.includes(user.name)) return true;
  if (target.name && user.name === target.name) return true;
  return user.role === target.role && !target.name && !Array.isArray(target.userIds) && !Array.isArray(target.names);
}

function requireCurrentUser(req, res, state) {
  const user = sessionToken(req) ? currentUser(req, state) : null;
  if (user) return user;
  error(res, 401, "กรุณาเข้าสู่ระบบก่อน");
  return null;
}

function requireAdmin(req, res, state) {
  const user = requireCurrentUser(req, res, state);
  if (!user) return null;
  if (user.role === "admin") return user;
  error(res, 403, "จัดการผู้ใช้ได้เฉพาะ Admin");
  return null;
}

function recordActivity(state, user, action, job, detail = "") {
  const item = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    userId: user?.id || "",
    userName: user?.name || "ไม่ระบุ",
    role: user?.role || "",
    action,
    jobId: job?.id || "",
    detail,
  };
  state.activityLog.unshift(item);
  state.activityLog = state.activityLog.slice(0, 500);
  return item;
}

function cleanUserInput(payload = {}, existing = {}) {
  const role = String(payload.role || existing.role || "sales").trim();
  const fallbackDepartment = {
    sales: "ฝ่ายขาย",
    production: "ถอดแบบ/ผลิต",
    planning: "วางแผน",
    warehouse: "คลัง",
    logistics: "ขนส่ง",
    admin: "Admin",
  }[role] || "";
  return {
    name: String(payload.name || existing.name || "").trim(),
    role,
    department: String(payload.department || existing.department || fallbackDepartment).trim(),
    lineUserId: String(payload.lineUserId ?? existing.lineUserId ?? "").trim(),
    active: payload.active === undefined ? existing.active !== false : Boolean(payload.active),
  };
}

function ensureUniqueLineUser(state, lineUserId, currentUserId = "") {
  if (!lineUserId) return null;
  return state.users.find((user) => user.id !== currentUserId && user.lineUserId === lineUserId) || null;
}

async function createUser(req, res) {
  const payload = await readJson(req);
  const state = await readState();
  const admin = requireAdmin(req, res, state);
  if (!admin) return;
  const next = cleanUserInput(payload);
  if (!next.name) return error(res, 400, "กรุณาระบุชื่อผู้ใช้");
  const duplicate = ensureUniqueLineUser(state, next.lineUserId);
  if (duplicate) return error(res, 409, "LINE user id นี้ถูกผูกกับผู้ใช้อื่นแล้ว");
  const idBase = next.name.toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, "-").replace(/^-+|-+$/g, "") || "user";
  let id = `${next.role}-${idBase}`;
  while (state.users.some((user) => user.id === id)) {
    id = `${next.role}-${idBase}-${crypto.randomBytes(2).toString("hex")}`;
  }
  const user = { id, ...next };
  state.users.push(user);
  recordActivity(state, admin, "create_user", null, `${user.name} / ${user.role}`);
  await writeState(state);
  json(res, 201, { user, users: state.users });
}

async function updateUser(req, res, id) {
  const payload = await readJson(req);
  const state = await readState();
  const admin = requireAdmin(req, res, state);
  if (!admin) return;
  const user = state.users.find((item) => item.id === id);
  if (!user) return error(res, 404, "User not found");
  const next = cleanUserInput(payload, user);
  if (!next.name) return error(res, 400, "กรุณาระบุชื่อผู้ใช้");
  const duplicate = ensureUniqueLineUser(state, next.lineUserId, id);
  if (duplicate) return error(res, 409, "LINE user id นี้ถูกผูกกับผู้ใช้อื่นแล้ว");
  Object.assign(user, next);
  recordActivity(state, admin, "update_user", null, `${user.name} / ${user.role} / ${user.active ? "active" : "inactive"}`);
  await writeState(state);
  json(res, 200, { user, users: state.users });
}

function collectBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await collectBody(req, 2 * 1024 * 1024);
  return body.length ? JSON.parse(body.toString("utf8")) : {};
}

function parseMultipart(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=([^;]+)/);
  if (!boundaryMatch) throw new Error("Missing multipart boundary");
  const boundary = Buffer.from(`--${boundaryMatch[1]}`);
  const fields = {};
  const files = [];
  let start = body.indexOf(boundary);

  while (start !== -1) {
    start += boundary.length;
    if (body.slice(start, start + 2).toString() === "--") break;
    if (body.slice(start, start + 2).toString() === "\r\n") start += 2;

    const next = body.indexOf(boundary, start);
    if (next === -1) break;
    let part = body.slice(start, next);
    if (part.slice(-2).toString() === "\r\n") part = part.slice(0, -2);

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headerText = part.slice(0, headerEnd).toString("utf8");
      const content = part.slice(headerEnd + 4);
      const name = /name="([^"]+)"/.exec(headerText)?.[1];
      const filename = /filename="([^"]*)"/.exec(headerText)?.[1];
      const mimeType = /Content-Type:\s*([^\r\n]+)/i.exec(headerText)?.[1] || "application/octet-stream";

      if (name && filename) {
        files.push({ field: name, name: filename, type: mimeType, content });
      } else if (name) {
        fields[name] = content.toString("utf8");
      }
    }
    start = next;
  }

  return { fields, files };
}

function safeFileName(name) {
  const cleaned = path.basename(name || "file").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return cleaned || "file";
}

async function saveUploadedFiles(files, fieldName = "attachments") {
  const saved = [];
  for (const file of files.filter((item) => item.field === fieldName && item.name)) {
    const originalName = safeFileName(file.name);
    const storedName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${originalName}`;
    const diskPath = path.join(uploadDir, storedName);
    await fsp.writeFile(diskPath, file.content);
    saved.push({
      name: originalName,
      storedName,
      size: file.content.length,
      type: file.type,
      url: `/uploads/${encodeURIComponent(storedName)}`,
    });
  }
  return saved;
}

function nextDoc(state, prefix) {
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const key = `${prefix}${yyyy}${mm}${dd}`;
  state.counters[key] = (state.counters[key] || existingCount(state, key)) + 1;
  return `${key}${String(state.counters[key]).padStart(3, "0")}`;
}

function existingCount(state, key) {
  const values = state.jobs.flatMap((job) => [job.id, job.quoteNo, job.soNo, job.woNo]);
  return values.filter((value) => value && value.startsWith(key)).length;
}

function responsibilityLabel(job) {
  const department = departmentByStatus[job.status] || "-";
  if (department === "ฝ่ายขาย") return `${department} - ${job.salesOwner}`;
  const owners = ownersByDepartment[department] || [];
  return owners.length ? `${department} - ${owners.join(", ")}` : department;
}

function pushLine(state, message) {
  state.notifications.push(`LINE -> ${message}`);
}

function verifyLineSignature(rawBody, signature) {
  if (!lineChannelSecret) return false;
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", lineChannelSecret).update(rawBody).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function lineMessageSummary(event) {
  const message = event.message || {};
  if (message.type === "text") return message.text || "";
  if (message.type === "file") return `ไฟล์: ${message.fileName || message.id || "-"}`;
  if (message.type === "image") return `รูปภาพ: ${message.id || "-"}`;
  if (message.type === "video") return `วิดีโอ: ${message.id || "-"}`;
  if (message.type === "audio") return `ข้อความเสียง: ${message.id || "-"}${message.duration ? ` (${message.duration} ms)` : ""}`;
  if (message.type === "sticker") return `สติกเกอร์: ${message.packageId || "-"} / ${message.stickerId || "-"}`;
  if (message.type === "location") return `ตำแหน่ง: ${message.title || message.address || "-"}`;
  if (event.type === "follow") return "เพิ่ม LINE Official เป็นเพื่อน";
  if (event.type === "unfollow") return "บล็อกหรือเลิกติดตาม LINE Official";
  if (event.type === "postback") return `postback: ${event.postback?.data || "-"}`;
  return event.type || "LINE event";
}

function lineEventRecord(event, user) {
  const message = event.message || {};
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    eventId: event.webhookEventId || "",
    type: event.type || "",
    mode: event.mode || "",
    sourceType: event.source?.type || "",
    lineUserId: event.source?.userId || "",
    lineGroupId: event.source?.groupId || "",
    lineRoomId: event.source?.roomId || "",
    userId: user?.id || "",
    userName: user?.name || "",
    role: user?.role || "",
    messageType: message.type || "",
    messageId: message.id || "",
    text: message.type === "text" ? message.text || "" : "",
    fileName: message.fileName || "",
    duration: message.duration || 0,
    summary: lineMessageSummary(event),
  };
}

async function lineWebhookHealth(req, res) {
  return json(res, 200, {
    ok: true,
    endpoint: "/api/line/webhook",
    signatureRequired: Boolean(lineChannelSecret),
    accessTokenConfigured: Boolean(lineChannelAccessToken),
  });
}

async function recordLineWebhookDiagnostic(fields) {
  const state = await readState();
  state.lineWebhookDiagnostics.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...fields,
  });
  state.lineWebhookDiagnostics = state.lineWebhookDiagnostics.slice(0, 200);
  await writeState(state);
  return state;
}

function lineWebhookDiagnosticFromPayload(payload, fields) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return {
    eventCount: events.length,
    eventTypes: [...new Set(events.map((event) => event.type || "").filter(Boolean))],
    sourceUserIds: [...new Set(events.map((event) => event.source?.userId || "").filter(Boolean))].slice(0, 20),
    messageTypes: [...new Set(events.map((event) => event.message?.type || "").filter(Boolean))],
    ...fields,
  };
}

async function lineWebhookDiagnostics(req, res) {
  const state = await readState();
  return json(res, 200, {
    ok: true,
    items: state.lineWebhookDiagnostics.slice(0, 50),
  });
}

async function lineWebhook(req, res) {
  if (!lineChannelSecret) {
    await recordLineWebhookDiagnostic({
      status: 503,
      signaturePresent: Boolean(req.headers["x-line-signature"]),
      signatureOk: false,
      eventCount: 0,
      error: "LINE_CHANNEL_SECRET is not configured",
    });
    return error(res, 503, "LINE_CHANNEL_SECRET is not configured");
  }

  const rawBody = await collectBody(req, 2 * 1024 * 1024);
  const signature = req.headers["x-line-signature"] || "";
  if (!verifyLineSignature(rawBody, signature)) {
    await recordLineWebhookDiagnostic({
      status: 401,
      signaturePresent: Boolean(signature),
      signatureOk: false,
      bodyBytes: rawBody.length,
      eventCount: 0,
      error: "Invalid LINE signature",
    });
    return error(res, 401, "Invalid LINE signature");
  }

  let payload;
  try {
    payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
  } catch {
    await recordLineWebhookDiagnostic({
      status: 400,
      signaturePresent: Boolean(signature),
      signatureOk: true,
      bodyBytes: rawBody.length,
      eventCount: 0,
      error: "Invalid LINE webhook JSON",
    });
    return error(res, 400, "Invalid LINE webhook JSON");
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const state = await readState();
  const savedEvents = [];

  events.forEach((event) => {
    const lineUserId = event.source?.userId || "";
    const user = lineUserId ? state.users.find((item) => item.active !== false && item.lineUserId === lineUserId) : null;
    const saved = lineEventRecord(event, user);
    state.lineEvents.unshift(saved);
    savedEvents.push(saved);
    recordActivity(state, user, "line_webhook", null, saved.summary);
    const sender = user?.name || lineUserId || event.source?.type || "LINE user";
    pushLine(state, `รับข้อความจาก ${sender}: ${saved.summary}`);
  });

  state.lineEvents = state.lineEvents.slice(0, 500);
  state.notifications = state.notifications.slice(-500);
  state.lineWebhookDiagnostics.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    status: 200,
    signaturePresent: Boolean(signature),
    signatureOk: true,
    bodyBytes: rawBody.length,
    ...lineWebhookDiagnosticFromPayload(payload),
  });
  state.lineWebhookDiagnostics = state.lineWebhookDiagnostics.slice(0, 200);
  await writeState(state);
  json(res, 200, { ok: true, received: savedEvents.length });
}

async function createJob(req, res) {
  const body = await collectBody(req);
  const { fields, files } = parseMultipart(body, req.headers["content-type"] || "");
  const state = await readState();
  const user = requireSales(req, res, state);
  if (!user) return;
  const jobType = fields.jobType;
  const status = jobType === "design" ? "WAITING_DESIGN" : jobType === "stock" ? "WAITING_STOCK" : "QUOTING";
  const attachments = await saveUploadedFiles(files);
  let lineItems = [];
  try {
    lineItems = JSON.parse(fields.lineItems || "[]")
      .map((item) => ({ name: String(item.name || "").trim(), quantity: Number(item.quantity || 0) }))
      .filter((item) => item.name && item.quantity > 0);
  } catch {
    lineItems = [];
  }
  if (!lineItems.length && fields.item) {
    lineItems = [{ name: fields.item, quantity: Number(fields.quantity || 1) }];
  }
  const itemSummary = lineItems.map((item) => item.name).join(", ");
  const quantityTotal = lineItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || Number(fields.quantity || 1);
  const job = {
    id: nextDoc(state, "INQ"),
    createdAt: new Date().toISOString(),
    customer: fields.customer || "",
    item: itemSummary,
    quantity: quantityTotal,
    lineItems,
    customerRef: fields.customerRef || "",
    salesOwner: fields.salesOwner || "",
    files: attachments,
    status,
    dueDate: fields.dueDate || "",
    deliveryMode: fields.deliveryMode || "",
    quoteNo: "",
    soNo: "",
    woNo: "",
    note: fields.note || "",
  };
  state.jobs.unshift(job);
  recordActivity(state, user, "create_job", job, `สร้างงานใหม่ สถานะ ${statusLabels[status] || status}`);
  pushLine(state, `${responsibilityLabel(job)}: มีงานใหม่ ${job.id} จาก ${job.customer}`);
  await writeState(state);
  json(res, 201, state);
}

async function updateStatus(req, res, id) {
  const { status } = await readJson(req);
  const state = await readState();
  const user = requireCurrentUser(req, res, state);
  if (!user) return;
  const job = state.jobs.find((item) => item.id === id);
  if (!job) return error(res, 404, "Job not found");
  const oldStatus = job.status;
  job.status = status;
  if (status === "WAITING_CUSTOMER_CONFIRM" && !job.quoteNo) job.quoteNo = nextDoc(state, "QT");
  if (status === "WAITING_PRODUCTION_PLAN" && !job.soNo) job.soNo = nextDoc(state, "SO");
  if (status === "IN_PRODUCTION" && !job.woNo) job.woNo = nextDoc(state, "WO");
  if (status === "WAITING_SO") {
    pushLine(state, `ฝ่ายขาย - ${job.salesOwner}: ${job.id} ถอดแบบ/เช็คสต็อกเสร็จแล้ว กรุณาออก SO / Sales Order`);
  } else {
    pushLine(state, `${responsibilityLabel(job)}: ${job.id} เปลี่ยนสถานะเป็น ${statusLabels[status] || status}`);
  }
  recordActivity(state, user, "change_status", job, `${statusLabels[oldStatus] || oldStatus} -> ${statusLabels[status] || status}`);
  await writeState(state);
  json(res, 200, state);
}

async function completeDesign(req, res, id) {
  const body = await collectBody(req);
  const { fields, files } = parseMultipart(body, req.headers["content-type"] || "");
  const state = await readState();
  const user = requireCurrentUser(req, res, state);
  if (!user) return;
  if (!["production", "admin"].includes(user.role)) return error(res, 403, "ส่งผลถอดแบบได้เฉพาะฝ่ายผลิตหรือ Admin");
  const job = state.jobs.find((item) => item.id === id);
  if (!job) return error(res, 404, "Job not found");

  const designFiles = await saveUploadedFiles(files, "designFiles");
  const message = fields.designMessage || "";
  job.status = "WAITING_SO";
  job.designReply = {
    message,
    files: designFiles,
    repliedAt: new Date().toISOString(),
  };
  const fileText = designFiles.length ? ` แนบไฟล์ ${designFiles.map((file) => file.name).join(", ")}` : "";
  const messageText = message ? ` ข้อความ: ${message}` : "";
  recordActivity(state, user, "design_reply", job, message || "ฝ่ายผลิตส่งผลถอดแบบกลับฝ่ายขาย");
  pushLine(state, `ฝ่ายขาย - ${job.salesOwner}: ${job.id} ฝ่ายผลิตถอดแบบเสร็จแล้ว กรุณาออก SO / Sales Order.${messageText}${fileText}`);
  await writeState(state);
  json(res, 200, state);
}

async function completeStock(req, res, id) {
  const { message } = await readJson(req);
  const state = await readState();
  const user = requireCurrentUser(req, res, state);
  if (!user) return;
  if (!["warehouse", "admin"].includes(user.role)) return error(res, 403, "ส่งผลเช็คสต็อกได้เฉพาะคลังหรือ Admin");
  const job = state.jobs.find((item) => item.id === id);
  if (!job) return error(res, 404, "Job not found");
  const replyMessage = String(message || "").trim();
  if (!replyMessage) return error(res, 400, "กรุณาใส่ข้อความผลเช็คสต็อก");

  job.status = "WAITING_SO";
  job.stockReply = {
    message: replyMessage,
    repliedAt: new Date().toISOString(),
  };
  recordActivity(state, user, "stock_reply", job, replyMessage);
  pushLine(state, `ฝ่ายขาย - ${job.salesOwner}: ${job.id} คลังเช็คสต็อกเสร็จแล้ว กรุณาออก SO / Sales Order. ข้อความ: ${replyMessage}`);
  await writeState(state);
  json(res, 200, state);
}

async function deleteJob(req, res, id) {
  const state = await readState();
  const user = requireCurrentUser(req, res, state);
  if (!user) return;
  const job = state.jobs.find((item) => item.id === id);
  if (!job) return error(res, 404, "Job not found");
  if (!["sales", "admin"].includes(user.role)) return error(res, 403, "ลบงานได้เฉพาะฝ่ายขายหรือ Admin");
  state.jobs = state.jobs.filter((item) => item.id !== id);
  recordActivity(state, user, "delete_job", job, "ลบงานออกจากระบบ");
  pushLine(state, `Admin: ลบงาน ${id} ออกจากระบบ`);
  await writeState(state);
  json(res, 200, state);
}

async function bulkDelete(req, res) {
  const { ids = [] } = await readJson(req);
  const state = await readState();
  const user = requireCurrentUser(req, res, state);
  if (!user) return;
  if (!["sales", "admin"].includes(user.role)) return error(res, 403, "ลบงานได้เฉพาะฝ่ายขายหรือ Admin");
  const deletedJobs = state.jobs.filter((job) => ids.includes(job.id));
  state.jobs = state.jobs.filter((job) => !ids.includes(job.id));
  deletedJobs.forEach((job) => recordActivity(state, user, "delete_job", job, "ลบจากรายการที่เลือก"));
  pushLine(state, `Admin: ลบงานที่เลือก ${ids.length} รายการ`);
  await writeState(state);
  json(res, 200, state);
}

async function seedJob(req, res) {
  const state = await readState();
  const user = requireCurrentUser(req, res, state);
  if (!user) return;
  const id = nextDoc(state, "INQ");
  const job = {
    id,
    customer: "ลูกค้าทดลอง",
    item: "งานตัวอย่างสำหรับทดลอง workflow",
    quantity: 25,
    customerRef: "demo",
    salesOwner: "คุณ ภมร",
    files: [{ name: "demo.pdf", size: 0, type: "application/pdf", url: "" }],
    status: "NEW_INQUIRY",
    dueDate: "2026-06-05",
    deliveryMode: "บริษัทจัดส่ง",
    quoteNo: "",
    soNo: "",
    woNo: "",
    note: "สร้างจากปุ่มทดลอง",
    reads: [],
  };
  state.jobs.unshift(job);
  recordActivity(state, user, "create_job", job, "สร้างงานทดลอง");
  pushLine(state, `ฝ่ายขาย - คุณ ภมร: สร้างงานทดลอง ${id}`);
  await writeState(state);
  json(res, 201, state);
}

async function closeProduction(req, res) {
  const { jobId, goodQty, defectQty } = await readJson(req);
  const state = await readState();
  const user = requireCurrentUser(req, res, state);
  if (!user) return;
  if (!["production", "admin"].includes(user.role)) return error(res, 403, "ปิดงานผลิตได้เฉพาะฝ่ายผลิตหรือ Admin");
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return error(res, 404, "Job not found");
  job.status = "PRODUCTION_DONE";
  recordActivity(state, user, "close_production", job, `ดี ${goodQty || 0} เสีย ${defectQty || 0}`);
  pushLine(state, `${job.salesOwner}/Admin: ${job.woNo || job.id} ผลิตเสร็จ ดี ${goodQty || 0} เสีย ${defectQty || 0}`);
  await writeState(state);
  json(res, 200, state);
}

async function readJob(req, res, id) {
  const { entryStatus } = await readJson(req);
  const state = await readState();
  const user = requireCurrentUser(req, res, state);
  if (!user) return;
  const job = state.jobs.find((item) => item.id === id);
  if (!job) return error(res, 404, "Job not found");
  const status = entryStatus || job.status;
  const target = readTarget(job, status);
  if (!canReadJob(user, job, status)) {
    recordActivity(state, user, "read_denied", job, `พยายามเปิดอ่าน ${statusLabels[status] || status}; ผู้ต้องอ่านคือ ${target.name || target.role}`);
    await writeState(state);
    return error(res, 403, `เอกสารนี้เปิดอ่านได้เฉพาะ ${target.name || target.role}`);
  }
  const readItem = {
    at: new Date().toISOString(),
    userId: user.id,
    userName: user.name,
    role: user.role,
    status,
  };
  job.reads.unshift(readItem);
  job.reads = job.reads.slice(0, 50);
  recordActivity(state, user, "read_job", job, `เปิดอ่าน ${statusLabels[status] || status}`);
  await writeState(state);
  json(res, 200, {
    job,
    user,
    target,
    activityLog: state.activityLog.filter((item) => item.jobId === job.id).slice(0, 12),
  });
}

async function replyJob(req, res, id) {
  const { entryStatus, message } = await readJson(req);
  const state = await readState();
  const user = requireCurrentUser(req, res, state);
  if (!user) return;
  const job = state.jobs.find((item) => item.id === id);
  if (!job) return error(res, 404, "Job not found");
  const status = entryStatus || job.status;
  if (!canReadJob(user, job, status)) {
    const target = readTarget(job, status);
    recordActivity(state, user, "reply_denied", job, `พยายามตอบกลับ ${statusLabels[status] || status}; ผู้ต้องอ่านคือ ${target.name || target.role}`);
    await writeState(state);
    return error(res, 403, `เอกสารนี้ตอบกลับได้เฉพาะ ${target.name || target.role}`);
  }
  const replyMessage = String(message || "").trim();
  if (!replyMessage) return error(res, 400, "กรุณาใส่ข้อความตอบกลับ");
  const reply = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    userId: user.id,
    userName: user.name,
    role: user.role,
    status,
    message: replyMessage,
  };
  job.replies = Array.isArray(job.replies) ? job.replies : [];
  job.replies.unshift(reply);
  job.replies = job.replies.slice(0, 100);
  recordActivity(state, user, "reply_job", job, `${statusLabels[status] || status}: ${replyMessage}`);
  pushLine(state, `${job.salesOwner || "ฝ่ายขาย"}: ${job.id} มีข้อความตอบกลับจาก ${user.name} - ${replyMessage}`);
  await writeState(state);
  json(res, 201, {
    job,
    user,
    target: readTarget(job, status),
    activityLog: state.activityLog.filter((item) => item.jobId === job.id).slice(0, 12),
  });
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      app: "office-mes",
      storage: {
        dataFile: path.relative(root, dbFile),
        uploads: path.relative(root, uploadDir),
      },
      time: new Date().toISOString(),
    });
  }
  if (req.method === "GET" && pathname === "/api/state") return json(res, 200, await readState());
  if (req.method === "GET" && pathname === "/api/users") {
    const state = await readState();
    return json(res, 200, { users: state.users });
  }
  if (req.method === "GET" && pathname === "/api/line/config") {
    return json(res, 200, {
      liffId: safeLiffId(),
      appUrl: lineAppUrl,
      pilotUrl: lineAppUrl ? `${lineAppUrl.replace(/\/$/, "")}/line.html` : "/line.html",
      webhookUrl: lineAppUrl ? `${lineAppUrl.replace(/\/$/, "")}/api/line/webhook` : "/api/line/webhook",
      webhookReady: Boolean(lineChannelSecret && lineChannelAccessToken),
    });
  }
  if (req.method === "GET" && pathname === "/api/line/webhook/health") return lineWebhookHealth(req, res);
  if (req.method === "GET" && pathname === "/api/line/webhook/diagnostics") return lineWebhookDiagnostics(req, res);
  if (req.method === "POST" && pathname === "/api/line/webhook") return lineWebhook(req, res);
  if (req.method === "POST" && pathname === "/api/login") return login(req, res);
  if (req.method === "POST" && pathname === "/api/line/session") return lineSession(req, res);
  if (req.method === "POST" && pathname === "/api/line/webhook") return lineWebhook(req, res);
  if (req.method === "GET" && pathname === "/api/session") return getSession(req, res);
  if (req.method === "POST" && pathname === "/api/logout") return logout(req, res);
  if (req.method === "POST" && pathname === "/api/users") return createUser(req, res);
  if (req.method === "POST" && pathname === "/api/jobs") return createJob(req, res);
  if (req.method === "POST" && pathname === "/api/jobs/bulk-delete") return bulkDelete(req, res);
  if (req.method === "POST" && pathname === "/api/jobs/seed") return seedJob(req, res);
  if (req.method === "POST" && pathname === "/api/production/close") return closeProduction(req, res);

  const statusMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) return updateStatus(req, res, decodeURIComponent(statusMatch[1]));

  const designMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/design-complete$/);
  if (req.method === "POST" && designMatch) return completeDesign(req, res, decodeURIComponent(designMatch[1]));

  const stockMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/stock-complete$/);
  if (req.method === "POST" && stockMatch) return completeStock(req, res, decodeURIComponent(stockMatch[1]));

  const readMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/read$/);
  if (req.method === "POST" && readMatch) return readJob(req, res, decodeURIComponent(readMatch[1]));

  const replyMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/reply$/);
  if (req.method === "POST" && replyMatch) return replyJob(req, res, decodeURIComponent(replyMatch[1]));

  const lineLinkMatch = pathname.match(/^\/api\/users\/([^/]+)\/line-link$/);
  if (req.method === "POST" && lineLinkMatch) return linkLineUser(req, res, decodeURIComponent(lineLinkMatch[1]));

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === "PATCH" && userMatch) return updateUser(req, res, decodeURIComponent(userMatch[1]));

  const deleteMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) return deleteJob(req, res, decodeURIComponent(deleteMatch[1]));

  return error(res, 404, "API route not found");
}

function serveStatic(req, res, pathname) {
  const cleanPath = decodeURIComponent(pathname);
  const filePath = path.join(root, cleanPath === "/" ? "index.html" : cleanPath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    error(res, 500, err.message || "Server error");
  }
});

ensureStorage().then(() => {
  server.listen(port, host, () => {
    const localUrl = `http://localhost:${port}`;
    const bindText = host === "0.0.0.0" ? "all network interfaces" : host;
    console.log(`Office MES backend running at ${localUrl}`);
    console.log(`Listening on ${bindText}:${port}`);
  });
});
