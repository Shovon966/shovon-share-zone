const input = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const browse = document.getElementById("browse");
const list = document.getElementById("fileList");
const sendBtn = document.getElementById("sendBtn");
const statusBox = document.getElementById("status");
const result = document.getElementById("result");
let selected = [];
document.getElementById("year").textContent = new Date().getFullYear();

const formatSize = n => n < 1024*1024 ? `${(n/1024).toFixed(0)} KB` : n < 1024**3 ? `${(n/1024**2).toFixed(1)} MB` : `${(n/1024**3).toFixed(2)} GB`;
function addFiles(files) {
  const incoming = Array.from(files);
  const merged = [...selected];
  for (const file of incoming) {
    if (merged.length >= 20) break;
    if (!merged.some(x => x.name === file.name && x.size === file.size && x.lastModified === file.lastModified)) merged.push(file);
  }
  selected = merged;
  render();
}
function render() {
  list.innerHTML = "";
  selected.forEach((file, i) => {
    const row = document.createElement("div"); row.className = "file-item";
    const badge = document.createElement("div"); badge.className = "file-badge"; badge.textContent = "↗";
    const info = document.createElement("div"); info.className = "file-info";
    const name = document.createElement("strong"); name.textContent = file.name;
    const size = document.createElement("small"); size.textContent = formatSize(file.size);
    info.append(name, size);
    const remove = document.createElement("button"); remove.className = "remove-file"; remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", "Remove file");
    remove.onclick = () => { selected.splice(i, 1); render(); };
    row.append(badge, info, remove); list.append(row);
  });
  sendBtn.disabled = selected.length === 0;
  sendBtn.textContent = selected.length ? `Get transfer link · ${selected.length} file${selected.length>1?"s":""} ↗` : "Get transfer link ↗";
  statusBox.textContent = "";
}
browse.addEventListener("click", e => { e.stopPropagation(); input.click(); });
dropzone.addEventListener("click", () => input.click());
dropzone.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") input.click(); });
input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
["dragenter","dragover"].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.add("dragover"); }));
["dragleave","drop"].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.remove("dragover"); }));
dropzone.addEventListener("drop", e => addFiles(e.dataTransfer.files));

sendBtn.addEventListener("click", async () => {
  if (!selected.length) return;
  sendBtn.disabled = true; sendBtn.textContent = "Uploading your files…";
  statusBox.textContent = ""; result.hidden = true;
  const form = new FormData();
  selected.forEach(file => form.append("files", file));
  form.append("expiryDays", document.getElementById("expiry").value);
  form.append("password", document.getElementById("password").value);
  try {
    const response = await fetch("/api/transfers", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed.");
    result.hidden = false;
    result.innerHTML = "";
    const heading = document.createElement("strong"); heading.textContent = "Your link is ready ✨";
    const row = document.createElement("div"); row.className = "result-row";
    const url = document.createElement("input"); url.readOnly = true; url.value = data.shareUrl; url.setAttribute("aria-label", "Share link");
    const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "Copy";
    copy.onclick = async () => { try { await navigator.clipboard.writeText(data.shareUrl); copy.textContent = "Copied!"; } catch { url.select(); document.execCommand("copy"); copy.textContent = "Copied!"; } };
    row.append(url, copy); result.append(heading, row);
    selected = []; render(); document.getElementById("password").value = "";
  } catch (err) {
    statusBox.textContent = err.message;
  } finally {
    sendBtn.disabled = selected.length === 0;
    sendBtn.textContent = selected.length ? `Get transfer link · ${selected.length} file${selected.length>1?"s":""} ↗` : "Get transfer link ↗";
  }
});
