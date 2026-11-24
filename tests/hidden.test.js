const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
let JSDOM;
try { JSDOM = require(process.env.JSDOM_PATH || "jsdom").JSDOM; } catch (error) { console.log("hidden.test.js: SKIPPED (jsdom not installed; set JSDOM_PATH to run it)"); process.exit(0); }
const root = path.join(__dirname, ".."); const read = file => fs.readFileSync(path.join(root, file), "utf8"); const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function load({ hiddenItems = {}, hiddenChannels = {}, watchProgress = {}, hiddenViewPrefs = {}, siteRules = {}, breakSite = "", incognito = false, hash = "" } = {}) {
  const dom = new JSDOM(read("hidden.html"), { url: "https://extension.test/hidden.html" + hash, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom; const store = { hiddenItems, hiddenChannels, watchedShown: {}, watchProgress, hiddenViewPrefs, siteRules }; const listeners = []; const clone = value => JSON.parse(JSON.stringify(value));
  window.scrollTo = () => {}; window.chrome = { extension: { inIncognitoContext: incognito }, runtime: { getURL: value => value, lastError: null }, tabs: { create() {} }, windows: { getCurrent(callback) { callback({}); } }, storage: { local: {
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
  window.eval(`${read("shared.js")}\n;${read("lock.js")}\n;${read("hidden.js")}`); await wait(60); return { window, document: window.document, store };
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
  check("watched hidden videos render their own group", () => assert.ok(watched.document.querySelector(".site-group[data-site='watched-videos']")));
  check("Watched Videos is the first hidden section", () => assert.equal(watched.document.querySelectorAll(".site-group")[0].dataset.site, "watched-videos"));
  watched.document.querySelector("#hidden-restore-watched-watched").click(); await wait(15);
  check("Watched Videos still restores every watched entry", () => assert.equal(watched.store.hiddenItems[key], undefined)); watched.window.close();
  const watchedOn = { "www.youtube.com": { enabled: true, hideKinds: ["watched"] } };
  const progress = (title, position = 590) => ({ site: "youtube.com", title, url: "", thumbnail: "", duration: 600, position, buckets: "0000000000000000000000000", watched: true, ts: 1, updated: 2 });
  const seenOne = "https://www.youtube.com/watch?v=aaaaaaaaaaa"; const seenTwo = "https://www.youtube.com/watch?v=bbbbbbbbbbb"; const siteVideo = "https://tubitv.com/movies/only";
  const mixed = await load({ hiddenItems: { [siteVideo]: { title: "Only", thumb: "", site: "tubitv.com", listed: true, ts: 1 } }, watchProgress: { [seenOne]: progress("Seen one"), [seenTwo]: progress("Seen two") }, siteRules: watchedOn });
  const watchedRows = page => page.document.querySelectorAll(".site-group[data-site='watched-videos'] [id^='hidden-restore-']:not(.group-restore-all)").length;
  check("watched-only videos are listed", () => assert.equal(watchedRows(mixed), 2));
  check("the header counts them", () => assert.match(mixed.document.querySelector(".hidden-header-copy .muted").textContent, /^3 hidden videos/));
  mixed.document.querySelector(".site-group[data-site='tubitv.com'] [id^='hidden-restore-']:not(.group-restore-all)").click(); await wait(20);
  check("restoring the last site video leaves Watched Videos in place", () => assert.equal(watchedRows(mixed), 2));
  mixed.document.querySelector(".site-group[data-site='watched-videos'] [id^='hidden-restore-']:not(.group-restore-all)").click(); await wait(20);
  check("restoring a watched-only video takes it off the list and back to the feed", () => { assert.equal(watchedRows(mixed), 1); assert.equal(Object.keys(mixed.store.watchedShown).length, 1); });
  mixed.document.querySelector(".site-group[data-site='watched-videos'] [id^='hidden-remove-']:not(.site-remove-all)").click(); await wait(30);
  check("removing a watched-only video keeps it off the list", () => { assert.equal(mixed.document.querySelector(".site-group[data-site='watched-videos']"), null); assert.equal(Object.values(mixed.store.watchProgress).filter(entry => entry.unlisted).length, 1); });
  check("watched history survives removing it from the list", () => assert.equal(Object.values(mixed.store.watchProgress).filter(entry => entry.watched).length, 2));
  mixed.window.close();
  const ordered = await load({ hiddenItems: { "https://tubitv.com/movies/2/older": { title: "Older record", thumb: "", site: "tubitv.com", reason: "watched", listed: true, ts: 100 } }, watchProgress: { [seenOne]: { ...progress("Just watched"), updated: 900 } }, siteRules: watchedOn });
  check("Watched Videos is newest first, so a video listed from its watch history is not left at the bottom", () => assert.deepEqual([...ordered.document.querySelectorAll(".site-group[data-site='watched-videos'] .hidden-title")].map(node => node.textContent), ["Just watched", "Older record"]));
  ordered.window.close();
  const handHidden = await load({ hiddenItems: { [seenOne]: { title: "By hand", thumb: "", site: "youtube.com", listed: true, ts: 1 } }, watchProgress: { [seenOne]: progress("By hand") }, siteRules: watchedOn });
  check("a video hidden by hand and watched later is in Watched Videos", () => { assert.equal(watchedRows(handHidden), 1); assert.equal(handHidden.document.querySelector(".site-group[data-site='youtube.com']"), null); });
  handHidden.document.querySelector(".site-group[data-site='watched-videos'] [id^='hidden-restore-']:not(.group-restore-all)").click(); await wait(25);
  check("restoring it keeps Watched from hiding it again", () => { assert.equal(handHidden.store.hiddenItems[seenOne], undefined); assert.ok(handHidden.store.watchedShown[seenOne]); });
  handHidden.window.close();
  const barOnly = "https://www.youtube.com/watch?v=redbaronly1"; const barRecord = { title: "Red bar", thumb: "", site: "youtube.com", reason: "watched", listed: true, ts: 7 };
  const cycle = await load({ hiddenItems: { [barOnly]: barRecord, [seenOne]: { ...barRecord, title: "Tracked" }, [seenTwo]: { title: "Off list", thumb: "", site: "youtube.com", listed: false, ts: 3 } }, watchProgress: { [seenOne]: progress("Tracked"), [seenTwo]: progress("Off list") }, siteRules: watchedOn });
  const reset = on => { cycle.window.eval(`${read("shared.js")}\n;HOA.resetWatched("www.youtube.com", ${!on});`); return wait(30); };
  await reset(false);
  check("off: a red-bar-only video waits, and a tracked one needs no waiting", () => { assert.equal(cycle.store.hiddenItems[barOnly], undefined); assert.equal(cycle.store.hiddenItems[seenOne], undefined); assert.ok(cycle.store.watchedParked[barOnly]); assert.equal(cycle.store.watchedParked[seenOne], undefined); assert.equal(cycle.store.hiddenItems[seenTwo].listed, false); });
  await reset(true);
  check("on: the red-bar-only video is back on the list without its card on screen", () => { assert.equal(cycle.store.hiddenItems[barOnly].listed, true); assert.deepEqual(cycle.store.watchedParked, {}); });
  check("on: a watched video taken off the list earlier is listed again", () => assert.equal(cycle.store.hiddenItems[seenTwo].listed, true));
  await reset(false); await reset(true);
  check("the cycle repeats: it is back every time", () => assert.equal(cycle.store.hiddenItems[barOnly].listed, true));
  cycle.window.close();
  const off = await load({ watchProgress: { [seenOne]: progress("Seen one") }, siteRules: { "www.youtube.com": { enabled: true, hideKinds: [] } } });
  check("with Watched off a watched video stays in the feed, so it is not listed", () => { assert.equal(off.document.querySelector(".site-group[data-site='watched-videos']"), null); });
  off.window.close();
  const toggled = await load({ watchProgress: { [seenOne]: progress("Seen one"), [seenTwo]: { ...progress("Seen two"), unlisted: true }, "https://tubitv.com/movies/1/x": { ...progress("Tubi"), site: "tubitv.com", unlisted: true } }, siteRules: watchedOn });
  toggled.store.watchedShown = { [seenOne]: 5, "https://tubitv.com/movies/1/x": 5 };
  toggled.window.eval(`${read("shared.js")}
;HOA.resetWatched("www.youtube.com", false);`); await wait(30);
  check("turning Watched on or off clears that site's restores and removals", () => {
    assert.deepEqual(Object.keys(toggled.store.watchedShown), ["https://tubitv.com/movies/1/x"]);
    assert.equal(toggled.store.watchProgress[seenTwo].unlisted, undefined);
    assert.equal(toggled.store.watchProgress["https://tubitv.com/movies/1/x"].unlisted, true);
    assert.equal(toggled.store.watchProgress[seenTwo].watched, true);
  });
  toggled.window.close();
  const autoHidden = await load({ hiddenItems: { [seenOne]: { title: "Auto", thumb: "", site: "youtube.com", reason: "watched", listed: true, ts: 1 } }, watchProgress: { [seenOne]: progress("Auto") }, siteRules: watchedOn });
  autoHidden.document.querySelector(".site-group[data-site='watched-videos'] [id^='hidden-remove-']:not(.site-remove-all)").click(); await wait(25);
  check("a removed auto-hidden video does not come back through its progress", () => { assert.equal(autoHidden.document.querySelector(".site-group[data-site='watched-videos']"), null); assert.equal(autoHidden.store.hiddenItems[seenOne].listed, false); });
  autoHidden.window.close();
  const resilient = await load({ hiddenItems: {
    "https://tubitv.com/movies/broken": { title: "Broken", thumb: "", site: "tubitv.com", listed: true, ts: 1 },
    "https://www.youtube.com/watch?v=stillthere1": { title: "Still there", thumb: "", site: "youtube.com", listed: true, ts: 2 }
  }, breakSite: "tubitv.com" });
  check("one failing site group does not blank later groups", () => assert.match(resilient.document.querySelector(".hidden-groups").textContent, /Still there/)); resilient.window.close();
  const sorted = await load({ hiddenItems: {
    "https://www.youtube.com/watch?v=sortone0001": { title: "Zulu", thumb: "", site: "youtube.com", channel: "Beta", listed: true, ts: 1 },
    "https://www.youtube.com/watch?v=sorttwo0002": { title: "Alpha", thumb: "", site: "youtube.com", channel: "Alpha", listed: true, ts: 2 }
  } });
  const site = () => sorted.document.querySelector(".site-group[data-site='youtube.com']");
  const titles = () => Array.from(site().querySelectorAll(".hidden-title")).map(node => node.textContent);
  check("Hidden defaults to newest hidden first", () => assert.deepEqual(titles(), ["Alpha", "Zulu"]));
  const sortSelect = site().querySelector("select[id^='hidden-sort']"); sortSelect.value = "title"; sortSelect.dispatchEvent(new sorted.window.Event("change", { bubbles: true })); await wait(15);
  check("Hidden sort changes row order and persists", () => { assert.deepEqual(titles(), ["Alpha", "Zulu"]); assert.equal(sorted.store.hiddenViewPrefs["youtube.com"].sort, "title"); });
  const direction = site().querySelector(".direction-button"); direction.click(); await wait(15);
  check("Hidden direction flips row order", () => assert.deepEqual(titles(), ["Zulu", "Alpha"]));
  sorted.window.close();
  const oldPrefs = await load({ hiddenViewPrefs: { "youtube.com": { collapsed: false, sort: "title", dir: "asc", group: "channel" } }, hiddenItems: {
    "https://www.youtube.com/watch?v=oldone00001": { title: "Zulu", thumb: "", site: "youtube.com", channel: "Beta", listed: true, ts: 1 },
    "https://www.youtube.com/watch?v=oldtwo00002": { title: "Alpha", thumb: "", site: "youtube.com", channel: "Alpha", listed: true, ts: 2 }
  } });
  check("Hidden keeps old preference objects while adding view settings", () => assert.equal(oldPrefs.document.querySelectorAll(".subgroup-heading").length, 2)); oldPrefs.window.close();
  const oldCollapsed = await load({ hiddenViewPrefs: { "youtube.com": { collapsed: true } }, hiddenItems: {
    "https://www.youtube.com/watch?v=closed00001": { title: "Closed", thumb: "", site: "youtube.com", listed: true, ts: 1 }
  } });
  check("Hidden reads legacy collapsed-only preferences", () => assert.equal(oldCollapsed.document.querySelector(".site-group-body"), null)); oldCollapsed.window.close();
  const restoreSite = await load({ hiddenItems: {
    "https://www.youtube.com/watch?v=restore0001": { title: "One", thumb: "", site: "youtube.com", listed: true, ts: 1 },
    "https://tubitv.com/movies/restore2": { title: "Two", thumb: "", site: "tubitv.com", listed: true, ts: 2 }
  }, hiddenChannels: { "youtube.com|/@one": { site: "youtube.com", name: "One", ts: 1 } } });
  restoreSite.document.querySelector("#hidden-restore-youtube-com-1").click(); await wait(15);
  check("Show all on a site restores only that site", () => { assert.equal(restoreSite.store.hiddenItems["https://www.youtube.com/watch?v=restore0001"], undefined); assert.ok(restoreSite.store.hiddenItems["https://tubitv.com/movies/restore2"]); });
  restoreSite.document.querySelector("#hidden-restore-channels").click(); await wait(15);
  check("Show all channels empties the channel list", () => assert.deepEqual(restoreSite.store.hiddenChannels, {})); restoreSite.window.close();
  const useful = await load({ hiddenItems: { "https://tubitv.com/movies/only": { title: "Only", thumb: "", site: "tubitv.com", listed: true, ts: 1 } } });
  check("Hidden offers a type grouping when the lone entry has a non-video type", () => assert.ok(useful.document.querySelector("select[id^='hidden-group']"))); useful.window.close();
  const pageTabs = await load({ hiddenItems: {
    "https://tubitv.com/movies/page-one": { title: "One", thumb: "", site: "tubitv.com", listed: true, ts: 1 },
    "https://www.youtube.com/watch?v=abcdefghijk": { title: "Two", thumb: "", site: "youtube.com", listed: true, ts: 2 },
    "https://www.youtube.com/watch?v=zyxwvutsrqp": { title: "Watched", thumb: "", site: "youtube.com", reason: "watched", listed: true, ts: 3 }
  }, hiddenViewPrefs: { __page: { grouping: "tabs", sort: "recent", dir: "asc", selectedTab: "missing" } } });
  const privateTabs = await load({ incognito: true, hiddenItems: {
    "https://tubitv.com/movies/page-one": { title: "One", thumb: "", site: "tubitv.com", listed: true, ts: 1 },
    "https://www.youtube.com/watch?v=abcdefghijk": { title: "Two", thumb: "", site: "youtube.com", listed: true, ts: 2 },
    "https://www.youtube.com/watch?v=zyxwvutsrqp": { title: "Watched", thumb: "", site: "youtube.com", reason: "watched", listed: true, ts: 3 }
  }, hiddenViewPrefs: { __page: { grouping: "tabs" } } });
  check("Hidden has no Watched tab or count in a private window", () => {
    const names = Array.from(privateTabs.document.querySelectorAll("[role='tab']")).map(tab => tab.textContent);
    assert.ok(names.length >= 2 && !names.some(name => /Watched/.test(name)), names.join(" | "));
    assert.match(privateTabs.document.querySelector(".hidden-header .count-badge").textContent, /^2$/);
  });
  privateTabs.window.close();
  const privateHash = await load({ hash: "#private", hiddenItems: {
    "https://tubitv.com/movies/page-one": { title: "One", thumb: "", site: "tubitv.com", listed: true, ts: 1 },
    "https://www.youtube.com/watch?v=zyxwvutsrqp": { title: "Watched", thumb: "", site: "youtube.com", reason: "watched", listed: true, ts: 3 }
  } });
  check("Hidden opened from a private window (#private) leaves out watched videos", () => {
    assert.doesNotMatch(privateHash.document.body.textContent, /Watched Videos/);
    assert.match(privateHash.document.querySelector(".hidden-header .count-badge").textContent, /^1$/);
  });
  privateHash.window.close();
  check("Hidden keeps valid page preferences", () => {
    assert.equal(pageTabs.document.querySelector("#hidden-page-grouping").value, "tabs");
    assert.equal(pageTabs.document.querySelector("#hidden-page-sort").value, "recent");
    assert.equal(pageTabs.document.querySelector("#hidden-page-direction").textContent, "↑");
  });
  check("Hidden tabs render a tablist with Watched first", () => {
    const tabs = pageTabs.document.querySelectorAll("[role='tablist'] [role='tab']");
    assert.ok(pageTabs.document.querySelector("[role='tablist']"));
    assert.match(tabs[0].textContent, /Watched Videos/);
    assert.equal(tabs[0].getAttribute("aria-selected"), "true");
  });
  pageTabs.window.close();
  const watchedBySite = await load({ hiddenItems: {
    "https://www.youtube.com/watch?v=aaaaaaaaaaa": { title: "YouTube one", thumb: "", site: "youtube.com", reason: "watched", listed: true, ts: 10 },
    "https://www.youtube.com/watch?v=bbbbbbbbbbb": { title: "YouTube two", thumb: "", site: "youtube.com", reason: "watched", listed: true, ts: 9 },
    "https://www.dailymotion.com/video/xbd3ori": { title: "Daily one", thumb: "", reason: "watched", listed: true, ts: 8 }
  }, hiddenViewPrefs: { "watched-videos": { group: "site", sort: "site-count" } } });
  const watchedSort = watchedBySite.document.querySelector("[data-site='watched-videos'] select[id^='hidden-sort']");
  check("Watched grouped by site offers Videos per site", () => assert.ok(Array.from(watchedSort.options).some(option => option.value === "site-count")));
  watchedSort.value = "site-count"; watchedSort.dispatchEvent(new watchedBySite.window.Event("change", { bubbles: true })); await wait(20);
  check("Watched Videos per site orders groups by size", () => assert.deepEqual(Array.from(watchedBySite.document.querySelectorAll("[data-site='watched-videos'] .subgroup-heading")).map(node => node.textContent.slice(1).replace(/\d+$/, "").trim()), ["YouTube", "Dailymotion"]));
  const watchedGroup = watchedBySite.document.querySelector("[data-site='watched-videos'] select[id^='hidden-group']");
  watchedGroup.value = "none"; watchedGroup.dispatchEvent(new watchedBySite.window.Event("change", { bubbles: true })); await wait(20);
  const ungroupedSort = watchedBySite.document.querySelector("[data-site='watched-videos'] select[id^='hidden-sort']");
  check("Videos per site disappears when Watched is not grouped by site", () => assert.ok(!ungroupedSort || !Array.from(ungroupedSort.options).some(option => option.value === "site-count")));
  watchedBySite.window.close();

  const countPage = await load({ hiddenItems: {
    "https://tubitv.com/movies/pagecountone": { title: "Tubi", thumb: "", site: "tubitv.com", listed: true, ts: 1 },
    "https://www.youtube.com/watch?v=abcdefghijk": { title: "YouTube one", thumb: "", site: "youtube.com", listed: true, ts: 2 },
    "https://www.youtube.com/watch?v=zyxwvutsrqp": { title: "YouTube two", thumb: "", site: "youtube.com", listed: true, ts: 3 },
    "https://www.youtube.com/watch?v=bbbbbbbbbbb": { title: "YouTube three", thumb: "", site: "youtube.com", listed: true, ts: 4 }
  }, hiddenViewPrefs: { __page: { sort: "count" } } });
  check("hidden page Most videos orders site sections by size", () => assert.deepEqual(Array.from(countPage.document.querySelectorAll(".site-group")).map(section => section.dataset.site), ["youtube.com", "tubitv.com"]));
  check("hidden page count direction is named", () => assert.equal(countPage.document.querySelector("#hidden-page-direction").title, "Most videos: descending"));
  countPage.window.close();
  console.log(`hidden.test.js: ${passed} passed, 0 failed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
