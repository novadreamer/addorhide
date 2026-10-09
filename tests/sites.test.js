"use strict";

const assert = require("node:assert/strict");
const SITES = require("../sites.js");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
}

[
  ["example.com", true], ["Sub.Example.co.uk", true], ["xn--bcher-kva.example", true],
  ["", false], ["bad host.com", false], ["*.example.com", false], ["example.com:443", false],
  ["-example.com", false]
].forEach(([value, expected]) => check(`validHostname ${value}`, () => assert.equal(SITES.validHostname(value), expected)));

[
  ["https://example.com/videos", true], ["http://localhost:8080/watch", true],
  ["chrome://settings", false], ["brave://settings", false], ["edge://settings", false],
  ["about:blank", false], ["file:///tmp/video.html", false], ["chrome-extension://abc/page.html", false],
  ["view-source:https://example.com", false], ["devtools://devtools/bundled/inspector.html", false],
  ["https://chromewebstore.google.com/detail/example", false],
  ["https://chrome.google.com/webstore/category/extensions", false],
  ["https://chrome.google.com/docs", true], ["https://addons.mozilla.org/en-US/firefox/", false]
].forEach(([value, expected]) => check(`supported URL ${value}`, () => assert.equal(SITES.isSupportedPageUrl(value), expected)));

[
  ["youtube.com", true], ["www.youtube.com", true], ["video.youtube.com", true],
  ["evilyoutube.com", false], ["youtube.com.evil.com", false], ["tubitv.com", true],
  ["www.tubitv.com", true], ["evil-tubitv.com", false], ["tubitv.com.evil.com", false]
].forEach(([value, expected]) => check(`built-in ${value}`, () => assert.equal(SITES.isBuiltIn(value), expected)));

[
  ["imdb.com", true], ["www.imdb.com", true], ["themoviedb.org", true], ["www.twitch.tv", true],
  ["dailymotion.com", true], ["youtube.com", false], ["tubitv.com", false], ["evilimdb.com", false]
].forEach(([value, expected]) => check(`catalog ${value}`, () => assert.equal(SITES.isCatalog(value), expected)));

[
  ["imdb.com", false], ["themoviedb.org", false], ["twitch.tv", false], ["dailymotion.com", false]
].forEach(([value, expected]) => check(`new site is not built-in ${value}`, () => assert.equal(SITES.isBuiltIn(value), expected)));

check("match pattern defaults to explicit https", () => assert.equal(SITES.matchPattern("example.com"), "https://example.com/*"));
check("match pattern for an http tab", () => assert.equal(SITES.matchPattern("example.com", "http"), "http://example.com/*"));
check("unknown scheme falls back to https", () => assert.equal(SITES.matchPattern("example.com", "ftp"), "https://example.com/*"));
check("schemeOfRule", () => {
  assert.equal(SITES.schemeOfRule({ scheme: "http" }), "http");
  assert.equal(SITES.schemeOfRule({ scheme: "https" }), "https");
  assert.equal(SITES.schemeOfRule({}), "https");
  assert.equal(SITES.schemeOfRule(null), "https");
});
// Regression: chrome.permissions.request rejected "*://host/*" with "Only permissions specified in the manifest may
// be requested", because the manifest declares optional_host_permissions as separate https:// and http:// patterns.
// Every pattern the extension can request must therefore be covered by one declared pattern with the SAME scheme.
check("requested patterns are covered by the manifest's optional_host_permissions", () => {
  const manifest = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "manifest.json"), "utf8"));
  const declared = manifest.optional_host_permissions;
  ["https", "http"].forEach(scheme => {
    ["www.imdb.com", "www.twitch.tv", "www.dailymotion.com", "example.org"].forEach(host => {
      const pattern = SITES.matchPattern(host, scheme);
      assert.ok(!pattern.startsWith("*"), "scheme must be explicit: " + pattern);
      assert.ok(declared.includes(`${scheme}://*/*`), `${pattern} needs ${scheme}://*/* declared`);
    });
  });
});
check("script id", () => assert.equal(SITES.scriptId("example.com"), "hoa-site-example.com"));
check("host from pattern", () => assert.equal(SITES.hostFromPattern("*://example.com/*"), "example.com"));
check("host from https pattern", () => assert.equal(SITES.hostFromPattern("https://www.imdb.com/*"), "www.imdb.com"));
check("host from http pattern", () => assert.equal(SITES.hostFromPattern("http://example.com/*"), "example.com"));
check("ftp pattern rejected", () => assert.equal(SITES.hostFromPattern("ftp://example.com/*"), null));
check("wildcard host rejected", () => assert.equal(SITES.hostFromPattern("*://*.example.com/*"), null));
check("pattern without path rejected", () => assert.equal(SITES.hostFromPattern("*://example.com"), null));
check("YouTube host from pattern", () => assert.equal(SITES.hostFromPattern("*://youtube.com/*"), "youtube.com"));

console.log(`sites.test.js: ${passed} passed, 0 failed`);
