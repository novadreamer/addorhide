"use strict";

const openHiddenButton = document.getElementById("open-hidden-button");
const hiddenSummary = document.getElementById("hidden-summary");
const popupStatus = document.getElementById("popup-status");
const openAddedButton = document.getElementById("open-added-button");
const addedSummary = document.getElementById("added-summary");
const openOptionsButton = document.getElementById("open-options-button");
const siteContent = document.getElementById("site-content");
const siteStatus = document.getElementById("site-status");
const themeToggle = document.getElementById("theme-toggle");
const pageDetailsToggle = document.getElementById("page-details-toggle");
const popupMain = document.querySelector("body.popup main");

let hidden = {};
let added = {};
let channels = {};
let activeTab = null;
let activeHost = "";
let siteRulesWrittenHere = false;
let positionRoomFrame = 0;

function fitPositionBreathingRoom() {
  positionRoomFrame = 0;
  const controls = document.querySelector(".popup .button-controls");
  if (!controls || !popupMain) return;
  controls.classList.remove("popup-position-room");
  controls.style.removeProperty("--popup-position-room");
  const mainOverflows = popupMain.clientHeight > 0 && popupMain.scrollHeight > popupMain.clientHeight + 1;
  // Measure the content itself (the document's height is at least the window's, which can already be 600).
  const used = Math.ceil(popupMain.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(document.body).paddingBottom) || 0));
  const space = 600 - used;
  const padding = space >= 14 ? 14 : (space >= 6 ? space : 0);
  if (!mainOverflows && padding >= 6) {
    controls.style.setProperty("--popup-position-room", `${padding}px`);
    controls.classList.add("popup-position-room");
  }
}

function schedulePositionBreathingRoom() {
  if (!positionRoomFrame) positionRoomFrame = requestAnimationFrame(fitPositionBreathingRoom);
}

// Permissions are requested for the scheme the tab is really on (https almost everywhere).
// Asks the content script on the active tab how many videos it recognised, so a silent miss is visible.
function appendPageStatus(container) {
  const line = document.createElement("p");
  line.className = "muted";
  line.textContent = "Checking this page...";
  container.appendChild(line);
  if (!activeTab || typeof activeTab.id !== "number") {
    line.textContent = "";
    schedulePositionBreathingRoom();
    return;
  }
  chrome.tabs.sendMessage(activeTab.id, { type: "hoa-status" }, reply => {
    if (chrome.runtime.lastError || !reply) {
      const currentRule = siteRule(activeHost);
      const active = HOA_SITES.isBuiltIn(activeHost) ? currentRule.enabled !== false : currentRule.enabled === true;
      line.textContent = active ? "AddOrHide has not loaded on this page yet. "
        : "AddOrHide has not loaded on this page yet. Reload the page, then reopen this popup.";
      if (active) {
        const reload = button("Reload page", () => {
          chrome.tabs.reload(activeTab.id, () => window.close());
        });
        reload.className = "secondary-button";
        line.appendChild(reload);
      }
    } else if (reply.otherCopy) {
      line.textContent = `Another copy of AddOrHide${reply.otherVersion ? ` (version ${reply.otherVersion})` : ""} is running on this page, `
        + "so this copy's settings and lists don't apply here. Keep only one copy: remove the other one on your browser's Extensions page.";
      line.className = "status error";
      return;
    } else if (reply.bulk) {
      line.textContent = "The whole feed is hidden on this page. Turn off Hide the whole feed to see it again.";
    } else if (!reply.active) {
      line.textContent = "AddOrHide is off on this page.";
    } else if (reply.filteredVideos || reply.filteredSections || reply.channelVideos) {
      line.textContent = filterCountText(reply, true);
    } else if (!reply.cards) {
      line.textContent = "Active, but no videos were recognised on this page. Try a list or home page, or use Pick cards.";
    } else if (!reply.overlays) {
      line.textContent = `Found ${reply.cards} video${reply.cards === 1 ? "" : "s"}, but none got buttons. Reload the page; if it stays like this, send the details below.`;
    } else {
      line.textContent = `Found ${reply.cards} video${reply.cards === 1 ? "" : "s"} on this page. Move your mouse over one to see Add and Hide.`;
    }
    schedulePositionBreathingRoom();
  });
}

// short: the one-line form for the popup itself; the popover has room for the full sentence.
function filterCountText(reply, short = false) {
  if (short) {
    const parts = [];
    if (reply.filteredVideos) parts.push(`${reply.filteredVideos} video${reply.filteredVideos === 1 ? "" : "s"}`);
    if (reply.filteredSections) parts.push(`${reply.filteredSections} section${reply.filteredSections === 1 ? "" : "s"}`);
    if (reply.channelVideos) parts.push(`${reply.channelVideos} by channel`);
    return `Hidden here: ${parts.join(", ")}`;
  }
  const parts = [];
  if (reply.filteredVideos) parts.push(`${reply.filteredVideos} video${reply.filteredVideos === 1 ? "" : "s"}`);
  if (reply.filteredSections) parts.push(`${reply.filteredSections} section${reply.filteredSections === 1 ? "" : "s"}`);
  let text = parts.length ? `Hidden by your filters on this page: ${parts.join(" and ")}` : "Nothing hidden by your filters on this page";
  if (reply.channelVideos) text += ` · ${reply.channelVideos} from hidden channel${reply.channelVideos === 1 ? "" : "s"}`;
  return text;
}

function openPopover(triggerButton, titleText, buildBody) {
  const backdrop = document.createElement("div"); backdrop.className = "filter-backdrop";
  const panel = document.createElement("section"); panel.className = "filter-popover"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true");
  const rect = triggerButton.getBoundingClientRect();
  const header = document.createElement("div"); header.className = "filter-popover-header";
  header.appendChild(Object.assign(document.createElement("strong"), { textContent: titleText }));
  const tools = document.createElement("div"); tools.className = "filter-popover-tools"; header.appendChild(tools);
  const close = button("×", closePanel); close.className = "filter-close"; close.setAttribute("aria-label", `Close ${titleText}`); tools.appendChild(close); panel.appendChild(header);
  const body = document.createElement("div"); body.className = "hide-filters-body"; panel.appendChild(body);
  const closeOnKey = event => { if (event.key === "Escape") { if (panel.hoaCloseInner && panel.hoaCloseInner()) return; closePanel(); } };
  let closing = false;
  function closePanel() { if (closing) return; closing = true; document.removeEventListener("keydown", closeOnKey); if (panel.hoaRefresh) clearInterval(panel.hoaRefresh); panel.classList.add("is-closing"); backdrop.classList.add("is-closing"); setTimeout(() => { panel.remove(); backdrop.remove(); triggerButton.focus(); }, 290); }
  backdrop.addEventListener("click", closePanel); document.addEventListener("keydown", closeOnKey);
  buildBody(body, panel, tools);
  document.body.append(backdrop, panel);
  requestAnimationFrame(() => { const left = innerWidth / 2 - panel.offsetWidth / 2; const top = innerHeight / 2 - panel.offsetHeight / 2; panel.style.transformOrigin = `${rect.left + rect.width / 2 - left}px ${rect.top + rect.height / 2 - top}px`; backdrop.classList.add("is-open"); panel.classList.add("is-open"); close.focus(); });
}

function openPageDetails() {
  openPopover(pageDetailsToggle, "Page details", (body, panel) => {
    let shown = "";
    // Rows are built only once the answer is in and swapped in one step, and only when something changed,
    // so the 2 s refresh never blanks the window.
    const show = rows => {
      const key = JSON.stringify(rows);
      if (key === shown || !panel.isConnected) return;
      shown = key;
      const fragment = document.createDocumentFragment();
      rows.forEach(([label, value]) => { const row = document.createElement("div"); row.className = "detail-row"; row.append(Object.assign(document.createElement("span"), { textContent: label }), Object.assign(document.createElement("strong"), { textContent: String(value) })); fragment.appendChild(row); });
      body.replaceChildren(fragment);
    };
    const version = chrome.runtime.getManifest().version;
    const refresh = () => {
      if (!activeTab || !Number.isInteger(activeTab.id)) { show([["Page script", "not answering"], ["Extension version", version]]); return; }
      chrome.tabs.sendMessage(activeTab.id, { type: "hoa-status" }, reply => {
        if (chrome.runtime.lastError || !reply) { show([["Page script", "not answering"], ["Extension version", version]]); return; }
        show([["Page script", `v${reply.version || "?"}`], ["Extension version", version], ["Cards found", reply.cards || 0], ["Buttons shown", reply.overlays || 0],
          ["Hidden by you here", reply.hiddenHere || 0], ["Hidden by filters", `${reply.filteredVideos || 0} videos / ${reply.filteredSections || 0} sections`],
          ["From hidden channels", reply.channelVideos || 0], ["Watched detected", reply.watchedHere || 0], ["Watched labels shown", reply.watchedLabels || 0],
          ...(reply.staleOverlays ? [["Stale overlays", reply.staleOverlays]] : [])]);
      });
    };
    refresh(); panel.hoaRefresh = setInterval(refresh, 2000);
  });
}

function activeScheme() {
  return activeTab && typeof activeTab.url === "string" && activeTab.url.startsWith("http://") ? "http" : "https";
}
let siteRules = {};

function refreshThemeToggle() {
  if (!themeToggle || !window.HOA_THEME) {
    return;
  }
  const dark = window.HOA_THEME.effective() === "dark";
  const sun = themeToggle.querySelector(".icon-sun");
  const moon = themeToggle.querySelector(".icon-moon");
  sun.hidden = !dark;
  moon.hidden = dark;
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  themeToggle.setAttribute("aria-label", label);
  themeToggle.title = label;
}

function setStatus(message, kind = "") {
  popupStatus.textContent = message;
  popupStatus.className = `status ${kind}`.trim();
}

function button(label, action) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", action);
  return node;
}

let siteStatusTimer = 0;
// A short toast over the popup (it takes no room in the layout, so it can never cause a scrollbar).
function setSiteStatus(message, kind = "") {
  siteStatus.textContent = message;
  siteStatus.className = `status site-toast ${kind}`.trim();
  window.clearTimeout(siteStatusTimer);
  if (message) siteStatusTimer = window.setTimeout(() => { siteStatus.textContent = ""; }, 2600);
}

// renderSite waits for a permission check before drawing; only the newest render may draw, or two quick
// renders (load + a storage change) would each append a copy of the site controls.
let renderGeneration = 0;

function clearNode(node) {
  while (node.firstChild) {
    node.firstChild.remove();
  }
}

function siteButton(label, action, secondary = false) {
  const node = button(label, action);
  node.className = secondary ? "secondary-button" : "primary-button";
  return node;
}

function saveSiteRules(next, message) {
  siteRules = next;
  siteRulesWrittenHere = true;
  chrome.storage.local.set({ [HOA.SITES_KEY]: siteRules }, () => {
    setSiteStatus(chrome.runtime.lastError ? "Could not save the site setting." : message,
      chrome.runtime.lastError ? "error" : "success");
  });
}

function siteRule(host) {
  return siteRules[host] && typeof siteRules[host] === "object" ? siteRules[host] : {};
}

function pickedSelectors(rule) {
  return HOA.usablePicks(rule);
}

function addLearnedControl(host, catalog, rule, container) {
  const count = pickedSelectors(rule).length;
  if (!count) {
    return;
  }
  const forget = button(count === 1 ? "Forget taught card" : "Forget taught cards", () => {
    const nextRule = { ...siteRule(host), pickedSelectors: [], pendingPick: !catalog };
    delete nextRule.cardSelector;
    const next = { ...siteRules, [host]: nextRule };
    siteRules = next;
    chrome.storage.local.set({ [HOA.SITES_KEY]: next }, renderSite);
  });
  forget.className = "link-button";
  container.appendChild(forget);
}

function appendFilterControls(container, catalogRule) {
  const categories = catalogRule && Array.isArray(catalogRule.categories) ? catalogRule.categories : [];
  const typeCategories = categories.filter(category => category.id !== "genres");
  const genreCategory = categories.find(category => category.id === "genres");
  let kinds = HOA.normalizeHideKinds(siteRule(activeHost).hideKinds, categories.map(category => category.id));
  let keywords = HOA.normalizeKeywords(siteRule(activeHost).hideKeywords);
  let hideSections = HOA.normalizeSectionTitles(siteRule(activeHost).hideSections);
  let featuredCarousels = siteRule(activeHost).featuredCarousels !== false;
  let duplicateMessage = "";
  let genresOpen = false;
  let genreTitles = [];
  let refreshCount = () => {};   // set while the popover is open
  const launch = button("Hide on this site", openPanel);
  launch.className = "secondary-button filter-launch";
  launch.innerHTML = '<span class="filter-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7v5l-4 2v-7z"/></svg></span><span>Hide on this site</span><span class="filter-badge" hidden></span><span class="filter-chevron">›</span>';
  const updateSummary = () => { const labels = typeCategories.filter(c => kinds.includes(c.id)).map(c => c.label); const count = labels.length + keywords.length + (hideSections.length ? 1 : 0); const what = [...labels, hideSections.length ? `${hideSections.length} genre${hideSections.length === 1 ? "" : "s"}` : "", keywords.length ? `${keywords.length} word${keywords.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(", "); const summary = count ? `Hiding: ${what}` : "Nothing is hidden by type or word on this site"; launch.title = `${summary}${featuredCarousels ? "" : " · not in featured carousels"}`; const badge = launch.querySelector(".filter-badge"); badge.hidden = !count; badge.textContent = count; launch.classList.toggle("is-active", Boolean(count)); };
  updateSummary();
  container.append(launch);
  function save() {
    const hadWatched = HOA.normalizeHideKinds(siteRule(activeHost).hideKinds, categories.map(c => c.id)).includes("watched");
    const hasWatched = kinds.includes("watched");
    saveSiteRules({ ...siteRules, [activeHost]: { ...siteRule(activeHost), enabled: siteRule(activeHost).enabled !== false,
      hideKinds: HOA.normalizeHideKinds(kinds, categories.map(c => c.id)), hideKeywords: HOA.normalizeKeywords(keywords), hideSections: HOA.normalizeSectionTitles(hideSections), featuredCarousels } }, "Filter settings saved.");
    updateSummary();
    if (hadWatched && !hasWatched) HOA.clearAutoWatched(activeHost);
    window.setTimeout(() => refreshCount(), 400);
  }
  function openPanel() {
    openPopover(launch, `Hide on ${HOA.siteDisplayName(activeHost)}`, (body, panel, tools) => {
      const allIds = typeCategories.map(c => c.id);
      const eye = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
      const eyeOff = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
      const featuredIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="7" width="14" height="10" rx="1"/><path d="M2 12h3M19 12h3M3 10l-2 2 2 2M21 10l2 2-2 2"/></svg>';
      // One toggle: while every type is on it unhides them all, otherwise it hides them all.
      const allOn = () => allIds.every(id => kinds.includes(id));
      const toggleAll = button("", () => { kinds = allOn() ? [] : [...allIds]; save(); redraw(); });
      toggleAll.className = "filter-tool";
      const paintToggleAll = () => { if (typeCategories.length < 2) return; const on = allOn(); const label = on ? "Unhide all types" : "Hide all types";
        toggleAll.innerHTML = on ? eye : eyeOff; toggleAll.title = label; toggleAll.setAttribute("aria-label", label); toggleAll.setAttribute("aria-pressed", String(on)); };
      // Neither tool means anything without types (keyword-only and taught sites), and the carousel switch only
      // on sites that have big rotating featured rows.
      if (typeCategories.length > 1) tools.prepend(toggleAll);
      if (typeCategories.length && catalogRule && (catalogRule.carousels || catalogRule.featuredSelector)) {
        const toggleFeatured = button("", () => { featuredCarousels = !featuredCarousels; save(); paintFeatured(); });
        toggleFeatured.className = "filter-tool";
        const paintFeatured = () => { const label = featuredCarousels ? "Featured carousels are included — click to leave them alone" : "Featured carousels are left alone — click to include them";
          // Left alone: the same carousel icon, struck through.
          toggleFeatured.innerHTML = featuredCarousels ? featuredIcon : featuredIcon.replace("</svg>", '<path d="M4 3l16 18"/></svg>'); toggleFeatured.title = label; toggleFeatured.setAttribute("aria-label", label); toggleFeatured.setAttribute("aria-pressed", String(featuredCarousels)); };
        tools.insertBefore(toggleFeatured, toggleAll.nextSibling);
        paintFeatured();
      }
      const redraw = () => {
        if (panel.hoaRefresh) { window.clearInterval(panel.hoaRefresh); panel.hoaRefresh = 0; }
        paintToggleAll();
        body.replaceChildren();
        typeCategories.forEach(category => { const label = document.createElement("label"); label.className = "switch-row"; label.title = category.hint;
          const toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.setAttribute("role", "switch"); toggle.checked = kinds.includes(category.id);
          toggle.addEventListener("change", () => { kinds = toggle.checked ? [...kinds, category.id] : kinds.filter(id => id !== category.id); save(); }); label.append(toggle, document.createTextNode(` ${category.label}`)); body.appendChild(label); });
        if (genreCategory) {
          const genreRow = button("", () => toggleGenres()); genreRow.className = "genres-row"; genreRow.title = genreCategory.hint;
          genreRow.setAttribute("aria-expanded", "false"); genreRow.setAttribute("role", "checkbox");
          const paintGenreRow = titles => { const total = titles.length; const count = titles.filter(title => hideSections.some(value => value.localeCompare(title, undefined, { sensitivity: "accent" }) === 0)).length; const state = total && count >= total ? "true" : count ? "mixed" : "false";
            genreRow.setAttribute("aria-checked", state); genreRow.innerHTML = `<span class="genres-switch" aria-hidden="true"></span><span>${genreCategory.label}</span><small>${count}${total ? ` of ${total}` : ""}</small><span class="filter-chevron">›</span>`; };
          const genreWrap = document.createElement("div"); genreWrap.className = "genres-panel";
          genreWrap.classList.toggle("is-open", genresOpen);
          genreRow.setAttribute("aria-expanded", String(genresOpen));
          const list = document.createElement("div"); list.className = "genres-list";
          const normalize = values => HOA.normalizeSectionTitles(values);
          const setTitles = values => { genreTitles = normalize(values); paintGenreRow(genreTitles); };
          const drawGenreList = () => {
            list.replaceChildren();
            if (!genreTitles.length) { list.appendChild(Object.assign(document.createElement("p"), { className: "filter-note muted", textContent: "Scroll the page once so AddOrHide can list its rows." })); return; }
            genreTitles.forEach(title => { const label = document.createElement("label"); label.className = "genre-check"; const input = document.createElement("input"); input.type = "checkbox";
              input.checked = hideSections.some(value => value.localeCompare(title, undefined, { sensitivity: "accent" }) === 0);
              input.addEventListener("change", () => { hideSections = input.checked ? normalize([...hideSections, title]) : hideSections.filter(value => value.localeCompare(title, undefined, { sensitivity: "accent" }) !== 0); save(); paintGenreRow(genreTitles); });
              const text = document.createElement("span"); text.textContent = title; label.title = title; label.append(input, text); list.appendChild(label); });
          };
          const header = document.createElement("div"); header.className = "genres-panel-header"; header.appendChild(Object.assign(document.createElement("span"), { className: "muted", textContent: "Tick a genre to hide its row" }));
          const allGenres = button("", () => { const all = genreTitles.length && genreTitles.every(title => hideSections.some(value => value.localeCompare(title, undefined, { sensitivity: "accent" }) === 0)); hideSections = all ? hideSections.filter(value => !genreTitles.some(title => title.localeCompare(value, undefined, { sensitivity: "accent" }) === 0)) : normalize([...hideSections, ...genreTitles]); save(); drawGenreList(); paintGenreRow(genreTitles); paintAll(); }); allGenres.className = "filter-tool";
          const closeGenres = button("×", () => closeGenresPanel()); closeGenres.className = "filter-close"; closeGenres.title = "Close Genres"; header.append(allGenres, closeGenres); genreWrap.append(Object.assign(document.createElement("div"), { className: "genres-panel-inner" })); genreWrap.firstChild.append(header, list);
          const paintAll = () => { const all = genreTitles.length && genreTitles.every(title => hideSections.some(value => value.localeCompare(title, undefined, { sensitivity: "accent" }) === 0)); const label = all ? "Unhide all genres" : "Hide all genres"; allGenres.innerHTML = all ? eye : eyeOff; allGenres.title = label; allGenres.setAttribute("aria-label", label); };
          const closeGenresPanel = () => { genresOpen = false; genreWrap.classList.remove("is-open"); genreRow.setAttribute("aria-expanded", "false"); panel.hoaCloseInner = null; };
          const loadGenres = () => chrome.storage.local.get({ [HOA.SEEN_ROWS_KEY]: {} }, saved => {
            const seen = saved[HOA.SEEN_ROWS_KEY] && saved[HOA.SEEN_ROWS_KEY][activeHost] || [];
            const finish = pageRows => { const pageTitles = normalize((pageRows || []).filter(row => row && row.kind === "genre").map(row => row.title)); const remembered = normalize([...seen, ...pageTitles]).slice(-150);
              setTitles([...pageTitles, ...seen, ...hideSections]); drawGenreList(); paintAll();
              if (pageTitles.some(title => !normalize(seen).some(old => old.localeCompare(title, undefined, { sensitivity: "accent" }) === 0))) chrome.storage.local.set({ [HOA.SEEN_ROWS_KEY]: { ...(saved[HOA.SEEN_ROWS_KEY] || {}), [activeHost]: remembered } }); };
            if (activeTab && Number.isInteger(activeTab.id)) chrome.tabs.sendMessage(activeTab.id, { type: "hoa-status" }, reply => finish(reply && reply.rows)); else finish([]);
          });
          const toggleGenres = () => { const open = !genresOpen; if (open) { genresOpen = true; genreWrap.classList.add("is-open"); genreRow.setAttribute("aria-expanded", "true"); panel.hoaCloseInner = () => { closeGenresPanel(); return true; }; window.setTimeout(() => { if (genresOpen && genreRow.scrollIntoView) genreRow.scrollIntoView({ block: "start", behavior: "smooth" }); }, 220); } else closeGenresPanel(); };
          paintGenreRow(genreTitles); body.append(genreRow, genreWrap);
          if (genresOpen) panel.hoaCloseInner = () => { closeGenresPanel(); return true; };
          // Fetch on the first popover draw so its count and tri-state are already known before opening the panel.
          loadGenres();
        }
        const words = document.createElement("div"); words.className = "filter-words"; const input = document.createElement("input"); input.type = "text"; input.setAttribute("aria-label", "Hide videos with these words, comma-separated");
        input.disabled = keywords.length >= 10; input.placeholder = input.disabled ? "10 of 10 words — remove one to add another" : "Hide videos with these words";
        const note = document.createElement("p"); note.className = "filter-note muted"; note.textContent = duplicateMessage;
        const addWords = () => { const candidates = HOA.normalizeKeywords(input.value.split(",")); const duplicate = candidates.some(word => keywords.some(value => value.localeCompare(word, undefined, { sensitivity: "accent" }) === 0)); keywords = HOA.normalizeKeywords([...keywords, ...candidates]); input.value = ""; duplicateMessage = duplicate ? "Already in the list" : ""; save(); redraw(); if (duplicateMessage) window.setTimeout(() => { duplicateMessage = ""; if (panel.isConnected) redraw(); }, 1600); };
        const add = button("Add", addWords); add.className = "secondary-button"; input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addWords(); } }); words.append(input, add); body.appendChild(words);
        if (catalogRule && catalogRule.pageData && catalogRule.pageData.fields && catalogRule.pageData.fields.cast) {
          body.appendChild(Object.assign(document.createElement("p"), { className: "filter-note muted", textContent: "Tip: type an actor's name — it matches wherever the site lists the cast." }));
        }
        const chips = document.createElement("div"); chips.className = "filter-chips"; keywords.forEach(word => { const chip = button(`× ${word}`, () => { keywords = keywords.filter(value => value !== word); save(); redraw(); }); chip.className = "filter-chip"; chip.title = `Remove ${word}`; chips.appendChild(chip); }); body.append(chips, note);
        const count = document.createElement("p"); count.className = "muted filter-page-count"; count.textContent = "Checking filtered cards..."; body.appendChild(count);
        refreshCount = () => { if (activeTab && Number.isInteger(activeTab.id)) chrome.tabs.sendMessage(activeTab.id, { type: "hoa-status" }, reply => { if (reply && panel.isConnected) count.textContent = filterCountText(reply); }); };
        refreshCount(); panel.hoaRefresh = window.setInterval(refreshCount, 2000);
      };
      redraw();
    });
  }
}

function renderSite() {
  const generation = ++renderGeneration;
  clearNode(siteContent);
  setSiteStatus("");
  if (!activeTab || !HOA_SITES.isSupportedPageUrl(activeTab.url || "")) {
    siteContent.textContent = "AddOrHide can't run on this page.";
    schedulePositionBreathingRoom();
    return;
  }
  const isBuiltIn = HOA_SITES.isBuiltIn(activeHost);
  const catalogRule = HOA_CATALOG.find(activeHost);
  const isCatalog = HOA_SITES.isCatalog(activeHost);
  const rule = siteRule(activeHost);
  if (isBuiltIn) {
    const status = document.createElement("p");
    status.textContent = `${activeHost} - built in`;
    siteContent.appendChild(status);
    appendPageStatus(siteContent);
    const label = document.createElement("label");
    label.className = "switch-row";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.setAttribute("role", "switch");
    toggle.checked = rule.bulkHide === true;
    toggle.addEventListener("change", () => {
      const current = siteRule(activeHost);
      saveSiteRules({ ...siteRules, [activeHost]: {
        ...current, enabled: true, bulkHide: toggle.checked,
        cardSelector: typeof current.cardSelector === "string" ? current.cardSelector : "",
        linkSelector: typeof current.linkSelector === "string" ? current.linkSelector : ""
      } }, "Feed setting saved.");
    });
    label.appendChild(toggle);
    label.appendChild(document.createTextNode(" Hide the whole feed"));
    siteContent.appendChild(label);
    appendFilterControls(siteContent, catalogRule);
    schedulePositionBreathingRoom();
    return;
  }
  const renderEnabled = granted => {
  if (generation !== renderGeneration) return;
  clearNode(siteContent);
  if (!granted || rule.enabled !== true) {
    if (isCatalog) {
      const supported = document.createElement("p");
      supported.textContent = `${catalogRule.name} is supported`;
      siteContent.appendChild(supported);
    }
    siteContent.appendChild(siteButton("Enable on this site", () => {
      HOA_SITES.enableSite(activeHost, activeTab.id, siteRules, result => {
        if (!result.ok) {
          setSiteStatus(result.error, "error");
          return;
        }
        if (isCatalog) {
          siteRules = { ...siteRules, [activeHost]: { ...siteRule(activeHost), enabled: true, pendingPick: false, scheme: activeScheme() } };
          renderSite();
          setSiteStatus("Enabled. Move your mouse over a video to see Add and Hide.", "success");
          return;
        }
        HOA_SITES.startPicker(activeTab.id, pickerResult => {
          if (!pickerResult.ok) {
            setSiteStatus(pickerResult.error, "error");
            return;
          }
          siteRules = { ...siteRules, [activeHost]: { ...siteRule(activeHost), pendingPick: false } };
          chrome.storage.local.set({ [HOA.SITES_KEY]: siteRules }, () => window.close());
        });
      }, activeScheme());
    }));
    schedulePositionBreathingRoom();
    return;
  }
  const heading = document.createElement("p");
  heading.textContent = isCatalog ? `${catalogRule.name} - supported site` : activeHost;
  siteContent.appendChild(heading);
  const status = document.createElement("p");
  status.className = "muted";
  const learnedCount = pickedSelectors(rule).length;
  // Labels follow what the user has actually done on this site.
  status.textContent = learnedCount
    ? `You taught ${learnedCount} kind${learnedCount === 1 ? "" : "s"} of card here`
    : (isCatalog ? "Supported" : "Pick the cards to finish setup");
  siteContent.appendChild(status);
  appendPageStatus(siteContent);
  const actions = document.createElement("div");
  actions.className = "page-actions";
  const teachLabel = learnedCount ? "Teach more cards" : (isCatalog ? "Teach cards" : "Pick cards");
  actions.appendChild(siteButton(teachLabel, () => {
    HOA_SITES.startPicker(activeTab.id, result => {
      if (result.ok) {
        window.close();
      } else {
        setSiteStatus(result.error, "error");
      }
    });
  }));
  const toggleLabel = document.createElement("label");
  toggleLabel.className = "switch-row";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.setAttribute("role", "switch");
  toggle.checked = rule.bulkHide === true;
  toggle.addEventListener("change", () => saveSiteRules({ ...siteRules,
    [activeHost]: { ...siteRule(activeHost), enabled: true, bulkHide: toggle.checked }
  }, "Feed setting saved."));
  toggleLabel.appendChild(toggle);
  toggleLabel.appendChild(document.createTextNode(" Hide the whole feed"));
  actions.appendChild(toggleLabel);
  siteContent.appendChild(actions);
  appendFilterControls(siteContent, catalogRule);
  const links = document.createElement("div");
  links.className = "site-links";
  addLearnedControl(activeHost, isCatalog, rule, links);
  const disable = button("Turn off here", () => HOA_SITES.disableSite(activeHost, result => {
    if (result.ok) {
      siteRules = { ...siteRules, [activeHost]: { ...siteRule(activeHost), enabled: false } };
      renderSite();
    }
  }));
  disable.title = "Turn AddOrHide off on this site (your settings are kept)";
  disable.className = "link-button";
  links.appendChild(disable);
  const forgetSite = button("Forget this site", () => HOA_SITES.forgetSite(activeHost, result => {
    if (result.ok) {
      const next = { ...siteRules };
      delete next[activeHost];
      siteRules = next;
      renderSite();
    }
  }));
  forgetSite.className = "link-button";
  links.appendChild(forgetSite);
  siteContent.appendChild(links);
  schedulePositionBreathingRoom();
  };
  chrome.permissions.contains({ origins: [HOA_SITES.matchPattern(activeHost, activeScheme())] }, renderEnabled);
}

function loadSite() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    activeTab = tabs && tabs[0];
    try {
      activeHost = activeTab && activeTab.url ? new URL(activeTab.url).hostname.toLowerCase() : "";
    } catch (error) {
      activeHost = "";
    }
    chrome.storage.local.get({ [HOA.SITES_KEY]: {} }, result => {
      siteRules = result[HOA.SITES_KEY] && typeof result[HOA.SITES_KEY] === "object" ? result[HOA.SITES_KEY] : {};
      renderSite();
    });
  });
}

function render() {
  const listed = HOA.listedHidden(hidden);
  const count = listed.length;
  openHiddenButton.disabled = count === 0 && Object.keys(channels).length === 0;
  hiddenSummary.textContent = HOA.hiddenSummaryText(count, HOA.groupBySite(Object.fromEntries(listed)).length);
  let channelSummary = document.getElementById("hidden-channels-summary");
  if (Object.keys(channels).length) {
    if (!channelSummary) {
      channelSummary = document.createElement("p");
      channelSummary.id = "hidden-channels-summary";
      channelSummary.className = "muted";
      hiddenSummary.insertAdjacentElement("afterend", channelSummary);
    }
    const channelCount = Object.keys(channels).length;
    channelSummary.textContent = `${channelCount} hidden channel${channelCount === 1 ? "" : "s"}`;
  } else if (channelSummary) channelSummary.remove();
  // Added Videos works the same way: off while nothing is added, with the count underneath.
  const addedCount = Object.keys(added || {}).length;
  openAddedButton.disabled = addedCount === 0;
  addedSummary.textContent = HOA.addedCountText(addedCount, HOA.groupBySite(added).length);
  schedulePositionBreathingRoom();
}

openHiddenButton.addEventListener("click", () => {
  chrome.windows.getCurrent(win => chrome.runtime.sendMessage({
    type: "hoa-open-hidden",
    windowId: win && Number.isInteger(win.id) ? win.id : undefined
  }, () => {
    void chrome.runtime.lastError;
    window.close();
  }));
});

function openInThisWindow(url) {
  chrome.windows.getCurrent(currentWindow => {
    const details = { url };
    if (!chrome.runtime.lastError && currentWindow && Number.isInteger(currentWindow.id)) {
      details.windowId = currentWindow.id;
    }
    chrome.tabs.create(details);
  });
}

function openAddedPage() {
  chrome.windows.getCurrent(currentWindow => {
    const incognito = !chrome.runtime.lastError && currentWindow && currentWindow.incognito;
    const details = { url: incognito ? HOA.HOSTED_ADDED_URL : chrome.runtime.getURL("added.html") };
    if (!chrome.runtime.lastError && currentWindow && Number.isInteger(currentWindow.id)) {
      details.windowId = currentWindow.id;
    }
    chrome.tabs.create(details);
  });
}

openAddedButton.addEventListener("click", openAddedPage);
openOptionsButton.addEventListener("click", () => openInThisWindow(chrome.runtime.getURL("options.html")));
document.getElementById("github-link").addEventListener("click", event => {
  event.preventDefault();
  openInThisWindow("https://github.com/novadreamer/addorhide");
});
document.getElementById("support-link").addEventListener("click", event => {
  event.preventDefault();
  openInThisWindow(HOA.SUPPORT_URL);
});
themeToggle.addEventListener("click", () => {
  window.HOA_THEME.toggle();
  refreshThemeToggle();
});
pageDetailsToggle.addEventListener("click", openPageDetails);
refreshThemeToggle();
const themeMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
if (themeMedia) {
  const refreshOnMediaChange = () => refreshThemeToggle();
  if (themeMedia.addEventListener) {
    themeMedia.addEventListener("change", refreshOnMediaChange);
  } else if (themeMedia.addListener) {
    themeMedia.addListener(refreshOnMediaChange);
  }
}
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[HOA.THEME_KEY]) {
    refreshThemeToggle();
  }
  if (areaName === "local" && (changes[HOA.HIDDEN_KEY] || changes[HOA.ADDED_KEY] || changes[HOA.CHANNELS_KEY])) {
    HOA.readLists(lists => { hidden = lists.hidden; added = lists.added; channels = lists.channels; render(); });
  }
  if (areaName === "local" && changes[HOA.SITES_KEY]) {
    siteRules = changes[HOA.SITES_KEY].newValue && typeof changes[HOA.SITES_KEY].newValue === "object"
      ? changes[HOA.SITES_KEY].newValue : {};
    if (siteRulesWrittenHere) { siteRulesWrittenHere = false; return; }
    renderSite();
  }
});
HOA.readLists(lists => { hidden = lists.hidden; added = lists.added; channels = lists.channels; render(); });
loadSite();
