"use strict";

const HOA_ADDED = (() => {
  const SORT_LABELS = {
    added: "Date added",
    published: "Date published",
    views: "Views",
    votes: "Votes",
    score: "Rating",
    duration: "Duration",
    title: "A-Z",
    year: "Year",
    channel: "Channel",
    "last-watched": "Last watched",
    "time-left": "Time left",
    progress: "Progress",
    site: "Site"
  };
  const GROUP_LABELS = { none: "No grouping", type: "By type", genre: "By genre", channel: "By channel", "added-date": "By date added", decade: "By decade", rating: "By rating", site: "By site", "watched-date": "By date watched" };
  const TAG_TYPES = [
    ["video", "Video"], ["short", "Short"], ["playlist", "Playlist"], ["movie", "Movie"], ["tv", "TV"],
    ["live", "Live"], ["music", "Music"], ["sport", "Sport"], ["person", "Person"], ["category", "Category"], ["other", "Other"]
  ];
  const siteDeleteConfirmations = new Map();
  const OPEN_BIN_ICON = '<svg class="bin-open" viewBox="0 0 34 24" aria-hidden="true" focusable="false"><path d="M4.6 7.4 18.2 3.9"/><path d="M9.3 6.2 8.9 4.6c-.2-.7.2-1.4.9-1.6l2.4-.6c.7-.2 1.4.2 1.6.9l.4 1.5"/><path d="M4.4 10.5h15.2"/><path d="M5.4 10.5l.9 9.3c.1 1 .9 1.7 1.9 1.7h7.6c1 0 1.8-.7 1.9-1.7l.9-9.3"/><path d="M10 13.5v5M14 13.5v5"/><g transform="translate(20.6 0)"><path class="q" d="M3.2 8.6c0-2.2 1.7-3.6 3.8-3.6s3.6 1.3 3.6 3.2c0 2.6-3.4 2.9-3.4 5.6"/><circle class="q-dot" cx="7.2" cy="18.6" r="1.25"/></g></svg>';
  const TAG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 12.2V4.8c0-.7.6-1.3 1.3-1.3h7.4c.4 0 .7.1.9.4l7.6 7.6c.5.5.5 1.3 0 1.8l-7.4 7.4c-.5.5-1.3.5-1.8 0l-7.6-7.6c-.3-.2-.4-.5-.4-.9z"/><circle cx="8.2" cy="8.2" r="1.6"/></svg>';
  const REMOVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4"/></svg>';
  const BIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6.5h16"/><path d="M9.5 6.5V4.8c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3v1.7"/><path d="M6.3 6.5l.9 12.6c.1 1 .9 1.9 2 1.9h5.6c1.1 0 1.9-.9 2-1.9l.9-12.6"/><path d="M10 10.5v6.5M14 10.5v6.5"/></svg>';
  const PERSON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.2"/><path d="M5.2 20c.8-4 3.1-6 6.8-6s6 2 6.8 6"/></svg>';

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

  function labelFor(text, control) {
    const label = element("label", "visually-hidden", text);
    label.htmlFor = control.id;
    return label;
  }

  // Continue Watching has a slightly different set of sort keys from the shared site controls.
  function makeSelect(site, kind, values, selected) {
    const select = document.createElement("select");
    select.id = `added-${kind}-${site.replace(/[^a-z0-9]+/gi, "-")}`;
    values.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = kind === "sort" ? SORT_LABELS[value] : GROUP_LABELS[value];
      option.selected = value === selected;
      select.appendChild(option);
    });
    return select;
  }

  function defaultDirection(sort) {
    return ["title", "channel", "site"].includes(sort) ? "asc" : "desc";
  }

  function localDate(timestamp) {
    if (!Number.isFinite(timestamp)) {
      return "";
    }
    return new Date(timestamp).toLocaleDateString();
  }

  function mount(rootElement) {
    if (!rootElement || rootElement.__hoaAddedMount) {
      return;
    }
    rootElement.__hoaAddedMount = true;
    rootElement.className = "hoa-added-page";
    while (rootElement.firstChild) {
      rootElement.firstChild.remove();
    }

    let added = {};
    let watchProgress = {};
    let watchLater = {};
    let prefs = {};
    let editingKey = "";
    let pendingRefresh = false;
    const removing = new Set();

    const header = element("header", "added-header");
    const intro = element("div");
    intro.appendChild(element("p", "eyebrow", "Your collection"));
    intro.appendChild(element("h1", "", "Added Videos"));
    const introSummary = element("p", "muted", "Nothing saved yet.");
    intro.appendChild(introSummary);
    header.appendChild(intro);
    const headerActions = element("div", "added-header-actions");
    const support = element("a", "support-link");
    const heart = element("span", "", "♥");
    heart.setAttribute("aria-hidden", "true");
    support.append(heart, " Support");
    support.href = HOA.SUPPORT_URL;
    support.target = "_blank";
    support.rel = "noopener noreferrer";
    support.title = "Support AddOrHide on Ko-fi";
    headerActions.appendChild(support);
    const clearButton = element("button", "ghost-button danger-button", "Clear page");
    clearButton.type = "button";
    headerActions.appendChild(clearButton);
    header.appendChild(headerActions);
    rootElement.appendChild(header);

    const pageToolbar = element("div", "added-page-toolbar");
    pageToolbar.hidden = true;
    rootElement.appendChild(pageToolbar);

    const empty = element("p", "empty-state muted");
    empty.hidden = true;
    const emptyIcon = element("span", "empty-icon");
    emptyIcon.setAttribute("aria-hidden", "true");
    const emptySvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    emptySvg.setAttribute("viewBox", "0 0 32 32");
    emptySvg.setAttribute("focusable", "false");
    const emptyPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    emptyPath.setAttribute("d", "M6 9h20v17H6zM10 9V6h12v3M12 14v7M20 14v7");
    emptySvg.appendChild(emptyPath);
    emptyIcon.appendChild(emptySvg);
    empty.appendChild(emptyIcon);
    empty.appendChild(document.createTextNode("Nothing added yet. Use the Add button on a video."));
    rootElement.appendChild(empty);

    const groupsRoot = element("div", "added-groups");
    groupsRoot.setAttribute("aria-live", "polite");
    rootElement.appendChild(groupsRoot);

    function setPrefs(site, changes) {
      prefs = { ...prefs, [site]: { ...(prefs[site] || {}), ...changes } };
      HOA.writePrefs(prefs);
    }

    function makeMonogram(tile, site) {
      while (tile.firstChild) {
        tile.firstChild.remove();
      }
      const monogram = HOA.siteMonogram(site);
      tile.style.setProperty("--h", monogram.hue);
      tile.appendChild(element("span", "site-monogram", monogram.letter));
    }

    function makeLogo(group) {
      const tile = element("div", "site-logo");
      const icon = HOA.safeHref(group.icon) || HOA.safeHref(`https://${group.site}/favicon.ico`);
      // Show the letter tile immediately; swap in the site's own favicon only if it actually loads,
      // so a missing or slow favicon never leaves an empty tile.
      makeMonogram(tile, group.site);
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

    function makeMeta(entry) {
      const meta = element("div", "added-meta");
      if (entry.type && entry.type !== "video") {
        meta.appendChild(element("span", "meta-chip type-chip", HOA.typeLabel(entry.type)));
      }
      if (Number.isFinite(entry.views)) {
        meta.appendChild(element("span", "meta-text", HOA.formatViews(entry.views)));
      }
      if (Number.isFinite(entry.score)) {
        const score = HOA.formatScore(entry.score);
        if (score) {
          meta.appendChild(element("span", "meta-chip", `★ ${score}`));
        }
      }
      if (Number.isFinite(entry.votes)) {
        const votes = HOA.formatVotes(entry.votes);
        if (votes) {
          meta.appendChild(element("span", "meta-text", votes));
        }
      }
      if (Number.isFinite(entry.published)) {
        meta.appendChild(element("span", "meta-text", HOA.formatAge(entry.published, Date.now())));
      } else if (Number.isInteger(entry.year)) {
        meta.appendChild(element("span", "meta-text", String(entry.year)));
      }
      if (entry.rating) {
        meta.appendChild(element("span", "meta-chip", entry.rating));
      }
      if (Array.isArray(entry.genres)) {
        // A genre that just repeats the type chip ("Music" / "Music") adds nothing.
        const typeName = entry.type ? HOA.typeLabel(entry.type).toLowerCase() : "";
        const genres = entry.genres.filter(genre => genre.toLowerCase() !== typeName);
        genres.slice(0, 3).forEach(genre => meta.appendChild(element("span", "meta-chip", genre)));
        if (genres.length > 3) {
          const more = element("span", "meta-chip", `+${genres.length - 3} more`);
          more.title = genres.slice(3).join(", ");
          meta.appendChild(more);
        }
      }
      return meta;
    }

    function animateCard(card, action) {
      const reduced = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!card || reduced) {
        action();
        return;
      }
      let finished = false;
      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        card.removeEventListener("transitionend", onTransitionEnd);
        action();
      };
      const onTransitionEnd = event => {
        if (event.target === card && (event.propertyName === "opacity" || event.propertyName === "transform")) {
          finish();
        }
      };
      card.addEventListener("transitionend", onTransitionEnd);
      card.classList.add("is-leaving");
      window.setTimeout(finish, 180);
    }

    function closeEditor() {
      editingKey = "";
      pendingRefresh = false;
      refresh();
    }

    function makeTagEditor(key, entry, card) {
      const form = element("form", "tag-editor");
      form.addEventListener("submit", event => {
        event.preventDefault();
        const type = typeSelect.value;
        const genres = HOA.splitGenres(genresInput.value);
        HOA.readLists(lists => {
          if (!lists.added[key]) {
            closeEditor();
            return;
          }
          const nextEntry = { ...lists.added[key], type };
          if (genres.length) {
            nextEntry.genres = genres;
          } else {
            delete nextEntry.genres;
          }
          const nextAdded = { ...lists.added, [key]: nextEntry };
          HOA.writeLists({ added: nextAdded }, () => {
            closeEditor();
          });
        });
      });
      form.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeEditor();
        }
      });
      const typeField = element("div", "tag-field");
      const typeSelect = document.createElement("select");
      typeSelect.id = `tag-type-${key.replace(/[^a-z0-9]+/gi, "-")}`;
      TAG_TYPES.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = value === (entry.type || HOA.typeOf(key));
        typeSelect.appendChild(option);
      });
      typeField.appendChild(labelFor("Type", typeSelect));
      typeField.appendChild(typeSelect);
      const genresField = element("div", "tag-field");
      const genresInput = document.createElement("input");
      genresInput.type = "text";
      genresInput.placeholder = "Action, Comedy";
      genresInput.value = Array.isArray(entry.genres) ? entry.genres.join(", ") : "";
      genresInput.id = `tag-genres-${key.replace(/[^a-z0-9]+/gi, "-")}`;
      genresField.appendChild(labelFor("Genres", genresInput));
      genresField.appendChild(genresInput);
      form.appendChild(typeField);
      form.appendChild(genresField);
      const actions = element("div", "tag-actions");
      const save = element("button", "secondary-button", "Save");
      save.type = "submit";
      const cancel = element("button", "ghost-button", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", closeEditor);
      actions.appendChild(save);
      actions.appendChild(cancel);
      form.appendChild(actions);
      card.appendChild(form);
      typeSelect.focus();
    }

    function makeCard(key, entry, hasPlayable) {
      const href = HOA.openUrl(key);
      if (!href) {
        return null;
      }
      const card = element("article", "added-card");
      const player = HOA.playerFor(key, entry.title);
      const siteName = HOA.playerSiteName(key);
      const media = element(player ? "button" : "a", `card-media ${player ? "card-play" : "card-external"}`);
      if (player) {
        media.type = "button";
        media.setAttribute("aria-label", `Play ${entry.title} in the popup player`);
      } else {
        media.href = href;
        media.target = "_blank";
        media.rel = "noopener noreferrer";
        media.setAttribute("aria-label", `Open ${entry.title} on ${siteName}`);
      }
      if (entry.thumb) {
        const image = document.createElement("img");
        image.src = HOA.safeHref(entry.thumb) || "";
        image.alt = "";
        image.loading = "lazy";
        media.appendChild(image);
      } else {
        media.appendChild(element("div", "hoa-placeholder"));
      }
      if (Number.isInteger(entry.duration)) {
        const duration = element("span", "duration-badge", HOA.formatDuration(entry.duration));
        if (duration.textContent) {
          media.appendChild(duration);
        }
      }
      if (player || hasPlayable) {
        media.appendChild(element("span", "player-corner-label", player
          ? "▶ Popup player" : `↗ Opens on ${siteName}`));
      }
      if (player) {
        const playError = element("span", "card-play-error");
        playError.hidden = true;
        let playErrorTimer;
        const showPlayError = message => {
          playError.textContent = message || "Could not open popup player.";
          playError.hidden = false;
          clearTimeout(playErrorTimer);
          playErrorTimer = setTimeout(() => {
            playError.hidden = true;
          }, 4000);
        };
        media.addEventListener("click", event => {
          event.preventDefault();
          try {
            chrome.runtime.sendMessage({ type: "hoa-play", hash: player.hash }, response => {
              const runtimeError = chrome.runtime.lastError;
              if (runtimeError || !response || !response.ok) {
                showPlayError(runtimeError ? runtimeError.message : response && response.error);
              }
            });
          } catch (error) {
            showPlayError();
          }
        });
        card.appendChild(media);
        card.appendChild(playError);
      } else {
        card.appendChild(media);
      }
      const body = element("div", "added-card-body");
      const title = element("h3");
      const titleLink = element("a", "added-title", entry.title);
      titleLink.href = href;
      titleLink.title = `Added ${localDate(entry.ts)}`;
      title.appendChild(titleLink);
      body.appendChild(title);
      body.appendChild(makeMeta(entry));
      const addedTime = element("time", "added-date", `Added ${localDate(entry.ts)}`);
      addedTime.dateTime = Number.isFinite(entry.ts) ? new Date(entry.ts).toISOString() : "";
      const actions = element("div", "video-actions");
      const tag = element("button", "icon-btn tag-button");
      tag.type = "button";
      tag.innerHTML = TAG_ICON;
      const tagHelp = `Tag: set this ${HOA.typeLabel(entry.type || HOA.typeOf(key)).toLowerCase()}'s type and genres`;
      tag.title = tagHelp;
      tag.setAttribute("aria-label", tagHelp);
      tag.addEventListener("click", () => {
        if (editingKey) {
          return;
        }
        editingKey = key;
        makeTagEditor(key, entry, card);
        tag.hidden = true;
        remove.hidden = true;
      });
      const remove = element("button", "icon-btn remove-button");
      remove.type = "button";
      remove.innerHTML = REMOVE_ICON;
      remove.title = "Remove from Added Videos";
      remove.setAttribute("aria-label", "Remove from Added Videos");
      remove.addEventListener("click", () => {
        if (removing.has(key)) {
          return;
        }
        removing.add(key);
        animateCard(card, () => {
          HOA.readLists(lists => {
            const nextAdded = { ...lists.added };
            if (!Object.prototype.hasOwnProperty.call(nextAdded, key)) {
              removing.delete(key);
              refresh();
              return;
            }
            delete nextAdded[key];
            HOA.writeLists({ added: nextAdded }, () => {
              removing.delete(key);
              refresh();
            });
          });
        });
      });
      actions.appendChild(tag);
      actions.appendChild(remove);
      const footer = element("div", "card-footer");
      footer.appendChild(addedTime);
      footer.appendChild(actions);
      body.appendChild(footer);
      card.appendChild(body);
      return card;
    }

    function makeSubgroup(site, subgroup, hasPlayable) {
      const section = element("section", "added-subgroup");
      if (subgroup.label) {
        const heading = element("h3", "subgroup-heading");
        heading.appendChild(document.createTextNode(subgroup.label));
        heading.appendChild(element("span", "count-badge", String(subgroup.entries.length)));
        section.appendChild(heading);
      }
      const landscape = subgroup.entries.filter(pair => pair[1] && pair[1].type !== "short" && pair[1].kind !== "short");
      const shorts = subgroup.entries.filter(pair => pair[1] && (pair[1].type === "short" || pair[1].kind === "short"));
      const appendGrid = (entries, className) => {
        if (!entries.length) {
          return;
        }
        const grid = element("div", className);
        entries.forEach(([key, entry]) => {
          const card = makeCard(key, entry, hasPlayable);
          if (card) {
            grid.appendChild(card);
          }
        });
        section.appendChild(grid);
      };
      appendGrid(landscape, "added-card-grid landscape-grid");
      appendGrid(shorts, "added-card-grid short-grid");
      return section;
    }

    function renderSite(group, options = {}) {
      const sitePrefs = prefs[group.site] || {};
      const tabMode = !!options.tabMode;
      const sorts = HOA.availableSorts(group.entries);
      const sort = sorts.includes(sitePrefs.sort) ? sitePrefs.sort : (sorts.includes("added") ? "added" : sorts[0] || "added");
      const dir = sitePrefs.dir === "asc" || sitePrefs.dir === "desc" ? sitePrefs.dir : defaultDirection(sort);
      const groups = HOA.availableGroups(group.entries);
      const groupMode = groups.includes(sitePrefs.group) ? sitePrefs.group : "none";
      const section = element("section", "site-group");
      section.dataset.site = group.site;
      if (tabMode) {
        section.id = options.panelId;
        section.setAttribute("role", "tabpanel");
        section.setAttribute("aria-labelledby", options.tabId);
      }
      const slug = group.site.replace(/[^a-z0-9]+/gi, "-");
      const heading = element("div", "site-heading");
      const collapse = element("button", "collapse-button", sitePrefs.collapsed ? "▸" : "▾");
      collapse.type = "button";
      collapse.id = `added-collapse-${slug}`;
      collapse.setAttribute("aria-expanded", String(!sitePrefs.collapsed));
      collapse.setAttribute("aria-label", `${sitePrefs.collapsed ? "Expand" : "Collapse"} ${group.name}`);
      collapse.addEventListener("click", () => {
        setPrefs(group.site, { collapsed: !sitePrefs.collapsed });
        render();
      });
      if (!tabMode) heading.appendChild(collapse);
      heading.appendChild(makeLogo(group));
      const identity = element("div", "site-identity");
      const name = element("h2", "", group.name);
      identity.appendChild(name);
      identity.appendChild(element("span", "count-badge", String(group.entries.length)));
      const hasPlayable = group.entries.some(([key, entry]) => HOA.playerFor(key, entry && entry.title));
      if (!hasPlayable) {
        identity.appendChild(element("span", "muted player-site-note",
          `No popup player · opens on ${HOA.playerSiteName(group.site)}`));
      }
      heading.appendChild(identity);
      // Only controls that change something for this website are shown (see HOA.availableSorts/Groups).
      const controls = HOA.makeViewControls({ document, key: group.site, idPrefix: "added", sorts, sort, dir,
        groups, group: groupMode, sortLabels: SORT_LABELS, groupLabels: GROUP_LABELS, defaultDirection,
        onChange(changes) { setPrefs(group.site, changes); render(); } });
      // A bin icon (the whole button); while it waits for the second click it shows an open bin with a "?".
      const armed = siteDeleteConfirmations.has(group.site);
      const deleteAll = element("button", `site-delete-all${armed ? " armed" : ""}`);
      deleteAll.innerHTML = armed ? OPEN_BIN_ICON : BIN_ICON;
      deleteAll.type = "button";
      deleteAll.id = `added-delete-all-${slug}`;
      deleteAll.title = armed ? `Click again to delete every ${group.name} video from this page`
        : `Delete all: every ${group.name} video on this page`;
      deleteAll.setAttribute("aria-label", armed ? "Are you sure? Click again to delete them all" : `Delete all ${group.name} videos`);
      deleteAll.addEventListener("click", () => {
        if (siteDeleteConfirmations.has(group.site)) {
          const pendingTimer = siteDeleteConfirmations.get(group.site);
          clearTimeout(pendingTimer);
          siteDeleteConfirmations.delete(group.site);
          const keys = group.entries.map(([key]) => key);
          if (keys.includes(editingKey)) {
            editingKey = "";
          }
          HOA.readLists(lists => {
            const nextAdded = { ...lists.added };
            keys.forEach(key => delete nextAdded[key]);
            HOA.writeLists({ added: nextAdded }, refresh);
          });
          return;
        }
        const timer = window.setTimeout(() => {
          siteDeleteConfirmations.delete(group.site);
          render();
        }, 4000);
        siteDeleteConfirmations.set(group.site, timer);
        render();
      });
      controls.appendChild(deleteAll);
      heading.appendChild(controls);
      section.appendChild(heading);
      if (tabMode || !sitePrefs.collapsed) {
        const body = element("div", "site-group-body");
        const sorted = HOA.sortEntries(group.entries, sort, dir);
        HOA.orderGroupsBySort(HOA.groupEntries(sorted, groupMode), sorted, groupMode)
          .forEach(subgroup => body.appendChild(makeSubgroup(group.site, subgroup, hasPlayable)));
        section.appendChild(body);
      }
      return section;
    }

    // Continue Watching, Watch Later and Channels deliberately share structure,
    // controls, grouping and cards. Mode changes the backing list/details only.
    function renderPlaybackList(entries, mode, options = {}) {
      if (!entries.length) return null;
      const later = mode === "watch-later";
      const channelsList = mode === "channels";
      const savedList = channelsList;
      const prefKey = channelsList ? "added-channels" : (later ? "watch-later" : "continue-watching");
      const label = channelsList ? "Channels" : (later ? "Watch Later" : "Continue Watching");
      const current = prefs[prefKey] || {}; const tabMode = !!options.tabMode;
      const sortOptions = savedList ? ["added", "title", "site"] : (later ? ["added", "title", "site", "duration"] : ["last-watched", "time-left", "progress", "title", "site"]);
      const sort = sortOptions.includes(current.sort) ? current.sort : (later || savedList ? "added" : "last-watched");
      const dir = current.dir === "asc" || current.dir === "desc" ? current.dir : defaultDirection(sort);
      const siteCount = new Set(entries.map(([, entry]) => entry.site).filter(Boolean)).size;
      const groupOptions = ["none"]; if (siteCount >= 2) groupOptions.push("site");
      if (!later && !savedList && HOA.groupEntries(entries, "watched-date").length >= 2) groupOptions.push("watched-date");
      const groupMode = groupOptions.includes(current.group) ? current.group : "none";
      const section = element("section", `site-group ${channelsList ? "added-channels" : (later ? "watch-later" : "continue-watching")}`); section.dataset.site = prefKey;
      if (tabMode) { section.id = options.panelId; section.setAttribute("role", "tabpanel"); section.setAttribute("aria-labelledby", options.tabId); }
      const heading = element("div", "site-heading"); const collapse = element("button", "collapse-button", current.collapsed ? "▸" : "▾"); collapse.type = "button";
      collapse.setAttribute("aria-expanded", String(!current.collapsed)); collapse.setAttribute("aria-label", `${current.collapsed ? "Expand" : "Collapse"} ${label}`);
      collapse.addEventListener("click", () => { setPrefs(prefKey, { collapsed: !current.collapsed }); render(); });
      const identity = element("div", "site-identity"); identity.append(element("h2", "site-name-toggle", label), element("span", "count-badge", String(entries.length)));
      if (tabMode) heading.append(identity); else heading.append(collapse, identity);
      const controls = element("div", "site-controls"); const sortSelect = makeSelect(prefKey, "sort", sortOptions, sort);
      sortSelect.addEventListener("change", () => { setPrefs(prefKey, { sort: sortSelect.value, dir: defaultDirection(sortSelect.value) }); render(); });
      // One item has nothing to put in order.
      if (entries.length > 1) controls.append(labelFor("Sort by", sortSelect), sortSelect);
      const direction = element("button", "direction-button", dir === "asc" ? "↑" : "↓"); direction.type = "button"; direction.id = `added-direction-${prefKey}`;
      direction.title = `${SORT_LABELS[sort]}: ${dir === "asc" ? "ascending" : "descending"}`; direction.setAttribute("aria-label", direction.title);
      direction.addEventListener("click", () => { setPrefs(prefKey, { dir: dir === "asc" ? "desc" : "asc" }); render(); }); if (entries.length > 1) controls.appendChild(direction);
      if (groupOptions.length > 1) { const groupSelect = makeSelect(prefKey, "group", groupOptions, groupMode); groupSelect.addEventListener("change", () => { setPrefs(prefKey, { group: groupSelect.value }); render(); }); controls.append(labelFor("Group by", groupSelect), groupSelect); }
      const clear = element("button", `site-delete-all${siteDeleteConfirmations.has(prefKey) ? " armed" : ""}`); clear.type = "button"; clear.innerHTML = siteDeleteConfirmations.has(prefKey) ? OPEN_BIN_ICON : BIN_ICON;
      clear.title = siteDeleteConfirmations.has(prefKey) ? `Click again to remove every ${label} video` : `Remove all ${label} videos`; clear.setAttribute("aria-label", clear.title);
      clear.addEventListener("click", () => { if (!siteDeleteConfirmations.has(prefKey)) { siteDeleteConfirmations.set(prefKey, window.setTimeout(() => { siteDeleteConfirmations.delete(prefKey); render(); }, 4000)); render(); return; }
        clearTimeout(siteDeleteConfirmations.get(prefKey)); siteDeleteConfirmations.delete(prefKey); HOA.readLists(lists => { if (savedList) { const next = { ...lists.added }; entries.forEach(([key]) => delete next[key]); HOA.writeLists({ added: next }, refresh); } else if (later) { const next = { ...lists.watchLater }; entries.forEach(([key]) => delete next[key]); HOA.writeLists({ watchLater: next }, refresh); } else { const next = { ...lists.watchProgress }; entries.forEach(([key]) => { if (next[key]) delete next[key].cw; }); HOA.writeLists({ watchProgress: next }, refresh); } }); });
      controls.appendChild(clear); heading.appendChild(controls); section.appendChild(heading); if (current.collapsed && !tabMode) return section;
      const valueFor = entry => { if (savedList) return sort === "site" ? HOA.siteDisplayName(entry.site) : sort === "title" ? entry.title : Number(entry.ts) || 0; if (later) return sort === "duration" ? Number(entry.duration) || -1 : sort === "site" ? HOA.siteDisplayName(entry.site) : sort === "title" ? entry.title : Number(entry.ts) || 0;
        if (sort === "last-watched") return Number(entry.updated) || 0; if (sort === "time-left") return Math.max(0, Number(entry.duration) - Number(entry.position)); if (sort === "progress") return Number(entry.duration) > 0 ? Number(entry.position) / Number(entry.duration) : -1; return sort === "site" ? HOA.siteDisplayName(entry.site) : entry.title; };
      const sorted = entries.slice().sort((left, right) => { const a = valueFor(left[1]); const b = valueFor(right[1]); const compare = typeof a === "string" ? HOA.compareText(a, b) : a - b; return compare * (dir === "asc" ? 1 : -1) || HOA.compareText(left[1].title, right[1].title); });
      HOA.orderGroupsBySort(HOA.groupEntries(sorted, groupMode), sorted, groupMode).forEach(subgroup => { const body = element("section", "added-subgroup"); if (subgroup.label) { const name = element("h3", "subgroup-heading", subgroup.label); name.appendChild(element("span", "count-badge", String(subgroup.entries.length))); body.appendChild(name); }
        const grid = element("div", "added-card-grid landscape-grid"); subgroup.entries.forEach(([key, entry]) => { let href = HOA.openUrl(key) || key; if (!later && !savedList) try { const url = new URL(href); if (HOA.siteOf(key) === "youtube.com") url.searchParams.set("t", `${Math.max(0, Math.floor(entry.position - 5))}s`); href = url.href; } catch (error) { /* keep stored URL */ }
          const card = element("article", `added-card ${channelsList ? "channel-card" : (later ? "watch-later-card" : "continue-card")}`); const media = element("a", "card-media card-external"); media.href = href; media.target = "_blank"; media.rel = "noopener noreferrer"; media.setAttribute("aria-label", `${later || savedList ? "Open" : "Resume"} ${entry.title}`);
          const thumb = later || savedList ? entry.thumb : entry.thumbnail; if (thumb || HOA.youtubeThumb(key)) { const image = document.createElement("img"); image.src = HOA.safeHref(thumb) || HOA.youtubeThumb(key); image.alt = ""; image.loading = "lazy"; media.appendChild(image); } else { const placeholder = element("div", "hoa-placeholder"); if (channelsList) placeholder.innerHTML = PERSON_ICON; media.appendChild(placeholder); }
          if (!later && !savedList && !entry.live) { const bar = element("span", "continue-progress"); bar.style.setProperty("--hoa-progress", `${Math.min(100, entry.position / entry.duration * 100)}%`); media.appendChild(bar); } card.appendChild(media);
          const cardBody = element("div", "added-card-body"); const title = element("h3"); const link = element("a", "added-title", entry.title); link.href = href; title.appendChild(link); cardBody.appendChild(title);
          cardBody.appendChild(element("p", "added-meta", savedList ? HOA.siteDisplayName(entry.site) : entry.live ? `Live · ${HOA.siteDisplayName(entry.site)}` : later ? `${Number.isFinite(entry.duration) ? HOA.formatDuration(Math.floor(entry.duration)) + " · " : ""}${HOA.siteDisplayName(entry.site)}` : `${HOA.formatDuration(Math.max(0, Math.floor(entry.duration - entry.position)))} left · ${HOA.siteDisplayName(entry.site)}`));
          const actions = element("div", "video-actions"); const remove = element("button", "icon-btn remove-button"); remove.type = "button"; remove.innerHTML = REMOVE_ICON; remove.title = `Remove from ${label}`; remove.setAttribute("aria-label", remove.title);
          remove.addEventListener("click", () => HOA.readLists(lists => { if (savedList) { const next = { ...lists.added }; delete next[key]; HOA.writeLists({ added: next }, refresh); } else if (later) { const next = { ...lists.watchLater }; delete next[key]; HOA.writeLists({ watchLater: next }, refresh); } else { const next = { ...lists.watchProgress }; if (next[key]) { next[key] = { ...next[key] }; delete next[key].cw; } HOA.writeLists({ watchProgress: next }, refresh); } })); actions.appendChild(remove); cardBody.appendChild(actions); card.appendChild(cardBody); grid.appendChild(card); });
        body.appendChild(grid); section.appendChild(body); }); return section;
    }

    function renderContinueWatching(entries, options = {}) { return renderPlaybackList(entries, "continue-watching", options); }
    function renderWatchLater(entries, options = {}) { return renderPlaybackList(entries, "watch-later", options); }
    function renderChannels(entries, options = {}) { return renderPlaybackList(entries, "channels", options); }


    // Every change rebuilds the list. Keep the reader where they were: the website section they were working
    // in stays at the same height on screen (otherwise the page jumped to the top), and focus returns to
    // the same control.
    function pagePrefs() {
      const current = prefs.__page || {};
      return {
        grouping: current.grouping === "tabs" ? "tabs" : "none",
        sort: current.sort === "recent" ? "recent" : "name",
        dir: current.dir === "desc" || current.dir === "asc" ? current.dir : current.sort === "recent" ? "desc" : "asc",
        selectedTab: typeof current.selectedTab === "string" ? current.selectedTab : ""
      };
    }

    function pageDirection(sort) {
      return sort === "recent" ? "desc" : "asc";
    }

    function sortPageGroups(groups, page) {
      return groups.slice().sort((left, right) => {
        let comparison;
        if (page.sort === "recent") {
          const newest = group => Math.max(...group.entries.map(([, entry]) => Number(entry && entry.ts) || 0));
          comparison = newest(left) - newest(right);
        } else {
          comparison = left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
            || left.site.localeCompare(right.site);
        }
        return comparison * (page.dir === "asc" ? 1 : -1);
      });
    }

    function makeContinueTabIcon() {
      const icon = element("div", "site-logo continue-tab-icon");
      icon.setAttribute("aria-hidden", "true");
      icon.appendChild(element("span", "", "▶"));
      return icon;
    }

    function makeWatchLaterTabIcon() {
      const icon = element("div", "site-logo continue-tab-icon");
      icon.setAttribute("aria-hidden", "true");
      icon.appendChild(element("span", "", "◷"));
      return icon;
    }

    function makeChannelsTabIcon() {
      const icon = element("div", "site-logo continue-tab-icon");
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = PERSON_ICON;
      return icon;
    }


    // Many sites would push the videos down the page, so tabs stop at two rows. The lists always stay, then
    // the sites holding the most videos and the one in use; the rest move behind More sites.
    const TAB_ROWS = 2;
    let closeMoreSites = null;

    function fitSiteTabs(tabBar, sections, selected, selectTab) {
      if (closeMoreSites) closeMoreSites();
      const rows = () => new Set(Array.from(tabBar.querySelectorAll(".added-tab-list > .added-page-tab, .added-more")).map(node => node.offsetTop)).size;
      if (rows() <= TAB_ROWS) return;
      const movable = sections.filter(section => section.group && section.key !== selected)
        .sort((left, right) => left.group.entries.length - right.group.entries.length || right.name.localeCompare(left.name));
      if (!movable.length) return;
      const more = element("div", "added-more");
      const button = element("button", "added-page-tab added-more-button"); button.type = "button";
      button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-expanded", "false");
      more.appendChild(button); tabBar.appendChild(more);
      const moved = [];
      for (const section of movable) {
        const tab = document.getElementById(`added-tab-${section.key.replace(/[^a-z0-9]+/gi, "-")}`);
        if (tab) tab.remove();
        moved.push(section);
        button.textContent = `More sites (${moved.length})`;
        if (rows() <= TAB_ROWS) break;
      }
      const hiddenSites = sections.filter(section => moved.includes(section));
      button.addEventListener("click", () => {
        if (closeMoreSites) closeMoreSites();
        else openMoreSites(more, button, hiddenSites, selectTab);
      });
    }

    function openMoreSites(more, button, hiddenSites, selectTab) {
      const panel = element("div", "added-more-panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "More sites");
      const search = document.createElement("input"); search.type = "search"; search.className = "added-more-search";
      search.placeholder = "Search sites"; search.setAttribute("aria-label", "Search sites");
      const list = element("div", "added-more-list");
      const none = element("p", "added-more-empty muted", "No sites match."); none.hidden = true;
      const outside = event => { if (!more.contains(event.target)) close(); };
      function close() {
        closeMoreSites = null; panel.remove(); button.setAttribute("aria-expanded", "false");
        document.removeEventListener("pointerdown", outside, true);
      }
      const items = hiddenSites.map(section => {
        const item = element("button", "added-more-item"); item.type = "button";
        item.append(makeLogo(section.group), element("span", "tab-name", section.name), element("span", "count-badge", String(section.group.entries.length)));
        item.addEventListener("click", () => { close(); selectTab(section.key); });
        list.appendChild(item);
        return { item, name: `${section.name} ${section.key}`.toLowerCase() };
      });
      const shown = () => items.filter(entry => !entry.item.hidden).map(entry => entry.item);
      search.addEventListener("input", () => {
        const query = search.value.trim().toLowerCase();
        items.forEach(entry => { entry.item.hidden = !entry.name.includes(query); });
        none.hidden = shown().length !== 0;
      });
      panel.addEventListener("keydown", event => {
        const visible = shown(); const index = visible.indexOf(document.activeElement);
        if (event.key === "Escape") { event.preventDefault(); close(); button.focus(); }
        else if (event.key === "Enter" && event.target === search && visible[0]) { event.preventDefault(); visible[0].click(); }
        else if (event.key === "ArrowDown" && visible.length) { event.preventDefault(); visible[(index + 1) % visible.length].focus(); }
        else if (event.key === "ArrowUp") { event.preventDefault(); (index <= 0 ? search : visible[index - 1]).focus(); }
      });
      panel.append(search, list, none); more.appendChild(panel);
      // Near the right edge of the page the panel slides left rather than running off it.
      const overflow = panel.getBoundingClientRect().right - (document.documentElement.clientWidth - 16);
      if (overflow > 0) panel.style.left = `${-overflow}px`;
      button.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outside, true);
      closeMoreSites = close;
      search.focus();
    }

    let tabResizeTimer = 0; let tabWidth = window.innerWidth;
    window.addEventListener("resize", () => {
      if (window.innerWidth === tabWidth) return;
      tabWidth = window.innerWidth;
      clearTimeout(tabResizeTimer);
      tabResizeTimer = window.setTimeout(() => { if (groupsRoot.querySelector(".added-tab-bar")) render(); }, 150);
    });

    function pageLabel(text, control) {
      const label = element("label", "page-control-label", text);
      label.htmlFor = control.id;
      return label;
    }

    function makePageToolbar(sections, page) {
      while (pageToolbar.firstChild) pageToolbar.firstChild.remove();
      pageToolbar.hidden = sections.length < 2;
      if (pageToolbar.hidden) return;
      const controls = element("div", "site-controls page-controls");
      const grouping = document.createElement("select"); grouping.id = "added-page-grouping";
      [["none", "No grouping"], ["tabs", "Tabs"]].forEach(([value, label]) => {
        const option = document.createElement("option"); option.value = value; option.textContent = label;
        option.selected = page.grouping === value; grouping.appendChild(option);
      });
      grouping.addEventListener("change", () => { setPrefs("__page", { grouping: grouping.value }); render(); });
      controls.append(pageLabel("Group page", grouping), grouping);
      const sort = document.createElement("select"); sort.id = "added-page-sort"; sort.title = "Continue Watching always stays first";
      [["name", "Name"], ["recent", "Recently added"]].forEach(([value, label]) => {
        const option = document.createElement("option"); option.value = value; option.textContent = label;
        option.selected = page.sort === value; sort.appendChild(option);
      });
      sort.addEventListener("change", () => { setPrefs("__page", { sort: sort.value, dir: pageDirection(sort.value) }); render(); });
      controls.append(pageLabel("Sort", sort), sort);
      const direction = element("button", "direction-button", page.dir === "asc" ? "↑" : "↓"); direction.type = "button";
      direction.id = "added-page-direction"; direction.title = `${page.sort === "recent" ? "Recently added" : "Name"}: ${page.dir === "asc" ? "ascending" : "descending"}`;
      direction.setAttribute("aria-label", direction.title);
      direction.addEventListener("click", () => { setPrefs("__page", { dir: page.dir === "asc" ? "desc" : "asc" }); render(); });
      controls.appendChild(direction); pageToolbar.appendChild(controls);
    }

    function render() {
      const focused = document.activeElement;
      const focusId = focused && focused.id && (groupsRoot.contains(focused) || pageToolbar.contains(focused)) ? focused.id : "";
      const anchor = focused && focused.closest ? focused.closest(".site-group") : null;
      const anchorSite = anchor ? anchor.dataset.site : "";
      const anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;
      const scrollTop = window.scrollY;
      groupsRoot.style.minHeight = `${groupsRoot.offsetHeight}px`;
      while (groupsRoot.firstChild) {
        groupsRoot.firstChild.remove();
      }
      const channelEntries = Object.entries(added).filter(([key, entry]) => entry && (entry.kind === "channel" || HOA.kindOf(key) === "channel"));
      const videoAdded = Object.fromEntries(Object.entries(added).filter(([key, entry]) => !entry || (entry.kind !== "channel" && HOA.kindOf(key) !== "channel")));
      const groups = HOA.groupBySite(videoAdded);
      const continuing = Object.entries(watchProgress).filter(([, entry]) => entry && entry.cw && !entry.watched).sort((a, b) => b[1].updated - a[1].updated);
      const later = Object.entries(watchLater);
      const page = pagePrefs();
      const orderedGroups = sortPageGroups(groups, page);
      const videoCount = groups.reduce((count, group) => count + group.entries.length, 0);
      introSummary.textContent = videoCount || continuing.length || later.length || channelEntries.length ? `${[videoCount ? HOA.addedSummaryText(videoCount, groups.length).replace(/\.$/, "") : "", continuing.length ? `${continuing.length} to continue` : "", later.length ? `${later.length} to watch later` : "", channelEntries.length ? `${channelEntries.length} channel${channelEntries.length === 1 ? "" : "s"} added` : ""].filter(Boolean).join(" · ")}.`
        : "Nothing saved yet.";
      empty.hidden = groups.length !== 0 || continuing.length !== 0 || later.length !== 0 || channelEntries.length !== 0;
      // aria-disabled (not disabled) so the tooltip still shows on hover in every browser.
      clearButton.setAttribute("aria-disabled", String(videoCount === 0));
      clearButton.title = videoCount === 0 ? "Nothing to clear: no videos have been added yet"
        : "Clear page: delete every added video (asks first)";
      const sections = [];
      if (continuing.length) sections.push({ key: "continue-watching", name: "Continue Watching", entries: continuing, continueWatching: true });
      if (later.length) sections.push({ key: "watch-later", name: "Watch Later", entries: later, watchLater: true });
      if (channelEntries.length) sections.push({ key: "channels", name: "Channels", entries: channelEntries, channels: true });
      orderedGroups.forEach(group => sections.push({ key: group.site, name: group.name, group }));
      makePageToolbar(sections, page);
      const tabs = page.grouping === "tabs" && sections.length >= 2;
      if (tabs) {
        const selectedMissing = !!page.selectedTab && !sections.some(section => section.key === page.selectedTab);
        const selected = selectedMissing ? sections[0].key : (page.selectedTab || sections[0].key);
        if (selectedMissing) setPrefs("__page", { selectedTab: selected });
        const tabBar = element("div", "added-tab-bar");
        const tabList = element("div", "added-tab-list"); tabList.setAttribute("role", "tablist"); tabList.setAttribute("aria-label", "Added Videos sections");
        const selectTab = key => {
          setPrefs("__page", { selectedTab: key }); render();
          const next = document.getElementById(`added-tab-${key.replace(/[^a-z0-9]+/gi, "-")}`);
          if (next) next.focus({ preventScroll: true });
        };
        sections.forEach((section, index) => {
          const slug = section.key.replace(/[^a-z0-9]+/gi, "-");
          const tab = element("button", "added-page-tab"); tab.type = "button"; tab.id = `added-tab-${slug}`;
          tab.setAttribute("role", "tab"); tab.setAttribute("aria-selected", String(section.key === selected));
          tab.setAttribute("aria-controls", `added-tabpanel-${slug}`); tab.tabIndex = section.key === selected ? 0 : -1;
          tab.appendChild(section.continueWatching ? makeContinueTabIcon() : section.watchLater ? makeWatchLaterTabIcon() : section.channels ? makeChannelsTabIcon() : makeLogo(section.group));
          tab.appendChild(element("span", "tab-name", section.name));
          tab.appendChild(element("span", "count-badge", String(section.continueWatching || section.watchLater || section.channels ? section.entries.length : section.group.entries.length)));
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
        tabBar.appendChild(tabList); groupsRoot.appendChild(tabBar);
        fitSiteTabs(tabBar, sections, selected, selectTab);
        const active = sections.find(section => section.key === selected);
        const slug = active.key.replace(/[^a-z0-9]+/gi, "-");
        const options = { tabMode: true, tabId: `added-tab-${slug}`, panelId: `added-tabpanel-${slug}` };
        groupsRoot.appendChild(active.continueWatching ? renderContinueWatching(active.entries, options) : active.watchLater ? renderWatchLater(active.entries, options) : active.channels ? renderChannels(active.entries, options) : renderSite(active.group, options));
        if (selectedMissing && focusId) {
          const fallbackTab = document.getElementById(`added-tab-${selected.replace(/[^a-z0-9]+/gi, "-")}`);
          if (fallbackTab) fallbackTab.focus({ preventScroll: true });
        }
      } else {
        const continueSection = renderContinueWatching(continuing); if (continueSection) groupsRoot.appendChild(continueSection);
        const laterSection = renderWatchLater(later); if (laterSection) groupsRoot.appendChild(laterSection);
        const channelsSection = renderChannels(channelEntries); if (channelsSection) groupsRoot.appendChild(channelsSection);
        orderedGroups.forEach(group => groupsRoot.appendChild(renderSite(group)));
      }
      groupsRoot.style.minHeight = "";
      const nextAnchor = anchorSite
        ? Array.from(groupsRoot.querySelectorAll(".site-group")).find(section => section.dataset.site === anchorSite)
        : null;
      if (nextAnchor) {
        window.scrollBy(0, nextAnchor.getBoundingClientRect().top - anchorTop);
      } else {
        window.scrollTo(0, scrollTop);
      }
      const nextFocus = focusId ? document.getElementById(focusId) : null;
      if (nextFocus) {
        nextFocus.focus({ preventScroll: true });
      }
    }

    function refresh() {
      HOA.readLists(lists => {
        added = lists.added;
        watchProgress = lists.watchProgress;
        watchLater = lists.watchLater;
        HOA.readPrefs(nextPrefs => {
          prefs = nextPrefs;
          render();
        });
      });
    }

    clearButton.addEventListener("click", () => {
      if (clearButton.getAttribute("aria-disabled") === "true") {
        return;
      }
      if (!window.confirm("Clear every added video from this page?")) {
        return;
      }
      editingKey = "";
      HOA.readLists(lists => HOA.writeLists({ added: {} }, refresh));
    });

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || (!changes[HOA.ADDED_KEY] && !changes[HOA.PREFS_KEY] && !changes[HOA.PROGRESS_KEY] && !changes[HOA.WATCH_LATER_KEY])) {
          return;
        }
        if (editingKey) {
          pendingRefresh = true;
          return;
        }
        refresh();
      });
    }
    refresh();
  }

  return { mount };
})();

if (typeof window !== "undefined") {
  window.HOA_ADDED = HOA_ADDED;
}
