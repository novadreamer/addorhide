"use strict";
const path = require("path"), fs = require("fs"), os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright-core");
const SRC = path.join(__dirname, "..");
const FILES = fs.readdirSync(SRC).filter(f => /\.(js|css|html|json)$/.test(f) || f === "icons");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const HOSTS = ["www.imdb.com", "www.twitch.tv", process.env.PICK_URL ? new URL(process.env.PICK_URL).hostname : "archive.org"];
const only = (process.env.ONLY || "twitch,position,imdbhome,imdbvideo,picker").split(",");
(async () => {
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), "aoh-ext-"));
  for (const f of FILES) fs.cpSync(path.join(SRC, f), path.join(ext, f), { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
  m.host_permissions = [...m.host_permissions, ...HOSTS.map(h => `https://${h}/*`)];
  fs.writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(m, null, 2));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aoh-profile-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.BROWSER_EXE || "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", headless: process.env.HEADLESS !== "0",
    userAgent: UA, viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-first-run", "--disable-blink-features=AutomationControlled"]
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  console.log("version", await sw.evaluate(() => chrome.runtime.getManifest().version));
  await sw.evaluate(async hosts => {
    const rules = {};
    for (const h of hosts) rules[h] = { enabled: true, scheme: "https", pendingPick: false, cardSelector: "", linkSelector: "", bulkHide: false };
    await chrome.storage.local.set({ siteRules: rules });
    await new Promise(r => HOA_SITES.reconcile(r));
  }, ["www.imdb.com", "www.twitch.tv"]);
  await new Promise(r => setTimeout(r, 1500));
  const store = () => sw.evaluate(async () => { const s = await chrome.storage.local.get(["hiddenItems", "addedItems", "siteRules"]); return s; });
  const clearItems = () => sw.evaluate(() => chrome.storage.local.set({ hiddenItems: {}, addedItems: {} }));
  async function open(url, scrolls = 0) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
    const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(8000);
    for (let i = 0; i < scrolls; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(800); }
    if (scrolls) { await page.mouse.wheel(0, -100000); await page.waitForTimeout(1500); }
    page.__errors = errors;
    console.log(`\n== ${url} status=${r && r.status()} overlays=${await page.locator(".hoa-actions").count()}`);
    return page;
  }
  async function clickAction(page, index, action) {
    const host = page.locator(".hoa-host").nth(index);
    await host.scrollIntoViewIfNeeded().catch(() => {});
    const box = await host.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    await page.waitForTimeout(1500);
    const probe = await page.evaluate(([i, action]) => {
      const hostEl = document.querySelectorAll(".hoa-host")[i];
      const a = hostEl.querySelector(":scope > .hoa-actions");
      const btn = a.querySelector(`[data-action="${action}"]`);
      const r = btn.getBoundingClientRect(), hr = hostEl.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      return { cx, cy, onTop: document.elementFromPoint(cx, cy) === btn, opacity: getComputedStyle(a).opacity, pos: [...a.classList].filter(c => c.startsWith("hoa-pos")).join(","), relX: Math.round((cx - hr.x) / hr.width * 100) + "%" };
    }, [index, action]);
    await page.mouse.click(probe.cx, probe.cy);
    await page.waitForTimeout(1000);
    return probe;
  }
  const summarize = items => Object.entries(items || {}).map(([k, v]) => `${k} | ${v.title} | type=${v.type} dur=${v.duration} listed=${v.listed}`);

  if (only.includes("twitch")) {
    for (const url of ["https://www.twitch.tv/", "https://www.twitch.tv/directory/all"]) {
      await clearItems();
      const page = await open(url);
      const p1 = await clickAction(page, 0, "add");
      const addText = await page.evaluate(() => document.querySelectorAll(".hoa-host")[0].querySelector('[data-action="add"]').textContent);
      const p2 = await clickAction(page, 1, "hide");
      const toast = await page.evaluate(() => (document.getElementById("hoa-toast") || {}).textContent || "");
      const s = await store();
      console.log("  add probe", JSON.stringify(p1), "button now:", addText);
      console.log("  hide probe", JSON.stringify(p2), "toast:", toast);
      console.log("  added:", summarize(s.addedItems)); console.log("  hidden:", summarize(s.hiddenItems));
      console.log("  page errors:", page.__errors.slice(0, 2));
      await page.close();
    }
  }
  if (only.includes("position")) {
    for (const pos of ["left", "center", "right"]) {
      await sw.evaluate(async pos => { const s = (await chrome.storage.local.get("siteRules")).siteRules; s["www.twitch.tv"] = { ...s["www.twitch.tv"], buttonPosition: pos }; await chrome.storage.local.set({ siteRules: s }); }, pos);
      const page = await open("https://www.twitch.tv/directory/all");
      const p = await clickAction(page, 2, "add");
      console.log(`  position=${pos}:`, JSON.stringify(p));
      await page.close();
    }
  }
  if (only.includes("imdbhome")) {
    const page = await open("https://www.imdb.com/", 8);
    const counts = await page.evaluate(() => ({ posters: document.querySelectorAll(".ipc-poster-card").length, slates: document.querySelectorAll(".ipc-slate-card").length, overlays: document.querySelectorAll(".hoa-actions").length, title: document.title }));
    console.log("  home counts", JSON.stringify(counts));
    if (counts.overlays) { await clearItems(); const p = await clickAction(page, 0, "add"); console.log("  add", JSON.stringify(p), summarize((await store()).addedItems)); }
    await page.close();
  }
  if (only.includes("imdbvideo")) {
    for (const url of ["https://www.imdb.com/trailers/", "https://www.imdb.com/title/tt0111161/videogallery/"]) {
      await clearItems();
      const page = await open(url);
      await clickAction(page, 0, "add");
      await clickAction(page, 1, "add");
      console.log("  added:", summarize((await store()).addedItems));
      await page.close();
    }
  }
  if (only.includes("picker")) {
    const url = process.env.PICK_URL || "https://archive.org/details/feature_films";
    const host = new URL(url).hostname;
    await sw.evaluate(async host => { const s = (await chrome.storage.local.get("siteRules")).siteRules || {}; s[host] = { enabled: true, scheme: "https", pendingPick: true, cardSelector: "", linkSelector: "", bulkHide: false }; await chrome.storage.local.set({ siteRules: s }); await new Promise(r => HOA_SITES.reconcile(r)); }, host);
    const page = await open(url, 3);
    const tabId = await sw.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url && t.url.startsWith(url)).id, url);
    await page.mouse.wheel(0, Number(process.env.PICK_SCROLL || 1100)); await page.waitForTimeout(2000);
    for (let round = 0; round < 3; round++) {
      await sw.evaluate(tabId => new Promise(r => HOA_SITES.startPicker(tabId, r)), tabId);
      await page.waitForTimeout(800);
      const target = await page.evaluate(round => {
        const nearLink = el => { for (let n = el, k = 0; n && k < 6; n = n.parentElement, k++) if (n.querySelector && n.querySelector("a[href]")) return true; return false; }; const imgs = [...document.querySelectorAll("img")].filter(i => { const r = i.getBoundingClientRect(); return r.width > 100 && r.width < 500 && r.height > 60 && r.top > 80 && r.bottom < innerHeight && nearLink(i) && (() => { const ov = document.getElementById("hoa-picker-overlay"); if (ov) ov.style.pointerEvents = "none"; const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); if (ov) ov.style.pointerEvents = "auto"; return top === i || (top && top.contains(i)) || (top && i.parentElement && i.parentElement.contains(top)); })(); });
        const i = imgs[round * 7] || imgs[imgs.length - 1];
        if (!i) return null; const r = i.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, n: imgs.length };
      }, round);
      if (!target) { console.log("  no target image"); break; }
      if (round === 0) console.log(await page.evaluate(([x, y]) => { const out = []; const pick = document.getElementById("hoa-picker-overlay"); if (pick) pick.style.pointerEvents = "none"; let n = document.elementFromPoint(x, y); if (pick) pick.style.pointerEvents = "auto"; for (let k = 0; n && k < 12; k++, n = n.parentElement) { const r = n.getBoundingClientRect(); const cls = [...n.classList].join("."); let cnt = -1; try { cnt = document.querySelectorAll(n.localName + (cls ? "." + [...n.classList].map(c => CSS.escape(c)).join(".") : "")).length; } catch (e) {} out.push(`${k}: <${n.localName}${n.id ? "#" + n.id : ""}${cls ? "." + cls : ""}> ${[...n.attributes].filter(a => a.name !== "class" && a.name !== "style" && a.name !== "src" && a.name !== "srcset").map(a => a.name + "=" + a.value.slice(0, 30)).join(" ")} anchor=${!!(n.matches("a[href]") || n.querySelector("a[href]"))} size=${Math.round(r.width)}x${Math.round(r.height)} sameSel=${cnt}`); } return out.join(String.fromCharCode(10)); }, [target.x, target.y]));
      await page.mouse.move(target.x, target.y); await page.waitForTimeout(300);
      await page.mouse.move(target.x + 2, target.y + 2); await page.waitForTimeout(300);
      await page.mouse.click(target.x + 2, target.y + 2);
      await page.waitForTimeout(800);
      const panel = await page.evaluate(() => { const p = document.getElementById("hoa-picker-panel"); return p ? p.innerText.replace(/\n/g, " / ") : "NO PANEL"; });
      console.log(`  pick round ${round}: panel = ${panel}`);
      const saveBtn = page.locator("#hoa-picker-panel button", { hasText: /^Save$/ });
      if (await saveBtn.count()) { await saveBtn.click(); } else { await page.keyboard.press("Escape"); }
      await page.waitForTimeout(2500);
      const s = await store();
      console.log("    pickedSelectors:", JSON.stringify(s.siteRules[host].pickedSelectors), "pendingPick:", s.siteRules[host].pendingPick, "overlays now:", await page.locator(".hoa-actions").count(), "picker gone:", !(await page.locator("#hoa-picker-panel").count()));
    }
    await clearItems();
    if (await page.locator(".hoa-actions").count()) {
      const p = await clickAction(page, 0, "add");
      console.log("  picked-site add:", JSON.stringify(p), summarize((await store()).addedItems));
    }
    console.log("  page errors:", page.__errors.slice(0, 3));
    await page.close();
  }
  // Popup rendering of a site panel
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/options.html`); await pop.waitForTimeout(1500);
  console.log("\nOPTIONS sites:", (await pop.evaluate(() => document.getElementById("site-list").innerText)).replace(/\n+/g, " | ").slice(0, 900));
  await ctx.close();
})().catch(e => { console.error("ERR", e); process.exit(1); });
