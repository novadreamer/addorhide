const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let JSDOM;
try { JSDOM = require(process.env.JSDOM_PATH || "jsdom").JSDOM; } catch (error) {
  console.log("added.test.js: SKIPPED (jsdom not installed; set JSDOM_PATH to run it)"); process.exit(0);
}

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function load() {
  const dom = new JSDOM('<!doctype html><main id="added-root"></main>', { url: "https://extension.test/added.html", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {}; window.scrollBy = () => {};
  const key = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const store = { addedItems: {}, hiddenItems: {}, hiddenChannels: {}, watchedShown: {}, addedViewPrefs: {}, watchProgress: {
    [key]: { site: "youtube.com", title: "A video", url: key, thumbnail: "", duration: 600, position: 125, buckets: "0000000000000000000000000", watched: false, cw: "manual", ts: 1, updated: 2 }
  } };
  const listeners = []; const clone = value => JSON.parse(JSON.stringify(value));
  window.confirm = () => true;
  window.chrome = { storage: { local: {
    get(defaults, callback) { const result = {}; Object.keys(defaults).forEach(name => { result[name] = name in store ? clone(store[name]) : defaults[name]; }); setTimeout(() => callback(result), 0); },
    set(values, callback) { const changes = {}; Object.entries(values).forEach(([name, value]) => { changes[name] = { oldValue: store[name], newValue: clone(value) }; store[name] = clone(value); }); setTimeout(() => { listeners.forEach(listener => listener(changes, "local")); if (callback) callback(); }, 0); }
  }, onChanged: { addListener: listener => listeners.push(listener) } }, runtime: { sendMessage() {} } };
  window.eval(`${read("shared.js")}\n;${read("added-ui.js")}\n;HOA_ADDED.mount(document.getElementById("added-root"));`);
  await wait(50); return { window, document: window.document, store, key };
}

(async () => {
  const page = await load(); const section = page.document.querySelector(".continue-watching");
  assert.ok(section, "Continue Watching renders before site groups");
  assert.match(section.textContent, /A video/); assert.match(section.textContent, /7:55 left.*YouTube/);
  const progress = section.querySelector(".continue-progress"); assert.equal(progress.style.getPropertyValue("--hoa-progress"), "20.833333333333336%");
  const link = section.querySelector(".card-media"); assert.match(link.href, /[?&]t=120s/);
  const collapse = section.querySelector(".collapse-button"); collapse.click(); await wait(30);
  assert.equal(page.document.querySelector(".continue-watching .added-card-grid"), null, "section uses the normal collapse preference");
  page.document.querySelector(".continue-watching .collapse-button").click(); await wait(30);
  const clear = page.document.querySelector(".continue-watching .site-delete-all"); clear.click(); await wait(5);
  assert.ok(page.document.querySelector(".continue-watching .site-delete-all").classList.contains("armed"), "delete-all arms before deleting");
  page.document.querySelector(".continue-watching .site-delete-all").click(); await wait(30);
  assert.ok(!page.store.watchProgress[page.key].cw, "second delete-all click clears Continue Watching but retains progress");
  page.window.close(); console.log("added.test.js: 8 passed, 0 failed");
})().catch(error => { console.error(error); process.exitCode = 1; });
