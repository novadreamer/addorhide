"use strict";

const hiddenCount = document.getElementById("hidden-count");
const restoreAllButton = document.getElementById("restore-all-button");
const removeAllButton = document.getElementById("remove-all-button");
const popupList = document.getElementById("popup-list");
const popupEmpty = document.getElementById("popup-empty");
const popupStatus = document.getElementById("popup-status");
const openAddedButton = document.getElementById("open-added-button");
const openOptionsButton = document.getElementById("open-options-button");
const siteContent = document.getElementById("site-content");
const siteStatus = document.getElementById("site-status");

let hidden = {};
let removeConfirmTimer = 0;
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
    } else if (!reply.active) {
      line.textContent = "AddOrHide is off on this page.";
    } else if (!reply.cards) {
      line.textContent = "Active, but no videos were recognised on this page. Try a list or home page, or use Pick cards.";
    } else if (!reply.overlays) {
      line.textContent = `Found ${reply.cards} video${reply.cards === 1 ? "" : "s"}, but none got buttons. Reload the page; if it stays like this, send the details below.`;
    } else {
      line.textContent = `Found ${reply.cards} video${reply.cards === 1 ? "" : "s"} on this page. Move your mouse over one to see Add and Hide.`;
    }
    // One compact line the user can read back when something does not work.
    const details = document.createElement("p");
    details.className = "muted page-details";
    const manifestVersion = chrome.runtime.getManifest().version;
    details.textContent = reply
      ? `Details: page script v${reply.version || "?"} (extension v${manifestVersion}), cards ${reply.cards}, buttons ${reply.overlays}`
        + `${reply.staleOverlays ? `, old buttons ${reply.staleOverlays}` : ""}, hidden here ${reply.hiddenHere || 0}`
      : `Details: no page script answered (extension v${manifestVersion})`;
    container.appendChild(details);
  });
}

function activeScheme() {
  return activeTab && typeof activeTab.url === "string" && activeTab.url.startsWith("http://") ? "http" : "https";
}
let siteRules = {};

function setStatus(message, kind = "") {
  popupStatus.textContent = message;
  popupStatus.className = `status ${kind}`.trim();
}

function placeholder() {
  const node = document.createElement("div");
  node.className = "hoa-placeholder";
  node.setAttribute("aria-hidden", "true");
  return node;
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

function addLearnedControl(host, catalog, rule) {
  const count = pickedSelectors(rule).length;
  if (!count) {
    return;
  }
  const row = document.createElement("div");
  row.className = "site-setting";
  const text = document.createElement("span");
  text.textContent = `You taught ${count} kind${count === 1 ? "" : "s"} of card here`;
  row.appendChild(text);
  row.appendChild(siteButton(count === 1 ? "Forget taught card" : "Forget taught cards", () => {
    const nextRule = { ...siteRule(host), pickedSelectors: [], pendingPick: !catalog };
    delete nextRule.cardSelector;
    const next = { ...siteRules, [host]: nextRule };
    siteRules = next;
    chrome.storage.local.set({ [HOA.SITES_KEY]: next }, renderSite);
  }, true));
  siteContent.appendChild(row);
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
  status.textContent = isCatalog ? "Supported" : (learnedCount ? "Cards taught" : "Pick the cards to finish setup");
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
   addLearnedControl(activeHost, isCatalog, rule);
  const manage = document.createElement("div");
  manage.className = "page-actions";
  manage.appendChild(siteButton("Disable on this site", () => HOA_SITES.disableSite(activeHost, result => {
    if (result.ok) {
      siteRules = { ...siteRules, [activeHost]: { ...siteRule(activeHost), enabled: false } };
      renderSite();
    }
  }), true));
  manage.appendChild(siteButton("Forget this site", () => HOA_SITES.forgetSite(activeHost, result => {
    if (result.ok) {
      const next = { ...siteRules };
      delete next[activeHost];
      siteRules = next;
      renderSite();
    }
  }), true));
  siteContent.appendChild(manage);
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
  while (popupList.firstChild) {
    popupList.firstChild.remove();
  }
  const entries = HOA.listedHidden(hidden);
  hiddenCount.textContent = entries.length;
  hiddenCount.setAttribute("aria-label", `Hidden videos (${entries.length})`);
  restoreAllButton.disabled = entries.length === 0;
  removeAllButton.disabled = entries.length === 0;
  popupEmpty.hidden = entries.length !== 0;
  entries.forEach(([key, entry]) => {
    const row = document.createElement("div");
    row.className = "popup-row";
    if (entry.thumb) {
      const image = document.createElement("img");
      image.src = entry.thumb;
      image.alt = "";
      image.loading = "lazy";
      row.appendChild(image);
    } else {
      row.appendChild(placeholder());
    }
    const titleWrap = document.createElement("span");
    titleWrap.className = "popup-title";
    const href = HOA.safeHref(key);
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = entry.title;
      link.addEventListener("click", event => {
        event.preventDefault();
        openInThisWindow(href);
      });
      titleWrap.appendChild(link);
    } else {
      titleWrap.textContent = entry.title;
    }
    const site = document.createElement("span");
    site.className = "site-chip";
    site.textContent = entry.site;
    titleWrap.appendChild(site);
    if (entry.kind === "short") {
      const kind = document.createElement("span");
      kind.className = "popup-kind";
      kind.textContent = "Short";
      titleWrap.appendChild(kind);
    }
    row.appendChild(titleWrap);
    const actions = document.createElement("span");
    actions.className = "video-actions";
    const restoreButton = button("Restore", () => restore([key], row));
    restoreButton.className = "secondary-button";
    actions.appendChild(restoreButton);
    const removeButton = button("Remove", () => remove([key], row));
    removeButton.className = "ghost-button danger-button";
    actions.appendChild(removeButton);
    row.appendChild(actions);
    popupList.appendChild(row);
  });
}

function animateRow(row, action) {
  const reduced = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!row || reduced) {
    action();
    return;
  }
  let finished = false;
  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    row.removeEventListener("transitionend", onTransitionEnd);
    action();
  };
  const onTransitionEnd = event => {
    if (event.target === row && (event.propertyName === "opacity" || event.propertyName === "max-height")) {
      finish();
    }
  };
  row.addEventListener("transitionend", onTransitionEnd);
  row.classList.add("is-leaving");
  window.setTimeout(finish, 180);
}

function restore(keys, row) {
  animateRow(row, () => {
    hidden = HOA.restoreKeys(hidden, keys);
    HOA.writeLists({ hidden }, () => setStatus("Returned to feed."));
  });
}

function remove(keys, row) {
  animateRow(row, () => {
    hidden = HOA.removeFromList(hidden, keys);
    HOA.writeLists({ hidden }, () => setStatus("Removed from the list; videos remain hidden."));
  });
}

restoreAllButton.addEventListener("click", () => restore(HOA.listedHidden(hidden).map(([key]) => key)));
removeAllButton.addEventListener("click", () => {
  if (removeConfirmTimer) {
    clearTimeout(removeConfirmTimer);
    removeConfirmTimer = 0;
    remove(HOA.listedHidden(hidden).map(([key]) => key));
    removeAllButton.textContent = "Remove all";
    return;
  }
  removeAllButton.textContent = "Confirm remove all?";
  removeConfirmTimer = window.setTimeout(() => {
    removeConfirmTimer = 0;
    removeAllButton.textContent = "Remove all";
  }, 4000);
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
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes[HOA.HIDDEN_KEY] || changes[HOA.ADDED_KEY])) {
    HOA.readLists(lists => { hidden = lists.hidden; render(); });
  }
  if (areaName === "local" && changes[HOA.SITES_KEY]) {
    siteRules = changes[HOA.SITES_KEY].newValue && typeof changes[HOA.SITES_KEY].newValue === "object"
      ? changes[HOA.SITES_KEY].newValue : {};
    renderSite();
  }
});
HOA.readLists(lists => { hidden = lists.hidden; render(); });
loadSite();
