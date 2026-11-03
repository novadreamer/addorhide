"use strict";

if (typeof window.__hoaRetire === "function") {
  window.__hoaRetire(false);
}
window.__hoaLoaded = true;

{
  const ownInstance = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const rootElement = document.documentElement;
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
    document.querySelectorAll(".hoa-actions, .hoa-watched-label, #hoa-toast, #hoa-banner").forEach(node => node.remove());
    document.querySelectorAll("[data-hoa-watched]").forEach(node => node.removeAttribute("data-hoa-watched"));
    document.querySelectorAll(".hoa-host, .hoa-removed, .hoa-filtered, .hoa-empty, .hoa-show").forEach(node => node.classList.remove("hoa-host", "hoa-removed", "hoa-filtered", "hoa-empty", "hoa-show"));
  }

  const ACTIVE_CLASS = "hoa-removed";
  const FILTER_CLASS = "hoa-filtered";
  let hidden = {};
  let added = {};
  let channels = {};
  let watchedShown = {};
  let watchedWriteTimer = 0;
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
  let waitingForBody = false;
  let filterVersion = 0;
  let filterSignature = "";
  const patternCache = new Map();
  let passCardText = new WeakMap();
  let passFilterText = new WeakMap();
  let passFeaturedCarousel = new WeakMap();
  const pageDataCache = new Map();
  const shelfTitleCache = new WeakMap();
  const decisionCache = new WeakMap();
  let containerFilterCache = null;
  const carouselObservers = new Map();
  let carouselFrame = 0;

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
    clearCarouselCompensation();
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
      gridSelector: ""
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
      cardSelector, linkSelector: "", titleCandidates: [], meta: { texts: ["*"] }
    }))];
    if (!catalogRule && validPicks.length) {
      merged.cardSelector = validPicks[0];
      merged.linkSelector = "";
      merged.titleCandidates = [];
      merged.meta = { texts: ["*"] };
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
      const link = getLink(card, rule);
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
      const name = (rule.channelNameAttribute && card.getAttribute(rule.channelNameAttribute)) || elementText(link) || channelText(card, rule);
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
    const selector = typeof HOA_WATCHED_SELECTOR === "string" ? HOA_WATCHED_SELECTOR : "ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model, [class*='WatchedProgressBarSegment'], [class*='ResumePlayback'], #progress.ytd-thumbnail-overlay-resume-playback-renderer";
    let progress = null;
    try { progress = card.querySelector(selector); } catch (error) { progress = null; }
    if (!progress) return null;
    const width = String(progress.style && progress.style.width || "").replace(/\s/g, "").toLowerCase();
    return width === "0%" || width === "0px" ? null : progress;
  }

  function watchedCard(card, rule) {
    const watched = (rule.categories || []).find(category => category.id === "watched");
    return Boolean(watched && watchedProgress(card));
  }

  function watchedEnabled(categories) {
    return categories.selected.some(category => category.id === "watched");
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
    return null;
  }

  function ensureWatchedLabel(card, rule, visible) {
    card.querySelectorAll(`[data-hoa-watched="${ownInstance}"]`).forEach(node => node.removeAttribute("data-hoa-watched"));
    if (!visible || rule.id !== "youtube" || !watchedCard(card, rule)) return;
    const thumbnail = thumbnailForWatchedLabel(card);
    if (thumbnail) thumbnail.setAttribute("data-hoa-watched", ownInstance);
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
  function sectionRows(rule) {
    const rows = [];
    (rule.sections || []).forEach(config => {
      if (!config || !config.container) return;
      try { document.querySelectorAll(config.container).forEach(section => {
        const title = sectionTitle(section, config, rule);
        if (title) rows.push({ section, title, featured: sectionHasFeaturedCarousel(section, rule) });
      }); } catch (error) { /* stale optional selector */ }
    });
    let navTitles = [];
    if (rule.sectionNav) {
      try { navTitles = Array.from(document.querySelectorAll(rule.sectionNav)).map(rowLabel).filter(Boolean); } catch (error) { navTitles = []; }
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

  function hideSectionNav(rule, rows, filtered, nodes) {
    if (!rule.sectionNav) return;
    const hiddenTitles = new Set(rows.filter(row => filtered.has(row.section)).map(row => rowKey(row.title)).filter(Boolean));
    try { document.querySelectorAll(rule.sectionNav).forEach(node => {
      const key = rowKey(rowLabel(node));
      if (key && hiddenTitles.has(key)) { filtered.add(node); if (nodes) nodes.add(node); }
    }); } catch (error) { /* optional nav */ }
  }

  function filterContainers(rule, categories, filtered) {
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

  function getLink(card, rule) {
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
    if (!link && card.matches("a[href]")) {
      // Picked cards can be the link itself (a.poster-card).
      link = card;
    }
    if (!link && rule.linkAttribute && card.getAttribute(rule.linkAttribute)) {
      link = card;
    }
    if (!link) {
      link = Array.from(card.querySelectorAll("a[href]"))
        .find(candidate => !candidate.closest(".hoa-actions, #hoa-toast, #hoa-banner"));
    }
    return link;
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

  function pickedTitle(card, link) {
    const linkLabel = plausiblePickedTitle(link.getAttribute("aria-label"))
      || plausiblePickedTitle(link.getAttribute("title"));
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

  function cardData(card, rule) {
    const link = getLink(card, rule);
    if (!link) {
      return null;
    }
    let href = (rule.linkAttribute && link.getAttribute(rule.linkAttribute)) || link.href || link.getAttribute("href");
    if (rule.stripQuery) {
      try { const url = new URL(href, location.href); url.search = ""; href = url.href; } catch (error) { /* canonicalUrl rejects malformed links */ }
    }
    const key = HOA.canonicalUrl(href, location.href);
    if (!key) {
      return null;
    }
    let title = "";
    for (const selector of rule.titleCandidates || []) {
      let candidate;
      try {
        candidate = card.matches(selector) ? card : card.querySelector(selector);
      } catch (error) {
        candidate = null;
      }
      title = textFrom(candidate);
      if (title) {
        break;
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
      title = image ? (image.getAttribute("alt") || "").trim() : "";
    }
    title = HOA.cleanTitle(title || HOA.siteOf(key)).slice(0, HOA.MAX_TITLE);

    let thumb = HOA.youtubeThumb(key);
    if (!thumb) {
      const image = card.querySelector("img");
      const source = image && (image.currentSrc || image.src || image.getAttribute("src"));
      thumb = typeof source === "string" && /^https?:\/\//i.test(source) && source.length <= HOA.MAX_URL ? source : "";
    }
    const pageData = pageDataForCard(card, rule, link);
    return { key, title, thumb, kind: HOA.kindOf(key), site: HOA.siteOf(key), ts: Date.now(), ...(pageData ? { pageData } : {}) };
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

  function cardMeta(card, rule, key) {
    const meta = { type: HOA.typeOf(key), icon: cardIcon(key) };
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
    return Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== null && value !== ""));
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

  function hideEntry(data, watched = false) {
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

  function queueWatched(data) {
    if (hidden[data.key] || watchedShown[data.key]) return;
    hidden = { ...hidden, [data.key]: { ...data, ts: Date.now(), listed: true, reason: "watched" } };
    if (!watchedWriteTimer) {
      watchedWriteTimer = window.setTimeout(() => {
        watchedWriteTimer = 0;
        HOA.writeLists({ hidden });
      }, 500);
    }
  }

  function toggleAdd(data, button) {
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
    let actions = card.querySelector(`:scope > .hoa-actions[data-hoa-owner="${ownInstance}"]`);
    card.querySelectorAll(":scope > .hoa-actions").forEach(node => {
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
      const add = actionButton("Add", button => toggleAdd({ ...actions.hoaData, ...cardMeta(actions.hoaCard, actions.hoaRule, actions.hoaData.key) }, button));
      add.dataset.action = "add";
      actions.appendChild(add);
      const hide = actionButton("Hide", () => hideEntry({ ...actions.hoaData, ...cardMeta(actions.hoaCard, actions.hoaRule, actions.hoaData.key) }, watchedCard(actions.hoaCard, actions.hoaRule)));
      hide.dataset.action = "hide";
      actions.appendChild(hide);
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
    card.classList.add("hoa-host");
    placeActions(card, actions, actions.hoaRule || {});
    const add = actions.querySelector('[data-action="add"]');
    if (add) {
      const isAdded = Boolean(added[data.key]);
      add.textContent = isAdded ? "Added" : "Add";
      add.setAttribute("aria-label", isAdded ? "Added" : "Add");
      add.setAttribute("aria-pressed", String(isAdded));
    }
  }

  function showToast(key, messageText = "Hidden", undoAction = null) {
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
    const undo = actionButton("Undo", () => {
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

  function processCard(card, variant, state) {
    const { categories, filtered, handled, cards } = state;
    if (cards) cards.add(card);
    let parent = card.parentElement;
    while (parent && parent !== document.body) {
      if (handled.has(parent)) return;
      parent = parent.parentElement;
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
        try { title = textFrom(card.querySelector(selector)); } catch (error) { title = ""; }
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
    const isWatched = watchedCard(card, variant);
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
        target.classList.remove(ACTIVE_CLASS, FILTER_CLASS);
        delete card.dataset.hoaWhy;
        ensureWatchedLabel(card, variant, isWatched);
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
    if (!ensureContext()) {
      return;
    }
    scheduled = 0;
    if (!listsReady || !siteRulesReady) return;
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
    document.querySelectorAll(`.${FILTER_CLASS}`).forEach(node => { if (!filtered.has(node)) node.classList.remove(FILTER_CLASS); });
    filtered.forEach(node => node.classList.add(FILTER_CLASS));
    collapseEmptySections(rule, variants, filtered, cards);
    compensateCarousels();
  }

  function scheduleApply() {
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
  // Narrow test seam: production pages never create __hoaTest.
  if (window.__hoaTest) Object.assign(window.__hoaTest, { apply, applyAdded, compensateCarousels, filterText, cardRatings, pageDataForCard, shouldFilterCard, hostnameRule, cardData, activeCategories, keywordMatch: HOA.keywordMatch });

  function isOwnMutation(mutation) {
    return mutation.target.closest && mutation.target.closest(".hoa-actions, .hoa-watched-label, #hoa-toast, #hoa-banner");
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
    return mutation.type === "attributes" ? lostOwnMark(mutation) || mutation.attributeName === "hidden" : !isOwnMutation(mutation);
  }

  function observeRuleRoot(rule) {
    const selected = rule && rule.gridSelector ? document.querySelector(rule.gridSelector) : null;
    const root = selected || document.body;
    if (root && root !== observedRoot) {
      observer.disconnect();
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"], attributeOldValue: true });
      observedRoot = root;
    }
  }

  HOA.readLists(lists => {
    hidden = lists.hidden;
    added = lists.added;
    channels = lists.channels;
    watchedShown = lists.watchedShown;
    listsReady = true;
    scheduleApply();
  });
  chrome.storage.local.get({ [HOA.SITES_KEY]: {} }, result => {
    siteRules = result[HOA.SITES_KEY] && typeof result[HOA.SITES_KEY] === "object" ? result[HOA.SITES_KEY] : {};
    siteRulesReady = true;
    scheduleApply();
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
    if (changes[HOA.SITES_KEY]) {
      siteRules = changes[HOA.SITES_KEY].newValue && typeof changes[HOA.SITES_KEY].newValue === "object"
        ? changes[HOA.SITES_KEY].newValue : {};
    }
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
      if (childMutations.some(mutation => mutation.removedNodes.length)) scheduleApply();
    }
    if (mutations.some(mutation => mutation.type === "attributes" && needsApply(mutation))) scheduleApply();
  });
  observeRuleRoot(hostnameRule());
  // The popup asks this to show how many videos the active rule recognised on the current page.
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Another installed copy of AddOrHide controls this page: tell this copy's popup.
      if (message && message.type === "hoa-status" && !ownContext() && rootElement.dataset.hoaExtension
        && rootElement.dataset.hoaExtension !== ownExtension) {
        sendResponse({ otherCopy: true, otherVersion: rootElement.dataset.hoaVersion || "" });
        return;
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
        if (rule && rule.sections && rule.sections.length) {
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
          rows
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
