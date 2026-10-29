"use strict";

const bulkHideInput = document.getElementById("bulk-hide");
const bulkHideTubiInput = document.getElementById("bulk-hide-tubi");
const addForm = document.getElementById("add-form");
const urlInput = document.getElementById("url-input");
const titleInput = document.getElementById("title-input");
const addButton = document.getElementById("add-button");
const statusElement = document.getElementById("status");
const hiddenCount = document.getElementById("hidden-count");
const hiddenRemovedCount = document.getElementById("hidden-removed-count");
const unhideAllButton = document.getElementById("unhide-all-button");
const hiddenStatus = document.getElementById("hidden-status");
const openAddedButton = document.getElementById("open-added-button");
const siteList = document.getElementById("site-list");
const siteEmpty = document.getElementById("site-empty");
const exportDataButton = document.getElementById("export-data-button");
const importDataButton = document.getElementById("import-data-button");
const importDataInput = document.getElementById("import-data-input");
const dataStatus = document.getElementById("data-status");
const filterSites = document.getElementById("filter-sites");

let hidden = {};
let added = {};
let siteRules = {};
let siteRulesWrittenHere = false;
const filterDuplicateNotes = {};

function siteRule(host) {
  return siteRules[host] && typeof siteRules[host] === "object" ? siteRules[host] : {};
}

function siteActionButton(label, action, disabled = false) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.className = "secondary-button";
  node.disabled = disabled;
  node.addEventListener("click", action);
  return node;
}

function pickedSelectors(rule) {
  return HOA.usablePicks(rule);
}

function renderSites() {
  while (siteList.firstChild) {
    siteList.firstChild.remove();
  }
  const hosts = Object.keys(siteRules);
  const BUILT_IN_HOSTS = ["www.youtube.com", "tubitv.com"];
  const catalogRules = HOA_CATALOG.rules.filter(rule => !rule.builtIn);
  const catalogHosts = catalogRules.map(rule => rule.hosts[0]);
  const extraBuiltIn = hosts.filter(host => HOA_SITES.isBuiltIn(host) && !BUILT_IN_HOSTS.includes(host)).sort();
  const storedCatalog = hosts.filter(host => HOA_SITES.isCatalog(host)).sort();
  const unconfiguredCatalog = catalogHosts.filter(host => !hosts.some(storedHost => {
    const storedRule = HOA_CATALOG.find(storedHost);
    const catalogRule = HOA_CATALOG.find(host);
    return storedRule && catalogRule && storedRule.id === catalogRule.id;
  }));
  const ordered = [...BUILT_IN_HOSTS, ...extraBuiltIn, ...storedCatalog,
    ...unconfiguredCatalog, ...hosts.filter(host => !HOA_SITES.isBuiltIn(host) && !HOA_SITES.isCatalog(host)).sort()];
  siteEmpty.hidden = true;
  ordered.forEach(host => {
    const rule = siteRule(host);
    const catalogRule = HOA_CATALOG.find(host);
    const catalog = HOA_SITES.isCatalog(host);
    const unconfigured = catalog && !Object.prototype.hasOwnProperty.call(siteRules, host);
    const row = document.createElement("div");
    row.className = "site-list-row page-actions";
    const label = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = HOA_SITES.isBuiltIn(host) ? (host.endsWith("tubitv.com") ? "Tubi" : "YouTube")
      : catalog ? catalogRule.name : host;
    label.appendChild(title);
    // Built-in sites (YouTube, Tubi) are active unless the user turned them off.
    const builtIn = HOA_SITES.isBuiltIn(host);
    const enabled = builtIn ? rule.enabled !== false : rule.enabled === true;
    const state = document.createElement("span");
    state.className = `site-state${enabled ? "" : " is-disabled"}`;
    state.textContent = unconfigured ? "Not enabled" : enabled ? "Enabled" : "Disabled";
    label.appendChild(state);
    const learned = document.createElement("span");
    learned.className = "site-learned";
    const taught = pickedSelectors(rule).length;
    learned.textContent = builtIn ? "Built-in rules" : catalog ? (taught ? "Supported + taught cards" : "Supported")
      : (taught ? "Cards taught" : "No cards taught yet");
    label.appendChild(learned);
    if (unconfigured) {
      const hint = document.createElement("span");
      hint.className = "muted";
      hint.textContent = "Open the popup on this site and choose Enable";
      label.appendChild(hint);
    }
    row.appendChild(label);
    if (unconfigured) {
      siteList.appendChild(row);
      return;
    }
    const learnedCount = pickedSelectors(rule).length;
    if (learnedCount) {
      const learnedSetting = document.createElement("span");
      learnedSetting.className = "site-setting";
      learnedSetting.textContent = `${learnedCount} kind${learnedCount === 1 ? "" : "s"} of card taught`;
      const forgetPicks = siteActionButton(learnedCount === 1 ? "Forget taught card" : "Forget taught cards", () => {
        const nextRule = { ...siteRule(host), pickedSelectors: [], pendingPick: !catalog };
        delete nextRule.cardSelector;
        siteRules = { ...siteRules, [host]: nextRule };
        chrome.storage.local.set({ [HOA.SITES_KEY]: siteRules }, () => loadRules());
      });
      learnedSetting.appendChild(forgetPicks);
      row.appendChild(learnedSetting);
    }
    const actions = document.createElement("span");
    actions.className = "page-actions";
    if (builtIn && !enabled) {
      actions.appendChild(siteActionButton("Enable", () => {
        siteRules = { ...siteRules, [host]: { ...rule, enabled: true } };
        chrome.storage.local.set({ [HOA.SITES_KEY]: siteRules }, () => loadRules());
      }));
    } else {
      actions.appendChild(siteActionButton("Disable", () => HOA_SITES.disableSite(host, () => loadRules()), !enabled));
    }
    const forget = siteActionButton(builtIn ? "Reset" : "Forget", () => HOA_SITES.forgetSite(host, () => loadRules()));
    forget.className = "ghost-button danger-button";
    actions.appendChild(forget);
    row.appendChild(actions);
    siteList.appendChild(row);
  });
}

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `status ${kind}`.trim();
}

function renderHidden() {
  const listed = HOA.listedHidden(hidden).length;
  const total = Object.keys(hidden).length;
  hiddenCount.textContent = listed;
  hiddenRemovedCount.textContent = total - listed;
}

function loadRules() {
  chrome.storage.local.get({ [HOA.SITES_KEY]: {} }, result => {
    siteRules = result[HOA.SITES_KEY] && typeof result[HOA.SITES_KEY] === "object" ? result[HOA.SITES_KEY] : {};
    bulkHideInput.checked = (siteRules["www.youtube.com"] || siteRules["youtube.com"] || {}).bulkHide === true;
    bulkHideTubiInput.checked = (siteRules["tubitv.com"] || siteRules["www.tubitv.com"] || {}).bulkHide === true;
    renderSites();
    renderFilterSites();
  });
}

function bindBulkHide(input, host) {
  input.addEventListener("change", () => {
    const current = siteRules[host] || {};
    siteRules = {
      ...siteRules,
      [host]: {
        enabled: current.enabled !== false,
        cardSelector: typeof current.cardSelector === "string" ? current.cardSelector : "",
        linkSelector: typeof current.linkSelector === "string" ? current.linkSelector : "",
        bulkHide: input.checked
      }
    };
    chrome.storage.local.set({ [HOA.SITES_KEY]: siteRules }, () => {
      setStatus(hiddenStatus, chrome.runtime.lastError ? "Could not save the feed setting." : "Feed setting saved.",
        chrome.runtime.lastError ? "error" : "success");
    });
  });
}

bindBulkHide(bulkHideInput, "www.youtube.com");
bindBulkHide(bulkHideTubiInput, "tubitv.com");

async function oembedTitle(key) {
  const parsed = new URL(key);
  const youtube = ["youtube.com", "www.youtube.com", "youtu.be"].includes(parsed.hostname);
  if (!youtube) {
    return "";
  }
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(key)}&format=json`);
    if (!response.ok) {
      return "";
    }
    const data = await response.json();
    return typeof data.title === "string" ? data.title.trim().slice(0, HOA.MAX_TITLE) : "";
  } catch (error) {
    return "";
  }
}

addForm.addEventListener("submit", async event => {
  event.preventDefault();
  const raw = urlInput.value.trim();
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const key = HOA.canonicalUrl(candidate);
  if (!key) {
    setStatus(statusElement, "Enter a valid http(s) video URL.", "error");
    return;
  }
  if (added[key]) {
    setStatus(statusElement, "That video is already added.", "error");
    return;
  }
  if (Object.keys(added).length >= HOA.MAX_ADDED) {
    setStatus(statusElement, "The Added list is full.", "error");
    return;
  }
  addButton.disabled = true;
  setStatus(statusElement, "Adding video...");
  const typedTitle = titleInput.value.trim().slice(0, HOA.MAX_TITLE);
  const title = await oembedTitle(key) || typedTitle || HOA.siteOf(key);
  const meta = { title, thumb: HOA.youtubeThumb(key), kind: HOA.kindOf(key), site: HOA.siteOf(key), ts: Date.now() };
  added = HOA.toggleAdded(added, key, meta);
  HOA.writeLists({ added }, () => {
    setStatus(statusElement, chrome.runtime.lastError ? "Could not save the video." : "Video added.", chrome.runtime.lastError ? "error" : "success");
  });
  urlInput.value = "";
  titleInput.value = "";
  addButton.disabled = false;
});

unhideAllButton.addEventListener("click", () => {
  if (!window.confirm("Unhide everything, including videos removed from the list?")) {
    return;
  }
  hidden = {};
  HOA.writeLists({ hidden }, () => setStatus(hiddenStatus, "Everything unhidden.", "success"));
});

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

function filterHost(catalogRule) {
  return catalogRule.id === "youtube" ? "www.youtube.com" : catalogRule.hosts[0];
}

function saveFilterRule(host, categories, kinds, keywords) {
  const wasWatched = HOA.normalizeHideKinds(siteRule(host).hideKinds, categories.map(category => category.id)).includes("watched");
  const nextKinds = HOA.normalizeHideKinds(kinds, categories.map(category => category.id));
  siteRules = { ...siteRules, [host]: {
    ...siteRule(host),
    hideKinds: nextKinds,
    hideKeywords: HOA.normalizeKeywords(keywords)
  } };
  siteRulesWrittenHere = true;
  chrome.storage.local.set({ [HOA.SITES_KEY]: siteRules }, () => renderFilterSites());
  if (wasWatched && !nextKinds.includes("watched")) HOA.clearAutoWatched(host);
}

function renderFilterSites() {
  const scrollTop = window.scrollY;
  const openSites = new Set(Array.from(filterSites.querySelectorAll("details[open]")).map(node => node.dataset.host));
  const focused = document.activeElement;
  const focusId = focused && focused.id ? focused.id : "";
  while (filterSites.firstChild) filterSites.firstChild.remove();
  HOA_CATALOG.rules.forEach(catalogRule => {
    const host = filterHost(catalogRule);
    const categories = Array.isArray(catalogRule.categories) ? catalogRule.categories : [];
    const rule = siteRule(host);
    const kinds = HOA.normalizeHideKinds(rule.hideKinds, categories.map(category => category.id));
    const keywords = HOA.normalizeKeywords(rule.hideKeywords);
    const details = document.createElement("details");
    details.className = "hide-filters";
    details.dataset.host = host;
    details.open = openSites.has(host);
    const summary = document.createElement("summary");
    const labels = categories.filter(category => kinds.includes(category.id)).map(category => category.label);
    summary.textContent = `${catalogRule.name}${labels.length || keywords.length ? ` — ${[...labels, keywords.length ? `${keywords.length} word${keywords.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ")}` : " — no filters"}`;
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "hide-filters-body";
    categories.forEach(category => {
      const label = document.createElement("label");
      label.className = "switch-row";
      label.title = category.hint;
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.setAttribute("role", "switch");
      toggle.checked = kinds.includes(category.id);
      toggle.addEventListener("change", () => saveFilterRule(host, categories,
        toggle.checked ? [...kinds, category.id] : kinds.filter(id => id !== category.id), keywords));
      label.append(toggle, document.createTextNode(` ${category.label}`));
      body.appendChild(label);
    });
    const words = document.createElement("div");
    words.className = "filter-words";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Hide videos with these words";
    input.disabled = keywords.length >= 10;
    if (input.disabled) input.placeholder = "10 of 10 words — remove one to add another";
    input.setAttribute("aria-label", `${catalogRule.name}: hide videos with these words`);
    const duplicateNote = document.createElement("p");
    duplicateNote.className = "filter-note muted";
    duplicateNote.textContent = filterDuplicateNotes[host] || "";
    const addWords = () => {
      const next = HOA.normalizeKeywords(input.value.split(","));
      const duplicate = next.some(word => keywords.some(value => value.localeCompare(word, undefined, { sensitivity: "accent" }) === 0));
      input.value = "";
      filterDuplicateNotes[host] = duplicate ? "Already in the list" : "";
      saveFilterRule(host, categories, kinds, [...keywords, ...next]);
      if (duplicate) window.setTimeout(() => { delete filterDuplicateNotes[host]; renderFilterSites(); }, 1600);
    };
    const save = siteActionButton("Add", addWords);
    input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addWords(); } });
    words.append(input, save);
    body.appendChild(words);
    const chips = document.createElement("div");
    chips.className = "filter-chips";
    keywords.forEach(word => {
      const chip = siteActionButton(`× ${word}`, () => saveFilterRule(host, categories, kinds, keywords.filter(value => value !== word)));
      chip.className = "filter-chip";
      chip.title = `Remove ${word}`;
      chips.appendChild(chip);
    });
    body.append(chips, duplicateNote);
    details.appendChild(body);
    filterSites.appendChild(details);
  });
  window.scrollTo(0, scrollTop);
  const nextFocus = focusId ? document.getElementById(focusId) : null;
  if (nextFocus) nextFocus.focus({ preventScroll: true });
}
openAddedButton.addEventListener("click", openAddedPage);

function storageSnapshot(callback) {
  chrome.storage.local.get({
    [HOA.HIDDEN_KEY]: {},
    [HOA.ADDED_KEY]: {},
    [HOA.CHANNELS_KEY]: {},
    [HOA.WATCHED_SHOWN_KEY]: {},
    [HOA.SITES_KEY]: {},
    [HOA.PREFS_KEY]: {}
  }, callback);
}

function exportData() {
  storageSnapshot(result => {
    const manifest = chrome.runtime.getManifest ? chrome.runtime.getManifest() : {};
    const backup = HOA.buildBackup({
      hidden: result[HOA.HIDDEN_KEY],
      added: result[HOA.ADDED_KEY],
      channels: result[HOA.CHANNELS_KEY],
      watchedShown: result[HOA.WATCHED_SHOWN_KEY],
      siteRules: result[HOA.SITES_KEY],
      prefs: result[HOA.PREFS_KEY]
    }, manifest.version || "", Date.now());
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `addorhide-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
    setStatus(dataStatus, "Your AddOrHide data was exported.", "success");
  });
}

function permissionPattern(host, rule) {
  return HOA_SITES.matchPattern(host, rule && rule.scheme === "http" ? "http" : "https");
}

function findMissingPermissions(rules, callback) {
  const hosts = Object.keys(rules || {}).filter(host => rules[host] && rules[host].enabled === true
    && !HOA_SITES.isBuiltIn(host));
  const missing = [];
  let index = 0;
  const next = () => {
    if (index >= hosts.length) {
      callback(missing);
      return;
    }
    const host = hosts[index++];
    if (!chrome.permissions || typeof chrome.permissions.contains !== "function") {
      missing.push(host);
      next();
      return;
    }
    chrome.permissions.contains({ origins: [permissionPattern(host, rules[host])] }, granted => {
      if (!granted) {
        missing.push(host);
      }
      next();
    });
  };
  next();
}

function importDataFile(file) {
  if (!file || file.size > 5 * 1024 * 1024) {
    setStatus(dataStatus, "Import failed: choose a JSON file no larger than 5 MB.", "error");
    return;
  }
  file.text().then(text => {
    const parsed = HOA.parseBackup(text);
    if (!parsed.ok) {
      setStatus(dataStatus, `Import failed: ${parsed.error}`, "error");
      return;
    }
    storageSnapshot(current => {
      const merged = HOA.mergeBackup({
        hidden: current[HOA.HIDDEN_KEY],
        added: current[HOA.ADDED_KEY],
        channels: current[HOA.CHANNELS_KEY],
        watchedShown: current[HOA.WATCHED_SHOWN_KEY],
        siteRules: current[HOA.SITES_KEY],
        prefs: current[HOA.PREFS_KEY]
      }, parsed.backup);
      const question = `Add ${merged.counts.added} videos to Added, ${merged.counts.hidden} hidden videos and settings for ${merged.counts.sites} sites? Nothing you already have is deleted.`;
      if (!window.confirm(question)) {
        return;
      }
      chrome.storage.local.set({
        [HOA.HIDDEN_KEY]: merged.hidden,
        [HOA.ADDED_KEY]: merged.added,
        [HOA.CHANNELS_KEY]: merged.channels,
        [HOA.WATCHED_SHOWN_KEY]: merged.watchedShown,
        [HOA.SITES_KEY]: merged.siteRules,
        [HOA.PREFS_KEY]: merged.prefs
      }, () => {
        if (chrome.runtime.lastError) {
          setStatus(dataStatus, "Import failed: could not save your data.", "error");
          return;
        }
        findMissingPermissions(parsed.backup.siteRules, missing => {
          const suffix = missing.length ? ` Enable on this site again for: ${missing.join(", ")}.` : "";
          setStatus(dataStatus, `Imported ${merged.counts.added} added, ${merged.counts.hidden} hidden and ${merged.counts.sites} site settings.${suffix}`, "success");
          hidden = merged.hidden;
          added = merged.added;
          siteRules = merged.siteRules;
          renderHidden();
          renderSites();
          renderFilterSites();
        });
      });
    });
  }).catch(() => setStatus(dataStatus, "Import failed: could not read the file.", "error"));
}

exportDataButton.addEventListener("click", exportData);
importDataButton.addEventListener("click", () => importDataInput.click());
importDataInput.addEventListener("change", () => {
  const file = importDataInput.files && importDataInput.files[0];
  importDataInput.value = "";
  importDataFile(file);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  if (changes[HOA.HIDDEN_KEY] || changes[HOA.ADDED_KEY]) {
    HOA.readLists(lists => { hidden = lists.hidden; added = lists.added; renderHidden(); });
  }
  if (changes[HOA.SITES_KEY]) {
    if (siteRulesWrittenHere) { siteRulesWrittenHere = false; return; }
    loadRules();
  }
});

HOA.purgeLegacy();
HOA.readLists(lists => { hidden = lists.hidden; added = lists.added; renderHidden(); });
loadRules();
