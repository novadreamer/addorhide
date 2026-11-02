// Exercises the featured-carousel control in the real popup DOM. jsdom stays dev-only,
// like the other DOM tests; set JSDOM_PATH when it is installed elsewhere.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let JSDOM;
try {
  JSDOM = require(process.env.JSDOM_PATH || "jsdom").JSDOM;
} catch (error) {
  console.log("popup.test.js: SKIPPED (jsdom not installed; set JSDOM_PATH to run it)");
  process.exit(0);
}

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function loadPopup({ url = "https://tubitv.com/", siteRules, seenRows, statusRows } = {}) {
  const dom = new JSDOM(read("popup.html"), { url: "https://extension.test/popup.html", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const host = new URL(url).hostname;
  const store = { siteRules: siteRules || { [host]: { enabled: true } } };
  if (seenRows) store.seenRows = seenRows;
  const listeners = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.chrome = {
    runtime: { lastError: null, getURL: value => value, getManifest: () => ({ version: "1.1.0" }), sendMessage(_message, callback) { if (callback) callback(); } },
    storage: { local: {
      get(defaults, callback) {
        const result = {};
        Object.keys(defaults).forEach(key => { result[key] = key in store ? clone(store[key]) : defaults[key]; });
        setTimeout(() => callback(result), 0);
      },
      set(values, callback) {
        const changes = {};
        Object.entries(values).forEach(([key, value]) => { changes[key] = { oldValue: store[key], newValue: clone(value) }; store[key] = clone(value); });
        setTimeout(() => { listeners.forEach(listener => listener(changes, "local")); if (callback) callback(); }, 0);
      }
    }, onChanged: { addListener: listener => listeners.push(listener) } },
    tabs: { query(_query, callback) { callback([{ id: 1, url }]); }, sendMessage(_id, _message, callback) { if (callback) callback({ active: true, cards: 1, overlays: 1, rows: statusRows || [] }); }, create() {}, reload() {} },
    permissions: { contains(_details, callback) { callback(true); }, request(_details, callback) { callback(true); } },
    windows: { getCurrent(callback) { callback({ id: 1, incognito: false }); } }
  };
  window.eval(["theme.js", "shared.js", "edge-choice.js", "catalog.js", "sites.js", "popup.js"].map(read).join("\n;\n"));
  await wait(40);
  return { window, document: window.document, store };
}

(async () => {
  const page = await loadPopup();
  const launch = page.document.querySelector(".filter-launch");
  assert.ok(launch, "the Tubi popup exposes filtering controls");
  launch.click();
  const panel = page.document.querySelector(".filter-popover");
  const toggle = Array.from(panel.querySelectorAll(".filter-tool")).find(node => node.title.startsWith("Featured carousels"));
  assert.ok(toggle, "the featured-carousel header control is present");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  toggle.click();
  await wait(10);
  assert.equal(page.store.siteRules["tubitv.com"].featuredCarousels, false);
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.equal(page.document.querySelector(".filter-popover"), panel, "saving leaves the popover open");
  assert.match(launch.title, /not in featured carousels/);
  page.window.close();
  const genres = await loadPopup({
    url: "https://play.xumo.com/free-movies/",
    siteRules: { "play.xumo.com": { enabled: true, hideSections: ["Comedy"] } },
    seenRows: { "play.xumo.com": ["Westerns"] },
    statusRows: [{ title: "Most Popular", kind: "popular", listed: false }, { title: "Comedy", kind: "genre", listed: true }, { title: "Drama", kind: "genre", listed: true }]
  });
  const genreLaunch = genres.document.querySelector(".filter-launch");
  genreLaunch.click();
  await wait(25);
  const genrePanel = genres.document.querySelector(".filter-popover");
  const genreRow = genrePanel.querySelector(".genres-row");
  assert.equal(genreRow.getAttribute("aria-checked"), "mixed", "genre state is known before the panel opens");
  assert.match(genreRow.textContent, /1 of 3/, "genre row shows the hidden count from page and remembered rows");
  genreRow.click();
  await wait(10);
  const inner = genrePanel.querySelector(".genres-panel");
  assert.ok(inner.classList.contains("is-open"));
  assert.equal(genreRow.getAttribute("aria-expanded"), "true");
  const drama = Array.from(inner.querySelectorAll(".genre-check")).find(label => /Drama/.test(label.textContent)).querySelector("input");
  drama.checked = true; drama.dispatchEvent(new genres.window.Event("change", { bubbles: true }));
  await wait(12);
  assert.deepEqual(genres.store.siteRules["play.xumo.com"].hideSections, ["Comedy", "Drama"]);
  assert.match(inner.querySelector(".genres-panel-header .filter-tool").title, /Unhide all genres/, "a selected row repaints the Genres bulk control");
  assert.equal(genres.document.querySelector(".genres-panel"), inner, "checking a row does not re-render the open Genres panel");
  const genreAll = inner.querySelector(".genres-panel-header .filter-tool");
  genreAll.click();
  await wait(12);
  assert.deepEqual(genres.store.siteRules["play.xumo.com"].hideSections, [], "Unhide all genres clears every listed row when one or more are selected");
  genreAll.click();
  await wait(12);
  assert.deepEqual(genres.store.siteRules["play.xumo.com"].hideSections, ["Comedy", "Drama", "Westerns"], "Hide all genres selects every listed row when none are selected");
  let typeAll = Array.from(genrePanel.querySelectorAll(".filter-popover-tools .filter-tool")).find(node => /all types/.test(node.title));
  typeAll.click();
  await wait(12);
  typeAll = Array.from(genrePanel.querySelectorAll(".filter-popover-tools .filter-tool")).find(node => /all types/.test(node.title));
  assert.deepEqual(genres.store.siteRules["play.xumo.com"].hideSections, ["Comedy", "Drama", "Westerns"], "type toggle does not touch named rows");
  assert.ok(genres.store.siteRules["play.xumo.com"].hideKinds.length, "type toggle selects every type from zero");
  assert.match(typeAll.title, /Unhide all types/);
  typeAll.click();
  await wait(12);
  typeAll = Array.from(genrePanel.querySelectorAll(".filter-popover-tools .filter-tool")).find(node => /all types/.test(node.title));
  assert.deepEqual(genres.store.siteRules["play.xumo.com"].hideKinds, [], "type toggle clears every type when one or more are selected");
  const firstType = genrePanel.querySelector('.switch-row input[role="switch"]');
  firstType.checked = true; firstType.dispatchEvent(new genres.window.Event("change", { bubbles: true }));
  await wait(12);
  assert.match(typeAll.title, /Unhide all types/, "an individual type selection repaints the bulk control");
  const activeInner = genrePanel.querySelector(".genres-panel");
  assert.ok(activeInner.classList.contains("is-open"), "redraw preserves the open Genres panel");
  genres.document.dispatchEvent(new genres.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.ok(!activeInner.classList.contains("is-open"), "Escape closes the inner Genres panel first");
  assert.equal(genres.document.querySelector(".filter-popover"), genrePanel, "Escape leaves the outer popover open after closing Genres");
  genres.window.close();
  console.log("popup.test.js: 22 passed, 0 failed");
})().catch(error => { console.error(error); process.exitCode = 1; });
