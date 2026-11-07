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

async function loadPopup({ url = "https://tubitv.com/", siteRules, seenRows, statusRows, nowPlaying, watchSettings, watchLater, addedItems, playerGranted = true, findReply, noFindReply = false, findDelay = 0 } = {}) {
  const dom = new JSDOM(read("popup.html"), { url: "https://extension.test/popup.html", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.document.head.insertAdjacentHTML("beforeend", `<style>${read("pages.css")}</style>`);
  const host = new URL(url).hostname;
  const store = { siteRules: siteRules || { [host]: { enabled: true } } };
  if (seenRows) store.seenRows = seenRows;
  if (watchSettings) store.watchSettings = watchSettings;
  if (watchLater) store.watchLater = watchLater;
  if (addedItems) store.addedItems = addedItems;
  const listeners = [];
  const messageListeners = [];
  const requestedOrigins = [];
  const registeredScripts = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.chrome = {
    runtime: { lastError: null, getURL: value => value, getManifest: () => ({ version: "1.1.0" }), onMessage: { addListener: listener => messageListeners.push(listener) }, sendMessage(_message, callback) { if (callback) callback(); } },
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
    tabs: { query(_query, callback) { callback([{ id: 1, url }]); }, sendMessage(_id, message, callback) { if (message.type === "hoa-find-rows") { if (callback) setTimeout(() => callback(noFindReply ? undefined : findReply), findDelay); return; } if (callback) callback({ active: true, cards: 1, overlays: 1, rows: statusRows || [], nowPlaying }); }, create() {}, reload() {} },
    permissions: { contains(details, callback) { callback(details.origins.some(origin => /player\.(pbs|dailymotion)\.org/.test(origin)) ? playerGranted : true); }, request(details, callback) { requestedOrigins.push(details.origins); callback(true); } },
    scripting: { unregisterContentScripts(_details, callback) { callback(); }, registerContentScripts(details, callback) { registeredScripts.push(...details); callback(); }, updateContentScripts(_details, callback) { callback(); }, executeScript(_details, callback) { callback(); }, insertCSS(_details, callback) { callback(); } },
    windows: { getCurrent(callback) { callback({ id: 1, incognito: false }); } }
  };
  window.eval(["theme.js", "shared.js", "edge-choice.js", "catalog.js", "sites.js", "popup.js"].map(read).join("\n;\n"));
  await wait(40);
  return { window, document: window.document, store, requestedOrigins, registeredScripts, progress: message => messageListeners.forEach(listener => listener(message)) };
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
  const wwwRows = await loadPopup({ url: "https://www.example.com/", siteRules: { "www.example.com": { enabled: true, pickedSelectors: ["a.card"] } }, seenRows: { "example.com": ["Old save"], "www.example.com": ["New save"] } });
  wwwRows.document.querySelector(".filter-launch").click(); await wait(25); wwwRows.document.querySelector(".genres-row").click(); await wait(60);
  const wwwText = wwwRows.document.querySelector(".filter-popover").textContent;
  assert.ok(wwwText.includes("Old save") && wwwText.includes("New save"), "saved rows are found with or without www");
  wwwRows.window.close();
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
  assert.match(inner.querySelector(".genres-live-note").textContent, /Rows load as you scroll/, "incomplete rows explain live loading");
  assert.equal(inner.querySelector(".genres-find").textContent, "Find all rows", "incomplete rows offer a full scan");
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
  const playing = await loadPopup({ nowPlaying: { key: "https://tubitv.com/movies/1", title: "One", duration: 100, position: 30 } });
  const autoAdd = playing.document.querySelector(".continue-watching-switch input");
  assert.ok(autoAdd && autoAdd.checked, "site card shows the enabled Auto-add Continue Watching switch without requiring playback");
  assert.ok(playing.document.querySelector("section.popup-edge.panel .position-row"), "hover-button and position controls share a panel");
  assert.equal(playing.document.querySelector("#buttons-toggle").hasAttribute("title"), false, "the power button has no tooltip, only its note");
  assert.ok(playing.document.querySelector("#buttons-toggle").getAttribute("aria-label"), "the power button still has a name for screen readers");
  assert.ok(playing.document.querySelector("#open-added-button").title, "Added Videos has a tooltip");
  assert.ok(playing.document.querySelector("#open-hidden-button").title, "Hidden Videos has a tooltip");
  autoAdd.checked = false; autoAdd.dispatchEvent(new playing.window.Event("change", { bubbles: true })); await wait(12);
  assert.equal(playing.store.watchSettings.continueWatching, "off", "Auto-add switch writes the global off setting");
  playing.window.close();
  const off = await loadPopup({ watchSettings: { continueWatching: "off" } });
  assert.equal(off.document.querySelector(".continue-watching-switch input").checked, false, "Auto-add switch reflects the global off setting");
  off.window.close();
  const controls = await loadPopup();
  const power = controls.document.getElementById("buttons-toggle");
  assert.equal(power.dataset.enabled, "true", "power control exposes the enabled state for its green ring");
  assert.ok(power.querySelector("svg[viewBox='0 0 64 64']"), "power control injects the round SVG redraw");
  assert.match(controls.window.getComputedStyle(power).getPropertyValue("--power-ring-light"), /50d58f/i, "enabled power ring is green");
  power.click(); await wait(10);
  assert.equal(power.dataset.enabled, "false", "power control flips state when pressed");
  assert.match(controls.window.getComputedStyle(power).getPropertyValue("--power-ring-light"), /f06b73/i, "disabled power ring is red");
  assert.equal(controls.document.querySelectorAll(".position-buttons .edge-button").length, 2, "position arrows remain available");
  assert.ok(controls.document.querySelector(".position-buttons .position-pill"), "position arrows include their decorative pill");
  assert.ok(controls.document.querySelector(".popup-control-divider"), "popup divides power and position controls");
  controls.window.close();
  const optionsDom = new JSDOM(read("options.html"), { url: "https://extension.test/options.html", runScripts: "outside-only", pretendToBeVisual: true });
  const optionStore = {}; optionsDom.window.chrome = { runtime: { lastError: null }, storage: { local: { get(defaults, callback) { callback({ ...defaults, ...optionStore }); }, set(values) { Object.assign(optionStore, values); } } } };
  optionsDom.window.eval(["shared.js", "edge-choice.js"].map(read).join("\n;\n")); await wait(5);
  assert.ok(optionsDom.window.document.querySelector("#buttons-toggle svg"), "Options binds the shared power control");
  assert.ok(optionsDom.window.document.querySelector(".position-pill"), "Options keeps the position-pill markup"); optionsDom.window.close();
  for (const [url, host] of [["https://www.youtube.com/", "www.youtube.com"], ["https://tubitv.com/", "tubitv.com"], ["https://rumble.com/", "rumble.com"], ["https://example.test/", "example.test"]]) {
    const types = await loadPopup({ url, siteRules: { [host]: { enabled: true } } });
    types.document.querySelector(".filter-launch").click(); await wait(12);
    const firstType = types.document.querySelector(".filter-popover .switch-row");
    assert.match(firstType.textContent, /Watched/, `Watched is the first type for ${host}`);
    types.window.close();
  }
  const pbs = await loadPopup({ url: "https://www.pbs.org/", siteRules: { "www.pbs.org": { enabled: false } } });
  assert.ok(Array.from(pbs.document.querySelectorAll(".muted")).some(node => node.textContent === "To track what you watch here, allow its video player"), "PBS explains its player-origin permission before the click");
  pbs.document.querySelector(".primary-button").click(); await wait(10);
  assert.deepEqual(pbs.requestedOrigins[0], ["https://www.pbs.org/*", "https://player.pbs.org/*"], "PBS enable click makes the small player request in the user gesture");
  pbs.window.close();
  const pbsMissingPlayer = await loadPopup({ url: "https://www.pbs.org/", siteRules: { "www.pbs.org": { enabled: true } }, playerGranted: false });
  const allowPlayer = pbsMissingPlayer.document.querySelector(".player-permission-button");
  assert.ok(allowPlayer, "enabled PBS explains a missing player-origin permission");
  allowPlayer.click(); await wait(10);
  assert.deepEqual(pbsMissingPlayer.requestedOrigins[0], ["https://player.pbs.org/*"], "player permission button requests only the player origin");
  assert.deepEqual(pbsMissingPlayer.registeredScripts.map(script => script.matches[0]), ["https://player.pbs.org/*"], "player permission registers the player-frame script");
  pbsMissingPlayer.window.close();
  const laterPopup = await loadPopup({ watchLater: { "https://www.youtube.com/watch?v=popupwatch1": { title: "Later", thumb: "", site: "youtube.com", url: "https://www.youtube.com/watch?v=popupwatch1", ts: 1 } } });
  assert.match(laterPopup.document.querySelector("#added-summary").textContent, /1 added video/, "popup counts a Watch Later video");
  assert.equal(laterPopup.document.querySelector("#open-added-button").disabled, false, "Watch Later alone enables Added Videos");
  laterPopup.window.close();
  const channelsPopup = await loadPopup({ addedItems: { "https://www.youtube.com/@creator": { title: "Creator", thumb: "", kind: "channel", site: "youtube.com", ts: 1 } } });
  assert.match(channelsPopup.document.querySelector("#added-summary").textContent, /No added videos/, "popup counts videos only, not channels");
  assert.equal(channelsPopup.document.querySelector("#open-added-button").disabled, false, "channels alone enable Added Videos");
  channelsPopup.window.close();
  const findPopup = await loadPopup({ url: "https://play.xumo.com/free-movies/", siteRules: { "play.xumo.com": { enabled: true } },
    statusRows: [{ title: "Drama", kind: "genre", listed: true }], findDelay: 25, findReply: { ok: true, rowsHere: 1, rows: ["Drama", "Horror"], pages: 2, read: 2, blocked: 0, empty: 0, skipped: 0 } });
  findPopup.document.querySelector(".filter-launch").click(); await wait(15); findPopup.document.querySelector(".genres-row").click(); await wait(8);
  const findButton = findPopup.document.querySelector(".genres-find"); findButton.click(); findPopup.progress({ type: "hoa-rows-progress", done: 1, total: 2 });
  assert.equal(findButton.disabled, true, "Find all rows stays disabled while it runs");
  assert.match(findPopup.document.querySelector(".genres-live-note").textContent, /Reading genre pages: 1 of 2/, "genre-page progress is shown while reading"); await wait(30);
  assert.equal(findButton.disabled, false, "Find all rows re-enables after its reply");
  assert.match(findPopup.document.querySelector(".genres-live-note").textContent, /Found 1 row on this page and 2 genre pages/, "Find all rows reports successful page reads");
  assert.ok(Array.from(findPopup.document.querySelectorAll(".genre-check")).some(node => /Horror/.test(node.textContent)), "Find all rows refreshes the discovered list");
  findPopup.window.close();
  const noReply = await loadPopup({ url: "https://play.xumo.com/free-movies/", siteRules: { "play.xumo.com": { enabled: true } }, statusRows: [{ title: "Drama", kind: "genre", listed: true }], noFindReply: true });
  noReply.document.querySelector(".filter-launch").click(); await wait(15); noReply.document.querySelector(".genres-row").click(); await wait(8); noReply.document.querySelector(".genres-find").click(); await wait(5);
  assert.match(noReply.document.querySelector(".genres-live-note").textContent, /didn't answer/, "Find all rows explains a missing page reply");
  noReply.window.close();
  for (const [reason, expected] of [["no-cards", /No videos found on this page/], ["busy", /Still finding rows/]]) {
    const replyPopup = await loadPopup({ url: "https://play.xumo.com/free-movies/", siteRules: { "play.xumo.com": { enabled: true } }, statusRows: [{ title: "Drama", kind: "genre", listed: true }], findReply: { ok: false, reason } });
    replyPopup.document.querySelector(".filter-launch").click(); await wait(15); replyPopup.document.querySelector(".genres-row").click(); await wait(8); replyPopup.document.querySelector(".genres-find").click(); await wait(5);
    assert.match(replyPopup.document.querySelector(".genres-live-note").textContent, expected, `Find all rows explains ${reason}`);
    replyPopup.window.close();
  }
  const mixedPopup = await loadPopup({ addedItems: {
    "https://www.youtube.com/watch?v=popupvid001": { title: "Video", thumb: "", site: "youtube.com", ts: 1 },
    "https://rumble.com/c/creator": { title: "Creator", thumb: "", kind: "channel", site: "rumble.com", ts: 2 }
  } });
  assert.match(mixedPopup.document.querySelector("#added-summary").textContent, /^There is 1 added video and 1\swebsite\.$/, "popup video-site summary excludes a channel-only site");
  mixedPopup.window.close();
  const categoriesPopup = await loadPopup({ addedItems: { "https://www.twitch.tv/directory/category/just-chatting": { title: "Just Chatting", thumb: "", kind: "category", site: "twitch.tv", ts: 1 } } });
  assert.match(categoriesPopup.document.querySelector("#added-summary").textContent, /^There is 1 added video and 1\swebsite\.$/, "popup counts a category and its site");
  assert.equal(categoriesPopup.document.querySelector("#open-added-button").disabled, false, "categories alone enable Added Videos");
  categoriesPopup.window.close();
  console.log("popup.test.js: 54 passed, 0 failed");
})().catch(error => { console.error(error); process.exitCode = 1; });
