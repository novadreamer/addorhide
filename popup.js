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

let hidden = {};
let added = {};
let channels = {};
let activeTab = null;
let activeHost = "";

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
    } else if (reply.filteredHere) {
      line.textContent = `${reply.filteredHere} card${reply.filteredHere === 1 ? "" : "s"} hidden by your filters on this page.`;
    } else if (!reply.cards) {
      line.textContent = "Active, but no videos were recognised on this page. Try a list or home page, or use Pick cards.";
    } else if (!reply.overlays) {
      line.textContent = `Found ${reply.cards} video${reply.cards === 1 ? "" : "s"}, but none got buttons. Reload the page; if it stays like this, send the details below.`;
    } else {
      line.textContent = `Found ${reply.cards} video${reply.cards === 1 ? "" : "s"} on this page. Move your mouse over one to see Add and Hide.`;
    }
    // One compact line the user can read back when something does not work.
    const detailsBox = document.createElement("details");
    detailsBox.className = "page-details-box";
    const summary = document.createElement("summary");
    summary.textContent = "Details";
    detailsBox.appendChild(summary);
    const details = document.createElement("p");
    details.className = "muted page-details";
    const manifestVersion = chrome.runtime.getManifest().version;
    details.textContent = reply
      ? `Details: page script v${reply.version || "?"} (extension v${manifestVersion}), cards ${reply.cards}, buttons ${reply.overlays}`
        + `${reply.staleOverlays ? `, old buttons ${reply.staleOverlays}` : ""}, hidden here ${reply.hiddenHere || 0}, filtered here ${reply.filteredHere || 0}`
      : `Details: no page script answered (extension v${manifestVersion})`;
    detailsBox.appendChild(details);
    container.appendChild(detailsBox);
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

function setSiteStatus(message, kind = "") {
  siteStatus.textContent = message;
  siteStatus.className = `status ${kind}`.trim();
}

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
  const current = siteRule(activeHost);
  const kinds = HOA.normalizeHideKinds(current.hideKinds, categories.map(category => category.id));
  const keywords = HOA.normalizeKeywords(current.hideKeywords);
  const details = document.createElement("details");
  details.className = "hide-filters";
  const summary = document.createElement("summary");
  const labels = categories.filter(category => kinds.includes(category.id)).map(category => category.label);
  summary.textContent = `Hide on this site${labels.length || keywords.length ? ` — ${[...labels, keywords.length ? `${keywords.length} word${keywords.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ")}` : ""}`;
  details.appendChild(summary);
  const body = document.createElement("div");
  body.className = "hide-filters-body";
  const save = (nextKinds, nextKeywords) => saveSiteRules({ ...siteRules, [activeHost]: {
    ...siteRule(activeHost), enabled: siteRule(activeHost).enabled !== false,
    hideKinds: HOA.normalizeHideKinds(nextKinds, categories.map(category => category.id)),
    hideKeywords: HOA.normalizeKeywords(nextKeywords)
  } }, "Filter settings saved.");
  categories.forEach(category => {
    const label = document.createElement("label");
    label.className = "switch-row";
    label.title = category.hint;
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.setAttribute("role", "switch");
    toggle.checked = kinds.includes(category.id);
    toggle.addEventListener("change", () => save(toggle.checked ? [...kinds, category.id] : kinds.filter(id => id !== category.id), keywords));
    label.append(toggle, document.createTextNode(` ${category.label}`));
    body.appendChild(label);
  });
  const words = document.createElement("div");
  words.className = "filter-words";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Hide videos with these words";
  input.value = keywords.join(", ");
  input.setAttribute("aria-label", "Hide videos with these words, comma-separated");
  const saveButton = button("Save", () => save(kinds, input.value.split(",")));
  saveButton.className = "secondary-button";
  input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); save(kinds, input.value.split(",")); } });
  words.append(input, saveButton);
  body.appendChild(words);
  if (keywords.length) {
    const chips = document.createElement("div");
    chips.className = "filter-chips";
    keywords.forEach(word => {
      const chip = button(`× ${word}`, () => save(kinds, keywords.filter(value => value !== word)));
      chip.className = "filter-chip";
      chip.title = `Remove ${word}`;
      chips.appendChild(chip);
    });
    body.appendChild(chips);
  }
  details.appendChild(body);
  container.appendChild(details);
}

function renderSite() {
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
    appendFilterControls(siteContent, catalogRule);
    return;
  }
  const renderEnabled = granted => {
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
  const disable = button("Disable on this site", () => HOA_SITES.disableSite(activeHost, result => {
    if (result.ok) {
      siteRules = { ...siteRules, [activeHost]: { ...siteRule(activeHost), enabled: false } };
      renderSite();
    }
  }));
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
    renderSite();
  }
});
HOA.readLists(lists => { hidden = lists.hidden; added = lists.added; channels = lists.channels; render(); });
loadSite();
