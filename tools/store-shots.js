"use strict";
// Store screenshots (1280x800), small promo tile (440x280) and marquee (1400x560) for AddOrHide.
// Mock content only: invented sites and videos, all network blocked except the mock routes. Thumbnails are the
// original generated pictures in store/thumbs/NN.png (no real people, logos or text), else drawn ones.
const path = require("path"), fs = require("fs"), os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright-core");
const SRC = path.join(__dirname, "..");
const OUT = path.join(SRC, "store", "assets");
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), "aoh-raw-"));
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(RAW, { recursive: true });
const { FEED, SITES, VIDEOS, CHANNELS, THUMB, thumbSvg, slug, keyOf, now, entry, views, dur, FEED_CARDS, feedHtml, WATCH_PAGE, watchHtml, ICON, BG, launchMock } = require("./store-mock");

// ---------- composite frame ----------
const img = f => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
function frameHtml({ title, sub, shots }) {
  // A split window shows the same page twice: s.file (dark) on the left, s.light on the right, divided on a slant.
  const body = s => s.light
    ? `<div class="split"><img src="${img(s.light)}" style="width:${s.w}px"><img class="dark-half" src="${img(s.file)}" style="width:${s.w}px"><div class="divider"></div><b class="tag tag-dark">Dark</b><b class="tag tag-light">Light</b></div>`
    : `<img src="${img(s.file)}" style="width:${s.w}px">`;
  const win = (s) => `<div class="win" style="width:${s.w}px"><div class="bar"><i></i><i></i><i></i>${s.label ? `<span>${s.label}</span>` : ""}</div>${body(s)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;width:1280px;height:800px;overflow:hidden}
  body{background:${BG};font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;color:#fff}
  .head{display:flex;align-items:center;gap:18px;padding:34px 56px 0}
  .head img{width:56px;height:56px;border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,.25)}
  h1{margin:0;font-size:40px;font-weight:700;letter-spacing:-.02em;line-height:1.1}
  p{margin:6px 0 0;font-size:19px;opacity:.9}
  .stage{position:absolute;left:0;right:0;bottom:0;top:150px;display:flex;justify-content:center;align-items:flex-start;gap:28px;padding-top:12px}
  .win{border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 24px 60px rgba(20,10,60,.45),0 4px 14px rgba(0,0,0,.2);flex:none}
  .split{position:relative}.split img{display:block}
  .split .dark-half{position:absolute;inset:0;clip-path:polygon(0 0,54% 0,46% 100%,0 100%)}
  .split .divider{position:absolute;inset:0;background:linear-gradient(to bottom right,transparent calc(50% - 2px),#fff calc(50% - 2px),#fff calc(50% + 2px),transparent calc(50% + 2px));clip-path:polygon(53.6% 0,54.4% 0,46.4% 100%,45.6% 100%);background:#fff;box-shadow:0 0 12px rgba(0,0,0,.4)}
  .split .tag{position:absolute;bottom:18px;padding:6px 16px;border-radius:999px;font-size:15px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.3)}
  .split .tag-dark{left:20px;background:#17171f;color:#fff}.split .tag-light{right:20px;background:#fff;color:#17171f}
  .bar{height:28px;background:#ececf3;display:flex;align-items:center;gap:7px;padding:0 12px;color:#55556a;font-size:12.5px}
  .bar i{width:11px;height:11px;border-radius:50%;background:#d0d0dc}.bar i:nth-child(1){background:#ff6058}.bar i:nth-child(2){background:#ffbd2e}.bar i:nth-child(3){background:#28c940}
  .bar span{margin-left:10px}
  .win img{display:block}
  </style></head><body><div class="head"><img src="${ICON}"><div><h1>${title}</h1><p>${sub}</p></div></div>
  <div class="stage">${shots.map(win).join("")}</div></body></html>`;
}

(async () => {
  const { ctx, sw, id, data: { added, hidden, watchProgress, watchLater } } = await launchMock({ chromium });

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
  for (const name of ["Watched", "Shorts", "Labelled as AI"]) {
    const row = filters.locator(".filter-popover .switch-row").filter({ hasText: new RegExp("^\\s*" + name + "\\s*$") }).first();
    if (await row.count()) await row.locator('[role="switch"], input[type="checkbox"]').first().click({ force: true }).catch(() => {});
  }
  await filters.mouse.move(4, 4); await filters.waitForTimeout(4500);
  await filters.screenshot({ path: path.join(RAW, "filters.png") });
  await sw.evaluate(() => chrome.storage.local.remove("siteHideKinds")).catch(() => {});

  // The video's own page, with Add to Watch Later showing on the hovered player.
  const watch = await ctx.newPage(); await watch.setViewportSize({ width: 640, height: 500 });
  await watch.goto(keyOf(VIDEOS[WATCH_PAGE][0], VIDEOS[WATCH_PAGE][1])); await watch.waitForTimeout(1800);
  await watch.mouse.move(200, 160, { steps: 3 }); await watch.mouse.move(320, 220, { steps: 3 }); await watch.waitForTimeout(500);
  console.log("watch later button", await watch.locator("#hoa-watch-later").count(), await watch.locator("#hoa-watch-later").isVisible().catch(() => false));
  await watch.screenshot({ path: path.join(RAW, "watch-page.png") });

  // Added page, stacked: Continue Watching with Watch Later right under it.
  const stacked = await ctx.newPage(); await stacked.setViewportSize({ width: 1200, height: 1040 });
  await sw.evaluate(() => chrome.storage.local.set({ addedViewPrefs: {} }));
  await stacked.goto(`chrome-extension://${id}/added.html`); await stacked.waitForTimeout(1500);
  await stacked.screenshot({ path: path.join(RAW, "added-continue.png") });

  // Added page: tabs, then one website organised by type, in the LIGHT theme (the only light shot, to show both).
  const page = await ctx.newPage(); await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`chrome-extension://${id}/added.html`); await page.waitForTimeout(800);
  await sw.evaluate(feed => chrome.storage.local.set({ theme: "dark", addedViewPrefs: { __page: { grouping: "tabs", selectedTab: feed }, [feed]: { sort: "views", dir: "desc", group: "type" } } }), FEED);
  await page.reload(); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(RAW, "added-tabs.png") });
  await sw.evaluate(() => chrome.storage.local.set({ theme: "light" }));
  await page.reload(); await page.waitForTimeout(1500);
  console.log("library theme", await page.evaluate(() => document.documentElement.dataset.theme || "(system)"));
  await page.screenshot({ path: path.join(RAW, "added-tabs-light.png") });
  await sw.evaluate(() => chrome.storage.local.remove("theme")); await page.close();

  // Hidden Videos page: channels, watched videos and websites.
  const channels = { [`${FEED}|/@neon-tape`]: { key: `${FEED}|/@neon-tape`, name: "Neon Tape", site: FEED, url: `https://${FEED}/@neon-tape`, ts: now }, [`${FEED}|/@match-day`]: { key: `${FEED}|/@match-day`, name: "Match Day", site: FEED, url: `https://${FEED}/@match-day`, ts: now - 6e5 } };
  await sw.evaluate(channels => chrome.storage.local.set({ hiddenChannels: channels, hiddenViewPrefs: { channels: { collapsed: false } } }), channels);
  const hw = await ctx.newPage(); await hw.setViewportSize({ width: 900, height: 780 });
  await hw.goto(`chrome-extension://${id}/hidden.html`); await hw.waitForTimeout(1500);
  await hw.screenshot({ path: path.join(RAW, "hidden.png") });

  // Options: the Page lock panel with the Added Videos page locked.
  const opts = await ctx.newPage(); await opts.setViewportSize({ width: 760, height: 900 });
  await opts.goto(`chrome-extension://${id}/options.html`); await opts.waitForTimeout(800);
  await opts.evaluate(async () => { const lock = await HOA_LOCK.hashPassword("screenshot-only"); await chrome.storage.local.set({ pageLock: { ...lock, added: true, hidden: false } }); });
  await opts.reload(); await opts.waitForTimeout(1200);
  await opts.locator("#page-lock-panel").screenshot({ path: path.join(RAW, "lock-panel.png") });
  const locked = await ctx.newPage(); await locked.setViewportSize({ width: 560, height: 470 });
  await locked.goto(`chrome-extension://${id}/added.html`); await locked.waitForTimeout(1200);
  await locked.screenshot({ path: path.join(RAW, "locked-added.png") });
  await sw.evaluate(() => chrome.storage.local.remove("pageLock"));

  // Composites.
  const comp = await ctx.newPage(); await comp.setViewportSize({ width: 1280, height: 800 });
  const shoot = async (name, spec) => { await comp.setContent(frameHtml(spec)); await comp.waitForTimeout(300); await comp.screenshot({ path: path.join(OUT, name), scale: "css" }); };
  const pw = Math.round(400 * 575 / global.POPUP_H);
  await shoot("screenshot-1-add-or-hide.png", { title: "Add it or hide it, right on the thumbnail", sub: "Add, Hide and Hide channel on every video, with a Watched tag on what you've already seen.", shots: [{ file: path.join(RAW, "feed.png"), w: 1100 - pw, label: "lumaclips.tv" }, { file: path.join(RAW, "popup.png"), w: pw, label: "AddOrHide" }] });
  await shoot("screenshot-2-continue-watching.png", { title: "Pick up where you left off", sub: "Save videos to Watch Later from their page. Ones you start wait in Continue Watching with the time left.", shots: [{ file: path.join(RAW, "watch-page.png"), w: 500, label: "lumaclips.tv" }, { file: path.join(RAW, "added-continue.png"), w: 640, label: "Added Videos" }] });
  await shoot("screenshot-3-hide-by-type.png", { title: "Hide what you don't want to see", sub: "Switch off Shorts, Live, playlists, AI-made videos or ones you've watched, or add your own keywords.", shots: [{ file: path.join(RAW, "feed.png"), w: 760, label: "lumaclips.tv" }, { file: path.join(RAW, "filters.png"), w: 372, label: "Hide on this site" }] });
  await shoot("screenshot-4-tabs-sort-group.png", { title: "Your own video library", sub: "A tab for each site, sorted and grouped your way, with your own tags. Dark or light, your choice.", shots: [{ file: path.join(RAW, "added-tabs.png"), light: path.join(RAW, "added-tabs-light.png"), w: 1100, label: "Added Videos" }] });
  await shoot("screenshot-5-hidden.png", { title: "Hidden, never lost, and private if you like", sub: "Bring back any hidden video or channel, and lock either page with a password.", shots: [{ file: path.join(RAW, "hidden.png"), w: 720, label: "Hidden Videos" }, { file: path.join(RAW, "locked-added.png"), w: 420, label: "Added Videos, locked" }] });

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
    </style></head><body><div class="brand"><img src="${ICON}"><h1>AddOrHide</h1><p>Your videos, your way</p><div class="pills"><span class="add">Add</span><span class="hide">Hide</span><span class="seen">✓ Watched</span><span class="seen">▶ Resume</span></div></div>
    ${big ? `<div class="shot"><img src="${img(path.join(RAW, "feed-added.png"))}"></div>` : ""}</body></html>`;
  await comp.setViewportSize({ width: 440, height: 280 }); await comp.setContent(promo(440, 280, false)); await comp.waitForTimeout(200);
  await comp.screenshot({ path: path.join(OUT, "promo-small-440x280.png"), scale: "css" });
  await comp.setViewportSize({ width: 1400, height: 560 }); await comp.setContent(promo(1400, 560, true)); await comp.waitForTimeout(200);
  await comp.screenshot({ path: path.join(OUT, "promo-marquee-1400x560.png"), scale: "css" });
  await ctx.close();
  console.log("done", fs.readdirSync(OUT));
})().catch(e => { console.error(e); process.exit(1); });
