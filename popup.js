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

let hidden = {};
let added = {};
let channels = {};
let watchProgress = {};
let watchedShown = {};
let watchLater = {};
let activeTab = null;
let activeHost = "";
let siteRulesWrittenHere = false;
let rowsRefresh = 0;

function appendContinueSwitch(container) {
  const label = document.createElement("label");
  label.className = "switch-row continue-watching-switch";
  const input = document.createElement("input");
  input.type = "checkbox"; input.setAttribute("role", "switch");
  const text = document.createTextNode(" Auto-add to Continue Watching");
  label.append(input, text); container.appendChild(label);
  chrome.storage.local.get({ [HOA.WATCH_SETTINGS_KEY]: {} }, saved => {
    input.checked = HOA.normalizeWatchSettings(saved[HOA.WATCH_SETTINGS_KEY]).continueWatching === "auto";
  });
  input.addEventListener("change", () => {
    chrome.storage.local.get({ [HOA.WATCH_SETTINGS_KEY]: {} }, saved => {
      const current = HOA.normalizeWatchSettings(saved[HOA.WATCH_SETTINGS_KEY]);
      chrome.storage.local.set({ [HOA.WATCH_SETTINGS_KEY]: { ...current, continueWatching: input.checked ? "auto" : "off" } });
    });
  });
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
      line.textContent = `Found ${reply.cards} video${reply.cards === 1 ? "" : "s"}. Hover over one for Add and Hide.`;
    }
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
  const categories = catalogRule && Array.isArray(catalogRule.categories) ? catalogRule.categories : [{ id: "watched", label: "Watched", hint: "Videos you have watched" }, { id: "genres", label: "Rows by name", hint: "Hide rows by their heading — genres, collections, channels' picks" }];
  const typeCategories = categories.filter(category => category.id !== "genres").sort((left, right) => (right.id === "watched") - (left.id === "watched"));
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
      // One toggle: clear any active types, or select all when none are active.
      const anyOn = () => allIds.some(id => kinds.includes(id));
      const toggleAll = button("", () => { kinds = anyOn() ? [] : [...allIds]; save(); redraw(); });
      toggleAll.className = "filter-tool";
      const paintToggleAll = () => { if (typeCategories.length < 2) return; const on = anyOn(); const label = on ? "Unhide all types" : "Hide all types";
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
          toggle.addEventListener("change", () => { kinds = toggle.checked ? [...kinds, category.id] : kinds.filter(id => id !== category.id); save(); paintToggleAll(); }); label.append(toggle, document.createTextNode(` ${category.label}`)); body.appendChild(label); });
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
          let rowsComplete = false; let rowsScanned = false; let rowNote; let findRows; let findMessage = "";
          const drawGenreList = (append = false) => {
            if (!append) list.replaceChildren();
            if (!genreTitles.length) { if (!list.firstChild) list.appendChild(Object.assign(document.createElement("p"), { className: "filter-note muted", textContent: "Rows appear here as the page loads them." })); return; }
            list.querySelectorAll(".filter-note").forEach(node => node.remove()); const present = new Set(Array.from(list.querySelectorAll(".genre-check span")).map(node => node.textContent.toLocaleLowerCase()));
            genreTitles.filter(title => !present.has(title.toLocaleLowerCase())).forEach(title => { const label = document.createElement("label"); label.className = "genre-check"; const input = document.createElement("input"); input.type = "checkbox";
              input.checked = hideSections.some(value => value.localeCompare(title, undefined, { sensitivity: "accent" }) === 0);
              input.addEventListener("change", () => { hideSections = input.checked ? normalize([...hideSections, title]) : hideSections.filter(value => value.localeCompare(title, undefined, { sensitivity: "accent" }) !== 0); save(); paintGenreRow(genreTitles); paintAll(); });
              const text = document.createElement("span"); text.textContent = title; label.title = title; label.append(input, text); list.appendChild(label); });
          };
          const header = document.createElement("div"); header.className = "genres-panel-header"; header.appendChild(Object.assign(document.createElement("span"), { className: "muted", textContent: "Tick a genre to hide its row" }));
          const allGenres = button("", () => { const any = genreTitles.some(title => hideSections.some(value => value.localeCompare(title, undefined, { sensitivity: "accent" }) === 0)); hideSections = any ? hideSections.filter(value => !genreTitles.some(title => title.localeCompare(value, undefined, { sensitivity: "accent" }) === 0)) : normalize([...hideSections, ...genreTitles]); save(); drawGenreList(); paintGenreRow(genreTitles); paintAll(); }); allGenres.className = "filter-tool";
          const closeGenres = button("×", () => closeGenresPanel()); closeGenres.className = "filter-close"; closeGenres.title = "Close Genres"; header.append(allGenres, closeGenres); genreWrap.append(Object.assign(document.createElement("div"), { className: "genres-panel-inner" })); rowNote = Object.assign(document.createElement("p"), { className: "filter-note muted genres-live-note" });
          const rowWord = n => `${n} row${n === 1 ? "" : "s"}`; const pageWord = n => `${n} genre page${n === 1 ? "" : "s"}`;
          const findNote = reply => { if (!reply) return "This page didn't answer. Reload it and try again."; if (!reply.ok) return reply.reason === "busy" ? "Still finding rows. Give it a moment." : "No videos found on this page. Teach cards first, or open a page with videos."; if (!reply.rowsHere && !reply.rows.length) return "No rows found. This site doesn't put a heading above its rows, so they can't be listed by name."; const missed = (reply.blocked || 0) + (reply.empty || 0) + (reply.skipped || 0); if (reply.pages && !reply.read) return `Found ${rowWord(reply.rowsHere)} on this page. This site doesn't allow its genre pages to be read in the background. Open one and its rows will be added here.`; if (missed) return `Found ${rowWord(reply.rowsHere)}. ${pageWord(missed)} couldn't be read, so their rows are missing. Open one and its rows will be added here.`; if (!reply.pages) return `Found ${rowWord(reply.rowsHere)} on this page. It links to no genre pages, so only these are listed.`; return `Found ${rowWord(reply.rowsHere)} on this page and ${pageWord(reply.read)}.`; };
          findRows = button("Find all rows", () => { if (!activeTab || !Number.isInteger(activeTab.id)) return; findRows.disabled = true; findRows.textContent = "Finding rows…"; findMessage = "Finding rows..."; paintRowNote(); chrome.tabs.sendMessage(activeTab.id, { type: "hoa-find-rows" }, reply => { findMessage = chrome.runtime.lastError ? "This page didn't answer. Reload it and try again." : findNote(reply); rowsScanned = Boolean(reply && reply.ok); if (reply && reply.rows) { setTitles([...genreTitles, ...reply.rows]); drawGenreList(true); } paintRowNote(); findRows.disabled = false; findRows.textContent = "Find all rows"; }); }); findRows.className = "genres-find"; genreWrap.firstChild.append(header, rowNote, findRows, list);
          if (chrome.runtime.onMessage) chrome.runtime.onMessage.addListener(message => { if (message && message.type === "hoa-rows-progress" && findRows.disabled && genreWrap.isConnected) { findMessage = `Reading genre pages: ${message.done} of ${message.total}`; paintRowNote(); } });
          const paintAll = () => { const any = genreTitles.some(title => hideSections.some(value => value.localeCompare(title, undefined, { sensitivity: "accent" }) === 0)); const label = any ? "Unhide all genres" : "Hide all genres"; allGenres.innerHTML = any ? eye : eyeOff; allGenres.title = label; allGenres.setAttribute("aria-label", label); };
          const paintRowNote = () => { rowNote.textContent = rowsComplete ? "" : findMessage || (rowsScanned ? `${genreTitles.length} rows · from your last visit too` : `Rows load as you scroll — ${genreTitles.length} listed so far.`); rowNote.hidden = rowsComplete; findRows.hidden = rowsComplete; };
          const closeGenresPanel = () => { genresOpen = false; genreWrap.classList.remove("is-open"); genreRow.setAttribute("aria-expanded", "false"); panel.hoaCloseInner = null; if (rowsRefresh) { window.clearInterval(rowsRefresh); rowsRefresh = 0; } };
          const loadGenres = () => chrome.storage.local.get({ [HOA.SEEN_ROWS_KEY]: {} }, saved => {
            const stored = saved[HOA.SEEN_ROWS_KEY] || {}; const seen = normalize([...(stored[activeHost] || []), ...(stored[HOA.siteOf(`https://${activeHost}/`)] || [])]);   // older saves left out the www.
            const finish = (pageRows, reply) => { const pageTitles = normalize((pageRows || []).filter(row => row && row.listed).map(row => row.title)); const remembered = normalize([...seen, ...pageTitles]).slice(-300); const before = genreTitles.length;
              setTitles([...genreTitles, ...pageTitles, ...seen, ...hideSections]); drawGenreList(before > 0); paintAll(); rowsComplete = Boolean(reply && reply.rowsComplete); paintRowNote();
              if (!(activeTab && activeTab.incognito) && pageTitles.some(title => !normalize(seen).some(old => old.localeCompare(title, undefined, { sensitivity: "accent" }) === 0))) chrome.storage.local.set({ [HOA.SEEN_ROWS_KEY]: { ...(saved[HOA.SEEN_ROWS_KEY] || {}), [activeHost]: remembered } }); };
            if (activeTab && Number.isInteger(activeTab.id)) chrome.tabs.sendMessage(activeTab.id, { type: "hoa-status" }, reply => finish(reply && reply.rows, reply)); else finish([]);
          });
          const toggleGenres = () => { const open = !genresOpen; if (open) { if (rowsRefresh) window.clearInterval(rowsRefresh); genresOpen = true; genreWrap.classList.add("is-open"); genreRow.setAttribute("aria-expanded", "true"); panel.hoaCloseInner = () => { closeGenresPanel(); return true; }; loadGenres(); rowsRefresh = window.setInterval(() => { if (genresOpen && panel.isConnected) loadGenres(); }, 1000); window.setTimeout(() => { if (genresOpen && genreRow.scrollIntoView) genreRow.scrollIntoView({ block: "start", behavior: "smooth" }); }, 220); } else closeGenresPanel(); };
          paintGenreRow(genreTitles); body.append(genreRow, genreWrap);
          if (genresOpen) panel.hoaCloseInner = () => { closeGenresPanel(); return true; };
          // Fetch on the first popover draw so its count and tri-state are already known before opening the panel.
          loadGenres(); if (genresOpen) { if (rowsRefresh) window.clearInterval(rowsRefresh); rowsRefresh = window.setInterval(() => { if (genresOpen && panel.isConnected) loadGenres(); }, 1000); }
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
    appendContinueSwitch(siteContent);
    appendFilterControls(siteContent, catalogRule);
    return;
  }
  const renderEnabled = (granted, playerGranted = true) => {
  if (generation !== renderGeneration) return;
  clearNode(siteContent);
  if (!granted || rule.enabled !== true) {
    if (isCatalog) {
      const supported = document.createElement("p");
      supported.textContent = `${catalogRule.name} is supported`;
      siteContent.appendChild(supported);
    }
    if (HOA_SITES.playerHosts(activeHost).length) {
      const playerNote = document.createElement("p");
      playerNote.className = "muted";
      playerNote.textContent = "To track what you watch here, allow its video player";
      siteContent.appendChild(playerNote);
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
    return;
  }
  // The title and what has been taught share one line: the popup has no height to spare.
  const heading = document.createElement("p");
  heading.className = "site-title";
  heading.appendChild(Object.assign(document.createElement("span"), { textContent: isCatalog ? `${catalogRule.name} - supported site` : activeHost }));
  siteContent.appendChild(heading);
  const learnedCount = pickedSelectors(rule).length;
  // Labels follow what the user has actually done on this site. The heading already says a catalog site is supported.
  if (learnedCount || !isCatalog) {
    heading.appendChild(Object.assign(document.createElement("span"), { className: "site-title-note muted", textContent: learnedCount
      ? `Taught: ${learnedCount} card${learnedCount === 1 ? "" : "s"}`
      : "Pick the cards to finish setup" }));
  }
  appendPageStatus(siteContent);
  if (!playerGranted) {
    const playerNote = document.createElement("p");
    playerNote.className = "muted";
    playerNote.textContent = "To track what you watch here, allow its video player ";
    const allowPlayer = siteButton("Allow player", () => HOA_SITES.enablePlayers(activeHost, activeTab.id, result => {
      if (!result.ok) { setSiteStatus(result.error, "error"); return; }
      renderSite();
    }, activeScheme()), true);
    allowPlayer.classList.add("player-permission-button");
    playerNote.appendChild(allowPlayer);
    siteContent.appendChild(playerNote);
  }
  const teachLabel = learnedCount ? "Teach more cards" : (isCatalog ? "Teach cards" : "Pick cards");
  const teach = siteButton(teachLabel, () => {
    HOA_SITES.startPicker(activeTab.id, result => {
      if (result.ok) {
        window.close();
      } else {
        setSiteStatus(result.error, "error");
      }
    });
  });
  teach.title = "Show AddOrHide what a video looks like here";
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
  // Same order as a built-in site, with Teach between the switches and Hide on this site.
  siteContent.appendChild(toggleLabel);
  appendContinueSwitch(siteContent);
  const actions = document.createElement("div");
  actions.className = "page-actions teach-actions";
  actions.appendChild(teach);
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
  };
  chrome.permissions.contains({ origins: [HOA_SITES.matchPattern(activeHost, activeScheme())] }, granted => {
    const players = HOA_SITES.playerHosts(activeHost);
    if (!granted || !players.length) { renderEnabled(granted); return; }
    chrome.permissions.contains({ origins: players.map(host => HOA_SITES.matchPattern(host, activeScheme())) }, playerGranted => renderEnabled(granted, playerGranted));
  });
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
  if (rowsRefresh) { window.clearInterval(rowsRefresh); rowsRefresh = 0; }
  const listed = HOA.listedHidden(hidden);
  // The same videos the Hidden Videos page lists, watched ones included.
  const watchOnly = HOA.watchedOnlyKeys(watchProgress, hidden, watchedShown);
  const count = listed.length + watchOnly.length;
  openHiddenButton.disabled = count === 0 && Object.keys(channels).length === 0;
  hiddenSummary.textContent = HOA.hiddenSummaryText(count, new Set([...listed.map(([key]) => key), ...watchOnly].map(HOA.siteOf)).size);
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
  const addedEntries = Object.entries(added || {});
  const channelCount = addedEntries.filter(([key, entry]) => entry && (entry.kind === "channel" || HOA.kindOf(key) === "channel")).length;
  const categories = addedEntries.filter(([key, entry]) => entry && (entry.kind === "category" || HOA.kindOf(key) === "category")).map(([key]) => key);
  const categoryCount = categories.length;
  const videoAdded = Object.fromEntries(addedEntries.filter(([key, entry]) => !entry || ((entry.kind !== "channel" && HOA.kindOf(key) !== "channel") && (entry.kind !== "category" && HOA.kindOf(key) !== "category"))));
  const addedCount = Object.keys(videoAdded).length;
  const continuing = Object.keys(watchProgress).filter(key => watchProgress[key] && watchProgress[key].cw && !watchProgress[key].watched);
  const later = Object.keys(watchLater || {});
  openAddedButton.disabled = addedCount === 0 && channelCount === 0 && categoryCount === 0 && continuing.length === 0 && later.length === 0;
  // Just videos and sites: everything on the page except channels, each counted once, whichever list it is on.
  const videoKeys = new Set([...Object.keys(videoAdded), ...continuing, ...later, ...categories]);
  addedSummary.textContent = HOA.addedCountText(videoKeys.size, new Set(Array.from(videoKeys, HOA.siteOf)).size);
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
  if (areaName === "local" && (changes[HOA.HIDDEN_KEY] || changes[HOA.ADDED_KEY] || changes[HOA.CHANNELS_KEY] || changes[HOA.PROGRESS_KEY] || changes[HOA.WATCHED_SHOWN_KEY] || changes[HOA.WATCH_LATER_KEY])) {
    HOA.readLists(lists => { hidden = lists.hidden; added = lists.added; channels = lists.channels; watchProgress = lists.watchProgress; watchedShown = lists.watchedShown; watchLater = lists.watchLater; render(); });
  }
  if (areaName === "local" && changes[HOA.SITES_KEY]) {
    siteRules = changes[HOA.SITES_KEY].newValue && typeof changes[HOA.SITES_KEY].newValue === "object"
      ? changes[HOA.SITES_KEY].newValue : {};
    if (siteRulesWrittenHere) { siteRulesWrittenHere = false; return; }
    renderSite();
  }
});
HOA.readLists(lists => { hidden = lists.hidden; added = lists.added; channels = lists.channels; watchProgress = lists.watchProgress; watchedShown = lists.watchedShown; watchLater = lists.watchLater; render(); });
loadSite();
