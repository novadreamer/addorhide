"use strict";
// A deliberately generous regression guard. It exercises the real filtering engine with a dense synthetic feed.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
let JSDOM;
try { JSDOM = require(process.env.JSDOM_PATH || "jsdom").JSDOM; } catch (error) {
  console.log("perf.test.js: SKIPPED (jsdom not installed; set JSDOM_PATH to run it)"); process.exit(0);
}
const root = path.join(__dirname, "..");
const content = process.env.PERF_BASELINE
  ? require("node:child_process").execFileSync("git", ["show", "HEAD:content.js"], { cwd: root, encoding: "utf8" })
    .replace("  function scheduleApply() {", "  if (window.__hoaTest) window.__hoaTest.apply = apply;\n\n  function scheduleApply() {")
  : fs.readFileSync(path.join(root, "content.js"), "utf8");
const bundle = ["shared.js", "catalog.js"].map(file => fs.readFileSync(path.join(root, file), "utf8")).concat(content).join("\n;\n");
const cards = Array.from({ length: 400 }, (_, index) => `<ytd-rich-item-renderer><a href="/watch?v=${String(index).padStart(11, "x")}"><yt-thumbnail></yt-thumbnail></a><h3 id="video-title">Gaming gameplay robot ${index}</h3><ytd-channel-name><a href="/@channel${index}">Channel ${index}</a></ytd-channel-name></ytd-rich-item-renderer>`);
const shelves = Array.from({ length: 10 }, (_, index) => `<ytd-rich-shelf-renderer><h2>Gaming ${index}</h2>${cards.slice(index * 40, (index + 1) * 40).join("")}</ytd-rich-shelf-renderer>`).join("");
const dom = new JSDOM(`<!doctype html><body>${shelves}</body>`, { url: "https://www.youtube.com/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
const store = { siteRules: { "www.youtube.com": { hideKinds: ["recommended", "shorts", "playlists", "mixes", "live", "music", "gaming", "podcasts", "movies", "posts", "fundraisers", "comments"], hideKeywords: ["robot", "gaming", "video", "channel", "title", "alpha", "beta", "gamma", "delta", "epsilon"] } } };
const listeners = [];
window.__hoaTest = {};
window.chrome = { runtime: { id: "perf", getURL: value => value, getManifest: () => ({ version: "1.1.0" }) }, storage: { local: { get(defaults, cb) { cb(Object.fromEntries(Object.keys(defaults).map(key => [key, store[key] || defaults[key]]))); }, set(values, cb) { Object.assign(store, values); listeners.forEach(listener => listener({}, "local")); if (cb) cb(); } }, onChanged: { addListener: listener => listeners.push(listener) } } };
window.eval(bundle);
// Warm the selector and decision caches; the benchmark measures steady-state mutation passes.
window.__hoaTest.apply();
const start = performance.now();
for (let i = 0; i < 20; i += 1) window.__hoaTest.apply();
const perPass = (performance.now() - start) / 20;
console.log(`perf.test.js${process.env.PERF_BASELINE ? " baseline" : ""}: ${perPass.toFixed(2)} ms/pass (400 cards, 10 shelves, 20 passes)`);
// jsdom's selector engine is materially slower than Chromium's; this remains a regression guard rather than a UI SLA.
if (!process.env.PERF_BASELINE) assert.ok(perPass < 240, `expected under 240 ms/pass, got ${perPass.toFixed(2)}`);
window.close();
