"use strict";

if (typeof window.__hoaRetire === "function") {
  window.__hoaRetire(false);
}
window.__hoaLoaded = true;

// Find all rows reads a genre page in a hidden frame from the top page: nothing may run or be recorded in there.
// Nor on the private-window Added Videos page, which only borrows a YouTube address (its players still get it).
if (window.name !== "hoa-rows-frame" && !(window === window.top && location.hostname === "www.youtube.com" && location.pathname === "/robots.txt")) {
  const ownInstance = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const rootElement = document.documentElement;
  const childFrame = (() => { if (window.__hoaTestChildFrame) return true; try { return window.top !== window; } catch (error) { return true; } })();
  const isIncognitoContext = () => typeof chrome !== "undefined" && Boolean(chrome.extension && chrome.extension.inIncognitoContext === true);
  const ownExtension = (() => {
    try {
      return chrome.runtime.id || "";
    } catch (error) {
      return "";
    }
  })();
  const ownVersion = (() => {
    try {
      return chrome.runtime.getManifest().version || "0";
    } catch (error) {
      return "0";
    }
  })();
  const versionParts = value => String(value || "0").split(".").map(part => Number(part) || 0);
  const compareVersions = (left, right) => {
    const a = versionParts(left);
    const b = versionParts(right);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) {
        return (a[index] || 0) - (b[index] || 0);
      }
    }
    return 0;
  };
  // Two installed copies of AddOrHide (say the store version and an unpacked one) both run on a page, each with
  // its own settings and lists. The newest copy takes the page; an older or equal copy that arrives later stands
  // aside, and its popup says so (see the hoa-status reply below).
  const otherCopyFirst = rootElement.dataset.hoaExtension && rootElement.dataset.hoaExtension !== ownExtension
    && compareVersions(rootElement.dataset.hoaVersion, ownVersion) >= 0;
  if (!otherCopyFirst) {
    rootElement.dataset.hoaInstance = ownInstance;
    rootElement.dataset.hoaExtension = ownExtension;
    rootElement.dataset.hoaVersion = ownVersion;
    document.querySelectorAll(".hoa-actions, .hoa-watched-label, #hoa-toast, #hoa-banner, #hoa-watch-later").forEach(node => node.remove());
    document.querySelectorAll("[data-hoa-watched]").forEach(node => node.removeAttribute("data-hoa-watched"));
    document.querySelectorAll(".hoa-host, .hoa-removed, .hoa-filtered, .hoa-empty, .hoa-show").forEach(node => node.classList.remove("hoa-host", "hoa-removed", "hoa-filtered", "hoa-empty", "hoa-show"));
  }

  const ACTIVE_CLASS = "hoa-removed";
  const FILTER_CLASS = "hoa-filtered";
  let hidden = {};
  let added = {};
  let channels = {};
  let watchedShown = {};
  let watchProgress = {};
  let watchLater = {};
  let cardLinks = {};
  let resolvingCardLink = false;
  let hasWatchProgress = false;
  let watchSettings = { tagWatched: true, continueWatching: "auto" };
  let watchedWriteTimer = 0;
  let keyMigrationTimer = 0;
  let siteRules = {};
  let scheduled = 0;
  let toastTimer = 0;
  let lastRule = null;
  let observedRoot = null;
  let retired = false;
  let bulkApplied = false;
  let buttonEdge = "top";
  let buttonsEnabled = true;
  let lastApplyAt = 0;
  let listsReady = false;
  let siteRulesReady = false;
  let watchSettingsReady = false;
  let waitingForBody = false;
  let filterVersion = 0;
  let filterSignature = "";
  let watchedCardVersion = 0;
  const patternCache = new Map();
  let passCardText = new WeakMap();
  let passFilterText = new WeakMap();
  let passFeaturedCarousel = new WeakMap();
  const pageDataCache = new Map();
  const shelfTitleCache = new WeakMap();
  const decisionCache = new WeakMap();
  const watchedCardCache = new WeakMap();
  let containerFilterCache = null;
  const carouselObservers = new Map();
  let carouselFrame = 0;
  let seenRowsTimer = 0;
  let lastSeenRows = [];
  let lastRowsReadAt = 0;
  let findingRows = false;
  const autoRowsCache = new WeakMap();
  let playerTracker = null;
  let playbackTrackerStarted = false;
  let lastProgressWrite = 0;
  let frameProgressState = null;
  let frameResumeSent = false;
  let watchLaterButton = null;
  let watchLaterHideTimer = 0;
  let watchLaterMoveFrame = 0;
  let watchLaterPlayer = null;
  let playerTagHost = null;
  const liveVideos = new WeakSet();
  let watchLaterHref = "";
  let watchLaterLookup = 0;
  let watchLaterPointerListening = false;
  const watchLaterFrames = new Set();
  const migratedFormerKeys = new Set();
  const pendingKeyMigrations = { hidden: false, added: false, watchedShown: false };
  const healedChannels = new Set();

  function contextAlive() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch (error) {
      return false;
    }
  }

  function ownContext() {
    // Some sites rewrite <html>'s attributes after load (PBS's app does), wiping the marker without another copy
    // taking over: claim it back instead of retiring. A different instance id still means a newer copy owns the page.
    if (!rootElement.dataset.hoaInstance && !otherCopyFirst) {
      rootElement.dataset.hoaInstance = ownInstance;
      rootElement.dataset.hoaExtension = ownExtension;
      rootElement.dataset.hoaVersion = ownVersion;
    }
    return rootElement.dataset.hoaInstance === ownInstance;
  }

  function removeOwnUi() {
    document.querySelectorAll("[data-hoa-player-watched]").forEach(node => node.removeAttribute("data-hoa-player-watched"));
    document.querySelectorAll("[data-hoa-static]").forEach(node => node.removeAttribute("data-hoa-static"));
    clearCarouselCompensation();
    removeOwnWatchLater();
    document.querySelectorAll(`.hoa-actions[data-hoa-owner="${ownInstance}"], .hoa-watched-label[data-hoa-owner="${ownInstance}"]`).forEach(node => node.remove());
    document.querySelectorAll(".hoa-host, .hoa-removed, .hoa-filtered, .hoa-empty, .hoa-show").forEach(node => node.classList.remove("hoa-host", "hoa-removed", "hoa-filtered", "hoa-empty", "hoa-show"));
    document.querySelectorAll(`[data-hoa-watched="${ownInstance}"]`).forEach(node => node.removeAttribute("data-hoa-watched"));
    ["hoa-toast", "hoa-banner"].forEach(id => {
      const node = document.getElementById(id);
      if (node) {
        node.remove();
      }
    });
  }

  function retire(fromClick) {
    if (retired) {
      return;
    }
    retired = true;
    if (scheduled) {
      window.cancelAnimationFrame(scheduled);
      scheduled = 0;
    }
    if (typeof observer !== "undefined") {
      observer.disconnect();
    }
    if (rootElement.dataset.hoaInstance === ownInstance || !rootElement.dataset.hoaInstance) {
      removeOwnUi();
      if (fromClick) {
        const toast = document.createElement("div");
        toast.id = "hoa-toast";
        toast.setAttribute("role", "status");
        const message = document.createElement("span");
        message.textContent = "AddOrHide was updated. Reload this page to use it again.";
        toast.appendChild(message);
        const reload = document.createElement("button");
        reload.type = "button";
        reload.textContent = "Reload";
        reload.addEventListener("click", () => location.reload());
        toast.appendChild(reload);
        document.body.appendChild(toast);
      }
    }
  }
  window.__hoaRetire = retire;

  function ensureContext(fromClick = false) {
    if (!contextAlive() || !ownContext()) {
      removeOwnWatchLater();
      retire(fromClick);
      return false;
    }
    return true;
  }

  function validSelector(selector) {
    if (typeof selector !== "string" || !selector.trim() || selector.length > 300) {
      return false;
    }
    try {
      document.querySelector(selector);
      return true;
    } catch (error) {
      return false;
    }
  }

  function validLinkSelector(selector) {
    if (selector === "") {
      return true;
    }
    try {
      document.querySelector(selector);
      return true;
    } catch (error) {
      return false;
    }
  }

  function hostnameRule() {
    const hostname = location.hostname.toLowerCase();
    const catalogRule = HOA_CATALOG.find(hostname);
    const stored = siteRules[hostname] || siteRules[hostname.replace(/^www\./, "")];
    if (catalogRule && catalogRule.builtIn && stored && typeof stored === "object" && stored.enabled === false) {
      return null;
    }
    if (!catalogRule && (!stored || stored.enabled !== true)) {
      return null;
    }
    if (catalogRule && !catalogRule.builtIn && (!stored || stored.enabled !== true)) {
      return null;
    }
    const base = catalogRule || {
      cardSelector: "",
      linkSelector: "",
      titleCandidates: [],
      adMarkers: [],
      gridSelector: "",
      categories: [{ id: "watched", label: "Watched", hint: "Videos you have watched" }]
    };
    const validPicks = HOA.usablePicks(stored).filter(validSelector);
    if (!catalogRule && (!validPicks.length || !stored || stored.enabled !== true)) {
      return null;
    }
    const merged = { ...base, catalog: Boolean(catalogRule), userPicked: validPicks.length > 0, hideKinds: [], hideKeywords: [], hideSections: [], featuredCarousels: true };
    if (stored && typeof stored === "object") {
      // Enable stores linkSelector: "" for every site; an empty value must not wipe a catalog rule's link.
      if (typeof stored.linkSelector === "string" && stored.linkSelector && stored.linkSelector.length <= 500
        && validLinkSelector(stored.linkSelector)) {
        merged.linkSelector = stored.linkSelector;
      }
      if (typeof stored.bulkHide === "boolean") {
        merged.bulkHide = stored.bulkHide;
      }
      const allowedKinds = (base.categories || []).map(category => category.id);
      merged.hideKinds = HOA.normalizeHideKinds(stored.hideKinds, allowedKinds);
      merged.hideKeywords = HOA.normalizeKeywords(stored.hideKeywords);
      merged.hideSections = HOA.normalizeSectionTitles(stored.hideSections);
      if (typeof stored.featuredCarousels === "boolean") merged.featuredCarousels = stored.featuredCarousels;
    }
    merged.pickedSelectors = validPicks;
    merged.variants = [...(Array.isArray(base.variants) ? base.variants : []), ...validPicks.map(cardSelector => ({
      cardSelector, linkSelector: "", titleCandidates: [], meta: { texts: ["*"] }, pickedCards: validPicks.join(",")
    }))];
    if (!catalogRule && validPicks.length) {
      merged.cardSelector = validPicks[0];
      merged.linkSelector = "";
      merged.titleCandidates = [];
      merged.meta = { texts: ["*"] };
      merged.pickedCards = validPicks.join(",");
      merged.categories = [...(base.categories || []), { id: "genres", label: "Rows by name", hint: "Hide rows by their heading — genres, collections, channels' picks" }];
    }
    if (!validSelector(merged.cardSelector)) {
      return null;
    }
    if (merged.pathEquals && location.pathname !== merged.pathEquals) {
      return null;
    }
    return merged;
  }

  function isAd(card, rule) {
    // Catalog rules only list adMarkers when a site needs them (YouTube).
    // A card is an ad when it is, contains or sits inside an ad container (search ads wrap normal-looking cards).
    return (rule.adMarkers || []).some(marker => card.matches(marker) || card.querySelector(marker) || card.closest(marker));
  }

  function valueAt(object, path) {
    return String(path || "").split(".").filter(Boolean).reduce((value, key) => value && value[key], object);
  }

  function pageDataForRule(rule) {
    const config = rule && rule.pageData;
    if (!config || !config.script || !config.idFromHref) return null;
    let script;
    try { script = document.querySelector(config.script); } catch (error) { script = null; }
    const source = script && script.textContent || "";
    const cacheKey = `${location.href}|${config.script}|${source.length}`;
    if (pageDataCache.has(cacheKey)) return pageDataCache.get(cacheKey);
    const values = new Map();
    try {
      const root = JSON.parse(source);
      const stack = [root];
      const seen = new Set();
      while (stack.length && seen.size < 50000) {
        const value = stack.pop();
        if (!value || typeof value !== "object" || seen.has(value)) continue;
        seen.add(value);
        if (!Array.isArray(value)) {
          const id = (config.idKeys || []).map(key => value[key]).find(candidate => typeof candidate === "string" && candidate);
          if (id) {
            const record = {};
            Object.entries(config.fields || {}).forEach(([name, field]) => {
              const candidate = valueAt(value, field);
              if (candidate !== undefined && candidate !== null) record[name] = candidate;
            });
            if (Object.keys(record).length) values.set(id.toLowerCase(), record);
          }
        }
        Object.values(value).forEach(child => { if (child && typeof child === "object") stack.push(child); });
      }
    } catch (error) {
      // Embedded page data is optional; a changed or partial script must not stop filtering.
    }
    pageDataCache.set(cacheKey, values);
    return values;
  }

  function pageDataForCard(card, rule, link = getLink(card, rule)) {
    const map = pageDataForRule(rule);
    if (!map || !link) return null;
    let match;
    try { match = new RegExp(rule.pageData.idFromHref, "i").exec(link.getAttribute("href") || link.href || ""); }
    catch (error) { return null; }
    return match && match[1] ? map.get(match[1].toLowerCase()) || null : null;
  }

  function normalizeRating(value) {
    const text = String(value || "").trim().toUpperCase();
    if (/^(?:NOT\s*RATED|UNRATED|NR|UR)$/.test(text)) return "NR";
    const normalized = text.replace(/[\s-]/g, "");
    return /^(?:TVY7(?:FV)?|TVY|TVG|TVPG|TV14|TVMA|G|PG|PG13|R|NC17|X|12\+|16\+|18\+|7\+)$/.test(normalized) ? normalized : "";
  }

  function cardRatings(card, rule, data) {
    const values = [];
    const add = value => { const normalized = normalizeRating(value); if (normalized && !values.includes(normalized)) values.push(normalized); };
    const meta = rule.meta || {};
    const selectors = [meta.rating, rule.ratingSelector].flat().filter(Boolean);
    selectors.forEach(selector => {
      try { card.querySelectorAll(selector).forEach(node => add(elementText(node))); } catch (error) { /* optional selector */ }
    });
    if (data && data.pageData && data.pageData.rating) add(data.pageData.rating);
    const text = cardText(card);
    const multi = /\b(?:TV-?Y7(?:-?FV)?|TV-?G|TV-?PG|TV-?14|TV-?MA|PG-?13|NC-?17|NR|Not\s+Rated|Unrated|1[2368]\+|7\+)\b/giu;
    let match;
    while ((match = multi.exec(text))) add(match[0]);
    const standalone = /(?:^|[•·|])\s*(G|R|X)\s*(?=$|[•·|])/giu;
    while ((match = standalone.exec(text))) add(match[1]);
    selectors.forEach(selector => {
      try { card.querySelectorAll(selector).forEach(node => add(elementText(node))); } catch (error) { /* optional selector */ }
    });
    return values;
  }

  function categoryMatches(card, rule, category, data) {
    if (!category || category.fallback || (category.pathPattern && !safePattern(category.pathPattern, location.pathname))) {
      return false;
    }
    const test = category.card;
    const results = [];
    if (Array.isArray(category.titleTerms) && category.titleTerms.length) {
      let title = "";
      for (const selector of rule.titleCandidates || []) {
        try { title = elementText(card.querySelector(selector)); } catch (error) { title = ""; }
        if (title) break;
      }
      results.push(HOA.keywordMatch(title, category.titleTerms));
    }
    if (!test || typeof test !== "object") {
      return results.some(Boolean);
    }
    if (test.has) {
      results.push(category.id === "watched" ? Boolean(watchedProgress(card)) : safeQuery(card, test.has));
    }
    if (test.is) {
      try { results.push(card.matches(test.is)); } catch (error) { results.push(false); }
    }
    if (test.href) {
      // Filtering rules describe the site's own card URL, not an optional play door
      // nested inside it. Keep their existing href input while card storage follows it.
      const link = getLinkInfo(card, rule).categoryLink;
      results.push(Boolean(link && safePattern(test.href, (rule.linkAttribute && link.getAttribute(rule.linkAttribute)) || link.getAttribute("href") || link.href || "")));
    }
    let categoryText = null;
    const textForCategory = () => {
      if (categoryText === null) categoryText = `${cardText(card)} ${filterText(card, rule, data)}`;
      return categoryText;
    };
    if (test.text) {
      results.push(safePattern(test.text, textForCategory()));
    }
    if (test.channel) {
      results.push(safePattern(test.channel, channelText(card, rule)));
    }
    if (Array.isArray(test.ratings)) {
      const ratings = cardRatings(card, rule, data);
      results.push(test.ratings.some(rating => ratings.includes(normalizeRating(rating))));
    }
    if (test.kids === true) results.push(Boolean(data && data.pageData && data.pageData.kids === true));
    if (Number.isFinite(test.maxSeconds)) {
      const durations = allLeafTexts(card).map(HOA.parseDuration).filter(Number.isFinite);
      results.push(durations.some(duration => duration <= test.maxSeconds));
    }
    if (Number.isFinite(test.scoreBelow)) {
      const match = cardText(card).match(/\b(\d{1,3})%/);
      results.push(Boolean(match && Number(match[1]) < test.scoreBelow));
    }
    // Conditions are alternatives. This lets catalog rules recognise old and new markup without site-specific code.
    return !test.withoutText || !safePattern(test.withoutText, textForCategory()) ? results.some(Boolean) : false;
  }

  function safeQuery(card, selector) {
    try { return Boolean(card.querySelector(selector)); } catch (error) { return false; }
  }

  function safePattern(source, text) {
    let pattern = patternCache.get(source);
    if (!pattern) {
      try { pattern = new RegExp(source, "iu"); } catch (error) { pattern = null; }
      patternCache.set(source, pattern);
    }
    return Boolean(pattern && pattern.test(text || ""));
  }

  function cardText(card) {
    const cached = passCardText.get(card);
    if (cached !== undefined) return cached;
    // Text nodes joined with spaces: textContent glues neighbouring elements together ("Sub | Dub" + "Frieren"
    // becomes "DubFrieren"), which breaks whole-word types and keywords. No cloning: feeds have hundreds of cards.
    let text = "";
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.parentElement || !node.parentElement.closest(".hoa-actions")) text += ` ${node.nodeValue || ""}`;
    }
    text = text.replace(/\s+/g, " ").trim();
    passCardText.set(card, text);
    return text;
  }

  function channelText(card, rule) {
    for (const selector of rule.channelCandidates || []) {
      try {
        const text = elementText(card.querySelector(selector));
        if (text) return text;
      } catch (error) {
        // A changed site selector must not stop the whole filter pass.
      }
    }
    return "";
  }

  function channelIdentity(card, rule) {
    if (!rule) return null;
    if (rule.id !== "youtube") {
      let link = null;
      try { link = rule.channelLinkSelector && card.querySelector(rule.channelLinkSelector); } catch (error) { link = null; }
      if (!link && rule.channelHrefAttribute && card.getAttribute(rule.channelHrefAttribute)) link = card;
      if (!link) return null;
      const site = (rule.hosts && rule.hosts[0]) || HOA.siteOf(location.href);
      const url = (rule.channelHrefAttribute && link.getAttribute(rule.channelHrefAttribute)) || link.href || link.getAttribute("href") || "";
      const linkKey = HOA.channelLinkKey(site, url);
      let named = null;
      try { named = rule.channelNameSelector && card.querySelector(rule.channelNameSelector); } catch (error) { named = null; }
      let name = (rule.channelNameAttribute && card.getAttribute(rule.channelNameAttribute)) || (named && (named.getAttribute("title") || elementText(named))) || channelText(card, rule) || elementText(link);
      const title = cardTitle(card, rule);
      if (name && title && name.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase()) name = channelSlug(url);
      const nameKey = HOA.channelNameKey(name, site);
      return linkKey || nameKey ? { key: linkKey || nameKey, linkKey, nameKey, name, url, site } : null;
    }
    const links = [
      'ytd-channel-name a[href], ytd-channel-name a#text[href]',
      '.ytContentMetadataViewModelMetadataRow a[href]',
      'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]'
    ];
    let link = null;
    for (const selector of links) {
      try { link = card.querySelector(selector); } catch (error) { link = null; }
      if (link && HOA.youtubeChannelKey(link.getAttribute("href") || link.href)) break;
    }
    const name = channelText(card, rule);
    const url = link ? (link.href || link.getAttribute("href") || "") : "";
    const key = HOA.youtubeChannelKey(url);
    const nameKey = HOA.channelNameKey(name);
    return key || nameKey ? { key: key || nameKey, linkKey: key, nameKey, name, url, site: "youtube.com" } : null;
  }

  function channelSlug(url) {
    try { const path = new URL(url, location.href).pathname.replace(/\/+$/, ""); const part = path.split("/").filter(Boolean).pop() || ""; return part ? decodeURIComponent(part).replace(/^@/, "@") : ""; } catch (error) { return ""; }
  }

  function cardTitle(card, rule) {
    for (const selector of rule.titleCandidates || []) { try { const text = textFrom(card.matches(selector) ? card : card.querySelector(selector)); if (text) return text; } catch (error) { /* stale selector */ } }
    return "";
  }

  let restoredInPass = false;
  function afterRestore() {
    if (!restoredInPass) return;
    restoredInPass = false;
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  const healedSaved = new Set();
  const pendingHeals = new Map();
  let healTimer = 0;

  function healSaved(card, rule, data) {
    const saved = added[data.key] || hidden[data.key];
    if (!saved || healedSaved.has(data.key) || data.kind === "channel" || data.kind === "category") return;
    const link = getLink(card, rule);
    const badge = link ? HOA.cleanTitle(textFrom(link)) : "";
    const wrongName = saved.title === HOA.siteOf(data.key) || (badge && saved.title === badge);
    if (!wrongName && saved.thumb) {
      // An empty link may be a card still filling in, so only a card with something to compare is settled.
      if (badge) healedSaved.add(data.key);
      return;
    }
    const patch = {};
    if (wrongName && data.title && data.title !== saved.title && data.title !== HOA.siteOf(data.key)) patch.title = data.title;
    if (!saved.thumb) { const picture = data.thumb || cardPicture(card); if (picture) patch.thumb = picture; }
    if (!Object.keys(patch).length) return;
    // A picture can arrive before the badge that shows the name is wrong, so only a repaired name is final.
    if (patch.title) healedSaved.add(data.key);
    pendingHeals.set(data.key, patch);
    if (healTimer) return;
    healTimer = window.setTimeout(() => {
      healTimer = 0;
      const heals = new Map(pendingHeals);
      pendingHeals.clear();
      HOA.readLists(lists => {
        const next = { added: { ...lists.added }, hidden: { ...lists.hidden } };
        const changed = {};
        heals.forEach((patch, key) => ["added", "hidden"].forEach(name => {
          if (next[name][key]) { next[name][key] = { ...next[name][key], ...patch }; changed[name] = next[name]; }
        }));
        if (Object.keys(changed).length) HOA.writeLists(changed);
      });
    }, 800);
  }

  function healChannelName(identity) {
    if (!identity || !identity.linkKey || !identity.name || healedChannels.has(identity.linkKey)) return;
    const old = channels[identity.linkKey] || Object.values(channels).find(entry => entry && entry.linkKey === identity.linkKey);
    if (!old || old.name === identity.name) return;
    healedChannels.add(identity.linkKey);
    channels = { ...channels, [old.key || identity.linkKey]: { ...old, name: identity.name, nameKey: identity.nameKey || old.nameKey, ts: Date.now() } };
    HOA.writeLists({ channels });
  }

  function isOwnChannelPage(identity) {
    if (!identity || !identity.linkKey) return false;
    const path = identity.linkKey.slice(`${identity.site || "youtube.com"}|`.length);
    const here = location.pathname.toLowerCase();
    // "/@foo" and "/@foo/videos", but not another channel "/@foobar".
    return here === path || here.startsWith(`${path}/`);
  }

  function hiddenChannel(card, rule) {
    // No hidden channels: skip reading every card's channel on every pass.
    if (!channels || !Object.keys(channels).length) return false;
    const identity = channelIdentity(card, rule);
    if (!identity || isOwnChannelPage(identity)) return false;
    return Boolean((identity.linkKey && channels[identity.linkKey]) || (identity.nameKey && channels[identity.nameKey])
      || Object.values(channels).some(entry => entry && ((identity.linkKey && entry.linkKey === identity.linkKey)
        || (identity.nameKey && entry.nameKey === identity.nameKey) || (identity.linkKey && entry.key === identity.linkKey)
        || (identity.nameKey && entry.key === identity.nameKey))));
  }

  function watchedProgress(card) {
    const selector = watchedSelector();
    let progress = [];
    try { progress = Array.from(card.querySelectorAll(selector)); } catch (error) { progress = []; }
    const amount = node => {
      const width = String(node.style && node.style.width || "").replace(/\s/g, "");
      const widthMatch = width.match(/^([\d.]+)%$/);
      if (widthMatch) return Number(widthMatch[1]);
      const transform = String(node.style && node.style.transform || "");
      const scale = transform.match(/scaleX\(\s*([\d.]+)\s*\)/i);
      if (scale) return Number(scale[1]) * 100;
      const value = Number(node.getAttribute && node.getAttribute("aria-valuenow"));
      const maximum = Number(node.getAttribute && node.getAttribute("aria-valuemax"));
      return Number.isFinite(value) ? value / (Number.isFinite(maximum) && maximum > 0 ? maximum : 100) * 100 : 0;
    };
    for (const bar of progress) {
      if (insideVideoPlayer(bar)) continue;
      const nodes = [bar, ...Array.from(bar.querySelectorAll("[style*='width'], [style*='transform'], [aria-valuenow]"))];
      // The red segment is the measure when it exists: a track or unwatched segment is wide when little was watched.
      const classOf = node => node.getAttribute("class") || "";
      const watchedSegments = nodes.filter(node => node.id === "progress" || classOf(node).includes("WatchedProgressBarSegment"));
      const measured = watchedSegments.length ? watchedSegments : nodes.filter(node => !/unwatched|background|track|buffer|host/i.test(classOf(node)));
      if (measured.some(node => amount(node) >= 90)) return bar;
    }
    return null;
  }

  function insideVideoPlayer(node) {
    return Boolean(node.closest && node.closest(".html5-video-player, ytd-video-preview, #inline-preview-player, [class*='ytp-']"));
  }

  function watchedSelector() {
    return typeof HOA_WATCHED_SELECTOR === "string" ? HOA_WATCHED_SELECTOR
      : "ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model, [class*='WatchedProgressBarSegment'], [class*='ResumePlayback'], [class*='ProgressBar'], [class*='progress-bar'], ytd-thumbnail #progress, #progress.ytd-thumbnail-overlay-resume-playback-renderer";
  }

  function watchedProgressMutation(node, added = false) {
    const rule = hostnameRule();
    // The player's own bar changes many times a second during playback and must never start a filter pass.
    if (!node || node.nodeType !== 1 || !rule || rule.id !== "youtube" || insideVideoPlayer(node)) return false;
    const selector = watchedSelector();
    try {
      return Boolean(node.closest(selector)) || (added && Boolean(node.querySelector(selector)));
    } catch (error) {
      return false;
    }
  }

  function watchedCard(card, rule, data = null) {
    const watched = (rule.categories || []).find(category => category.id === "watched");
    if (!watched) return false;
    const current = data || cardData(card, rule);
    const progress = current && watchProgress[current.key];
    // An explicit untag wins over YouTube's own resume bar until a fresh full watch replaces it.
    if (progress && progress.untagged) return false;
    if (progress && progress.watched) return true;
    if (rule.id === "youtube") {
      const key = current && current.key || "";
      const cached = watchedCardCache.get(card);
      if (cached && cached.version === watchedCardVersion && cached.key === key) return cached.watched;
      const watched = Boolean(watchedProgress(card));
      watchedCardCache.set(card, { version: watchedCardVersion, key, watched });
      return watched;
    }
    return false;
  }

  function watchedEnabled(categories) {
    return categories.selected.some(category => category.id === "watched");
  }

  // A video the user saved to Watch Later is their own choice: it keeps working in private windows and with
  // Auto-add off, from saving it through resuming it. Everything else follows the settings below.
  function chosenVideo(key) {
    const entry = key && watchProgress[key];
    return Boolean(key && (watchLater[key] || (entry && entry.cw === "later")));
  }

  function shouldRecordWatchProgress(rule = hostnameRule(), key = "") {
    if (!watchSettingsReady || !siteRulesReady) return false;
    if (chosenVideo(key)) return true;
    return !isIncognitoContext() && (watchSettings.tagWatched || watchSettings.continueWatching !== "off"
      || childFrame || Boolean(rule && watchedEnabled(activeCategories(rule))));
  }

  function thumbnailForWatchedLabel(card) {
    const progress = watchedProgress(card);
    if (progress) {
      const selector = "yt-thumbnail-view-model, ytd-thumbnail, a#thumbnail, a.ytLockupViewModelContentImage, .yt-lockup-view-model__content-image, .ytThumbnailViewModelHost";
      let node = progress;
      while (node && node !== card) {
        if (node.matches && node.matches(selector)) {
          if (getComputedStyle(node).position === "static") node.style.position = "relative";
          return node;
        }
        node = node.parentElement;
      }
      // Unknown markup: the first box around the progress bar that is thumbnail-sized, else the card itself.
      node = progress.parentElement;
      while (node && node !== card) {
        const box = node.getBoundingClientRect();
        if (box.width >= 80 && box.height >= 40) break;
        node = node.parentElement;
      }
      const target = node || card;
      if (getComputedStyle(target).position === "static") target.style.position = "relative";
      return target;
    }
    const generic = card.querySelector("a:has(img), [class*=thumbnail], [class*=Thumbnail], img") || card;
    const target = generic.tagName === "IMG" ? generic.parentElement || card : generic;
    if (target && getComputedStyle(target).position === "static") target.style.position = "relative";
    return target;
  }

  function ensureWatchedLabel(card, rule, visible, data = null) {
    if (!visible || !watchSettings.tagWatched || !watchedCard(card, rule, data)) {
      card.querySelectorAll(`[data-hoa-watched="${ownInstance}"]`).forEach(node => node.removeAttribute("data-hoa-watched"));
      return;
    }
    const thumbnail = thumbnailForWatchedLabel(card);
    if (thumbnail) {
      card.querySelectorAll(`[data-hoa-watched="${ownInstance}"]`).forEach(node => { if (node !== thumbnail) node.removeAttribute("data-hoa-watched"); });
      if (thumbnail.getAttribute("data-hoa-watched") !== ownInstance) thumbnail.setAttribute("data-hoa-watched", ownInstance);
    }
  }

  function ensureContinueProgress(card, rule, data) {
    const current = data && watchProgress[data.key];
    const show = rule.id !== "youtube" && current && current.cw && !current.watched && current.duration > 0;
    const thumbnail = thumbnailForWatchedLabel(card);
    if (!thumbnail) return;
    if (!show) {
      if (thumbnail.hasAttribute("data-hoa-continue")) thumbnail.removeAttribute("data-hoa-continue");
      return;
    }
    const progress = `${Math.max(0, Math.min(100, current.position / current.duration * 100))}%`;
    if (!thumbnail.hasAttribute("data-hoa-continue")) thumbnail.setAttribute("data-hoa-continue", "");
    if (thumbnail.style.getPropertyValue("--hoa-progress") !== progress) thumbnail.style.setProperty("--hoa-progress", progress);
  }

  function filterText(card, rule, data) {
    if (rule.id !== "youtube") {
      const cached = passFilterText.get(card);
      if (cached !== undefined) return cached;
      const values = [cardText(card), ...allLeafTexts(card)];
      const attributes = ["alt", "aria-label", "title", "data-title", "video-title", "data-item-name"];
      [card, ...Array.from(card.querySelectorAll("*"))].forEach(node => {
        if (node.closest && node.closest(".hoa-actions")) return;
        attributes.forEach(attribute => {
          const value = node.getAttribute && node.getAttribute(attribute);
          if (value) values.push(value);
        });
      });
      const page = data && data.pageData;
      if (page) [page.cast, page.genres, page.description].forEach(value => {
        if (Array.isArray(value)) values.push(...value);
        else if (value) values.push(String(value));
      });
      const text = values.filter(Boolean).join(" ");
      passFilterText.set(card, text);
      return text;
    }
    const text = [data && data.title, channelText(card, rule)];
    const meta = rule.meta || {};
    ["genres", "texts", "metaTexts"].forEach(name => {
      const selectors = Array.isArray(meta[name]) ? meta[name] : [meta[name]];
      selectors.filter(Boolean).forEach(selector => {
        try {
          card.querySelectorAll(selector).forEach(node => text.push(elementText(node)));
        } catch (error) {
          // Ignore a stale catalog selector.
        }
      });
    });
    return text.filter(Boolean).join(" ");
  }

  function activeCategories(rule) {
    const categories = Array.isArray(rule.categories) ? rule.categories : [];
    const selected = new Set(HOA.normalizeHideKinds(rule.hideKinds, categories.map(category => category.id)));
    return { all: categories, selected: categories.filter(category => selected.has(category.id)) };
  }

  // An ordinary single video (a watch link that is not part of a playlist or mix): the only kind of card the
  // "Recommended" fallback may take, so it never swallows shelves, posts or collections.
  function isOrdinaryVideo(card, rule) {
    const link = getLink(card, rule);
    const href = link ? link.getAttribute("href") || link.href || "" : "";
    return /\/watch\?(?:.*&)?v=/.test(href) && !/[?&]list=/.test(href);
  }

  function shouldFilterCard(card, rule, data, categories) {
    // A site's large rotating feature row is an editorial unit: leaving it alone skips only
    // type/word filtering. Explicit hides, channels and watched cards are handled elsewhere.
    if (rule.featuredCarousels === false && isFeaturedCarousel(card, rule)) {
      return false;
    }
    const keywords = Array.isArray(rule.hideKeywords) ? rule.hideKeywords : [];
    // Nothing switched on for this site: no work at all (this runs for every card on every pass).
    if (!categories.selected.length && !keywords.length) {
      return false;
    }
    let kindMatch = categories.selected.some(category => !category.fallback && categoryMatches(card, rule, category, data));
    const fallback = categories.selected.find(category => category.fallback);
    if (!kindMatch && fallback && (!fallback.pathPattern || safePattern(fallback.pathPattern, location.pathname))) {
      kindMatch = rule.id === "youtube"
        ? isOrdinaryVideo(card, rule) && !categories.all.some(category => !category.fallback && categoryMatches(card, rule, category, data))
        : true;
    }
    return kindMatch || (keywords.length > 0 && HOA.keywordMatch(filterText(card, rule, data), keywords));
  }

  function shelfTitle(shelf) {
    const selector = "#title-text, #title, h2, .yt-shelf-header-layout__title, yt-section-header-view-model h2, [class*='Title']";
    let title = null;
    try { title = shelf.querySelector(selector); } catch (error) { title = null; }
    const text = (title || shelf.querySelector("yt-section-header-view-model") || {}).textContent || "";
    const clean = text.replace(/\s+/g, " ").trim();
    const cached = shelfTitleCache.get(shelf);
    if (!cached || cached.node !== title || cached.text !== clean) shelfTitleCache.set(shelf, { node: title, text: clean });
    return clean;
  }

  function sectionTitle(section, config, rule) {
    let title = null;
    if (config.title) {
      try { title = section.querySelector(config.title); } catch (error) { title = null; }
    }
    if (!title && config.titleClosest && config.title) {
      try {
        const owner = section.closest(config.titleClosest);
        title = owner && owner.querySelector(config.title);
      } catch (error) { title = null; }
    }
    if (title) return (title.textContent || "").replace(/\s+/g, " ").trim();
    if (config.titleAttribute) {
      const value = section.getAttribute(config.titleAttribute);
      if (value) return value.replace(/\s+/g, " ").trim();
    }
    // A rule that names its heading element means "no heading, no title": guessing from the row's text picks up
    // scripts and "View All" links (Rumble's untitled Shorts and featured blocks).
    if (config.title) return "";
    const cardSelectors = [rule.cardSelector, ...(rule.variants || []).map(variant => variant.cardSelector)]
      .filter(Boolean).join(", ");
    // A row headed by a logo (Tubi's Creatorverse) is named by the image's alt text; the text beside it is a tagline.
    let logo = null;
    try { logo = section.querySelector('[class*="row-header"] img[alt]:not([alt=""])'); } catch (error) { logo = null; }
    let logoInCard = false;
    try { logoInCard = Boolean(logo && cardSelectors && logo.closest(cardSelectors)); } catch (error) { logoInCard = false; }
    if (logo && !logoInCard) return logo.getAttribute("alt").replace(/\s+/g, " ").trim();
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.nodeValue || "").replace(/\s+/g, " ").trim();
      if (!text || !node.parentElement) continue;
      let inCard = false;
      try { inCard = Boolean(cardSelectors && node.parentElement.closest(cardSelectors)); } catch (error) { inCard = false; }
      const grid = node.parentElement.closest('[data-test-id="web-ui-grid-container"], .swiper-wrapper');
      const inGrid = grid && (grid.classList.contains("swiper-wrapper") || grid.classList.contains("web-carousel")
        || Array.from(grid.children).some(child => child.matches('[data-test-id="web-ui-grid-item"]')
          || (cardSelectors && safeQuery(child, cardSelectors))));
      if (!inCard && !inGrid) return text;
    }
    return "";
  }

  function matchesOptionalSelector(node, selector) {
    if (!node || !selector) return false;
    try { return node.matches(selector); } catch (error) { return false; }
  }

  function featuredViewport(row) {
    for (let parent = row && row.parentElement, level = 0; parent && level < 6; parent = parent.parentElement, level += 1) {
      const style = getComputedStyle(parent);
      const horizontalOverflow = /(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflow}`)
        || parent.scrollWidth > parent.clientWidth;
      if (horizontalOverflow) return parent;
    }
    return row && row.parentElement;
  }

  function featuredRow(row) {
    if (!row || row.nodeType !== 1) return false;
    if (row.classList.contains("swiper-wrapper")) return true;
    const style = getComputedStyle(row);
    const display = style.display || row.style.display || "";
    const flexRow = /flex/.test(display) && /row/.test(style.flexDirection || row.style.flexDirection || "row")
      && /nowrap/.test(style.flexWrap || row.style.flexWrap || "nowrap");
    const gridColumns = /grid/.test(display) && /column/.test(style.gridAutoFlow || row.style.gridAutoFlow || "");
    const transform = `${row.style.transform || ""} ${style.transform || ""}`;
    return flexRow || gridColumns || /translate(?:3d|X)?\(/i.test(transform) || /^\s*matrix(?:3d)?\(/.test(transform);
  }

  function isFeaturedCarousel(card, rule) {
    const cached = passFeaturedCarousel.get(card);
    if (cached !== undefined) return cached;
    let featured = matchesOptionalSelector(card, rule.featuredSelector);
    const cardSelectors = [rule.cardSelector, ...(rule.variants || []).map(variant => variant.cardSelector)]
      .filter(Boolean).join(", ");
    for (let row = card.parentElement, level = 0; !featured && row && level < 6; row = row.parentElement, level += 1) {
      let slot = card;
      while (slot.parentElement && slot.parentElement !== row) slot = slot.parentElement;
      if (matchesOptionalSelector(slot, rule.featuredSelector)) { featured = true; break; }
      if (!featuredRow(row) || row.children.length < 2) continue;
      let slotCards = [];
      try {
        slotCards = [
          ...(matchesOptionalSelector(slot, cardSelectors) ? [slot] : []),
          ...slot.querySelectorAll(cardSelectors)
        ];
      } catch (error) { continue; }
      if (slotCards.length !== 1 || slotCards[0] !== card) continue;
      const viewport = featuredViewport(row);
      const slotBox = slot.getBoundingClientRect();
      const viewportBox = viewport && viewport.getBoundingClientRect();
      if (viewportBox && viewportBox.width > 0 && slotBox.width >= viewportBox.width * 0.38) featured = true;
    }
    passFeaturedCarousel.set(card, featured);
    return featured;
  }

  function sectionHasFeaturedCarousel(section, rule) {
    if (matchesOptionalSelector(section, rule.featuredSelector)) return true;
    const selectors = [rule.cardSelector, ...(rule.variants || []).map(variant => variant.cardSelector)].filter(Boolean).join(", ");
    if (!selectors) return false;
    try { return Array.from(section.querySelectorAll(selectors)).some(card => isFeaturedCarousel(card, rule)); }
    catch (error) { return false; }
  }

  function rowLabel(node) {
    if (!node) return "";
    const labelled = node.querySelector && node.querySelector("[aria-label]");
    return ((labelled && labelled.getAttribute("aria-label")) || node.getAttribute && node.getAttribute("aria-label") || node.textContent || "")
      .replace(/\s+/g, " ").trim();
  }

  function rowKey(title) {
    const normalized = HOA.normalizeSectionTitles([title]);
    return normalized.length ? normalized[0].toLocaleLowerCase() : "";
  }

  // Sections are classified as a group once per pass.  In particular, this keeps the Xumo rail useful while
  // its lower rows have not been lazy-rendered yet.
  function autoRows(rule, doc = document) {
    if (!rule || rule.sections || !rule.pickedCards) return [];
    let cards = [];
    try { cards = Array.from(doc.querySelectorAll(rule.pickedCards)); } catch (error) { return []; }
    // Rows load late, so the answer only holds while the card count does.
    const cached = doc === document && autoRowsCache.get(doc);
    if (cached && cached.selector === rule.pickedCards && cached.version === filterVersion && cached.count === cards.length) return cached.rows;
    const counts = new Map();
    const cardCount = node => {
      if (counts.has(node)) return counts.get(node);
      let count = 0;
      try { count = node.querySelectorAll(rule.pickedCards).length; } catch (error) { count = 0; }
      counts.set(node, count);
      return count;
    };
    const headingText = node => {
      const text = rowLabel(node);
      return text && text.length >= 2 && text.length <= 60 && !/[\r\n]/.test(text) ? text : "";
    };
    const headingLike = node => node && (node.matches("h1,h2,h3,h4,[role=heading]") || /title|heading|header/i.test(node.className || ""));
    const findHeading = section => {
      const inside = Array.from(section.querySelectorAll("h1,h2,h3,h4,[role=heading],[class*=title i],[class*=heading i],[class*=header i]"))
        .find(node => !node.closest(rule.pickedCards) && headingText(node));
      if (inside) return inside;
      let current = section;
      for (let level = 0; level <= 3 && current; level += 1, current = current.parentElement) {
        let sibling = current.previousElementSibling;
        while (sibling) { if (!cardCount(sibling) && headingLike(sibling) && headingText(sibling)) return sibling; sibling = sibling.previousElementSibling; }
      }
      return null;
    };
    const found = new Map();
    cards.forEach(card => {
      let section = card.parentElement;
      while (section && section !== doc.body && cardCount(section) < 2) section = section.parentElement;
      if (!section || section === doc.body) return;
      const count = cardCount(section);
      while (section.parentElement && section.parentElement !== doc.body && cardCount(section.parentElement) === count) section = section.parentElement;
      if (found.has(section)) return;
      const heading = findHeading(section); const title = heading && headingText(heading);
      if (title) found.set(section, { section, title, heading, featured: false });
    });
    const rows = Array.from(found.values());
    if (doc === document) autoRowsCache.set(doc, { selector: rule.pickedCards, version: filterVersion, count: cards.length, rows });
    return rows;
  }

  function sectionRows(rule, doc = document) {
    const rows = rule.sections && rule.sections.length ? [] : autoRows(rule, doc);
    (rule.sections || []).forEach(config => {
      if (!config || !config.container) return;
      try { doc.querySelectorAll(config.container).forEach(section => {
        const title = sectionTitle(section, config, rule);
        if (title) rows.push({ section, title, featured: sectionHasFeaturedCarousel(section, rule) });
      }); } catch (error) { /* stale optional selector */ }
    });
    let navTitles = [];
    if (rule.sectionNav) {
      try { navTitles = Array.from(doc.querySelectorAll(rule.sectionNav)).map(rowLabel).filter(Boolean); } catch (error) { navTitles = []; }
    }
    const order = navTitles.length ? navTitles : rows.map(row => row.title);
    const picker = (rule.categories || []).find(category => category.id === "genres");
    const categories = (rule.categories || []).filter(category => category.id !== "genres" && (category.shelfTitle || category.rowsAbove));
    const anchorIndex = category => category.rowsAbove ? order.findIndex(title => safePattern(category.rowsAbove, title)) : -1;
    const orderIndex = new Map();
    order.forEach((title, index) => { const key = rowKey(title); if (key && !orderIndex.has(key)) orderIndex.set(key, index); });
    const classify = (title, index, featured) => {
      const direct = categories.filter(category => category.shelfTitle && safePattern(category.shelfTitle, title));
      // A positional category is the fallback for rows with no title category at all; it never overrides a match.
      const positional = direct.length || featured ? [] : categories.filter(category => category.rowsAbove && index >= 0 && index < anchorIndex(category));
      const kinds = [...direct, ...positional].map(category => category.id);
      return { kinds, kind: kinds[0] || (featured ? "featured" : "genre"),
        listed: Boolean(picker) && (picker.typedRows !== false || (!featured && !kinds.length)) };
    };
    rows.forEach((row, index) => {
      const position = navTitles.length ? orderIndex.get(rowKey(row.title)) : index;
      Object.assign(row, classify(row.title, Number.isInteger(position) ? position : -1, row.featured));
    });
    return { rows, navTitles, categories, anchorIndex, classify };
  }

  function rememberRows(rule) {
    if (!rule || isIncognitoContext() || (!(rule.sections && rule.sections.length) && !rule.pickedCards)) return;
    if (Date.now() - lastRowsReadAt < 2000) return;
    lastRowsReadAt = Date.now();
    const titles = HOA.normalizeSectionTitles(sectionRows(rule).rows.map(row => row.title));
    if (!titles.some(title => !lastSeenRows.some(old => old.localeCompare(title, undefined, { sensitivity: "accent" }) === 0))) return;
    lastSeenRows = HOA.normalizeSectionTitles([...lastSeenRows, ...titles]).slice(-300);
    if (seenRowsTimer) return;
    seenRowsTimer = window.setTimeout(() => {
      seenRowsTimer = 0; const host = location.hostname.toLowerCase();   // the popup, Options and Forget all use this name
      chrome.storage.local.get({ [HOA.SEEN_ROWS_KEY]: {} }, saved => {
        const all = saved[HOA.SEEN_ROWS_KEY] && typeof saved[HOA.SEEN_ROWS_KEY] === "object" ? saved[HOA.SEEN_ROWS_KEY] : {};
        const next = HOA.normalizeSectionTitles([...(all[host] || []), ...lastSeenRows]).slice(-300);
        if (next.some(title => !(all[host] || []).some(old => String(old).localeCompare(title, undefined, { sensitivity: "accent" }) === 0))) chrome.storage.local.set({ [HOA.SEEN_ROWS_KEY]: { ...all, [host]: next } });
      });
    }, 2000);
  }

  function hideSectionNav(rule, rows, filtered, nodes) {
    if (!rule.sectionNav) return;
    const hiddenTitles = new Set(rows.filter(row => filtered.has(row.section)).map(row => rowKey(row.title)).filter(Boolean));
    try { document.querySelectorAll(rule.sectionNav).forEach(node => {
      const key = rowKey(rowLabel(node));
      if (key && hiddenTitles.has(key)) { filtered.add(node); if (nodes) nodes.add(node); }
    }); } catch (error) { /* optional nav */ }
  }

  function filterContainers(rule, categories, filtered) {
    rememberRows(rule);
    const cacheKey = `${filterVersion}|${location.pathname}`;
    if (containerFilterCache && containerFilterCache.key === cacheKey) {
      containerFilterCache.nodes.forEach(node => { if (node.isConnected) filtered.add(node); });
      return;
    }
    const nodes = new Set();
    const selected = categories.selected;
    selected.forEach(category => {
      if (category.pathPattern && !safePattern(category.pathPattern, location.pathname)) return;
      if (category.containers) {
        try { document.querySelectorAll(category.containers).forEach(node => { filtered.add(node); nodes.add(node); }); } catch (error) { /* stale selector */ }
      }
      if (category.shelfTitle) {
        const shelves = "ytd-rich-shelf-renderer, ytd-shelf-renderer, ytd-reel-shelf-renderer, grid-shelf-view-model, ytd-rich-section-renderer, yt-section-header-view-model, [data-test-id=web-ui-content-row]";
        try {
          document.querySelectorAll(shelves).forEach(shelf => {
            if (safePattern(category.shelfTitle, shelfTitle(shelf))) {
              const node = shelf.closest("ytd-rich-section-renderer") || shelf;
              if (rule.featuredCarousels !== false || !sectionHasFeaturedCarousel(node, rule)) { filtered.add(node); nodes.add(node); }
            }
          });
        } catch (error) { /* stale selector */ }
      }
    });
    const info = sectionRows(rule);
    const selectedIds = new Set(categories.selected.map(category => category.id));
    const hiddenNames = new Set(HOA.normalizeSectionTitles(rule.hideSections).map(rowKey).filter(Boolean));
    info.rows.forEach(row => {
      const byType = row.kinds.some(id => selectedIds.has(id));
      const byName = row.listed && hiddenNames.has(rowKey(row.title));
      if (byName || (byType && (rule.featuredCarousels !== false || !row.featured))) {
        const node = outermostSingleChildWrapper(row.section);
        filtered.add(row.section);
        nodes.add(row.section);
        filtered.add(node);
        nodes.add(node);
        if (row.heading && !row.section.contains(row.heading)) { filtered.add(row.heading); nodes.add(row.heading); }
      }
    });
    hideSectionNav(rule, info.rows, filtered, nodes);
    containerFilterCache = { key: cacheKey, nodes };
  }

  function removalTarget(card, rule) {
    if (rule.removeSlot) {
      let target = card;
      while (target.parentElement && target.parentElement.children.length === 1
        && !["BODY", "HTML", "MAIN"].includes(target.parentElement.tagName)) {
        target = target.parentElement;
      }
      return target;
    }
    if (rule.removeClosest) {
      return card.closest(rule.removeClosest) || card;
    }
    if (!rule.removeClimb && rule.builtIn) {
      return card;
    }
    let target = card;
    for (let level = 0; level < 4; level += 1) {
      const parent = target.parentElement;
      if (!parent || ["BODY", "HTML", "MAIN"].includes(parent.tagName)
        || parent.children.length !== 1) {
        break;
      }
      target = parent;
    }
    return target;
  }

  function getLinkInfo(card, rule) {
    let link = null;
    if (rule.linkSelector) {
      try {
        link = card.querySelector(rule.linkSelector);
      } catch (error) {
        link = null;
      }
    }
    if (link && link.closest(".hoa-actions, #hoa-toast, #hoa-banner")) {
      link = null;
    }
    if (link) {
      return { link: HOA.chooseCardLink(card, link), preferred: link, categoryLink: link };
    }
    if (!link && card.matches("a[href]")) {
      // Picked cards can be the link itself (a.poster-card).
      return { link: card, preferred: null, categoryLink: card };
    }
    if (!link && rule.linkAttribute && card.getAttribute(rule.linkAttribute)) {
      return { link: card, preferred: null, categoryLink: card };
    }
    const categoryLink = Array.from(card.querySelectorAll("a[href]"))
      .find(candidate => !candidate.closest(".hoa-actions, #hoa-toast, #hoa-banner")) || null;
    return { link: HOA.chooseCardLink(card, null), preferred: null, categoryLink };
  }

  function scrollForRows(done) {
    const startX = scrollX; const startY = scrollY; const started = Date.now(); let steady = 0; let height = document.documentElement.scrollHeight;
    const step = () => { const nextHeight = document.documentElement.scrollHeight; const atBottom = scrollY + (innerHeight || 600) >= nextHeight - 4; steady = nextHeight <= height && atBottom ? steady + 1 : 0; height = Math.max(height, nextHeight); if (steady >= 4 || Date.now() - started >= 20000) { scrollTo({ left: startX, top: startY, behavior: "instant" }); done(); return; } scrollBy(0, Math.max(innerHeight || 600, 200)); window.setTimeout(step, 350); };
    step();
  }

  function rememberFoundRows(rule, titles) {
    const host = location.hostname.toLowerCase();   // the popup, Options and Forget all use this name
    chrome.storage.local.get({ [HOA.SEEN_ROWS_KEY]: {} }, saved => {
      const all = saved[HOA.SEEN_ROWS_KEY] && typeof saved[HOA.SEEN_ROWS_KEY] === "object" ? saved[HOA.SEEN_ROWS_KEY] : {};
      const next = HOA.normalizeSectionTitles([...(all[host] || []), ...titles]).slice(-300);
      chrome.storage.local.set({ [HOA.SEEN_ROWS_KEY]: { ...all, [host]: next } });
    });
  }

  function genrePageUrls(rule, callback) {
    const current = HOA.canonicalUrl(location.href); const urls = new Set();
    Array.from(document.querySelectorAll("a[href]")).forEach(link => { const href = HOA.canonicalUrl(link.href, location.href); if (href && href !== current && HOA.kindOf(href) === "category" && new URL(href).origin === location.origin) urls.add(href); });
    const cards = sectionRows(rule).rows.filter(row => /genre|categor|collection|browse/i.test(row.title)).flatMap(row => {
      try { return Array.from(row.section.querySelectorAll(rule.pickedCards || rule.cardSelector)); } catch (error) { return []; }
    }).slice(0, 12);
    const next = () => { const card = cards.shift(); if (!card || urls.size >= 12) { callback(Array.from(urls).slice(0, 12)); return; } resolveCardLink(card).then(href => { if (href && href !== current && new URL(href).origin === location.origin && HOA.kindOf(href) === "category") urls.add(href); next(); }).catch(next); };
    next();
  }

  function readRowsFrame(url, rule, deadline, done) {
    const frame = document.createElement("iframe"); let finished = false; let last = -1; let steady = 0; const giveUp = Math.min(deadline, Date.now() + 7000);
    const finish = result => { if (finished) return; finished = true; frame.remove(); done(result); };
    frame.name = "hoa-rows-frame"; frame.src = url; frame.setAttribute("aria-hidden", "true"); frame.tabIndex = -1; frame.sandbox = "allow-same-origin allow-scripts"; frame.allow = "autoplay 'none'";
    Object.assign(frame.style, { position: "fixed", left: "-3000px", top: "0", width: "1300px", height: "900px", opacity: "0", pointerEvents: "none" });
    const poll = () => { let doc; try { doc = frame.contentDocument; } catch (error) { finish({ blocked: true, rows: [] }); return; } if (!doc || !doc.body) { if (Date.now() >= giveUp) finish({ blocked: true, rows: [] }); else window.setTimeout(poll, 500); return; }
      try { doc.defaultView.scrollBy(0, 800); } catch (error) { /* frame may be loading */ }
      const rows = sectionRows(rule, doc).rows; // A page that has not rendered yet has no rows: an unchanging zero means nothing.
      steady = rows.length && rows.length === last ? steady + 1 : 0; last = rows.length;
      if (steady >= 3 || Date.now() >= giveUp) { finish({ empty: !rows.length, rows }); return; } window.setTimeout(poll, 500);
    };
    frame.addEventListener("error", () => finish({ blocked: true, rows: [] }), { once: true }); document.body.appendChild(frame); window.setTimeout(poll, 500);
  }

  function readGenrePages(urls, rule, callback) {
    const result = { pages: urls.length, read: 0, blocked: 0, empty: 0, skipped: 0, rows: [] }; const deadline = Date.now() + 45000; let next = 0; let running = 0; let finished = false;
    const launch = () => { if (finished) return; if ((next >= urls.length && !running) || Date.now() >= deadline) { finished = true; result.skipped += urls.length - next; callback(result); return; }
      while (running < 3 && next < urls.length && Date.now() < deadline) { const url = urls[next++]; running += 1; readRowsFrame(url, rule, deadline, value => { running -= 1; if (value.blocked) result.blocked += 1; else { result.read += 1; if (value.empty) result.empty += 1; result.rows.push(...value.rows.map(row => row.title)); } try { chrome.runtime.sendMessage({ type: "hoa-rows-progress", done: result.read + result.blocked, total: result.pages }, () => void chrome.runtime.lastError); } catch (error) { /* popup may have closed */ } launch(); }); }
    };
    launch();
  }

  function getLink(card, rule) {
    return getLinkInfo(card, rule).link;
  }

  // Thumbnail links carry only a duration badge ("2:13", "1:02:03") or "LIVE"; never use that as a title.
  function looksLikeBadge(text) {
    return /^(\d{1,2}:){1,2}\d{2}$/.test(text) || /^(live|new|shorts?)$/i.test(text);
  }

  function plausiblePickedTitle(value) {
    const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    return text.length >= 2 && text.length <= 200 && /[A-Za-z].*[A-Za-z]/.test(text)
      && !looksLikeBadge(text) && !/^[\d\s\p{P}\p{S}]+$/u.test(text) ? text : "";
  }

  function categoryTitle(card) {
    let heading;
    try {
      heading = card.querySelector("h1, h2, h3, h4");
    } catch (error) {
      heading = null;
    }
    const headingTitle = plausiblePickedTitle(heading && heading.getAttribute("title"));
    const headingText = plausiblePickedTitle(heading && heading.textContent);
    if (headingTitle || headingText) return headingTitle || headingText;
    const image = card.querySelector("img[alt]");
    return plausiblePickedTitle(image && image.getAttribute("alt"))
      .replace(/\s+(?:cover image|box art)$/i, "");
  }

  function pickedTitle(card, link) {
    const linkLabel = plausiblePickedTitle(link && link.getAttribute("aria-label"))
      || plausiblePickedTitle(link && link.getAttribute("title"));
    if (linkLabel) {
      return linkLabel;
    }
    let heading;
    try {
      heading = card.querySelector('h1, h2, h3, h4, [class*="title" i], [id*="title" i], [itemprop="name"]');
    } catch (error) {
      heading = null;
    }
    const headingTitle = plausiblePickedTitle(heading && heading.getAttribute("title"));
    const headingText = plausiblePickedTitle(heading && heading.textContent);
    if (headingTitle || headingText) {
      return headingTitle || headingText;
    }
    const image = card.querySelector("img[alt]");
    const alt = plausiblePickedTitle(image && image.getAttribute("alt"));
    if (alt) {
      return alt;
    }
    return allLeafTexts(card).map(plausiblePickedTitle).filter(Boolean)
      .sort((left, right) => right.length - left.length)[0] || "";
  }

  function candidateText(element, selector = "") {
    const attribute = String(selector).match(/\[(alt|aria-label|title)\]/);
    const value = element && attribute ? (element.getAttribute(attribute[1]) || "").trim() : "";
    return value || (element && element.matches("img") ? "" : textFrom(element));
  }

  function textFrom(element) {
    if (!element) {
      return "";
    }
    let ownText = element.textContent;
    if (element.querySelector(".hoa-actions")) {
      // Our buttons live inside the card (and inside the link when the card is the link).
      const copy = element.cloneNode(true);
      copy.querySelectorAll(".hoa-actions").forEach(node => node.remove());
      ownText = copy.textContent;
    }
    const candidates = [ownText, element.getAttribute("aria-label"), element.getAttribute("title"),
      element.getAttribute("data-title"), element.getAttribute("video-title"), element.getAttribute("data-item-name"), element.getAttribute("content")];
    for (const candidate of candidates) {
      const text = (candidate || "").trim();
      if (text && !looksLikeBadge(text)) {
        return text;
      }
    }
    return "";
  }

  function keyForHref(href, rule) {
    if (rule.stripQuery) {
      try { const url = new URL(href, location.href); url.search = ""; href = url.href; } catch (error) { /* canonicalUrl rejects malformed links */ }
    }
    return HOA.canonicalUrl(href, location.href);
  }

  function watchKey(rule) {
    if (rule && rule.watchPath) {
      try { if (!(new RegExp(rule.watchPath).test(location.pathname))) return null; } catch (error) { return null; }
    } else if (location.pathname === "/") {
      return null;
    }
    // A bare YouTube /watch is a shell, not a video. Its player can survive an
    // SPA navigation, so never let it create a home/listing progress record.
    if (HOA.siteOf(location.href) === "youtube.com" && location.pathname === "/watch" && !new URL(location.href).searchParams.get("v")) return null;
    let href = location.href;
    if (rule && rule.watchKey) {
      try { const match = location.pathname.match(new RegExp(rule.watchKey.pattern)); if (match) href = rule.watchKey.template.replace(/\$(\d+)/g, (_, index) => match[Number(index)] || ""); } catch (error) { /* optional mapping */ }
    }
    return keyForHref(href, rule || {});
  }

  function cardData(card, rule) {
    const linkInfo = getLinkInfo(card, rule);
    const link = linkInfo.link;
    if (!link) {
      if (!rule.pickedCards) return null;
      const heading = card.querySelector("h1, h2, h3, h4");
      const image = card.querySelector("img[alt]");
      const title = HOA.cleanTitle(textFrom(heading) || (image && image.getAttribute("alt")) || pickedTitle(card, null)).slice(0, HOA.MAX_TITLE);
      const formerKey = HOA.cardKey(location.origin, title);
      if (!formerKey) return null;
      const key = cardLinks[formerKey] || formerKey;
      return { key, title, thumb: image && (image.currentSrc || image.src || image.getAttribute("src")) || "", kind: HOA.kindOf(key), site: HOA.siteOf(key), ts: Date.now(), linkless: true,
        ...(key !== formerKey ? { formerKey } : {}) };
    }
    const href = (rule.linkAttribute && link.getAttribute(rule.linkAttribute)) || link.href || link.getAttribute("href");
    const key = keyForHref(href, rule);
    if (!key) {
      return null;
    }
    const kind = HOA.kindOf(key);
    const category = kind === "category";
    let title = category ? categoryTitle(card) : "";
    if (!title) {
      for (const selector of rule.titleCandidates || []) {
        let candidate;
        try {
          candidate = card.matches(selector) ? card : card.querySelector(selector);
        } catch (error) {
          candidate = null;
        }
        title = candidateText(candidate, selector);
        if (title) {
          break;
        }
      }
    }
    if (rule.titleFromSlug && (!title || /\.(?:png|jpe?g|webp)$/i.test(title))) {
      const rawHref = link.getAttribute("href") || href || "";
      const match = rawHref.match(new RegExp(rule.titleFromSlug, "i"));
      if (match && match[1]) title = match[1].replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
    }
    if (!title && rule.userPicked) {
      title = pickedTitle(card, link);
    }
    title = title || textFrom(link);
    if (!title) {
      const image = card.querySelector("img[alt]");
      title = image ? (image.getAttribute("alt") || "").trim().replace(category ? /\s+(?:cover image|box art)$/i : /$^/, "") : "";
    }
    // A channel card should be named for the channel, not the adjacent video/title
    // text a feed happens to show.
    if (kind === "channel") {
      const identity = channelIdentity(card, rule);
      if (identity && identity.name) title = identity.name;
    }
    title = HOA.cleanTitle(title || HOA.siteOf(key)).slice(0, HOA.MAX_TITLE);

    let thumb = HOA.youtubeThumb(key);
    if (!thumb) {
      const image = card.querySelector("img");
      const source = image && (image.currentSrc || image.src || image.getAttribute("src"));
      thumb = typeof source === "string" && /^https?:\/\//i.test(source) && source.length <= HOA.MAX_URL ? source : "";
    }
    const pageData = pageDataForCard(card, rule, link);
    // The link this card used to be saved under. A channel link is shared by many cards, so it is never moved onto one of them.
    const former = linkInfo.categoryLink;
    const formerHref = former && former !== link && ((rule.linkAttribute && former.getAttribute(rule.linkAttribute)) || former.href || former.getAttribute("href"));
    const candidateKey = formerHref && keyForHref(formerHref, rule);
    const formerKey = candidateKey && HOA.kindOf(candidateKey) !== "channel" ? candidateKey : "";
    return { key, title, thumb, kind, site: HOA.siteOf(key), ts: Date.now(), ...(formerKey && formerKey !== key ? { formerKey } : {}), ...(pageData ? { pageData } : {}) };
  }

  function elementText(element) {
    return element ? (element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim() : "";
  }

  function firstMetaElementText(card, selector) {
    try {
      return elementText(card.querySelector(selector));
    } catch (error) {
      return "";
    }
  }

  function allLeafTexts(card) {
    const leaves = [];
    const elements = [card, ...Array.from(card.querySelectorAll("*"))];
    for (const element of elements) {
      if (element.children && element.children.length) {
        continue;
      }
      if (element.closest && element.closest(".hoa-actions, #hoa-toast, #hoa-banner")) {
        continue;
      }
      const text = elementText(element);
      if (text && text.length <= 80) {
        leaves.push(text);
        if (leaves.length >= 60) {
          break;
        }
      }
    }
    return leaves;
  }

  function firstParsed(texts, parser) {
    for (const text of texts) {
      const value = parser(text);
      if (value !== null) {
        return value;
      }
    }
    return null;
  }

  function cardIcon(key) {
    let href = "";
    try {
      const link = document.querySelector('link[rel~="icon"]');
      href = link && link.getAttribute("href") ? new URL(link.getAttribute("href"), location.href).href : "";
    } catch (error) {
      href = "";
    }
    if (!/^https?:\/\//i.test(href)) {
      try {
        href = new URL("/favicon.ico", new URL(key).origin).href;
      } catch (error) {
        href = "";
      }
    }
    return /^https?:\/\//i.test(href) && href.length <= HOA.MAX_URL ? href : "";
  }

  function cardPicture(card) {
    const web = value => (typeof value === "string" && /^https?:\/\//i.test(value) && value.length <= HOA.MAX_URL ? value : "");
    const firstOfSet = value => web(String(value || "").split(",")[0].trim().split(/\s+/)[0]);
    const images = Array.from(card.querySelectorAll("img")).filter(image => !image.closest(".hoa-actions"));
    const area = image => { const box = image.getBoundingClientRect(); return box.width * box.height; };
    // The largest first, so a channel avatar or a badge isn't taken for the picture.
    for (const image of images.map(node => [node, area(node)]).sort((left, right) => right[1] - left[1]).map(([node]) => node)) {
      const found = web(image.currentSrc) || web(image.src) || web(image.getAttribute("data-src")) || web(image.getAttribute("data-lazy-src"))
        || web(image.getAttribute("data-original")) || firstOfSet(image.getAttribute("srcset")) || firstOfSet(image.getAttribute("data-srcset"));
      if (found) return found;
    }
    const source = card.querySelector("picture source[srcset]");
    const fromSource = source && firstOfSet(source.getAttribute("srcset"));
    if (fromSource) return fromSource;
    for (const node of [card, ...card.querySelectorAll('[style*="background"]')]) {
      const match = String(node.style && node.style.backgroundImage || "").match(/url\(["']?(https?:[^"')]+)/i);
      if (match && web(match[1])) return match[1];
    }
    return "";
  }

  function cardMeta(card, rule, key) {
    const meta = { type: HOA.typeOf(key), icon: cardIcon(key) };
    if (!HOA.youtubeThumb(key)) { const picture = cardPicture(card); if (picture) meta.thumb = picture; }
    const ruleMeta = rule && rule.meta || {};
    const texts = [];
    const addTexts = selectors => (selectors || []).forEach(selector => {
      if (selector === "*") {
        texts.push(...allLeafTexts(card));
        return;
      }
      try {
        // A line such as "Horror · 1987 · 1 hr 34 min" also counts part by part.
        card.querySelectorAll(selector).forEach(element => {
          const text = elementText(element);
          texts.push(text, ...(text.includes("·") ? text.split(/\s*·\s*/).filter(Boolean) : []));
        });
      } catch (error) {
        // Ignore malformed optional selectors.
      }
    });
    addTexts(ruleMeta.texts);
    addTexts(ruleMeta.metaTexts);
    if (!rule.meta) {
      texts.push(...allLeafTexts(card));
    }

    if (Array.isArray(ruleMeta.duration)) {
      meta.duration = firstParsed(ruleMeta.duration.map(selector => firstMetaElementText(card, selector)), HOA.parseDuration);
    } else if (typeof ruleMeta.duration === "string") {
      meta.duration = HOA.parseDuration(firstMetaElementText(card, ruleMeta.duration));
    }
    if (typeof ruleMeta.year === "string") {
      meta.year = HOA.parseYear(firstMetaElementText(card, ruleMeta.year));
    }
    if (typeof ruleMeta.rating === "string") {
      const rating = firstMetaElementText(card, ruleMeta.rating);
      meta.rating = /^(G|PG|PG-13|R|NC-17|TV-(Y7?|G|PG|14|MA)|NR|UR)$/i.test(rating) ? rating : null;
    }
    if (typeof ruleMeta.genres === "string") {
      const genres = HOA.splitGenres(firstMetaElementText(card, ruleMeta.genres));
      meta.genres = genres.length ? genres : null;
    }
    if (typeof ruleMeta.score === "string") {
      meta.score = HOA.parseScore(firstMetaElementText(card, ruleMeta.score));
    }
    if (typeof ruleMeta.votes === "string") {
      meta.votes = HOA.parseVotes(firstMetaElementText(card, ruleMeta.votes));
    }
    if (typeof ruleMeta.date === "string") {
      const date = HOA.parseDate(firstMetaElementText(card, ruleMeta.date));
      meta.published = date;
      if (date !== null && !meta.year) {
        meta.year = new Date(date).getUTCFullYear();
      }
    }
    if (texts.length) {
      meta.duration = meta.duration ?? firstParsed(texts, HOA.parseDuration);
      meta.year = meta.year ?? firstParsed(texts, HOA.parseYear);
      meta.views = meta.views ?? firstParsed(texts, HOA.parseViews);
      meta.published = meta.published ?? firstParsed(texts, text => HOA.parseRelativeAge(text, Date.now()))
        ?? firstParsed(texts, HOA.parseDate);
      const rating = texts.find(text => /^(G|PG|PG-13|R|NC-17|TV-(Y7?|G|PG|14|MA)|NR|UR)$/i.test(text));
      meta.rating = meta.rating ?? rating ?? null;
    }
    if (Array.isArray(rule.typeByCard)) {
      const match = rule.typeByCard.find(entry => card.matches(entry[0]));
      if (match) meta.type = match[1];
    }
    if (rule.typeFixed) {
      meta.type = rule.typeFixed;
    } else if (Array.isArray(rule.typeByPath)) {
      const match = rule.typeByPath.find(entry => Array.isArray(entry) && location.pathname.startsWith(entry[0]));
      if (match) {
        meta.type = match[1];
      }
    }
    if (!rule.typeFixed && !(Array.isArray(rule.typeByPath) && rule.typeByPath.some(entry => Array.isArray(entry) && location.pathname.startsWith(entry[0]))) && Array.isArray(rule.typeByText)) {
      rule.typeByText.some(([source, type]) => {
        try {
          if (texts.some(text => new RegExp(source, "i").test(text))) {
            meta.type = type;
            return true;
          }
        } catch (error) {
          // Ignore malformed optional catalog patterns.
        }
        return false;
      });
    }
    const identity = channelIdentity(card, rule);
    if (identity && identity.name) meta.channel = identity.name.trim().slice(0, HOA.MAX_TITLE);
    return Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== null && value !== ""));
  }

  // A ticked circle struck through: the tick of the Watched tag, cancelled. Built node by node because YouTube's
  // Trusted Types policy rejects markup strings, and the strike's gaps are drawn so no mask id is needed.
  function unwatchIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    ["M8.2 3.84A9 9 0 0 1 20.16 15.8", "M15.8 20.16A9 9 0 0 1 3.84 8.2", "M7.5 12.5l3 3 .9-1.05", "M14.2 11.2l2.3-2.7", "M3.5 3.5l17 17"].forEach(shape => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", shape);
      svg.appendChild(path);
    });
    return svg;
  }

  function actionButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!ensureContext(true)) {
        return;
      }
      action(button);
    });
    return button;
  }

  function removeActions(card) {
    card.querySelectorAll(":scope > .hoa-actions").forEach(node => {
      if (node.hoaPlacementObserver) {
        node.hoaPlacementObserver.disconnect();
      }
      node.remove();
    });
    card.classList.remove("hoa-host", "hoa-show");
  }

  async function resolveCardLink(card) {
    if (!window.navigation || resolvingCardLink) return null;
    const origin = location.origin;
    const targets = [card, card.parentElement, card.parentElement && card.parentElement.parentElement].filter(Boolean);
    resolvingCardLink = true;
    try {
      for (const target of targets) {
        const result = await new Promise(resolve => {
          let done = false;
          const finish = value => { if (!done) { done = true; window.navigation.removeEventListener("navigate", onNavigate); window.clearTimeout(timer); resolve(value); } };
          const onNavigate = event => {
            try {
              // Whatever the card tried to do, the user stays on this page.
              if (event && event.cancelable) event.preventDefault();
              const url = new URL(event && event.destination && event.destination.url);
              if ((url.protocol === "http:" || url.protocol === "https:") && url.origin === origin && url.href !== location.href) {
                finish(HOA.canonicalUrl(url.href));
              }
            } catch (error) { /* ignore unrelated navigation */ }
          };
          const timer = window.setTimeout(() => finish(null), 150);
          window.navigation.addEventListener("navigate", onNavigate);
          try { target.click(); } catch (error) { finish(null); }
        });
        if (result) return result;
      }
    } finally {
      resolvingCardLink = false;
    }
    return null;
  }

  async function resolveLinkless(data) {
    // Already known: no need to click the card again.
    if (!data.linkless || data.formerKey) return data;
    const realKey = await resolveCardLink(data.card);
    if (!realKey) return data;
    cardLinks = { ...cardLinks, [data.formerKey || data.key]: realKey };
    HOA.writeLists({ cardLinks });
    return { ...data, key: realKey, formerKey: data.formerKey || data.key };
  }

  async function hideEntry(data, watched = false) {
    data = await resolveLinkless(data);
    migrateFormerKey(data);
    const entry = { ...data, ts: Date.now(), listed: true };
    delete entry.card;
    if (watched === true) entry.watched = true;
    hidden = { ...hidden, [data.key]: entry };
    try {
      HOA.writeLists({ hidden });
    } catch (error) {
      retire(false);
      return;
    }
    showToast(data.key);
    lastApplyAt = 0;
    scheduleApply(true);
  }

  function hideChannel(identity) {
    if (!identity) return;
    const key = identity.linkKey || identity.nameKey;
    if (!key) return;
    channels = {
      ...channels,
      [key]: {
        key,
        name: identity.name || key.replace(/^[^|]+\|name:/, ""),
        url: identity.url || "",
        site: identity.site || "youtube.com",
        ts: Date.now(),
        ...(identity.nameKey ? { nameKey: identity.nameKey } : {}),
        ...(identity.linkKey ? { linkKey: identity.linkKey } : {})
      }
    };
    HOA.writeLists({ channels });
    showToast(key, "Channel hidden", () => {
      channels = { ...channels };
      delete channels[key];
      HOA.writeLists({ channels });
    });
    lastApplyAt = 0;
    scheduleApply(true);
  }

  const queuedWatched = new Set();

  function queueWatched(data) {
    if (hidden[data.key] || watchedShown[data.key]) return;
    const removed = watchProgress[data.key] && watchProgress[data.key].unlisted;
    hidden = { ...hidden, [data.key]: { ...data, ts: Date.now(), listed: !removed, reason: "watched" } };
    queuedWatched.add(data.key);
    if (!watchedWriteTimer) {
      watchedWriteTimer = window.setTimeout(() => {
        watchedWriteTimer = 0;
        const rule = hostnameRule();
        if (!rule || !watchedEnabled(activeCategories(rule))) {
          // Watched was turned off while these waited: saving now would bring back what that just cleared.
          const next = { ...hidden };
          queuedWatched.forEach(key => delete next[key]);
          hidden = next;
          queuedWatched.clear();
          scheduleApply();
          return;
        }
        const queued = {};
        queuedWatched.forEach(key => { if (hidden[key]) queued[key] = hidden[key]; });
        queuedWatched.clear();
        // Only what this tab found: anything newer from another tab or the toolbar stays.
        HOA.readLists(lists => HOA.writeLists({ hidden: { ...queued, ...lists.hidden } }));
      }, 500);
    }
  }

  async function toggleAdd(data, button) {
    data = await resolveLinkless(data);
    migrateFormerKey(data);
    added = HOA.toggleAdded(added, data.key, data);
    try {
      HOA.writeLists({ added });
    } catch (error) {
      retire(false);
      return;
    }
    const isAdded = Boolean(added[data.key]);
    button.textContent = isAdded ? "Added" : "Add";
    button.setAttribute("aria-label", isAdded ? "Added" : "Add");
    button.setAttribute("aria-pressed", String(isAdded));
  }

  // Buttons always sit centred on the top edge. When the site's own controls are there
  // (IMDb's watchlist ribbon and info button), slide sideways past them, or just below them near the top,
  // instead of jumping to the bottom of the card.
  // The card's video picture: the largest image or video at least 40% as wide as the card; an element named
  // "thumbnail" only when there is none (YouTube wraps whole cards in elements with that word in the class).
  function videoPictureBox(card, cardRect, originX, originY) {
    const largest = selector => {
      let best = null;
      let bestArea = 0;
      card.querySelectorAll(selector).forEach(element => {
        if (element.closest(".hoa-actions")) {
          return;
        }
        const rect = element.getBoundingClientRect();
        const area = rect.width * rect.height;
        // Skip only something that covers the whole card (its own wrapper). A side-by-side thumbnail is often
        // exactly as tall as the card.
        const coversCard = rect.width >= cardRect.width * 0.98 && rect.height >= cardRect.height * 0.98;
        if (rect.width >= cardRect.width * 0.3 && !coversCard && area > bestArea) {
          best = rect;
          bestArea = area;
        }
      });
      return best;
    };
    const best = largest("img, video") || largest("picture, [class*=\"thumbnail\" i]");
    if (!best) {
      return { top: 0, bottom: cardRect.height, left: 0, right: cardRect.width };
    }
    return {
      top: Math.max(0, best.top - originY),
      bottom: Math.min(cardRect.height, best.bottom - originY),
      left: Math.max(0, best.left - originX),
      right: Math.min(cardRect.width, best.right - originX)
    };
  }

  function placeActions(card, actions, rule) {
    // A card that grows while it is pointed at must not carry the buttons away from under the pointer.
    if (actions.hoaPlacementSize && card.matches(":hover")) return;
    const cardRect = card.getBoundingClientRect();
    const size = `${Math.round(cardRect.width)}x${Math.round(cardRect.height)}`;
    if (!cardRect.width || !cardRect.height || actions.hoaPlacementSize === size) {
      return;
    }
    actions.hoaPlacementSize = size;
    const previousVisibility = actions.style.visibility;
    actions.style.visibility = "visible";
    Object.assign(actions.style, { top: "0px", left: "0px", right: "auto", bottom: "auto", transform: "none" });
    const box = actions.getBoundingClientRect();
    const originX = box.left;
    const originY = box.top;
    const width = box.width;
    const height = box.height;
    const margin = 8;
    // Centre on the video picture. In a card laid out side by side (thumbnail left, text right, like YouTube's
    // watch-page sidebar) that is the thumbnail, not the middle of the whole card.
    const picture = videoPictureBox(card, cardRect, originX, originY);
    const pictureWidth = picture.right - picture.left;
    const sidePicture = pictureWidth < cardRect.width * 0.8 && pictureWidth >= width + 2 * margin;
    const preferredX = sidePicture ? picture.left + (pictureWidth - width) / 2 : (cardRect.width - width) / 2;
    // Sliding past the site's own controls stays within the thumbnail when it sits beside the text.
    const minX = sidePicture ? picture.left + margin : margin;
    const maxX = sidePicture ? picture.right - width - margin : Math.max(margin, cardRect.width - width - margin);
    const controls = Array.from(card.querySelectorAll("button, [role=\"button\"], input, select, textarea, a[aria-label][role]"))
      .filter(element => !element.closest(".hoa-actions, #hoa-toast, #hoa-banner"))
      .map(element => element.getBoundingClientRect())
      .filter(rect => rect.width && rect.height && rect.width <= cardRect.width * 0.6)
      .map(rect => ({ left: rect.left - originX, right: rect.right - originX, top: rect.top - originY, bottom: rect.bottom - originY }));
    const blocker = (x, y) => controls.find(rect => x < rect.right + 4 && x + width > rect.left - 4
      && y < rect.bottom + 4 && y + height > rect.top - 4);
    const clampX = x => Math.min(maxX, Math.max(minX, x));
    const tryRow = y => {
      for (const direction of [-1, 1]) {
        let x = clampX(preferredX);
        for (let step = 0; step < 8; step += 1) {
          const hit = blocker(x, y);
          if (!hit) {
            return x;
          }
          const next = clampX(direction < 0 ? hit.left - 4 - width : hit.right + 4);
          if (next === x) {
            break;
          }
          x = next;
        }
      }
      return null;
    };
    let x = null;
    let y = margin;
    let rows;
    let fallbackY = margin;
    if (buttonEdge === "bottom") {
      // Bottom means the bottom edge of the video picture, not of the whole card (YouTube cards continue with
      // the title and channel below it). Blocked rows move up, but stay in the lower half of the picture.
      const media = picture;
      const lowest = Math.max(margin, media.bottom - height - margin);
      const highest = Math.max(margin, media.top + (media.bottom - media.top) / 2 - height / 2);
      fallbackY = lowest;
      rows = [lowest, ...controls.map(rect => rect.top - 6 - height).filter(top => top < lowest)]
        .filter(top => top >= highest).sort((a, b) => b - a);
    } else {
      rows = [margin, ...controls.map(rect => rect.bottom + 6).filter(top => top > margin)].sort((a, b) => a - b)
        .filter(row => row + height <= Math.max(cardRect.height / 2, margin + height));
    }
    for (const row of rows) {
      x = tryRow(row);
      if (x !== null) {
        y = row;
        break;
      }
    }
    if (x === null) {
      x = clampX(preferredX);
      y = fallbackY;
    }
    Object.assign(actions.style, { top: `${Math.round(y)}px`, left: `${Math.round(x)}px` });
    actions.style.visibility = previousVisibility;
  }

  function ensureActions(card, data, rule = lastRule) {
    let actions = Array.from(card.children).find(node => node.classList.contains("hoa-actions") && node.dataset.hoaOwner === ownInstance) || null;
    Array.from(card.children).filter(node => node.classList.contains("hoa-actions")).forEach(node => {
      if (node !== actions) {
        if (node.hoaPlacementObserver) {
          node.hoaPlacementObserver.disconnect();
        }
        node.remove();
      }
    });
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "hoa-actions";
      actions.dataset.hoaOwner = ownInstance;
      // Sites recycle card elements for other items, so handlers read the current
      // item from the actions node instead of capturing the first one.
      const add = actionButton("Add", button => toggleAdd({ ...actions.hoaData, card: actions.hoaCard, ...cardMeta(actions.hoaCard, actions.hoaRule, actions.hoaData.key) }, button));
      add.dataset.action = "add";
      actions.appendChild(add);
      const hide = actionButton("Hide", () => hideEntry({ ...actions.hoaData, card: actions.hoaCard, ...cardMeta(actions.hoaCard, actions.hoaRule, actions.hoaData.key) }, watchedCard(actions.hoaCard, actions.hoaRule, actions.hoaData)));
      hide.dataset.action = "hide";
      actions.appendChild(hide);
      const unwatch = actionButton("", () => {
        const key = actions.hoaData && actions.hoaData.key; const prior = key && watchProgress[key];
        if (!prior) return;
        watchProgress = { ...watchProgress, [key]: { ...prior, watched: false, untagged: true, buckets: HOA.bitmapBuckets("") } };
        HOA.writeProgress(key, watchProgress[key]); scheduleApply(true);
        showToast(key, "Watched tag removed", () => { watchProgress = { ...watchProgress, [key]: prior }; HOA.writeProgress(key, prior); scheduleApply(true); });
      });
      unwatch.dataset.action = "unwatch"; unwatch.title = "Remove Watched tag"; unwatch.setAttribute("aria-label", "Remove Watched tag"); unwatch.hidden = true;
      unwatch.classList.add("hoa-icon-action"); unwatch.appendChild(unwatchIcon()); actions.appendChild(unwatch);
      card.appendChild(actions);
    }
    actions.hoaData = data;
    actions.hoaCard = card;
    actions.hoaRule = rule;
    const identity = channelIdentity(card, rule);
    let channel = actions.querySelector('[data-action="channel"]');
    const isChannelPage = isOwnChannelPage(identity);
    if (identity && !isChannelPage && !channel) {
      channel = actionButton("Hide channel", () => hideChannel(channel.hoaIdentity));
      channel.dataset.action = "channel";
      actions.appendChild(channel);
    }
    if (channel) {
      channel.hoaIdentity = identity;
      channel.title = identity && identity.name ? `Hide every video from ${identity.name}` : "Hide this channel";
      if (!identity || isChannelPage) channel.remove();
    }
    if (!actions.hoaPlacementBound) {
      actions.hoaPlacementBound = true;
      card.addEventListener("mouseenter", () => {
        placeActions(card, actions, actions.hoaRule || {});
        if (!actions.hoaPlacementObserver && typeof ResizeObserver === "function") {
          actions.hoaPlacementObserver = new ResizeObserver(() => {
            if (card.isConnected && actions.isConnected) {
              placeActions(card, actions, actions.hoaRule || {});
            }
          });
          actions.hoaPlacementObserver.observe(card);
        }
      });
    }
    if (!card.classList.contains("hoa-host")) {
      const position = getComputedStyle(card).position;
      if ((!position || position === "static") && !card.hasAttribute("data-hoa-static")) card.setAttribute("data-hoa-static", "");
      card.classList.add("hoa-host");
    }
    placeActions(card, actions, actions.hoaRule || {});
    const add = actions.querySelector('[data-action="add"]');
    if (add) {
      const isAdded = Boolean(added[data.key]);
      const label = isAdded ? "Added" : "Add";
      if (add.textContent !== label) add.textContent = label;
      if (add.getAttribute("aria-label") !== label) add.setAttribute("aria-label", label);
      if (add.getAttribute("aria-pressed") !== String(isAdded)) add.setAttribute("aria-pressed", String(isAdded));
    }
    const unwatch = actions.querySelector('[data-action="unwatch"]');
    if (unwatch) { const hidden = !(watchSettings.tagWatched && watchedCard(card, rule, data)); if (unwatch.hidden !== hidden) unwatch.hidden = hidden; }
  }

  function showToast(key, messageText = "Hidden", undoAction = null, actionLabel = "Undo") {
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    const old = document.getElementById("hoa-toast");
    if (old) {
      old.remove();
    }
    const toast = document.createElement("div");
    toast.id = "hoa-toast";
    toast.setAttribute("role", "status");
    const message = document.createElement("span");
    message.textContent = messageText;
    toast.appendChild(message);
    const undo = actionButton(actionLabel, () => {
      if (undoAction) undoAction();
      else {
        hidden = HOA.restoreKeys(hidden, [key]);
        try { HOA.writeLists({ hidden }); } catch (error) { retire(false); return; }
      }
      toast.remove();
      lastApplyAt = 0;
      scheduleApply(true);
    });
    toast.appendChild(undo);
    document.body.appendChild(toast);
    toastTimer = window.setTimeout(() => toast.remove(), 6000);
  }

  function showBulkBanner(rule) {
    let banner = document.getElementById("hoa-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "hoa-banner";
      const message = document.createElement("span");
      message.textContent = "AddOrHide: all recommendations hidden";
      banner.appendChild(message);
      const show = actionButton("Show", () => {
        const current = siteRules[location.hostname] || {};
        siteRules = { ...siteRules, [location.hostname]: { ...current, enabled: true, bulkHide: false } };
        try {
          chrome.storage.local.set({ [HOA.SITES_KEY]: siteRules });
        } catch (error) {
          retire(false);
        }
      });
      banner.appendChild(show);
      document.body.appendChild(banner);
    }
    banner.hidden = !rule.bulkHide;
  }

  function removeBanner() {
    const banner = document.getElementById("hoa-banner");
    if (banner) {
      banner.remove();
    }
  }

  function cleanup() {
    clearCarouselCompensation();
    document.querySelectorAll(".hoa-removed, .hoa-filtered, .hoa-empty, .hoa-host").forEach(card => {
      card.classList.remove(ACTIVE_CLASS, FILTER_CLASS, "hoa-empty", "hoa-host", "hoa-show");
      card.querySelectorAll(":scope > .hoa-actions").forEach(node => {
        if (node.hoaPlacementObserver) {
          node.hoaPlacementObserver.disconnect();
        }
        node.remove();
      });
    });
    document.querySelectorAll(".hoa-watched-label").forEach(node => node.remove());
    document.querySelectorAll(`[data-hoa-watched="${ownInstance}"]`).forEach(node => node.removeAttribute("data-hoa-watched"));
    removeBanner();
    const toast = document.getElementById("hoa-toast");
    if (toast) {
      toast.remove();
    }
  }

  function isCarouselRow(row) {
    if (!row || row.nodeType !== 1) return false;
    if (row.classList.contains("swiper-wrapper")) return true;
    const inline = row.style && row.style.transform || "";
    const computed = getComputedStyle(row);
    const transform = computed.transform || inline;
    const display = computed.display || row.style.display || "";
    return /flex/.test(display) && (/translate(?:3d|X)?\(/i.test(inline) || /^matrix(?:3d)?\(/.test(transform));
  }

  function carouselTranslateX(row) {
    const transform = getComputedStyle(row).transform || row.style.transform || "";
    const matrix = /^matrix\(([^)]+)\)/.exec(transform);
    if (matrix) return Number(matrix[1].split(",")[4]) || 0;
    const matrix3d = /^matrix3d\(([^)]+)\)/.exec(transform);
    if (matrix3d) return Number(matrix3d[1].split(",")[12]) || 0;
    const translate = /translate(?:3d|X)?\(\s*(-?[\d.]+)px/i.exec(transform);
    return translate ? Number(translate[1]) || 0 : 0;
  }

  function clippingViewport(row) {
    for (let parent = row.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (/(hidden|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) return parent;
    }
    return null;
  }

  function restoreCarouselRow(row) {
    const observer = carouselObservers.get(row);
    if (observer) observer.disconnect();
    carouselObservers.delete(row);
    if (row && row.dataset.hoaShift !== undefined) {
      row.style.translate = row.dataset.hoaShiftRestore || "";
      delete row.dataset.hoaShift;
      delete row.dataset.hoaShiftRestore;
    }
  }

  // A compensated row observes site-owned transform updates. Temporarily pausing that
  // observer keeps our own translate write from scheduling an endless compensation loop.
  function setCarouselTranslate(row, value) {
    const observer = carouselObservers.get(row);
    if (observer) observer.disconnect();
    row.style.translate = value;
    if (observer && row.isConnected) observer.observe(row, { attributes: true, attributeFilter: ["style"] });
  }

  function clearCarouselCompensation() {
    Array.from(carouselObservers.keys()).forEach(restoreCarouselRow);
    document.querySelectorAll("[data-hoa-shift]").forEach(restoreCarouselRow);
  }

  function scheduleCarouselCompensation(rows) {
    if (carouselFrame) return;
    carouselFrame = window.requestAnimationFrame(() => {
      carouselFrame = 0;
      compensateCarousels(rows);
    });
  }

  function watchCarouselRow(row) {
    if (carouselObservers.has(row)) return;
    const observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.attributeName === "style")) scheduleCarouselCompensation();
    });
    observer.observe(row, { attributes: true, attributeFilter: ["style"] });
    carouselObservers.set(row, observer);
  }

  function compensateCarousel(row) {
    const viewport = clippingViewport(row);
    if (!viewport) {
      restoreCarouselRow(row);
      return;
    }
    const originalTranslate = row.dataset.hoaShiftRestore;
    if (row.dataset.hoaShift !== undefined) setCarouselTranslate(row, originalTranslate || "");
    const children = Array.from(row.children).filter(child => visibleForCollapse(child));
    const first = children[0];
    const last = children[children.length - 1];
    const viewportRect = viewport.getBoundingClientRect();
    const firstRect = first && first.getBoundingClientRect();
    const lastRect = last && last.getBoundingClientRect();
    if (!firstRect || !lastRect || !viewportRect.width || !lastRect.width) {
      restoreCarouselRow(row);
      return;
    }
    const allowance = firstRect.left >= viewportRect.left ? firstRect.left - viewportRect.left : 80;
    const gap = viewportRect.right - allowance - lastRect.right;
    const maxShift = Math.max(0, -carouselTranslateX(row));
    const shift = Math.min(Math.max(0, gap), maxShift);
    if (shift > 0.5) {
      if (row.dataset.hoaShift === undefined) row.dataset.hoaShiftRestore = row.style.translate || "";
      setCarouselTranslate(row, `${Math.ceil(shift)}px`);
      row.dataset.hoaShift = String(Math.ceil(shift));
      watchCarouselRow(row);
    } else {
      restoreCarouselRow(row);
    }
  }

  function compensateCarousels(rows = null) {
    const candidates = new Set(rows || []);
    document.querySelectorAll(`.${ACTIVE_CLASS}, .${FILTER_CLASS}, .hoa-empty`).forEach(target => {
      for (let parent = target.parentElement, level = 0; parent && level < 8; parent = parent.parentElement, level += 1) {
        if (isCarouselRow(parent)) candidates.add(parent);
      }
    });
    document.querySelectorAll("[data-hoa-shift]").forEach(row => candidates.add(row));
    candidates.forEach(row => {
      if (!row.isConnected || !isCarouselRow(row)) restoreCarouselRow(row);
      else compensateCarousel(row);
    });
  }

  function variantsForRule(rule) {
    return [rule, ...(rule.variants || []).filter(variant => {
      try {
        return !variant.pathPattern || new RegExp(variant.pathPattern).test(location.pathname);
      } catch (error) {
        return false;
      }
    }).map(variant => ({
      ...rule,
      ...variant,
      meta: { ...(rule.meta || {}), ...(variant.meta || {}) }
    }))];
  }

  function migrateFormerKey(data) {
    if (!data || !data.formerKey || data.formerKey === data.key || migratedFormerKeys.has(data.formerKey)) return;
    migratedFormerKeys.add(data.formerKey);
    // Copy first so this pass immediately sees the saved state under the player URL,
    // then omit the old key without waiting for storage's asynchronous change event.
    const move = (items, name) => {
      if (!items[data.formerKey] || items[data.key]) return items;
      const next = { ...items, [data.key]: items[data.formerKey] };
      delete next[data.formerKey];
      pendingKeyMigrations[name] = true;
      return next;
    };
    hidden = move(hidden, "hidden");
    added = move(added, "added");
    watchedShown = move(watchedShown, "watchedShown");
    if (!keyMigrationTimer && (pendingKeyMigrations.hidden || pendingKeyMigrations.added || pendingKeyMigrations.watchedShown)) {
      keyMigrationTimer = window.setTimeout(() => {
        keyMigrationTimer = 0;
        const changes = { ...pendingKeyMigrations };
        pendingKeyMigrations.hidden = false; pendingKeyMigrations.added = false; pendingKeyMigrations.watchedShown = false;
        HOA.writeLists({ ...(changes.hidden ? { hidden } : {}), ...(changes.added ? { added } : {}), ...(changes.watchedShown ? { watchedShown } : {}) });
      }, 0);
    }
  }

  function processCard(card, variant, state) {
    const { categories, filtered, handled, cards } = state;
    if (cards) cards.add(card);
    let parent = card.parentElement;
    while (parent && parent !== document.body) {
      if (handled.has(parent)) return;
      parent = parent.parentElement;
    }
    // User-taught selectors may also match a playing short.  Do the cheap video
    // presence check first: most cards have no video, so they incur no layout read.
    if (variant.pickedCards && (card.matches("video") || card.querySelector("video"))
      && HOA.isPlayerSurface(card, location.href)) {
      removeActions(card);
      handled.add(card);
      return;
    }
    // Two taught selectors can match nested parts of one video: the outer card gets the single button bar.
    if (variant.pickedCards && card.parentElement && card.parentElement.closest(variant.pickedCards)) {
      removeActions(card);
      handled.add(card);
      return;
    }
    if (handled.has(card) || isAd(card, variant)) {
      if (isAd(card, variant)) removeActions(card);
      return;
    }
    const target = removalTarget(card, variant);
    // A Xumo Featured promo may point at a row (#id), not a video.  It follows that row's visibility and has
    // no hover controls or stored-item identity of its own.
    const promoLink = variant.id === "xumo" && card.matches(".promoCard") && getLink(card, variant);
    const promoHash = promoLink && (promoLink.getAttribute("href") || "").match(/#([^/?#]+)$/);
    if (promoHash) {
      removeActions(card);
      const row = document.getElementById(promoHash[1]);
      if (variant.featuredCarousels !== false && row && (filtered.has(row) || (state.applyAdded && row.classList.contains(FILTER_CLASS)))) filtered.add(target);
      handled.add(card);
      return;
    }
    const data = cardData(card, variant);
    if (!data) {
      // No link yet (Tubi renders a feature card's links only once it has been in view): no buttons and no
      // stored hiding, but types and keywords still apply, from the title and text the card already shows.
      removeActions(card);
      target.classList.remove(ACTIVE_CLASS);
      let title = "";
      for (const selector of variant.titleCandidates || []) {
        try { title = candidateText(card.querySelector(selector), selector); } catch (error) { title = ""; }
        if (title) break;
      }
      const image = title ? null : card.querySelector("img[alt]");
      title = title || (image ? (image.getAttribute("alt") || "").trim() : "");
      if (shouldFilterCard(card, variant, { key: "", title }, categories)) {
        filtered.add(target);
        card.dataset.hoaWhy = "filter";
      } else {
        delete card.dataset.hoaWhy;
      }
      handled.add(card);
      return;
    }
    migrateFormerKey(data);
    healSaved(card, variant, data);
    if (Object.keys(channels).length) healChannelName(channelIdentity(card, variant));
    const isWatched = watchedCard(card, variant, data);
    const cardCategories = isWatched && watchedShown[data.key]
      ? { ...categories, selected: categories.selected.filter(category => category.id !== "watched") } : categories;
    if (hiddenChannel(card, variant)) {
      removeActions(card);
      ensureWatchedLabel(card, variant, false);
      target.classList.remove(ACTIVE_CLASS);
      filtered.add(target);
      card.dataset.hoaWhy = "channel";
    } else if (hidden[data.key]) {
      removeActions(card);
      ensureWatchedLabel(card, variant, false);
      target.classList.add(ACTIVE_CLASS);
      target.classList.remove(FILTER_CLASS);
      delete card.dataset.hoaWhy;
    } else if (isWatched && watchedEnabled(categories) && !watchedShown[data.key]) {
      queueWatched({ ...data, ...cardMeta(card, variant, data.key) });
      removeActions(card);
      ensureWatchedLabel(card, variant, false);
      target.classList.add(ACTIVE_CLASS);
      target.classList.remove(FILTER_CLASS);
      delete card.dataset.hoaWhy;
    } else {
      const link = getLink(card, variant);
      const decisionSignature = `${data.key}|${link ? (link.getAttribute("href") || link.href || "") : ""}|${filterVersion}`
        + `|${card.getElementsByTagName("*").length}|${(card.textContent || "").length}`;
      const cached = decisionCache.get(card);
      const shouldFilter = cached && cached.signature === decisionSignature ? cached.outcome
        : shouldFilterCard(card, variant, data, cardCategories);
      if (!cached || cached.signature !== decisionSignature) decisionCache.set(card, { signature: decisionSignature, outcome: shouldFilter });
      if (shouldFilter) {
        removeActions(card);
        ensureWatchedLabel(card, variant, false);
        target.classList.remove(ACTIVE_CLASS);
        filtered.add(target);
        card.dataset.hoaWhy = "filter";
      } else {
        if (target.classList.contains(ACTIVE_CLASS) || target.classList.contains(FILTER_CLASS)) { target.classList.remove(ACTIVE_CLASS, FILTER_CLASS); restoredInPass = true; }
        if (card.dataset.hoaWhy !== undefined) delete card.dataset.hoaWhy;
        ensureWatchedLabel(card, variant, isWatched, data);
        ensureContinueProgress(card, variant, data);
        ensureActions(card, data, variant);
      }
    }
    handled.add(card);
  }

  function usableImage(node) {
    const rect = node.getBoundingClientRect();
    const hasLayout = Boolean(rect.width || rect.height);
    const largeEnough = !hasLayout || rect.width > 40 || rect.height > 40;
    if (node.matches("img")) return largeEnough;
    const background = node.style && node.style.backgroundImage;
    return Boolean(largeEnough && background && background !== "none" && /url\(/i.test(background));
  }

  function visibleForCollapse(node) {
    for (let parent = node; parent; parent = parent.parentElement) {
      if (parent.hidden || parent.classList.contains(ACTIVE_CLASS) || parent.classList.contains(FILTER_CLASS)) return false;
    }
    return true;
  }

  const EMPTY_SECTION_EXCLUDED = "html, body, main, [role=main], #root, #__next, #app, ytd-app, ytd-page-manager, ytd-browse, ytd-rich-grid-renderer, ytd-two-column-browse-results-renderer";

  function outermostSingleChildWrapper(node) {
    let outer = node;
    for (let parent = node && node.parentElement; parent && !parent.matches(EMPTY_SECTION_EXCLUDED); parent = parent.parentElement) {
      if (parent.children.length !== 1) break;
      outer = parent;
    }
    return outer;
  }

  function hasVisibleSiblingContent(parent, section, selector) {
    return Array.from(parent.children).some(child => {
      if (child === section || child.hidden || child.classList.contains(ACTIVE_CLASS) || child.classList.contains(FILTER_CLASS)
        || Array.from(child.classList).some(name => name.startsWith("hoa-"))) return false;
      const rect = child.getBoundingClientRect();
      if (!rect.width && !rect.height) return false;
      try {
        if (child.matches(selector) || child.querySelector(selector) || child.querySelector("img")) return true;
      } catch (error) { /* stale optional selector */ }
      return true;
    });
  }

  function collapseEmptySections(rule, variants, filtered, matchedCards = null) {
    document.querySelectorAll(".hoa-empty").forEach(node => node.classList.remove("hoa-empty"));
    const selector = variants.map(variant => variant.cardSelector).filter(Boolean).join(", ");
    if (!selector) return;
    const candidates = new Set();
    filtered.forEach(target => {
      let parent = target;
      for (let level = 0; level < 6 && parent; level += 1) {
        parent = parent.parentElement;
        if (!parent || parent.matches(EMPTY_SECTION_EXCLUDED)) break;
        const rect = parent.getBoundingClientRect();
        if (rect.height && window.innerHeight && rect.height > window.innerHeight * 1.5) break;
        candidates.add(parent);
      }
    });
    const occupied = new Set();
    const markAncestors = node => {
      for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (candidates.has(parent)) occupied.add(parent);
      }
    };
    (matchedCards || document.querySelectorAll(selector)).forEach(card => {
      if (visibleForCollapse(card)) markAncestors(card);
    });
    document.querySelectorAll("img, [style*='background']").forEach(node => {
      if (usableImage(node) && visibleForCollapse(node)) markAncestors(node);
    });
    const empty = new Set(Array.from(candidates).filter(section => !occupied.has(section)));
    Array.from(empty).filter(section => !Array.from(empty).some(other => other !== section && other.contains(section)))
      .forEach(section => {
        let outer = section;
        for (let parent = outer.parentElement; parent && !parent.matches(EMPTY_SECTION_EXCLUDED); parent = parent.parentElement) {
          const rect = parent.getBoundingClientRect();
          if (rect.height && window.innerHeight && rect.height > window.innerHeight * 1.5) break;
          if (hasVisibleSiblingContent(parent, outer, selector)) break;
          outer = parent;
        }
        outer.classList.add("hoa-empty");
      });
  }

  function apply() {
    if (childFrame) return;
    if (!ensureContext()) {
      return;
    }
    scheduled = 0;
    if (!listsReady || !siteRulesReady) return;
    syncPlayerWatchedTag();
    if (!document.body) {
      if (!waitingForBody) {
        waitingForBody = true;
        document.addEventListener("DOMContentLoaded", () => { waitingForBody = false; scheduleApply(); }, { once: true });
      }
      return;
    }
    passCardText = new WeakMap();
    passFilterText = new WeakMap();
    passFeaturedCarousel = new WeakMap();
    const rule = hostnameRule();
    observeRuleRoot(rule);
    if (!rule) {
      cleanup();
      lastRule = null;
      return;
    }
    if (lastRule && lastRule.cardSelector !== rule.cardSelector) {
      cleanup();
    }
    lastRule = rule;
    const nextSignature = JSON.stringify([rule.hideKinds, rule.hideKeywords, rule.hideSections, rule.featuredCarousels, Object.keys(hidden), Object.keys(channels), Object.keys(watchedShown)]);
    if (nextSignature !== filterSignature) {
      filterSignature = nextSignature;
      filterVersion += 1;
    }
    const variants = variantsForRule(rule);
    const handled = new Set();
    if (rule.bulkHide && (!rule.bulkHidePattern || new RegExp(rule.bulkHidePattern).test(location.pathname))) {
      document.querySelectorAll(`.${FILTER_CLASS}`).forEach(node => node.classList.remove(FILTER_CLASS));
      // Whole-feed mode also takes cards that never get buttons (YouTube playlists, podcasts, courses).
      const bulkCards = variants.map(variant => [variant.cardSelector, variant]);
      if (rule.bulkExtraSelector) {
        bulkCards.push([rule.bulkExtraSelector, rule]);
      }
      bulkCards.forEach(([selector, variant]) => Array.from(document.querySelectorAll(selector)).forEach(card => {
        if (!isAd(card, rule)) {
          removeActions(card);
          removalTarget(card, variant).classList.add(ACTIVE_CLASS);
        }
      }));
      showBulkBanner(rule);
      bulkApplied = true;
      return;
    }
    if (bulkApplied) {
      // Leaving whole-feed mode: un-hide everything it hid; videos the user hid one by one are hidden again below.
      document.querySelectorAll(`.${ACTIVE_CLASS}`).forEach(node => node.classList.remove(ACTIVE_CLASS));
      bulkApplied = false;
    }
    removeBanner();
    // Collect first, then only change nodes whose filtered state actually changed. This avoids churn while
    // YouTube is streaming mutations through its feed.
    const filtered = new Set();
    const categories = activeCategories(rule);
    const cards = new Set();
    const cardState = { categories, filtered, handled, cards };
    filterContainers(rule, categories, filtered);
    variants.forEach(variant => Array.from(document.querySelectorAll(variant.cardSelector))
      .forEach(card => processCard(card, variant, cardState)));
    // Collection cards outside the normal video variants (notably playlist lockups) still expose a channel name.
    // They have no per-video hidden key, but a hidden channel should remove them just like videos and Shorts.
    if (rule.id === "youtube" && Object.keys(channels).length) {
      document.querySelectorAll("yt-lockup-view-model, ytd-playlist-renderer, ytd-grid-playlist-renderer, ytd-compact-playlist-renderer")
        .forEach(card => {
          if (!isAd(card, rule) && hiddenChannel(card, rule)) { filtered.add(removalTarget(card, rule)); card.dataset.hoaWhy = "channel"; }
        });
    }
    // Some YouTube collection cards are deliberately outside button variants. They still participate in filtering.
    if (rule.bulkExtraSelector && (categories.selected.length || rule.hideKeywords.length)) {
      try {
        // Only the collection cards themselves (playlists, mixes, podcasts); shelves are handled by containers/shelfTitle.
        document.querySelectorAll(rule.bulkExtraSelector).forEach(card => {
          if (card.matches("yt-lockup-view-model") && !isAd(card, rule) && shouldFilterCard(card, rule, cardData(card, rule), categories)) {
            filtered.add(removalTarget(card, rule));
          }
        });
      } catch (error) {
        // A stale optional selector should not affect the normal feed.
      }
    }
    document.querySelectorAll(`.${FILTER_CLASS}`).forEach(node => { if (!filtered.has(node)) { node.classList.remove(FILTER_CLASS); restoredInPass = true; } });
    filtered.forEach(node => node.classList.add(FILTER_CLASS));
    collapseEmptySections(rule, variants, filtered, cards);
    compensateCarousels();
    afterRestore();
  }

  function scheduleApply() {
    watchedCardVersion += 1;
    if (scheduled) return;
    scheduled = window.requestAnimationFrame(() => { lastApplyAt = Date.now(); apply(); });
  }

  function applyAdded(nodes) {
    if (!listsReady || !siteRulesReady || !document.body || !ensureContext()) return;
    const rule = hostnameRule();
    if (!rule || (rule.bulkHide && (!rule.bulkHidePattern || new RegExp(rule.bulkHidePattern).test(location.pathname)))) {
      scheduleApply();
      return;
    }
    const variants = variantsForRule(rule);
    passFeaturedCarousel = new WeakMap();
    passCardText = new WeakMap();
    passFilterText = new WeakMap();
    const categories = activeCategories(rule);
    const filtered = new Set();
    const handled = new Set();
    const cardState = { categories, filtered, handled, applyAdded: true };
    filterContainers(rule, categories, filtered);
    const matches = new Map();
    const addMatches = (node, variant) => {
      if (!node || node.nodeType !== 1) return;
      try {
        if (node.matches(variant.cardSelector)) matches.set(node, variant);
        node.querySelectorAll(variant.cardSelector).forEach(card => matches.set(card, variant));
        const parent = node.closest(variant.cardSelector);
        if (parent) matches.set(parent, variant);
      } catch (error) {
        // A stale optional selector is handled by the next full pass.
      }
    };
    nodes.forEach(node => {
      const element = node.nodeType === 1 ? node : node.parentElement;
      variants.forEach(variant => addMatches(element, variant));
    });
    matches.forEach((variant, card) => processCard(card, variant, cardState));
    filtered.forEach(node => node.classList.add(FILTER_CLASS));
    const allFiltered = new Set([...document.querySelectorAll(`.${FILTER_CLASS}`), ...filtered]);
    collapseEmptySections(rule, variants, allFiltered);
    compensateCarousels();
  }

  function pageTitle() {
    const youtube = HOA.siteOf(location.href) === "youtube.com";
    const heading = youtube && document.querySelector("ytd-watch-metadata h1, #title h1");
    const raw = (heading && heading.textContent) || document.title || "";
    return HOA.cleanTitle(raw.replace(youtube ? /\s+-\s+YouTube$/i : /\s+[|–—-]\s+[^|–—-]+$/, "")).slice(0, HOA.MAX_TITLE);
  }

  function pageMetaForKey(key) {
    const youtube = HOA.siteOf(key) === "youtube.com";
    const canonical = document.querySelector('meta[property="og:url"], link[rel="canonical"]');
    const canonicalKey = canonical && HOA.canonicalUrl(canonical.content || canonical.href, location.href);
    const matches = canonicalKey === key;
    const title = youtube ? pageTitle() : (matches ? HOA.cleanTitle(((document.querySelector('meta[property="og:title"]') || {}).content || pageTitle())).slice(0, HOA.MAX_TITLE) : pageTitle());
    const thumbnail = youtube ? HOA.youtubeThumb(key) : (matches ? ((document.querySelector('meta[property="og:image"]') || {}).content || "") : "");
    return { title, thumbnail };
  }

  // YouTube plays its ads in the same video element, so an ad would otherwise count as watching the video.
  function adPlaying(video) {
    const player = video && video.closest ? video.closest(".html5-video-player") : null;
    return Boolean(player && player.classList.contains("ad-showing"));
  }

  function resumableUntil(duration) { return duration - Math.min(30, duration * .25); }

  function setBit(bitmap, index) {
    const digits = HOA.bitmapBuckets(bitmap).split(""); const at = Math.floor(index / 4); const mask = 1 << (3 - index % 4);
    digits[at] = (Number.parseInt(digits[at], 16) | mask).toString(16); return digits.join("");
  }

  function progressEntry(key, values) {
    if (!key || !Number.isFinite(values.duration) || values.duration < 20) return null;
    const saved = watchProgress[key] || {}; const duration = values.duration;
    // Saved to Watch Later after being watched: this is a new watch, so the old one doesn't count towards it.
    const old = saved.watched && watchLater[key] ? { ...saved, buckets: HOA.bitmapBuckets(""), covered: 0, watched: false } : saved;
    const merged = HOA.mergeProgressEntry(old, { buckets: values.buckets, covered: values.covered });
    const watched = HOA.bucketCount(merged.buckets) >= 90;
    const played = Math.max(0, Number(values.played) || 0);
    // Treat an in-memory legacy "manual" value as auto too: a stale content
    // script may receive it before storage-change normalization arrives.
    const automatic = watchSettings.continueWatching !== "off" && played >= Math.min(60, duration < 240 ? duration * .25 : 60);
    const meta = pageMetaForKey(key);
    const generic = value => !value || value.toLocaleLowerCase() === HOA.siteOf(key).toLocaleLowerCase() || value.toLocaleLowerCase() === HOA.siteDisplayName(HOA.siteOf(key)).toLocaleLowerCase();
    const entry = { ...merged, site: HOA.siteOf(key), title: generic(old.title) ? (meta.title || HOA.siteOf(key)) : old.title, url: key,
      thumbnail: old.thumbnail || meta.thumbnail, duration,
      position: Math.min(Math.max(0, Number(values.position) || 0), duration), watched, played,
      ...(watched ? {} : old.cw === "later" ? { cw: "later" } : automatic && watchSettings.continueWatching !== "off" ? { cw: old.cw || "auto" } : {}), ts: old.ts || Date.now(), updated: Date.now() };
    if (watched) { delete entry.cw; delete entry.untagged; }
    // Taken off the Watched list by hand: playing it again doesn't undo that. Turning Watched off and on does.
    delete entry.unlisted;
    if (old.unlisted && watched) entry.unlisted = true;
    return entry;
  }

  function trackerEntry(tracker) {
    return tracker && progressEntry(tracker.key, { duration: tracker.video.duration, position: tracker.video.currentTime,
      buckets: tracker.bits, covered: tracker.covered, played: tracker.basePlayed + tracker.covered });
  }

  function frameEntry(progress) {
    if (!progress || !Number.isFinite(progress.duration) || progress.duration < 20) return null;
    const key = watchKey(hostnameRule());
    if (!key || !shouldRecordWatchProgress(hostnameRule(), key)) return null;
    const old = watchProgress[key] || {};
    if (!frameProgressState || frameProgressState.key !== key || Math.abs(frameProgressState.duration - progress.duration) > progress.duration * .05) {
      frameProgressState = { key, duration: progress.duration, basePlayed: Number(old.played) || 0 };
    }
    return progressEntry(key, { duration: progress.duration, position: progress.position, buckets: progress.bits,
      covered: progress.covered, played: frameProgressState.basePlayed + Math.max(0, Number(progress.covered) || 0) });
  }

  function saveTracker(force = false) {
    const tracker = playerTracker; if (!tracker || !tracker.video || !Number.isFinite(tracker.video.duration) || adPlaying(tracker.video)) return;
    const rule = hostnameRule();
    if (!shouldRecordWatchProgress(rule, tracker.key)) return;
    // A user-picked video graduates to Continue Watching as soon as it is genuinely resumable.
    // Do not make that transition wait behind the regular ten-second storage throttle. Frame players
    // send the same eligible sample immediately; the top page owns the chosen-list decision.
    const position = Math.max(0, Number(tracker.video.currentTime) || 0);
    const pendingLater = !childFrame && tracker.key && watchLater[tracker.key];
    const eligibleLater = tracker.covered >= 3 && position >= HOA.MIN_RESUME_SECONDS && position < resumableUntil(tracker.video.duration)
      && (childFrame || pendingLater);
    // Before that point there is nothing useful to persist for a chosen item: it remains on Watch Later.
    // Holding these short samples also prevents an older queued progress write from racing the atomic move.
    if (!force && pendingLater && !eligibleLater) return;
    if (!force && !eligibleLater && Date.now() - lastProgressWrite < 10000) return;
    lastProgressWrite = Date.now();
    if (childFrame) {
      const progress = { duration: tracker.video.duration, position: Math.min(tracker.video.currentTime || 0, tracker.video.duration), bits: tracker.bits, covered: tracker.covered, playing: !tracker.video.paused };
      chrome.runtime.sendMessage({ type: "hoa-frame-progress", progress }, response => {
        if (response && Number.isFinite(response.seekTo) && !tracker.resumed && Math.abs(tracker.video.duration - progress.duration) <= progress.duration * .05) {
          tracker.resumed = true; tracker.video.currentTime = response.seekTo;
        }
      });
      return;
    }
    const entry = trackerEntry(tracker); if (!entry) return;
    if (entry.watched) delete entry.cw;
    saveProgressEntry(entry, tracker.covered);
    if (entry.watched && watchedEnabled(activeCategories(rule))) queueWatched({ key: entry.url, title: entry.title, thumb: entry.thumbnail, site: entry.site, kind: HOA.kindOf(entry.url), ts: Date.now() });
  }

  function saveProgressEntry(entry, covered = 0) {
    if (!entry) return;
    const nextLater = { ...watchLater };
    const chosen = nextLater[entry.url];
    let moved = entry.watched && !(watchProgress[entry.url] && watchProgress[entry.url].watched);
    if (entry.watched && chosen) delete nextLater[entry.url];
    let clearedAuto = false;
    // Never in both lists: anything else that made it a Continue Watching video moves it too.
    if (chosen && !entry.watched
      && (entry.cw || (entry.position >= HOA.MIN_RESUME_SECONDS && entry.position < resumableUntil(entry.duration) && covered >= 3))) {
      delete nextLater[entry.url];
      entry = { ...entry, cw: "later" };
      moved = true;
      // Being watched again: it isn't in Watched while it is in Continue Watching.
      if (hidden[entry.url] && hidden[entry.url].reason === "watched") {
        hidden = { ...hidden };
        delete hidden[entry.url];
        clearedAuto = true;
      }
    }
    watchProgress = { ...watchProgress, [entry.url]: entry };
    watchLater = nextLater;
    if (chosen && !nextLater[entry.url]) HOA.writeLists({ watchProgress, watchLater, ...(clearedAuto ? { hidden } : {}) });
    else HOA.writeProgress(entry.url, entry);
    updateWatchLaterButton();
    // Show the new label for a moment even if the pointer is elsewhere: this is the user's sign that it moved.
    if (moved) revealWatchLaterButton();
    syncPlayerWatchedTag();
    scheduleApply();
  }

  function maybeResume(tracker) {
    if (isIncognitoContext() && !chosenVideo(tracker.key)) return;
    const entry = tracker.key && watchProgress[tracker.key];
    if (!entry || !entry.cw || (watchSettings.continueWatching === "off" && entry.cw !== "later") || entry.position < HOA.MIN_RESUME_SECONDS || entry.position >= resumableUntil(entry.duration) || tracker.resumed || Math.abs(entry.duration - tracker.video.duration) > entry.duration * .05 || tracker.video.currentTime >= HOA.MIN_RESUME_SECONDS) return;
    tracker.resumed = true; tracker.video.currentTime = Math.max(0, entry.position - 5);
    showToast(tracker.key, `Resumed at ${HOA.formatDuration(Math.floor(entry.position))}`, () => { tracker.video.currentTime = 0; }, "Start over");
  }

  function resetTracker(tracker, key) {
    const existing = key && watchProgress[key];
    tracker.key = key; tracker.last = tracker.video.currentTime || 0; tracker.bits = existing && existing.buckets || HOA.bitmapBuckets("");
    if (existing && existing.watched && watchLater[key]) tracker.bits = HOA.bitmapBuckets("");
    tracker.basePlayed = Number(existing && existing.played) || 0; tracker.covered = 0; tracker.bucketSeconds = Array(100).fill(0); tracker.resumed = false;
  }

  function syncTrackerKey(tracker) {
    if (!tracker || !tracker.video) return;
    if (childFrame) return;
    const key = watchKey(hostnameRule());
    if (key && key !== tracker.key) { saveTracker(true); resetTracker(tracker, key); }
  }

  // A live stream has no length and no point to resume from, so it gets no tracker. A channel the user saved
  // still moves to Continue Watching once they have really watched it, as a video does at the resume point.
  function watchLiveVideo(video) {
    if (childFrame || liveVideos.has(video)) return;
    liveVideos.add(video);
    let seen = 0; let last = 0; let seenKey = "";
    video.addEventListener("timeupdate", () => {
      if (Number.isFinite(video.duration)) return;
      const now = video.currentTime || 0; const delta = now - last; last = now;
      const rule = hostnameRule(); const key = rule ? watchKey(rule) : null; const saved = key && watchLater[key];
      if (key !== seenKey) { seenKey = key; seen = 0; return; }
      if (!saved || video.paused || delta <= 0 || delta > 2.5) return;
      seen += delta;
      if (seen < HOA.MIN_RESUME_SECONDS) return;
      const meta = pageMetaForKey(key); const stamp = Date.now();
      const nextLater = { ...watchLater }; delete nextLater[key];
      watchLater = nextLater;
      watchProgress = { ...watchProgress, [key]: { site: HOA.siteOf(key), title: saved.title || meta.title || HOA.siteOf(key), url: key, thumbnail: saved.thumb || meta.thumbnail || "",
        duration: 0, position: 0, played: seen, buckets: HOA.bitmapBuckets(""), watched: false, cw: "later", live: true, ts: stamp, updated: stamp } };
      HOA.writeLists({ watchProgress, watchLater });
      revealWatchLaterButton();
    });
  }

  function attachTracker(video) {
    // Frames can't tell which video the page is on, so private windows don't measure inside them.
    if (isIncognitoContext() && childFrame) return;
    if (!video || !Number.isFinite(video.duration) || video.duration < 20 || playerTracker && playerTracker.video === video) return;
    playerTracker = { video, key: childFrame ? "" : watchKey(hostnameRule()), last: video.currentTime || 0, bits: HOA.bitmapBuckets(""), basePlayed: 0, covered: 0, bucketSeconds: Array(100).fill(0), resumed: false };
    resetTracker(playerTracker, playerTracker.key);
    const update = () => { const tracker = playerTracker; if (!tracker || tracker.video !== video) return; syncTrackerKey(tracker); const now = video.currentTime || 0; if (adPlaying(video)) { tracker.last = now; return; } if (!shouldRecordWatchProgress(undefined, tracker.key)) { tracker.last = now; return; } if (video.paused || video.playbackRate > 2) return; const delta = now - tracker.last; tracker.last = now; if (delta <= 0 || delta > 2.5) return; const slice = video.duration / 100; const from = now - delta; tracker.covered += delta; for (let index = Math.min(99, Math.floor(from / slice)); index <= Math.min(99, Math.floor(now / slice)); index += 1) { const overlap = Math.min(now, (index + 1) * slice) - Math.max(from, index * slice); if (overlap <= 0) continue; tracker.bucketSeconds[index] += overlap; if (tracker.bucketSeconds[index] >= slice * .7) tracker.bits = setBit(tracker.bits, index); } saveTracker(false); };
    video.addEventListener("timeupdate", update); video.addEventListener("loadedmetadata", () => syncTrackerKey(playerTracker)); video.addEventListener("pause", () => saveTracker(true)); video.addEventListener("ended", () => saveTracker(true));
    video.addEventListener("play", () => { playerTracker.last = video.currentTime || 0; maybeResume(playerTracker); });
  }

  function trackableVideo(video, rule) {
    if (childFrame) return true;
    const key = watchKey(rule);
    if (!key) return false;
    // Preview players are embedded inside feed cards. Ignore them even if they
    // happen to be larger than neighbouring cards during an animation.
    try {
      if ((rule.cardSelector && video.closest(rule.cardSelector))
        || video.closest("ytd-video-preview, #inline-preview-player, ytd-miniplayer, .ytp-miniplayer-ui")) return false;
    } catch (error) { /* a stale user selector must not stop tracking */ }
    // Generic rules have no catalogue-level watch-path information. Avoid the
    // common collection/search paths while still allowing normal detail URLs.
    if (!rule || !rule.watchPath) {
      const path = location.pathname.toLocaleLowerCase();
      if (/\/(?:browse|search|results|feed|library|channels?|categories|collections?|discover|explore|videos?)\/?$/.test(path)) return false;
    }
    const box = video.getBoundingClientRect();
    return !box.width || box.width >= 480 || box.width >= window.innerWidth * .45;
  }

  function watchLaterKey() {
    return !childFrame && watchLaterPlayer && (watchLaterPlayer.tagName !== "VIDEO" || trackableVideo(watchLaterPlayer, hostnameRule())) ? watchKey(hostnameRule()) : null;
  }

  function removeOwnWatchLater() {
    if (watchLaterHideTimer) { clearTimeout(watchLaterHideTimer); watchLaterHideTimer = 0; }
    if (watchLaterMoveFrame) { cancelAnimationFrame(watchLaterMoveFrame); watchLaterMoveFrame = 0; }
    if (watchLaterPointerListening) {
      document.removeEventListener("mousemove", watchLaterPointer);
      watchLaterPointerListening = false;
    }
    watchLaterFrames.forEach(frame => {
      frame.removeEventListener("mouseenter", watchLaterFrameEnter);
      frame.removeEventListener("mouseleave", watchLaterFrameLeave);
    });
    watchLaterFrames.clear();
    if (watchLaterButton) watchLaterButton.remove();
    watchLaterButton = null;
    watchLaterPlayer = null;
  }

  function hideWatchLaterButton() {
    if (watchLaterHideTimer) { clearTimeout(watchLaterHideTimer); watchLaterHideTimer = 0; }
    if (watchLaterButton) { watchLaterButton.classList.remove("hoa-watch-later-show"); watchLaterButton.hidden = true; }
  }

  function scheduleWatchLaterHide() {
    if (watchLaterHideTimer) clearTimeout(watchLaterHideTimer);
    watchLaterHideTimer = setTimeout(() => { watchLaterHideTimer = 0; if (watchLaterButton && watchLaterButton.matches(":hover")) scheduleWatchLaterHide(); else hideWatchLaterButton(); }, 2500);
  }

  function updateWatchLaterButton() {
    if (!watchLaterButton) return;
    const key = watchLaterKey();
    const progress = key && watchProgress[key];
    const inContinue = progress && progress.cw && !progress.watched;
    const selected = key && watchLater[key];
    const rule = hostnameRule();
    // Watched ticked for this site: the video now belongs to the Watched list, so the button says so.
    // Not ticked: the tag on the player says it (syncPlayerWatchedTag) and the video can still be saved.
    const inWatched = !selected && key && rule && watchedEnabled(activeCategories(rule)) && HOA.inWatchedList(key, hidden, watchProgress, watchedShown, siteRules);
    watchLaterButton.hidden = !key || !buttonsEnabled;
    watchLaterButton.textContent = inWatched ? "✓ In Watched" : inContinue ? "✓ In Continue Watching" : selected ? "✓ In Watch Later" : "Add to Watch Later";
    watchLaterButton.setAttribute("aria-pressed", String(Boolean(selected)));
    // Once it is in Continue Watching or Watched the button is a status, not an action.
    watchLaterButton.setAttribute("aria-disabled", String(Boolean(inContinue || inWatched)));
  }

  // The Watched tag on the video's own page. An attribute on the player's box, drawn by CSS, so it moves with the
  // player, works in fullscreen and survives the player's re-rendering, like the tag on thumbnails.
  function syncPlayerWatchedTag() {
    if (childFrame || (!hasWatchProgress && !playerTagHost)) return;
    const rule = hostnameRule();
    const key = rule ? watchKey(rule) : null;
    const entry = key && watchProgress[key];
    let host = null;
    if (entry && entry.watched && !entry.untagged && watchSettings.tagWatched && !watchedEnabled(activeCategories(rule))) {
      const player = findWatchLaterPlayer(rule);
      host = player && (player.tagName === "VIDEO" || player.tagName === "IFRAME" ? player.parentElement : player);
    }
    if (playerTagHost && playerTagHost !== host) playerTagHost.removeAttribute("data-hoa-player-watched");
    playerTagHost = host;
    if (host && !host.hasAttribute("data-hoa-player-watched")) {
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.setAttribute("data-hoa-player-watched", "");
    }
  }

  function positionWatchLaterButton() {
    if (!ensureContext()) return;
    if (!watchLaterButton || !watchLaterPlayer) return;
    const box = watchLaterPlayer.getBoundingClientRect();
    if (!box.width || !box.height) return hideWatchLaterButton();
    const full = document.fullscreenElement;
    const parent = full && full.tagName !== "VIDEO" ? full : document.body;
    if (!ensureContext()) return;
    if (watchLaterButton.parentElement !== parent) parent.appendChild(watchLaterButton);
    // Bottom sits above the player's own control bar.
    const top = buttonEdge === "bottom" ? box.bottom - 84 : box.top + 12;
    watchLaterButton.style.left = `${box.left + box.width / 2}px`;
    watchLaterButton.style.top = `${Math.max(8, Math.min(top, window.innerHeight - 48))}px`;
  }

  function revealWatchLaterButton() {
    if (!ensureContext()) return;
    if (!buttonsEnabled) return;
    ensureWatchLaterButton();
    if (!watchLaterButton) return;
    positionWatchLaterButton(); updateWatchLaterButton();
    if (!watchLaterButton.hidden) { watchLaterButton.classList.add("hoa-watch-later-show"); scheduleWatchLaterHide(); }
  }

  // The player box, looked for on every hover so a player that had no size or no media yet still gets the button:
  // nothing has to be playing, or even loaded.
  function findWatchLaterPlayer(rule) {
    if (childFrame || !rule || !watchKey(rule)) return null;
    const sized = node => { const box = node.getBoundingClientRect(); return box.width >= 240 && box.height >= 135; };
    const largest = nodes => nodes.sort((a, b) => { const left = a.getBoundingClientRect(); const right = b.getBoundingClientRect(); return right.width * right.height - left.width * left.height; })[0] || null;
    // The player box first: before playback starts YouTube parks its <video> above the visible player.
    let box = null;
    try { box = rule.playerSelector && document.querySelector(rule.playerSelector); } catch (error) { box = null; }
    if (box && sized(box)) return box;
    const video = largest(Array.from(document.querySelectorAll("video")).filter(node => sized(node) && trackableVideo(node, rule)));
    if (video) return video;
    // Only the site's own player hosts count: any other large iframe is an ad or an embed, not this page's video.
    const playerHosts = rule.playerHosts || [];
    const frameHost = frame => { try { return new URL(frame.src).hostname; } catch (error) { return ""; } };
    return largest(Array.from(document.querySelectorAll("iframe")).filter(frame => { const size = frame.getBoundingClientRect(); return playerHosts.includes(frameHost(frame)) && size.width >= 480 && size.height >= 270; }));
  }

  function watchLaterPointer(event) {
    if (!ensureContext()) return;
    if (watchLaterMoveFrame) return;
    const { clientX: x, clientY: y } = event;
    watchLaterMoveFrame = requestAnimationFrame(() => {
      watchLaterMoveFrame = 0;
      if (!ensureContext()) return;
      if (!buttonsEnabled) return;
      const usable = watchLaterPlayer && watchLaterPlayer.isConnected && watchLaterHref === location.href && watchLaterPlayer.getBoundingClientRect().width > 0;
      if (!usable) {
        const now = Date.now(); if (watchLaterHref === location.href && now - watchLaterLookup < 400) return;
        watchLaterHref = location.href; watchLaterLookup = now;
        const previous = watchLaterPlayer; watchLaterPlayer = findWatchLaterPlayer(hostnameRule());
        if (watchLaterPlayer && watchLaterPlayer !== previous && watchLaterPlayer.tagName === "IFRAME") {
          watchLaterFrames.add(watchLaterPlayer);
          watchLaterPlayer.addEventListener("mouseenter", watchLaterFrameEnter);
          watchLaterPlayer.addEventListener("mouseleave", watchLaterFrameLeave);
        }
        if (!watchLaterPlayer) return hideWatchLaterButton();
      }
      const box = watchLaterPlayer.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) revealWatchLaterButton();
    });
  }

  function watchLaterFrameEnter() {
    if (!ensureContext()) return;
    revealWatchLaterButton();
  }

  function watchLaterFrameLeave() {
    if (!ensureContext()) return;
    scheduleWatchLaterHide();
  }

  function ensureWatchLaterButton() {
    if (childFrame || !watchLaterPlayer || watchLaterButton) return;
    const key = watchLaterKey(); if (!key) return;
    watchLaterButton = document.createElement("button");
    watchLaterButton.id = "hoa-watch-later"; watchLaterButton.type = "button";
    watchLaterButton.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      if (watchLaterButton.getAttribute("aria-disabled") === "true") return;
      const currentKey = watchLaterKey(); if (!currentKey) return;
      HOA.readLists(lists => {
        const next = { ...lists.watchLater };
        if (next[currentKey]) {
          const removed = next[currentKey]; delete next[currentKey];
          HOA.writeLists({ watchLater: next }, () => showToast(currentKey, "Removed from Watch Later", () => HOA.writeLists({ watchLater: { ...next, [currentKey]: removed } })));
        } else {
          const meta = pageMetaForKey(currentKey);
          next[currentKey] = { title: meta.title || HOA.siteOf(currentKey), thumb: meta.thumbnail || HOA.youtubeThumb(currentKey), site: HOA.siteOf(currentKey), url: currentKey,
            duration: [watchLaterPlayer.duration, playerTracker && playerTracker.video && playerTracker.video.duration].find(Number.isFinite), ts: Date.now() };
          HOA.writeLists({ watchLater: next }, () => showToast(currentKey, "Added to Watch Later", () => { const undo = { ...next }; delete undo[currentKey]; HOA.writeLists({ watchLater: undo }); }));
        }
      });
    });
    ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick"].forEach(type => watchLaterButton.addEventListener(type, event => event.stopPropagation()));
    updateWatchLaterButton();
  }

  function findPlayer() {
    const rule = hostnameRule();
    document.querySelectorAll("video").forEach(video => { if (video.duration === Infinity && trackableVideo(video, rule)) watchLiveVideo(video); });
    const videos = Array.from(document.querySelectorAll("video")).filter(video => Number.isFinite(video.duration) && video.duration >= 20 && trackableVideo(video, rule));
    const visible = videos.filter(video => { const box = video.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(video).visibility !== "hidden"; });
    if (visible.length) { videos.length = 0; videos.push(...visible); }
    videos.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height));
    if (videos[0]) { attachTracker(videos[0]); watchLaterPlayer = findWatchLaterPlayer(rule) || videos[0]; watchLaterHref = location.href; ensureWatchLaterButton(); }
  }

  function startPlaybackTracker() {
    // Private windows do not record progress, but the user can still curate Watch Later there.
    if (!ensureContext() || playbackTrackerStarted || !watchSettingsReady || !siteRulesReady) return;
    playbackTrackerStarted = true;
    findPlayer(); ["loadedmetadata", "durationchange", "canplay", "play"].forEach(type => document.addEventListener(type, findPlayer, true));
    if (!childFrame) {
      document.addEventListener("mousemove", watchLaterPointer, { passive: true });
      watchLaterPointerListening = true;
      addEventListener("scroll", () => { if (watchLaterButton && watchLaterButton.classList.contains("hoa-watch-later-show")) positionWatchLaterButton(); }, { passive: true, capture: true });
      document.addEventListener("fullscreenchange", () => { if (watchLaterButton) positionWatchLaterButton(); });
    }
    addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveTracker(true); }); addEventListener("pagehide", () => saveTracker(true));
  }
  // Narrow test seam: production pages never create __hoaTest.
  if (window.__hoaTest) Object.assign(window.__hoaTest, { apply, applyAdded, compensateCarousels, filterText, cardRatings, pageDataForCard, shouldFilterCard, hostnameRule, cardData, keyForHref, attachTracker, findPlayer, activeCategories, keywordMatch: HOA.keywordMatch, saveTracker, watchedCard, frameEntry, watchedProgressMutation });

  function isOwnMutation(mutation) {
    if (mutation.target.closest && mutation.target.closest(".hoa-actions, #hoa-toast, #hoa-banner, #hoa-watch-later")) return true;
    const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
    return nodes.length > 0 && nodes.every(node => node.nodeType === 1
      && (node.matches(".hoa-actions, #hoa-toast, #hoa-banner, #hoa-watch-later")
        || node.querySelector(".hoa-actions, #hoa-toast, #hoa-banner, #hoa-watch-later")));
  }

  // A site that rewrites a card's class attribute (Tubi does this as its page finishes loading) wipes our
  // hoa-removed/hoa-host marks without adding or removing any element. Only a mark that went missing counts,
  // so our own class changes never retrigger apply().
  const OWN_MARKS = [ACTIVE_CLASS, FILTER_CLASS, "hoa-host"];
  function lostOwnMark(mutation) {
    if (mutation.type !== "attributes") {
      return false;
    }
    const before = String(mutation.oldValue || "").split(/\s+/);
    return OWN_MARKS.some(mark => before.includes(mark) && !mutation.target.classList.contains(mark));
  }

  function needsApply(mutation) {
    return mutation.type === "attributes"
      ? lostOwnMark(mutation) || mutation.attributeName === "hidden"
        || ((mutation.attributeName === "style" || mutation.attributeName === "aria-valuenow" || mutation.attributeName === "aria-valuemax") && watchedProgressMutation(mutation.target))
      : !isOwnMutation(mutation);
  }

  function observeRuleRoot(rule) {
    const selected = rule && rule.gridSelector ? document.querySelector(rule.gridSelector) : null;
    const root = selected || document.body;
    if (root && root !== observedRoot) {
      observer.disconnect();
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style", "aria-valuenow", "aria-valuemax"], attributeOldValue: true });
      observedRoot = root;
    }
  }

  HOA.readLists(lists => {
    hidden = lists.hidden;
    added = lists.added;
    channels = lists.channels;
    watchedShown = lists.watchedShown;
    watchProgress = lists.watchProgress;
    watchLater = lists.watchLater;
    cardLinks = lists.cardLinks;
    hasWatchProgress = Object.keys(watchProgress).length > 0;
    listsReady = true;
    scheduleApply();
    startPlaybackTracker();
  });
  chrome.storage.local.get({ [HOA.WATCH_SETTINGS_KEY]: {} }, result => { watchSettings = HOA.normalizeWatchSettings(result[HOA.WATCH_SETTINGS_KEY]); watchSettingsReady = true; scheduleApply(); startPlaybackTracker(); });
  chrome.storage.local.get({ [HOA.SITES_KEY]: {} }, result => {
    siteRules = result[HOA.SITES_KEY] && typeof result[HOA.SITES_KEY] === "object" ? result[HOA.SITES_KEY] : {};
    siteRulesReady = true;
    scheduleApply();
    startPlaybackTracker();
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (changes[HOA.HIDDEN_KEY]) {
      hidden = HOA.normalizeItems(changes[HOA.HIDDEN_KEY].newValue, { max: HOA.MAX_HIDDEN, withListed: true });
    }
    if (changes[HOA.ADDED_KEY]) {
      added = HOA.normalizeItems(changes[HOA.ADDED_KEY].newValue, { max: HOA.MAX_ADDED, withListed: false });
    }
    if (changes[HOA.CHANNELS_KEY]) {
      channels = HOA.normalizeChannels(changes[HOA.CHANNELS_KEY].newValue);
    }
    if (changes[HOA.WATCHED_SHOWN_KEY]) {
      watchedShown = HOA.normalizeWatchedShown(changes[HOA.WATCHED_SHOWN_KEY].newValue);
    }
    if (changes[HOA.PROGRESS_KEY]) { watchProgress = HOA.normalizeProgress(changes[HOA.PROGRESS_KEY].newValue); hasWatchProgress = Object.keys(watchProgress).length > 0; }
    if (changes[HOA.WATCH_LATER_KEY]) { watchLater = HOA.normalizeWatchLater(changes[HOA.WATCH_LATER_KEY].newValue); updateWatchLaterButton(); }
    if (changes[HOA.CARD_LINKS_KEY]) cardLinks = HOA.normalizeCardLinks(changes[HOA.CARD_LINKS_KEY].newValue);
    if (changes[HOA.WATCH_SETTINGS_KEY]) watchSettings = HOA.normalizeWatchSettings(changes[HOA.WATCH_SETTINGS_KEY].newValue);
    if (changes[HOA.SITES_KEY]) {
      siteRules = changes[HOA.SITES_KEY].newValue && typeof changes[HOA.SITES_KEY].newValue === "object"
        ? changes[HOA.SITES_KEY].newValue : {};
    }
    if (changes[HOA.HIDDEN_KEY] || changes[HOA.WATCHED_SHOWN_KEY] || changes[HOA.PROGRESS_KEY] || changes[HOA.SITES_KEY]) updateWatchLaterButton();
    if (changes[HOA.BUTTON_EDGE_KEY]) {
      setButtonEdge(changes[HOA.BUTTON_EDGE_KEY].newValue);
    }
    if (changes[HOA.BUTTONS_ENABLED_KEY]) {
      setButtonsEnabled(changes[HOA.BUTTONS_ENABLED_KEY].newValue);
    }
    scheduleApply();
  });

  // Enable/Disable only hides the bars (a page-level class), so hidden videos stay hidden and turning the
  // buttons back on needs no rebuild.
  function setButtonsEnabled(value) {
    buttonsEnabled = HOA.buttonsEnabledOf(value);
    rootElement.classList.toggle("hoa-buttons-off", !buttonsEnabled);
    if (!buttonsEnabled) {
      hideFloatBar();
    }
  }
  chrome.storage.local.get({ [HOA.BUTTONS_ENABLED_KEY]: true }, result => setButtonsEnabled(result[HOA.BUTTONS_ENABLED_KEY]));

  // Re-place every bar this script owns when the Top/Bottom choice changes.
  function setButtonEdge(value) {
    const next = HOA.buttonEdgeOf(value);
    if (next === buttonEdge) {
      return;
    }
    buttonEdge = next;
    document.querySelectorAll(`.hoa-actions[data-hoa-owner="${ownInstance}"]:not(.hoa-float)`).forEach(actions => {
      actions.hoaPlacementSize = null;
      if (actions.hoaCard && actions.hoaCard.isConnected) {
        placeActions(actions.hoaCard, actions, actions.hoaRule || {});
      }
    });
    if (watchLaterButton && !watchLaterButton.hidden) positionWatchLaterButton();
  }
  chrome.storage.local.get({ [HOA.BUTTON_EDGE_KEY]: "top" }, result => setButtonEdge(result[HOA.BUTTON_EDGE_KEY]));

  const observer = new MutationObserver(mutations => {
    if (!ensureContext()) {
      return;
    }
    const childMutations = mutations.filter(mutation => mutation.type === "childList" && !isOwnMutation(mutation));
    if (childMutations.length) {
      containerFilterCache = null;
      const addedNodes = childMutations.flatMap(mutation => Array.from(mutation.addedNodes));
      if (addedNodes.length) applyAdded(addedNodes);
      if (addedNodes.some(node => watchedProgressMutation(node, true))) scheduleApply();
      if (childMutations.some(mutation => mutation.removedNodes.length)) scheduleApply();
    }
    if (mutations.some(mutation => mutation.type === "attributes" && needsApply(mutation))) scheduleApply();
  });
  observeRuleRoot(hostnameRule());
  // The popup asks this to show how many videos the active rule recognised on the current page.
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (childFrame && message && message.type === "hoa-frame-seek" && playerTracker && Number.isFinite(message.seekTo)) {
        playerTracker.video.currentTime = Math.max(0, message.seekTo); return;
      }
      if (childFrame) return;
      if (message && message.type === "hoa-frame-progress" && !childFrame && !playerTracker && message.progress) {
        const entry = frameEntry(message.progress);
        const prior = entry && watchProgress[entry.url];
        if (entry) saveProgressEntry(entry, Math.max(0, Number(message.progress.covered) || 0));
        if (!frameResumeSent && prior && prior.cw && (prior.cw === "later" || watchSettings.continueWatching !== "off") && prior.position >= HOA.MIN_RESUME_SECONDS && prior.position < resumableUntil(prior.duration) && Math.abs(prior.duration - entry.duration) <= prior.duration * .05 && entry.position < HOA.MIN_RESUME_SECONDS) {
          const seekTo = Math.max(0, prior.position - 5);
          frameResumeSent = true;
          showToast(entry.url, `Resumed at ${HOA.formatDuration(Math.floor(prior.position))}`, () => chrome.runtime.sendMessage({ type: "hoa-frame-seek", seekTo: 0 }), "Start over");
          sendResponse({ seekTo });
        }
        return;
      }
      // Another installed copy of AddOrHide controls this page: tell this copy's popup.
      if (message && message.type === "hoa-status" && !ownContext() && rootElement.dataset.hoaExtension
        && rootElement.dataset.hoaExtension !== ownExtension) {
        sendResponse({ otherCopy: true, otherVersion: rootElement.dataset.hoaVersion || "" });
        return;
      }
      if (message && message.type === "hoa-find-rows" && !retired) {
        if (findingRows) { sendResponse({ ok: false, reason: "busy" }); return; }
        const rule = hostnameRule(); let cards = [];
        try { cards = rule ? Array.from(document.querySelectorAll([rule.cardSelector, ...(rule.variants || []).map(variant => variant.cardSelector)].filter(Boolean).join(", "))) : []; } catch (error) { cards = []; }
        if (!rule || !cards.length) { sendResponse({ ok: false, reason: "no-cards" }); return; }
        findingRows = true;
        scrollForRows(() => {
          const rows = HOA.normalizeSectionTitles(sectionRows(rule).rows.map(row => row.title));
          genrePageUrls(rule, urls => readGenrePages(urls, rule, pages => {
            const allRows = HOA.normalizeSectionTitles([...rows, ...pages.rows]);
            rememberFoundRows(rule, allRows);
            findingRows = false;
            sendResponse({ ok: true, rowsHere: rows.length, rows: allRows, pages: pages.pages, read: pages.read, blocked: pages.blocked, empty: pages.empty, skipped: pages.skipped });
          }));
        });
        return true;
      }
      // A replaced (retired) copy of this script stays registered as a listener; only the live one answers.
      if (message && message.type === "hoa-status" && !retired) {
        const rule = hostnameRule();
        let cards = 0;
        let matchedCards = [];
        let pathMatched = true;
        let union = "";
        try {
          if (rule) {
            const selectors = [rule.cardSelector, ...(rule.variants || [])
              .filter(variant => !variant.pathPattern || new RegExp(variant.pathPattern).test(location.pathname))
              .map(variant => variant.cardSelector)];
            union = selectors.join(", ");
            // A card nested inside another matched card (YouTube lockup inside its grid item) is one video.
            // Only cards that are on screen count: YouTube keeps the previous page (the home feed) in the DOM,
            // hidden, after you open a video.
            const currentPage = node => {
              if (node.closest("[hidden]")) return false;
              const managerChild = node.closest("ytd-page-manager > *");
              return !managerChild || !managerChild.hasAttribute("hidden");
            };
            matchedCards = Array.from(document.querySelectorAll(union))
              .filter(card => !(card.parentElement && card.parentElement.closest(union)) && currentPage(card));
            cards = matchedCards.length;
          }
        } catch (error) {
          cards = 0;
          pathMatched = false;
        }
        let version = "";
        try {
          version = chrome.runtime.getManifest().version;
        } catch (error) {
          version = "";
        }
        const currentPage = node => !node.closest("[hidden]") && !(node.closest("ytd-page-manager > *") || {}).hidden;
        const outer = (nodes, selector) => nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)) && currentPage(node));
        const isFiltered = card => Boolean(card.closest(`.${FILTER_CLASS}`));
        const channelVideos = matchedCards.filter(card => card.dataset.hoaWhy === "channel" && isFiltered(card));
        const filteredVideos = matchedCards.filter(card => card.dataset.hoaWhy !== "channel" && isFiltered(card));
        // A card's own removal target is the card, not a section; anything else filtered is a shelf or section.
        const cardTargets = new Set(rule ? matchedCards.map(card => removalTarget(card, rule)) : matchedCards);
        const hiddenHere = matchedCards.filter(card => (rule ? removalTarget(card, rule) : card).classList.contains(ACTIVE_CLASS));
        const filteredSections = outer(Array.from(document.querySelectorAll(`.${FILTER_CLASS}`)), `.${FILTER_CLASS}`)
          .filter(node => !cardTargets.has(node) && !matchedCards.includes(node) && !(union && node.matches(union))
            && !node.closest(".hoa-empty"));
        const collapsedSections = outer(Array.from(document.querySelectorAll(".hoa-empty")), ".hoa-empty");
        let rows = [];
        if (rule) {
          const info = sectionRows(rule);
          const titles = info.navTitles.length ? info.navTitles : info.rows.map(row => row.title);
          const renderedByKey = new Map(info.rows.map(row => [rowKey(row.title), row]));
          // Some sites render each row twice for different screen sizes (Pluto): list a title once.
          const seenTitles = new Set();
          rows = titles.filter(title => { const key = rowKey(title); if (!key || seenTitles.has(key)) return false; seenTitles.add(key); return true; })
            .slice(0, 120).map((title, index) => {
            const rendered = renderedByKey.get(rowKey(title));
            const classified = info.classify(title, index, Boolean(rendered && rendered.featured));
            return { title, kind: classified.kind, listed: classified.listed };
          });
        }
        sendResponse({
          active: Boolean(rule), cards, pathMatched, version, bulk: bulkApplied,
          overlays: Array.from(document.querySelectorAll(`.hoa-actions[data-hoa-owner="${ownInstance}"]:not(.hoa-float)`))
            .filter(actions => actions.parentElement && actions.parentElement.getClientRects().length).length,
          staleOverlays: document.querySelectorAll(`.hoa-actions:not([data-hoa-owner="${ownInstance}"])`).length,
          hiddenHere: hiddenHere.length,
          filteredHere: filteredVideos.length + filteredSections.length + collapsedSections.length,
          filteredVideos: filteredVideos.length,
          filteredSections: filteredSections.length + collapsedSections.length,
          channelVideos: channelVideos.length,
          watchedHere: rule ? matchedCards.filter(card => watchedCard(card, rule)).length : 0,
          watchedLabels: document.querySelectorAll(`[data-hoa-watched="${ownInstance}"]`).length,
          rows,
          rowsComplete: Boolean(rule && rule.sectionNav),
          nowPlaying: playerTracker && playerTracker.video ? (() => { const entry = trackerEntry(playerTracker); return entry && { key: entry.url, title: entry.title, position: entry.position, duration: entry.duration, cw: entry.cw }; })() : null
        });
      }
    });
  }
  // Show the buttons for whichever card is under the pointer, even when the site lays its own hover
  // preview (YouTube's inline player, Tubi's expanded tile) over the card, which would end CSS :hover.
  let pointerHost = null;
  let pointerPoint = null;
  let pointerFrame = 0;

  let floatBar = null;
  let floatTimer = 0;

  // A site can place its own layer over the whole card (YouTube's hover preview player is not inside the
  // card), which covers our bar even though it is shown. Then a copy of the bar is drawn above everything
  // at the same spot and forwards clicks to the real buttons.
  function barIsCovered(actions) {
    const rect = actions.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(actions).opacity === "0") {
      return false;
    }
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(top) && !actions.contains(top) && !(floatBar && floatBar.contains(top));
  }

  function hideFloatBar() {
    if (floatBar) {
      floatBar.hidden = true;
      floatBar.hoaSource = null;
    }
  }

  function ensureFloatBar() {
    if (floatBar && floatBar.isConnected) {
      return floatBar;
    }
    floatBar = document.createElement("div");
    floatBar.className = "hoa-actions hoa-float";
    floatBar.dataset.hoaOwner = ownInstance;
    floatBar.hidden = true;
    ["add", "hide", "channel"].forEach(action => {
      const button = actionButton(action === "add" ? "Add" : action === "hide" ? "Hide" : "Hide channel", () => {
        const source = floatBar.hoaSource && floatBar.hoaSource.querySelector(`[data-action="${action}"]`);
        if (source) {
          source.click();
          syncFloatBar();
        }
      });
      button.dataset.action = action;
      floatBar.appendChild(button);
    });
    document.documentElement.appendChild(floatBar);
    return floatBar;
  }

  function syncFloatBar() {
    const actions = pointerHost && pointerHost.isConnected && pointerHost.querySelector(":scope > .hoa-actions");
    if (retired || !buttonsEnabled || !actions || pointerHost.classList.contains(ACTIVE_CLASS)) {
      hideFloatBar();
      return;
    }
    if (floatBar && !floatBar.hidden && floatBar.hoaSource === actions) {
      // Already floating: keep it while the site's layer is still there.
      floatBar.hidden = true;
      const stillCovered = barIsCovered(actions);
      floatBar.hidden = false;
      if (!stillCovered) {
        hideFloatBar();
        return;
      }
    } else if (!barIsCovered(actions)) {
      hideFloatBar();
      return;
    }
    const bar = ensureFloatBar();
    const rect = actions.getBoundingClientRect();
    bar.hoaSource = actions;
    bar.style.top = `${Math.round(rect.top)}px`;
    bar.style.left = `${Math.round(rect.left)}px`;
    bar.querySelectorAll("button").forEach(button => {
      const source = actions.querySelector(`[data-action="${button.dataset.action}"]`);
      if (source) {
        button.hidden = false;
        button.textContent = source.textContent;
        button.setAttribute("aria-label", source.getAttribute("aria-label") || source.textContent);
        button.setAttribute("aria-pressed", source.getAttribute("aria-pressed") || "false");
      } else button.hidden = true;
    });
    bar.hidden = false;
  }

  function setPointerHost(host) {
    if (host !== pointerHost) {
      if (pointerHost) {
        pointerHost.classList.remove("hoa-show");
      }
      pointerHost = host;
      if (host) {
        host.classList.add("hoa-show");
      }
    }
    syncFloatBar();
    // The site's preview layer can appear while the mouse rests, so keep checking while a card is active.
    if (pointerHost && !floatTimer) {
      floatTimer = window.setInterval(() => {
        if (!pointerHost || retired) {
          window.clearInterval(floatTimer);
          floatTimer = 0;
          hideFloatBar();
          return;
        }
        syncFloatBar();
      }, 250);
    }
  }

  function updatePointerHost() {
    pointerFrame = 0;
    if (retired || !pointerPoint) {
      setPointerHost(null);
      return;
    }
    let host = null;
    for (const element of document.elementsFromPoint(pointerPoint[0], pointerPoint[1])) {
      host = element.closest && element.closest(".hoa-host");
      if (host) {
        break;
      }
    }
    setPointerHost(host);
  }

  function schedulePointerUpdate() {
    if (!pointerFrame) {
      pointerFrame = window.requestAnimationFrame(updatePointerHost);
    }
  }

  document.addEventListener("pointermove", event => {
    pointerPoint = [event.clientX, event.clientY];
    schedulePointerUpdate();
  }, { capture: true, passive: true });
  window.addEventListener("scroll", schedulePointerUpdate, { capture: true, passive: true });
  window.addEventListener("resize", () => scheduleCarouselCompensation(), { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    pointerPoint = null;
    schedulePointerUpdate();
  });
  document.addEventListener("yt-navigate-finish", scheduleApply);
  window.addEventListener("popstate", scheduleApply);
}
