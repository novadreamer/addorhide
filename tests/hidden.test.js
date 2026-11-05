const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
let JSDOM;
try { JSDOM = require(process.env.JSDOM_PATH || "jsdom").JSDOM; } catch (error) { console.log("hidden.test.js: SKIPPED (jsdom not installed; set JSDOM_PATH to run it)"); process.exit(0); }
const root = path.join(__dirname, ".."); const read = file => fs.readFileSync(path.join(root, file), "utf8"); const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function load({ hiddenItems = {}, hiddenChannels = {}, watchProgress = {}, breakSite = "" } = {}) {
  const dom = new JSDOM(read("hidden.html"), { url: "https://extension.test/hidden.html", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom; const store = { hiddenItems, hiddenChannels, watchedShown: {}, watchProgress, hiddenViewPrefs: {} }; const listeners = []; const clone = value => JSON.parse(JSON.stringify(value));
  window.scrollTo = () => {}; window.chrome = { runtime: { getURL: value => value, lastError: null }, tabs: { create() {} }, windows: { getCurrent(callback) { callback({}); } }, storage: { local: {
    get(defaults, callback) { const result = {}; Object.keys(defaults).forEach(key => { result[key] = key in store ? clone(store[key]) : defaults[key]; }); setTimeout(() => callback(result), 0); },
    set(values, callback) { Object.entries(values).forEach(([key, value]) => { store[key] = clone(value); }); setTimeout(() => { listeners.forEach(listener => listener({}, "local")); if (callback) callback(); }, 0); }
  }, onChanged: { addListener: listener => listeners.push(listener) } } };
  if (breakSite) {
    const append = window.Element.prototype.appendChild;
    let broke = false;
    window.console.error = () => {};
    window.Element.prototype.appendChild = function(node) {
      if (!broke && this.classList && this.classList.contains("hidden-groups") && node && node.dataset && node.dataset.site === breakSite) { broke = true; throw new Error("synthetic group failure"); }
      return append.call(this, node);
    };
  }
  window.eval(`${read("shared.js")}\n;${read("hidden.js")}`); await wait(30); return { window, document: window.document };
}
(async () => {
  let passed = 0; const check = (name, fn) => { try { fn(); passed += 1; } catch (error) { console.error(`FAILED: ${name}`); throw error; } };
  const onlyChannel = await load({ hiddenChannels: { "youtube.com|/@one": { site: "youtube.com", name: "One", url: "https://www.youtube.com/@one", ts: 1 } } });
  check("channel-only lists render a channel-only summary and group", () => { assert.equal(onlyChannel.document.querySelector(".hidden-header-copy .muted").textContent, "1 hidden channel"); assert.ok(onlyChannel.document.querySelector(".channels-group")); }); onlyChannel.window.close();
  const regularKey = "https://tubitv.com/movies/regular";
  const channelAndVideos = await load({ hiddenItems: { [regularKey]: { title: "Regular", thumb: "", site: "tubitv.com", listed: true, ts: 1 }, "https://tubitv.com/movies/second": { title: "Second", thumb: "", site: "tubitv.com", listed: true, ts: 2 } }, hiddenChannels: { "youtube.com|/@one": { site: "youtube.com", name: "One", url: "https://www.youtube.com/@one", ts: 1 } } });
  check("video and channel totals both appear in the header", () => assert.equal(channelAndVideos.document.querySelector(".hidden-header-copy .muted").textContent, "2 hidden videos on 1 website · 1 hidden channel")); channelAndVideos.window.close();
  const key = "https://www.youtube.com/watch?v=abc123def45";
  const watched = await load({ hiddenItems: { [key]: { title: "One", thumb: "", site: "youtube.com", reason: "watched", listed: true, ts: 1 } } });
  check("watched hidden videos render their own group", () => assert.ok(watched.document.querySelector(".site-group[data-site='watched-videos']"))); watched.window.close();
  const resilient = await load({ hiddenItems: {
    "https://tubitv.com/movies/broken": { title: "Broken", thumb: "", site: "tubitv.com", listed: true, ts: 1 },
    "https://www.youtube.com/watch?v=stillthere1": { title: "Still there", thumb: "", site: "youtube.com", listed: true, ts: 2 }
  }, breakSite: "tubitv.com" });
  check("one failing site group does not blank later groups", () => assert.match(resilient.document.querySelector(".hidden-groups").textContent, /Still there/)); resilient.window.close();
  console.log(`hidden.test.js: ${passed} passed, 0 failed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
