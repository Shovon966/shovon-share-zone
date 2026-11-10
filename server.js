const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const IMAGE_DIR = path.join(DATA_DIR, "images");
const DB_FILE = path.join(DATA_DIR, "photos.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error("Set ADMIN_PASSWORD and SESSION_SECRET environment variables.");
  process.exit(1);
}
fs.mkdirSync(IMAGE_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");

const readPhotos = () => {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return []; }
};
const writePhotos = (photos) => {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(photos, null, 2));
  fs.renameSync(tmp, DB_FILE);
};
const safeEqual = (a, b) => {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};
const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return body + "." + sig;
};
const verify = (token) => {
  if (!token || !token.includes(".")) return false;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return data.exp > Date.now();
  } catch { return false; }
};
const isAdmin = (req) => {
  const token = (req.headers.cookie || "").split(";").map(x => x.trim())
    .find(x => x.startsWith("ssz_admin="))?.slice("ssz_admin=".length);
  return verify(token);
};
const requireAdmin = (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: "Admin login required" });

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/media", express.static(IMAGE_DIR, { fallthrough: false, maxAge: "1h" }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGE_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 30 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)) return cb(new Error("Only image files are allowed"));
    cb(null, true);
  }
});

app.get("/api/photos", (_req, res) => {
  res.json(readPhotos().sort((a,b) => b.createdAt - a.createdAt));
});
app.get("/api/photos/:id", (req, res) => {
  const photo = readPhotos().find(p => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: "Photo not found" });
  res.json(photo);
});
app.post("/api/admin/login", (req, res) => {
  if (!safeEqual(req.body?.password || "", ADMIN_PASSWORD)) return res.status(401).json({ error: "Incorrect password" });
  const token = sign({ admin: true, exp: Date.now() + 12 * 60 * 60 * 1000 });
  res.setHeader("Set-Cookie", `ssz_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (_req, res) => {
  res.setHeader("Set-Cookie", "ssz_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
  res.json({ ok: true });
});
app.get("/api/admin/status", (req, res) => res.json({ authenticated: isAdmin(req) }));
app.post("/api/admin/photos", requireAdmin, upload.array("photos", 30), (req, res) => {
  const photos = readPhotos();
  const album = String(req.body.album || "My Gallery").trim().slice(0, 80) || "My Gallery";
  const added = (req.files || []).map(file => ({
    id: crypto.randomUUID(),
    filename: file.filename,
    originalName: path.basename(file.originalname).slice(0, 180),
    album,
    createdAt: Date.now()
  }));
  writePhotos([...added, ...photos]);
  res.json({ ok: true, added });
});
app.delete("/api/admin/photos/:id", requireAdmin, (req, res) => {
  const photos = readPhotos();
  const photo = photos.find(p => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: "Photo not found" });
  const file = path.join(IMAGE_DIR, path.basename(photo.filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  writePhotos(photos.filter(p => p.id !== req.params.id));
  res.json({ ok: true });
});
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message || "Request failed" });
});
app.listen(PORT, "0.0.0.0", () => console.log(`SHOVON SHARE ZONE running on ${PORT}`));
