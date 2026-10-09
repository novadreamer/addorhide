"use strict";

if (typeof window.__hoaRetire === "function") {
  window.__hoaRetire(false);
}
window.__hoaLoaded = true;

{
  const ownInstance = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const rootElement = document.documentElement;
  rootElement.dataset.hoaInstance = ownInstance;
  document.querySelectorAll(".hoa-actions, #hoa-toast, #hoa-banner").forEach(node => node.remove());
  document.querySelectorAll(".hoa-host, .hoa-removed, .hoa-show").forEach(node => node.classList.remove("hoa-host", "hoa-removed", "hoa-show"));

  const ACTIVE_CLASS = "hoa-removed";
  let hidden = {};
  let added = {};
  let siteRules = {};
  let scheduled = 0;
  let toastTimer = 0;
  let lastRule = null;
  let observedRoot = null;
  let retired = false;
  let buttonEdge = "top";
  let buttonsEnabled = true;

  function contextAlive() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch (error) {
      return false;
    }
  }

  function ownContext() {
    return rootElement.dataset.hoaInstance === ownInstance;
  }

  function removeOwnUi() {
    document.querySelectorAll(`.hoa-actions[data-hoa-owner="${ownInstance}"]`).forEach(node => node.remove());
    document.querySelectorAll(".hoa-host, .hoa-removed, .hoa-show").forEach(node => node.classList.remove("hoa-host", "hoa-removed", "hoa-show"));
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
    const merged = { ...base, catalog: Boolean(catalogRule), userPicked: validPicks.length > 0 };
    if (stored && typeof stored === "object") {
      // Enable stores linkSelector: "" for every site; an empty value must not wipe a catalog rule's link.
      if (typeof stored.linkSelector === "string" && stored.linkSelector && stored.linkSelector.length <= 500
        && validLinkSelector(stored.linkSelector)) {
        merged.linkSelector = stored.linkSelector;
      }
      if (typeof stored.bulkHide === "boolean") {
        merged.bulkHide = stored.bulkHide;
      }
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
    return (rule.adMarkers || []).some(marker => card.matches(marker) || card.querySelector(marker));
  }

  function removalTarget(card, rule) {
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
    const candidates = [ownText, element.getAttribute("aria-label"), element.getAttribute("title")];
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
    const key = HOA.canonicalUrl(link.href || link.getAttribute("href"), location.href);
    if (!key) {
      return null;
    }
    let title = "";
    for (const selector of rule.titleCandidates || []) {
      let candidate;
      try {
        candidate = card.querySelector(selector);
      } catch (error) {
        candidate = null;
      }
      title = textFrom(candidate);
      if (title) {
        break;
      }
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
    return { key, title, thumb, kind: HOA.kindOf(key), site: HOA.siteOf(key), ts: Date.now() };
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
        card.querySelectorAll(selector).forEach(element => texts.push(elementText(element)));
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

  function hideEntry(data) {
    hidden = { ...hidden, [data.key]: { ...data, ts: Date.now(), listed: true } };
    try {
      HOA.writeLists({ hidden });
    } catch (error) {
      retire(false);
      return;
    }
    showToast(data.key);
    scheduleApply();
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
        if (rect.width >= cardRect.width * 0.4 && rect.height < cardRect.height * 0.98 && area > bestArea) {
          best = rect;
          bestArea = area;
        }
      });
      return best;
    };
    const best = largest("img, video") || largest("picture, [class*=\"thumbnail\" i]");
    if (!best) {
      return { top: 0, bottom: cardRect.height };
    }
    return {
      top: Math.max(0, best.top - originY),
      bottom: Math.min(cardRect.height, best.bottom - originY)
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
    const maxX = Math.max(margin, cardRect.width - width - margin);
    const preferredX = (cardRect.width - width) / 2;
    const controls = Array.from(card.querySelectorAll("button, [role=\"button\"], input, select, textarea, a[aria-label][role]"))
      .filter(element => !element.closest(".hoa-actions, #hoa-toast, #hoa-banner"))
      .map(element => element.getBoundingClientRect())
      .filter(rect => rect.width && rect.height && rect.width <= cardRect.width * 0.6)
      .map(rect => ({ left: rect.left - originX, right: rect.right - originX, top: rect.top - originY, bottom: rect.bottom - originY }));
    const blocker = (x, y) => controls.find(rect => x < rect.right + 4 && x + width > rect.left - 4
      && y < rect.bottom + 4 && y + height > rect.top - 4);
    const clampX = x => Math.min(maxX, Math.max(margin, x));
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
      const media = videoPictureBox(card, cardRect, originX, originY);
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
      const hide = actionButton("Hide", () => hideEntry({ ...actions.hoaData, ...cardMeta(actions.hoaCard, actions.hoaRule, actions.hoaData.key) }));
      hide.dataset.action = "hide";
      actions.appendChild(hide);
      card.appendChild(actions);
    }
    actions.hoaData = data;
    actions.hoaCard = card;
    actions.hoaRule = rule;
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

  function showToast(key) {
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
    message.textContent = "Hidden";
    toast.appendChild(message);
    const undo = actionButton("Undo", () => {
      hidden = HOA.restoreKeys(hidden, [key]);
      try {
        HOA.writeLists({ hidden });
      } catch (error) {
        retire(false);
        return;
      }
      toast.remove();
      scheduleApply();
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
    document.querySelectorAll(".hoa-removed, .hoa-host").forEach(card => {
      card.classList.remove(ACTIVE_CLASS, "hoa-host", "hoa-show");
      card.querySelectorAll(":scope > .hoa-actions").forEach(node => {
        if (node.hoaPlacementObserver) {
          node.hoaPlacementObserver.disconnect();
        }
        node.remove();
      });
    });
    removeBanner();
    const toast = document.getElementById("hoa-toast");
    if (toast) {
      toast.remove();
    }
  }

  function apply() {
    if (!ensureContext()) {
      return;
    }
    scheduled = 0;
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
    const variants = [rule, ...(rule.variants || []).filter(variant => {
      // A variant can be limited to some pages (YouTube's creator-page lockups).
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
    const handled = new Set();
    const alreadyHandled = card => Array.from(handled).some(parent => parent !== card && parent.contains(card));
    if (rule.bulkHide && (!rule.bulkHidePath || location.pathname === rule.bulkHidePath)) {
      variants.flatMap(variant => Array.from(document.querySelectorAll(variant.cardSelector))).forEach(card => {
        if (!isAd(card, rule)) {
          removeActions(card);
          removalTarget(card, rule).classList.add(ACTIVE_CLASS);
        }
      });
      showBulkBanner(rule);
      return;
    }
    removeBanner();
    variants.forEach(variant => Array.from(document.querySelectorAll(variant.cardSelector)).forEach(card => {
      if (handled.has(card) || alreadyHandled(card)) {
        return;
      }
      if (isAd(card, variant)) {
        removeActions(card);
        return;
      }
      const data = cardData(card, variant);
      const target = removalTarget(card, variant);
      if (!data) {
        removeActions(card);
        target.classList.remove(ACTIVE_CLASS);
        return;
      }
      if (hidden[data.key]) {
        removeActions(card);
        target.classList.add(ACTIVE_CLASS);
      } else {
        target.classList.remove(ACTIVE_CLASS);
        ensureActions(card, data, variant);
      }
      handled.add(card);
    }));
  }

  function scheduleApply() {
    if (!scheduled) {
      scheduled = window.requestAnimationFrame(apply);
    }
  }

  function isOwnMutation(mutation) {
    return mutation.target.closest && mutation.target.closest(".hoa-actions, #hoa-toast, #hoa-banner");
  }

  function observeRuleRoot(rule) {
    const selected = rule && rule.gridSelector ? document.querySelector(rule.gridSelector) : null;
    const root = selected || document.body;
    if (root && root !== observedRoot) {
      observer.disconnect();
      observer.observe(root, { childList: true, subtree: true });
      observedRoot = root;
    }
  }

  HOA.readLists(lists => {
    hidden = lists.hidden;
    added = lists.added;
    scheduleApply();
  });
  chrome.storage.local.get({ [HOA.SITES_KEY]: {} }, result => {
    siteRules = result[HOA.SITES_KEY] && typeof result[HOA.SITES_KEY] === "object" ? result[HOA.SITES_KEY] : {};
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
    if (mutations.some(mutation => !isOwnMutation(mutation))) {
      scheduleApply();
    }
  });
  observeRuleRoot(hostnameRule());
  // The popup asks this to show how many videos the active rule recognised on the current page.
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // A replaced (retired) copy of this script stays registered as a listener; only the live one answers.
      if (message && message.type === "hoa-status" && !retired) {
        const rule = hostnameRule();
        let cards = 0;
        let pathMatched = true;
        try {
          if (rule) {
            const selectors = [rule.cardSelector, ...(rule.variants || [])
              .filter(variant => !variant.pathPattern || new RegExp(variant.pathPattern).test(location.pathname))
              .map(variant => variant.cardSelector)];
            const union = selectors.join(", ");
            // A card nested inside another matched card (YouTube lockup inside its grid item) is one video.
            cards = Array.from(document.querySelectorAll(union))
              .filter(card => !(card.parentElement && card.parentElement.closest(union))).length;
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
        sendResponse({
          active: Boolean(rule), cards, pathMatched, version,
          overlays: document.querySelectorAll(`.hoa-actions[data-hoa-owner="${ownInstance}"]:not(.hoa-float)`).length,
          staleOverlays: document.querySelectorAll(`.hoa-actions:not([data-hoa-owner="${ownInstance}"])`).length,
          hiddenHere: document.querySelectorAll(`.${ACTIVE_CLASS}`).length
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
    ["add", "hide"].forEach(action => {
      const button = actionButton(action === "add" ? "Add" : "Hide", () => {
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
        button.textContent = source.textContent;
        button.setAttribute("aria-label", source.getAttribute("aria-label") || source.textContent);
        button.setAttribute("aria-pressed", source.getAttribute("aria-pressed") || "false");
      }
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
  document.documentElement.addEventListener("pointerleave", () => {
    pointerPoint = null;
    schedulePointerUpdate();
  });
  document.addEventListener("yt-navigate-finish", scheduleApply);
  window.addEventListener("popstate", scheduleApply);
}
