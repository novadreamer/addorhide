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
    year: "Year"
  };
  const GROUP_LABELS = { none: "No grouping", type: "By type", genre: "By genre" };
  const TAG_TYPES = [
    ["video", "Video"], ["short", "Short"], ["movie", "Movie"], ["tv", "TV"],
    ["live", "Live"], ["music", "Music"], ["sport", "Sport"], ["other", "Other"]
  ];
  const siteDeleteConfirmations = new Map();
  const OPEN_BIN_ICON = '<svg class="bin-open" viewBox="0 0 34 24" aria-hidden="true" focusable="false"><path d="M4.6 7.4 18.2 3.9"/><path d="M9.3 6.2 8.9 4.6c-.2-.7.2-1.4.9-1.6l2.4-.6c.7-.2 1.4.2 1.6.9l.4 1.5"/><path d="M4.4 10.5h15.2"/><path d="M5.4 10.5l.9 9.3c.1 1 .9 1.7 1.9 1.7h7.6c1 0 1.8-.7 1.9-1.7l.9-9.3"/><path d="M10 13.5v5M14 13.5v5"/><g transform="translate(20.6 0)"><path class="q" d="M3.2 8.6c0-2.2 1.7-3.6 3.8-3.6s3.6 1.3 3.6 3.2c0 2.6-3.4 2.9-3.4 5.6"/><circle class="q-dot" cx="7.2" cy="18.6" r="1.25"/></g></svg>';
  const TAG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 12.2V4.8c0-.7.6-1.3 1.3-1.3h7.4c.4 0 .7.1.9.4l7.6 7.6c.5.5.5 1.3 0 1.8l-7.4 7.4c-.5.5-1.3.5-1.8 0l-7.6-7.6c-.3-.2-.4-.5-.4-.9z"/><circle cx="8.2" cy="8.2" r="1.6"/></svg>';
  const REMOVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4"/></svg>';
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

  function labelFor(text, control) {
    const label = element("label", "visually-hidden", text);
    label.htmlFor = control.id;
    return label;
  }

  function defaultDirection(sort) {
    return sort === "title" ? "asc" : "desc";
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
      const href = HOA.safeHref(key);
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
      tag.title = "Tag: set this video's type and genres";
      tag.setAttribute("aria-label", "Tag: set this video's type and genres");
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

    function renderSite(group) {
      const sitePrefs = prefs[group.site] || {};
      const sorts = HOA.availableSorts(group.entries);
      const sort = sorts.includes(sitePrefs.sort) ? sitePrefs.sort : (sorts.includes("added") ? "added" : sorts[0] || "added");
      const dir = sitePrefs.dir === "asc" || sitePrefs.dir === "desc" ? sitePrefs.dir : defaultDirection(sort);
      const groups = HOA.availableGroups(group.entries);
      const groupMode = groups.includes(sitePrefs.group) ? sitePrefs.group : "none";
      const section = element("section", "site-group");
      section.dataset.site = group.site;
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
      heading.appendChild(collapse);
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
      const controls = element("div", "site-controls");
      // Only controls that change something for this website are shown (see HOA.availableSorts/Groups).
      if (sorts.length >= 2) {
        const sortSelect = makeSelect(group.site, "sort", sorts, sort);
        sortSelect.addEventListener("change", () => {
          const nextSort = sortSelect.value;
          setPrefs(group.site, { sort: nextSort, dir: defaultDirection(nextSort) });
          render();
        });
        controls.appendChild(labelFor("Sort by", sortSelect));
        controls.appendChild(sortSelect);
      }
      if (sorts.length >= 1) {
        const direction = element("button", "direction-button", dir === "asc" ? "↑" : "↓");
        direction.type = "button";
        direction.id = `added-direction-${slug}`;
        const label = sorts.length === 1 ? `${SORT_LABELS[sort]}, ` : "";
        direction.setAttribute("aria-label", `${label}${dir === "asc" ? "ascending" : "descending"}`);
        direction.title = `${SORT_LABELS[sort]}: ${dir === "asc" ? "ascending" : "descending"}`;
        direction.addEventListener("click", () => {
          setPrefs(group.site, { sort, dir: dir === "asc" ? "desc" : "asc" });
          render();
        });
        controls.appendChild(direction);
      }
      if (groups.length > 1) {
        const groupSelect = makeSelect(group.site, "group", groups, groupMode);
        groupSelect.addEventListener("change", () => {
          setPrefs(group.site, { group: groupSelect.value });
          render();
        });
        controls.appendChild(labelFor("Group by", groupSelect));
        controls.appendChild(groupSelect);
      }
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
      if (!sitePrefs.collapsed) {
        const body = element("div", "site-group-body");
        const sorted = HOA.sortEntries(group.entries, sort, dir);
        HOA.orderGroupsBySort(HOA.groupEntries(sorted, groupMode), sorted, groupMode)
          .forEach(subgroup => body.appendChild(makeSubgroup(group.site, subgroup, hasPlayable)));
        section.appendChild(body);
      }
      return section;
    }

    // Every change rebuilds the list. Keep the reader where they were: the website section they were working
    // in stays at the same height on screen (otherwise the page jumped to the top), and focus returns to
    // the same control.
    function render() {
      const focused = document.activeElement;
      const focusId = focused && focused.id && groupsRoot.contains(focused) ? focused.id : "";
      const anchor = focused && focused.closest ? focused.closest(".site-group") : null;
      const anchorSite = anchor ? anchor.dataset.site : "";
      const anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;
      const scrollTop = window.scrollY;
      groupsRoot.style.minHeight = `${groupsRoot.offsetHeight}px`;
      while (groupsRoot.firstChild) {
        groupsRoot.firstChild.remove();
      }
      const groups = HOA.groupBySite(added);
      const videoCount = groups.reduce((count, group) => count + group.entries.length, 0);
      introSummary.textContent = HOA.addedSummaryText(videoCount, groups.length);
      empty.hidden = groups.length !== 0;
      // aria-disabled (not disabled) so the tooltip still shows on hover in every browser.
      clearButton.setAttribute("aria-disabled", String(videoCount === 0));
      clearButton.title = videoCount === 0 ? "Nothing to clear: no videos have been added yet"
        : "Clear page: delete every added video (asks first)";
      groups.forEach(group => groupsRoot.appendChild(renderSite(group)));
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
        if (areaName !== "local" || (!changes[HOA.ADDED_KEY] && !changes[HOA.PREFS_KEY])) {
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
