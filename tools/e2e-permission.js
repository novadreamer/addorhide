"use strict";
// Real-browser test: loads the unpacked extension into an installed Chromium browser (Brave/Chrome/Edge 154 work)
// with Playwright and drives live sites. Needs: npm install playwright-core (anywhere) and
//   PLAYWRIGHT_PATH=<folder>/node_modules/playwright-core BROWSER_EXE="C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe" node tools/e2e-permission.js
// Notes: branded Chrome 137+ needs --disable-features=DisableLoadExtensionCommandLineSwitch (already passed).
// Browser permission prompts cannot be clicked by automation, so the flow test grants the sites statically in a
// COPY of the manifest; the permission test instead proves the browser ACCEPTS the request (the prompt then stays
// pending). IMDb answers 403 to automated browsers, so it is not covered here.
const path = require("path"), fs = require("fs"), os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright-core");
const SRC = path.join(__dirname, "..");
const FILES = fs.readdirSync(SRC).filter(f => /\.(js|css|html|json)$/.test(f) || f === "icons");
(async () => {
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), "aoh-ext-"));
  for (const f of FILES) fs.cpSync(path.join(SRC, f), path.join(ext, f), { recursive: true });   // ORIGINAL manifest: no extra host permissions
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "aoh-profile-")), {
    executablePath: process.env.BROWSER_EXE, headless: process.env.HEADLESS !== "0", viewport: { width: 900, height: 700 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-first-run"]
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const id = new URL(sw.url()).host;
  console.log("manifest optional_host_permissions:", JSON.stringify(JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"))).optional_host_permissions));
  for (const host of ["www.imdb.com", "www.twitch.tv", "www.dailymotion.com"]) {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/options.html`);
    const resultPromise = page.evaluate(host => new Promise(resolve => {
      const timer = setTimeout(() => resolve({ outcome: "no error within 8s: the browser accepted the request and is showing its permission prompt" }), 8000);
      document.addEventListener("click", () => {
        HOA_SITES.enableSite(host, -1, {}, result => { clearTimeout(timer); resolve(result); }, "https");
      }, { once: true });
    }), host);
    await page.waitForTimeout(300);
    await page.mouse.click(200, 200);
    console.log(host.padEnd(22), JSON.stringify(await resultPromise));
    await page.close();
  }
  await ctx.close();
})().catch(e => { console.error("ERR", e); process.exit(1); });
