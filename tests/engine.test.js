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

async function load({ fixture, html: suppliedHtml, url, siteRules, noBody = false, testSeam = false }) {
  const html = suppliedHtml === undefined ? fs.readFileSync(path.join(__dirname, "fixtures", fixture), "utf8") : suppliedHtml;
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url, runScripts: "outside-only", pretendToBeVisual: true
  });
  const { window } = dom;
  if (noBody) {
    window.document.body.remove();
  }
  const store = { siteRules: siteRules || {} };
  const listeners = [];
  const messageListeners = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  window.chrome = {
    runtime: { id: "test-extension", lastError: null, getURL: value => value, getManifest: () => ({ version: "test" }),
      onMessage: { addListener: listener => messageListeners.push(listener) } },
    storage: {
      local: {
        get(defaults, callback) {
          const result = {};
          Object.keys(defaults).forEach(key => { result[key] = key in store ? clone(store[key]) : defaults[key]; });
          setTimeout(() => callback(result), 0);
        },
        set(values, callback) {
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
  if (testSeam) window.__hoaTest = {};
  window.eval(bundle);
  await wait(120);
  const status = () => new Promise(resolve => {
    let answered = false;
    messageListeners.forEach(listener => listener({ type: "hoa-status" }, {}, reply => { if (!answered) { answered = true; resolve(reply); } }));
    if (!messageListeners.length) resolve(null);
  });
  return { window, document: window.document, store, status, test: window.__hoaTest };
}

const buttons = (card, action) => card.querySelector(`:scope > .hoa-actions [data-action="${action}"]`);
const firstEntry = bag => Object.entries(bag || {})[0];

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
    const page = await load({ html: '<div class="cardList" id="recommended"><div class="listHeader">Recommended For You</div></div><div class="cardList" id="popular"><div class="listHeader">Most Popular</div></div>',
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
      siteRules: { "tubitv.com": { hideKinds: ["foreign", "not-english"] } } });
    check("filters: Tubi Foreign/International tiles match Foreign and Not in English", () => assert.ok(
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
      siteRules: { "tubitv.com": { hideKinds: ["foreign", "not-english", "dubbed"] } } });
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
      assert.match(read("content.js"), /\["add", "hide", "channel"\]/);
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
    const page = await load({ fixture: "sites/xumo.html", url: "https://play.xumo.com/free-movies/",
      siteRules: { "play.xumo.com": { enabled: true, hideKinds: ["movies"] } } });
    check("filters: Xumo Movies hides captured movie cards", () => assert.equal(
      page.document.querySelectorAll("li.card.titleCard.hoa-filtered").length, 8));
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
  console.log(`engine.test.js: ${passed} passed, 0 failed`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
