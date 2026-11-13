"use strict";
// Runs the REAL shared.js + catalog.js + content.js against HTML fixtures captured from the live sites
// (tests/fixtures/*.html, trimmed to three cards each) inside jsdom, with an in-memory chrome.storage.
//
// jsdom is a dev-only tool and is not bundled. Install it anywhere and point JSDOM_PATH at it:
//   npm install jsdom   (in any folder)   then   JSDOM_PATH=/that/folder/node_modules/jsdom node tests/engine.test.js
// Without jsdom the test prints SKIPPED and exits 0.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let JSDOM;
try {
  JSDOM = require(process.env.JSDOM_PATH || "jsdom").JSDOM;
} catch (error) {
  console.log("engine.test.js: SKIPPED (jsdom not installed; set JSDOM_PATH to run it)");
  process.exit(0);
}

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const bundle = ["shared.js", "catalog.js", "content.js"].map(read).join("\n;\n");

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error("FAILED:", name);
    throw error;
  }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function load({ fixture, html: suppliedHtml, url, siteRules, hiddenItems, addedItems, watchedShown, watchSettings, watchProgress, watchLater, buttonsEnabled, buttonEdge, noBody = false, testSeam = false, childFrame = false, incognito = false, setup }) {
  const html = suppliedHtml === undefined ? fs.readFileSync(path.join(__dirname, "fixtures", fixture), "utf8") : suppliedHtml;
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url, runScripts: "outside-only", pretendToBeVisual: true
  });
  const { window } = dom;
  if (noBody) {
    window.document.body.remove();
  }
  const store = { siteRules: siteRules || {}, hiddenItems, addedItems, watchedShown, watchSettings: watchSettings || undefined, watchProgress: watchProgress || undefined, watchLater: watchLater || undefined, buttonsEnabled, buttonEdge };
  Object.keys(store).forEach(key => { if (store[key] === undefined) delete store[key]; });
  const writes = [];
  const listeners = [];
  const messageListeners = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  window.chrome = {
    extension: incognito ? { inIncognitoContext: true } : undefined,
    runtime: { id: "test-extension", lastError: null, getURL: value => value, getManifest: () => ({ version: "test" }),
      onMessage: { addListener: listener => messageListeners.push(listener) }, sendMessage(message, callback) { window.__hoaSentMessages.push(message); if (callback) callback(window.__hoaFrameReply || {}); } },
    storage: {
      local: {
        get(defaults, callback) {
          const result = {};
          Object.keys(defaults).forEach(key => { result[key] = key in store ? clone(store[key]) : defaults[key]; });
          setTimeout(() => callback(result), 0);
        },
        set(values, callback) {
          writes.push(clone(values));
          const changes = {};
          Object.entries(values).forEach(([key, value]) => {
            changes[key] = { oldValue: store[key], newValue: clone(value) };
            store[key] = clone(value);
          });
          setTimeout(() => { listeners.forEach(listener => listener(changes, "local")); if (callback) callback(); }, 0);
        }
      },
      onChanged: { addListener: listener => listeners.push(listener) }
    }
  };
  window.__hoaSentMessages = [];
  if (childFrame) window.__hoaTestChildFrame = true;
  if (testSeam) window.__hoaTest = {};
  if (typeof setup === "function") setup(window);
  window.eval(bundle);
  await wait(120);
  const status = () => new Promise(resolve => {
    let answered = false;
    messageListeners.forEach(listener => listener({ type: "hoa-status" }, {}, reply => { if (!answered) { answered = true; resolve(reply); } }));
    if (!messageListeners.length) resolve(null);
    // A script that stopped answering must fail its checks, not leave Node with nothing to wait for (a silent exit 0).
    setTimeout(() => { if (!answered) { answered = true; resolve(null); } }, 1000);
  });
  const deliver = (message, sender = {}) => new Promise(resolve => {
    let answered = false;
    messageListeners.forEach(listener => {
      const keepAlive = listener(message, sender, reply => { if (!answered) { answered = true; resolve(reply); } });
      if (keepAlive !== true && !answered) { answered = true; resolve(undefined); }
    });
    if (!messageListeners.length) resolve(undefined);
    setTimeout(() => { if (!answered) resolve(undefined); }, 30);
  });
  return { window, document: window.document, store, writes, status, deliver, test: window.__hoaTest };
}

function fakeVideo(page, { duration = 100, currentTime = 0, paused = false, width = 640, height = 360 } = {}) {
  const video = page.document.createElement("video");
  const handlers = new Map();
  let position = currentTime;
  let isPaused = paused;
  video.seeks = [];
  Object.defineProperties(video, {
    duration: { configurable: true, get: () => duration },
    currentTime: { configurable: true, get: () => position, set: value => { position = Number(value) || 0; video.seeks.push(position); } },
    paused: { configurable: true, get: () => isPaused, set: value => { isPaused = Boolean(value); } },
    playbackRate: { configurable: true, get: () => 1 }
  });
  video.addEventListener = (name, listener) => handlers.set(name, listener);
  video.fire = name => { const listener = handlers.get(name); if (listener) listener({ type: name, target: video }); };
  video.getBoundingClientRect = () => ({ width, height, top: 0, left: 0, right: width, bottom: height });
  video.play = (seconds = 0, step = .25) => {
    isPaused = false; video.fire("play");
    for (let elapsed = 0; elapsed < seconds; elapsed += step) {
      video.currentTime = Math.min(duration, position + Math.min(step, seconds - elapsed));
      video.fire("timeupdate");
    }
    isPaused = true; video.fire("pause");
  };
  page.document.body.appendChild(video);
  page.test.attachTracker(video);
  return video;
}

const buttons = (card, action) => card.querySelector(`:scope > .hoa-actions [data-action="${action}"]`);
const firstEntry = bag => Object.entries(bag || {})[0];
const bucketCount = bitmap => String(bitmap).split("").reduce((count, digit) => count + Number.parseInt(digit, 16).toString(2).replaceAll("0", "").length, 0);

const CASES = [
  {
    name: "imdb", fixture: "imdb.html", url: "https://www.imdb.com/chart/top/", host: "www.imdb.com",
    cardSelector: "li.ipc-metadata-list-summary-item", cards: 3, optIn: true,
    expectAdd(key, entry) {
      assert.strictEqual(key, "https://www.imdb.com/title/tt0111161");
      assert.strictEqual(entry.title, "The Shawshank Redemption");
      assert.ok(entry.thumb.startsWith("https://m.media-amazon.com/"));
      assert.strictEqual(entry.year, 1994);
      assert.strictEqual(entry.duration, 8520);
      assert.strictEqual(entry.rating, "R");
      assert.strictEqual(entry.score, 9.3);
      assert.strictEqual(entry.votes, 3200000);
      assert.strictEqual(entry.type, "movie");
    }
  },
  {
    name: "imdb home posters", fixture: "imdb-home.html", url: "https://www.imdb.com/", host: "www.imdb.com",
    cardSelector: ".ipc-poster-card", cards: 3, optIn: true,
    expectAdd(key, entry) {
      assert.strictEqual(key, "https://www.imdb.com/title/tt6933238");
      assert.strictEqual(entry.title, "Unabomber");
    }
  },
  {
    name: "imdb home slates", fixture: "imdb-home.html", url: "https://www.imdb.com/", host: "www.imdb.com",
    cardSelector: ".ipc-slate-card", cards: 3, optIn: true,
    expectAdd(key, entry) {
      assert.strictEqual(key, "https://www.imdb.com/video/vi2325400089");
      assert.strictEqual(entry.title, "Other Mommy");
      assert.strictEqual(entry.duration, 131);
    }
  },
  {
    name: "imdb title posters", fixture: "imdb-title.html", url: "https://www.imdb.com/title/tt0111161/", host: "www.imdb.com",
    cardSelector: ".ipc-poster-card", cards: 3, optIn: true,
    expectAdd(key, entry) {
      assert.strictEqual(key, "https://www.imdb.com/title/tt0068646");
      assert.strictEqual(entry.title, "The Godfather");
    }
  },
  {
    name: "imdb title slates", fixture: "imdb-title.html", url: "https://www.imdb.com/title/tt0111161/", host: "www.imdb.com",
    cardSelector: ".ipc-slate-card", cards: 3, optIn: true,
    expectAdd(key, entry) {
      assert.strictEqual(key, "https://www.imdb.com/video/vi3877612057");
      assert.strictEqual(entry.title, "Official Trailer");
      assert.strictEqual(entry.duration, 131);
    }
  },
  {
    name: "imdb trailers posters", fixture: "imdb-trailers.html", url: "https://www.imdb.com/trailers/", host: "www.imdb.com",
    cardSelector: ".ipc-poster-card", cards: 3, optIn: true,
    expectAdd(key, entry) {
      assert.strictEqual(key, "https://www.imdb.com/video/vi3400452633");
      assert.strictEqual(entry.title, "Street Fighter");
    }
  },
  {
    name: "tmdb recommendations", fixture: "tmdb-detail.html", url: "https://www.themoviedb.org/movie/550-fight-club", host: "www.themoviedb.org",
    cardSelector: "#recommendation_scroller div.item", cards: 3, optIn: true,
    expectAdd(key, entry) {
      assert.ok(/^https:\/\/www\.themoviedb\.org\/movie\/\d+/.test(key), key);
      assert.ok(entry.title && entry.title.length > 2, entry.title);
      assert.ok(Number.isInteger(entry.year), "year from the numeric release date");
      assert.strictEqual(entry.type, "movie");
      assert.ok(/^https?:\/\//.test(entry.thumb));
    }
  },
  {
    name: "tubi you may also like", fixture: "tubi-detail.html", url: "https://tubitv.com/movies/100065059/r-l-stine-s-pumpkinhead-2", host: "tubitv.com",
    cardSelector: 'a[href^="/movies/"]:has(h3)', cards: 3, optIn: false,
    expectAdd(key, entry) {
      assert.ok(/^https:\/\/tubitv\.com\/(movies|series)\/\d+/.test(key), key);
      assert.ok(entry.title && entry.title.length > 2 && !/·/.test(entry.title), entry.title);
      assert.ok(Number.isInteger(entry.year), "year from the · line");
      assert.ok(Number.isFinite(entry.duration) && entry.duration > 600, "duration from the · line");
      assert.strictEqual(entry.type, "movie");
    }
  },
  {
    name: "tmdb", fixture: "tmdb.html", url: "https://www.themoviedb.org/movie", host: "www.themoviedb.org",
    cardSelector: "#media-list .media-list-results > div[data-object-id]", cards: 3, optIn: true,
    expectAdd(key, entry) {
      assert.ok(/^https:\/\/www\.themoviedb\.org\/movie\/\d+/.test(key), key);
      assert.ok(entry.title && !/^\d+$/.test(entry.title));
      assert.ok(Number.isFinite(entry.published), "release date parsed");
      assert.ok(Number.isInteger(entry.year));
      assert.strictEqual(entry.type, "movie");
      assert.ok(/^https?:\/\//.test(entry.thumb));
    }
  },
  {
    name: "dailymotion", fixture: "dailymotion.html", url: "https://www.dailymotion.com/us", host: "www.dailymotion.com",
    cardSelector: 'ul[data-testid="page-layout-grid"] > li', cards: 3, optIn: true,
    expectAdd(key, entry) {
      assert.ok(/^https:\/\/www\.dailymotion\.com\/video\/[a-z0-9]+$/.test(key), key);
      assert.ok(entry.title.length > 3);
      assert.ok(/^https?:\/\//.test(entry.thumb));
    }
  },
  {
    name: "dailymotion video cards", fixture: "dailymotion-cards.html", url: "https://www.dailymotion.com/us/search",
    host: "www.dailymotion.com", cardSelector: '[data-testid="video-card"]', cards: 3, optIn: true,
    hideTarget: "li",
    expectAdd(key, entry) {
      assert.strictEqual(key, "https://www.dailymotion.com/video/xbd3ori");
      assert.strictEqual(entry.title, "SpaceX Starlink Satellites Deployed In Stunning View From Space");
      assert.strictEqual(entry.duration, 62);
    }
  },
  {
    name: "picked anime cards", fixture: "picked-card.html", url: "https://example-anime.test/browse",
    host: "example-anime.test", cardSelector: ".anime-card", cards: 3, optIn: true,
    siteRules: { "example-anime.test": { enabled: true, pickedSelectors: [".anime-card"] } },
    expectAdd(key, entry) {
      assert.strictEqual(key, "https://example-anime.test/watch/koupen-chan");
      assert.strictEqual(entry.title, "Koupen-chan");
    }
  },
  {
    name: "twitch", fixture: "twitch.html", url: "https://www.twitch.tv/directory/all", host: "www.twitch.tv",
    cardSelector: 'article:has(a[data-a-target="preview-card-image-link"])', cards: 3, optIn: true,
    wrapperHidden: true,
    expectAdd(key, entry) {
      assert.ok(/^https:\/\/www\.twitch\.tv\/[A-Za-z0-9_]+$/.test(key), key);
      assert.strictEqual(entry.type, "live");
      assert.ok(Number.isFinite(entry.views) && entry.views > 0, "viewer count parsed");
      assert.ok(Array.isArray(entry.genres) && entry.genres.length >= 1, "game stored as genre");
    }
  },
  {
    name: "tubi", fixture: "tubi.html", url: "https://tubitv.com/", host: "tubitv.com",
    cardSelector: '[data-test-id="web-ui-content-tile"]', cards: 3, optIn: false,
    hideTarget: '[data-test-id="web-ui-grid-item"]',
    expectAdd(key, entry) {
      assert.ok(/^https:\/\/tubitv\.com\/(movies|series)\/\d+/.test(key), key);
      // Real titles can be very short (the first fixture tile is the movie "65"), so only reject the site-name fallback.
      assert.ok(entry.title && entry.title !== "tubitv.com", entry.title);
      assert.ok(Number.isInteger(entry.year));
      assert.ok(entry.rating);
      assert.ok(Array.isArray(entry.genres) && entry.genres.length >= 1);
      assert.ok(["movie", "tv"].includes(entry.type));
    }
  },
  {
    name: "youtube", fixture: "youtube.html", url: "https://www.youtube.com/", host: "www.youtube.com",
    cardSelector: "ytd-rich-item-renderer", cards: 3, optIn: false,
    expectAdd(key, entry) {
      assert.ok(/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(key), key);
      assert.ok(entry.title.length > 5 && !/^(\d{1,2}:)+\d{2}$/.test(entry.title), "title is not the duration badge: " + entry.title);
      assert.ok(Number.isFinite(entry.duration) && entry.duration > 0, "duration");
      assert.ok(Number.isFinite(entry.views), "views");
      assert.ok(Number.isFinite(entry.published), "age -> published");
      assert.ok(entry.thumb.startsWith("https://i.ytimg.com/vi/"));
    }
  },
  {
    name: "youtube watch sidebar", fixture: "youtube-watch.html", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", host: "www.youtube.com",
    cardSelector: "yt-lockup-view-model", cards: 3, optIn: false,
    expectAdd(key, entry) {
      assert.strictEqual(key, "https://www.youtube.com/watch?v=ktdbUIZKeSE");
      assert.ok(entry.title.length > 5 && !/^(\d{1,2}:)+\d{2}$/.test(entry.title), "title: " + entry.title);
      assert.ok(Number.isFinite(entry.duration) && entry.duration > 0, "duration");
    }
  },
  {
    name: "youtube search results", fixture: "youtube-search.html", url: "https://www.youtube.com/results?search_query=space+documentary", host: "www.youtube.com",
    cardSelector: "ytd-video-renderer, ytm-shorts-lockup-view-model-v2", cards: 6, optIn: false,
    expectAdd(key, entry) {
      assert.ok(/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(key), key);
      assert.ok(entry.title.length > 5 && !/^(\d{1,2}:)+\d{2}$/.test(entry.title), "title: " + entry.title);
      assert.ok(Number.isFinite(entry.duration) && entry.duration > 0, "duration");
    }
  },
  {
    name: "youtube watch sidebar shorts", fixture: "youtube-watch-shorts.html", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", host: "www.youtube.com",
    cardSelector: "ytm-shorts-lockup-view-model-v2", cards: 3, optIn: false,
    expectAdd(key, entry) {
      assert.strictEqual(key, "https://www.youtube.com/shorts/aBcDeFgHiJ1");
      assert.strictEqual(entry.kind, "short");
      assert.strictEqual(entry.title, "Tiny robot learns to walk");
    }
  },
  ...[
    ["xumo movies", "sites/xumo.html", "https://play.xumo.com/free-movies/", "play.xumo.com", "li.card.titleCard:not(.promoCard)", 8],
    ["xumo TV", "sites/xumo-tv.html", "https://play.xumo.com/tv-shows/", "play.xumo.com", "li.card.titleCard:not(.promoCard)", 6],
    ["pluto", "sites/pluto.html", "https://pluto.tv/us/movies/", "pluto.tv", 'div.swiper-slide:has(a[data-testid="region-link"]), a[data-testid="region-link"]:not(div.swiper-slide a[data-testid="region-link"])', 8],
    ["roku", "sites/roku.html", "https://therokuchannel.roku.com/", "therokuchannel.roku.com", "li.movie, li.series, li[data-row][data-col]", 6],
    ["fandango", "sites/fandango.html", "https://athome.fandango.com/", "athome.fandango.com", '[class*="carousel-default-styles__item"]', 8],
    ["crunchyroll", "sites/crunchyroll.html", "https://www.crunchyroll.com/browse", "www.crunchyroll.com", '[class*="browse-card--"]:not([class*="hover"])', 3],
    ["odysee", "sites/odysee.html", "https://odysee.com/", "odysee.com", "li.claim-preview__wrapper", 5],
    ["kick", "sites/kick.html", "https://kick.com/categories", "kick.com", 'div:has(> a[data-testid="media-card-thumbnail"])', 3],
    ["rumble", "sites/rumble.html", "https://rumble.com/", "rumble.com", "rum-video-thumbnail", 5],
    ["pbs", "sites/pbs.html", "https://www.pbs.org/shows/", "www.pbs.org", 'a[class*="show_poster__link"]', 6],
    ["vix", "sites/vix.html", "https://vix.com/", "vix.com", '[data-testid="content-card"]', 3],
    ["shout", "sites/shout.html", "https://watch.shout-tv.com/", "watch.shout-tv.com", "div.content-pager__item", 8],
    ["justwatch", "sites/justwatch.html", "https://www.justwatch.com/us", "www.justwatch.com", '[data-testid="titleItem"]', 6],
    ["rottentomatoes", "sites/rottentomatoes.html", "https://www.rottentomatoes.com/browse/movies_at_home/", "www.rottentomatoes.com", "div.discovery-tiles__wrap > div.flex-container", 6],
    ["letterboxd", "sites/letterboxd.html", "https://letterboxd.com/films/", "letterboxd.com", "li.posteritem", 6]
  ].map(([name, fixture, url, host, cardSelector, cards]) => ({
    name, fixture, url, host, cardSelector, cards, optIn: true,
    expectAdd(key, entry) { assert.ok(key && /^https:\/\//.test(key), key); assert.ok(entry && entry.title, name); }
  }))
];

(async () => {
  for (const spec of CASES) {
    // 1. opt-in sites do nothing until enabled; built-in sites work immediately.
    {
      const page = await load({ fixture: spec.fixture, url: spec.url, siteRules: {} });
      const count = page.document.querySelectorAll(".hoa-actions").length;
      if (spec.optIn) {
        check(`${spec.name}: inactive until the user enables the site`, () => assert.strictEqual(count, 0));
      } else {
        check(`${spec.name}: built-in site is active without enabling`, () => assert.strictEqual(count, spec.cards));
      }
      page.window.close();
    }
    // 2. disabled built-in sites stay off
    if (!spec.optIn) {
      const page = await load({ fixture: spec.fixture, url: spec.url, siteRules: { [spec.host]: { enabled: false } } });
      check(`${spec.name}: Disable switches a built-in site off`, () => assert.strictEqual(page.document.querySelectorAll(".hoa-actions").length, 0));
      page.window.close();
    }
    // 3. enabled: buttons on every card, Add/Hide/Undo behaviour on the real markup
    const rules = spec.siteRules || { [spec.host]: { enabled: true, cardSelector: "", linkSelector: "", bulkHide: false } };
    const page = await load({ fixture: spec.fixture, url: spec.url, siteRules: rules });
    const { document, store, window } = page;
    const cards = Array.from(document.querySelectorAll(spec.cardSelector));
    check(`${spec.name}: fixture has ${spec.cards} cards`, () => assert.strictEqual(cards.length, spec.cards));
    check(`${spec.name}: Add and Hide buttons on every card`, () => {
      cards.forEach(card => { assert.ok(buttons(card, "hide") && buttons(card, "add")); });
    });

    const firstCard = cards[0];
    window.dispatchEvent(new window.Event("resize"));
    firstCard.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: false }));
    await wait(30);
    check(`${spec.name}: hover placement does not throw and keeps the overlay`, () => assert.ok(buttons(firstCard, "add")));

    buttons(firstCard, "add").click();
    await wait(60);
    const [addedKey, addedEntry] = firstEntry(store.addedItems) || [];
    check(`${spec.name}: Add stores the real card data`, () => spec.expectAdd(addedKey, addedEntry));
    if (spec.name === "picked anime cards") {
      buttons(cards[2], "add").click();
      await wait(60);
      const altKey = "https://example-anime.test/watch/image-only";
      check(`${spec.name}: image alt is used when no title exists`, () => assert.strictEqual(
        store.addedItems[altKey].title, "A quiet winter anime scene"));
      buttons(cards[2], "add").click();
      await wait(60);
    }
    check(`${spec.name}: Add button shows the Added state`, () => {
      assert.strictEqual(buttons(firstCard, "add").getAttribute("aria-pressed"), "true");
    });
    buttons(firstCard, "add").click();
    await wait(60);
    check(`${spec.name}: clicking Added removes it again`, () => assert.deepStrictEqual(store.addedItems, {}));

    buttons(firstCard, "hide").click();
    await wait(80);
    const removed = Array.from(document.querySelectorAll(".hoa-removed"));
    check(`${spec.name}: Hide stores the entry`, () => {
      const [hiddenKey, hiddenEntry] = firstEntry(store.hiddenItems) || [];
      assert.strictEqual(hiddenKey, addedKey);
      assert.strictEqual(hiddenEntry.listed, true);
    });
    check(`${spec.name}: exactly one thing is hidden`, () => assert.strictEqual(removed.length, 1));
    if (spec.hideTarget) {
      check(`${spec.name}: the column wrapper is hidden, so no gap is left`, () => {
        assert.ok(removed[0].matches(spec.hideTarget), "removed element is the wrapper");
        assert.ok(removed[0].contains(firstCard));
      });
    } else if (spec.wrapperHidden) {
      check(`${spec.name}: the single-child wrapper chain is hidden, so no gap is left`, () => {
        assert.notStrictEqual(removed[0], firstCard);
        assert.ok(removed[0].contains(firstCard));
        let node = firstCard;
        while (node !== removed[0]) {
          assert.strictEqual(node.parentElement.children.length, 1, "wrapper only contains the card");
          node = node.parentElement;
        }
      });
    } else {
      check(`${spec.name}: the card itself is hidden`, () => assert.strictEqual(removed[0], firstCard));
    }
    check(`${spec.name}: other cards keep their buttons`, () => {
      cards.slice(1).forEach(card => assert.ok(buttons(card, "hide")));
    });
    check(`${spec.name}: undo toast appears`, () => assert.ok(document.getElementById("hoa-toast")));
    document.querySelector("#hoa-toast button").click();
    await wait(80);
    check(`${spec.name}: Undo restores the card`, () => {
      assert.strictEqual(document.querySelectorAll(".hoa-removed").length, 0);
      assert.deepStrictEqual(store.hiddenItems, {});
    });

    // a previously hidden video stays hidden after a reload (storage is the source of truth)
    const hiddenSeed = {};
    hiddenSeed[addedKey] = { title: addedEntry.title, thumb: "", kind: "video", site: addedEntry.site, ts: Date.now(), listed: false };
    const reload = await load({ fixture: spec.fixture, url: spec.url, siteRules: rules });
    reload.window.chrome.storage.local.set({ hiddenItems: hiddenSeed });
    await wait(120);
    check(`${spec.name}: a hidden video (even one removed from the list) stays hidden`, () => {
      assert.strictEqual(reload.document.querySelectorAll(".hoa-removed").length, 1);
    });
    // Tubi rewrites a tile's class attribute after load; the hidden mark must come straight back.
    const wiped = reload.document.querySelector(".hoa-removed");
    wiped.className = wiped.className.replace(/\s*\bhoa-removed\b/, "");
    await wait(120);
    check(`${spec.name}: a hidden video stays hidden when the site rewrites its class`, () => {
      assert.ok(wiped.classList.contains("hoa-removed"));
    });
    reload.window.close();
    window.close();
  }
  {
    const playlist = await load({
      html: '<yt-lockup-view-model><yt-collection-thumbnail-view-model></yt-collection-thumbnail-view-model><a href="/watch?v=dQw4w9WgXcQ&list=PLmix123">My Mix</a></yt-lockup-view-model>',
      url: "https://www.youtube.com/",
      siteRules: { "www.youtube.com": { enabled: true, cardSelector: "yt-lockup-view-model", linkSelector: "a[href]", bulkHide: false } }
    });
    const card = playlist.document.querySelector("yt-lockup-view-model");
    buttons(card, "add").click();
    await wait(60);
    check("YouTube playlist cards save under their playlist key", () => {
      const [key, entry] = firstEntry(playlist.store.addedItems) || [];
      assert.strictEqual(key, "https://www.youtube.com/playlist?list=PLmix123");
      assert.strictEqual(entry.type, "playlist");
    });
    buttons(card, "hide").click();
    await wait(80);
    check("hiding a YouTube playlist card removes its playlist key", () => {
      assert.ok(card.classList.contains("hoa-removed"));
      assert.ok(playlist.store.hiddenItems["https://www.youtube.com/playlist?list=PLmix123"]);
    });
    playlist.window.close();
  }
  {
    const page = await load({ fixture: "youtube-watch-shorts.html", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      siteRules: { "www.youtube.com": { hideKinds: ["shorts"] } } });
    check("filters: Shorts hide captured Shorts cards", () => assert.strictEqual(
      page.document.querySelectorAll("ytm-shorts-lockup-view-model-v2.hoa-filtered").length, 3));
    check("filters: cards hidden by type are not hidden-list entries", () => assert.deepStrictEqual(page.store.hiddenItems || {}, {}));
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube.html", url: "https://www.youtube.com/",
      siteRules: { "www.youtube.com": { hideKinds: ["recommended"] } } });
    check("filters: recommended hides ordinary captured home videos", () => assert.strictEqual(
      page.document.querySelectorAll("ytd-rich-item-renderer.hoa-filtered").length, 3));
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube.html", url: "https://www.youtube.com/",
      siteRules: { "www.youtube.com": { hideKeywords: ["overheat"] } } });
    check("filters: a captured title keyword hides exactly its card", () => assert.strictEqual(
      page.document.querySelectorAll("ytd-rich-item-renderer.hoa-filtered").length, 1));
    page.window.close();
  }
  {
    const page = await load({ fixture: "tubi.html", url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["movies"] } } });
    check("filters: Tubi movie links hide as movies", () => assert.strictEqual(
      page.document.querySelectorAll('[data-test-id="web-ui-grid-item"].hoa-filtered').length, 3));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/tubi-sections.html", url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["recommended"] } } });
    const sectionFor = title => Array.from(page.document.querySelectorAll(".web-row-header__title"))
      .find(node => node.textContent.trim() === title).closest("section");
    check("filters: Recommended hides Tubi's Recommended section and keeps On Now", () => {
      assert.ok(sectionFor("Recommended").classList.contains("hoa-filtered"));
      assert.ok(!sectionFor("On Now").classList.contains("hoa-filtered"));
    });
    page.window.close();
  }
  {
    const page = await load({ html: '<div class="cardList" id="recommended"><div class="listHeader"><h2>Recommended For You</h2></div></div><div class="cardList" id="popular"><div class="listHeader"><h2>Most Popular</h2></div></div>',
      url: "https://play.xumo.com/", siteRules: { "play.xumo.com": { enabled: true, hideKinds: ["recommended"] } } });
    check("filters: Recommended hides Xumo's Recommended For You row only", () => {
      assert.ok(page.document.getElementById("recommended").classList.contains("hoa-filtered"));
      assert.ok(!page.document.getElementById("popular").classList.contains("hoa-filtered"));
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/roku-sections.html", url: "https://therokuchannel.roku.com/",
      siteRules: { "therokuchannel.roku.com": { enabled: true, hideKinds: ["recommended"] } } });
    check("filters: Recommended hides Roku's Recommended for You row", () => assert.ok(
      page.document.querySelector(".roku-collection-row__title").closest(".roku-collection-row").classList.contains("hoa-filtered")));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/tubi-featured.html", url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["recommended"] } } });
    check("filters: Tubi For You In feature cards are Recommended", () => assert.ok(
      page.document.querySelectorAll(".hoa-filtered").length >= 2));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/tubi-foreign.html", url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["not-english"] } } });
    check("filters: Tubi Foreign/International tiles match Not in English", () => assert.ok(
      page.document.querySelectorAll('[data-test-id="web-ui-grid-item"].hoa-filtered').length >= 3));
    page.window.close();
  }
  {
    const foreign = read("tests/fixtures/sites/tubi-foreign.html").replace(/Foreign\/International/g, "Drama")
      .replace("The Human Centipede (First Sequence)", "X (English Dubbed)");
    const notEnglish = await load({ html: foreign, url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["not-english"] } } });
    check("filters: English-dubbed Tubi tile stays visible with Not in English", () => assert.ok(
      !notEnglish.document.querySelector('[data-test-id="web-ui-grid-item"]').classList.contains("hoa-filtered")));
    notEnglish.window.close();
    const dubbed = await load({ html: foreign, url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["dubbed"] } } });
    check("filters: English-dubbed Tubi tile is hidden by Dubbed", () => assert.ok(
      dubbed.document.querySelector('[data-test-id="web-ui-grid-item"]').classList.contains("hoa-filtered")));
    dubbed.window.close();
  }
  {
    const spanish = read("tests/fixtures/sites/tubi-foreign.html").replace(/Foreign\/International/g, "Drama")
      .replace("The Human Centipede (First Sequence)", "X (Español)");
    for (const kind of ["not-english", "dubbed"]) {
      const page = await load({ html: spanish, url: "https://tubitv.com/", siteRules: { "tubitv.com": { hideKinds: [kind] } } });
      check(`filters: Spanish-dubbed Tubi tile is hidden by ${kind}`, () => assert.ok(
        page.document.querySelector('[data-test-id="web-ui-grid-item"]').classList.contains("hoa-filtered")));
      page.window.close();
    }
  }
  {
    const page = await load({ fixture: "sites/tubi-featured.html", url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["not-english", "dubbed"] } } });
    check("filters: plain English Tubi drama stays visible to language filters", () => assert.equal(
      page.document.querySelectorAll(".hoa-filtered").length, 0));
    page.window.close();
  }
  {
    const crunchyroll = read("tests/fixtures/sites/crunchyroll.html").replace("Sub | Dub", "Subtitled");
    const page = await load({ html: crunchyroll, url: "https://www.crunchyroll.com/browse",
      siteRules: { "www.crunchyroll.com": { enabled: true, hideKinds: ["not-english"] } } });
    const cards = Array.from(page.document.querySelectorAll('[class*="browse-card--"]:not([class*="hover"])'));
    check("filters: Crunchyroll Not in English hides Subtitled-only and keeps Sub | Dub", () => {
      assert.ok(cards.find(card => card.textContent.includes("Subtitled")).classList.contains("hoa-filtered"));
      cards.filter(card => card.textContent.includes("Sub | Dub")).forEach(card => assert.ok(!card.classList.contains("hoa-filtered")));
    });
    page.window.close();
  }
  {
    const html = '<div id="viewport" style="overflow:hidden"><div id="row" style="display:flex;transform:translateX(-100px)"><div id="hidden-slot" data-test-id="web-ui-grid-item"><div data-test-id="web-ui-content-tile"><a class="web-content-tile__poster-link" href="/movies/1/hidden"></a><a class="web-content-tile__title">Hidden</a></div></div><div id="visible-slot"><div data-test-id="web-ui-content-tile"><a class="web-content-tile__poster-link" href="/series/2/visible"></a><a class="web-content-tile__title">Visible</a></div></div></div></div>';
    const page = await load({ html, url: "https://tubitv.com/", testSeam: true,
      siteRules: { "tubitv.com": { hideKinds: ["movies"] } } });
    const rect = (left, right) => () => ({ left, right, width: right - left, height: 80, top: 0, bottom: 80 });
    page.document.getElementById("viewport").getBoundingClientRect = rect(0, 100);
    page.document.getElementById("hidden-slot").getBoundingClientRect = rect(-40, 0);
    page.document.getElementById("visible-slot").getBoundingClientRect = rect(20, 60);
    page.test.apply();
    check("carousel compensation fills an end gap with CSS translate", () => {
      const row = page.document.getElementById("row");
      assert.equal(row.dataset.hoaShift, "20");
      assert.equal(row.style.translate, "20px");
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube-categories.synthetic.html", url: "https://www.youtube.com/",
      siteRules: { "www.youtube.com": { hideKinds: ["playlists", "mixes", "live", "music", "podcasts", "movies", "posts", "fundraisers"] } } });
    check("filters: synthetic known YouTube category markup is classified", () => ["playlist", "mix", "live", "music", "podcast", "movie", "post", "fundraiser"]
      .forEach(id => assert.ok(page.document.getElementById(id).classList.contains("hoa-filtered"), id)));
    page.window.close();
  }
  {
    // "Recommended" takes only ordinary single videos, never collections, live videos, posts or shelves.
    const page = await load({ fixture: "youtube-categories.synthetic.html", url: "https://www.youtube.com/",
      siteRules: { "www.youtube.com": { hideKinds: ["recommended"] } } });
    check("filters: Recommended leaves playlists, mixes, live, podcasts, posts and fundraisers alone", () =>
      ["playlist", "mix", "live", "podcast", "post", "fundraiser"]
        .forEach(id => assert.ok(!page.document.getElementById(id).classList.contains("hoa-filtered"), id)));
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube-categories.synthetic.html", url: "https://www.youtube.com/", siteRules: { "www.youtube.com": { hideKinds: ["watched"] } } });
    page.window.chrome.storage.local.set({ siteRules: { "www.youtube.com": { hideKinds: [] } } });
    await wait(700);
    check("an auto-hide still waiting to save is dropped when Watched is turned off", () => {
      assert.equal((page.store.hiddenItems || {})["https://www.youtube.com/watch?v=watched1234"], undefined);
      assert.ok(!page.document.getElementById("watched").classList.contains("hoa-removed"));
      assert.ok(page.document.querySelector("#watched [data-hoa-watched]"));
    });
    page.window.close();
  }
  {
    const page = await load({ html: "<div></div>", url: "https://www.youtube.com/watch?v=shortclip01", testSeam: true });
    fakeVideo(page, { duration: 30 }).play(30, .5); await wait(35);
    check("a short video played at 2x fills every slice it passed", () => {
      const entry = page.store.watchProgress["https://www.youtube.com/watch?v=shortclip01"];
      assert.ok(bucketCount(entry.buckets) >= 90, String(bucketCount(entry.buckets))); assert.equal(entry.watched, true);
    });
    page.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=abc123def45"; const later = { [key]: { title: "T", thumb: "", ts: 1 } };
    const state = page => { const entry = (page.store.watchProgress || {})[key] || {}; return { later: Boolean((page.store.watchLater || {})[key]), continuing: Boolean(entry.cw && !entry.watched), watched: Boolean(entry.watched) }; };
    const clip = await load({ html: "", url: key, watchLater: later, testSeam: true });
    const clipVideo = fakeVideo(clip, { duration: 40 }); clipVideo.play(12); await wait(30);
    check("a short clip moves from Watch Later to Continue Watching and is never in both", () => assert.deepEqual(state(clip), { later: false, continuing: true, watched: false }));
    clipVideo.play(25); await wait(30);
    check("a short clip finished moves on to Watched", () => assert.deepEqual(state(clip), { later: false, continuing: false, watched: true }));
    clip.window.close();
    const done = { [key]: { site: "youtube.com", title: "T", url: key, thumbnail: "", duration: 300, position: 299, played: 299, buckets: "f".repeat(25), watched: true, ts: 1, updated: 1 } };
    const again = await load({ html: "", url: key, watchLater: later, watchProgress: done, hiddenItems: { [key]: { title: "T", thumb: "", reason: "watched", listed: true, ts: 1 } }, testSeam: true });
    const againVideo = fakeVideo(again, { duration: 300 }); againVideo.play(13); await wait(30);
    check("a watched video saved to Watch Later again moves through Continue Watching as a new watch", () => { assert.deepEqual(state(again), { later: false, continuing: true, watched: false }); assert.equal(again.store.hiddenItems[key], undefined); });
    againVideo.play(280); await wait(30);
    check("finishing the new watch returns it to Watched", () => assert.deepEqual(state(again), { later: false, continuing: false, watched: true }));
    again.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=abc123def45";
    const page = await load({ html: '<div id="movie_player" class="html5-video-player ad-showing"></div>', url: key, watchLater: { [key]: { title: "T", thumb: "", ts: 1 } }, testSeam: true });
    const video = fakeVideo(page, { duration: 30 }); page.document.getElementById("movie_player").appendChild(video);
    video.play(30); await wait(30);
    check("a YouTube ad does not count as watching the video", () => { assert.equal((page.store.watchProgress || {})[key], undefined); assert.ok(page.store.watchLater[key]); });
    page.window.close();
  }
  {
    const card = inner => `<div class="carousel-default-styles__item--V3tCG" id="fan"><a href="/content/browse/details/Tombstone/12580">${inner}</a></div>`;
    const filled = '<img src="https://images2.vudu.com/p.jpg" alt="Tombstone"><div class="promo">Free to Watch</div>';
    const rules = { "athome.fandango.com": { enabled: true, hideKinds: ["free"] } };
    const named = await load({ html: card(filled), url: "https://athome.fandango.com/", siteRules: { "athome.fandango.com": { enabled: true } } });
    named.document.querySelector('#fan .hoa-actions [data-action="add"]').click(); await wait(30);
    check("a card's title is its poster's name, not the Free to Watch badge in its link", () => assert.equal(Object.values(named.store.addedItems)[0].title, "Tombstone"));
    named.window.close();
    const late = await load({ html: card(""), url: "https://athome.fandango.com/", siteRules: rules });
    const link = late.document.querySelector("#fan a");
    await wait(60);
    link.insertAdjacentHTML("beforeend", '<span></span>'); await wait(5);
    link.insertAdjacentHTML("beforeend", filled); await wait(5);
    check("a card that fills in after it appears is hidden by type at once", () => assert.ok(late.document.getElementById("fan").classList.contains("hoa-filtered")));
    late.window.close();
  }
  {
    const xumoHtml = '<div class="cardList"><ul class="listRow"><li class="card titleCard" id="xu"><a aria-label="Secret Window" href="/free-movies/secret-window/XM0EUS9EFUGFJT"><span class="card-image"><img alt="Secret Window" src="https://image.xumo.com/a.webp"><span class="card-nowPlaying">Now Playing</span></span></a></li></ul></div>';
    const key = "https://play.xumo.com/free-movies/secret-window/XM0EUS9EFUGFJT"; const siteRules = { "play.xumo.com": { enabled: true } };
    const named = await load({ html: xumoHtml, url: "https://play.xumo.com/free-movies", siteRules });
    named.document.querySelector('#xu .hoa-actions [data-action="add"]').click(); await wait(30);
    check("a title in a link's label beats the Now Playing text inside it", () => assert.equal(named.store.addedItems[key].title, "Secret Window"));
    named.window.close();
    const healed = await load({ html: xumoHtml, url: "https://play.xumo.com/free-movies", siteRules, addedItems: { [key]: { title: "Now Playing", thumb: "", ts: 1 } } });
    await wait(950);
    check("a video already saved under a badge gets its name and picture from its card", () => { assert.equal(healed.store.addedItems[key].title, "Secret Window"); assert.equal(healed.store.addedItems[key].thumb, "https://image.xumo.com/a.webp"); });
    healed.window.close();
    const filling = await load({ html: '<li class="card titleCard" id="xu"><a href="/free-movies/secret-window/XM0EUS9EFUGFJT"></a></li>', url: "https://play.xumo.com/free-movies", siteRules, addedItems: { [key]: { title: "Now Playing", thumb: "", ts: 1 } } });
    await wait(40);
    const fillingLink = filling.document.querySelector("#xu a"); fillingLink.setAttribute("aria-label", "Secret Window");
    fillingLink.insertAdjacentHTML("beforeend", '<img alt="Secret Window" src="https://image.xumo.com/a.webp"><span>Now Playing</span>'); await wait(950);
    check("a saved video is repaired even when its card fills in late", () => assert.equal(filling.store.addedItems[key].title, "Secret Window"));
    filling.window.close();
    const kept = await load({ html: xumoHtml, url: "https://play.xumo.com/free-movies", siteRules, addedItems: { [key]: { title: "My own name", thumb: "https://image.xumo.com/mine.webp", ts: 1 } } });
    await wait(950);
    check("a saved video with a proper name and picture is left alone", () => { assert.equal(kept.store.addedItems[key].title, "My own name"); assert.equal(kept.store.addedItems[key].thumb, "https://image.xumo.com/mine.webp"); });
    kept.window.close();
    const lazyHtml = '<li class="card titleCard" id="xu"><a aria-label="Lazy" href="/free-movies/lazy/XM1"><span class="card-image"><img alt="Lazy" src="data:image/gif;base64,R0lGOD" data-src="https://image.xumo.com/lazy.webp"></span></a></li>';
    const lazy = await load({ html: lazyHtml, url: "https://play.xumo.com/free-movies", siteRules });
    lazy.document.querySelector('#xu .hoa-actions [data-action="add"]').click(); await wait(30);
    check("a picture the site hasn't loaded yet is still saved", () => assert.equal(Object.values(lazy.store.addedItems)[0].thumb, "https://image.xumo.com/lazy.webp"));
    lazy.window.close();
    const grow = await load({ html: xumoHtml, url: "https://play.xumo.com/free-movies", siteRules, testSeam: true });
    const card = grow.document.getElementById("xu"); const bar = card.querySelector(".hoa-actions");
    card.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 300, width: 200, height: 300, x: 0, y: 0 }); grow.test.apply(); const rest = bar.style.left;
    const nativeMatches = card.matches.bind(card); card.matches = selector => selector === ":hover" || nativeMatches(selector);
    card.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 420, width: 320, height: 420, x: 0, y: 0 });
    card.dispatchEvent(new grow.window.MouseEvent("mouseenter")); grow.test.apply();
    check("buttons stay put when a card grows under the pointer", () => { assert.ok(rest); assert.equal(bar.style.left, rest); });
    card.matches = nativeMatches; grow.window.close();
    const back = await load({ html: xumoHtml, url: "https://play.xumo.com/free-movies", siteRules, hiddenItems: { [key]: { title: "Secret Window", thumb: "", listed: true, ts: 1 } } });
    let resized = 0; back.window.addEventListener("resize", () => { resized += 1; });
    check("the hidden card starts hidden", () => assert.ok(back.document.getElementById("xu").classList.contains("hoa-removed")));
    back.window.chrome.storage.local.set({ hiddenItems: {} }); await wait(120);
    check("a restored card appears and the page is told its layout changed", () => { assert.ok(!back.document.getElementById("xu").classList.contains("hoa-removed")); assert.ok(resized >= 1); });
    back.window.close();
  }
  {
    const taught = { "taught.example": { enabled: true, pickedSelectors: ["div.ep"] } };
    const page = await load({ url: "https://taught.example/show/conan", siteRules: taught, html: '<h1>Detective Conan</h1><section><h2>Popular</h2>' + ["Popular|/watch/1|https://taught.example/a.jpg", "3- الحلقة الثالثة|/watch/3|", "Video card|/watch/4|"].map((row, index) => { const [label, href] = row.split("|"); return `<div class="ep" id="ep${index}"><a href="${href}" aria-label="${index === 2 ? "Video card" : ""}"><img alt="${index === 0 ? "The real name" : ""}" src="https://taught.example/p${index}.jpg"><span class="title">${label}</span></a></div>`; }).join("") + '</section>' });
    ["ep0", "ep1", "ep2"].forEach(id => page.document.querySelector(`#${id} .hoa-actions [data-action="add"]`).click()); await wait(40);
    const titles = Object.fromEntries(Object.entries(page.store.addedItems).map(([key, entry]) => [key.split("/").pop(), entry.title]));
    check("a card titled like its row is saved under its own name", () => assert.equal(titles["1"], "The real name"));
    check("an episode number is saved with its show's name", () => assert.equal(titles["3"], "Detective Conan – 3- الحلقة الثالثة"));
    check("a generic label such as Video card is never a name", () => assert.notEqual(titles["4"], "Video card"));
    page.window.close();
  }
  {
    const key = "https://taught.example/watch/1123";
    const page = await load({ url: key, html: '<meta property="og:image" content="https://taught.example/cover.webp"><h1>Grendizer</h1>', siteRules: { "taught.example": { enabled: true, pickedSelectors: ["div.card"] } }, addedItems: { [key]: { title: "taught.example", thumb: "", ts: 1 } }, setup: window => { window.document.title = "Grendizer | Cartoony"; } });
    await wait(950);
    check("a saved video with no name of its own takes its page's name and picture when opened", () => { assert.equal(page.store.addedItems[key].title, "Grendizer"); assert.equal(page.store.addedItems[key].thumb, "https://taught.example/cover.webp"); });
    page.window.close();
  }
  {
    const taught = { "taught.example": { enabled: true, pickedSelectors: ["div.tile"] } };
    const tile = (id, href, inner) => `<div class="tile" id="${id}"><a href="${href}">${inner}</a></div>`;
    const html = '<h1>Welcome to Plex!</h1><div class="row">'
      + tile("plex", "/show/snowpiercer/season/2/episode/1", '<img alt="" src="https://taught.example/s.jpg"><span class="title">Snowpiercer - Season 2 • Episode 1 - The Time of the Gun</span>')
      + tile("actor", "/person/norman-reedus", '<img alt="" src="https://taught.example/n.jpg"><span class="title">Norman Reedus • Scud</span>')
      + tile("meta", "/details/hangar-10", '<img alt="" src="https://taught.example/h.jpg"><span class="title">2014 • UR • 1h 47mDetails</span>')
      + '<div class="tile" id="vim"><a href="/123456"><img alt="" src="https://taught.example/v.jpg"></a></div><a href="/123456" class="caption">A Vimeo short</a></div>';
    const page = await load({ url: "https://taught.example/", siteRules: taught, html });
    ["plex", "actor", "meta", "vim"].forEach(id => page.document.querySelector(`#${id} .hoa-actions [data-action="add"]`).click()); await wait(40);
    const titles = Object.fromEntries(Object.entries(page.store.addedItems).map(([key, entry]) => [key.replace("https://taught.example", ""), entry.title]));
    check("a full episode name gets no page heading in front of it", () => assert.equal(titles["/show/snowpiercer/season/2/episode/1"], "Snowpiercer - Season 2 • Episode 1 - The Time of the Gun"));
    check("a person is saved by name, without the role they play", () => assert.equal(titles["/person/norman-reedus"], "Norman Reedus"));
    check("a details line is never a name", () => assert.ok(!/UR|Details/.test(titles["/details/hangar-10"])));
    check("a name beside the picture, in another link to the same page, is found", () => assert.equal(titles["/123456"], "A Vimeo short"));
    page.window.close();
    const key = "https://taught.example/details/hangar-10";
    const pageHtml = '<html><head><title>Hangar 10 | Taught</title><meta property="og:image" content="/posters/hangar.jpg"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Movie","name":"Hangar 10","datePublished":"2014-06-01"}</script></head><body></body></html>';
    const fetched = [];
    const rich = await load({ url: "https://taught.example/", siteRules: taught, html: tile("meta", "/details/hangar-10", '<span class="title">2014 • UR • 1h 47mDetails</span>'),
      setup: window => { window.fetch = async url => { fetched.push(String(url)); return { ok: true, headers: { get: () => "text/html" }, text: async () => pageHtml }; }; } });
    rich.document.querySelector('#meta .hoa-actions [data-action="add"]').click(); await wait(200);
    check("a saved video takes its name, year, type and picture from its own page", () => {
      const entry = rich.store.addedItems[key];
      assert.deepEqual([entry.title, entry.year, entry.type, entry.thumb], ["Hangar 10", 2014, "movie", "https://taught.example/posters/hangar.jpg"]);
      assert.deepEqual(fetched, [key]);
    });
    rich.window.close();
    const outside = await load({ url: "https://taught.example/", siteRules: taught, addedItems: { "https://other.example/x": { title: "other.example", thumb: "", ts: 1 } }, html: "",
      setup: window => { window.fetch = async url => { fetched.push(String(url)); throw new Error("no"); }; } });
    await wait(100);
    check("only the open site's own pages are ever read", () => assert.ok(!fetched.some(url => url.startsWith("https://other.example"))));
    outside.window.close();
  }
  {
    // The private-window Added Videos page borrows youtube.com/robots.txt: the feed engine stays out of it.
    const page = await load({ fixture: "youtube.html", url: "https://www.youtube.com/robots.txt#addorhide-added", siteRules: { "www.youtube.com": { hideKinds: ["watched"] } } });
    await wait(200);
    check("the hosted Added Videos page gets no feed buttons, tags or hiding", () => {
      assert.equal(page.document.querySelectorAll(".hoa-actions, [data-hoa-watched], .hoa-removed, .hoa-filtered").length, 0);
    });
    const hostedStatus = await page.status();
    check("the hosted Added Videos page does not answer the popup as a site", () => assert.equal(hostedStatus, null));
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube.html", url: "https://www.youtube.com/" });
    check("filters: nothing is filtered while no filter is on", () => assert.strictEqual(
      page.document.querySelectorAll(".hoa-filtered").length, 0));
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube-categories.synthetic.html", url: "https://www.youtube.com/",
      siteRules: { "www.youtube.com": { hideKinds: ["watched"] } } });
    await wait(600);
    check("filters: Watched stores and hides watched cards", () => {
      assert.ok(page.document.getElementById("watched").classList.contains("hoa-removed"));
      assert.equal(page.store.hiddenItems["https://www.youtube.com/watch?v=watched1234"].reason, "watched");
    });
    check("filters: a zero-width watched segment is not treated as watched", () => assert.ok(
      !page.document.getElementById("unwatched-progress").classList.contains("hoa-removed")));
    page.window.chrome.storage.local.set({ hiddenItems: {}, watchedShown: { "https://www.youtube.com/watch?v=watched1234": Date.now() } });
    await wait(120);
    check("filters: restored watched keys are not auto-hidden", () => assert.ok(!page.document.getElementById("watched").classList.contains("hoa-removed")
      && !page.document.getElementById("watched").classList.contains("hoa-filtered")));
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube-categories.synthetic.html", url: "https://www.youtube.com/",
      siteRules: { "www.youtube.com": { hideKinds: ["live", "posts", "fundraisers"] } } });
    // A copy of the live card on a page YouTube keeps in the DOM but hides (the previous page).
    const old = page.document.createElement("div");
    old.setAttribute("hidden", "");
    old.innerHTML = '<ytd-rich-item-renderer><a href="/watch?v=old12345678"><span class="badge-style-type-live-now">LIVE</span></a><h3 id="video-title">Old live</h3></ytd-rich-item-renderer>';
    page.document.body.appendChild(old);
    await wait(300);
    const reply = await page.status();
    check("status: filtered videos and sections are counted once, current page only", () => {
      assert.ok(reply, "status handler answered");
      assert.equal(reply.filteredVideos, 1);
      assert.equal(reply.filteredSections, 2);
      assert.equal(reply.channelVideos, 0);
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube-categories.synthetic.html", url: "https://www.youtube.com/" });
    check("YouTube watched cards mark a thumbnail for the CSS Watched label", () => assert.ok(page.document.querySelector("#watched [data-hoa-watched]")));
    check("YouTube watched label uses the thumbnail, not the clipped progress host", () => {
      const label = page.document.querySelector("#watched [data-hoa-watched]");
      assert.equal(label.tagName.toLowerCase(), "yt-thumbnail-view-model");
      assert.notEqual(label.className, "ytThumbnailOverlayProgressBarHost");
    });
    const progress = page.document.querySelector("#watched ytd-thumbnail-overlay-resume-playback-renderer");
    progress.remove();
    await wait(180);
    check("YouTube recycled cards lose the watched mark", () => assert.equal(page.document.querySelector("#watched [data-hoa-watched]"), null));
    check("YouTube channel action is present and the float bar mirrors it", () => {
      assert.ok(buttons(page.document.getElementById("blocked"), "channel"));
    });
    page.window.chrome.storage.local.set({ hiddenChannels: { "youtube.com|/@blockedchan": { key: "youtube.com|/@blockedchan", name: "Blocked Channel", url: "https://www.youtube.com/@blockedchan", ts: Date.now(), nameKey: "youtube.com|name:blocked channel" } } });
    await wait(120);
    check("hidden channels filter only their cards", () => {
      assert.ok(page.document.getElementById("blocked").classList.contains("hoa-filtered"));
      assert.ok(!page.document.getElementById("other").classList.contains("hoa-filtered"));
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube-categories.synthetic.html", url: "https://www.youtube.com/" });
    const watched = page.document.getElementById("watched");
    buttons(watched, "hide").click();
    await wait(100);
    check("manual Hide on a watched card records watched without an auto-hide reason", () => {
      const entry = page.store.hiddenItems["https://www.youtube.com/watch?v=watched1234"];
      assert.equal(entry.watched, true); assert.equal(entry.reason, undefined);
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube-categories.synthetic.html", url: "https://www.youtube.com/",
      siteRules: { "www.youtube.com": { hideKinds: ["gaming"] } } });
    await wait(120);
    check("gaming title terms hide gameplay while leaving ordinary titles", () => {
      assert.ok(page.document.getElementById("gaming-title").classList.contains("hoa-filtered"));
      assert.ok(!page.document.getElementById("party").classList.contains("hoa-filtered"));
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "youtube-categories.synthetic.html", url: "https://www.youtube.com/@blockedchan/videos",
      siteRules: { "www.youtube.com": { hideKinds: ["comments"] } } });
    page.window.chrome.storage.local.set({ hiddenChannels: { "youtube.com|/@blockedchan": { key: "youtube.com|/@blockedchan", name: "Blocked Channel", url: "https://www.youtube.com/@blockedchan", ts: Date.now() } } });
    await wait(120);
    check("hidden channels do not hide cards on their own channel page", () => assert.ok(!page.document.getElementById("blocked").classList.contains("hoa-filtered")));
    check("channel pages do not offer a hide-channel action", () => assert.equal(buttons(page.document.getElementById("blocked"), "channel"), null));
    check("comments category hides the comments container", () => assert.ok(page.document.getElementById("comments").classList.contains("hoa-filtered")));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/xumo-rows.html", url: "https://play.xumo.com/free-movies/",
      siteRules: { "play.xumo.com": { enabled: true, hideKinds: ["popular"] } } });
    check("filters: Xumo Most Popular hides only its row", () => {
      assert.ok(page.document.getElementById("582924").classList.contains("hoa-filtered"));
      assert.ok(!page.document.getElementById("582926").classList.contains("hoa-filtered"));
      assert.ok(page.document.querySelector('li a[aria-label="Most Popular"]').closest("li").classList.contains("hoa-filtered"));
    });
    check("filters: Xumo section title excludes View All", () => assert.equal(page.document.getElementById("582924").querySelector("h2").textContent, "Most Popular"));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/xumo-rows.html", url: "https://play.xumo.com/free-movies/",
      siteRules: { "play.xumo.com": { enabled: true, hideKinds: ["special"], hideSections: ["Comedy", "sci-fi & fantasy"] } } });
    check("filters: Xumo special and named genre rows hide", () => {
      assert.ok(page.document.getElementById("582926").classList.contains("hoa-filtered"));
      ["Comedy", "Sci-Fi & Fantasy"].forEach(title => assert.ok(Array.from(page.document.querySelectorAll(".cardList")).find(row => row.querySelector("h2") && row.querySelector("h2").textContent.trim() === title).classList.contains("hoa-filtered")));
      ["Comedy", "Sci-Fi & Fantasy"].forEach(title => assert.ok(page.document.querySelector(`li a[aria-label="${title}"]`).closest("li").classList.contains("hoa-filtered"), `${title} rail entry follows its hidden row`));
    });
    check("filters: Xumo promo title comes from href and row promo gets no actions", () => {
      const promos = page.document.querySelectorAll("li.promoCard");
      assert.equal(promos[0].querySelector(".hoa-actions").hoaData.title, "Wyatt Earp 2");
      assert.equal(promos[1].querySelector(".hoa-actions"), null);
      assert.ok(promos[1].classList.contains("hoa-filtered"), "row promo follows the filtered row on the first pass");
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/xumo-rows.html", url: "https://play.xumo.com/free-movies/",
      siteRules: { "play.xumo.com": { enabled: true, hideKinds: ["special"], hideKeywords: ["Wyatt"], featuredCarousels: false } }, testSeam: true });
    const normal = page.document.createElement("li");
    normal.className = "card titleCard";
    normal.innerHTML = '<a aria-label="Wyatt ordinary" href="/free-movies/wyatt-ordinary/X-test">Wyatt ordinary</a>';
    page.document.getElementById("582924").querySelector("ul").appendChild(normal);
    page.test.apply();
    check("Xumo excluded featured promos stay visible while ordinary keyword matches hide", () => {
      const promos = page.document.querySelectorAll("li.promoCard");
      assert.ok(!promos[0].classList.contains("hoa-filtered"), "video promo is kept when featured carousels are excluded");
      assert.ok(!promos[1].classList.contains("hoa-filtered"), "row promo is kept when its target row is hidden but Featured is excluded");
      assert.ok(normal.classList.contains("hoa-filtered"), "ordinary Wyatt card still matches the keyword");
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/xumo-tv-rows.html", url: "https://play.xumo.com/tv-shows/",
      siteRules: { "play.xumo.com": { enabled: true, hideKinds: ["special"], hideSections: ["Crime TV"] } } });
    check("filters: Xumo TV classifies special and named rows", () => {
      assert.ok(page.document.getElementById("556825").classList.contains("hoa-filtered"));
      assert.ok(page.document.getElementById("33108").classList.contains("hoa-filtered"));
      assert.ok(!page.document.getElementById("539123").classList.contains("hoa-filtered"));
    });
    const status = await page.status();
    check("Xumo status keeps fixed rows outside Genres while listing lazy genre rows", () => {
      assert.deepEqual(status.rows.slice(0, 4), [
        { title: "Season of Scares", kind: "special", listed: false }, { title: "Editor's Picks", kind: "editors", listed: false },
        { title: "Westerns", kind: "genre", listed: true }, { title: "Crime TV", kind: "genre", listed: true }
      ]);
    });
    page.window.close();
  }
  {
    // Live Tubi markup (home, 2026-11-02): the Creatorverse row is headed by a logo image plus a tagline.
    const html = '<section id="creators"><div class="CiW8z"></div><div data-test-id="web-ui-grid-container" class="web-grid-container"><a class="web-row-header web-row-header--link" href="/category/creators"><div class="web-row-header__title"><div class="YCElA"><img src="https://mcdn.tubitv.com/image/creatorverse/creatorverse-logo-large.png" alt="Creatorverse"><div class="Nnp1e">Step inside for big names, breakout stars, and fresh finds.</div></div></div></a></div><div data-test-id="web-ui-grid-container"></div></section>';
    const page = await load({ html, url: "https://tubitv.com/", siteRules: { "tubitv.com": { enabled: true, hideSections: ["Creatorverse"] } } });
    check("Tubi logo-headed row is named by its logo, not its tagline", () => assert.ok(page.document.getElementById("creators").classList.contains("hoa-filtered")));
    const status = await page.status();
    check("Tubi status lists Creatorverse", () => assert.equal(status.rows[0].title, "Creatorverse"));
    page.window.close();
  }
  {
    const html = '<section id="international"><h2>International Films</h2><div data-test-id="web-ui-grid-container"></div></section><section id="recommended"><h2>Recommended</h2><div data-test-id="web-ui-grid-container"></div></section>';
    const page = await load({ html, url: "https://tubitv.com/", siteRules: { "tubitv.com": { enabled: true, hideKinds: ["recommended"], hideSections: ["International Films", "Recommended"] } } });
    check("Tubi named rows include International Films and typed Recommended rows", () => {
      assert.ok(page.document.getElementById("international").classList.contains("hoa-filtered"));
      assert.ok(page.document.getElementById("recommended").classList.contains("hoa-filtered"));
    });
    const status = await page.status();
    check("Tubi status lists named rows while retaining their type", () => assert.deepEqual(status.rows, [
      { title: "International Films", kind: "foreign", listed: true }, { title: "Recommended", kind: "recommended", listed: true }
    ]));
    page.window.close();
  }
  {
    const rows = [
      ["sites/fandango-sections.synthetic.html", "https://athome.fandango.com/", "drama"],
      ["sites/crunchyroll-sections.synthetic.html", "https://www.crunchyroll.com/browse", "action"],
      ["sites/vix-sections.synthetic.html", "https://vix.com/", "drama"]
    ];
    for (const [fixture, url, id] of rows) {
      const host = new URL(url).hostname;
      const page = await load({ fixture, url, siteRules: { [host]: { enabled: true, hideSections: [id === "action" ? "Action" : "Drama"] } } });
      const status = await page.status();
      check(`filters: ${fixture} has clean listed row titles and hides its named row`, () => {
        assert.ok(page.document.getElementById(id).classList.contains("hoa-filtered"));
        assert.ok(status.rows.some(row => row.title === (id === "action" ? "Action" : "Drama") && row.listed));
      });
      page.window.close();
    }
    const page = await load({ fixture: "sites/shout-sections.synthetic.html", url: "https://shout-tv.com/",
      siteRules: { "shout-tv.com": { enabled: true, hideSections: ["Featured", "Recommended"] } } });
    const status = await page.status();
    check("filters: Shout featured hero is listed and hides by name", () => {
      assert.ok(page.document.getElementById("hero").classList.contains("hoa-filtered"));
      assert.ok(page.document.getElementById("recommended").classList.contains("hoa-filtered"));
      assert.deepEqual(status.rows, [
        { title: "Featured", kind: "featured", listed: true }, { title: "Recommended", kind: "recommended", listed: true }
      ]);
    });
    page.window.close();
  }
  {
    const html = '<div class="buttonList railNav"><ul class="buttonRow"><li><a aria-label="Something New">Something New</a></li><li><a aria-label="Editor’s Picks">Editor’s Picks</a></li><li><a aria-label="Comedy">Comedy</a></li></ul></div>'
      + '<div class="cardList cardListType-promo"><div class="listHeader"><h2>Featured</h2></div><ul><li class="card promoCard"><a href="/free-movies/featured/X1">Featured</a></li></ul></div>'
      + '<div class="cardList" id="temporary"><div class="listHeader"><h2>Something New</h2></div><ul><li class="card titleCard"><a href="/free-movies/new/X2">New</a></li></ul></div>'
      + '<div class="cardList" id="editors"><div class="listHeader"><h2>Editor’s Picks</h2></div><ul><li class="card titleCard"><a href="/free-movies/editor/X3">Editor</a></li></ul></div>'
      + '<div class="cardList" id="genre"><div class="listHeader"><h2>Comedy</h2></div><ul><li class="card titleCard"><a href="/free-movies/comedy/X4">Comedy</a></li></ul></div>';
    const page = await load({ html, url: "https://play.xumo.com/free-movies/", siteRules: { "play.xumo.com": { enabled: true, hideKinds: ["special"] } } });
    check("Xumo positional special applies only above Editor's Picks", () => {
      assert.ok(page.document.getElementById("temporary").classList.contains("hoa-filtered"));
      assert.ok(!page.document.getElementById("genre").classList.contains("hoa-filtered"));
    });
    page.window.close();
  }
  {
    const html = '<li class="movie" id="tv-y7-fv"><a itemprop="url" href="/movie/kid">Kids show</a><span>TV-Y7-FV</span></li>';
    const page = await load({ html, url: "https://therokuchannel.roku.com/",
      siteRules: { "therokuchannel.roku.com": { enabled: true, hideKinds: ["kids"] } } });
    check("filters: Roku kids ratings normalise TV-Y7-FV", () => assert.ok(
      page.document.getElementById("tv-y7-fv").classList.contains("hoa-filtered")));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/roku.html", url: "https://therokuchannel.roku.com/",
      siteRules: { "therokuchannel.roku.com": { enabled: true, hideKinds: ["unsafe-kids"] } } });
    check("filters: Roku unsafe ratings hide TV14 cards and keep TVG", () => {
      assert.ok(page.document.querySelector('li[aria-label="Forensic Files"].hoa-filtered'));
      assert.ok(!page.document.querySelector('li[aria-label="Bewitched"].hoa-filtered'));
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/roku.html", url: "https://therokuchannel.roku.com/",
      siteRules: { "therokuchannel.roku.com": { enabled: true } } });
    const movie = page.document.querySelector('li.movie[aria-label="Coraline"]');
    const series = page.document.querySelector('li.series[aria-label="Bewitched"]');
    buttons(movie, "add").click(); await wait(25);
    buttons(series, "add").click(); await wait(25);
    check("Roku Add follows a movie's WatchAction door but leaves a series on details", () => {
      assert.ok(page.store.addedItems["https://app.roku.com/watch/c0734dbe498259cf87ec6f049b015eed"]);
      assert.strictEqual(page.store.addedItems["https://app.roku.com/watch/c0734dbe498259cf87ec6f049b015eed"].title, "Coraline");
      assert.strictEqual(page.store.addedItems["https://app.roku.com/watch/c0734dbe498259cf87ec6f049b015eed"].type, "movie");
      assert.ok(page.store.addedItems["https://app.roku.com/details/f0cbab7bd40e550eb7181f772ae798a6/bewitched"]);
    });
    page.window.close();
  }
  {
    const former = "https://therokuchannel.roku.com/details/c0734dbe498259cf87ec6f049b015eed/coraline";
    // Saved before The Roku Channel moved: it now lives at app.roku.com.
    const current = "https://app.roku.com/watch/c0734dbe498259cf87ec6f049b015eed";
    const page = await load({ fixture: "sites/roku.html", url: "https://therokuchannel.roku.com/",
      siteRules: { "therokuchannel.roku.com": { enabled: true } }, testSeam: true,
      hiddenItems: { [former]: { title: "Coraline", thumb: "", ts: 1, listed: true } },
      addedItems: { [former]: { title: "Coraline", thumb: "", ts: 1 } }, watchedShown: { [former]: 1 } });
    const writes = page.writes.length;
    check("Roku player-link migration keeps hidden, added and watched state under the watch key", () => {
      assert.ok(page.document.querySelector('li.movie[aria-label="Coraline"]').classList.contains("hoa-removed"));
      ["hiddenItems", "addedItems", "watchedShown"].forEach(name => {
        assert.equal(page.store[name][former], undefined, name);
        assert.ok(page.store[name][current], name);
      });
      assert.equal(writes, 1, "one batched migration write");
    });
    page.test.apply(); await wait(25);
    check("Roku player-link migration does not write again on later passes", () => assert.equal(page.writes.length, writes));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/pluto.html", url: "https://pluto.tv/us/movies/",
      siteRules: { "pluto.tv": { enabled: true, hideKeywords: ["Ice Cube"] } } });
    check("filters: Pluto page-data cast names are keyword searchable", () => assert.ok(
      page.document.querySelector('a[aria-label="Friday"]').closest(".swiper-slide").classList.contains("hoa-filtered")));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/pluto.html", url: "https://pluto.tv/us/movies/",
      siteRules: { "pluto.tv": { enabled: true, hideKinds: ["unsafe-kids"] } } });
    check("filters: Pluto unsafe ratings use embedded page data", () => {
      assert.ok(page.document.querySelector('a[aria-label="Friday"]').closest(".swiper-slide").classList.contains("hoa-filtered"));
      assert.ok(page.document.querySelector('a[aria-label="Little Nicky"]').closest(".swiper-slide").classList.contains("hoa-filtered"));
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/kick.html", url: "https://kick.com/categories", siteRules: { "kick.com": { enabled: true, hideKinds: ["gambling"] } } });
    check("filters: Kick gambling category filters captured gambling cards", () => assert.ok(page.document.querySelectorAll(".hoa-filtered").length >= 1));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/rumble.html", url: "https://rumble.com/", siteRules: { "rumble.com": { enabled: true, hideKinds: ["live"] } } });
    check("filters: Rumble Live filters live cards", () => assert.ok(page.document.querySelectorAll("rum-video-thumbnail.hoa-filtered").length >= 1));
    check("Rumble keys strip every query parameter", () => page.document.querySelectorAll(".hoa-actions").forEach(actions => assert.ok(!actions.hoaData.key.includes("?"))));
    page.window.close();
  }
  {
    const base = await load({ fixture: "sites/tubi-featured.html", url: "https://tubitv.com/" });
    // The real capture: two cards have links; the third (not yet in view on Tubi) has none, so it gets no buttons.
    check("Tubi featured cards with links receive buttons", () => assert.equal(base.document.querySelectorAll(".hoa-actions").length, 2));
    base.window.close();
    const page = await load({ fixture: "sites/tubi-featured.html", url: "https://tubitv.com/", siteRules: { "tubitv.com": { hideKeywords: ["Comedy"] } } });
    check("filters: Tubi featured cards match hidden genre text", () => assert.ok(page.document.querySelectorAll(".hoa-filtered").length >= 1));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/tubi-featured.html", url: "https://tubitv.com/", siteRules: { "tubitv.com": { hideKeywords: ["Looney Tunes"] } } });
    const looney = Array.from(page.document.querySelectorAll("img[alt='Looney Tunes']"))[0];
    check("filters: a Tubi feature card without links still matches keywords (its slot is hidden)", () => assert.ok(looney && looney.closest(".hoa-filtered")));
    page.window.close();
  }
  {
    // This is a real feature-card copy with Tubi's delayed links removed. Its visible duration,
    // rather than an href, must identify it as a movie; the real Everybody Hates Chris card is a series.
    const movie = read("tests/fixtures/sites/tubi-featured.html")
      .replace(/\/series\/300015509\/everybody-hates-chris/g, "/movies/300015509/example-movie")
      .replace(/Everybody Hates Chris/g, "Example Movie")
      .replace("Comedy · 2009 ·  4 Seasons", "Comedy · 2008 · 1 hr 47 min")
      .replace(/<\/?a\b[^>]*>/g, "");
    const moviePage = await load({ html: movie, url: "https://tubitv.com/", siteRules: { "tubitv.com": { hideKinds: ["movies"] } } });
    check("filters: Tubi link-less feature movie is typed from its running time", () => assert.ok(
      Array.from(moviePage.document.querySelectorAll("h2")).find(node => node.textContent === "Example Movie").closest(".PQ8zO").classList.contains("hoa-filtered")));
    moviePage.window.close();
    const seriesPage = await load({ fixture: "sites/tubi-featured.html", url: "https://tubitv.com/", siteRules: { "tubitv.com": { hideKinds: ["series"] } } });
    check("filters: Tubi feature series is typed from Seasons and never as a movie", () => assert.ok(
      Array.from(seriesPage.document.querySelectorAll("h2")).find(node => node.textContent === "Everybody Hates Chris").closest(".PQ8zO").classList.contains("hoa-filtered")));
    seriesPage.window.close();
    const notMovie = await load({ fixture: "sites/tubi-featured.html", url: "https://tubitv.com/", siteRules: { "tubitv.com": { hideKinds: ["movies"] } } });
    check("filters: Everybody Hates Chris does not match Tubi Movies", () => assert.ok(
      !Array.from(notMovie.document.querySelectorAll("h2")).find(node => node.textContent === "Everybody Hates Chris").closest(".PQ8zO").classList.contains("hoa-filtered")));
    notMovie.window.close();
  }
  {
    const page = await load({ fixture: "sites/tubi-featured.html", url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["series"], featuredCarousels: false } } });
    check("filters: excluded Tubi feature carousel ignores series and Recommended types", () => {
      assert.equal(page.document.querySelectorAll(".hoa-filtered").length, 0);
      assert.ok(page.document.querySelector("h2").closest(".PQ8zO").querySelector('[data-action="hide"]'));
    });
    page.document.querySelector("h2").closest(".PQ8zO").querySelector('[data-action="hide"]').click();
    await wait(30);
    check("filters: Hide button still hides an excluded feature card", () => assert.ok(
      page.document.querySelector("h2").closest(".PQ8zO").classList.contains("hoa-removed")));
    page.window.close();
    const recommended = await load({ fixture: "sites/tubi-featured.html", url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["recommended"], featuredCarousels: false } } });
    check("filters: excluded Tubi feature carousel ignores Recommended", () => assert.equal(recommended.document.querySelectorAll(".hoa-filtered").length, 0));
    recommended.window.close();
    const normal = await load({ fixture: "sites/tubi-sections.html", url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["series"], featuredCarousels: false } } });
    check("filters: excluded featured carousels do not disable ordinary-row filtering", () => assert.ok(
      normal.document.querySelector('a[title="Watch The Neighborhood Show"]').closest('[data-test-id="web-ui-grid-item"]').classList.contains("hoa-filtered")));
    normal.window.close();
    const included = await load({ fixture: "sites/tubi-featured.html", url: "https://tubitv.com/", siteRules: { "tubitv.com": { hideKinds: ["series"] } } });
    check("filters: featured carousels are included by default", () => assert.ok(included.document.querySelectorAll(".hoa-filtered").length >= 2));
    included.window.close();
  }
  {
    const page = await load({ html: '<ul><li id="featured" class="featured series"><a itemprop="url" href="/series/example">Featured series</a></li></ul>',
      url: "https://therokuchannel.roku.com/", siteRules: { "therokuchannel.roku.com": { enabled: true, hideKinds: ["tv"], featuredCarousels: false } } });
    check("filters: Roku li.featured is a featured carousel card via featuredSelector", () => assert.ok(
      !page.document.getElementById("featured").classList.contains("hoa-filtered")));
    page.window.close();
  }
  {
    const html = '<div id="viewport" style="overflow:hidden"><div id="row" style="display:flex;flex-wrap:nowrap;transform:translateX(-1px)"><div id="slot"><div data-test-id="web-ui-content-tile"><a class="web-content-tile__poster-link" href="/series/1/large"></a><a class="web-content-tile__title">Large series</a></div></div><div id="other-slot"></div></div></div>';
    const page = await load({ html, url: "https://tubitv.com/", testSeam: true,
      siteRules: { "tubitv.com": { hideKinds: ["series"], featuredCarousels: false } } });
    const rect = width => () => ({ left: 0, right: width, width, height: 80, top: 0, bottom: 80 });
    page.document.getElementById("viewport").getBoundingClientRect = rect(100);
    page.document.getElementById("slot").getBoundingClientRect = rect(45);
    page.test.apply();
    check("filters: a large flex carousel slot with one card is featured without a site selector", () => assert.ok(
      !page.document.getElementById("slot").classList.contains("hoa-filtered")));
    page.window.close();
  }
  {
    const page = await load({ fixture: "tubi-slot.synthetic.html", url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["series"] } } });
    check("Tubi untracked feature card hides its carousel slot", () => assert.ok(
      page.document.getElementById("slot-one").classList.contains("hoa-filtered")));
    page.window.close();
  }
  {
    const page = await load({ fixture: "tubi-collapse.synthetic.html", url: "https://tubitv.com/",
      siteRules: { "tubitv.com": { hideKinds: ["movies"] } } });
    check("empty sections collapse only when every card is filtered", () => {
      assert.ok(page.document.getElementById("all-filtered").classList.contains("hoa-empty"));
      assert.ok(!page.document.getElementById("one-visible").classList.contains("hoa-empty"));
    });
    page.window.chrome.storage.local.set({ siteRules: { "tubitv.com": { hideKinds: [] } } });
    await wait(40);
    check("empty sections reappear when filtering turns off", () => assert.ok(
      !page.document.getElementById("all-filtered").classList.contains("hoa-empty")));
    page.window.close();
  }
  {
    const page = await load({ fixture: "tubi-collapse.synthetic.html", url: "https://tubitv.com/" });
    const card = page.document.createElement("div");
    card.setAttribute("data-test-id", "web-ui-content-tile");
    card.innerHTML = '<a class="web-content-tile__poster-link" href="/movies/100000004/incremental"></a><a class="web-content-tile__title" href="/movies/100000004/incremental">Incremental</a>';
    page.document.body.appendChild(card);
    await Promise.resolve();
    await Promise.resolve();
    check("added cards are processed in the observer microtask", () => assert.ok(buttons(card, "hide")));
    page.window.close();
  }
  {
    const page = await load({ fixture: "tubi-collapse.synthetic.html", url: "https://tubitv.com/", noBody: true });
    const body = page.document.createElement("body");
    body.innerHTML = '<div data-test-id="web-ui-content-tile"><a class="web-content-tile__poster-link" href="/movies/100000005/late-body"></a><a class="web-content-tile__title" href="/movies/100000005/late-body">Late body</a></div>';
    page.document.documentElement.appendChild(body);
    page.document.dispatchEvent(new page.window.Event("DOMContentLoaded"));
    await wait(40);
    check("document-start initialization waits for body and storage before processing cards", () => assert.ok(
      page.document.querySelector(".hoa-actions")));
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/odysee.html", url: "https://odysee.com/", siteRules: { "odysee.com": { enabled: true } } });
    const first = page.document.querySelector("li.claim-preview__wrapper");
    buttons(first, "channel").click();
    await wait(100);
    check("Odysee Hide channel filters that creator while keeping others", () => {
      assert.ok(first.classList.contains("hoa-filtered"));
      assert.ok(page.document.querySelectorAll("li.claim-preview__wrapper:not(.hoa-filtered)").length >= 1);
    });
    page.window.close();
  }
  {
    // PBS's app rewrites <html>'s attributes after load, wiping AddOrHide's marker; the script must keep running.
    const page = await load({ fixture: "sites/pbs-rows.html", url: "https://www.pbs.org/", siteRules: { "www.pbs.org": { enabled: true, hideSections: ["Texascentric"] } } });
    ["hoaInstance", "hoaExtension", "hoaVersion"].forEach(key => delete page.document.documentElement.dataset[key]);
    page.document.body.appendChild(page.document.createElement("div"));
    await wait(120);
    const status = await page.status();
    check("a wiped page marker is claimed back instead of retiring (PBS)", () => {
      assert.ok(page.document.documentElement.dataset.hoaInstance);
      assert.ok(status && status.active && status.rows.some(row => row.title === "Texascentric"));
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/rumble-rows.html", url: "https://rumble.com/", siteRules: { "rumble.com": { enabled: true } } });
    const status = await page.status();
    check("Rumble rows without a heading are not named from scripts or View All", () => {
      assert.ok(status.rows.length > 0);
      assert.ok(status.rows.every(row => row.title !== "View All" && !/window\.|function/.test(row.title)), JSON.stringify(status.rows.map(row => row.title)));
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/pluto-rows.html", url: "https://pluto.tv/us/movies",
      siteRules: { "pluto.tv": { enabled: true, hideSections: ["Featured Movies"] } } });
    const status = await page.status();
    check("Pluto rows are named, listed and not mistaken for featured slides", () => {
      // Pluto draws every row twice (small and medium layouts); the list names each once.
      assert.equal(status.rows.length, 5);
      assert.ok(["Most Popular Movies", "Featured Movies"].every(title => status.rows.some(row => row.title === title && row.listed)));
      assert.ok(status.rows.every(row => row.kind !== "featured"));
      assert.ok(Array.from(page.document.querySelectorAll("div.vds-carousel")).find(row => {
        const heading = row.querySelector(".vds-carousel__title-medium");
        return heading && heading.textContent.trim() === "Featured Movies";
      }).classList.contains("hoa-filtered"));
    });
    page.window.close();
    const movies = await load({ fixture: "sites/pluto-rows.html", url: "https://pluto.tv/us/movies",
      siteRules: { "pluto.tv": { enabled: true, hideKinds: ["movies"] } } });
    check("Pluto movie type filtering still applies to ordinary rows", () => assert.ok(movies.document.querySelectorAll(".hoa-filtered").length > 0));
    movies.window.close();
  }
  {
    const html = '<div id="row" class="roku-collection-row" data-row-title="Recently Added TV"><ul><li class="featured"><a itemprop="url" href="/series/example">Featured series</a></li></ul></div>';
    const page = await load({ html, url: "https://therokuchannel.roku.com/", siteRules: { "therokuchannel.roku.com": {
      enabled: true, featuredCarousels: false, hideSections: ["Recently Added TV"] } } });
    const status = await page.status();
    check("Roku featured rows are listed and hide by name when featured filtering is off", () => {
      assert.ok(page.document.getElementById("row").classList.contains("hoa-filtered"));
      assert.deepEqual(status.rows, [{ title: "Recently Added TV", kind: "featured", listed: true }]);
    });
    page.window.close();
  }
  {
    const cases = [
      ["rumble", "https://rumble.com/", "section.homepage-section", 'rum-text[variant="h3"]', "Sports", "Live"],
      ["twitch", "https://twitch.tv/", "div.find-me", "h2.tw-title", "Live on Twitch", "Just Chatting & IRL"],
      ["kick", "https://kick.com/", "section:has(> div > h2)", "h2", "Featured Creators", "Games"],
      ["odysee", "https://odysee.com/", "div.claim-grid__wrapper", ".claim-grid__title, h1.home__meme", "Featured", "Tech"],
      ["pbs", "https://pbs.org/", 'div[class*="_show_row"]', 'h2[class*="content_row_title"]', "Featured Shows", "Texascentric"]
    ];
    for (const [site, url, rowSelector, titleSelector, title, secondTitle] of cases) {
      const host = new URL(url).hostname;
      const page = await load({ fixture: `sites/${site}-rows.html`, url, siteRules: { [host]: { enabled: true, hideSections: [title] } } });
      const status = await page.status();
      const row = Array.from(page.document.querySelectorAll(rowSelector)).find(node => {
        const heading = node.querySelector(titleSelector);
        return heading && heading.textContent.replace(/\s+/g, " ").trim() === title;
      });
      check(`${site} Rows by name lists clean headings and removes the named row wrapper`, () => {
        assert.ok(status.rows.some(entry => entry.title === title && entry.listed));
        assert.ok(status.rows.some(entry => entry.title === secondTitle && entry.listed));
        assert.ok(row && (row.classList.contains("hoa-filtered") || row.closest(".hoa-filtered")));
      });
      page.window.close();
    }
  }
  {
    const page = await load({ fixture: "sites/rumble-rows.html", url: "https://rumble.com/",
      siteRules: { "rumble.com": { enabled: true, hideKinds: ["live"] } } });
    const live = page.document.getElementById("top_live_videos").closest("section.homepage-section");
    check("Rumble Live collapses its empty section without collapsing other rows", () => {
      assert.ok(live.classList.contains("hoa-empty") || live.closest(".hoa-empty"));
      const leaderboard = Array.from(page.document.querySelectorAll("section.homepage-section")).find(section => {
        const heading = section.querySelector('rum-text[variant="h3"]');
        return heading && heading.textContent.trim() === "Leaderboard";
      });
      assert.ok(!leaderboard.classList.contains("hoa-empty"));
    });
    page.window.close();
  }
  {
    const page = await load({ fixture: "sites/xumo-rows.html", url: "https://play.xumo.com/free-movies/", siteRules: { "play.xumo.com": { enabled: true } } });
    const status = await page.status();
    check("Xumo reports complete rows from its section navigation", () => assert.equal(status.rowsComplete, true));
    check("rendered rows are remembered without opening the popup", () => assert.ok(Array.isArray(page.store.seenRows && page.store.seenRows["play.xumo.com"]) || status.rows.length > 0));
    page.window.close();
  }
  {
    const html = '<h2 id="heading">Featured dramas</h2><div id="row"><article class="card">One</article><article class="card">Two</article></div><div id="untitled"><article class="card">Three</article><article class="card">Four</article></div>';
    const rule = { "rows.test": { enabled: true, pickedSelectors: [".card"], hideSections: ["Featured dramas"] } };
    const page = await load({ html, url: "https://rows.test/", siteRules: rule });
    const status = await page.status();
    check("taught flat rows use their preceding heading and ignore unnamed card groups", () => assert.deepEqual(status.rows, [{ title: "Featured dramas", kind: "genre", listed: true }]));
    check("hiding an auto row hides its external heading too", () => {
      assert.ok(page.document.getElementById("row").classList.contains("hoa-filtered"));
      assert.ok(page.document.getElementById("heading").classList.contains("hoa-filtered"));
    });
    page.window.close();
    const restored = await load({ html, url: "https://rows.test/", siteRules: { "rows.test": { enabled: true, pickedSelectors: [".card"] } } });
    check("unticking an auto row restores its row and external heading", () => {
      assert.ok(!restored.document.getElementById("row").classList.contains("hoa-filtered"));
      assert.ok(!restored.document.getElementById("heading").classList.contains("hoa-filtered"));
    });
    restored.window.close();
  }
  {
    const page = await load({ html: '<a class="video-link" href="/watch?v=abc123def45"><span class="title">Synthetic video</span></a>', url: "https://www.youtube.com/", siteRules: { "www.youtube.com": { enabled: true, hideKinds: ["watched"] } }, testSeam: true });
    const card = page.document.querySelector("a.video-link");
    check("a repeated apply does not append watched-pill controls", () => {
      page.test.apply(); page.test.apply(); assert.equal(card.querySelectorAll(".hoa-watched-remove").length, 0);
    });
    page.window.close();
  }
  {
    const page = await load({ html: "", url: "https://www.youtube.com/watch?v=abc123def45", testSeam: true });
    const video = fakeVideo(page);
    for (let second = 1; second <= 50; second += 1) { video.currentTime = second; video.fire("timeupdate"); }
    video.currentTime = 100; video.fire("ended"); await wait(15);
    const entry = page.store.watchProgress["https://www.youtube.com/watch?v=abc123def45"];
    check("partial 50 percent watch stays unwatched", () => assert.equal(entry.watched, false));
    check("seek then ended preserves only contiguous coverage", () => assert.ok(bucketCount(entry.buckets) < 90 && entry.position === 100));
    page.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=abc123def45";
    const page = await load({ html: "", url: key, testSeam: true, incognito: true });
    fakeVideo(page).play(120); await wait(35);
    check("incognito playback never records progress", () => assert.deepEqual(page.store.watchProgress || {}, {}));
    check("incognito playback does not relay frame progress", () => assert.deepEqual(page.window.__hoaSentMessages, []));
    page.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=abc123def45";
    const page = await load({ html: "", url: key, watchSettings: { tagWatched: false, continueWatching: "off" },
      siteRules: { "www.youtube.com": { hideKinds: [] } }, testSeam: true });
    const video = fakeVideo(page, { duration: 300 }); video.play(120); await wait(35);
    check("disabled watch features do not record playback", () => assert.deepEqual(page.store.watchProgress || {}, {}));
    await new Promise(resolve => page.window.chrome.storage.local.set({ watchSettings: { tagWatched: false, continueWatching: "auto" } }, resolve));
    await wait(15); video.play(40); await wait(35);
    check("enabling a watch feature starts recording from then", () => {
      assert.ok(page.store.watchProgress[key]); assert.ok(page.store.watchProgress[key].played <= 40.1);
    });
    page.window.close();
  }
  {
    const page = await load({ html: "", url: "https://www.youtube.com/watch?v=abc123def45", testSeam: true });
    const video = fakeVideo(page);
    for (let second = 1; second <= 95; second += 1) { video.currentTime = second; video.fire("timeupdate"); }
    video.fire("pause"); await wait(35);
    check("continuous 95 percent watch is tagged watched", () => assert.equal(page.store.watchProgress["https://www.youtube.com/watch?v=abc123def45"].watched, true));
    page.window.close();
  }
  {
    const saved = { "https://www.youtube.com/watch?v=abc123def45": { site: "youtube.com", title: "One", url: "https://www.youtube.com/watch?v=abc123def45", thumbnail: "", duration: 1000, position: 600, buckets: "0000000000000000000000000", watched: false, cw: "manual", played: 80, ts: 1, updated: 1 } };
    const page = await load({ html: "", url: "https://www.youtube.com/watch?v=abc123def45", watchProgress: saved, testSeam: true });
    const video = fakeVideo(page, { duration: 1000, paused: false });
    video.fire("play"); video.fire("play");
    check("resume seeks to exact 595 seconds once", () => assert.equal(video.currentTime, 595));
    check("resume displays Start over toast", () => assert.equal(page.document.querySelector("#hoa-toast button").textContent, "Start over"));
    page.document.querySelector("#hoa-toast button").click();
    check("Start over returns playback to zero", () => assert.equal(video.currentTime, 0));
    page.window.close();
  }
  {
    const page = await load({ html: "", url: "https://geo.dailymotion.com/player.html", testSeam: true, childFrame: true });
    const video = fakeVideo(page);
    video.currentTime = 1; video.fire("timeupdate"); video.fire("pause");
    check("frame child reports only raw playback fields", () => assert.deepEqual(Object.keys(page.window.__hoaSentMessages.at(-1).progress).sort(), ["bits", "covered", "duration", "playing", "position"]));
    page.window.close();
  }
  {
    const child = await load({ html: "", url: "https://geo.dailymotion.com/player.html", testSeam: true, childFrame: true });
    fakeVideo(child).play(50);
    const top = await load({ html: "", url: "https://www.youtube.com/watch?v=abc123def45", testSeam: true });
    await top.deliver(child.window.__hoaSentMessages.at(-1)); await wait(15);
    const entry = top.store.watchProgress["https://www.youtube.com/watch?v=abc123def45"];
    check("top relay owns the page key and metadata", () => assert.equal(entry.url, "https://www.youtube.com/watch?v=abc123def45"));
    check("top relay merges raw frame buckets and coverage", () => assert.equal(entry.played, 50));
    child.window.close(); top.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=abc123def45";
    const page = await load({ html: "", url: key, testSeam: true });
    fakeVideo(page).play(95);
    await wait(35);
    const entry = page.store.watchProgress[key];
    const cards = await load({ html: `<ytd-rich-item-renderer id="watched"><a id="thumbnail" href="/watch?v=abc123def45"><img></a><a id="video-title" href="/watch?v=abc123def45">Watched</a></ytd-rich-item-renderer>`, url: "https://www.youtube.com/", siteRules: { "www.youtube.com": { hideKinds: ["watched"] } }, watchProgress: { [key]: entry }, testSeam: true });
    check("watched type-on hides and saves watched reason", () => assert.equal(cards.document.getElementById("watched").classList.contains("hoa-removed"), true));
    await wait(550);
    check("watched hide saves reason watched", () => assert.equal(cards.store.hiddenItems[key].reason, "watched"));
    page.window.close(); cards.window.close();
  }
  {
    const page = await load({ html: "", url: "https://www.youtube.com/watch?v=abc123def45", testSeam: true });
    const ad = fakeVideo(page, { duration: 15 }); const main = fakeVideo(page, { duration: 100 });
    page.test.findPlayer(); main.play(30);
    await wait(45);
    const entry = page.store.watchProgress["https://www.youtube.com/watch?v=abc123def45"];
    check("a 15-second ad beside the main video is ignored", () => assert.equal(entry.duration, 100));
    check("main video is selected instead of the ad", () => assert.equal(entry.position, 30));
    page.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=onceonly123";
    const first = await load({ html: '<ytd-watch-metadata><h1>First title</h1></ytd-watch-metadata>', url: key, testSeam: true });
    fakeVideo(first).play(40); await wait(45);
    const resumedStore = first.store.watchProgress; first.window.close();
    const second = await load({ html: '<ytd-watch-metadata><h1>Updated title</h1></ytd-watch-metadata>', url: key, watchProgress: resumedStore, testSeam: true });
    fakeVideo(second).play(40); await wait(45);
    check("two YouTube page loads continue the same canonical progress entry", () => {
      assert.deepEqual(Object.keys(second.store.watchProgress), [key]);
      assert.ok(second.store.watchProgress[key].position >= resumedStore[key].position);
    });
    second.window.close();
  }
  for (const [mode, seconds, expected] of [["auto", 40, "auto"], ["manual", 40, "auto"], ["off", 120, undefined]]) {
    const page = await load({ html: "", url: "https://www.youtube.com/watch?v=abc123def45", watchSettings: { continueWatching: mode }, testSeam: true });
    fakeVideo(page).play(seconds);
    await wait(45);
    check(`${mode} Continue Watching mode saves the expected state`, () => assert.equal(page.store.watchProgress["https://www.youtube.com/watch?v=abc123def45"].cw, expected));
    page.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=abc123def45";
    const saved = { [key]: { site: "youtube.com", title: "One", url: key, thumbnail: "", duration: 1000, position: 600, buckets: "0000000000000000000000000", watched: false, cw: "manual", played: 80, ts: 1, updated: 1 } };
    const page = await load({ html: "", url: key, watchProgress: saved, testSeam: true });
    const video = fakeVideo(page, { duration: 800 }); video.fire("play");
    check("resume skips a duration mismatch", () => assert.deepEqual(video.seeks, []));
    page.window.close();
  }
  {
    const first = "https://www.youtube.com/watch?v=abc123def45"; const second = "https://www.youtube.com/watch?v=zyx987wvu65";
    const page = await load({ html: "", url: first, testSeam: true }); const video = fakeVideo(page);
    video.play(30); page.window.history.pushState({}, "", "/watch?v=zyx987wvu65"); video.currentTime = 0; video.play(30);
    await wait(35);
    check("SPA key changes save isolated first and second video progress", () => assert.ok(page.store.watchProgress[first] && page.store.watchProgress[second], JSON.stringify(page.store.watchProgress)));
    page.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=abc123def45";
    const watched = { [key]: { site: "youtube.com", title: "One", url: key, thumbnail: "", duration: 100, position: 95, buckets: "fffffffffffffffffffffffff", watched: true, ts: 1, updated: 1 } };
    const html = `<ytd-rich-item-renderer id="card"><a id="thumbnail" href="/watch?v=abc123def45"><img></a><a id="video-title" href="/watch?v=abc123def45">One</a></ytd-rich-item-renderer>`;
    const page = await load({ html, url: "https://www.youtube.com/", watchProgress: watched, testSeam: true });
    const card = page.document.getElementById("card");
    check("stored watched listing card gets the watched label", () => assert.ok(card.querySelector("[data-hoa-watched]")));
    check("the unwatch button shows the struck-tick icon and names its action", () => { const button = buttons(card, "unwatch"); assert.ok(button.querySelector("svg path")); assert.equal(button.textContent, ""); assert.equal(button.getAttribute("aria-label"), "Remove Watched tag"); });
    buttons(card, "unwatch").click(); await wait(15);
    check("unwatch clears watched and records untagged", () => assert.equal(page.store.watchProgress[key].untagged, true));
    page.document.querySelector("#hoa-toast button").click(); await wait(35);
    check("Undo restores the watched record", () => assert.equal(page.store.watchProgress[key].watched, true));
    page.window.close();
    const rewatch = await load({ html: "", url: key, watchProgress: { [key]: { ...watched[key], watched: false, untagged: true } }, testSeam: true });
    fakeVideo(rewatch).play(95); await wait(15);
    check("a full fresh watch clears untagged", () => assert.equal(rewatch.store.watchProgress[key].untagged, undefined));
    rewatch.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=qwe123rty45";
    const html = `<ytd-rich-item-renderer id="p95"><a id="thumbnail" href="/watch?v=abc123def45"><img><ytd-thumbnail-overlay-resume-playback-renderer style="width:95%"></ytd-thumbnail-overlay-resume-playback-renderer></a><a id="video-title">95</a></ytd-rich-item-renderer><ytd-rich-item-renderer id="p40"><a id="thumbnail" href="/watch?v=zyx987wvu65"><img><ytd-thumbnail-overlay-resume-playback-renderer style="width:40%"></ytd-thumbnail-overlay-resume-playback-renderer></a><a id="video-title">40</a></ytd-rich-item-renderer><ytd-rich-item-renderer id="untagged"><a id="thumbnail" href="/watch?v=qwe123rty45"><img><ytd-thumbnail-overlay-resume-playback-renderer style="width:95%"></ytd-thumbnail-overlay-resume-playback-renderer></a><a id="video-title">Untagged</a></ytd-rich-item-renderer>`;
    const page = await load({ html, url: "https://www.youtube.com/", watchProgress: { [key]: { site: "youtube.com", title: "One", url: key, thumbnail: "", duration: 100, position: 95, buckets: "fffffffffffffffffffffffff", watched: false, untagged: true, ts: 1, updated: 1 } }, testSeam: true });
    check("YouTube 95/40/untagged precedence is behavioral", () => { assert.ok(page.document.querySelector("#p95 [data-hoa-watched]")); assert.equal(page.document.querySelector("#p40 [data-hoa-watched]"), null); assert.equal(page.document.querySelector("#untagged [data-hoa-watched]"), null); });
    page.test.apply(); await wait(10);
    let mutations = 0; const observer = new page.window.MutationObserver(records => { mutations += records.length; }); observer.observe(page.document.body, { attributes: true, childList: true, subtree: true });
    page.test.apply(); page.test.apply(); page.test.apply(); await wait(10); observer.disconnect();
    check("repeated apply is observer-idempotent", () => assert.equal(mutations, 0));
    page.window.close();
  }
  {
    const card = (id, video, bar = "") => `<ytd-video-renderer id="${id}"><ytd-thumbnail><a id="thumbnail" href="/watch?v=${video}"><img></a>${bar}</ytd-thumbnail><a id="video-title" href="/watch?v=${video}">${id}</a></ytd-video-renderer>`;
    const untaggedKey = "https://www.youtube.com/watch?v=untagged009";
    const html = [
      card("new-layout", "newlayout01", '<ytd-thumbnail-overlay-resume-playback-renderer></ytd-thumbnail-overlay-resume-playback-renderer><yt-thumbnail-overlay-progress-bar-view-model><span style="width:100%"></span></yt-thumbnail-overlay-progress-bar-view-model>'),
      card("forty", "fortybar001", '<ytd-thumbnail-overlay-resume-playback-renderer style="width:40%"></ytd-thumbnail-overlay-resume-playback-renderer><yt-thumbnail-overlay-progress-bar-view-model><span style="width:40%"></span></yt-thumbnail-overlay-progress-bar-view-model>'),
      card("legacy", "legacybar01", '<div id="progress" style="width:95%"></div>'),
      card("scaled", "scaledbar01", '<yt-thumbnail-overlay-progress-bar-view-model><span style="transform:scaleX(.95)"></span></yt-thumbnail-overlay-progress-bar-view-model>'),
      card("track", "trackbar001", '<yt-thumbnail-overlay-progress-bar-view-model><div class="ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment" style="width:10%"></div><div class="ytThumbnailOverlayProgressBarHostUnwatchedProgressBarSegment" style="width:90%"></div></yt-thumbnail-overlay-progress-bar-view-model>'),
      card("host", "hostbar0001", '<div class="ytThumbnailOverlayProgressBarHost" style="width:100%"><div class="ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment" style="width:30%"></div></div>'),
      card("late", "latebar0001"),
      card("widened", "widebar0001", '<yt-thumbnail-overlay-progress-bar-view-model id="wide-bar" style="width:40%"></yt-thumbnail-overlay-progress-bar-view-model>'),
      card("preview", "previewbar01", '<div class="html5-video-player"><yt-thumbnail-overlay-progress-bar-view-model style="width:100%"></yt-thumbnail-overlay-progress-bar-view-model></div>'),
      card("untagged-bar", "untagged009", '<yt-thumbnail-overlay-progress-bar-view-model style="width:100%"></yt-thumbnail-overlay-progress-bar-view-model>')
    ].join("");
    const page = await load({ html, url: "https://www.youtube.com/results?search_query=x", watchProgress: {
      [untaggedKey]: { site: "youtube.com", title: "Untagged", url: untaggedKey, thumbnail: "", duration: 100, position: 95, buckets: "fffffffffffffffffffffffff", watched: false, untagged: true, ts: 1, updated: 1 }
    }, testSeam: true });
    check("YouTube search cards inspect every progress bar representation", () => {
      assert.ok(page.document.querySelector("#new-layout [data-hoa-watched]")); assert.equal(page.document.querySelector("#forty [data-hoa-watched]"), null);
      assert.ok(page.document.querySelector("#legacy [data-hoa-watched]")); assert.ok(page.document.querySelector("#scaled [data-hoa-watched]"));
      assert.equal(page.document.querySelector("#preview [data-hoa-watched]"), null); assert.equal(page.document.querySelector("#untagged-bar [data-hoa-watched]"), null);
    });
    check("a wide unwatched track or bar host does not count as watched", () => { assert.equal(page.document.querySelector("#track [data-hoa-watched]"), null); assert.equal(page.document.querySelector("#host [data-hoa-watched]"), null); });
    check("the video player's own progress bar never starts a filter pass", () => {
      const player = page.document.createElement("div"); player.className = "html5-video-player"; player.innerHTML = '<div class="ytp-progress-bar"><div class="ytp-play-progress" style="transform:scaleX(.5)"></div></div>'; page.document.body.appendChild(player);
      assert.equal(page.window.__hoaTest.watchedProgressMutation(player.querySelector(".ytp-play-progress")), false);
      assert.equal(page.window.__hoaTest.watchedProgressMutation(player.querySelector(".ytp-progress-bar")), false);
    });
    const late = page.document.createElement("yt-thumbnail-overlay-progress-bar-view-model"); late.style.width = "100%"; page.document.querySelector("#late ytd-thumbnail").appendChild(late); await wait(30);
    check("a progress bar appended after the first pass tags its card", () => assert.ok(page.document.querySelector("#late [data-hoa-watched]")));
    page.document.getElementById("wide-bar").style.width = "95%"; await wait(30);
    check("a widened YouTube progress bar makes its card watched", () => assert.ok(page.document.querySelector("#widened [data-hoa-watched]")));
    page.window.close();
  }
  {
    const page = await load({ html: '<ytd-rich-item-renderer id="preview"><a id="thumbnail" href="/watch?v=preview12345"><video></video></a></ytd-rich-item-renderer>', url: "https://www.youtube.com/", testSeam: true });
    const video = fakeVideo(page); page.document.getElementById("preview").appendChild(video); video.play(40); await wait(45);
    check("YouTube home inline previews never create a progress entry", () => assert.deepEqual(page.store.watchProgress || {}, {}));
    page.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=abc123def45";
    const page = await load({ html: '<ytd-watch-metadata><h1>Exact page title</h1></ytd-watch-metadata>', url: key, testSeam: true });
    fakeVideo(page).play(40); await wait(45);
    const entry = page.store.watchProgress[key];
    check("YouTube video pages track their canonical key, h1 title and video thumbnail", () => {
      assert.equal(entry.url, key); assert.equal(entry.title, "Exact page title"); assert.equal(entry.thumbnail, "https://i.ytimg.com/vi/abc123def45/mqdefault.jpg");
    });
    page.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=keepkey1234";
    const page = await load({ html: "", url: key, testSeam: true }); const video = fakeVideo(page);
    video.play(30); page.window.history.pushState({}, "", "/"); video.currentTime = 40; video.play(20); await wait(45);
    check("SPA navigation to a non-video page keeps the current tracker key", () => {
      assert.ok(page.store.watchProgress[key]); assert.equal(page.store.watchProgress["https://www.youtube.com/"], undefined);
    });
    page.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=renderer123";
    const watched = { [key]: { site: "youtube.com", title: "Renderer", url: key, thumbnail: "", duration: 100, position: 95, buckets: "fffffffffffffffffffffffff", watched: true, ts: 1, updated: 1 } };
    const renderers = [
      ["yt-lockup-view-model", key], ["ytd-compact-video-renderer", key],
      ["ytd-video-renderer", "https://www.youtube.com/results?search_query=renderer"],
      ["ytd-rich-grid-media", "https://www.youtube.com/@x/videos"],
      ["ytd-grid-video-renderer", "https://www.youtube.com/@x/videos"],
      ["ytd-playlist-video-renderer", "https://www.youtube.com/playlist?list=PLrenderer"]
    ];
    for (const [renderer, url] of renderers) {
      const page = await load({ html: `<${renderer} id="card"><a id="thumbnail" href="/watch?v=renderer123"><img></a><a id="video-title" href="/watch?v=renderer123">Renderer</a></${renderer}>`, url, watchProgress: watched, testSeam: true });
      check(`watched labels render on ${renderer} at its page route`, () => assert.ok(page.document.querySelector("#thumbnail[data-hoa-watched]")));
      page.window.close();
    }
    const tubiKey = "https://tubitv.com/movies/watched";
    const page = await load({ html: '<div id="card" data-test-id="web-ui-content-tile"><a class="web-content-tile__poster-link" href="/movies/watched"><img></a><span class="web-content-tile__title">Watched</span></div>', url: "https://tubitv.com/", watchProgress: { [tubiKey]: { site: "tubitv.com", title: "Watched", url: tubiKey, duration: 100, position: 95, buckets: "fffffffffffffffffffffffff", watched: true, ts: 1, updated: 1 } }, testSeam: true });
    check("watched labels render on Tubi cards", () => assert.ok(page.document.querySelector("#card [data-hoa-watched]")));
    page.window.close();
  }
  {
    const key = "https://www.youtube.com/watch?v=abc123def45";
    const page = await load({ html: "", url: key, watchSettings: { continueWatching: "auto" },
      watchLater: { [key]: { title: "Later", thumb: "", site: "youtube.com", url: key, duration: 100, ts: 1 } }, testSeam: true });
    const video = fakeVideo(page, { currentTime: 9 }); page.test.findPlayer();
    video.fire("play");
    [10, 11, 12, 13].forEach(position => { video.currentTime = position; video.fire("timeupdate"); });
    await wait(30);
    check("three real seconds at a resumable Watch Later position bypasses progress throttling", () => {
      assert.equal(page.store.watchLater[key], undefined);
      assert.ok(page.store.watchProgress[key], JSON.stringify(page.store));
      assert.equal(page.store.watchProgress[key].cw, "later");
    });
    check("the button changes to In Continue Watching when the video moves, and is a status, not an action", () => {
      const button = page.document.querySelector("#hoa-watch-later");
      assert.ok(button); assert.equal(button.textContent, "✓ In Continue Watching"); assert.equal(button.hidden, false);
      assert.equal(button.getAttribute("aria-disabled"), "true");
      button.click();
    });
    await wait(20);
    {
      const url = "https://www.youtube.com/watch?v=watchedpage";
      const done = { [url]: { site: "youtube.com", title: "Done", url, duration: 100, position: 98, played: 98, buckets: "f".repeat(25), watched: true, ts: 1, updated: 1 } };
      const box = { left: 16, top: 68, right: 903, bottom: 567, width: 887, height: 499, x: 16, y: 68 };
      const open = async options => { const opened = await load({ html: '<div id="movie_player"></div>', url, watchProgress: done, testSeam: true, ...options }); opened.document.getElementById("movie_player").getBoundingClientRect = () => box; opened.test.apply(); opened.document.dispatchEvent(new opened.window.MouseEvent("mousemove", { clientX: 400, clientY: 300, bubbles: true })); await wait(30); return opened; };
      const ticked = await open({ siteRules: { "www.youtube.com": { hideKinds: ["watched"] } } });
      check("Watched ticked: the button says In Watched and the player has no tag", () => { const control = ticked.document.querySelector("#hoa-watch-later"); assert.equal(control.textContent, "✓ In Watched"); assert.equal(control.getAttribute("aria-disabled"), "true"); assert.equal(ticked.document.querySelector("[data-hoa-player-watched]"), null); });
      ticked.window.close();
      const ticks = { siteRules: { "www.youtube.com": { hideKinds: ["watched"] } } };
      for (const [name, extra] of [["hidden off the list", { hiddenItems: { [url]: { title: "T", thumb: "", listed: false, ts: 1 } } }], ["restored", { watchedShown: { [url]: 5 } }], ["removed from the list", { watchProgress: { [url]: { ...done[url], unlisted: true } } }]]) {
        const notListed = await open({ ...ticks, ...extra });
        check(`Watched ticked but ${name}: the button does not claim In Watched`, () => assert.equal(notListed.document.querySelector("#hoa-watch-later").textContent, "Add to Watch Later"));
        notListed.window.close();
      }
      const byHand = await open({ ...ticks, hiddenItems: { [url]: { title: "T", thumb: "", listed: true, ts: 1 } } });
      check("Watched ticked and hidden by hand: it is listed in Watched, so the button says so", () => assert.equal(byHand.document.querySelector("#hoa-watch-later").textContent, "✓ In Watched"));
      byHand.window.chrome.storage.local.set({ watchedShown: { [url]: 9 }, hiddenItems: {} }); await wait(30);
      check("the button follows the list as it changes", () => assert.equal(byHand.document.querySelector("#hoa-watch-later").textContent, "Add to Watch Later"));
      byHand.window.close();
      {
        const again = await load({ html: "", url, watchProgress: { [url]: { ...done[url], unlisted: true } }, siteRules: ticks.siteRules, testSeam: true });
        fakeVideo(again, { duration: 100 }).play(5); await wait(35);
        check("playing a video taken off the Watched list does not put it back", () => assert.equal(again.store.watchProgress[url].unlisted, true));
        again.window.close();
      }
      const plain = await open({});
      check("Watched not ticked: the player carries the Watched tag and the video can still be saved", () => { assert.ok(plain.document.getElementById("movie_player").hasAttribute("data-hoa-player-watched")); assert.equal(plain.document.querySelector("#hoa-watch-later").textContent, "Add to Watch Later"); });
      plain.window.history.pushState({}, "", "/watch?v=anotherone1"); plain.test.apply();
      check("the player's Watched tag goes when the next video opens", () => assert.equal(plain.document.querySelector("[data-hoa-player-watched]"), null));
      plain.window.close();
      const off = await open({ watchSettings: { tagWatched: false } });
      check("Tag watched videos off: no tag on the player", () => assert.equal(off.document.querySelector("[data-hoa-player-watched]"), null));
      off.window.close();
    }
    {
      const url = "https://www.twitch.tv/somechannel";
      const stream = await load({ html: "", url, siteRules: { "www.twitch.tv": { enabled: true } }, watchLater: { [url]: { title: "Live", thumb: "", site: "twitch.tv", url, ts: 1 } }, testSeam: true });
      const live = fakeVideo(stream, { duration: Infinity, currentTime: 100 }); stream.test.findPlayer();
      const play = async seconds => { for (let step = 0; step <= seconds; step += 1) { live.currentTime += 1; live.fire("timeupdate"); } await wait(30); };
      await play(4);
      check("a saved live channel stays in Watch Later for its first seconds", () => assert.ok(stream.store.watchLater[url]));
      await play(9);
      check("a saved live channel moves to Continue Watching after real watching", () => { assert.equal(stream.store.watchLater[url], undefined); assert.equal(stream.store.watchProgress[url].cw, "later"); assert.equal(stream.store.watchProgress[url].live, true); });
      stream.window.close();
      const plain = await load({ html: "", url, siteRules: { "www.twitch.tv": { enabled: true } }, testSeam: true });
      const unsaved = fakeVideo(plain, { duration: Infinity, currentTime: 100 }); plain.test.findPlayer();
      for (let step = 0; step < 30; step += 1) { unsaved.currentTime += 1; unsaved.fire("timeupdate"); } await wait(30);
      check("a live stream nobody saved records nothing", () => assert.deepEqual(plain.store.watchProgress || {}, {}));
      plain.window.close();
    }
    {
      const url = "https://rumble.com/shorts/vabc123";
      const html = '<div class="outer"><a href="/shorts/vabc123">Short</a><div class="inner"></div></div>';
      const taught = await load({ html, url: "https://rumble.com/shorts/", siteRules: { "rumble.com": { enabled: true, pickedSelectors: ["div.outer", "div.inner"] } }, testSeam: true });
      check("two taught selectors on one video give it one button bar, on the outer card", () => { assert.equal(taught.document.querySelectorAll(".hoa-actions").length, 1); assert.ok(taught.document.querySelector(".outer > .hoa-actions")); });
      taught.window.close();
      const fixed = await load({ html: '<style>.outer { position: absolute; }</style>' + html, url: "https://rumble.com/shorts/", siteRules: { "rumble.com": { enabled: true, pickedSelectors: ["div.outer"] } }, testSeam: true });
      check("a card the site positions itself is left alone", () => { const card = fixed.document.querySelector(".outer"); assert.ok(card.classList.contains("hoa-host")); assert.equal(card.hasAttribute("data-hoa-static"), false); });
      fixed.window.close();
    }
    check("clicking In Continue Watching changes nothing", () => { assert.equal(page.store.watchProgress[key].cw, "later"); assert.equal(page.store.watchLater[key], undefined); });
    page.window.close();
    for (const [name, options] of [["a private window", { incognito: true }], ["Auto-add off", { watchSettings: { continueWatching: "off" } }], ["every watch feature off", { watchSettings: { continueWatching: "off", tagWatched: false } }]]) {
      const chosen = await load({ html: "", url: key, ...options, watchLater: { [key]: { title: "Later", thumb: "", site: "youtube.com", url: key, duration: 100, ts: 1 } }, testSeam: true });
      const played = fakeVideo(chosen, { currentTime: 9 }); played.fire("play");
      [10, 11, 12, 13].forEach(position => { played.currentTime = position; played.fire("timeupdate"); });
      await wait(30);
      check(`a Watch Later video moves to Continue Watching in ${name}`, () => { assert.equal((chosen.store.watchLater || {})[key], undefined); assert.equal(chosen.store.watchProgress[key].cw, "later"); });
      chosen.window.close();
      const back = await load({ html: "", url: key, ...options, watchProgress: { [key]: { site: "youtube.com", title: "Later", url: key, duration: 100, position: 40, played: 40, buckets: "", cw: "later", ts: 1, updated: 1 } }, testSeam: true });
      const again = fakeVideo(back, { currentTime: 0, duration: 100 }); again.fire("play"); await wait(20);
      check(`that video resumes in ${name}`, () => assert.deepEqual(again.seeks, [35]));
      back.window.close();
    }
    {
      const other = "https://www.youtube.com/watch?v=notchosen00";
      const skip = await load({ html: "", url: other, incognito: true, watchLater: { [key]: { title: "Later", thumb: "", site: "youtube.com", url: key, duration: 100, ts: 1 } }, testSeam: true });
      const played = fakeVideo(skip, { currentTime: 9 }); played.fire("play");
      [10, 11, 12, 13].forEach(position => { played.currentTime = position; played.fire("timeupdate"); }); played.fire("pause"); await wait(30);
      check("a video that isn't saved still leaves no trace in a private window", () => assert.deepEqual(skip.store.watchProgress || {}, {}));
      skip.window.close();
    }
  }
  {
    const key = "https://www.youtube.com/watch?v=hoverwatch1";
    const home = await load({ html: "", url: "https://www.youtube.com/", testSeam: true }); fakeVideo(home); home.test.findPlayer();
    check("Watch Later never appears for a large home-page preview video", () => assert.equal(home.document.querySelector("#hoa-watch-later"), null)); home.window.close();
    const page = await load({ html: "", url: key, testSeam: true, buttonEdge: "bottom" }); const video = fakeVideo(page); page.test.findPlayer();
    page.document.dispatchEvent(new page.window.MouseEvent("mousemove", { clientX: 20, clientY: 20, bubbles: true })); await wait(25);
    const button = page.document.querySelector("#hoa-watch-later");
    check("Watch Later hover action appears only on a watch page and respects the edge", () => { assert.ok(button); assert.equal(button.hidden, false); assert.match(button.style.top, /-?\d+px/); });
    const bottomTop = button.style.top;
    page.window.chrome.storage.local.set({ buttonEdge: "top" }); await wait(20);
    check("a visible Watch Later button moves immediately when its edge changes", () => assert.notEqual(button.style.top, bottomTop));
    button.click(); await wait(20); check("Watch Later click toggles its saved entry", () => assert.ok(page.store.watchLater[key]));
    button.click(); await wait(20); check("Watch Later second click removes its saved entry", () => assert.equal(page.store.watchLater[key], undefined));
    {
      // Not started: YouTube's <video> is parked above the player and has no media yet, and only the player box is under the pointer.
      const box = { left: 16, top: 68, right: 903, bottom: 567, width: 887, height: 499, x: 16, y: 68 };
      const cued = await load({ html: '<div id="movie_player"></div>', url: key, testSeam: true });
      cued.document.getElementById("movie_player").getBoundingClientRect = () => box;
      cued.document.dispatchEvent(new cued.window.MouseEvent("mousemove", { clientX: 400, clientY: 300, bubbles: true })); await wait(25);
      const control = cued.document.querySelector("#hoa-watch-later");
      check("Watch Later shows over a player that has not started", () => { assert.ok(control); assert.equal(control.hidden, false); assert.equal(control.parentElement, cued.document.body); assert.equal(control.style.top, "80px"); });
      let reached = 0; cued.document.addEventListener("mousedown", () => { reached += 1; });
      control.dispatchEvent(new cued.window.MouseEvent("mousedown", { bubbles: true })); control.click(); await wait(20);
      check("Watch Later click works before play and the player never sees the press", () => { assert.ok(cued.store.watchLater[key]); assert.equal(reached, 0); });
      cued.document.dispatchEvent(new cued.window.MouseEvent("mousemove", { clientX: 2, clientY: 2, bubbles: true })); await wait(25);
      cued.window.close();
    }
    const off = await load({ html: "", url: key, testSeam: true, buttonsEnabled: false }); fakeVideo(off); off.test.findPlayer(); off.document.dispatchEvent(new off.window.MouseEvent("mousemove", { clientX: 20, clientY: 20, bubbles: true })); await wait(20);
    check("Watch Later respects Buttons off", () => { const control = off.document.querySelector("#hoa-watch-later"); assert.ok(!control || control.hidden); });
    page.window.close(); off.window.close();
  }
  {
    const box = () => ({ left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120 });
    const page = await load({ html: '<div class="taught player"><video></video><a href="/c/creator/shorts">Creator</a></div><div class="taught thumb"><a href="/shorts/next"><img alt="Next short"></a></div><div class="taught channel"><a href="/c/channel-name"><h3>Channel Name</h3></a></div>', url: "https://rumble.com/shorts/live", siteRules: { "rumble.com": { enabled: true, pickedSelectors: [".taught"] } }, setup(window) { window.document.querySelector(".player").getBoundingClientRect = box; window.document.querySelector("video").getBoundingClientRect = box; } });
    check("a taught Rumble player has no hover bar while a thumbnail still has one", () => { assert.equal(page.document.querySelector(".player .hoa-actions"), null); assert.ok(page.document.querySelector(".thumb .hoa-actions")); });
    page.document.querySelector(".channel [data-action='add']").click(); await wait(25);
    check("adding a channel card stores its channel kind and visible channel name", () => { const entry = page.store.addedItems["https://rumble.com/c/channel-name"]; assert.equal(entry.kind, "channel"); assert.equal(entry.title, "Channel Name"); });
    page.window.close();
    const arriving = await load({ html: '<div class="taught surface"><a href="/c/creator/shorts">Creator</a></div><div class="taught thumb"><a href="/shorts/next"><img></a></div>', url: "https://rumble.com/shorts/live", siteRules: { "rumble.com": { enabled: true, pickedSelectors: [".taught"] } }, setup(window) { window.document.querySelector(".surface").getBoundingClientRect = box; } });
    check("a taught surface without media initially behaves as a card", () => assert.ok(arriving.document.querySelector(".surface .hoa-actions")));
    const video = arriving.document.createElement("video"); video.getBoundingClientRect = box; arriving.document.querySelector(".surface").appendChild(video); await wait(150);
    check("a video arriving later removes only that player surface bar", () => { assert.equal(arriving.document.querySelector(".surface .hoa-actions"), null); assert.ok(arriving.document.querySelector(".thumb .hoa-actions")); });
    arriving.window.close();
  }
  {
    const category = await load({ html: '<div class="game-card"><a data-a-target="tw-box-art-card-link" href="/directory/category/just-chatting"><img alt="Just Chatting cover image"></a><h2 title="Just Chatting">A different heading</h2></div>', url: "https://www.twitch.tv/directory", siteRules: { "www.twitch.tv": { enabled: true } } });
    category.document.querySelector(".game-card [data-action='add']").click(); await wait(25);
    check("adding a Twitch category card stores its category kind and preferred heading title", () => { const entry = category.store.addedItems["https://www.twitch.tv/directory/category/just-chatting"]; assert.equal(entry.kind, "category"); assert.equal(entry.title, "Just Chatting"); });
    category.window.close();
    const altCategory = await load({ html: '<div class="game-card"><a data-a-target="tw-box-art-card-link" href="/directory/game/just-chatting"><img alt="Just Chatting box art"></a></div>', url: "https://www.twitch.tv/directory", siteRules: { "www.twitch.tv": { enabled: true } } });
    altCategory.document.querySelector(".game-card [data-action='add']").click(); await wait(25);
    check("a category image title drops Twitch art suffixes", () => assert.equal(altCategory.store.addedItems["https://www.twitch.tv/directory/game/just-chatting"].title, "Just Chatting"));
    altCategory.window.close();
  }
  {
    const cardHtml = '<div class="mrItem"><div class="titlePic"><img alt="Breakdown"></div><div class="titleMeta"><h3>Breakdown</h3></div></div>';
    const rule = { "fawesome.tv": { enabled: true, pickedSelectors: [".mrItem"] } };
    const navigation = () => {
      const listeners = new Set();
      return { listeners, addEventListener(type, listener) { if (type === "navigate") listeners.add(listener); }, removeEventListener(type, listener) { if (type === "navigate") listeners.delete(listener); }, emit(url) { let prevented = false; listeners.forEach(listener => listener({ destination: { url }, cancelable: true, preventDefault() { prevented = true; } })); return prevented; } };
    };
    let direct;
    const resolved = await load({ html: cardHtml, url: "https://fawesome.tv/", siteRules: rule, setup(window) {
      direct = navigation(); window.navigation = direct;
      window.document.querySelector(".mrItem").addEventListener("click", () => { direct.prevented = direct.emit("https://fawesome.tv/movies/10863050/breakdown"); });
    } });
    const add = resolved.document.querySelector("[data-action='add']");
    check("a taught linkless card gets a bar and title-based key", () => { assert.ok(add); assert.equal(add.closest(".mrItem").querySelector(".hoa-actions").hoaData.key, "https://fawesome.tv/hoa-card/breakdown"); });
    add.click(); await wait(35);
    check("linkless Add resolves and stores the real URL without navigating", () => {
      assert.ok(resolved.store.addedItems["https://fawesome.tv/movies/10863050/breakdown"]);
      assert.equal(resolved.store.cardLinks["https://fawesome.tv/hoa-card/breakdown"], "https://fawesome.tv/movies/10863050/breakdown");
      assert.equal(direct.prevented, true); assert.equal(add.textContent, "Added"); assert.equal(direct.listeners.size, 0);
    });
    resolved.window.close();
    let parent;
    const parentResolved = await load({ html: `<div class="wrap">${cardHtml}</div>`, url: "https://fawesome.tv/", siteRules: rule, setup(window) {
      parent = navigation(); window.navigation = parent;
      window.document.querySelector(".wrap").addEventListener("click", () => parent.emit("https://fawesome.tv/movies/from-parent"));
    } });
    parentResolved.document.querySelector("[data-action='add']").click(); await wait(360);
    check("linkless resolver tries the parent when the card itself does not navigate", () => { assert.ok(parentResolved.store.addedItems["https://fawesome.tv/movies/from-parent"]); assert.equal(parent.listeners.size, 0); });
    parentResolved.window.close();
    const fallback = await load({ html: cardHtml, url: "https://fawesome.tv/", siteRules: rule });
    fallback.document.querySelector("[data-action='add']").click(); await wait(520);
    check("no navigation falls back to the hoa-card key", () => assert.ok(fallback.store.addedItems["https://fawesome.tv/hoa-card/breakdown"]));
    fallback.window.close();
    let foreign;
    const refused = await load({ html: cardHtml, url: "https://fawesome.tv/", siteRules: rule, setup(window) {
      foreign = navigation(); window.navigation = foreign;
      window.document.querySelector(".mrItem").addEventListener("click", () => { foreign.cancelled = foreign.emit("https://elsewhere.example/video"); });
    } });
    refused.document.querySelector("[data-action='add']").click(); await wait(520);
    check("cross-site navigation is refused and listeners are removed", () => { assert.ok(refused.store.addedItems["https://fawesome.tv/hoa-card/breakdown"]); assert.equal(refused.store.cardLinks, undefined); assert.equal(foreign.listeners.size, 0); assert.equal(foreign.cancelled, true, "the page stays put even when the address is refused"); });
    refused.window.close();
  }
  {
    const css = new JSDOM(`<!doctype html><style>${read("content.css")}</style><div class="hoa-actions"><button hidden>Hidden action</button></div>`, { pretendToBeVisual: true });
    check("Xumo action buttons with hidden state are not displayed", () => assert.equal(css.window.getComputedStyle(css.window.document.querySelector(".hoa-actions button")).display, "none"));
    css.window.close();
  }
  console.log(`engine.test.js: ${passed} passed, 0 failed`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
