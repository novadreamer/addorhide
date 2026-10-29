"use strict";

(() => {
  const HIDDEN_PREFS_KEY = "hiddenViewPrefs";
  const root = document.getElementById("hidden-root");
  let hidden = {};
  let channels = {};
  let watchedShown = {};
  let prefs = {};
  let pageStatusText = "";
  let removeAllTimer = 0;
  let ignoreOwnStorageChange = false;
  let channelsRemoveTimer = 0;
  let removeAllButton = null;
  const siteRemoveConfirmations = new Map();
  const RESTORE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 4.5 4 9.5l5 5"/><path d="M4.5 9.5H14a6 6 0 0 1 0 12h-3"/></svg>';
  const RESTORE_ALL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.5 4.5 3 9l4.5 4.5"/><path d="M12 4.5 7.5 9l4.5 4.5"/><path d="M8 9h7a6 6 0 0 1 0 12h-3"/></svg>';
  const REMOVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4"/></svg>';
  const OPEN_BIN_ICON = '<svg class="bin-open" viewBox="0 0 34 24" aria-hidden="true" focusable="false"><path d="M4.6 7.4 18.2 3.9"/><path d="M9.3 6.2 8.9 4.6c-.2-.7.2-1.4.9-1.6l2.4-.6c.7-.2 1.4.2 1.6.9l.4 1.5"/><path d="M4.4 10.5h15.2"/><path d="M5.4 10.5l.9 9.3c.1 1 .9 1.7 1.9 1.7h7.6c1 0 1.8-.7 1.9-1.7l.9-9.3"/><path d="M10 13.5v5M14 13.5v5"/><g transform="translate(20.6 0)"><path class="q" d="M3.2 8.6c0-2.2 1.7-3.6 3.8-3.6s3.6 1.3 3.6 3.2c0 2.6-3.4 2.9-3.4 5.6"/><circle class="q-dot" cx="7.2" cy="18.6" r="1.25"/></g></svg>';
  const BIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6.5h16"/><path d="M9.5 6.5V4.8c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3v1.7"/><path d="M6.3 6.5l.9 12.6c.1 1 .9 1.9 2 1.9h5.6c1.1 0 1.9-.9 2-1.9l.9-12.6"/><path d="M10 10.5v6.5M14 10.5v6.5"/></svg>';
  const PERSON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.2"/><path d="M5.2 20c.8-4 3.1-6 6.8-6s6 2 6.8 6"/></svg>';
  const WATCHED_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.8 12s3.2-5.2 9.2-5.2S21.2 12 21.2 12 18 17.2 12 17.2 2.8 12 2.8 12Z"/><path d="m9.6 12 1.6 1.6 3.3-3.5"/></svg>';

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
    ignoreOwnStorageChange = true;
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
    ignoreOwnStorageChange = true;
    HOA.writeLists({ hidden }, () => {
      if (chrome.runtime.lastError) {
        pageStatusText = "Could not save the hidden videos list.";
        render();
      }
    });
  }

  function restoreEntries(keys, message) {
    const watchedKeys = (keys || []).filter(key => hidden[key] && hidden[key].reason === "watched");
    hidden = HOA.restoreKeys(hidden, keys);
    if (watchedKeys.length) watchedShown = HOA.markWatchedShown(watchedShown, watchedKeys);
    pageStatusText = message;
    render();
    ignoreOwnStorageChange = true;
    HOA.writeLists({ hidden, ...(watchedKeys.length ? { watchedShown } : {}) }, () => {
      if (chrome.runtime.lastError) { pageStatusText = "Could not save the hidden videos list."; render(); }
    });
  }

  // Icon-only buttons: the icon is the button; a short tooltip (and the same text for screen readers) says what it does.
  function iconButton(className, icon, label) {
    const button = element("button", `icon-btn ${className}`);
    button.type = "button";
    button.innerHTML = icon;
    button.title = label;
    button.setAttribute("aria-label", label);
    return button;
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
    if (entry.reason === "watched" || entry.watched === true) {
      info.appendChild(element("span", "hidden-kind hidden-watched", "Watched"));
    }
    const rowStatus = element("span", "hidden-row-status", "");
    rowStatus.setAttribute("role", "status");
    info.appendChild(rowStatus);
    row.appendChild(info);
    const actions = element("div", "hidden-actions");
    const restore = iconButton("restore-button", RESTORE_ICON, "Restore: show this video in the feed again");
    restore.id = `hidden-restore-${index}`;
    restore.addEventListener("click", () => {
      rowStatus.textContent = "Returned to feed.";
      restoreEntries([key], "Returned to feed.");
    });
    const remove = iconButton("remove-button", REMOVE_ICON, "Remove from this list (the video stays hidden)");
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
    if (group.watched) {
      const watchedTile = element("div", "site-logo watched-logo"); watchedTile.innerHTML = WATCHED_ICON; heading.appendChild(watchedTile);
    } else {
      heading.appendChild(makeLogo(group.site, group.entries));
    }
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
    // The group's buttons share the heading's last column (the Watched group has two).
    const headingActions = element("div", "site-heading-actions");
    if (group.watched) {
      const restoreAll = iconButton("restore-button group-restore-all", RESTORE_ALL_ICON, "Show all watched videos again");
      restoreAll.id = `hidden-restore-watched-${groupIndex}`;
      restoreAll.addEventListener("click", () => restoreEntries(group.entries.map(([key]) => key), "Returned to feed."));
      headingActions.appendChild(restoreAll);
    }
    // A bin icon (the whole button); while it waits for the second click it shows an open bin with a "?".
    const armed = siteRemoveConfirmations.has(group.site);
    const removeAll = element("button", `site-remove-all${armed ? " armed" : ""}`);
    removeAll.innerHTML = armed ? OPEN_BIN_ICON : BIN_ICON;
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
    headingActions.appendChild(removeAll);
    heading.appendChild(headingActions);
    section.appendChild(heading);
    if (!collapsed) {
      const body = element("div", "site-group-body");
      group.entries.forEach(([key, entry], index) => body.appendChild(makeRow(key, entry, `${groupIndex}-${index}`)));
      section.appendChild(body);
    }
    return section;
  }

  function makeChannelsGroup(channelEntries) {
    const collapsed = prefs.channels && prefs.channels.collapsed === true;
    const section = element("section", "site-group channels-group");
    const heading = element("div", "site-heading");
    const collapse = element("button", "collapse-button", collapsed ? "▸" : "▾");
    collapse.type = "button"; collapse.id = "hidden-collapse-channels"; collapse.setAttribute("aria-expanded", String(!collapsed));
    collapse.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} Channels`); collapse.addEventListener("click", () => toggleSite("channels")); heading.appendChild(collapse);
    const channelTile = element("div", "site-logo watched-logo"); channelTile.innerHTML = PERSON_ICON; heading.appendChild(channelTile);
    const identity = element("div", "site-identity");
    identity.appendChild(element("h2", "site-name-toggle", "Channels"));
    identity.appendChild(element("span", "count-badge", String(channelEntries.length)));
    heading.appendChild(identity);
    const removeAll = element("button", "site-remove-all");
    removeAll.type = "button";
    removeAll.innerHTML = BIN_ICON;
    removeAll.title = "Unhide all channels";
    removeAll.setAttribute("aria-label", "Unhide all channels");
    const showRemoveAll = armed => { removeAll.classList.toggle("armed", armed); removeAll.innerHTML = armed ? OPEN_BIN_ICON : BIN_ICON; removeAll.title = armed ? "Click again to unhide all channels" : "Unhide all channels"; removeAll.setAttribute("aria-label", armed ? "Are you sure? Click again to unhide all channels" : "Unhide all channels"); };
    showRemoveAll(Boolean(channelsRemoveTimer));
    removeAll.addEventListener("click", () => {
      if (channelsRemoveTimer) {
        clearTimeout(channelsRemoveTimer); channelsRemoveTimer = 0;
        channels = {};
        ignoreOwnStorageChange = true;
        HOA.writeLists({ channels });
        pageStatusText = "All channels are visible again.";
        render();
        return;
      }
      channelsRemoveTimer = window.setTimeout(() => { channelsRemoveTimer = 0; render(); }, 4000);
      render();
    });
    heading.appendChild(removeAll);
    section.appendChild(heading);
    if (collapsed) return section;
    const body = element("div", "site-group-body");
    channelEntries.forEach(([key, entry], index) => {
      const row = element("article", "hidden-row");
      const rowTile = element("div", "hidden-thumbnail-placeholder watched-logo"); rowTile.innerHTML = PERSON_ICON; row.appendChild(rowTile);
      const info = element("div", "hidden-info");
      const href = HOA.safeHref(entry.url);
      const fallbackName = (() => { const handle = key.match(/\|\/(?:@)([^/]+)/); const named = key.match(/name:(.+)$/); return handle ? `@${handle[1]}` : named ? named[1] : "Hidden channel"; })();
      const title = element(href ? "a" : "span", "hidden-title", entry.name || fallbackName);
      if (href) { title.href = href; title.addEventListener("click", event => { event.preventDefault(); openLink(href); }); }
      info.appendChild(title);
      info.appendChild(element("span", "hidden-kind hidden-channel", "Channel"));
      row.appendChild(info);
      const actions = element("div", "hidden-actions");
      const unhide = iconButton("restore-button", RESTORE_ICON, "Show this channel's videos again");
      unhide.id = `hidden-channel-row-${index}`;
      unhide.addEventListener("click", () => { channels = { ...channels }; delete channels[key]; ignoreOwnStorageChange = true; HOA.writeLists({ channels }); pageStatusText = "Channel visible again."; render(); });
      actions.appendChild(unhide);
      row.appendChild(actions);
      body.appendChild(row);
    });
    section.appendChild(body);
    return section;
  }

  function render() {
    const scrollTop = window.scrollY;
    const focused = document.activeElement;
    const focusId = focused && focused.id && root.contains(focused) ? focused.id : "";
    removeAllButton = null;
    while (root.firstChild) {
      root.firstChild.remove();
    }
    const entries = HOA.listedHidden(hidden);
    const watchedEntries = entries.filter(([, entry]) => entry.reason === "watched" || entry.watched === true);
    const groups = groupsFor(entries.filter(([, entry]) => entry.reason !== "watched" && entry.watched !== true));
    const channelEntries = Object.entries(channels);
    const header = element("header", "hidden-header");
    const copy = element("div", "hidden-header-copy");
    const title = element("h1", "", "Hidden videos");
    title.appendChild(element("span", "count-badge", String(entries.length)));
    copy.appendChild(title);
    const allSites = new Set(entries.map(([key, entry]) => siteFor(key, entry)).filter(Boolean));
    copy.appendChild(element("p", "muted", HOA.hiddenSummaryText(entries.length, allSites.size)));
    const actions = element("div", "page-actions hidden-header-actions");
    const restoreAll = iconButton("restore-button header-restore-all", RESTORE_ALL_ICON, "Restore all: show every video in the feed again");
    restoreAll.id = "hidden-restore-all";
    restoreAll.disabled = entries.length === 0;
    restoreAll.addEventListener("click", () => {
      restoreEntries(entries.map(([key]) => key), "Returned to feed.");
    });
    // Remove all (every site): a bin icon like the per-site ones; the first click opens the bin with a "?", a second
    // click within 4 s removes every video from the list (they stay hidden).
    removeAllButton = element("button", "site-remove-all header-remove-all");
    removeAllButton.type = "button";
    removeAllButton.id = "hidden-remove-all";
    removeAllButton.disabled = entries.length === 0;
    const showRemoveAll = armed => {
      if (!removeAllButton) {
        return;
      }
      removeAllButton.classList.toggle("armed", armed);
      removeAllButton.innerHTML = armed ? OPEN_BIN_ICON : BIN_ICON;
      removeAllButton.title = armed ? "Click again to remove every video from this list (they stay hidden)"
        : "Remove all: every video from this list (they stay hidden)";
      removeAllButton.setAttribute("aria-label", armed ? "Are you sure? Click again to remove them all" : "Remove all videos from this list");
    };
    showRemoveAll(Boolean(removeAllTimer));
    removeAllButton.addEventListener("click", () => {
      if (removeAllTimer) {
        clearTimeout(removeAllTimer);
        removeAllTimer = 0;
        showRemoveAll(false);
        writeHidden(HOA.removeFromList(hidden, entries.map(([key]) => key)), "Removed from the list; videos remain hidden.");
        return;
      }
      showRemoveAll(true);
      removeAllTimer = window.setTimeout(() => {
        removeAllTimer = 0;
        showRemoveAll(false);
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
    if (!entries.length && !channelEntries.length) {
      root.appendChild(element("p", "empty-state hidden-empty muted", "No hidden videos or channels."));
    } else {
      const groupsRoot = element("div", "hidden-groups");
      if (channelEntries.length) groupsRoot.appendChild(makeChannelsGroup(channelEntries));
      if (watchedEntries.length) groupsRoot.appendChild(makeGroup({ site: "watched-videos", name: "Watched Videos", entries: watchedEntries, watched: true }, "watched"));
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
      channels = lists.channels;
      watchedShown = lists.watchedShown;
      chrome.storage.local.get({ [HIDDEN_PREFS_KEY]: {} }, result => {
        prefs = normalizePrefs(result[HIDDEN_PREFS_KEY]);
        render();
      });
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes[HOA.HIDDEN_KEY] || changes[HOA.CHANNELS_KEY] || changes[HOA.WATCHED_SHOWN_KEY] || changes[HIDDEN_PREFS_KEY])) {
      if (ignoreOwnStorageChange) { ignoreOwnStorageChange = false; return; }
      refresh();
    }
  });

  refresh();
})();
