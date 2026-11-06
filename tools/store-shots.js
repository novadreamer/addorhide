"use strict";
// Store screenshots (1280x800), small promo tile (440x280) and marquee (1400x560) for AddOrHide.
// Mock content only: invented sites, drawn thumbnails, all network blocked except the mock routes.
const path = require("path"), fs = require("fs"), os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright-core");
const SRC = path.join(__dirname, "..");
const OUT = path.join(SRC, "store", "assets");
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), "aoh-raw-"));
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(RAW, { recursive: true });
const FEED = "lumaclips.tv";
const SITES = ["lumaclips.tv", "reelbay.tv", "streamgrove.tv"];

// ---------- mock thumbnails ----------
const PALETTES = [
  ["#ff9a5a", "#ffd36e", "#3b2f6b", "#5a3f8c"], ["#5ac8ff", "#c7f0ff", "#1f5d73", "#2f7f8f"], ["#ff6f91", "#ffc3a0", "#4b2a5c", "#7a3b69"],
  ["#7bd389", "#e9f7c8", "#245c3a", "#3f8a55"], ["#6c7bff", "#b8c0ff", "#1d2259", "#33408f"], ["#ffb347", "#fff1b8", "#6b3a1f", "#9c5a2c"],
  ["#00c2a8", "#b6fff2", "#0f4a52", "#16707a"], ["#c38bff", "#f1d9ff", "#3a1f5c", "#5e3291"], ["#ff5e62", "#ff9966", "#2c1a3d", "#4d2a5e"],
  ["#4facfe", "#00f2fe", "#13315c", "#1e4f8a"], ["#f7971e", "#ffd200", "#3d2b1f", "#6b4a2b"], ["#43e97b", "#38f9d7", "#0d3b3a", "#15605a"],
  ["#fa709a", "#fee140", "#40203d", "#6e3460"], ["#a18cd1", "#fbc2eb", "#2e2450", "#4a3b7a"], ["#30cfd0", "#330867", "#120a2e", "#2a1660"],
  ["#f6d365", "#fda085", "#5a2e1f", "#8a4a32"]
];
function thumbSvg(i) {
  const [sky1, sky2, hill1, hill2] = PALETTES[i % PALETTES.length];
  const sx = 60 + (i * 47) % 200, sy = 50 + (i * 23) % 40, r = 22 + (i * 7) % 18;
  const kind = i % 4;
  let scene = "";
  if (kind === 0) scene = `<polygon points="0,180 70,95 130,150 200,70 270,140 320,105 320,180" fill="${hill1}"/><polygon points="0,180 0,150 90,120 170,160 250,125 320,150 320,180" fill="${hill2}"/>`;
  else if (kind === 1) scene = `<rect y="125" width="320" height="55" fill="${hill1}"/><path d="M0 125 Q40 115 80 125 T160 125 T240 125 T320 125 V140 H0Z" fill="${hill2}" opacity=".8"/>`;
  else if (kind === 2) scene = `${[20, 70, 120, 170, 220, 270].map((x, k) => `<rect x="${x}" y="${80 + (k * 37) % 50}" width="38" height="${100 - (k * 37) % 50}" fill="${k % 2 ? hill1 : hill2}"/>`).join("")}`;
  else scene = `<ellipse cx="160" cy="190" rx="220" ry="70" fill="${hill1}"/><ellipse cx="60" cy="200" rx="120" ry="60" fill="${hill2}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="${sx}" cy="${sy}" r="${r}" fill="#fff" opacity=".85"/>${scene}</svg>`;
}
const THUMB = i => `https://thumbs.mock.test/${i}.svg`;

// ---------- mock videos ----------
const VIDEOS = [
  ["Sunrise Timelapse Over Alpine Lakes", "lumaclips.tv", 754, 1200000, "video", ["Travel"]],
  ["Homemade Pasta in 15 Minutes", "lumaclips.tv", 912, 386000, "video", ["Food"]],
  ["Learn Watercolor: Painting Soft Clouds", "lumaclips.tv", 1388, 97000, "video", ["Art"]],
  ["City Night Walk in the Rain", "lumaclips.tv", 3605, 2400000, "video", ["Travel"]],
  ["Beginner Guitar: Your First Three Chords", "lumaclips.tv", 1022, 640000, "music", ["Music"]],
  ["One-Minute Desk Stretch", "lumaclips.tv", 58, 51000, "short", []],
  ["Building a Tiny Cabin From Scratch", "lumaclips.tv", 2470, 3100000, "video", ["DIY"]],
  ["Deep Sea Creatures, Explained", "lumaclips.tv", 1564, 870000, "video", ["Science"]],
  ["The Lighthouse Keeper", "reelbay.tv", 6120, 0, "movie", ["Drama"]],
  ["Midnight Express to Nowhere", "reelbay.tv", 5640, 0, "movie", ["Thriller"]],
  ["Starfall Academy, Season 1", "reelbay.tv", 1500, 0, "tv", ["Animation"]],
  ["Paper Planes", "reelbay.tv", 5400, 0, "movie", ["Family"]],
  ["Morning Yoga for Focus", "streamgrove.tv", 1200, 210000, "video", ["Fitness"]],
  ["Retro Synthwave Mix", "streamgrove.tv", 4380, 1500000, "music", ["Music"]],
  ["Street Food Tour: Night Market", "streamgrove.tv", 1810, 760000, "video", ["Food"]],
  ["Weekend Football Highlights", "streamgrove.tv", 640, 1900000, "sport", ["Sport"]]
];
const CHANNELS = { 0: "Wanderframe", 1: "Kitchen Notes", 2: "Brush & Water", 3: "Wanderframe", 4: "Fretboard Basics", 5: "Calm Studio", 6: "Timber Works", 7: "Ocean Atlas", 12: "Calm Studio", 13: "Neon Tape", 14: "Kitchen Notes", 15: "Match Day" };
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const keyOf = (title, site) => `https://${site}/watch/${slug(title)}`;
const now = Date.UTC(2026, 9, 9, 12);
function entry(i, extra = {}) {
  const [title, site, duration, views, type, genres] = VIDEOS[i];
  const e = { title, thumb: THUMB(i), kind: type === "short" ? "short" : "video", site, ts: now - i * 3600e3, duration, type };
  if (views) e.views = views;
  if (genres.length) e.genres = genres;
  if (CHANNELS[i]) e.channel = CHANNELS[i];
  e.published = now - (i * 5 + 2) * 86400e3;
  if (type === "movie" || type === "tv") e.year = 2019 + (i % 6);
  return Object.assign(e, extra);
}

// ---------- mock feed page ----------
const views = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`;
const dur = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const FEED_CARDS = [0, 1, 2, 3, 4, 6, 7, 12, 13, 14, 15, 9].map(i => i);
function feedHtml() {
  const cards = FEED_CARDS.map((i, n) => {
    const [title, , d, v] = VIDEOS[i];
    const channel = ["Wanderframe", "Kitchen Notes", "Brush & Water", "Night Lens", "Fretboard Basics", "Timber Works", "Ocean Atlas", "Calm Studio", "Neon Tape", "Food Lanes", "Matchday", "Late Show"][n];
    return `<div class="card"><a class="thumb" href="/watch/${slug(title)}"><img src="${THUMB(i)}" alt=""><span class="dur">${dur(d)}</span></a>
      <div class="info"><div class="avatar" style="background:hsl(${n * 31},60%,55%)">${channel[0]}</div><div><a class="title" href="/watch/${slug(title)}">${title}</a>
      <div class="meta"><a class="channel" href="/@${slug(channel)}">${channel}</a><br>${views(v || 120000)} views · ${n + 2} days ago</div></div></div></div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>LumaClips</title><style>
  *{box-sizing:border-box} body{margin:0;background:#0f0f14;color:#f1f1f5;font:14px/1.35 "Segoe UI",system-ui,sans-serif}
  header{display:flex;align-items:center;gap:18px;height:60px;padding:0 24px;border-bottom:1px solid #23232d;background:#121219}
  .logo{font-weight:800;font-size:20px;letter-spacing:-.02em}.logo b{color:#ff7a59}
  .search{flex:0 1 520px;margin:0 auto;height:38px;border-radius:999px;background:#1c1c25;border:1px solid #2c2c38;color:#8a8a99;padding:9px 18px}
  .chips{display:flex;gap:10px;padding:14px 24px}.chips span{padding:6px 14px;border-radius:9px;background:#22222c;color:#ddd}.chips span:first-child{background:#f1f1f5;color:#111}
  main{display:grid;grid-template-columns:repeat(4,1fr);gap:26px 18px;padding:6px 24px 30px}
  .card{display:block}.thumb{position:relative;display:block;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#222}
  .thumb img{width:100%;height:100%;object-fit:cover;display:block}.dur{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.8);color:#fff;padding:1px 6px;border-radius:5px;font-size:12px;font-weight:600}
  .info{display:flex;gap:10px;margin-top:10px}.avatar{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff}
  .title{color:#f1f1f5;text-decoration:none;font-weight:600;font-size:15px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .meta{color:#9a9aab;font-size:13px;margin-top:3px}.channel{color:inherit;text-decoration:none}
  </style></head><body><header><div class="logo">Luma<b>Clips</b></div><div class="search">Search</div></header>
  <div class="chips"><span>All</span><span>Travel</span><span>Cooking</span><span>Music</span><span>Science</span><span>DIY</span></div><main>${cards}</main></body></html>`;
}

function watchHtml() {
  const [title, , d, v] = VIDEOS[2];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
  *{box-sizing:border-box} body{margin:0;background:#0f0f14;color:#f1f1f5;font:14px/1.35 "Segoe UI",system-ui,sans-serif}
  header{display:flex;align-items:center;height:56px;padding:0 24px;border-bottom:1px solid #23232d;background:#121219}.logo{font-weight:800;font-size:20px}.logo b{color:#ff7a59}
  main{padding:20px 24px}video{display:block;width:100%;aspect-ratio:16/9;border-radius:14px;background:#000 center/cover no-repeat;object-fit:cover}
  h1{font-size:21px;margin:14px 0 4px}.meta{color:#9a9aab}</style></head><body><header><div class="logo">Luma<b>Clips</b></div></header>
  <main><video id="player" poster="${THUMB(2)}"></video><h1>${title}</h1><div class="meta">Brush &amp; Water · ${views(v)} views</div></main>
  <script>setTimeout(() => document.getElementById("player").dispatchEvent(new Event("loadedmetadata", { bubbles: true })), 900);</script></body></html>`;
}

// ---------- composite frame ----------
const ICON = "data:image/png;base64," + fs.readFileSync(path.join(SRC, "icons/icon128.png")).toString("base64");
const img = f => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
const BG = "linear-gradient(135deg,#4f4fe6 0%,#7a5cf5 55%,#a66cff 100%)";
function frameHtml({ title, sub, shots }) {
  const win = (s) => `<div class="win" style="width:${s.w}px"><div class="bar"><i></i><i></i><i></i>${s.label ? `<span>${s.label}</span>` : ""}</div><img src="${img(s.file)}" style="width:${s.w}px"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;width:1280px;height:800px;overflow:hidden}
  body{background:${BG};font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;color:#fff}
  .head{display:flex;align-items:center;gap:18px;padding:34px 56px 0}
  .head img{width:56px;height:56px;border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,.25)}
  h1{margin:0;font-size:40px;font-weight:700;letter-spacing:-.02em;line-height:1.1}
  p{margin:6px 0 0;font-size:19px;opacity:.9}
  .stage{position:absolute;left:0;right:0;bottom:0;top:150px;display:flex;justify-content:center;align-items:flex-start;gap:28px;padding-top:12px}
  .win{border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 24px 60px rgba(20,10,60,.45),0 4px 14px rgba(0,0,0,.2);flex:none}
  .bar{height:28px;background:#ececf3;display:flex;align-items:center;gap:7px;padding:0 12px;color:#55556a;font-size:12.5px}
  .bar i{width:11px;height:11px;border-radius:50%;background:#d0d0dc}.bar i:nth-child(1){background:#ff6058}.bar i:nth-child(2){background:#ffbd2e}.bar i:nth-child(3){background:#28c940}
  .bar span{margin-left:10px}
  .win img{display:block}
  </style></head><body><div class="head"><img src="${ICON}"><div><h1>${title}</h1><p>${sub}</p></div></div>
  <div class="stage">${shots.map(win).join("")}</div></body></html>`;
}

(async () => {
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), "aoh-ext-"));
  for (const f of fs.readdirSync(SRC).filter(f => /\.(js|css|html|json)$/.test(f) || f === "icons")) fs.cpSync(path.join(SRC, f), path.join(ext, f), { recursive: true });
  // The mock player has no media, so this throwaway copy reports a length for it (page scripts can't reach the content script's world).
  fs.writeFileSync(path.join(ext, "content.js"), `Object.defineProperty(HTMLMediaElement.prototype, "duration", { get() { return 754; } });
` + fs.readFileSync(path.join(ext, "content.js"), "utf8"));
  const m = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
  m.host_permissions.push(`https://${FEED}/*`); fs.writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(m));
  // Teach this throwaway copy the mock site, so its cards offer Hide channel as the real sites do.
  const catalogFile = path.join(ext, "catalog.js");
  fs.writeFileSync(catalogFile, fs.readFileSync(catalogFile, "utf8").replace("const rules = Object.freeze([", `const rules = Object.freeze([
    Object.freeze({ id: "lumaclips", name: "LumaClips", hosts: Object.freeze(["${FEED}"]), subdomains: false, cardSelector: ".card", linkSelector: "a.title", titleCandidates: Object.freeze(["a.title"]), channelLinkSelector: "a.channel", channelNameSelector: "a.channel", watchPath: "^/watch/" }),`));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "p-")), {
    executablePath: process.env.BROWSER_EXE || "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", headless: true, deviceScaleFactor: 2, colorScheme: "dark",
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--disable-features=DisableLoadExtensionCommandLineSwitch"] });
  await ctx.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.protocol === "chrome-extension:" || u.protocol === "data:") return route.continue();
    if (u.hostname === "thumbs.mock.test") return route.fulfill({ contentType: "image/svg+xml", body: thumbSvg(Number(u.pathname.replace(/\D/g, ""))) });
    if (u.hostname === FEED && (u.pathname === "/" || u.pathname === "/index.html")) return route.fulfill({ contentType: "text/html", body: feedHtml() });
    if (u.hostname === FEED && u.pathname.startsWith("/watch/")) return route.fulfill({ contentType: "text/html", body: watchHtml() });
    if (u.hostname === "www.youtube.com" && u.pathname === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Mock</title><body></body>" });
    return route.abort();
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker"); const id = new URL(sw.url()).host;
  const added = {}, hidden = {};
  [0, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 5].forEach(i => { added[keyOf(VIDEOS[i][0], VIDEOS[i][1])] = entry(i); });
  [["Wanderframe", "@wanderframe"], ["Kitchen Notes", "@kitchen-notes"], ["Neon Tape", "@neon-tape"]].forEach(([name, handle], n) => { added[`https://${FEED}/${handle}`] = { title: name, thumb: "", kind: "channel", site: FEED, ts: now - n * 3600e3 }; });
  [1, 10, 14, 13, 8].forEach((i, n) => { hidden[keyOf(VIDEOS[i][0], VIDEOS[i][1])] = { ...entry(i), ts: now - n * 600e3, listed: true }; });
  const progress = (i, part, extra) => { const key = keyOf(VIDEOS[i][0], VIDEOS[i][1]); const duration = VIDEOS[i][2]; return [key, { site: VIDEOS[i][1], title: VIDEOS[i][0], url: key, thumbnail: THUMB(i), duration, position: Math.round(duration * part), played: Math.round(duration * part), buckets: "", ts: now - 864e5, updated: now - i * 18e5, ...extra }]; };
  const FULL = "f".repeat(25);
  const watchProgress = Object.fromEntries([progress(0, .97, { watched: true, buckets: FULL }), progress(6, .96, { watched: true, buckets: FULL }), progress(13, .98, { watched: true, buckets: FULL }),
    progress(3, .62, { cw: "auto" }), progress(7, .24, { cw: "auto" }), progress(9, .41, { cw: "auto" }), progress(10, .78, { cw: "auto" })]);
  const watchLater = Object.fromEntries([2, 11, 4, 15].map((i, n) => { const key = keyOf(VIDEOS[i][0], VIDEOS[i][1]); return [key, { title: VIDEOS[i][0], thumb: THUMB(i), site: VIDEOS[i][1], url: key, duration: VIDEOS[i][2], ts: now - n * 36e5 }]; }));
  // The feed shows card 1 (pasta) unhidden for the first shot; hidden list is set after that shot.
  await sw.evaluate(async ({ feed, added, watchProgress, watchLater }) => {
    await chrome.storage.local.set({ siteRules: { [feed]: { enabled: true, scheme: "https", } }, addedItems: added, hiddenItems: {}, watchProgress, watchLater, buttonEdge: "top", buttonsEnabled: true });
    await new Promise(res => HOA_SITES.reconcile(res));
  }, { feed: FEED, added, watchProgress, watchLater });
  await new Promise(r => setTimeout(r, 800));

  // 1. Feed with the buttons on a hovered card.
  const feed = await ctx.newPage(); await feed.setViewportSize({ width: 1280, height: 720 });
  await feed.goto(`https://${FEED}/`); await feed.waitForTimeout(2500);
  console.log("feed hosts", await feed.locator(".hoa-host").count());
  const card = feed.locator(".card").nth(1); const b = await card.boundingBox();
  await feed.mouse.move(b.x + b.width / 2, b.y + b.height / 3, { steps: 4 }); await feed.waitForTimeout(500);
  const addBtn = card.locator('.hoa-actions button[data-action="add"]');
  const ab = await addBtn.boundingBox(); await feed.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2, { steps: 3 }); await feed.waitForTimeout(600);
  const channelBtn = card.locator('.hoa-actions button[data-action="channel"]');
  if (await channelBtn.count()) { const cb = await channelBtn.boundingBox(); await feed.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 3 }); await feed.waitForTimeout(600); }
  await feed.screenshot({ path: path.join(RAW, "feed.png") });
  // second card (already Added) hovered, for the Added state
  const c0 = feed.locator(".card").nth(0); const b0 = await c0.boundingBox();
  await feed.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2, { steps: 4 }); await feed.waitForTimeout(600);
  await feed.screenshot({ path: path.join(RAW, "feed-added.png"), clip: { x: 0, y: 60, width: 560, height: 340 } });

  // Popup, as if opened on the feed tab.
  const feedTabId = await sw.evaluate(async feed => (await chrome.tabs.query({ url: `https://${feed}/*` }))[0].id, FEED);
  const popup = await ctx.newPage(); await popup.setViewportSize({ width: 400, height: 560 });
  await popup.addInitScript(tabId => {
    const q = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = (info, cb) => q({}, tabs => cb(tabs.filter(t => t.id === tabId)));
  }, feedTabId);
  await sw.evaluate(h => chrome.storage.local.set({ hiddenItems: h }), hidden);
  await popup.goto(`chrome-extension://${id}/popup.html`); await popup.waitForTimeout(1500);
  await popup.setViewportSize({ width: 400, height: 1000 });
  await popup.addStyleTag({ content: "html,body,main{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important}" });
  await popup.waitForTimeout(300);
  const ph = await popup.evaluate(() => Math.ceil(document.documentElement.getBoundingClientRect().height));
  await popup.setViewportSize({ width: 400, height: ph }); await popup.waitForTimeout(300);
  global.POPUP_H = ph; console.log("popup height", ph);
  await popup.screenshot({ path: path.join(RAW, "popup.png") });

  // The popup's Hide on this site window, opened on a built-in site for its full list of types.
  const ytTab = await ctx.newPage(); await ytTab.goto("https://www.youtube.com/"); await ytTab.waitForTimeout(800);
  const ytId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://www.youtube.com/*" }))[0].id);
  const filters = await ctx.newPage(); await filters.setViewportSize({ width: 400, height: 600 });
  await filters.addInitScript(tabId => {
    const q = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = (info, cb) => q({}, tabs => cb(tabs.filter(t => t.id === tabId)));
  }, ytId);
  await filters.goto(`chrome-extension://${id}/popup.html`); await filters.waitForTimeout(1200);
  await filters.getByText("Hide on this site").first().click(); await filters.waitForTimeout(500);
  const toggles = filters.locator('.filter-popover [role="switch"], .filter-popover input[type="checkbox"]');
  for (const n of [0, 2, 3]) if (await toggles.nth(n).count()) await toggles.nth(n).click({ force: true }).catch(() => {});
  await filters.mouse.move(4, 4); await filters.waitForTimeout(4500);
  await filters.screenshot({ path: path.join(RAW, "filters.png") });
  await sw.evaluate(() => chrome.storage.local.remove("siteHideKinds")).catch(() => {});

  // The video's own page, with Add to Watch Later showing on the hovered player.
  const watch = await ctx.newPage(); await watch.setViewportSize({ width: 640, height: 500 });
  await watch.goto(keyOf(VIDEOS[0][0], VIDEOS[0][1])); await watch.waitForTimeout(1800);
  await watch.mouse.move(200, 160, { steps: 3 }); await watch.mouse.move(320, 220, { steps: 3 }); await watch.waitForTimeout(500);
  console.log("watch later button", await watch.locator("#hoa-watch-later").count(), await watch.locator("#hoa-watch-later").isVisible().catch(() => false));
  await watch.screenshot({ path: path.join(RAW, "watch-page.png") });

  // Added page, stacked: Continue Watching with Watch Later right under it.
  const stacked = await ctx.newPage(); await stacked.setViewportSize({ width: 1200, height: 1040 });
  await sw.evaluate(() => chrome.storage.local.set({ addedViewPrefs: {} }));
  await stacked.goto(`chrome-extension://${id}/added.html`); await stacked.waitForTimeout(1500);
  await stacked.screenshot({ path: path.join(RAW, "added-continue.png") });

  // Added page: tabs, then one website organised by type.
  const page = await ctx.newPage(); await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`chrome-extension://${id}/added.html`); await page.waitForTimeout(800);
  await sw.evaluate(feed => chrome.storage.local.set({ addedViewPrefs: { __page: { grouping: "tabs", selectedTab: feed }, [feed]: { sort: "views", dir: "desc", group: "type" } } }), FEED);
  await page.reload(); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(RAW, "added-tabs.png") });

  // Hidden Videos page: channels, watched videos and websites.
  const channels = { [`${FEED}|/@neon-tape`]: { key: `${FEED}|/@neon-tape`, name: "Neon Tape", site: FEED, url: `https://${FEED}/@neon-tape`, ts: now }, [`${FEED}|/@match-day`]: { key: `${FEED}|/@match-day`, name: "Match Day", site: FEED, url: `https://${FEED}/@match-day`, ts: now - 6e5 } };
  await sw.evaluate(channels => chrome.storage.local.set({ hiddenChannels: channels, hiddenViewPrefs: { channels: { collapsed: false } } }), channels);
  const hw = await ctx.newPage(); await hw.setViewportSize({ width: 1180, height: 720 });
  await hw.goto(`chrome-extension://${id}/hidden.html`); await hw.waitForTimeout(1500);
  await hw.screenshot({ path: path.join(RAW, "hidden.png") });

  // Composites.
  const comp = await ctx.newPage(); await comp.setViewportSize({ width: 1280, height: 800 });
  const shoot = async (name, spec) => { await comp.setContent(frameHtml(spec)); await comp.waitForTimeout(300); await comp.screenshot({ path: path.join(OUT, name), scale: "css" }); };
  const pw = Math.round(400 * 575 / global.POPUP_H);
  await shoot("screenshot-1-add-or-hide.png", { title: "Add what you like. Hide what you don't.", sub: "Add, Hide or Hide channel on every thumbnail, with Watched tags on what you've already seen.", shots: [{ file: path.join(RAW, "feed.png"), w: 1100 - pw, label: "lumaclips.tv" }, { file: path.join(RAW, "popup.png"), w: pw, label: "AddOrHide" }] });
  await shoot("screenshot-2-continue-watching.png", { title: "Save it for later. Pick up where you left off.", sub: "Add to Watch Later from any video's page. Once you start it, it moves to Continue Watching.", shots: [{ file: path.join(RAW, "watch-page.png"), w: 500, label: "lumaclips.tv" }, { file: path.join(RAW, "added-continue.png"), w: 640, label: "Added Videos" }] });
  await shoot("screenshot-3-hide-by-type.png", { title: "Hide whole categories in one click", sub: "Watched, Shorts, Playlists, Live and more, plus your own keywords, for each site.", shots: [{ file: path.join(RAW, "feed.png"), w: 760, label: "lumaclips.tv" }, { file: path.join(RAW, "filters.png"), w: 372, label: "Hide on this site" }] });
  await shoot("screenshot-4-tabs-sort-group.png", { title: "Your videos, organised your way", sub: "A tab for each website. Sort and group by channel, date, type, decade or rating.", shots: [{ file: path.join(RAW, "added-tabs.png"), w: 1100, label: "Added Videos" }] });
  await shoot("screenshot-5-hidden.png", { title: "Changed your mind? Bring it back", sub: "Hidden videos, hidden channels and watched videos, sorted your way and one click from returning.", shots: [{ file: path.join(RAW, "hidden.png"), w: 1100, label: "Hidden Videos" }] });

  // Promo tile and marquee.
  const promo = (w, h, big) => `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
    body{background:${BG};font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;color:#fff;display:flex;align-items:center;${big ? "padding:0 70px;gap:60px" : "justify-content:center"}}
    .brand{display:flex;flex-direction:column;align-items:${big ? "flex-start" : "center"};text-align:${big ? "left" : "center"}}
    .brand img{width:${big ? 120 : 84}px;height:${big ? 120 : 84}px;border-radius:${big ? 28 : 20}px;box-shadow:0 10px 26px rgba(20,10,60,.35)}
    h1{margin:${big ? 22 : 14}px 0 4px;font-size:${big ? 64 : 40}px;font-weight:800;letter-spacing:-.03em;line-height:1}
    p{margin:0;font-size:${big ? 26 : 18}px;opacity:.95}
    .pills{display:flex;gap:10px;margin-top:${big ? 26 : 16}px}
    .pills span{padding:${big ? "9px 22px" : "6px 16px"};border-radius:999px;font-weight:700;font-size:${big ? 20 : 14}px;box-shadow:0 0 0 2px #fff,0 6px 14px rgba(0,0,0,.25)}
    .add{background:#1f9d55}.hide{background:#d93a49}.seen{background:#17171f}
    .shot{flex:1;border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(20,10,60,.45)}.shot img{display:block;width:100%}
    </style></head><body><div class="brand"><img src="${ICON}"><h1>AddOrHide</h1><p>Add it. Or hide it.</p><div class="pills"><span class="add">Add</span><span class="hide">Hide</span><span class="seen">✓ Watched</span></div></div>
    ${big ? `<div class="shot"><img src="${img(path.join(RAW, "feed-added.png"))}"></div>` : ""}</body></html>`;
  await comp.setViewportSize({ width: 440, height: 280 }); await comp.setContent(promo(440, 280, false)); await comp.waitForTimeout(200);
  await comp.screenshot({ path: path.join(OUT, "promo-small-440x280.png"), scale: "css" });
  await comp.setViewportSize({ width: 1400, height: 560 }); await comp.setContent(promo(1400, 560, true)); await comp.waitForTimeout(200);
  await comp.screenshot({ path: path.join(OUT, "promo-marquee-1400x560.png"), scale: "css" });
  await ctx.close();
  console.log("done", fs.readdirSync(OUT));
})().catch(e => { console.error(e); process.exit(1); });
