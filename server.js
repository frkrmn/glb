import { exec } from "child_process";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const STATE_FILE = join(__dirname, ".scraper-state.json");

let isRunning = false;

function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  try { return JSON.parse(readFileSync(STATE_FILE, "utf-8")); }
  catch { return {}; }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function formatTurkishDate(isoString) {
  const months = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
                  "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  const d = new Date(isoString);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bare Fakta — Scraper</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #f5f5f3;
      color: #1a1a1a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
    }

    .container { width: 100%; max-width: 700px; }

    header { margin-bottom: 36px; }

    .logo {
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #aaa;
      margin-bottom: 6px;
      font-weight: 500;
    }

    h1 {
      font-size: 26px;
      font-weight: 700;
      color: #111;
      letter-spacing: -0.03em;
    }

    h1 span { color: #16a34a; }

    /* --- Source Cards --- */
    .sources {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }

    .source-card {
      background: #fff;
      border: 1.5px solid #e5e5e5;
      border-radius: 10px;
      padding: 14px 16px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      user-select: none;
      position: relative;
    }

    .source-card:hover { border-color: #ccc; }

    .source-card.selected {
      border-color: #16a34a;
      background: #f0fdf4;
    }

    .source-card.disabled {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }

    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 5px;
    }

    .source-name {
      font-size: 13px;
      font-weight: 600;
      color: #111;
    }

    .checkmark {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 1.5px solid #ddd;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: transparent;
      flex-shrink: 0;
      transition: all 0.15s;
    }

    .source-card.selected .checkmark {
      background: #16a34a;
      border-color: #16a34a;
      color: #fff;
    }

    .source-desc {
      font-size: 11px;
      color: #888;
      line-height: 1.4;
      margin-bottom: 8px;
    }

    .last-run {
      font-size: 10.5px;
      color: #16a34a;
      font-weight: 500;
      display: none;
      align-items: center;
      gap: 4px;
    }

    .last-run.visible { display: flex; }
    .last-run.never { color: #bbb; display: flex; }

    .last-run-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #16a34a;
      flex-shrink: 0;
    }

    .last-run.never .last-run-dot { background: #ddd; }

    /* --- Buttons --- */
    .actions {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }

    button {
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      padding: 11px 20px;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    #runBtn {
      background: #111;
      color: #fff;
      flex: 1;
    }

    #runBtn:hover { background: #333; }
    #runBtn:disabled { opacity: 0.35; cursor: not-allowed; }

    #pushBtn {
      background: #16a34a;
      color: #fff;
      opacity: 0.35;
      cursor: not-allowed;
      pointer-events: none;
    }

    #pushBtn.active {
      opacity: 1;
      cursor: pointer;
      pointer-events: all;
    }

    #pushBtn.active:hover { background: #15803d; }
    #pushBtn:disabled { opacity: 0.35; cursor: not-allowed; }

    #clearBtn {
      background: #fff;
      color: #888;
      border: 1.5px solid #e5e5e5;
    }

    #clearBtn:hover { background: #f9f9f9; color: #555; }

    /* --- Log --- */
    .log-wrapper {
      background: #fff;
      border: 1.5px solid #e5e5e5;
      border-radius: 10px;
      overflow: hidden;
    }

    .log-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1.5px solid #f0f0f0;
      background: #fafafa;
    }

    .log-title {
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #aaa;
      font-weight: 600;
    }

    .status-pill {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 3px 10px;
      border-radius: 99px;
      background: #f0f0f0;
      color: #aaa;
      transition: all 0.3s;
    }

    .status-pill.running { background: #fef9c3; color: #a16207; }
    .status-pill.done    { background: #dcfce7; color: #15803d; }
    .status-pill.error   { background: #fee2e2; color: #b91c1c; }
    .status-pill.pushed  { background: #dbeafe; color: #1d4ed8; }

    #log {
      padding: 16px;
      min-height: 260px;
      max-height: 440px;
      overflow-y: auto;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
      line-height: 1.75;
      color: #888;
      white-space: pre-wrap;
      word-break: break-all;
    }

    #log .ok   { color: #16a34a; }
    #log .err  { color: #dc2626; }
    #log .info { color: #2563eb; }
    #log .warn { color: #d97706; }
    #log .dim  { color: #ccc; }
    #log .empty { color: #ccc; font-style: italic; }
  </style>
</head>
<body>
<div class="container">
  <header>
    <p class="logo">Bare Fakta</p>
    <h1>Scraper <span>Control</span></h1>
  </header>

  <div class="sources" id="sources">
    <div class="source-card selected" data-source="amsflow" onclick="toggleSource(this)">
      <div class="card-top">
        <span class="source-name">Amsflow</span>
        <span class="checkmark">✓</span>
      </div>
      <div class="source-desc">Global fear & greed — 10 markets</div>
      <div class="last-run never" id="run-amsflow">
        <span class="last-run-dot"></span>
        <span>Henüz çalıştırılmadı</span>
      </div>
    </div>

    <div class="source-card" data-source="kmquant" onclick="toggleSource(this)">
      <div class="card-top">
        <span class="source-name">KMquant</span>
        <span class="checkmark">✓</span>
      </div>
      <div class="source-desc">BTC & ETH algo, max pain</div>
      <div class="last-run never" id="run-kmquant">
        <span class="last-run-dot"></span>
        <span>Henüz çalıştırılmadı</span>
      </div>
    </div>

    <div class="source-card" data-source="newhedge" onclick="toggleSource(this)">
      <div class="card-top">
        <span class="source-name">NewHedge</span>
        <span class="checkmark">✓</span>
      </div>
      <div class="source-desc">BTC on-chain metrics</div>
      <div class="last-run never" id="run-newhedge">
        <span class="last-run-dot"></span>
        <span>Henüz çalıştırılmadı</span>
      </div>
    </div>
  </div>

  <div class="actions">
    <button id="runBtn" onclick="runScraper()">▶ Run Selected</button>
    <button id="pushBtn" onclick="pushToGitHub()">↑ Push to GitHub</button>
    <button id="clearBtn" onclick="clearLog()">Clear</button>
  </div>

  <div class="log-wrapper">
    <div class="log-header">
      <span class="log-title">Output</span>
      <span class="status-pill" id="statusPill">Idle</span>
    </div>
    <div id="log"><span class="empty">Select sources and press Run.</span></div>
  </div>
</div>

<script>
  // Sayfa yüklenince son run zamanlarını göster
  fetch('/state').then(r => r.json()).then(state => {
    Object.entries(state).forEach(([source, info]) => {
      updateRunLabel(source, info.lastRun);
    });
  });

  function updateRunLabel(source, isoString) {
    const el = document.getElementById('run-' + source);
    if (!el) return;
    if (isoString) {
      const span = el.querySelector('span:last-child');
      span.textContent = isoString;
      el.classList.remove('never');
      el.classList.add('visible');
      el.querySelector('.last-run-dot').style.background = '#16a34a';
    }
  }

  function toggleSource(card) {
    if (card.classList.contains('disabled')) return;
    card.classList.toggle('selected');
  }

  function clearLog() {
    document.getElementById('log').innerHTML = '<span class="empty">Select sources and press Run.</span>';
    document.getElementById('statusPill').className = 'status-pill';
    document.getElementById('statusPill').textContent = 'Idle';
  }

  function appendLog(text) {
    const log = document.getElementById('log');
    if (log.querySelector('.empty')) log.innerHTML = '';
    const line = document.createElement('span');
    const t = text.trim();
    if (t.startsWith('✓') || t.includes('saved') || t.includes('Saved') || t.includes('Done'))
      line.className = 'ok';
    else if (t.startsWith('✗') || t.toLowerCase().includes('error') || t.toLowerCase().includes('failed'))
      line.className = 'err';
    else if (t.startsWith('→') || t.startsWith('Navigating') || t.startsWith('Running'))
      line.className = 'info';
    else if (t.startsWith('⚠') || t.toLowerCase().includes('warn'))
      line.className = 'warn';
    else if (t.startsWith('#') || t.length === 0)
      line.className = 'dim';
    line.textContent = text + '\\n';
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  async function runScraper() {
    const selected = [...document.querySelectorAll('.source-card.selected')]
      .map(c => c.dataset.source);
    if (selected.length === 0) { appendLog('⚠ Kaynak seçilmedi.'); return; }

    const runBtn = document.getElementById('runBtn');
    const pushBtn = document.getElementById('pushBtn');
    const pill = document.getElementById('statusPill');

    runBtn.disabled = true;
    runBtn.textContent = '⏳ Running...';
    pushBtn.classList.remove('active');
    pill.className = 'status-pill running';
    pill.textContent = 'Running';
    document.querySelectorAll('.source-card').forEach(c => c.classList.add('disabled'));

    if (document.getElementById('log').querySelector('.empty'))
      document.getElementById('log').innerHTML = '';

    appendLog('# Sources: ' + selected.join(', '));

    try {
      const res = await fetch('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: selected }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        decoder.decode(value).split('\\n').forEach(l => { if (l) appendLog(l); });
      }

      // Son run zamanlarini guncelle
      fetch('/state').then(r => r.json()).then(state => {
        Object.entries(state).forEach(([source, info]) => {
          updateRunLabel(source, info.lastRun);
        });
      });

      pill.className = 'status-pill done';
      pill.textContent = 'Done';
      pushBtn.classList.add('active');
      appendLog('✓ Scraping complete. Push to GitHub when ready.');
    } catch (err) {
      pill.className = 'status-pill error';
      pill.textContent = 'Error';
      appendLog('✗ ' + err.message);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = '▶ Run Selected';
      document.querySelectorAll('.source-card').forEach(c => c.classList.remove('disabled'));
    }
  }

  async function pushToGitHub() {
    const pushBtn = document.getElementById('pushBtn');
    const pill = document.getElementById('statusPill');

    pushBtn.disabled = true;
    pushBtn.textContent = '⏳ Pushing...';
    pill.className = 'status-pill running';
    pill.textContent = 'Pushing';

    try {
      const res = await fetch('/push', { method: 'POST' });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        decoder.decode(value).split('\\n').forEach(l => { if (l) appendLog(l); });
      }
      pill.className = 'status-pill pushed';
      pill.textContent = 'Pushed';
    } catch (err) {
      pill.className = 'status-pill error';
      pill.textContent = 'Error';
      appendLog('✗ ' + err.message);
    } finally {
      pushBtn.disabled = false;
      pushBtn.classList.remove('active');
      pushBtn.textContent = '↑ Push to GitHub';
    }
  }
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  // Ana sayfa
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  // Son run durumlarini don
  if (req.method === "GET" && req.url === "/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(loadState()));
    return;
  }

  // Scraper calistir
  if (req.method === "POST" && req.url === "/run") {
    if (isRunning) {
      res.writeHead(409); res.end("Already running"); return;
    }

    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      const { sources } = JSON.parse(body);

      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      });

      isRunning = true;
      const commands = sources.map(s => `npx tsx scrape-${s}.ts`).join(" && ");

      res.write(`# Running: ${commands}\n`);

      const child = exec(commands, { cwd: __dirname });
      child.stdout.on("data", d => res.write(d));
      child.stderr.on("data", d => res.write(d));

      child.on("close", code => {
        isRunning = false;
        if (code === 0) {
          // Basarili run zamanini kaydet
          const state = loadState();
          const now = new Date();
          const months = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
                          "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
          const label = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}, ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")} — Yapıldı`;
          sources.forEach(s => { state[s] = { lastRun: label }; });
          saveState(state);
          res.write(`✓ Done.\n`);
        } else {
          res.write(`✗ Exited with code ${code}\n`);
        }
        res.end();
      });
    });
    return;
  }

  // GitHub push
  if (req.method === "POST" && req.url === "/push") {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    });

    const cmd = `git add public/api/ && git diff --staged --quiet || git commit -m "Manual scraper run $(date +%Y-%m-%d)" && git push`;
    res.write("# Pushing to GitHub...\n");

    const child = exec(cmd, { cwd: __dirname });
    child.stdout.on("data", d => res.write(d));
    child.stderr.on("data", d => res.write(d));
    child.on("close", code => {
      if (code === 0) res.write("✓ Pushed successfully.\n");
      else res.write(`✗ Push failed (code ${code})\n`);
      res.end();
    });
    return;
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n✓ Bare Fakta Scraper UI → http://localhost:${PORT}\n`);
});
