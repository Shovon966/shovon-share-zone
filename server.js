const express = require("express");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "");
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 2 * 1024 * 1024 * 1024);
const MAX_FILES = Number(process.env.MAX_FILES || 20);
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const META_FILE = path.join(DATA_DIR, "metadata.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, "{}");

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));

function readMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, "utf8")); }
  catch { return {}; }
}
function writeMeta(data) {
  const temp = META_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, META_FILE);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored) return true;
  const [salt, expected] = stored.split(":");
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expected, "hex");
  return actual.length === expectedBuf.length && crypto.timingSafeEqual(actual, expectedBuf);
}
function safeName(name) {
  return path.basename(name).replace(/[^\w.\- ()[\]]/g, "_").slice(0, 180) || "download";
}
function cleanupExpired() {
  const meta = readMeta();
  let changed = false;
  for (const [id, item] of Object.entries(meta)) {
    if (item.expiresAt <= Date.now()) {
      for (const file of item.files || []) {
        const p = path.join(UPLOAD_DIR, file.storedName);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      delete meta[id];
      changed = true;
    }
  }
  if (changed) writeMeta(meta);
}
cleanupExpired();
setInterval(cleanupExpired, 30 * 60 * 1000).unref();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => cb(null, crypto.randomBytes(18).toString("hex"))
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    // Keep original names as metadata; never use them as filesystem paths.
    cb(null, true);
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "SHOVON SHARE ZONE" }));

app.post("/api/transfers", upload.array("files", MAX_FILES), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "Please choose at least one file." });

  const expiryDays = Math.min(30, Math.max(1, Number(req.body.expiryDays || 7)));
  const password = String(req.body.password || "");
  if (password.length > 100) {
    files.forEach(f => fs.existsSync(f.path) && fs.unlinkSync(f.path));
    return res.status(400).json({ error: "Password is too long." });
  }

  const id = crypto.randomBytes(12).toString("hex");
  const item = {
    id,
    createdAt: Date.now(),
    expiresAt: Date.now() + expiryDays * 24 * 60 * 60 * 1000,
    passwordHash: password ? hashPassword(password) : null,
    files: files.map(f => ({
      storedName: f.filename,
      originalName: safeName(f.originalname),
      size: f.size,
      mimeType: f.mimetype || "application/octet-stream"
    }))
  };

  const meta = readMeta();
  meta[id] = item;
  writeMeta(meta);
  const base = BASE_URL || `${req.protocol}://${req.get("host")}`;
  res.status(201).json({
    id,
    shareUrl: `${base}/s/${id}`,
    expiresAt: item.expiresAt,
    fileCount: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0)
  });
});

app.get("/s/:id", (req, res) => res.sendFile(path.join(__dirname, "public", "share.html")));

app.get("/api/transfers/:id", (req, res) => {
  cleanupExpired();
  const item = readMeta()[req.params.id];
  if (!item) return res.status(404).json({ error: "This transfer is unavailable or has expired." });
  res.json({
    id: item.id,
    expiresAt: item.expiresAt,
    passwordProtected: Boolean(item.passwordHash),
    files: item.files.map((f, index) => ({
      index, name: f.originalName, size: f.size, mimeType: f.mimeType
    }))
  });
});

app.post("/api/transfers/:id/unlock", (req, res) => {
  cleanupExpired();
  const item = readMeta()[req.params.id];
  if (!item) return res.status(404).json({ error: "This transfer is unavailable or has expired." });
  if (!item.passwordHash) return res.json({ token: "open" });
  const password = String(req.body.password || "");
  if (!verifyPassword(password, item.passwordHash)) {
    return res.status(401).json({ error: "That password doesn't match. Try again." });
  }
  // Short-lived signed token; password is never sent to the download endpoint.
  const expires = Date.now() + 10 * 60 * 1000;
  const payload = `${item.id}.${expires}`;
  const secret = process.env.TOKEN_SECRET || "change-this-secret-before-production";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  res.json({ token: Buffer.from(`${payload}.${sig}`).toString("base64url") });
});

function tokenValid(token, id) {
  if (token === "open") return true;
  try {
    const decoded = Buffer.from(token || "", "base64url").toString();
    const [tokenId, expires, sig] = decoded.split(".");
    if (tokenId !== id || Number(expires) < Date.now()) return false;
    const secret = process.env.TOKEN_SECRET || "change-this-secret-before-production";
    const expected = crypto.createHmac("sha256", secret).update(`${tokenId}.${expires}`).digest("hex");
    const a = Buffer.from(sig || "");
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

app.get("/api/transfers/:id/files/:index", (req, res) => {
  cleanupExpired();
  const item = readMeta()[req.params.id];
  if (!item) return res.status(404).json({ error: "This transfer is unavailable or has expired." });
  if (!tokenValid(req.query.token, item.id)) return res.status(401).json({ error: "Please unlock this transfer first." });
  const index = Number(req.params.index);
  const file = item.files[index];
  if (!Number.isInteger(index) || !file) return res.status(404).json({ error: "File not found." });
  const diskPath = path.join(UPLOAD_DIR, file.storedName);
  if (!fs.existsSync(diskPath)) return res.status(404).json({ error: "File not found." });
  res.download(diskPath, file.originalName);
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? `A file is larger than the ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB limit.`
      : err.code === "LIMIT_FILE_COUNT" ? `You can upload up to ${MAX_FILES} files at once.` : err.message;
    return res.status(400).json({ error: message });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(PORT, () => console.log(`SHOVON SHARE ZONE is running on http://localhost:${PORT}`));
