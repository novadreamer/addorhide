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

let hidden = {};
let added = {};
let siteRules = {};

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
openAddedButton.addEventListener("click", openAddedPage);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  if (changes[HOA.HIDDEN_KEY] || changes[HOA.ADDED_KEY]) {
    HOA.readLists(lists => { hidden = lists.hidden; added = lists.added; renderHidden(); });
  }
  if (changes[HOA.SITES_KEY]) {
    loadRules();
  }
});

HOA.purgeLegacy();
HOA.readLists(lists => { hidden = lists.hidden; added = lists.added; renderHidden(); });
loadRules();
