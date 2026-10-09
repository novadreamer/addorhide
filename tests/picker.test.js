"use strict";

const assert = require("node:assert/strict");
const picker = require("../picker.js");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
}

check("stable class", () => assert.equal(picker.isStableClass("video-card"), true));
check("underscore class", () => assert.equal(picker.isStableClass("_tile"), true));
check("one-letter class rejected", () => assert.equal(picker.isStableClass("a"), false));
check("number suffix class", () => assert.equal(picker.isStableClass("card-12"), true));
check("long numeric class rejected", () => assert.equal(picker.isStableClass("card123456"), false));
check("css generated class rejected", () => assert.equal(picker.isStableClass("css-abc"), false));
check("jsx generated class rejected", () => assert.equal(picker.isStableClass("jsx-card"), false));
check("state class rejected", () => assert.equal(picker.isStableClass("card-active"), false));
check("sc generated class rejected", () => assert.equal(picker.isStableClass("sc-card"), false));
check("styled-components hash rejected", () => assert.equal(picker.isStableClass("Layout-sc-1xcs6mc-0"), false));
check("short hash suffix rejected", () => assert.equal(picker.isStableClass("Card-a1b2c3"), false));
check("emotion generated class rejected", () => assert.equal(picker.isStableClass("emotion-card"), false));
check("hash class rejected", () => assert.equal(picker.isStableClass("hashAbcdef"), false));
check("loading class rejected", () => assert.equal(picker.isStableClass("loading-card"), false));
check("candidate selector", () => assert.equal(picker.describeCandidate("DIV", ["video-card", "card123456", "selected"], [
  { name: "data-testid", value: "video-1" },
  { name: "title", value: "ignored" }
]), "div.video-card[data-testid=\"video-1\"]"));
check("own hoa- classes are never learned", () => assert.equal(picker.isStableClass("hoa-host"), false));
check("css-module class keeps its readable tail", () => assert.equal(
  picker.stableClassFragment("VideoCard-module-scss-module__Ab12Cd__video_summary_card"), "__video_summary_card"));
check("hash-only class has no fragment", () => assert.equal(picker.stableClassFragment("sc-a28b235a-0"), ""));
check("plain class has no fragment", () => assert.equal(picker.stableClassFragment("card"), ""));

console.log(`picker.test.js: ${passed} passed, 0 failed`);
