"use strict";
// Promo video for the store listing (1920x1080, 30 fps, H.264 + AAC): the real extension recorded on the mock sites
// of tools/store-mock.js, framed like the screenshots, with a voice-over (edge-tts, Andrew) and no music.
// Needs: PLAYWRIGHT_PATH (playwright-core), FFMPEG (an ffmpeg with libx264 and aac), Python with edge-tts and numpy.
// Output: store/video/addorhide-promo.mp4
const path = require("path"), fs = require("fs"), os = require("os");
const { execFileSync } = require("child_process");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright-core");
const M = require("./store-mock");

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const OUT_DIR = path.join(M.SRC, "store", "video");
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "aoh-video-"));
const W = 1920, H = 1080, FPS = 30, FADE = 0.5, BAR = 40;
const VOICE = "en-US-AndrewMultilingualNeural";
const wait = ms => new Promise(r => setTimeout(r, ms));
const ff = args => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
function durationOf(file) {
  // ffmpeg prints "Duration: 00:00:03.42" on stderr for -i with no output.
  let text = "";
  try { execFileSync(FFMPEG, ["-hide_banner", "-i", file], { stdio: ["ignore", "pipe", "pipe"] }); } catch (error) { text = String(error.stderr || ""); }
  const m = text.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

// ---------- voice-over ----------
const SCENES = [
  // Lines are written to be read in one breath each; scenes last as long as their line or their on-screen actions.
  { id: "intro", min: 3.4, say: "Meet AddOrHide: your videos, your way." },
  { id: "feed", min: 7, say: "Hover over any video to add it to your list or hide it, and see at a glance what you've already watched." },
  { id: "types", min: 6.5, say: "Turn off whole categories, like Shorts or videos you've watched, and they vanish from your feed." },
  { id: "later", min: 6, say: "Save videos for later, then pick up right where you left off." },
  { id: "library", min: 8.8, sync: true, say: "Everything you keep lives in your own library, sorted and grouped the way you like, in light or dark." },
  { id: "hidden", min: 7, say: "Changed your mind? Bring anything back, and lock your lists with a password." },
  { id: "outro", min: 4.4, say: "AddOrHide. Free, private, and right in your browser." }
];
const VOICE_AT = 0.3;    // seconds into each scene the line starts
for (const scene of SCENES) {
  scene.voice = path.join(WORK, `${scene.id}.mp3`);
  // The speech service now and then answers with no audio: try again a few times before giving up.
  // tools/store-tts.py writes the audio and reports when each word is spoken (seconds into the clip).
  for (let attempt = 1; ; attempt += 1) {
    try {
      scene.words = JSON.parse(execFileSync(process.env.PYTHON || "python", [path.join(__dirname, "store-tts.py"), scene.say, scene.voice], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
      if (fs.statSync(scene.voice).size > 1000 && scene.words.length) break;
    } catch (error) { /* retry */ }
    if (attempt >= 4) throw new Error(`edge-tts gave no audio for "${scene.say}"`);
    execFileSync(process.execPath, ["-e", "setTimeout(() => {}, 2000)"]);
  }
  const tight = path.join(WORK, `${scene.id}.wav`);
  const tail = "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse";
  if (scene.sync) {
    // A line the picture follows word by word: trim the lead-in by an exact amount and leave its pauses alone, so
    // the reported word times stay true (its commas are short breaths anyway).
    const lead = Math.max(0, scene.words[0].start - 0.05);
    ff(["-i", scene.voice, "-af", `atrim=start=${lead.toFixed(4)},asetpts=N/SR/TB,${tail}`, "-ar", "48000", tight]);
    scene.words = scene.words.map(w => ({ ...w, start: w.start - lead, end: w.end - lead }));
  } else {
    // edge-tts leaves long gaps after colons and full stops and silence at the end: keep comma-length breaths, cap
    // longer pauses at a natural beat, and trim the lead-in and tail so lines run on without dead air.
    ff(["-i", scene.voice, "-af", `silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,silenceremove=stop_periods=-1:stop_duration=0.3:stop_threshold=-45dB:stop_silence=0.2,${tail}`, "-ar", "48000", tight]);
  }
  scene.voice = tight;
  scene.voiceLength = durationOf(scene.voice);
  scene.length = Math.max(scene.min, VOICE_AT + scene.voiceLength + 0.6);
  console.log(`${scene.id}: voice ${scene.voiceLength.toFixed(2)} s, scene ${scene.length.toFixed(2)} s`);
}
const byId = id => SCENES.find(s => s.id === id);

// ---------- pointer, recorder ----------
// Headless screencasts have no mouse pointer, so pages draw one that follows the real (synthetic) mouse.
const CURSOR = `(() => { if (window.top !== window) return; const add = () => { if (document.getElementById("__aoh_cursor")) return;
  const c = document.createElement("div"); c.id = "__aoh_cursor";
  c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 2.5l14 8.2-6.3 1.6-3.1 6.4z" fill="#fff" stroke="#15151c" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: "fixed", left: "-60px", top: "-60px", zIndex: 2147483647, pointerEvents: "none", transition: "transform .09s", transformOrigin: "4px 2px", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45))" });
  document.documentElement.appendChild(c);
  addEventListener("mousemove", e => { const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1; c.style.zoom = String(1 / z); c.style.left = (e.clientX - 4) + "px"; c.style.top = (e.clientY - 2) + "px"; }, true);
  addEventListener("mousedown", () => { c.style.transform = "scale(.82)"; }, true); addEventListener("mouseup", () => { c.style.transform = ""; }, true); };
  if (document.documentElement) add(); else addEventListener("DOMContentLoaded", add); })();`;

async function glide(page, x, y, ms = 650) {
  const from = page.__pos || { x: x - 160, y: y + 120 };
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await wait(ms / steps);
  }
  page.__pos = { x, y };
}
async function centre(locator) { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
async function glideTo(page, locator, ms) { const c = await centre(locator); await glide(page, c.x, c.y, ms); }
async function click(page, locator, ms = 600) { await glideTo(page, locator, ms); await wait(120); await page.mouse.down(); await wait(90); await page.mouse.up(); }

// Record a page with the DevTools screencast (sharp JPEG frames), then turn the frames into a constant-rate clip.
async function startRecording(page, name, size) {
  const cdp = await page.context().newCDPSession(page);
  const dir = path.join(WORK, name); fs.mkdirSync(dir);
  const frames = [];
  cdp.on("Page.screencastFrame", frame => {
    const file = path.join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(frame.data, "base64"));
    frames.push({ file, t: frame.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1, maxWidth: size.w, maxHeight: size.h });
  const t0 = Date.now() / 1000;
  // Nudge one repaint so the first frame arrives at once even on a still page.
  await page.evaluate(() => { document.documentElement.style.outline = "0 solid transparent"; requestAnimationFrame(() => { document.documentElement.style.outline = ""; }); }).catch(() => {});
  return {
    async stop(length) {
      await cdp.send("Page.stopScreencast").catch(() => {}); await wait(150);
      if (!frames.length) throw new Error(`no frames for ${name}`);
      const lines = [];
      frames.forEach((f, i) => {
        const start = i === 0 ? t0 : f.t; const end = i + 1 < frames.length ? frames[i + 1].t : t0 + length;
        lines.push(`file '${f.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, end - start).toFixed(4)}`);
      });
      lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, "/")}'`);
      const list = path.join(WORK, `${name}.txt`); fs.writeFileSync(list, lines.join("\n"));
      const clip = path.join(WORK, `${name}.mp4`);
      ff(["-f", "concat", "-safe", "0", "-i", list, "-vf", `fps=${FPS},scale=${size.w}:${size.h}:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p`, "-t", length.toFixed(3), "-c:v", "libx264", "-crf", "14", "-preset", "medium", clip]);
      return clip;
    }
  };
}

// ---------- framing ----------
const frameHtml = ({ title, sub, windows }) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
  body{background:${M.BG};font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;color:#fff}
  .head{position:absolute;left:84px;top:52px;display:flex;align-items:center;gap:26px}
  .head img{width:84px;height:84px;border-radius:20px;box-shadow:0 8px 22px rgba(0,0,0,.25)}
  h1{margin:0;font-size:58px;font-weight:700;letter-spacing:-.02em;line-height:1.05} p{margin:8px 0 0;font-size:27px;opacity:.92}
  .win{position:absolute;border-radius:14px 14px 0 0;overflow:hidden;background:#15151c;box-shadow:0 30px 70px rgba(20,10,60,.45),0 4px 14px rgba(0,0,0,.2)}
  .bar{height:${BAR}px;background:#ececf3;display:flex;align-items:center;gap:9px;padding:0 16px;color:#55556a;font-size:17px}
  .bar i{width:14px;height:14px;border-radius:50%}.bar i:nth-child(1){background:#ff6058}.bar i:nth-child(2){background:#ffbd2e}.bar i:nth-child(3){background:#28c940}
  .bar span{margin-left:12px}
  </style></head><body><div class="head"><img src="${M.ICON}"><div><h1>${title}</h1><p>${sub}</p></div></div>
  ${windows.map(w => `<div class="win" style="left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px"><div class="bar"><i></i><i></i><i></i><span>${w.label}</span></div></div>`).join("")}</body></html>`;
const content = w => ({ x: w.x, y: w.y + BAR, w: w.w, h: w.h - BAR });

const cardHtml = outro => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
  body{background:${M.BG};font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
  img{width:190px;height:190px;border-radius:44px;box-shadow:0 18px 44px rgba(20,10,60,.4);animation:pop .7s cubic-bezier(.2,1.4,.4,1) both}
  h1{margin:34px 0 6px;font-size:112px;font-weight:800;letter-spacing:-.03em;animation:rise .7s .25s both}
  p{margin:0;font-size:42px;opacity:.95;animation:rise .7s .45s both}
  .pills{display:flex;gap:18px;margin-top:44px}
  .pills span{padding:14px 34px;border-radius:999px;font-weight:700;font-size:32px;box-shadow:0 0 0 3px #fff,0 8px 20px rgba(0,0,0,.25);animation:rise .6s both}
  .add{background:#1f9d55}.hide{background:#d93a49}.dark{background:#17171f}
  @keyframes pop{from{transform:scale(.4);opacity:0}to{transform:none;opacity:1}}
  @keyframes rise{from{transform:translateY(26px);opacity:0}to{transform:none;opacity:1}}
  </style></head><body><img src="${M.ICON}"><h1>AddOrHide</h1>
  ${outro ? `<p>Free, and private on your device</p><div class="pills"><span class="dark" style="animation-delay:.7s">No accounts</span><span class="dark" style="animation-delay:.85s">No ads</span><span class="dark" style="animation-delay:1s">Every feature included</span></div>`
    : `<p>Your videos, your way</p><div class="pills"><span class="add" style="animation-delay:.75s">Add</span><span class="hide" style="animation-delay:.9s">Hide</span><span class="dark" style="animation-delay:1.05s">✓ Watched</span><span class="dark" style="animation-delay:1.2s">▶ Resume</span></div>`}</body></html>`;

async function compose(scene, bgHtml, clips, ctx) {
  const bgPage = await ctx.newPage(); await bgPage.setViewportSize({ width: W, height: H });
  await bgPage.setContent(bgHtml); await wait(300);
  const bg = path.join(WORK, `${scene.id}-bg.png`); await bgPage.screenshot({ path: bg }); await bgPage.close();
  const inputs = ["-loop", "1", "-framerate", String(FPS), "-t", scene.length.toFixed(3), "-i", bg];
  clips.forEach(c => inputs.push("-i", c.file));
  let chain = "[0:v]"; const parts = [];
  clips.forEach((c, i) => { const out = i === clips.length - 1 ? "[v]" : `[t${i}]`; parts.push(`${chain}[${i + 1}:v]overlay=${c.x}:${c.y}:shortest=0${out}`); chain = `[t${i}]`; });
  const file = path.join(WORK, `scene-${scene.id}.mp4`);
  ff([...inputs, "-filter_complex", parts.length ? parts.join(";") + ";[v]format=yuv420p[o]" : "[0:v]format=yuv420p[o]", "-map", "[o]", "-r", String(FPS), "-t", scene.length.toFixed(3), "-c:v", "libx264", "-crf", "14", "-preset", "medium", file]);
  scene.file = file;
}

// The video's feed: the screenshot feed, with two cards turned into Shorts so hiding Shorts visibly works.
const SHORTS = [4, 15];
function videoFeedHtml() {
  let html = M.feedHtml();
  for (const i of SHORTS) {
    const s = M.slug(M.VIDEOS[i][0]);
    html = html.split(`/watch/${s}`).join(`/shorts/${s}`).replace(new RegExp(`(/shorts/${s}"><img[^>]*><span class="dur">)[^<]*`), "$10:45");
  }
  return html;
}
const CATEGORIES = [
  { id: "watched", label: "Watched", hint: "Videos you have watched" },
  { id: "shorts", label: "Shorts", hint: "Short vertical videos", card: { href: "/shorts/" } },
  { id: "live", label: "Live", hint: "Streams that are live now", card: { text: "\\bLIVE\\b" } },
  { id: "music", label: "Music", hint: "Music videos and mixes", card: { text: "\\b(Mix|Chords)\\b" } }
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { ctx, sw, id, data } = await M.launchMock({ chromium, deviceScaleFactor: 1, categories: CATEGORIES,
    routes: [(u, route) => (u.hostname === M.FEED && (u.pathname === "/" || u.pathname === "/index.html")) ? (route.fulfill({ contentType: "text/html", body: videoFeedHtml() }), true) : false,
      (u, route) => (u.hostname === M.FEED && u.pathname.startsWith("/shorts/")) ? (route.fulfill({ contentType: "text/html", body: M.watchHtml() }), true) : false] });
  await ctx.addInitScript(CURSOR);
  const reset = extra => sw.evaluate(async ({ feed, data, extra }) => {
    await chrome.storage.local.set({ siteRules: { [feed]: { enabled: true, scheme: "https", hideKinds: [] } }, addedItems: data.added, hiddenItems: {}, hiddenChannels: {},
      watchProgress: data.watchProgress, watchLater: data.watchLater, buttonEdge: "top", buttonsEnabled: true, addedViewPrefs: {}, hiddenViewPrefs: {}, ...extra });
    await chrome.storage.local.remove(["theme", "pageLock"]);
  }, { feed: M.FEED, data, extra: extra || {} });

  // Intro and outro cards.
  for (const which of ["intro", "outro"]) {
    const scene = byId(which); const page = await ctx.newPage(); await page.setViewportSize({ width: W, height: H });
    await page.setContent("<body style='margin:0;background:#4f4fe6'></body>"); await wait(200);
    const rec = await startRecording(page, which, { w: W, h: H });
    await page.setContent(cardHtml(which === "outro")); await wait(scene.length * 1000);
    scene.file = await rec.stop(scene.length); await page.close();
  }

  // 1. Feed: Add, Hide (with Undo) and the Watched tags.
  {
    const scene = byId("feed"); await reset();
    const win = { x: 150, y: 220, w: 1620, h: 820, label: "lumaclips.tv" }; const box = content(win);
    const page = await ctx.newPage(); await page.setViewportSize({ width: box.w, height: box.h });
    await page.goto(`https://${M.FEED}/`); await wait(2500); await page.mouse.move(box.w - 200, box.h - 60); page.__pos = { x: box.w - 200, y: box.h - 60 };
    const rec = await startRecording(page, "feed", { w: box.w, h: box.h }); const t0 = Date.now();
    const card = n => page.locator(".card").nth(n);
    await wait(500); await glideTo(page, card(1).locator(".thumb"), 700); await wait(500);
    await click(page, card(1).locator('.hoa-actions [data-action="add"]'), 450); await wait(900);
    await glideTo(page, card(2).locator(".thumb"), 600); await wait(400);
    await click(page, card(2).locator('.hoa-actions [data-action="hide"]'), 400); await wait(1300);
    await glideTo(page, card(0).locator(".thumb"), 700);
    await wait(Math.max(0, scene.length * 1000 - (Date.now() - t0)));
    await compose(scene, frameHtml({ title: "Add it or hide it, right on the thumbnail", sub: "Hover any video. Ones you've watched carry a tag.", windows: [win] }), [{ file: await rec.stop(scene.length), ...box }], ctx);
    await page.close();
  }

  // 2. Hide by type: the popup switches whole categories off and the feed beside it follows.
  {
    const scene = byId("types"); await reset();
    const feedWin = { x: 80, y: 220, w: 1250, h: 820, label: "lumaclips.tv" }, popWin = { x: 1370, y: 220, w: 470, h: 820, label: "Hide on this site" };
    const fb = content(feedWin), pb = content(popWin);
    const feed = await ctx.newPage(); await feed.setViewportSize({ width: fb.w, height: fb.h }); await feed.goto(`https://${M.FEED}/`); await wait(2500);
    const tabId = await sw.evaluate(async f => (await chrome.tabs.query({ url: `https://${f}/*` })).pop().id, M.FEED);
    const pop = await ctx.newPage(); await pop.setViewportSize({ width: pb.w, height: pb.h });
    await pop.addInitScript(t => { const q = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = (info, cb) => q({}, tabs => cb(tabs.filter(x => x.id === t))); }, tabId);
    await pop.goto(`chrome-extension://${id}/popup.html`); await pop.addStyleTag({ content: "html{zoom:1.15}" }); await wait(1200);
    await pop.getByText("Hide on this site").first().click(); await wait(700);
    await pop.mouse.move(pb.w / 2, pb.h - 40); pop.__pos = { x: pb.w / 2, y: pb.h - 40 };
    const rf = await startRecording(feed, "types-feed", { w: fb.w, h: fb.h }); const rp = await startRecording(pop, "types-pop", { w: pb.w, h: pb.h }); const t0 = Date.now();
    const toggle = name => pop.locator(".filter-popover .switch-row").filter({ hasText: new RegExp("^\\s*" + name + "\\s*$") }).first().locator('[role="switch"], input[type="checkbox"]').first();
    await wait(900); await click(pop, toggle("Shorts"), 700); await wait(1700);
    await click(pop, toggle("Watched"), 600); await wait(800);
    await wait(Math.max(0, scene.length * 1000 - (Date.now() - t0)));
    const [cf, cp] = [await rf.stop(scene.length), await rp.stop(scene.length)];
    await compose(scene, frameHtml({ title: "Hide what you don't want to see", sub: "Switch off whole categories, or add your own keywords.", windows: [feedWin, popWin] }), [{ file: cf, ...fb }, { file: cp, ...pb }], ctx);
    await feed.close(); await pop.close();
  }

  // 3. Watch Later from the player; the library on the right picks it up at once.
  {
    const scene = byId("later"); await reset();
    const watchWin = { x: 80, y: 220, w: 900, h: 820, label: "lumaclips.tv" }, libWin = { x: 1010, y: 220, w: 830, h: 820, label: "Added Videos" };
    const wb = content(watchWin), lb = content(libWin);
    const watch = await ctx.newPage(); await watch.setViewportSize({ width: wb.w, height: wb.h }); await watch.goto(M.keyOf(M.VIDEOS[M.WATCH_PAGE][0], M.VIDEOS[M.WATCH_PAGE][1])); await wait(2200);
    const lib = await ctx.newPage(); await lib.setViewportSize({ width: lb.w, height: lb.h });
    await lib.goto(`chrome-extension://${id}/added.html`); await lib.addStyleTag({ content: "html{zoom:.72}" }); await wait(1500);
    await watch.mouse.move(wb.w - 80, wb.h - 40); watch.__pos = { x: wb.w - 80, y: wb.h - 40 };
    const rw = await startRecording(watch, "later-watch", { w: wb.w, h: wb.h }); const rl = await startRecording(lib, "later-lib", { w: lb.w, h: lb.h }); const t0 = Date.now();
    await wait(500); await glideTo(watch, watch.locator("video"), 800); await wait(700);
    await click(watch, watch.locator("#hoa-watch-later"), 450); await wait(1500);
    await wait(Math.max(0, scene.length * 1000 - (Date.now() - t0)));
    const [cw, cl] = [await rw.stop(scene.length), await rl.stop(scene.length)];
    await compose(scene, frameHtml({ title: "Pick up where you left off", sub: "Save videos for later. Ones you start wait with the time left.", windows: [watchWin, libWin] }), [{ file: cw, ...wb }, { file: cl, ...lb }], ctx);
    await watch.close(); await lib.close();
  }

  // 4. The library: tabs, a folding group, then dark to light.
  {
    const scene = byId("library"); await reset({ theme: "dark", addedViewPrefs: { __page: { grouping: "tabs", selectedTab: M.FEED }, [M.FEED]: { sort: "views", dir: "desc", group: "type" } } });
    const win = { x: 150, y: 220, w: 1620, h: 820, label: "Added Videos" }; const box = content(win);
    const page = await ctx.newPage(); await page.setViewportSize({ width: box.w, height: box.h });
    await page.goto(`chrome-extension://${id}/added.html`); await wait(1800); await page.mouse.move(box.w - 200, box.h - 60); page.__pos = { x: box.w - 200, y: box.h - 60 };
    const rec = await startRecording(page, "library", { w: box.w, h: box.h }); const t0 = Date.now();
    const tab = name => page.locator('[role="tab"]').filter({ hasText: name }).first();
    // The page turns light exactly as he says "light" and dark again on "dark" (as the theme button does). The
    // switch is sent a few frames early to cover the storage round trip and the repaint.
    const at = word => (VOICE_AT + scene.words.find(w => w.w.toLowerCase() === word).start) * 1000 - 60;
    const until = async ms => { const left = ms - (Date.now() - t0); if (left > 0) await wait(left); };
    await wait(400); await click(page, tab("Reelbay"), 700); await wait(900);
    await click(page, tab("Lumaclips"), 600);
    await glide(page, box.w - 260, box.h - 140, 700);
    await until(at("light")); await sw.evaluate(() => chrome.storage.local.set({ theme: "light" }));
    await until(at("dark")); await sw.evaluate(() => chrome.storage.local.set({ theme: "dark" }));
    await wait(500); await click(page, page.locator(".subgroup-toggle").first(), 600); await wait(700);
    await click(page, page.locator(".subgroup-toggle").first(), 300);
    await wait(Math.max(0, scene.length * 1000 - (Date.now() - t0)));
    await compose(scene, frameHtml({ title: "Your own video library", sub: "Tabs, sorting, grouping and your own tags. Dark or light.", windows: [win] }), [{ file: await rec.stop(scene.length), ...box }], ctx);
    await page.close();
  }

  // 5. Hidden, never lost; and a locked page that opens with its password.
  {
    const scene = byId("hidden"); await reset({ hiddenItems: data.hidden });
    const hidWin = { x: 80, y: 220, w: 1000, h: 820, label: "Hidden Videos" }, lockWin = { x: 1110, y: 220, w: 730, h: 820, label: "Added Videos" };
    const hb = content(hidWin), kb = content(lockWin);
    const hid = await ctx.newPage(); await hid.setViewportSize({ width: hb.w, height: hb.h }); await hid.goto(`chrome-extension://${id}/hidden.html`); await hid.addStyleTag({ content: "html{zoom:.9}" }); await wait(1500);
    const lockPage = await ctx.newPage(); await lockPage.setViewportSize({ width: kb.w, height: kb.h });
    await lockPage.goto(`chrome-extension://${id}/options.html`); await wait(600);
    await lockPage.evaluate(async () => { const lock = await HOA_LOCK.hashPassword("letmein"); await chrome.storage.local.set({ pageLock: { ...lock, added: true, hidden: false } }); });
    await lockPage.goto(`chrome-extension://${id}/added.html`); await lockPage.addStyleTag({ content: "html{zoom:.8}" }); await wait(1300);
    await hid.mouse.move(hb.w - 60, hb.h - 40); hid.__pos = { x: hb.w - 60, y: hb.h - 40 }; lockPage.__pos = { x: kb.w / 2, y: kb.h - 40 };
    const rh = await startRecording(hid, "hidden-list", { w: hb.w, h: hb.h }); const rk = await startRecording(lockPage, "hidden-lock", { w: kb.w, h: kb.h }); const t0 = Date.now();
    await wait(500); const restore = hid.locator(".hidden-row .restore-button, .hidden-row button[aria-label^='Show'], .hidden-row button[title^='Show']").first();
    await click(hid, restore, 800); await wait(1200);
    const field = lockPage.locator('input[type="password"]').first();
    await click(lockPage, field, 600); await lockPage.keyboard.type("letmein", { delay: 110 }); await wait(250);
    await click(lockPage, lockPage.getByRole("button", { name: /unlock/i }).first(), 450); await wait(900);
    await wait(Math.max(0, scene.length * 1000 - (Date.now() - t0)));
    const [ch, ck] = [await rh.stop(scene.length), await rk.stop(scene.length)];
    await compose(scene, frameHtml({ title: "Hidden, never lost, and private if you like", sub: "Bring anything back. Lock either page with a password.", windows: [hidWin, lockWin] }), [{ file: ch, ...hb }, { file: ck, ...kb }], ctx);
    await hid.close(); await lockPage.close();
  }
  await ctx.close();

  // Join the scenes with short crossfades and lay the voice-over on top.
  const inputs = []; SCENES.forEach(s => inputs.push("-i", s.file));
  let video = "[0:v]", offset = 0; const vparts = [];
  SCENES.slice(1).forEach((s, i) => { offset += SCENES[i].length - FADE; const out = `[x${i}]`; vparts.push(`${video}[${i + 1}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${out}`); video = out; });
  const total = SCENES.reduce((sum, s) => sum + s.length, 0) - FADE * (SCENES.length - 1);
  let start = 0; const aparts = [], alabels = [];
  SCENES.forEach((s, i) => { inputs.push("-i", s.voice); const ms = Math.round((start + VOICE_AT) * 1000); aparts.push(`[${SCENES.length + i}:a]adelay=${ms}|${ms},volume=1.6[a${i}]`); alabels.push(`[a${i}]`); start += s.length - FADE; });
  const music = path.join(WORK, "music.wav");
  execFileSync(process.env.PYTHON || "python", [path.join(__dirname, "store-music.py"), music, total.toFixed(3)], { stdio: "inherit" });
  inputs.push("-i", music); const musicIn = SCENES.length * 2;
  const filter = [...vparts, ...aparts,
    `${alabels.join("")}amix=inputs=${alabels.length}:normalize=0,apad,atrim=0:${total.toFixed(3)},aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[voice][key]`,
    // Music sits well below the voice, loses its low rumble, and dips a further ~8 dB whenever he speaks.
    `[${musicIn}:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=90,volume=0.30[bed]`,
    `[bed][key]sidechaincompress=threshold=0.02:ratio=5:attack=40:release=500:makeup=1[ducked]`,
    `[voice][ducked]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=0:${total.toFixed(3)}[a]`].join(";");
  const out = path.join(OUT_DIR, "addorhide-promo.mp4");
  ff([...inputs, "-filter_complex", filter, "-map", video, "-map", "[a]", "-c:v", "libx264", "-crf", "17", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", String(FPS), "-color_range", "tv", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", out]);
  console.log("video", out, total.toFixed(2), "s");
})().catch(error => { console.error(error); process.exit(1); });
