"use strict";
// Shared mock world for the store screenshots and the promo video: invented sites and videos, original generated
// pictures (store/thumbs/NN.png, else drawn ones), and a throwaway copy of the extension that knows the mock site.
const path = require("path"), fs = require("fs"), os = require("os");
const SRC = path.join(__dirname, "..");
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

const WATCH_PAGE = 5;   // a video that is in no list yet, so the player offers Add to Watch Later
function watchHtml() {
  const [title, , d, v] = VIDEOS[WATCH_PAGE];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta property="og:url" content="${keyOf(title, VIDEOS[WATCH_PAGE][1])}"><meta property="og:title" content="${title}"><meta property="og:image" content="${THUMB(WATCH_PAGE)}"><style>
  *{box-sizing:border-box} body{margin:0;background:#0f0f14;color:#f1f1f5;font:14px/1.35 "Segoe UI",system-ui,sans-serif}
  header{display:flex;align-items:center;height:56px;padding:0 24px;border-bottom:1px solid #23232d;background:#121219}.logo{font-weight:800;font-size:20px}.logo b{color:#ff7a59}
  main{padding:20px 24px}video{display:block;width:100%;aspect-ratio:16/9;border-radius:14px;background:#000 center/cover no-repeat;object-fit:cover}
  h1{font-size:21px;margin:14px 0 4px}.meta{color:#9a9aab}</style></head><body><header><div class="logo">Luma<b>Clips</b></div></header>
  <main><video id="player" poster="${THUMB(WATCH_PAGE)}"></video><h1>${title}</h1><div class="meta">Calm Studio · ${views(v)} views</div></main>
  <script>setTimeout(() => document.getElementById("player").dispatchEvent(new Event("loadedmetadata", { bubbles: true })), 900);</script></body></html>`;
}

const ICON = "data:image/png;base64," + fs.readFileSync(path.join(SRC, "icons/icon128.png")).toString("base64");
const BG = "linear-gradient(135deg,#4f4fe6 0%,#7a5cf5 55%,#a66cff 100%)";

// Launch Brave with a throwaway copy of the extension, route every request to the mock world and seed the lists.
// options: { chromium, headless, deviceScaleFactor, categories (extra Hide-by-type categories for the mock site),
// routes (extra (url, route) => handled? hooks) }. Returns { ctx, sw, id, data }.
async function launchMock({ chromium, headless = true, deviceScaleFactor = 2, categories = null, routes = [] } = {}) {
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
    Object.freeze({ id: "lumaclips", name: "LumaClips", hosts: Object.freeze(["${FEED}"]), subdomains: false, cardSelector: ".card", linkSelector: "a.title", titleCandidates: Object.freeze(["a.title"]), channelLinkSelector: "a.channel", channelNameSelector: "a.channel", watchPath: "^/watch/"${categories ? `, categories: Object.freeze(${JSON.stringify(categories)})` : ""} }),`));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "p-")), {
    executablePath: process.env.BROWSER_EXE || "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", headless, deviceScaleFactor, colorScheme: "dark",
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--disable-features=DisableLoadExtensionCommandLineSwitch"] });
  await ctx.route("**/*", route => {
    const u = new URL(route.request().url());
    for (const hook of routes) if (hook(u, route)) return;
    if (u.protocol === "chrome-extension:" || u.protocol === "data:") return route.continue();
    if (u.hostname === "thumbs.mock.test") {
      const n = Number(u.pathname.replace(/\D/g, "")); const photo = path.join(SRC, "store", "thumbs", `${String(n).padStart(2, "0")}.png`);
      return fs.existsSync(photo) ? route.fulfill({ contentType: "image/png", body: fs.readFileSync(photo) }) : route.fulfill({ contentType: "image/svg+xml", body: thumbSvg(n) });
    }
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
  return { ctx, sw, id, data: { added, hidden, watchProgress, watchLater } };
}

module.exports = { SRC, FEED, SITES, VIDEOS, CHANNELS, THUMB, thumbSvg, slug, keyOf, now, entry, views, dur, FEED_CARDS, feedHtml, WATCH_PAGE, watchHtml, ICON, BG, launchMock };
