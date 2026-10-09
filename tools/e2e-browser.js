"use strict";
// Real-browser test: loads the unpacked extension into an installed Chromium browser (Brave/Chrome/Edge 154 work)
// with Playwright and drives live sites. Needs: npm install playwright-core (anywhere) and
//   PLAYWRIGHT_PATH=<folder>/node_modules/playwright-core BROWSER_EXE="C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe" node tools/e2e-browser.js
// Notes: branded Chrome 137+ needs --disable-features=DisableLoadExtensionCommandLineSwitch (already passed).
// Browser permission prompts cannot be clicked by automation, so the flow test grants the sites statically in a
// COPY of the manifest; the permission test instead proves the browser ACCEPTS the request (the prompt then stays
// pending). IMDb answers 403 to automated browsers, so it is not covered here.
const path = require("path"), fs = require("fs"), os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright-core");
const SRC = path.join(__dirname, "..");
const exe = process.env.BROWSER_EXE;
const headless = process.env.HEADLESS !== "0";
const FILES = fs.readdirSync(SRC).filter(f => /\.(js|css|html|json)$/.test(f) || f === "icons");
(async () => {
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), "aoh-ext-"));
  for (const f of FILES) fs.cpSync(path.join(SRC, f), path.join(ext, f), { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
  m.host_permissions = [...m.host_permissions, "*://www.imdb.com/*", "*://www.twitch.tv/*", "*://www.dailymotion.com/*"];
  fs.writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(m, null, 2));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aoh-profile-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: exe, headless, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-first-run"]
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => null);
  console.log("service worker:", sw ? sw.url() : "NONE (extension did not load)");
  if (!sw) { await ctx.close(); process.exit(2); }
  const swEval = (fn, arg) => sw.evaluate(fn, arg);
  console.log("SW globals:", JSON.stringify(await swEval(() => ({ HOA: typeof HOA, HOA_CATALOG: typeof HOA_CATALOG, HOA_SITES: typeof HOA_SITES }))));
  // Enable the three sites exactly as the popup would store them, then let the worker register the scripts.
  await swEval(async () => {
    const rules = {};
    for (const h of ["www.imdb.com", "www.twitch.tv", "www.dailymotion.com"]) rules[h] = { enabled: true, pendingPick: false, cardSelector: "", linkSelector: "", bulkHide: false };
    await chrome.storage.local.set({ siteRules: rules });
    await new Promise(r => HOA_SITES.reconcile(r));
  });
  await new Promise(r => setTimeout(r, 1500));
  console.log("registered scripts:", JSON.stringify(await swEval(async () => (await chrome.scripting.getRegisteredContentScripts()).map(s => s.id + " -> " + s.matches.join(",") + " [" + s.js.join(",") + "]"))));
  const SITES = [
    ["IMDb chart", "https://www.imdb.com/chart/top/", "li.ipc-metadata-list-summary-item"],
    ["Twitch directory", "https://www.twitch.tv/directory/all", 'article:has(a[data-a-target="preview-card-image-link"])'],
    ["Dailymotion home", "https://www.dailymotion.com/us", 'ul[data-testid="page-layout-grid"] > li']
  ];
  for (const [name, url, sel] of SITES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(e => console.log(name, "goto:", String(e).slice(0, 80)));
    await page.waitForSelector(sel, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const info = await page.evaluate(sel => ({ cards: document.querySelectorAll(sel).length, buttons: document.querySelectorAll(".hoa-actions").length, loaded: window.__hoaLoaded === true, hasCss: !!document.querySelector(".hoa-host") }), sel);
    console.log(`\n== ${name}: cards=${info.cards} overlays=${info.buttons} contentScriptLoaded=${info.loaded} pageErrors=${errors.length}`);
    const status = await swEval(async host => { const tabs = await chrome.tabs.query({ url: "https://" + host + "/*" }); try { return await chrome.tabs.sendMessage(tabs[0].id, { type: "hoa-status" }); } catch (e) { return { error: String(e).slice(0, 80) }; } }, new URL(url).host);
    console.log("   popup status reply:", JSON.stringify(status));
    if (info.buttons) {
      const card = page.locator(sel).first();
      await card.scrollIntoViewIfNeeded(); await card.hover(); await page.waitForTimeout(400);
      const vis = await page.evaluate(sel => { const c = document.querySelector(sel); const a = c.querySelector(":scope > .hoa-actions"); const r = a.getBoundingClientRect(); const cs = getComputedStyle(a); return { opacity: cs.opacity, pointer: cs.pointerEvents, pos: [...a.classList].filter(x => x.startsWith("hoa-pos") || x === "hoa-left").join(","), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }; }, sel);
      console.log("   hovered overlay:", JSON.stringify(vis));
      await page.locator(sel).first().locator(':scope > .hoa-actions [data-action="add"]').click({ timeout: 5000 }).catch(e => console.log("   click failed:", String(e).slice(0, 100)));
      await page.waitForTimeout(500);
      const added = await swEval(async () => Object.entries((await chrome.storage.local.get("addedItems")).addedItems || {}).map(([k, v]) => k + " | " + v.title));
      console.log("   addedItems:", JSON.stringify(added));
      await swEval(() => chrome.storage.local.set({ addedItems: {} }));
    }
    if (errors.length) console.log("   page errors:", errors.slice(0, 3));
    await page.close();
  }
  await ctx.close();
})().catch(e => { console.error("E2E ERROR", e); process.exit(1); });
