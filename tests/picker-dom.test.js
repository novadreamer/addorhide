"use strict";

const assert = require("node:assert/strict");
let JSDOM;
try { JSDOM = require(process.env.JSDOM_PATH || "jsdom").JSDOM; }
catch (error) { console.log("picker-dom.test.js: SKIPPED (jsdom not installed; set JSDOM_PATH to run it)"); process.exit(0); }

const fs = require("node:fs");
const html = Array.from({ length: 400 }, (_, index) => `<li class="card"><a href="/title/${index}"><img alt="Card ${index}"></a></li>`).join("");
const dom = new JSDOM(`<div class="cardList">${html}</div>`, { url: "https://play.xumo.com/free-movies/", runScripts: "outside-only" });
const { window } = dom;
window.__hoaPickerTest = {};
window.eval(fs.readFileSync(require("node:path").join(__dirname, "..", "picker.js"), "utf8"));
const image = window.document.querySelector("img");
const selector = window.__hoaPickerTest.buildSelector(image);
assert.ok(selector, "a selector was built");
assert.equal(window.document.querySelectorAll(selector).length, 400);
assert.ok(window.document.querySelector(selector).matches("li.card"), selector);
assert.ok(!/cardList/.test(selector), selector);
window.close();
const pickerDom = new JSDOM('<div class="player"><video></video><a href="/c/creator/shorts">Creator</a></div><div class="card"><a href="/shorts/one"><img></a></div><div class="card"><a href="/shorts/two"><img></a></div>', { url: "https://rumble.com/shorts/live", runScripts: "outside-only" });
const pickerWindow = pickerDom.window;
const stored = {};
pickerWindow.chrome = { storage: { local: { get(_defaults, callback) { callback({ siteRules: stored.siteRules || {} }); }, set(values, callback) { Object.assign(stored, values); if (callback) callback(); } } }, runtime: {} };
const rect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 });
pickerWindow.document.querySelector(".player").getBoundingClientRect = rect;
pickerWindow.document.querySelector("video").getBoundingClientRect = rect;
let pointed = pickerWindow.document.querySelector("video");
pickerWindow.document.elementsFromPoint = () => [pointed];
pickerWindow.eval(["shared.js", "picker.js"].map(file => fs.readFileSync(require("node:path").join(__dirname, "..", file), "utf8")).join("\n;\n"));
pickerWindow.document.dispatchEvent(new pickerWindow.MouseEvent("click", { bubbles: true, clientX: 1, clientY: 1 }));
assert.match(pickerWindow.document.querySelector(".hoa-picker-panel").textContent, /That's a video player, not a thumbnail/, "players are refused with a helpful message");
assert.deepEqual(stored, {}, "refusing a player saves no selector");
pointed = pickerWindow.document.querySelector(".card img");
pickerWindow.document.dispatchEvent(new pickerWindow.MouseEvent("click", { bubbles: true, clientX: 1, clientY: 1 }));
assert.match(pickerWindow.document.querySelector(".hoa-picker-panel").textContent, /Found 2 similar cards/, "a thumbnail remains teachable");
pickerWindow.document.querySelector(".hoa-picker-button").click();
assert.ok(stored.siteRules && stored.siteRules["rumble.com"].pickedSelectors.length, "saving a thumbnail persists its selector");
pickerWindow.close();
console.log("picker-dom.test.js: 9 passed, 0 failed");
