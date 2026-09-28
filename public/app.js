const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const HOSTED = !["localhost", "127.0.0.1"].includes(location.hostname);
const MAX_MB = HOSTED ? 4 : 25; // Vercel functions accept ~4.5 MB bodies; Groq accepts 25 MB
let tab = "audio", audioFile = null, current = null, view = "list", recorder = null, recTimer = null;

// ---------- waveform logo ----------
const wave = $("#wave");
const heights = [10, 22, 34, 18, 28, 12, 30, 16, 24, 8];
heights.forEach((h, i) => { const b = document.createElement("i"); b.style.setProperty("--h", h + "px"); b.style.setProperty("--d", i * 0.08 + "s"); wave.appendChild(b); });
$("#sizeNote").textContent = `Up to ${MAX_MB} MB${HOSTED ? " on the hosted version (about 4 minutes of MP3). Longer meetings: run locally or paste the transcript." : "."}`;

// ---------- theme ----------
const root = document.documentElement;
const savedTheme = localStorage.getItem("mi-theme");
if (savedTheme) root.dataset.theme = savedTheme;
else if (matchMedia("(prefers-color-scheme: dark)").matches) root.dataset.theme = "dark";
const syncThemeLabel = () => { const label = $("#theme span:nth-child(2)"); if (label) label.textContent = root.dataset.theme === "dark" ? "Light mode" : "Dark mode"; };
syncThemeLabel();
$("#theme").onclick = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; localStorage.setItem("mi-theme", root.dataset.theme); syncThemeLabel(); };

// ---------- tabs ----------
document.querySelectorAll(".tab").forEach((t) => t.onclick = () => {
  tab = t.dataset.tab;
  document.querySelectorAll(".tab").forEach((x) => { x.classList.toggle("active", x === t); x.setAttribute("aria-selected", String(x === t)); });
  $("#tab-audio").hidden = tab !== "audio";
  $("#tab-text").hidden = tab !== "text";
  refresh();
});

function refresh() {
  $("#go").disabled = tab === "audio" ? !audioFile : $("#transcript").value.trim().length < 40;
}
$("#transcript").addEventListener("input", refresh);

// ---------- file pick / drop ----------
function setAudio(file) {
  if (!file) return;
  if (file.size > MAX_MB * 1024 * 1024) return status(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit here is ${MAX_MB} MB. Use a shorter clip or paste the transcript.`, true);
  audioFile = file;
  $("#drop").classList.add("has");
  $("#dropTitle").textContent = file.name;
  $("#dropHint").textContent = `${(file.size / 1048576).toFixed(1)} MB. Click to choose another`;
  status("");
  refresh();
}
$("#file").onchange = (e) => setAudio(e.target.files[0]);
["dragenter", "dragover"].forEach((ev) => $("#drop").addEventListener(ev, (e) => { e.preventDefault(); $("#drop").classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => $("#drop").addEventListener(ev, (e) => { e.preventDefault(); $("#drop").classList.remove("over"); }));
$("#drop").addEventListener("drop", (e) => setAudio(e.dataTransfer.files[0]));
$("#drop").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file").click(); } });
$("#txtFile").onchange = async (e) => { const f = e.target.files[0]; if (f) { $("#transcript").value = await f.text(); refresh(); } };

// ---------- microphone recording ----------
$("#recBtn").onclick = async () => {
  if (recorder) return recorder.stop();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const ctx = new AudioContext(), analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const cv = $("#meter"), g = cv.getContext("2d"), buf = new Uint8Array(analyser.frequencyBinCount);
    cv.hidden = false;
    const accent = getComputedStyle(root).getPropertyValue("--accent");
    let raf; (function draw() {
      analyser.getByteFrequencyData(buf); g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = accent;
      buf.forEach((v, i) => { const h = Math.max(3, (v / 255) * cv.height); g.fillRect(i * 7 + 2, (cv.height - h) / 2, 4, h); });
      raf = requestAnimationFrame(draw);
    })();
    const t0 = Date.now();
    recTimer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $("#recTime").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 500);
    $("#recBtn").textContent = "Stop recording"; $("#recBtn").classList.add("recording");
    recorder.onstop = () => {
      cancelAnimationFrame(raf); clearInterval(recTimer); stream.getTracks().forEach((t) => t.stop()); ctx.close();
      cv.hidden = true; $("#recTime").textContent = ""; recorder = null;
      $("#recBtn").textContent = "Record meeting"; $("#recBtn").classList.remove("recording");
      setAudio(new File(chunks, `recording-${new Date().toISOString().slice(0, 16)}.webm`, { type: "audio/webm" }));
    };
    recorder.start();
  } catch { status("Microphone access was blocked. Allow it in your browser settings, or upload a file instead.", true); }
};

// ---------- sample ----------
$("#sample").onclick = () => {
  $("#transcript").value = `Priya: Thanks everyone for joining. The goal today is to lock the launch plan for the new mobile app.
Marcus: QA finished the first pass. There are still two blocking bugs in the payment flow, and I think we can fix them by Friday.
Priya: Okay. Marcus, please own the payment bug fixes and have them done by this Friday.
Elena: On marketing, we decided to move the launch email from the 12th to the 15th so it lines up with the app store approval. I'll draft the copy and send it to Priya for review by Wednesday.
Priya: Agreed, we're officially moving the public launch to the 15th. Sam, can you update the status page and tell support about the new date before Thursday?
Sam: Sure. One open question: do we still offer the free trial for existing customers? I don't know the answer yet.
Priya: Let's take that offline. I'll check with finance and report back next Monday.
Elena: Also, budget for paid ads is approved at 8,000 dollars, low priority for now, we can start after launch.
Priya: Great. Let's wrap up. Thanks all.`;
  refresh();
};

// ---------- status ----------
function status(msg, err = false) {
  const el = $("#status"); el.hidden = !msg; el.textContent = msg; el.classList.toggle("error", err);
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); }

async function api(path, opts) {
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 413 ? "That file is too large for the server. Use a shorter clip or paste the transcript." : data.detail || `Request failed (${r.status})`);
  return data;
}

// ---------- generate ----------
$("#go").onclick = async () => {
  $("#go").disabled = true; wave.classList.add("busy");
  try {
    let transcript;
    if (tab === "audio") {
      status("Step 1 of 2: transcribing audio…");
      const fd = new FormData(); fd.append("file", audioFile);
      transcript = (await api("/api/transcribe", { method: "POST", body: fd })).transcript;
      if (!transcript) throw new Error("No speech was found in that audio.");
    } else transcript = $("#transcript").value;
    status(tab === "audio" ? "Step 2 of 2: finding decisions and action items…" : "Finding decisions and action items…");
    const data = await api("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript }) });
    data.transcript = transcript; data.id = Date.now(); data.done = {};
    show(data); saveHistory(data); status("");
  } catch (e) { status(e.message, true); }
  finally { wave.classList.remove("busy"); refresh(); }
};

// ---------- render ----------
const initials = (n) => (n || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
function taskHTML(a, i, showOwner = true) {
  const done = current.done[i];
  return `<div class="task ${done ? "done" : ""}"><input type="checkbox" data-i="${i}" ${done ? "checked" : ""} aria-label="Mark done">
    <div><div class="tt">${esc(a.task)}</div><div class="meta">
    ${showOwner ? `<span><span class="av">${esc(initials(a.owner))}</span> ${esc(a.owner)}</span>` : ""}
    ${a.deadline ? `<span class="due">${esc(a.deadline)}</span>` : ""}</div></div>
    <span class="pri ${esc(a.priority)}">${esc(a.priority)}</span></div>`;
}
function tasksHTML() {
  const items = current.action_items;
  if (!items.length) return `<p class="muted">No action items were found.</p>`;
  if (view === "list") return `<div class="tasks">${items.map((a, i) => taskHTML(a, i)).join("")}</div>`;
  const groups = {}; items.forEach((a, i) => (groups[a.owner] ||= []).push([a, i]));
  return `<div class="tasks">${Object.entries(groups).map(([o, l]) => `<div class="group">${esc(o)} (${l.length})</div>${l.map(([a, i]) => taskHTML(a, i, false)).join("")}`).join("")}</div>`;
}
function show(d) {
  current = d; $("#empty").hidden = true;
  const owners = {}; d.action_items.forEach((a) => (owners[a.owner] = (owners[a.owner] || 0) + 1));
  const r = $("#report"); r.hidden = false;
  r.innerHTML = `
  <div class="rhead"><h2>${esc(d.title)}</h2>
    <div class="actions"><button class="btn" id="cp">Copy</button><button class="btn" id="dlmd">Download .md</button><button class="btn" id="pr">Print / PDF</button></div></div>
  ${d.participants.length ? `<div class="people">${d.participants.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>` : ""}
  <section class="block"><h3>Summary</h3><p class="summary">${esc(d.summary)}</p></section>
  ${d.key_points.length ? `<section class="block"><h3>Key points</h3><ul class="plain">${d.key_points.map((k) => `<li>${esc(k)}</li>`).join("")}</ul></section>` : ""}
  <section class="block"><h3>Decisions</h3>${d.decisions.length ? d.decisions.map((x) => `<div class="decision"><b>${esc(x.decision ?? x)}</b>${x.context ? `<span>${esc(x.context)}</span>` : ""}</div>`).join("") : `<p class="muted">No decisions were made.</p>`}</section>
  <section class="block"><h3>Action items</h3>
    <div class="people" style="margin:0 0 14px">${Object.entries(owners).map(([o, n]) => `<span class="chip"><b>${n}</b> ${esc(o)}</span>`).join("")}</div>
    <div class="seg"><button data-v="list" class="${view === "list" ? "on" : ""}">All tasks</button><button data-v="owner" class="${view === "owner" ? "on" : ""}">By owner</button></div>
    <div id="tasks">${tasksHTML()}</div></section>
  <section class="block"><h3>Deadlines</h3>${d.deadlines.length ? `<div class="dl">${d.deadlines.map((x) => `<div><b>${esc(x.date)}</b><span>${esc(x.item)}</span></div>`).join("")}</div>` : `<p class="muted">No deadlines were mentioned.</p>`}</section>
  ${d.open_questions.length ? `<section class="block"><h3>Open questions</h3><ul class="plain">${d.open_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></section>` : ""}
  <section class="block"><details><summary class="link">Show transcript</summary><p class="muted" style="white-space:pre-wrap;max-width:70ch">${esc(d.transcript)}</p></details></section>`;
  bind(); r.scrollIntoView({ behavior: "smooth", block: "start" });
}
function bind() {
  const bindTasks = () => document.querySelectorAll("#tasks input").forEach((c) => c.onchange = () => { current.done[c.dataset.i] = c.checked; c.closest(".task").classList.toggle("done", c.checked); updateHistory(); });
  bindTasks();
  document.querySelectorAll(".seg button").forEach((b) => b.onclick = () => { view = b.dataset.v; document.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x === b)); $("#tasks").innerHTML = tasksHTML(); bindTasks(); });
  $("#cp").onclick = async () => { await navigator.clipboard.writeText(toMarkdown(current)); toast("Copied as Markdown"); };
  $("#dlmd").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([toMarkdown(current)], { type: "text/markdown" })); a.download = current.title.replace(/[^\w]+/g, "-").toLowerCase() + ".md"; a.click(); };
  $("#pr").onclick = () => print();
}
function toMarkdown(d) {
  const L = [`# ${d.title}`, "", "## Summary", d.summary, ""];
  if (d.key_points.length) L.push("## Key points", ...d.key_points.map((k) => `- ${k}`), "");
  L.push("## Decisions", ...(d.decisions.length ? d.decisions.map((x) => `- **${x.decision ?? x}**${x.context ? ` (${x.context})` : ""}`) : ["- None"]), "");
  L.push("## Action items", ...(d.action_items.length ? d.action_items.map((a) => `- [${d.done[d.action_items.indexOf(a)] ? "x" : " "}] ${a.task} | Owner: ${a.owner} | Due: ${a.deadline || "n/a"} | Priority: ${a.priority}`) : ["- None"]), "");
  L.push("## Deadlines", ...(d.deadlines.length ? d.deadlines.map((x) => `- ${x.date}: ${x.item}`) : ["- None"]));
  if (d.open_questions.length) L.push("", "## Open questions", ...d.open_questions.map((q) => `- ${q}`));
  return L.join("\n");
}

// ---------- history (stored in this browser only) ----------
const getHistory = () => { try { return JSON.parse(localStorage.getItem("mi-history") || "[]"); } catch { return []; } };
function saveHistory(d) { localStorage.setItem("mi-history", JSON.stringify([d, ...getHistory().filter((x) => x.id !== d.id)].slice(0, 8))); renderHistory(); }
function updateHistory() { const h = getHistory(); const i = h.findIndex((x) => x.id === current.id); if (i > -1) { h[i] = current; localStorage.setItem("mi-history", JSON.stringify(h)); } }
function renderHistory() {
  const h = getHistory(); $("#historyWrap").hidden = !h.length;
  $("#history").innerHTML = h.map((d) => `<li><button data-id="${d.id}">${esc(d.title)}<small>${new Date(d.id).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small></button></li>`).join("");
  $("#history").querySelectorAll("button").forEach((b) => b.onclick = () => show(getHistory().find((x) => x.id == b.dataset.id)));
}
renderHistory(); refresh();
