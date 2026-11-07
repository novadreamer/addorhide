const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let JSDOM;
try { JSDOM = require(process.env.JSDOM_PATH || "jsdom").JSDOM; } catch (error) {
  console.log("added.test.js: SKIPPED (jsdom not installed; set JSDOM_PATH to run it)"); process.exit(0);
}

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function load(initial = {}) {
  const dom = new JSDOM('<!doctype html><main id="added-root"></main>', { url: "https://extension.test/added.html", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {}; window.scrollBy = () => {};
  const key = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const keyTwo = "https://tubitv.com/movies/2";
  const defaults = { addedItems: {}, hiddenItems: {}, hiddenChannels: {}, watchedShown: {}, addedViewPrefs: {}, watchProgress: {
    [key]: { site: "youtube.com", title: "A video", url: key, thumbnail: "", duration: 600, position: 125, buckets: "0000000000000000000000000", watched: false, cw: "auto", ts: 1, updated: 2 },
    [keyTwo]: { site: "tubitv.com", title: "B video", url: keyTwo, thumbnail: "", duration: 600, position: 300, buckets: "0000000000000000000000000", watched: false, cw: "auto", ts: 1, updated: Date.now() }
  } };
  const store = { ...defaults, ...initial };
  const listeners = []; const clone = value => JSON.parse(JSON.stringify(value));
  window.confirm = () => true;
  window.chrome = { storage: { local: {
    get(defaults, callback) { const result = {}; Object.keys(defaults).forEach(name => { result[name] = name in store ? clone(store[name]) : defaults[name]; }); setTimeout(() => callback(result), 0); },
    set(values, callback) { const changes = {}; Object.entries(values).forEach(([name, value]) => { changes[name] = { oldValue: store[name], newValue: clone(value) }; store[name] = clone(value); }); setTimeout(() => { listeners.forEach(listener => listener(changes, "local")); if (callback) callback(); }, 0); }
  }, onChanged: { addListener: listener => listeners.push(listener) } }, runtime: { sendMessage() {} } };
  window.eval(`${read("shared.js")}\n;${read("added-ui.js")}\n;HOA_ADDED.mount(document.getElementById("added-root"));`);
  await wait(50); return { window, document: window.document, store, key, keyTwo };
}

(async () => {
  const page = await load(); const section = page.document.querySelector(".continue-watching");
  assert.ok(section, "Continue Watching renders before site groups");
  assert.match(section.textContent, /A video/); assert.match(section.textContent, /7:55 left.*YouTube/);
  const youtubeCard = Array.from(section.querySelectorAll(".continue-card")).find(card => /A video/.test(card.textContent));
  const progress = youtubeCard.querySelector(".continue-progress"); assert.equal(progress.style.getPropertyValue("--hoa-progress"), "20.833333333333336%");
  const link = youtubeCard.querySelector(".card-media"); assert.match(link.href, /[?&]t=120s/);
  const sort = section.querySelector("select[id^='added-sort-']");
  const group = section.querySelector("select[id^='added-group-']");
  assert.equal(sort.value, "last-watched", "Continue Watching defaults to Last watched");
  assert.ok(Array.from(group.options).some(option => option.value === "site"), "Continue Watching offers grouping by site when entries span sites");
  group.value = "site"; group.dispatchEvent(new page.window.Event("change", { bubbles: true })); await wait(30);
  assert.equal(page.store.addedViewPrefs["continue-watching"].group, "site", "Continue Watching grouping persists under its own preference key");
  const direction = page.document.querySelector("#added-direction-continue-watching"); direction.click(); await wait(30);
  assert.equal(page.store.addedViewPrefs["continue-watching"].dir, "asc", "Continue Watching reuses the sort direction control");
  const collapse = section.querySelector(".collapse-button"); collapse.click(); await wait(30);
  assert.equal(page.document.querySelector(".continue-watching .added-card-grid"), null, "section uses the normal collapse preference");
  page.document.querySelector(".continue-watching .collapse-button").click(); await wait(30);
  const clear = page.document.querySelector(".continue-watching .site-delete-all"); clear.click(); await wait(5);
  assert.ok(page.document.querySelector(".continue-watching .site-delete-all").classList.contains("armed"), "delete-all arms before deleting");
  page.document.querySelector(".continue-watching .site-delete-all").click(); await wait(30);
  assert.ok(!page.store.watchProgress[page.key].cw && !page.store.watchProgress[page.keyTwo].cw, "second delete-all click clears Continue Watching but retains progress");
  page.window.close();

  const oneSite = await load({ addedItems: {
    "https://www.youtube.com/watch?v=abcdefghijk": { site: "youtube.com", title: "One", thumb: "", ts: 1 }
  }, watchProgress: {} });
  assert.equal(oneSite.document.querySelector(".added-page-toolbar").hidden, true, "page toolbar stays hidden with one section");
  assert.equal(oneSite.document.querySelectorAll(".site-group").length, 1, "one section stays stacked");
  oneSite.window.close();

  const videos = {
    "https://www.youtube.com/watch?v=abcdefghijk": { site: "youtube.com", title: "Zebra", thumb: "", ts: 10 },
    "https://www.youtube.com/watch?v=abcdefghijl": { site: "youtube.com", title: "Alpha", thumb: "", ts: 9 },
    "https://www.dailymotion.com/video/xbd3ori": { site: "dailymotion.com", title: "Apple", thumb: "", ts: 20 }
  };
  const tabProgress = {
    "https://www.youtube.com/watch?v=zyxwvutsrqp": { site: "youtube.com", title: "Continue", url: "https://www.youtube.com/watch?v=zyxwvutsrqp", duration: 100, position: 25, buckets: "0".repeat(25), watched: false, cw: "auto", ts: 1, updated: 30 }
  };
  const tabs = await load({ addedItems: videos, watchProgress: tabProgress, addedViewPrefs: { "youtube.com": { collapsed: true } } });
  assert.equal(tabs.document.querySelector("#added-page-grouping").value, "none", "default page grouping is stacked");
  assert.equal(tabs.document.querySelectorAll(".site-group").length, 3, "stacked mode renders every section");
  const grouping = tabs.document.querySelector("#added-page-grouping"); grouping.value = "tabs"; grouping.dispatchEvent(new tabs.window.Event("change", { bubbles: true })); await wait(30);
  const tabButtons = Array.from(tabs.document.querySelectorAll("[role='tab']"));
  assert.equal(tabButtons.length, 3, "Tabs renders every section as a tab");
  assert.deepEqual(tabButtons.map(tab => tab.querySelector(".count-badge").textContent), ["1", "1", "2"], "tabs show section counts");
  assert.equal(tabs.document.querySelectorAll("[role='tabpanel']").length, 1, "Tabs renders only the selected section");
  tabButtons[1].click(); await wait(30);
  assert.equal(tabs.store.addedViewPrefs.__page.selectedTab, "dailymotion.com", "clicking a tab persists its selection");
  const selectedTab = tabs.document.querySelector("[role='tab'][aria-selected='true']");
  selectedTab.dispatchEvent(new tabs.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await wait(30);
  assert.equal(tabs.document.querySelector("[role='tab'][aria-selected='true']").textContent.includes("YouTube"), true, "arrow keys select the next tab");
  tabs.document.querySelector("[role='tab'][aria-selected='true']").dispatchEvent(new tabs.window.KeyboardEvent("keydown", { key: "Home", bubbles: true })); await wait(30);
  assert.equal(tabs.document.querySelector("[role='tab'][aria-selected='true']").textContent.includes("Continue Watching"), true, "Home selects the first tab");
  tabs.document.querySelector("[role='tab'][aria-selected='true']").dispatchEvent(new tabs.window.KeyboardEvent("keydown", { key: "End", bubbles: true })); await wait(30);
  assert.equal(tabs.document.querySelector("[role='tab'][aria-selected='true']").textContent.includes("YouTube"), true, "End selects the last tab");
  const siteTab = tabs.document.querySelector("#added-tab-youtube-com"); siteTab.click(); await wait(30);
  assert.equal(tabs.document.querySelector(".site-group .collapse-button"), null, "tabs hide collapse controls");
  assert.ok(tabs.document.querySelector(".site-group-body"), "tabs show a collapsed section body");
  assert.equal(tabs.store.addedViewPrefs["youtube.com"].collapsed, true, "tabs do not change the stored collapse preference");
  const siteSort = tabs.document.querySelector(".site-group select[id^='added-sort-']"); siteSort.value = "title"; siteSort.dispatchEvent(new tabs.window.Event("change", { bubbles: true })); await wait(30);
  assert.equal(tabs.store.addedViewPrefs["youtube.com"].sort, "title", "site controls remain active inside tabs");
  const pageSort = tabs.document.querySelector("#added-page-sort"); pageSort.value = "name"; pageSort.dispatchEvent(new tabs.window.Event("change", { bubbles: true })); await wait(30);
  assert.deepEqual(Array.from(tabs.document.querySelectorAll("[role='tab']")).map(tab => tab.querySelector(".tab-name").textContent), ["Continue Watching", "Dailymotion", "YouTube"], "Name sorts website tabs ascending after Continue Watching");
  tabs.document.querySelector("#added-page-direction").click(); await wait(30);
  assert.deepEqual(Array.from(tabs.document.querySelectorAll("[role='tab']")).map(tab => tab.querySelector(".tab-name").textContent), ["Continue Watching", "YouTube", "Dailymotion"], "page direction reverses website tabs without moving Continue Watching");
  pageSort.value = "recent"; pageSort.dispatchEvent(new tabs.window.Event("change", { bubbles: true })); await wait(30);
  assert.deepEqual(Array.from(tabs.document.querySelectorAll("[role='tab']")).map(tab => tab.querySelector(".tab-name").textContent), ["Continue Watching", "Dailymotion", "YouTube"], "Recently added orders tabs by newest entry");
  const stackedGrouping = tabs.document.querySelector("#added-page-grouping"); stackedGrouping.value = "none"; stackedGrouping.dispatchEvent(new tabs.window.Event("change", { bubbles: true })); await wait(30);
  assert.deepEqual(Array.from(tabs.document.querySelectorAll(".site-group")).map(section => section.dataset.site), ["continue-watching", "dailymotion.com", "youtube.com"], "Recently added orders stacked sections while Continue Watching stays first");
  const tabGrouping = tabs.document.querySelector("#added-page-grouping"); tabGrouping.value = "tabs"; tabGrouping.dispatchEvent(new tabs.window.Event("change", { bubbles: true })); await wait(30);
  assert.equal(tabs.document.querySelector("[role='tab'][aria-selected='true']").textContent.includes("YouTube"), true, "switching back to tabs keeps the selected tab");
  const remountRoot = tabs.document.createElement("main"); tabs.document.body.appendChild(remountRoot); tabs.window.HOA_ADDED.mount(remountRoot); await wait(30);
  assert.equal(remountRoot.querySelector("[role='tab'][aria-selected='true']").textContent.includes("YouTube"), true, "selected tab persists after a remount");
  tabs.window.chrome.storage.local.set({ addedItems: { "https://www.dailymotion.com/video/xbd3ori": videos["https://www.dailymotion.com/video/xbd3ori"] } }); await wait(40);
  assert.equal(tabs.document.querySelector("[role='tab'][aria-selected='true']").textContent.includes("Continue Watching"), true, "a removed selected site falls back to the first remaining tab");
  tabs.window.close();
  const laterKey = "https://www.youtube.com/watch?v=watchlater1";
  const later = await load({ addedItems: {}, watchProgress: {}, watchLater: {
    [laterKey]: { title: "Watch next", thumb: "", site: "youtube.com", url: laterKey, duration: 754, ts: 20 },
    "https://tubitv.com/movies/later": { title: "Other", thumb: "", site: "tubitv.com", url: "https://tubitv.com/movies/later", ts: 10 }
  } });
  const laterSection = later.document.querySelector(".watch-later");
  assert.equal(later.document.querySelectorAll(".site-group")[0], laterSection, "Watch Later follows Continue Watching in stacked mode");
  assert.match(laterSection.textContent, /12:34.*YouTube/, "Watch Later renders duration and site without progress");
  later.document.querySelector(".watch-later select").value = "title"; later.document.querySelector(".watch-later select").dispatchEvent(new later.window.Event("change", { bubbles: true })); await wait(25);
  assert.equal(later.store.addedViewPrefs["watch-later"].sort, "title", "Watch Later stores independent sort preferences");
  later.document.querySelector(".watch-later .remove-button").click(); await wait(25);
  assert.equal(Object.keys(later.store.watchLater).length, 1, "Watch Later cards remove only themselves");
  const laterClear = later.document.querySelector(".watch-later .site-delete-all"); laterClear.click(); await wait(10); later.document.querySelector(".watch-later .site-delete-all").click(); await wait(25);
  assert.equal(Object.keys(later.store.watchLater).length, 0, "Watch Later delete-all uses the same two-click confirmation");
  later.window.close();
  const channels = await load({ addedItems: {
    "https://www.youtube.com/@alpha": { site: "youtube.com", title: "Alpha", thumb: "", kind: "channel", ts: 20 },
    "https://rumble.com/c/beta": { site: "rumble.com", title: "Beta", thumb: "", kind: "channel", ts: 10 },
    "https://www.youtube.com/watch?v=abcdefghijk": { site: "youtube.com", title: "Video", thumb: "", ts: 1 }
  }, watchProgress: {}, watchLater: { [laterKey]: { title: "Later", thumb: "", site: "youtube.com", ts: 1 } } });
  assert.deepEqual(Array.from(channels.document.querySelectorAll(".site-group")).map(section => section.dataset.site), ["watch-later", "added-channels", "youtube.com"], "Channels follows Watch Later and is excluded from website sections");
  const channelSection = channels.document.querySelector(".added-channels");
  assert.match(channelSection.textContent, /Alpha.*YouTube/, "channel cards use their channel name and site");
  assert.ok(channelSection.querySelector(".hoa-placeholder svg"), "channels without art use the person placeholder");
  const channelSort = channelSection.querySelector("select"); channelSort.value = "title"; channelSort.dispatchEvent(new channels.window.Event("change", { bubbles: true })); await wait(25);
  assert.equal(channels.store.addedViewPrefs["added-channels"].sort, "title", "channel controls keep independent preferences");
  channelSection.querySelector(".remove-button").click(); await wait(25);
  assert.equal(Object.keys(channels.store.addedItems).length, 2, "channel card remove edits added items only");
  const channelClear = channels.document.querySelector(".added-channels .site-delete-all"); channelClear.click(); await wait(5); channels.document.querySelector(".added-channels .site-delete-all").click(); await wait(25);
  assert.equal(Object.values(channels.store.addedItems).filter(entry => entry.kind === "channel").length, 0, "channel delete-all uses the shared two-click control");
  channels.window.close();
  const categoryOne = "https://www.twitch.tv/directory/category/just-chatting";
  const categoryTwo = "https://example.com/categories/films";
  const categories = await load({ addedItems: {
    "https://www.youtube.com/@creator": { site: "youtube.com", title: "Creator", thumb: "", kind: "channel", ts: 30 },
    [categoryOne]: { site: "twitch.tv", title: "Just Chatting", thumb: "https://example.com/chatting.jpg", kind: "category", ts: 20 },
    [categoryTwo]: { site: "example.com", title: "Films", thumb: "", kind: "category", ts: 10 },
    "https://www.youtube.com/watch?v=abcdefghijk": { site: "youtube.com", title: "Video", thumb: "", ts: 1 }
  }, watchProgress: {}, watchLater: {} });
  assert.deepEqual(Array.from(categories.document.querySelectorAll(".site-group")).map(section => section.dataset.site), ["added-channels", "added-categories", "youtube.com"], "Categories follows Channels and is excluded from website sections");
  const categorySection = categories.document.querySelector(".added-categories");
  assert.ok(categorySection.querySelector(".category-card"), "category cards use their own portrait card treatment");
  assert.ok(categorySection.querySelector("#added-direction-added-categories"), "two categories can be sorted");
  const oneCategory = await load({ addedItems: { [categoryOne]: { site: "twitch.tv", title: "Just Chatting", thumb: "", kind: "category", ts: 20 } } });
  const lone = oneCategory.document.querySelector(".added-categories");
  assert.ok(lone.querySelector(".category-card"), "a single category is still listed");
  assert.equal(lone.querySelector("select[id^='added-sort-']"), null, "one category has no sort menu");
  assert.equal(lone.querySelector(".direction-button"), null, "one category has no sort direction");
  assert.ok(lone.querySelector(".site-delete-all"), "one category keeps its delete button");
  assert.ok(categorySection.querySelector(".hoa-placeholder svg"), "categories without art use the four-square placeholder");
  const categorySort = categorySection.querySelector("select"); assert.deepEqual(Array.from(categorySort.options).map(option => option.value), ["added", "title", "site"], "category controls offer Date added, Name, and Site sorting");
  categorySort.value = "site"; categorySort.dispatchEvent(new categories.window.Event("change", { bubbles: true })); await wait(25);
  assert.equal(categories.store.addedViewPrefs["added-categories"].sort, "site", "category sort persists separately");
  const categoryGroup = categories.document.querySelector(".added-categories select[id^='added-group-']"); categoryGroup.value = "site"; categoryGroup.dispatchEvent(new categories.window.Event("change", { bubbles: true })); await wait(25);
  assert.equal(categories.store.addedViewPrefs["added-categories"].group, "site", "category site grouping persists");
  categories.document.querySelector(".added-categories .collapse-button").click(); await wait(25);
  assert.equal(categories.document.querySelector(".added-categories .added-card-grid"), null, "category section collapses");
  categories.document.querySelector(".added-categories .collapse-button").click(); await wait(25);
  categories.document.querySelector(".added-categories .remove-button").click(); await wait(25);
  assert.equal(Object.values(categories.store.addedItems).filter(entry => entry.kind === "category").length, 1, "category remove edits added items only");
  const categoryClear = categories.document.querySelector(".added-categories .site-delete-all"); categoryClear.click(); await wait(5); categories.document.querySelector(".added-categories .site-delete-all").click(); await wait(25);
  assert.equal(Object.values(categories.store.addedItems).filter(entry => entry.kind === "category").length, 0, "category delete-all uses the shared two-click control");
  categories.window.close();
  const manySites = {}; for (let index = 0; index < 12; index += 1) { const site = `site${index}.example`; for (let copy = 0; copy <= index; copy += 1) manySites[`https://${site}/v/${copy}`] = { site, title: `Video ${index}-${copy}`, thumb: "", kind: "video", ts: index + 1 }; }
  const crowded = await load({ addedItems: manySites, addedViewPrefs: { __page: { grouping: "tabs" } } });
  assert.equal(crowded.document.querySelector(".added-more"), null, "tabs that fit two rows need no More sites");
  // Four tabs to a row, in place of the layout jsdom does not have.
  Object.defineProperty(crowded.window.HTMLElement.prototype, "offsetTop", { get() { const bar = this.closest(".added-tab-bar"); return bar ? Math.floor(Array.from(bar.querySelectorAll(".added-tab-list > .added-page-tab, .added-more")).indexOf(this) / 4) * 50 : 0; } });
  crowded.window.innerWidth = 700; crowded.window.dispatchEvent(new crowded.window.Event("resize")); await wait(220);
  const crowdedTabs = () => Array.from(crowded.document.querySelectorAll(".added-tab-list [role='tab']"));
  const moreButton = () => crowded.document.querySelector(".added-more-button");
  assert.equal(crowdedTabs().length + 1, 8, "tabs and More sites fill exactly two rows");
  assert.ok(crowdedTabs().some(tab => tab.textContent.includes("Continue Watching")), "lists are never moved");
  assert.ok(crowded.document.querySelector("#added-tab-site11-example"), "the site with most videos keeps its tab");
  assert.equal(crowded.document.querySelector("#added-tab-site0-example"), null, "the site with fewest videos moves");
  const movedCount = 13 - crowdedTabs().length; assert.equal(moreButton().textContent, `More sites (${movedCount})`, "More sites counts what it holds");
  moreButton().click(); await wait(5);
  assert.equal(crowded.document.querySelectorAll(".added-more-item").length, movedCount, "the panel lists every moved site");
  const search = crowded.document.querySelector(".added-more-search"); assert.equal(crowded.document.activeElement, search, "search takes the focus");
  search.value = "nothing-like-this"; search.dispatchEvent(new crowded.window.Event("input", { bubbles: true }));
  assert.equal(crowded.document.querySelector(".added-more-empty").hidden, false, "a search with no match says so");
  search.value = "site0"; search.dispatchEvent(new crowded.window.Event("input", { bubbles: true }));
  assert.equal(Array.from(crowded.document.querySelectorAll(".added-more-item")).filter(item => !item.hidden).length, 1, "search filters the sites");
  search.dispatchEvent(new crowded.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(crowded.document.querySelector(".added-more-panel"), null, "Escape closes the panel");
  assert.equal(crowded.document.activeElement, moreButton(), "focus returns to More sites");
  moreButton().click(); await wait(5);
  const pick = Array.from(crowded.document.querySelectorAll(".added-more-item")).find(item => item.textContent.includes("site0")); pick.click(); await wait(30);
  assert.equal(crowded.store.addedViewPrefs.__page.selectedTab, "site0.example", "picking a site selects it");
  assert.equal(crowded.document.querySelector("#added-tab-site0-example").getAttribute("aria-selected"), "true", "a picked site gets a visible tab");
  assert.ok(crowded.document.querySelector(".site-group[data-site='site0.example']"), "a picked site shows its videos");
  assert.equal(crowdedTabs().length + 1, 8, "a picked site takes a place rather than adding a row");
  moreButton().click(); await wait(5); crowded.document.body.dispatchEvent(new crowded.window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(crowded.document.querySelector(".added-more-panel"), null, "clicking elsewhere closes the panel");
  crowded.window.close(); console.log("added.test.js: 52 passed, 0 failed");
})().catch(error => { console.error(error); process.exitCode = 1; });
