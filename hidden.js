"use strict";

(() => {
  const HIDDEN_PREFS_KEY = "hiddenViewPrefs";
  const root = document.getElementById("hidden-root");
  let hidden = {};
  let prefs = {};
  let pageStatusText = "";
  let removeAllTimer = 0;
  let removeAllButton = null;
  const siteRemoveConfirmations = new Map();
  const BIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6.5h16"/><path d="M9.5 6.5V4.8c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3v1.7"/><path d="M6.3 6.5l.9 12.6c.1 1 .9 1.9 2 1.9h5.6c1.1 0 1.9-.9 2-1.9l.9-12.6"/><path d="M10 10.5v6.5M14 10.5v6.5"/></svg>';

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function normalizePrefs(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    const result = {};
    Object.entries(value).forEach(([site, setting]) => {
      if (setting && typeof setting === "object" && setting.collapsed === true) {
        result[site] = { collapsed: true };
      }
    });
    return result;
  }

  function siteFor(key, entry) {
    return entry && typeof entry.site === "string" && entry.site.trim()
      ? entry.site.trim() : HOA.siteOf(key);
  }

  function groupsFor(entries) {
    const grouped = new Map();
    entries.forEach(([key, entry]) => {
      const site = siteFor(key, entry);
      if (!grouped.has(site)) {
        grouped.set(site, []);
      }
      grouped.get(site).push([key, entry]);
    });
    return Array.from(grouped.entries()).map(([site, siteEntries]) => ({
      site,
      name: HOA.siteDisplayName(site),
      entries: siteEntries
    })).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
      || left.site.localeCompare(right.site));
  }

  function makeMonogram(tile, site) {
    const monogram = HOA.siteMonogram(site);
    tile.style.setProperty("--h", monogram.hue);
    tile.appendChild(element("span", "site-monogram", monogram.letter));
  }

  function makeLogo(site, entries) {
    const tile = element("div", "site-logo");
    makeMonogram(tile, site);
    const iconEntry = entries.find(([, entry]) => entry && typeof entry.icon === "string" && entry.icon);
    const icon = HOA.safeHref(iconEntry ? iconEntry[1].icon : "")
      || HOA.safeHref(`https://${site}/favicon.ico`);
    if (!icon) {
      return tile;
    }
    const image = document.createElement("img");
    image.referrerPolicy = "no-referrer";
    image.alt = "";
    image.addEventListener("load", () => {
      if (!image.naturalWidth) {
        return;
      }
      tile.style.removeProperty("--h");
      while (tile.firstChild) {
        tile.firstChild.remove();
      }
      tile.appendChild(image);
    }, { once: true });
    image.src = icon;
    return tile;
  }

  function setCollapsed(site, collapsed) {
    prefs = { ...prefs, [site]: { collapsed: Boolean(collapsed) } };
    chrome.storage.local.set({ [HIDDEN_PREFS_KEY]: prefs }, () => void chrome.runtime.lastError);
    render();
  }

  function toggleSite(site) {
    setCollapsed(site, !(prefs[site] && prefs[site].collapsed === true));
  }

  function openLink(url) {
    chrome.windows.getLastFocused({ windowTypes: ["normal"] }, windowInfo => {
      const windowId = windowInfo && !chrome.runtime.lastError ? windowInfo.id : undefined;
      chrome.tabs.create({ url, windowId }, () => {
        if (windowInfo && Number.isInteger(windowInfo.id)) {
          chrome.windows.update(windowInfo.id, { focused: true });
        }
      });
    });
  }

  function makeThumbnail(entry) {
    const thumb = HOA.safeHref(entry && entry.thumb);
    if (!thumb) {
      return element("div", "hidden-thumbnail-placeholder");
    }
    const image = document.createElement("img");
    image.src = thumb;
    image.loading = "lazy";
    image.alt = "";
    return image;
  }

  function writeHidden(next, message) {
    hidden = next;
    pageStatusText = message;
    render();
    HOA.writeLists({ hidden }, () => {
      if (chrome.runtime.lastError) {
        pageStatusText = "Could not save the hidden videos list.";
        render();
      }
    });
  }

  function makeRow(key, entry, index) {
    const row = element("article", "hidden-row");
    row.appendChild(makeThumbnail(entry));
    const info = element("div", "hidden-info");
    const href = HOA.safeHref(key);
    if (href) {
      const title = element("a", "hidden-title", entry.title || key);
      title.href = href;
      title.addEventListener("click", event => {
        event.preventDefault();
        openLink(href);
      });
      info.appendChild(title);
    } else {
      info.appendChild(element("span", "hidden-title", entry.title || key));
    }
    if (entry.kind === "short") {
      info.appendChild(element("span", "hidden-kind", "Short"));
    }
    const rowStatus = element("span", "hidden-row-status", "");
    rowStatus.setAttribute("role", "status");
    info.appendChild(rowStatus);
    row.appendChild(info);
    const actions = element("div", "hidden-actions");
    const restore = element("button", "secondary-button", "Restore");
    restore.type = "button";
    restore.id = `hidden-restore-${index}`;
    restore.addEventListener("click", () => {
      rowStatus.textContent = "Returned to feed.";
      writeHidden(HOA.restoreKeys(hidden, [key]), "Returned to feed.");
    });
    const remove = element("button", "ghost-button danger-button", "Remove");
    remove.type = "button";
    remove.id = `hidden-remove-${index}`;
    remove.addEventListener("click", () => {
      rowStatus.textContent = "Removed from the list; videos remain hidden.";
      writeHidden(HOA.removeFromList(hidden, [key]), "Removed from the list; videos remain hidden.");
    });
    actions.appendChild(restore);
    actions.appendChild(remove);
    row.appendChild(actions);
    return row;
  }

  function makeGroup(group, groupIndex) {
    const collapsed = prefs[group.site] && prefs[group.site].collapsed === true;
    const section = element("section", "site-group");
    section.dataset.site = group.site;
    const slug = group.site.replace(/[^a-z0-9]+/gi, "-") || "site";
    const heading = element("div", "site-heading");
    const collapse = element("button", "collapse-button", collapsed ? "▸" : "▾");
    collapse.type = "button";
    collapse.id = `hidden-collapse-${slug}-${groupIndex}`;
    collapse.setAttribute("aria-expanded", String(!collapsed));
    collapse.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${group.name}`);
    collapse.addEventListener("click", () => toggleSite(group.site));
    heading.appendChild(collapse);
    heading.appendChild(makeLogo(group.site, group.entries));
    const identity = element("div", "site-identity");
    const name = element("h2", "site-name-toggle", group.name);
    name.tabIndex = 0;
    name.setAttribute("role", "button");
    name.addEventListener("click", () => toggleSite(group.site));
    name.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSite(group.site);
      }
    });
    identity.appendChild(name);
    identity.appendChild(element("span", "count-badge", String(group.entries.length)));
    heading.appendChild(identity);
    // A bin icon (the whole button); while it waits for the second click it reads "Are you sure?".
    const armed = siteRemoveConfirmations.has(group.site);
    const removeAll = element("button", `site-remove-all${armed ? " armed" : ""}`, armed ? "Are you sure?" : "");
    if (!armed) {
      removeAll.innerHTML = BIN_ICON;
    }
    removeAll.type = "button";
    removeAll.id = `hidden-remove-all-${slug}-${groupIndex}`;
    removeAll.title = armed ? `Click again to remove every ${group.name} video from this list (they stay hidden)`
      : `Remove all: every ${group.name} video from this list (they stay hidden)`;
    removeAll.setAttribute("aria-label", armed ? "Are you sure? Click again to remove them all" : `Remove all ${group.name} videos from this list`);
    removeAll.addEventListener("click", () => {
      if (siteRemoveConfirmations.has(group.site)) {
        const pendingTimer = siteRemoveConfirmations.get(group.site);
        clearTimeout(pendingTimer);
        siteRemoveConfirmations.delete(group.site);
        const keys = group.entries.map(([key]) => key);
        writeHidden(HOA.removeFromList(hidden, keys), "Removed from the list; videos remain hidden.");
        return;
      }
      const timer = window.setTimeout(() => {
        siteRemoveConfirmations.delete(group.site);
        render();
      }, 4000);
      siteRemoveConfirmations.set(group.site, timer);
      render();
    });
    heading.appendChild(removeAll);
    section.appendChild(heading);
    if (!collapsed) {
      const body = element("div", "site-group-body");
      group.entries.forEach(([key, entry], index) => body.appendChild(makeRow(key, entry, `${groupIndex}-${index}`)));
      section.appendChild(body);
    }
    return section;
  }

  function render() {
    const scrollTop = window.scrollY;
    const focused = document.activeElement;
    const focusId = focused && focused.id && root.contains(focused) ? focused.id : "";
    if (removeAllTimer) {
      clearTimeout(removeAllTimer);
      removeAllTimer = 0;
    }
    removeAllButton = null;
    while (root.firstChild) {
      root.firstChild.remove();
    }
    const entries = HOA.listedHidden(hidden);
    const groups = groupsFor(entries);
    const header = element("header", "hidden-header");
    const copy = element("div", "hidden-header-copy");
    const title = element("h1", "", "Hidden videos");
    title.appendChild(element("span", "count-badge", String(entries.length)));
    copy.appendChild(title);
    copy.appendChild(element("p", "muted", HOA.hiddenSummaryText(entries.length)));
    const actions = element("div", "page-actions hidden-header-actions");
    const restoreAll = element("button", "secondary-button", "Restore all");
    restoreAll.type = "button";
    restoreAll.disabled = entries.length === 0;
    restoreAll.addEventListener("click", () => {
      writeHidden(HOA.restoreKeys(hidden, entries.map(([key]) => key)), "Returned to feed.");
    });
    removeAllButton = element("button", "ghost-button danger-button", "Remove all");
    removeAllButton.type = "button";
    removeAllButton.disabled = entries.length === 0;
    removeAllButton.addEventListener("click", () => {
      if (removeAllTimer) {
        clearTimeout(removeAllTimer);
        removeAllTimer = 0;
        removeAllButton.textContent = "Remove all";
        writeHidden(HOA.removeFromList(hidden, entries.map(([key]) => key)), "Removed from the list; videos remain hidden.");
        return;
      }
      removeAllButton.textContent = "Confirm remove all?";
      removeAllTimer = window.setTimeout(() => {
        removeAllTimer = 0;
        if (removeAllButton) {
          removeAllButton.textContent = "Remove all";
        }
      }, 4000);
    });
    actions.appendChild(restoreAll);
    actions.appendChild(removeAllButton);
    header.appendChild(copy);
    header.appendChild(actions);
    root.appendChild(header);
    const status = element("p", "status hidden-status", pageStatusText);
    status.setAttribute("role", "status");
    root.appendChild(status);
    if (!entries.length) {
      root.appendChild(element("p", "empty-state hidden-empty muted", "No hidden videos."));
    } else {
      const groupsRoot = element("div", "hidden-groups");
      groups.forEach((group, index) => groupsRoot.appendChild(makeGroup(group, index)));
      root.appendChild(groupsRoot);
    }
    window.scrollTo(0, scrollTop);
    const nextFocus = focusId ? document.getElementById(focusId) : null;
    if (nextFocus) {
      nextFocus.focus({ preventScroll: true });
    }
  }

  function refresh() {
    HOA.readLists(lists => {
      hidden = lists.hidden;
      chrome.storage.local.get({ [HIDDEN_PREFS_KEY]: {} }, result => {
        prefs = normalizePrefs(result[HIDDEN_PREFS_KEY]);
        render();
      });
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes[HOA.HIDDEN_KEY] || changes[HIDDEN_PREFS_KEY])) {
      refresh();
    }
  });

  refresh();
})();
