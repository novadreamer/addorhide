"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const catalog = require("../catalog.js");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
}

const hostname = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const types = new Set(["video", "trailer", "short", "movie", "tv", "live", "music", "sport", "other"]);
const ids = new Set();
const hosts = new Set();
catalog.rules.forEach(rule => {
  check(`${rule.id} has a kebab-case id`, () => assert.match(rule.id, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/));
  check(`${rule.id} has a name`, () => assert.equal(typeof rule.name, "string"));
  check(`${rule.id} has card and link selectors`, () => {
    [rule.cardSelector, rule.linkSelector].forEach(selector => {
      assert.equal(typeof selector, "string");
      assert.ok(selector.length >= 1 && selector.length <= 300);
    });
  });
  check(`${rule.id} has title candidates`, () => assert.ok(Array.isArray(rule.titleCandidates)
    && rule.titleCandidates.every(candidate => typeof candidate === "string")));
  check(`${rule.id} has unique valid hosts`, () => rule.hosts.forEach(host => {
    assert.match(host, hostname);
    assert.equal(hosts.has(host), false);
    hosts.add(host);
  }));
  check(`${rule.id} is uniquely identified`, () => {
    assert.equal(ids.has(rule.id), false);
    ids.add(rule.id);
  });
  (rule.typeByText || []).forEach(([source]) => check(`${rule.id} type regex compiles`, () => {
    assert.doesNotThrow(() => new RegExp(source, "i"));
  }));
  (rule.typeByPath || []).forEach(entry => check(`${rule.id} type path is valid`, () => {
    assert.equal(Array.isArray(entry), true);
    assert.equal(typeof entry[0], "string");
    assert.equal(types.has(entry[1]), true);
  }));
  (rule.variants || []).forEach((variant, index) => check(`${rule.id} variant ${index + 1} is valid`, () => {
    assert.equal(typeof variant.cardSelector, "string");
    assert.ok(variant.cardSelector.length >= 1 && variant.cardSelector.length <= 300);
    assert.equal(typeof variant.linkSelector, "string");
    assert.ok(Array.isArray(variant.titleCandidates));
    (variant.typeByText || []).forEach(([source, type]) => {
      assert.doesNotThrow(() => new RegExp(source, "i"));
      assert.equal(types.has(type), true);
    });
  }));
});

[
  ["www.imdb.com", "imdb"], ["m.imdb.com", "imdb"], ["imdb.com", "imdb"],
  ["www.themoviedb.org", "tmdb"], ["www.twitch.tv", "twitch"],
  ["www.dailymotion.com", "dailymotion"], ["music.youtube.com", "youtube"], ["tubitv.com", "tubi"]
].forEach(([host, id]) => check(`find ${host}`, () => assert.equal(catalog.find(host).id, id)));

["evilimdb.com", "imdb.com.evil.com", "notyoutube.com", "example.com", "", null, 12].forEach(host => {
  check(`find rejects ${String(host)}`, () => assert.equal(catalog.find(host), null));
});

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
const staticHosts = new Set(manifest.content_scripts
  .filter(script => script.js && script.js.includes("content.js") && script.js.includes("catalog.js"))
  .flatMap(script => script.matches)
  .map(match => /^[a-z*]+:\/\/([^/]+)\//.exec(match)[1].replace(/^www\./, "")));
const builtInHosts = new Set(catalog.rules.filter(rule => rule.builtIn).flatMap(rule => rule.hosts));
check("built-in catalog hosts equal static content-script hosts", () => assert.deepEqual(builtInHosts, staticHosts));
check("non-built-in hosts are not static", () => catalog.rules.filter(rule => !rule.builtIn)
  .forEach(rule => rule.hosts.forEach(host => assert.equal(staticHosts.has(host), false))));

console.log(`catalog.test.js: ${passed} passed, 0 failed`);
