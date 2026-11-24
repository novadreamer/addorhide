"use strict";

(() => {
  const HIDDEN_PREFS_KEY = "hiddenViewPrefs";
  const root = document.getElementById("hidden-root");
  let hidden = {};
  let channels = {};
  let watchedShown = {};
  let siteRules = {};
  let watchProgress = {};
  let prefs = {};
  let pageStatusText = "";
  let removeAllTimer = 0;
  let channelsRemoveTimer = 0;
  let removeAllButton = null;
  const siteRemoveConfirmations = new Map();
  const SORT_LABELS = { added: "Date hidden", published: "Date published", views: "Views", votes: "Votes", score: "Rating", duration: "Duration", title: "Name", year: "Year", channel: "Channel", site: "Site", "site-count": "Videos per site" };
  const GROUP_LABELS = { none: "No grouping", type: "By type", genre: "By genre", channel: "By channel", "added-date": "By date hidden", decade: "By decade", rating: "By rating", site: "By site" };
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
      if (!setting || typeof setting !== "object" || Array.isArray(setting)) return;
      if (site === "__page") {
        const page = {};
        if (setting.grouping === "tabs" || setting.grouping === "none") page.grouping = setting.grouping;
        if (["name", "recent", "count"].includes(setting.sort)) page.sort = setting.sort;
        if (setting.dir === "asc" || setting.dir === "desc") page.dir = setting.dir;
        if (typeof setting.selectedTab === "string") page.selectedTab = setting.selectedTab;
        if (Object.keys(page).length) result.__page = page;
        return;
      }
      const pref = {};
      if (setting.collapsed === true) pref.collapsed = true;
      if (["added", "published", "views", "votes", "score", "duration", "title", "year", "channel", "site", "site-count"].includes(setting.sort)) pref.sort = setting.sort;
      if (setting.dir === "asc" || setting.dir === "desc") pref.dir = setting.dir;
      if (["none", "type", "genre", "channel", "added-date", "decade", "rating", "site"].includes(setting.group)) pref.group = setting.group;
      if (Object.keys(pref).length) result[site] = pref;
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
    })).sort((left, right) => HOA.compareText(left.name, right.name)
      || HOA.compareText(left.site, right.site));
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

  function defaultDirection(sort) {
    return ["title", "channel", "site"].includes(sort) ? "asc" : "desc";
  }

  function pagePrefs() {
    const current = prefs.__page || {};
    return {
      grouping: current.grouping === "tabs" ? "tabs" : "none",
      sort: ["name", "recent", "count"].includes(current.sort) ? current.sort : "name",
      dir: current.dir === "asc" || current.dir === "desc" ? current.dir : current.sort === "recent" || current.sort === "count" ? "desc" : "asc",
      selectedTab: typeof current.selectedTab === "string" ? current.selectedTab : ""
    };
  }

  function pageDirection(sort) { return sort === "recent" || sort === "count" ? "desc" : "asc"; }

  function sortPageGroups(groups, page) {
    return groups.slice().sort((left, right) => {
      let comparison;
      if (page.sort === "recent") {
        const newest = group => Math.max(...group.entries.map(([, entry]) => Number(entry && entry.ts) || 0));
        comparison = newest(left) - newest(right);
      } else if (page.sort === "count") {
        comparison = left.entries.length - right.entries.length;
      } else {
        comparison = left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.site.localeCompare(right.site);
      }
      if (page.sort === "count" && comparison === 0) return HOA.compareText(left.name, right.name) || HOA.compareText(left.site, right.site);
      return comparison * (page.dir === "asc" ? 1 : -1);
    });
  }

  function makePageToolbar(pageToolbar, sections, page) {
    while (pageToolbar.firstChild) pageToolbar.firstChild.remove();
    pageToolbar.hidden = sections.length < 2;
    if (pageToolbar.hidden) return;
    const controls = element("div", "site-controls page-controls");
    const grouping = document.createElement("select"); grouping.id = "hidden-page-grouping";
    [["none", "List"], ["tabs", "Tabs"]].forEach(([value, label]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; option.selected = page.grouping === value;
      grouping.appendChild(option);
    });
    grouping.addEventListener("change", () => { setPrefs("__page", { grouping: grouping.value }); render(); });
    const groupingLabel = element("label", "page-control-label", "Group page"); groupingLabel.htmlFor = grouping.id;
    controls.append(groupingLabel, grouping);
    const sort = document.createElement("select"); sort.id = "hidden-page-sort"; sort.title = "Watched Videos always stays first";
    [["name", "Name"], ["recent", "Recently hidden"], ["count", "Most videos"]].forEach(([value, label]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; option.selected = page.sort === value;
      sort.appendChild(option);
    });
    sort.addEventListener("change", () => { setPrefs("__page", { sort: sort.value, dir: pageDirection(sort.value) }); render(); });
    const sortLabel = element("label", "page-control-label", "Sort"); sortLabel.htmlFor = sort.id;
    controls.append(sortLabel, sort);
    const direction = element("button", "direction-button", page.dir === "asc" ? "↑" : "↓"); direction.type = "button";
    direction.id = "hidden-page-direction"; direction.title = `${page.sort === "recent" ? "Recently hidden" : page.sort === "count" ? "Most videos" : "Name"}: ${page.dir === "asc" ? "ascending" : "descending"}`;
    direction.setAttribute("aria-label", direction.title);
    direction.addEventListener("click", () => { setPrefs("__page", { dir: page.dir === "asc" ? "desc" : "asc" }); render(); });
    controls.appendChild(direction); pageToolbar.appendChild(HOA.labelViewControls(controls));
  }

  const TAB_ROWS = 2;
  let closeMoreSites = null;

  function openMoreSites(more, button, hiddenSites, selectTab) {
    const panel = element("div", "added-more-panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "More sites");
    const search = document.createElement("input"); search.type = "search"; search.className = "added-more-search";
    search.placeholder = "Search sites"; search.setAttribute("aria-label", "Search sites");
    const list = element("div", "added-more-list");
    const none = element("p", "added-more-empty muted", "No sites match."); none.hidden = true;
    const outside = event => { if (!more.contains(event.target)) close(); };
    function close() {
      closeMoreSites = null; panel.remove(); button.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", outside, true);
    }
    const items = hiddenSites.map(section => {
      const item = element("button", "added-more-item"); item.type = "button";
      item.append(makeLogo(section.group.site, section.group.entries), element("span", "tab-name", section.name), element("span", "count-badge", String(section.group.entries.length)));
      item.addEventListener("click", () => { close(); selectTab(section.key); }); list.appendChild(item);
      return { item, name: `${section.name} ${section.key}`.toLowerCase() };
    });
    const shown = () => items.filter(entry => !entry.item.hidden).map(entry => entry.item);
    search.addEventListener("input", () => { const query = search.value.trim().toLowerCase(); items.forEach(entry => { entry.item.hidden = !entry.name.includes(query); }); none.hidden = shown().length !== 0; });
    panel.addEventListener("keydown", event => {
      const visible = shown(); const index = visible.indexOf(document.activeElement);
      if (event.key === "Escape") { event.preventDefault(); close(); button.focus(); }
      else if (event.key === "Enter" && event.target === search && visible[0]) { event.preventDefault(); visible[0].click(); }
      else if (event.key === "ArrowDown" && visible.length) { event.preventDefault(); visible[(index + 1) % visible.length].focus(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); (index <= 0 ? search : visible[index - 1]).focus(); }
    });
    panel.append(search, list, none); more.appendChild(panel);
    const overflow = panel.getBoundingClientRect().right - (document.documentElement.clientWidth - 16);
    if (overflow > 0) panel.style.left = `${-overflow}px`;
    button.setAttribute("aria-expanded", "true"); document.addEventListener("pointerdown", outside, true); closeMoreSites = close; search.focus();
  }

  function fitSiteTabs(tabBar, sections, selected, selectTab) {
    if (closeMoreSites) closeMoreSites();
    const rows = () => new Set(Array.from(tabBar.querySelectorAll(".added-tab-list > .added-page-tab, .added-more")).map(node => node.offsetTop)).size;
    if (rows() <= TAB_ROWS) return;
    // Follow the page sort: the sites that sort last move behind More sites first; the open tab stays visible.
    const movable = sections.filter(section => section.group && section.key !== selected).reverse();
    if (!movable.length) return;
    const more = element("div", "added-more"); const button = element("button", "added-page-tab added-more-button"); button.type = "button";
    button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-expanded", "false"); more.appendChild(button); tabBar.appendChild(more);
    const moved = [];
    for (const section of movable) {
      const tab = document.getElementById(`hidden-page-tab-${section.key.replace(/[^a-z0-9]+/gi, "-")}`);
      if (tab) tab.remove(); moved.push(section); button.textContent = `More sites (${moved.length})`; if (rows() <= TAB_ROWS) break;
    }
    button.addEventListener("click", () => { if (closeMoreSites) closeMoreSites(); else openMoreSites(more, button, sections.filter(section => moved.includes(section)), selectTab); });
  }

  let tabResizeTimer = 0;
  let tabWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === tabWidth) return;
    tabWidth = window.innerWidth;
    clearTimeout(tabResizeTimer);
    tabResizeTimer = window.setTimeout(() => { if (root.querySelector(".added-tab-bar")) render(); }, 150);
  });

  function setPrefs(site, changes) {
    prefs = { ...prefs, [site]: { ...(prefs[site] || {}), ...changes } };
    chrome.storage.local.set({ [HIDDEN_PREFS_KEY]: prefs }, () => void chrome.runtime.lastError);
    render();
  }

  function setCollapsed(site, collapsed) { setPrefs(site, { collapsed: Boolean(collapsed) }); }

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

  function restoreEntries(keys, message) {
    // A video listed here only because it was watched has no hidden record: showing it is what restores it.
    const watchedKeys = (keys || []).filter(key => !hidden[key] || HOA.isWatchedRecord(key, hidden[key], watchProgress));
    hidden = HOA.restoreKeys(hidden, keys);
    if (watchedKeys.length) watchedShown = HOA.markWatchedShown(watchedShown, watchedKeys);
    pageStatusText = message;
    render();
    HOA.writeLists({ hidden, ...(watchedKeys.length ? { watchedShown } : {}) }, () => {
      if (chrome.runtime.lastError) { pageStatusText = "Could not save the hidden videos list."; render(); }
    });
  }

  // Off this list, whichever kind of entry it is. Progress changes in other tabs, so it is read fresh.
  function removeEntries(keys, message) {
    const watchOnly = (keys || []).filter(key => !hidden[key]);
    if (!watchOnly.length) { writeHidden(HOA.removeFromList(hidden, keys), message); return; }
    HOA.readLists(lists => {
      const progress = { ...lists.watchProgress };
      watchOnly.forEach(key => { if (progress[key]) progress[key] = { ...progress[key], unlisted: true }; });
      hidden = HOA.removeFromList(hidden, keys);
      watchProgress = progress;
      pageStatusText = message;
      render();
      HOA.writeLists({ hidden, watchProgress: progress }, () => {
        if (chrome.runtime.lastError) { pageStatusText = "Could not save the hidden videos list."; render(); }
      });
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
    const href = HOA.openUrl(key);
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
    const type = entry.type || HOA.typeOf(key);
    if (type !== "video") info.appendChild(element("span", "hidden-kind", HOA.roleLabel(entry, type)));
    if (entry.reason === "watched" || entry.watched === true) {
      info.appendChild(element("span", "hidden-kind hidden-watched", "Watched"));
    }
    const rowStatus = element("span", "hidden-row-status", "");
    rowStatus.setAttribute("role", "status");
    info.appendChild(rowStatus);
    row.appendChild(info);
    const actions = element("div", "hidden-actions");
    const what = HOA.roleLabel(entry, entry.type || HOA.typeOf(key)).toLowerCase();
    const restore = iconButton("restore-button", RESTORE_ICON, `Restore: show this ${what} in the feed again`);
    restore.id = `hidden-restore-${index}`;
    restore.addEventListener("click", () => {
      rowStatus.textContent = "Returned to feed.";
      restoreEntries([key], "Returned to feed.");
    });
    const remove = iconButton("remove-button", REMOVE_ICON, `Remove from this list (the ${what} stays hidden)`);
    remove.id = `hidden-remove-${index}`;
    remove.addEventListener("click", () => {
      rowStatus.textContent = "Removed from the list; videos remain hidden.";
      removeEntries([key], "Removed from the list; videos remain hidden.");
    });
    actions.appendChild(restore);
    actions.appendChild(remove);
    row.appendChild(actions);
    return row;
  }

  function hiddenView(entries, prefKey, custom) {
    const current = prefs[prefKey] || {};
    const groups = custom && custom.groups ? custom.groups(entries) : HOA.availableGroups(entries);
    const group = groups.includes(current.group) ? current.group : "none";
    // Sorts may depend on the grouping in use ("Videos per site" only while grouped by site): pass the chosen one.
    const sorts = custom && custom.sorts ? custom.sorts(entries, [group]) : HOA.availableSorts(entries);
    const sort = sorts.includes(current.sort) ? current.sort : (sorts.includes("added") ? "added" : sorts[0] || "added");
    return { current, sorts, sort, dir: current.dir === "asc" || current.dir === "desc" ? current.dir : defaultDirection(sort),
      groups, group };
  }

  // "By site" headings (Watched Videos, Channels) carry the site's logo.
  function siteGroupLogo(subgroup) {
    const tile = makeLogo(subgroup.id, subgroup.entries);
    tile.classList.add("subgroup-logo");
    tile.setAttribute("aria-hidden", "true");
    return tile;
  }

  function makeSubgroup(subgroup, groupIndex, mode, listId) {
    const section = element("section", "hidden-subgroup");
    if (subgroup.label) {
      const heading = element("h3", "subgroup-heading", subgroup.label);
      if (mode === "site") heading.prepend(siteGroupLogo(subgroup));
      heading.appendChild(element("span", "count-badge", String(subgroup.entries.length)));
      section.appendChild(heading);
      HOA.collapsibleSubgroup(section, heading, `hidden|${listId}|${subgroup.label}`);
    }
    subgroup.entries.forEach(([key, entry], index) => section.appendChild(makeRow(key, entry, `${groupIndex}-${index}`)));
    return section;
  }

  function channelTitle(key, entry) {
    const handle = String(key).match(/\|\/([^/]+)/);
    const named = String(key).match(/name:(.+)$/);
    const fallback = handle ? handle[1] : named ? named[1] : "Hidden channel";
    const knownTitles = new Set(Object.values(hidden).filter(item => item && item.site === entry.site)
      .map(item => String(item.title || "").trim().toLocaleLowerCase()));
    const stored = String(entry.name || "").trim();
    return !stored || stored.length > 60 || knownTitles.has(stored.toLocaleLowerCase()) ? fallback : stored;
  }

  function makeGroup(group, groupIndex, options = {}) {
    const prefKey = group.watched ? "watched-videos" : group.site;
    // Watched Videos gathers every site, so it can be grouped by site (with logos) once it spans two.
    const watchedSites = group.watched ? new Set(group.entries.map(([key, entry]) => siteFor(key, entry))) : null;
    const view = hiddenView(group.entries, prefKey, watchedSites && watchedSites.size >= 2
      ? { groups(entries) { return HOA.availableGroups(entries).concat(["site"]); }, sorts(entries, groups) { return HOA.availableSorts(entries).concat(groups.includes("site") ? ["site-count"] : []); } } : undefined);
    const collapsed = view.current.collapsed === true;
    const section = element("section", "site-group");
    section.dataset.site = group.site;
    if (options.tabMode) {
      section.id = options.panelId;
      section.setAttribute("role", "tabpanel");
      section.setAttribute("aria-labelledby", options.tabId);
    }
    const slug = group.site.replace(/[^a-z0-9]+/gi, "-") || "site";
    const heading = element("div", "site-heading");
    const collapse = element("button", "collapse-button", collapsed ? "▸" : "▾");
    collapse.type = "button";
    collapse.id = `hidden-collapse-${slug}-${groupIndex}`;
    collapse.setAttribute("aria-expanded", String(!collapsed));
    collapse.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${group.name}`);
    collapse.addEventListener("click", () => toggleSite(prefKey));
    if (!options.tabMode) heading.appendChild(collapse);
    if (group.watched) {
      const watchedTile = element("div", "site-logo watched-logo"); watchedTile.innerHTML = WATCHED_ICON; heading.appendChild(watchedTile);
    } else {
      heading.appendChild(makeLogo(group.site, group.entries));
    }
    const identity = element("div", "site-identity");
    const name = element("h2", "site-name-toggle", group.name);
    name.tabIndex = 0;
    name.setAttribute("role", "button");
    name.addEventListener("click", () => toggleSite(prefKey));
    name.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSite(prefKey);
      }
    });
    identity.appendChild(name);
    identity.appendChild(element("span", "count-badge", String(group.entries.length)));
    heading.appendChild(identity);
    const controls = HOA.makeViewControls({ document, key: prefKey, idPrefix: "hidden", sorts: view.sorts, sort: view.sort,
      dir: view.dir, groups: view.groups, group: view.group, sortLabels: SORT_LABELS, groupLabels: GROUP_LABELS,
      defaultDirection, onChange(changes) { setPrefs(prefKey, changes); } });
    heading.appendChild(controls);
    // The group's buttons share the heading's last column.
    const headingActions = element("div", "site-heading-actions");
    const restoreAll = iconButton("restore-button group-restore-all", RESTORE_ALL_ICON,
      group.watched ? "Show all watched videos again" : `Show all ${group.name} videos again`);
    restoreAll.id = `hidden-restore-${group.watched ? "watched" : slug}-${groupIndex}`;
    restoreAll.addEventListener("click", () => restoreEntries(group.entries.map(([key]) => key), "Returned to feed."));
    headingActions.appendChild(restoreAll);
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
        removeEntries(keys, "Removed from the list; videos remain hidden.");
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
    if (!collapsed || options.tabMode) {
      const body = element("div", "site-group-body");
      // No preference is the old page: retain its stored newest-first ordering without adding headings.
      const siteCounts = view.sort === "site-count" ? group.entries.reduce((counts, [key, entry]) => { const site = siteFor(key, entry); counts.set(site, (counts.get(site) || 0) + 1); return counts; }, new Map()) : null;
      const sorted = view.sort === "site-count"
        ? group.entries.slice().sort((left, right) => (siteCounts.get(siteFor(left[0], left[1])) - siteCounts.get(siteFor(right[0], right[1]))) * (view.dir === "asc" ? 1 : -1) || HOA.compareText(HOA.siteDisplayName(siteFor(left[0], left[1])), HOA.siteDisplayName(siteFor(right[0], right[1]))) || (Number(right[1].ts) || 0) - (Number(left[1].ts) || 0) || HOA.compareText(left[1].title, right[1].title))
        : view.sort === "added" && view.dir === "desc" ? group.entries : HOA.sortEntries(group.entries, view.sort, view.dir);
      const subgroups = view.group === "none" ? [{ label: "", entries: sorted }]
        : HOA.orderGroupsBySort(HOA.groupEntries(sorted, view.group), sorted, view.group);
      subgroups.forEach(subgroup => body.appendChild(makeSubgroup(subgroup, groupIndex, view.group, prefKey)));
      section.appendChild(body);
    }
    return section;
  }

  function makeChannelsGroup(channelEntries, options = {}) {
    const channelSites = new Set(channelEntries.map(([, entry]) => entry && entry.site).filter(Boolean));
    const view = hiddenView(channelEntries, "channels", {
      sorts(entries, groups) { return HOA.availableSorts(entries).filter(sort => sort === "added" || sort === "title").concat(channelSites.size >= 2 ? ["site", ...(groups.includes("site") ? ["site-count"] : [])] : []); },
      groups() { return channelSites.size >= 2 ? ["none", "site"] : ["none"]; }
    });
    const collapsed = view.current.collapsed === true;
    const section = element("section", "site-group channels-group");
    section.dataset.site = "channels";
    if (options.tabMode) {
      section.id = options.panelId;
      section.setAttribute("role", "tabpanel");
      section.setAttribute("aria-labelledby", options.tabId);
    }
    const heading = element("div", "site-heading");
    const collapse = element("button", "collapse-button", collapsed ? "▸" : "▾");
    collapse.type = "button"; collapse.id = "hidden-collapse-channels"; collapse.setAttribute("aria-expanded", String(!collapsed));
    collapse.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} Channels`); collapse.addEventListener("click", () => toggleSite("channels"));
    if (!options.tabMode) heading.appendChild(collapse);
    const channelTile = element("div", "site-logo watched-logo"); channelTile.innerHTML = PERSON_ICON; heading.appendChild(channelTile);
    const identity = element("div", "site-identity");
    identity.appendChild(element("h2", "site-name-toggle", "Channels"));
    identity.appendChild(element("span", "count-badge", String(channelEntries.length)));
    heading.appendChild(identity);
    const controls = HOA.makeViewControls({ document, key: "channels", idPrefix: "hidden", sorts: view.sorts, sort: view.sort,
      dir: view.dir, groups: view.groups, group: view.group, sortLabels: SORT_LABELS, groupLabels: GROUP_LABELS,
      defaultDirection, onChange(changes) { setPrefs("channels", changes); } });
    heading.appendChild(controls);
    const headingActions = element("div", "site-heading-actions");
    const restoreAll = iconButton("restore-button group-restore-all", RESTORE_ALL_ICON, "Show all channels again");
    restoreAll.id = "hidden-restore-channels";
    restoreAll.addEventListener("click", () => {
      channels = {};
      HOA.writeLists({ channels });
      pageStatusText = "Channels visible again.";
      render();
    });
    headingActions.appendChild(restoreAll);
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
        HOA.writeLists({ channels });
        pageStatusText = "All channels are visible again.";
        render();
        return;
      }
      channelsRemoveTimer = window.setTimeout(() => { channelsRemoveTimer = 0; render(); }, 4000);
      render();
    });
    headingActions.appendChild(removeAll);
    heading.appendChild(headingActions);
    section.appendChild(heading);
    if (collapsed && !options.tabMode) return section;
    const body = element("div", "site-group-body");
    const siteCounts = view.sort === "site-count" ? channelEntries.reduce((counts, [key, entry]) => { const site = siteFor(key, entry); counts.set(site, (counts.get(site) || 0) + 1); return counts; }, new Map()) : null;
    const sorted = view.sort === "site-count" ? channelEntries.slice().sort((left, right) => (siteCounts.get(siteFor(left[0], left[1])) - siteCounts.get(siteFor(right[0], right[1]))) * (view.dir === "asc" ? 1 : -1) || HOA.compareText(HOA.siteDisplayName(siteFor(left[0], left[1])), HOA.siteDisplayName(siteFor(right[0], right[1]))) || (Number(right[1].ts) || 0) - (Number(left[1].ts) || 0) || HOA.compareText(left[1].title, right[1].title)) : view.sort === "added" && view.dir === "desc" ? channelEntries : view.sort === "site"
      ? channelEntries.slice().sort((left, right) => HOA.compareText(String(left[1].site || ""), String(right[1].site || "")) * (view.dir === "asc" ? 1 : -1))
      : HOA.sortEntries(channelEntries, view.sort, view.dir);
    const subgroups = view.group === "none" ? [{ label: "", entries: sorted }]
      : HOA.orderGroupsBySort(HOA.groupEntries(sorted, view.group), sorted, view.group);
    subgroups.forEach(subgroup => {
      const subsection = element("section", "hidden-subgroup");
      body.appendChild(subsection);
      if (subgroup.label) {
        const subgroupHeading = element("h3", "subgroup-heading", subgroup.label);
        if (view.group === "site") subgroupHeading.prepend(siteGroupLogo(subgroup));
        subgroupHeading.appendChild(element("span", "count-badge", String(subgroup.entries.length)));
        subsection.appendChild(subgroupHeading);
        HOA.collapsibleSubgroup(subsection, subgroupHeading, `hidden|channels|${subgroup.label}`);
      }
      subgroup.entries.forEach(([key, entry], index) => {
      const row = element("article", "hidden-row");
      const rowTile = element("div", "hidden-thumbnail-placeholder watched-logo"); rowTile.innerHTML = PERSON_ICON; row.appendChild(rowTile);
      const info = element("div", "hidden-info");
      const href = HOA.safeHref(entry.url);
      const displayName = channelTitle(key, entry);
      const title = element(href ? "a" : "span", "hidden-title", displayName);
      if (href) { title.href = href; title.addEventListener("click", event => { event.preventDefault(); openLink(href); }); }
      info.appendChild(title);
      info.appendChild(element("span", "hidden-kind hidden-channel", "Channel"));
      if (entry.site) info.appendChild(element("span", "hidden-kind", HOA.siteDisplayName(entry.site)));
      row.appendChild(info);
      const actions = element("div", "hidden-actions");
      const unhide = iconButton("restore-button", RESTORE_ICON, "Show this channel's videos again");
      unhide.id = `hidden-channel-row-${index}`;
      unhide.addEventListener("click", () => { channels = { ...channels }; delete channels[key]; HOA.writeLists({ channels }); pageStatusText = "Channel visible again."; render(); });
      actions.appendChild(unhide);
      row.appendChild(actions);
      subsection.appendChild(row);
      });
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
    // A video hidden by hand and watched later belongs with the watched ones.
    const entries = HOA.listedHidden(hidden).map(([key, entry]) => [key, HOA.isWatchedRecord(key, entry, watchProgress) ? { ...entry, watched: true } : entry]);
    const watchedEntries = entries.filter(([, entry]) => entry.reason === "watched" || entry.watched === true);
    const watchedKeys = new Set(watchedEntries.map(([key]) => key));
    // Watched but with no hidden record. Restored or removed ones stay off; a record of any kind speaks for itself.
    const watchOnly = HOA.watchedOnlyKeys(watchProgress, hidden, watchedShown, siteRules).map(key => [key, watchProgress[key]]).map(([key, entry]) => [key, { title: entry.title, thumb: entry.thumbnail || "", site: entry.site, kind: entry.kind || HOA.kindOf(key), ts: entry.updated, listed: false, watched: true, reason: "watched" }]);
    watchedEntries.push(...watchOnly);
    watchedEntries.sort((left, right) => (Number(right[1].ts) || 0) - (Number(left[1].ts) || 0) || HOA.compareText(left[0], right[0]));
    // Nothing is tracked as watched in a private window, so the Watched group stays out of it entirely: no tab or
    // section, and its videos are left out of the counts and of Restore all / Remove all there.
    // Opened from a private window, the page itself runs as a normal extension window: background.js adds "#private".
    const privateWindow = location.hash === "#private" || Boolean(typeof chrome !== "undefined" && chrome.extension && chrome.extension.inIncognitoContext);
    if (privateWindow) watchedEntries.length = 0;
    const everyEntry = privateWindow ? entries.filter(([, entry]) => entry.reason !== "watched" && entry.watched !== true) : [...entries, ...watchOnly];
    const groups = groupsFor(entries.filter(([, entry]) => entry.reason !== "watched" && entry.watched !== true));
    const channelEntries = Object.entries(channels).map(([key, entry]) => [key, { ...entry, title: channelTitle(key, entry) }]);
    const header = element("header", "hidden-header");
    const copy = element("div", "hidden-header-copy");
    const title = element("h1", "", "Hidden videos");
    title.appendChild(element("span", "count-badge", String(everyEntry.length)));
    copy.appendChild(title);
    const allSites = new Set(everyEntry.map(([key, entry]) => siteFor(key, entry)).filter(Boolean));
    const videoSummary = everyEntry.length
      ? `${everyEntry.length} hidden video${everyEntry.length === 1 ? "" : "s"} on ${allSites.size} website${allSites.size === 1 ? "" : "s"}`
      : "";
    const channelSummary = channelEntries.length ? `${channelEntries.length} hidden channel${channelEntries.length === 1 ? "" : "s"}` : "";
    copy.appendChild(element("p", "muted", [videoSummary, channelSummary].filter(Boolean).join(" · ") || "No hidden videos."));
    const actions = element("div", "page-actions hidden-header-actions");
    const restoreAll = iconButton("restore-button header-restore-all", RESTORE_ALL_ICON, "Restore all: show every video in the feed again");
    restoreAll.id = "hidden-restore-all";
    restoreAll.disabled = everyEntry.length === 0;
    restoreAll.addEventListener("click", () => {
      restoreEntries(everyEntry.map(([key]) => key), "Returned to feed.");
    });
    // Remove all (every site): a bin icon like the per-site ones; the first click opens the bin with a "?", a second
    // click within 4 s removes every video from the list (they stay hidden).
    removeAllButton = element("button", "site-remove-all header-remove-all");
    removeAllButton.type = "button";
    removeAllButton.id = "hidden-remove-all";
    removeAllButton.disabled = everyEntry.length === 0;
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
        removeEntries(everyEntry.map(([key]) => key), "Removed from the list; videos remain hidden.");
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
    const page = pagePrefs();
    const pageToolbar = element("div", "added-page-toolbar hidden-page-toolbar");
    root.appendChild(pageToolbar);
    if (!everyEntry.length && !channelEntries.length) {
      makePageToolbar(pageToolbar, [], page);
      root.appendChild(element("p", "empty-state hidden-empty muted", "No hidden videos or channels."));
    } else {
      const groupsRoot = element("div", "hidden-groups");
      const addGroup = make => { try { groupsRoot.appendChild(make()); } catch (error) { console.error("AddOrHide: could not render hidden group", error); } };
      const watchedGroup = watchedEntries.length ? { site: "watched-videos", name: "Watched Videos", entries: watchedEntries, watched: true } : null;
      const siteGroups = sortPageGroups(groups, page);
      const sections = [];
      if (watchedGroup) sections.push({ key: "watched-videos", name: watchedGroup.name, entries: watchedGroup.entries, watched: true, group: watchedGroup });
      if (channelEntries.length) sections.push({ key: "channels", name: "Channels", entries: channelEntries, channels: true });
      siteGroups.forEach(group => sections.push({ key: group.site, name: group.name, entries: group.entries, site: true, group }));
      makePageToolbar(pageToolbar, sections, page);
      const tabs = page.grouping === "tabs" && sections.length >= 2;
      if (tabs) {
        const selectedMissing = !!page.selectedTab && !sections.some(section => section.key === page.selectedTab);
        const selected = selectedMissing ? sections[0].key : (page.selectedTab || sections[0].key);
        // Show the first tab but do not save it: the remembered tab may exist only in another window (a private
        // window has no Continue Watching, Watch Later or Watched tab), and saving the fallback there made the
        // same page in a normal window jump away from that tab every time it was clicked.
        const tabBar = element("div", "added-tab-bar");
        const tabList = element("div", "added-tab-list"); tabList.setAttribute("role", "tablist"); tabList.setAttribute("aria-label", "Hidden Videos sections");
        const selectTab = key => {
          setPrefs("__page", { selectedTab: key }); render();
          const next = document.getElementById(`hidden-page-tab-${key.replace(/[^a-z0-9]+/gi, "-")}`);
          if (next) next.focus({ preventScroll: true });
        };
        sections.forEach((section, index) => {
          const slug = section.key.replace(/[^a-z0-9]+/gi, "-");
          const tab = element("button", "added-page-tab"); tab.type = "button"; tab.id = `hidden-page-tab-${slug}`;
          tab.setAttribute("role", "tab"); tab.setAttribute("aria-selected", String(section.key === selected));
          tab.setAttribute("aria-controls", `hidden-page-tabpanel-${slug}`); tab.tabIndex = section.key === selected ? 0 : -1;
          let icon;
          if (section.watched || section.channels) {
            icon = element("div", "site-logo watched-logo");
            icon.innerHTML = section.watched ? WATCHED_ICON : PERSON_ICON;
          } else {
            icon = makeLogo(section.group.site, section.group.entries);
          }
          icon.setAttribute("aria-hidden", "true");
          tab.append(icon, element("span", "tab-name", section.name), element("span", "count-badge", String(section.entries.length)));
          tab.addEventListener("click", () => selectTab(section.key));
          tab.addEventListener("keydown", event => {
            let nextIndex = index;
            if (event.key === "ArrowRight") nextIndex = (index + 1) % sections.length;
            else if (event.key === "ArrowLeft") nextIndex = (index + sections.length - 1) % sections.length;
            else if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = sections.length - 1;
            else return;
            event.preventDefault(); selectTab(sections[nextIndex].key);
          });
          tabList.appendChild(tab);
        });
        tabBar.appendChild(tabList); groupsRoot.appendChild(tabBar); fitSiteTabs(tabBar, sections, selected, selectTab);
        const active = sections.find(section => section.key === selected); const slug = active.key.replace(/[^a-z0-9]+/gi, "-");
        const options = { tabMode: true, tabId: `hidden-page-tab-${slug}`, panelId: `hidden-page-tabpanel-${slug}` };
        if (active.watched) addGroup(() => makeGroup(active.group, "watched", options));
        else if (active.channels) addGroup(() => makeChannelsGroup(active.entries, options));
        else addGroup(() => makeGroup(active.group, siteGroups.indexOf(active.group), options));
      } else {
        if (watchedGroup) addGroup(() => makeGroup(watchedGroup, "watched"));
        if (channelEntries.length) addGroup(() => makeChannelsGroup(channelEntries));
        siteGroups.forEach((group, index) => addGroup(() => makeGroup(group, index)));
      }
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
      watchProgress = lists.watchProgress;
      chrome.storage.local.get({ [HIDDEN_PREFS_KEY]: {}, [HOA.SITES_KEY]: {} }, result => {
        prefs = normalizePrefs(result[HIDDEN_PREFS_KEY]);
        siteRules = result[HOA.SITES_KEY] && typeof result[HOA.SITES_KEY] === "object" ? result[HOA.SITES_KEY] : {};
        render();
      });
    });
  }

  let unlocked = false;
  // Reopened from the other kind of window, only the address's "#private" changes: draw the page again for it.
  window.addEventListener("hashchange", () => { if (unlocked) refresh(); });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (!unlocked) return;
    if (areaName === "local" && (changes[HOA.HIDDEN_KEY] || changes[HOA.CHANNELS_KEY] || changes[HOA.WATCHED_SHOWN_KEY] || changes[HOA.PROGRESS_KEY] || changes[HIDDEN_PREFS_KEY] || changes[HOA.SITES_KEY])) {
      refresh();
    }
  });

  HOA_LOCK.gate("hidden", root, () => {
    unlocked = true;
    refresh();
  });
})();
