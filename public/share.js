const id = location.pathname.split("/").filter(Boolean).pop();
const list = document.getElementById("downloadList");
const error = document.getElementById("shareError");
const passwordBox = document.getElementById("passwordBox");
const lead = document.getElementById("shareLead");
let transfer = null, accessToken = null;

function size(n) { return n < 1024*1024 ? `${(n/1024).toFixed(0)} KB` : n < 1024**3 ? `${(n/1024**2).toFixed(1)} MB` : `${(n/1024**3).toFixed(2)} GB`; }
function showFiles() {
  list.innerHTML = "";
  transfer.files.forEach(file => {
    const row = document.createElement("div"); row.className = "download-item";
    const badge = document.createElement("div"); badge.className = "file-badge"; badge.textContent = "↓";
    const info = document.createElement("div"); info.className = "file-info";
    const name = document.createElement("strong"); name.textContent = file.name;
    const detail = document.createElement("small"); detail.textContent = size(file.size);
    info.append(name, detail);
    const link = document.createElement("a"); link.href = `/api/transfers/${id}/files/${file.index}?token=${encodeURIComponent(accessToken || "open")}`; link.textContent = "Download"; link.setAttribute("download", "");
    row.append(badge, info, link); list.append(row);
  });
  const date = new Date(transfer.expiresAt);
  lead.textContent = `${transfer.files.length} file${transfer.files.length===1?"":"s"} · Expires ${date.toLocaleString()}`;
}
async function load() {
  try {
    const response = await fetch(`/api/transfers/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Transfer not found.");
    transfer = data;
    if (data.passwordProtected) passwordBox.hidden = false;
    else { accessToken = "open"; showFiles(); }
  } catch (e) { error.textContent = e.message; }
}
document.getElementById("unlockBtn").addEventListener("click", async () => {
  const btn = document.getElementById("unlockBtn");
  btn.disabled = true; error.textContent = "";
  try {
    const response = await fetch(`/api/transfers/${id}/unlock`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: document.getElementById("unlockPassword").value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to unlock.");
    accessToken = data.token; passwordBox.hidden = true; showFiles();
  } catch (e) { error.textContent = e.message; }
  finally { btn.disabled = false; }
});
load();
