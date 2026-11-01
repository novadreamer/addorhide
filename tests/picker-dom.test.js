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
console.log("picker-dom.test.js: 4 passed, 0 failed");
