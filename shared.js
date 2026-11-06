"use strict";

// var, not const: the popup re-injects this file (picker, Enable) into pages that already have it,
// and a second const declaration in the same content-script world throws and aborts the injection.
var HOA = Object.freeze((() => {
  const HIDDEN_KEY = "hiddenItems";
  const CHANNELS_KEY = "hiddenChannels";
  const WATCHED_SHOWN_KEY = "watchedShown";
  const ADDED_KEY = "addedItems";
  const SITES_KEY = "siteRules";
  const SEEN_ROWS_KEY = "seenRows";
  const PROGRESS_KEY = "watchProgress";
  const WATCH_LATER_KEY = "watchLater";
  const WATCH_SETTINGS_KEY = "watchSettings";
  const MAX_HIDDEN = 1000;
  const MAX_CHANNELS = 500;
  const MAX_WATCHED_SHOWN = 1000;
  const MAX_ADDED = 500;
  const MAX_PROGRESS = 1500;
  const MAX_WATCH_LATER = 1500;
  // A resume is meaningful once it can land five seconds back from a real later point.
  const MIN_RESUME_SECONDS = 10;
  const MAX_TITLE = 200;
  const MAX_URL = 2048;
  const HOSTED_ADDED_URL = "https://www.youtube.com/robots.txt#addorhide-added";
  const PLAYER_URL = "https://novadreamer.github.io/addorhide-player/";
  // Optional tip jar. Nothing in the extension depends on it.
  const SUPPORT_URL = "https://ko-fi.com/ashmustafa";
  const PREFS_KEY = "addedViewPrefs";
  const THEME_KEY = "theme";
  // Where the Add/Hide bar sits on every site: "top" (default) or "bottom" of the video picture.
  const BUTTON_EDGE_KEY = "buttonEdge";
  // Whether the Add/Hide bar shows at all (hidden videos stay hidden either way). Default on.
  const BUTTONS_ENABLED_KEY = "buttonsEnabled";

  function buttonsEnabledOf(value) {
    return value !== false;
  }

  function buttonEdgeOf(value) {
    return value === "bottom" ? "bottom" : "top";
  }

  function themeOf(value) {
    return value === "light" || value === "dark" ? value : "";
  }

  function normalizeWatchSettings(value) {
    const raw = isObject(value) ? value : {};
    // 1.1.0 had a short-lived manual mode. Keep existing users opted in when it
    // is encountered, rather than making their saved videos disappear.
    return { tagWatched: raw.tagWatched !== false, continueWatching: raw.continueWatching === "off" ? "off" : "auto" };
  }

  function bitmapBuckets(value) {
    return typeof value === "string" && /^[0-9a-f]{25}$/i.test(value) ? value.toLowerCase() : "0000000000000000000000000";
  }

  function bucketCount(bitmap) {
    return bitmapBuckets(bitmap).split("").reduce((total, digit) => total + Number.parseInt(digit, 16).toString(2).split("1").length - 1, 0);
  }

  function normalizeProgress(value) {
    const normalized = {};
    if (!isObject(value)) return normalized;
    Object.keys(value).forEach(key => {
      const canonical = canonicalUrl(key);
      if (!canonical || !isObject(value[key])) return;
      // A home/listing page is never a resumable video. YouTube is stricter
      // because its home page can host real <video> preview players.
      let parsed;
      try { parsed = new URL(canonical); } catch (error) { return; }
      if (!videoKey(parsed)) return;
      const raw = value[key];
      const duration = Number(raw.duration);
      const position = Number(raw.position);
      if (!Number.isFinite(duration) || duration < 20 || duration > 1000000 || !Number.isFinite(position) || position < 0) return;
      const updated = Number(raw.updated);
      if (!Number.isFinite(updated)) return;
      const title = typeof raw.title === "string" ? raw.title.trim().slice(0, MAX_TITLE) : fallbackTitle(key);
      const thumb = typeof raw.thumbnail === "string" && raw.thumbnail.length <= MAX_URL && (!raw.thumbnail || validHttpUrl(raw.thumbnail)) ? raw.thumbnail : "";
      const entry = { site: siteOf(canonical), title: title || fallbackTitle(canonical), url: canonical, thumbnail: thumb, duration, position: Math.min(position, duration), buckets: bitmapBuckets(raw.buckets), watched: raw.watched === true, ts: Number.isFinite(raw.ts) ? raw.ts : updated, updated };
      if (Number.isFinite(Number(raw.played)) && Number(raw.played) >= 0) entry.played = Number(raw.played);
      if (raw.untagged === true) entry.untagged = true;
      if (raw.cw === "auto" || raw.cw === "manual" || raw.cw === "later") entry.cw = raw.cw === "later" ? "later" : "auto";
      const old = normalized[canonical];
      if (!old) normalized[canonical] = entry;
      else {
        const latest = entry.updated >= old.updated ? entry : old;
        const merged = mergeProgressEntry(old, entry);
        normalized[canonical] = { ...latest, ...merged, title: latest.title || old.title, thumbnail: latest.thumbnail || old.thumbnail,
          position: Math.max(old.position || 0, entry.position || 0), played: Math.max(old.played || 0, entry.played || 0),
          watched: old.watched || entry.watched, updated: Math.max(old.updated, entry.updated) };
        if (old.cw || entry.cw) normalized[canonical].cw = old.cw === "later" || entry.cw === "later" ? "later" : "auto";
      }
    });
    const keys = Object.keys(normalized);
    if (keys.length > MAX_PROGRESS) {
      const excess = keys.length - MAX_PROGRESS;
      const oldestFirst = list => list.sort((a, b) => normalized[a].updated - normalized[b].updated || a.localeCompare(b));
      const nonContinuing = oldestFirst(keys.filter(key => !normalized[key].cw));
      const continuing = oldestFirst(keys.filter(key => normalized[key].cw));
      nonContinuing.concat(continuing).slice(0, excess).forEach(key => delete normalized[key]);
    }
    return normalized;
  }

  function videoKey(parsed) {
    if (!parsed || parsed.pathname === "/") return false;
    if (!YOUTUBE_HOSTS.has(parsed.hostname)) return true;
    return (parsed.pathname === "/watch" && Boolean(parsed.searchParams.get("v")))
      || /^\/shorts\/[^/]+/.test(parsed.pathname) || /^\/live\/[^/]+/.test(parsed.pathname);
  }

  function normalizeWatchLater(value) {
    const normalized = {};
    if (!isObject(value)) return normalized;
    Object.keys(value).forEach(key => {
      const url = canonicalUrl(key);
      let parsed;
      try { parsed = url && new URL(url); } catch (error) { return; }
      if (!videoKey(parsed) || !isObject(value[key])) return;
      const raw = value[key];
      const ts = Number(raw.ts);
      if (!Number.isFinite(ts)) return;
      const title = typeof raw.title === "string" ? raw.title.trim().slice(0, MAX_TITLE) : "";
      const thumb = typeof raw.thumb === "string" && raw.thumb.length <= MAX_URL && (!raw.thumb || validHttpUrl(raw.thumb)) ? raw.thumb : "";
      const duration = Number(raw.duration);
      const entry = { title: title || fallbackTitle(url), thumb, site: siteOf(url), url, ts };
      if (Number.isFinite(duration) && duration >= 0 && duration <= 1000000) entry.duration = duration;
      const old = normalized[url];
      if (!old || entry.ts >= old.ts) normalized[url] = entry;
    });
    const keys = Object.keys(normalized);
    if (keys.length > MAX_WATCH_LATER) keys.sort((a, b) => normalized[a].ts - normalized[b].ts || a.localeCompare(b))
      .slice(0, keys.length - MAX_WATCH_LATER).forEach(key => delete normalized[key]);
    return normalized;
  }

  let progressWriteBusy = false;
  let pendingProgressWrites = {};

  function flushProgressWrites() {
    if (progressWriteBusy || !Object.keys(pendingProgressWrites).length) return;
    progressWriteBusy = true;
    const pending = pendingProgressWrites;
    pendingProgressWrites = {};
    chrome.storage.local.get({ [PROGRESS_KEY]: {} }, result => {
      // A rapid burst (notably timeupdate followed by ended) can arrive while
      // the read is pending. Coalesce the newer value into this same write so
      // storage never briefly publishes the stale first sample.
      Object.entries(pendingProgressWrites).forEach(([key, change]) => {
        const active = pending[key];
        if (!active) return;
        active.entry = change.entry;
        active.callbacks.push(...change.callbacks);
        delete pendingProgressWrites[key];
      });
      const current = normalizeProgress(result[PROGRESS_KEY]);
      Object.entries(pending).forEach(([key, change]) => { if (change.entry) current[key] = change.entry; else delete current[key]; });
      chrome.storage.local.set({ [PROGRESS_KEY]: normalizeProgress(current) }, () => {
        Object.values(pending).forEach(change => change.callbacks.forEach(callback => callback()));
        progressWriteBusy = false;
        flushProgressWrites();
      });
    });
  }

  function writeProgress(key, entry, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (!canonicalUrl(key) || typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) { cb(); return; }
    const pending = pendingProgressWrites[key] || { entry, callbacks: [] };
    pending.entry = entry; pending.callbacks.push(cb); pendingProgressWrites[key] = pending;
    flushProgressWrites();
  }

  // Playback can arrive from a player iframe while the top page owns the saved video identity.
  // Keep coverage monotonic when a page and its frame save close together.
  function mergeProgressEntry(base, update) {
    const older = isObject(base) ? base : {};
    const newer = isObject(update) ? update : {};
    const oldBits = bitmapBuckets(older.buckets);
    const newBits = bitmapBuckets(newer.buckets);
    const buckets = oldBits.split("").map((digit, index) =>
      (Number.parseInt(digit, 16) | Number.parseInt(newBits[index], 16)).toString(16)).join("");
    return {
      ...older,
      ...newer,
      buckets,
      covered: Math.max(Number(older.covered) || 0, Number(newer.covered) || 0)
    };
  }

  // Filter settings are deliberately small and boring: they are stored in siteRules and may also arrive from a
  // backup made by an older/newer extension version.
  function normalizeHideKinds(list, allowedIds) {
    const allowed = Array.isArray(allowedIds) ? new Set(allowedIds.filter(id => typeof id === "string")) : null;
    if (!Array.isArray(list)) {
      return [];
    }
    const result = [];
    list.forEach(value => {
      if (typeof value !== "string") {
        return;
      }
      const id = value.trim();
      if (!id || id.length > 80 || (allowed && !allowed.has(id)) || result.includes(id) || result.length >= 50) {
        return;
      }
      result.push(id);
    });
    return result;
  }

  function normalizeKeywords(list) {
    if (!Array.isArray(list)) {
      return [];
    }
    const result = [];
    const seen = new Set();
    list.forEach(value => {
      if (typeof value !== "string") {
        return;
      }
      const word = value.trim().replace(/\s+/g, " ").slice(0, 60);
      const key = word.toLocaleLowerCase();
      if (!word || seen.has(key) || result.length >= 10) {
        return;
      }
      seen.add(key);
      result.push(word);
    });
    return result;
  }

  const keywordMatcherCache = new Map();
  function keywordMatch(text, keywords) {
    if (typeof text !== "string" || !text || !Array.isArray(keywords)) {
      return false;
    }
    const normalized = normalizeKeywords(keywords);
    const cacheKey = normalized.map(keyword => keyword.toLocaleLowerCase()).join("\u0001");
    let matchers = keywordMatcherCache.get(cacheKey);
    if (!matchers) {
      matchers = normalized.map(keyword => {
      // Escape user text before placing it between Unicode-aware word boundaries. Punctuation in a phrase is
      // intentionally literal; only letters and digits on either side prevent a match.
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        try { return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu"); } catch (error) { return null; }
      });
      keywordMatcherCache.set(cacheKey, matchers);
    }
    return matchers.some(matcher => matcher && matcher.test(text));
  }
  const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
  const TWITCH_CHANNEL_RE = /^[A-Za-z0-9_]{2,25}$/;
  const TWITCH_SLUG_RE = /^[A-Za-z0-9_-]{2,100}$/;
  const TWITCH_RESERVED = new Set([
    "directory", "videos", "settings", "search", "downloads", "jobs", "p", "turbo",
    "prime", "subscriptions", "inventory", "wallet", "drops", "friends", "messages",
    "following", "login", "signup"
  ]);
  const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com"]);
  const YOUTUBE_MEDIA_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
  const TRACKING_PARAMS = new Set(["fbclid", "gclid", "igshid", "si", "pp", "feature", "ab_channel"]);
  const TYPES = ["video", "short", "movie", "tv", "live", "music", "sport", "other"];
  const SORT_KEYS = ["added", "published", "views", "votes", "score", "duration", "title", "year", "channel"];
  const TYPE_LABELS = Object.freeze({
    video: "Video",
    short: "Short",
    movie: "Movie",
    tv: "TV",
    live: "Live",
    music: "Music",
    sport: "Sport",
    other: "Other"
  });
  const SITE_NAMES = Object.freeze({
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "tubitv.com": "Tubi",
    "imdb.com": "IMDb",
    "themoviedb.org": "TMDB",
    "netflix.com": "Netflix",
    "primevideo.com": "Prime Video",
    "hulu.com": "Hulu",
    "disneyplus.com": "Disney+",
    "twitch.tv": "Twitch",
    "clips.twitch.tv": "Twitch",
    "vimeo.com": "Vimeo",
    "max.com": "Max",
    "peacocktv.com": "Peacock",
    "pluto.tv": "Pluto TV",
    "crunchyroll.com": "Crunchyroll",
    "dailymotion.com": "Dailymotion",
    "play.xumo.com": "Xumo Play",
    "therokuchannel.roku.com": "The Roku Channel",
    "athome.fandango.com": "Fandango at Home",
    "fandangoathome.com": "Fandango at Home",
    "vudu.com": "Fandango at Home",
    "odysee.com": "Odysee",
    "kick.com": "Kick",
    "rumble.com": "Rumble",
    "pbs.org": "PBS",
    "vix.com": "ViX",
    "shout-tv.com": "Shout! TV",
    "justwatch.com": "JustWatch",
    "rottentomatoes.com": "Rotten Tomatoes",
    "letterboxd.com": "Letterboxd"
  });

  function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function isYoutubeWatch(url) {
    return YOUTUBE_HOSTS.has(url.hostname) && url.pathname === "/watch";
  }

  function canonicalUrl(href, base) {
    let url;
    try {
      url = new URL(href, base);
    } catch (error) {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const hostname = url.hostname;
    const imdb = hostname === "imdb.com" || hostname === "www.imdb.com" || hostname === "m.imdb.com";
    if (imdb) {
      url.hostname = "www.imdb.com";
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length >= 2 && /^(title|name|list)$/i.test(segments[0])
        && /^(tt\d+|nm\d+|ls\d+)$/i.test(segments[1])) {
        url.pathname = `/${segments[0]}/${segments[1]}`;
        url.search = "";
      }
      if (segments.length >= 2 && segments[0].toLowerCase() === "video" && /^vi\d+$/i.test(segments[1])) {
        url.pathname = `/video/${segments[1]}`;
        url.search = "";
      }
    }
    if (hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (!id || !VIDEO_ID_RE.test(id)) {
        return null;
      }
      return `https://www.youtube.com/watch?v=${id}`;
    }

    if (YOUTUBE_HOSTS.has(hostname)) {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        if (!id || !VIDEO_ID_RE.test(id)) {
          return null;
        }
        return `https://www.youtube.com/watch?v=${id}`;
      }
      if (url.pathname.startsWith("/shorts/")) {
        const id = url.pathname.split("/").filter(Boolean)[1];
        if (!id || !VIDEO_ID_RE.test(id)) {
          return null;
        }
        return `https://www.youtube.com/shorts/${id}`;
      }
    }

    if (isYoutubeWatch(url)) {
      // Kept explicit for readability: the branch above canonicalizes these URLs.
      return null;
    }

    for (const key of Array.from(url.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)
        || lower === "ref_" || lower.startsWith("pf_rd_") || lower.startsWith("ref_")
        || (isYoutubeWatch(url) && ["list", "index", "start_radio"].includes(lower))) {
        url.searchParams.delete(key);
      }
    }
    const params = Array.from(url.searchParams.entries()).sort((left, right) => {
      const keyCompare = left[0].localeCompare(right[0]);
      return keyCompare || left[1].localeCompare(right[1]);
    });
    url.search = "";
    params.forEach(([key, value]) => url.searchParams.append(key, value));
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    const result = url.toString();
    return result.length <= MAX_URL ? result : null;
  }

  function siteOf(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    } catch (error) {
      return "";
    }
  }

  function kindOf(url) {
    try {
      const parsed = new URL(url);
      return YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())
        && parsed.pathname.startsWith("/shorts/") ? "short" : "video";
    } catch (error) {
      return "video";
    }
  }

  function typeOf(url) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();
      const youtube = YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())
        || parsed.hostname.toLowerCase().endsWith(".youtube.com");
      if (youtube && /(^|\/)shorts(?:\/|$)/.test(path)) {
        return "short";
      }
      if (/(^|\/)movies?(?:\/|$)/.test(path)) {
        return "movie";
      }
      if (/(^|\/)(?:series|tv-shows?|shows?|tv)(?:\/|$)/.test(path)) {
        return "tv";
      }
      if (/(^|\/)live(?:\/|$)/.test(path)) {
        return "live";
      }
    } catch (error) {
      return "video";
    }
    return "video";
  }

  function parseDuration(text) {
    if (typeof text !== "string") {
      return null;
    }
    const value = text.trim();
    // IMDb video badges read "Clip 1:01" or "Trailer 2:48".
    const labelled = value.match(/^(?:clip|trailer|teaser|featurette|video|episode)\s+(\d[\d:]*)$/i);
    if (labelled) {
      return parseDuration(labelled[1]);
    }
    let seconds = null;
    let match = value.match(/^(\d+):([0-5]\d)$/);
    if (match) {
      seconds = Number(match[1]) * 60 + Number(match[2]);
    } else {
      match = value.match(/^(\d+):(\d{2}):([0-5]\d)$/);
      if (match && Number(match[2]) < 60) {
        seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      }
    }
    if (seconds === null) {
      match = value.match(/^(\d+)\s*(?:h|hr)\s+(\d+)\s*(?:m|min)$/i);
      if (match) {
        seconds = Number(match[1]) * 3600 + Number(match[2]) * 60;
      } else {
        match = value.match(/^(\d+)\s*(?:h|hr)$/i);
        if (match) {
          seconds = Number(match[1]) * 3600;
        } else {
          match = value.match(/^(\d+)\s*(?:m|min)$/i);
          if (match) {
            seconds = Number(match[1]) * 60;
          } else {
            match = value.match(/^(\d+)\s*s$/i);
            if (match) {
              seconds = Number(match[1]);
            }
          }
        }
      }
    }
    return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
  }

  function parseViews(text) {
    if (typeof text !== "string") {
      return null;
    }
    const value = text.trim();
    if (/^no\s+views$/i.test(value)) {
      return 0;
    }
    let match = value.match(/^(\d+(?:\.\d+)?)\s*([KMB])(?:\s+(?:views?|viewers?|watching))?$/i);
    if (match) {
      const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase()];
      const result = Math.round(Number(match[1]) * multiplier);
      return Number.isSafeInteger(result) ? result : null;
    }
    match = value.match(/^(\d[\d,]*)\s+(?:views?|viewers?|watching)$/i);
    if (!match) {
      return null;
    }
    const result = Number(match[1].replace(/,/g, ""));
    return Number.isSafeInteger(result) ? result : null;
  }

  function parseVotes(text) {
    if (typeof text !== "string") {
      return null;
    }
    let value = text.trim();
    if (value.startsWith("(") && value.endsWith(")")) {
      value = value.slice(1, -1).trim();
    }
    let match = value.match(/^(\d+(?:\.\d+)?)\s*([KMB])(?:\s+(?:votes?|ratings?))?$/i);
    if (match) {
      const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase()];
      const result = Math.round(Number(match[1]) * multiplier);
      return Number.isSafeInteger(result) ? result : null;
    }
    match = value.match(/^(\d[\d,]*)(?:\s+(?:votes?|ratings?))?$/i);
    if (!match) {
      return null;
    }
    const result = Number(match[1].replace(/,/g, ""));
    return Number.isSafeInteger(result) ? result : null;
  }

  function parseScore(text) {
    if (typeof text !== "string") {
      return null;
    }
    const match = text.trim().match(/^★?\s*(\d+(?:\.\d)?)\s*(?:\/\s*10)?$/);
    if (!match) {
      return null;
    }
    const score = Number(match[1]);
    return Number.isFinite(score) && score >= 0 && score <= 10
      ? Math.round(score * 10) / 10 : null;
  }

  function parseRelativeAge(text, nowMs) {
    if (typeof text !== "string" || !Number.isFinite(nowMs)) {
      return null;
    }
    const value = text.trim();
    if (/^just\s+now$/i.test(value)) {
      return nowMs;
    }
    const match = value.match(/^(?:(?:streamed|premiered)\s+)?(\d+)\s*(m(?:in(?:ute)?)?|h(?:r|our)?|d(?:ay)?|w(?:eek)?|month|year)s?\s+ago$/i);
    if (!match) {
      return null;
    }
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const days = unit.startsWith("y") ? 365 : unit.startsWith("month") ? 30
      : unit.startsWith("w") ? 7 : unit.startsWith("d") ? 1
      : unit.startsWith("h") ? 1 / 24 : 1 / 1440;
    return nowMs - amount * days * 24 * 60 * 60 * 1000;
  }

  function parseYear(text) {
    if (typeof text !== "string") {
      return null;
    }
    const value = text.trim();
    // A numeric date such as 10/06/2000 gives only its year: day and month order depends on the site's locale.
    const match = value.match(/^(\d{4})(?:\s*[-–]\s*(?:\d{4})?)?$/)
      || value.match(/^\(\s*(\d{4})(?:\s*[-–]\s*(?:\d{4})?)?\s*\)$/)
      || value.match(/^\d{1,2}[/.]\d{1,2}[/.](\d{4})$/);
    const year = match && Number(match[1]);
    return year >= 1870 && year <= 2100 ? year : null;
  }

  function parseDate(text) {
    if (typeof text !== "string") {
      return null;
    }
    const value = text.trim();
    const months = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
      apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
      aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9,
      october: 9, nov: 10, november: 10, dec: 11, december: 11
    };
    let year;
    let month;
    let day;
    let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      year = Number(match[1]);
      month = Number(match[2]) - 1;
      day = Number(match[3]);
    } else {
      match = value.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
      if (match) {
        month = months[match[1].toLowerCase()];
        day = Number(match[2]);
        year = Number(match[3]);
      } else {
        match = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
        if (!match) {
          return null;
        }
        day = Number(match[1]);
        month = months[match[2].toLowerCase()];
        year = Number(match[3]);
      }
    }
    if (!Number.isInteger(month) || year < 1870 || year > 2100 || day < 1 || day > 31) {
      return null;
    }
    const timestamp = Date.UTC(year, month, day);
    const date = new Date(timestamp);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month
      && date.getUTCDate() === day ? timestamp : null;
  }

  function splitGenres(text) {
    if (typeof text !== "string") {
      return [];
    }
    const result = [];
    const seen = new Set();
    text.split(/[·|,•]/).forEach(part => {
      const value = part.trim();
      const key = value.toLocaleLowerCase();
      if (value && !seen.has(key) && result.length < 8) {
        seen.add(key);
        result.push(value);
      }
    });
    return result;
  }

  function siteHostname(site) {
    if (typeof site !== "string") {
      return "";
    }
    let value = site.trim().toLowerCase();
    try {
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
        value = new URL(value).hostname.toLowerCase();
      }
    } catch (error) {
      return "";
    }
    return value.replace(/^www\./, "");
  }

  function siteDisplayName(site) {
    const hostname = siteHostname(site);
    return SITE_NAMES[hostname] || hostname;
  }

  // "... and N websites" when a website count is given (the popup and the Hidden window), e.g.
  // "There are 3 hidden videos and 1 website."
  function withSites(sentence, sites) {
    if (!Number.isInteger(sites) || sites <= 0) {
      return `${sentence}.`;
    }
    return `${sentence} and ${sites} website${sites === 1 ? "" : "s"}.`;   // no line break inside "1 website"
  }

  function hiddenSummaryText(count, sites) {
    if (!Number.isInteger(count) || count <= 0) {
      return "No hidden videos.";
    }
    return withSites(count === 1 ? "There is 1 hidden video" : `There are ${count} hidden videos`, sites);
  }

  // The popup's line under Added Videos, worded like the one under Hidden Videos.
  function addedCountText(count, sites) {
    if (!Number.isInteger(count) || count <= 0) {
      return "No added videos.";
    }
    return withSites(count === 1 ? "There is 1 added video" : `There are ${count} added videos`, sites);
  }

  function addedSummaryText(videoCount, siteCount) {
    const videos = Number.isInteger(videoCount) && videoCount >= 0 ? videoCount : 0;
    const sites = Number.isInteger(siteCount) && siteCount >= 0 ? siteCount : 0;
    if (videos === 0) {
      return "Nothing saved yet.";
    }
    if (sites === 1) {
      return `${videos} video${videos === 1 ? "" : "s"} saved on 1 site`;
    }
    return `${videos} video${videos === 1 ? "" : "s"} saved across ${sites} sites`;
  }

  function playerFor(key, title) {
    let url;
    try {
      url = new URL(key);
    } catch (error) {
      return null;
    }
    if (url.protocol !== "https:") {
      return null;
    }

    let site;
    let parameter;
    let value;
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    if (host === "www.youtube.com" && url.pathname === "/watch"
      && url.searchParams.size === 1 && url.searchParams.has("v")) {
      value = url.searchParams.get("v");
      if (VIDEO_ID_RE.test(value)) {
        site = "youtube";
        parameter = "id";
      }
    } else if (host === "www.youtube.com" && segments.length === 2 && segments[0] === "shorts"
      && url.pathname === `/shorts/${segments[1]}`
      && !url.search) {
      value = segments[1];
      if (VIDEO_ID_RE.test(value)) {
        site = "youtube";
        parameter = "id";
      }
    } else if (host === "www.twitch.tv" && segments.length === 1 && url.pathname === `/${segments[0]}` && !url.search
      && TWITCH_CHANNEL_RE.test(segments[0]) && !TWITCH_RESERVED.has(segments[0].toLowerCase())) {
      site = "twitch";
      parameter = "channel";
      value = segments[0];
    } else if (host === "www.twitch.tv" && segments.length === 2 && segments[0] === "videos"
      && url.pathname === `/videos/${segments[1]}`
      && /^\d+$/.test(segments[1]) && !url.search) {
      site = "twitchvideo";
      parameter = "video";
      value = segments[1];
    } else if (host === "clips.twitch.tv" && segments.length === 1 && url.pathname === `/${segments[0]}` && !url.search
      && TWITCH_SLUG_RE.test(segments[0])) {
      site = "twitchclip";
      parameter = "clip";
      value = segments[0];
    } else if (host === "www.twitch.tv" && segments.length === 3 && segments[1] === "clip"
      && url.pathname === `/${segments[0]}/clip/${segments[2]}`
      && !url.search && TWITCH_CHANNEL_RE.test(segments[0])
      && !TWITCH_RESERVED.has(segments[0].toLowerCase()) && TWITCH_SLUG_RE.test(segments[2])) {
      site = "twitchclip";
      parameter = "clip";
      value = segments[2];
    } else if (host === "www.imdb.com" && segments.length === 2 && segments[0] === "video"
      && url.pathname === `/video/${segments[1]}`
      && /^vi\d+$/.test(segments[1]) && !url.search) {
      site = "imdb";
      parameter = "id";
      value = segments[1];
    }
    if (!site) {
      return null;
    }

    const params = new URLSearchParams();
    params.set("site", site);
    params.set(parameter, value);
    if (typeof title === "string") {
      const trimmedTitle = title.trim().slice(0, 120);
      if (trimmedTitle) {
        params.set("title", trimmedTitle);
      }
    }
    const siteName = site === "twitch" || site === "twitchvideo" || site === "twitchclip"
      ? "Twitch" : siteDisplayName(host);
    return { hash: params.toString(), siteName };
  }

  function playerSiteName(key) {
    let hostname = siteOf(key);
    if (!hostname) {
      hostname = siteHostname(key);
    }
    return siteDisplayName(hostname);
  }

  function siteMonogram(site) {
    const display = siteDisplayName(site);
    const value = typeof site === "string" ? site : "";
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return { letter: (display.charAt(0) || "?").toUpperCase(), hue: hash % 360 };
  }

  function typeLabel(type) {
    return TYPE_LABELS[type] || "Other";
  }

  function formatDuration(seconds) {
    if (!Number.isInteger(seconds) || seconds < 1) {
      return "";
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
      : `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function formatViews(value) {
    if (!Number.isInteger(value) || value < 0) {
      return "";
    }
    if (value < 1000) {
      return `${value} ${value === 1 ? "view" : "views"}`;
    }
    const suffixes = ["K", "M", "B"];
    let index = value >= 1e9 ? 2 : value >= 1e6 ? 1 : 0;
    let amount = Math.round((value / (10 ** ((index + 1) * 3))) * 10) / 10;
    if (amount >= 1000 && index < suffixes.length - 1) {
      index += 1;
      amount = Math.round((value / (10 ** ((index + 1) * 3))) * 10) / 10;
    }
    return `${String(amount).replace(/\.0$/, "")}${suffixes[index]} views`;
  }

  function formatScore(value) {
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      return "";
    }
    return String(Math.round(value * 10) / 10);
  }

  function formatVotes(value) {
    if (!Number.isInteger(value) || value < 0) {
      return "";
    }
    if (value < 1000) {
      return `${value} ${value === 1 ? "vote" : "votes"}`;
    }
    const suffixes = ["K", "M", "B"];
    let index = value >= 1e9 ? 2 : value >= 1e6 ? 1 : 0;
    let amount = Math.round((value / (10 ** ((index + 1) * 3))) * 10) / 10;
    if (amount >= 1000 && index < suffixes.length - 1) {
      index += 1;
      amount = Math.round((value / (10 ** ((index + 1) * 3))) * 10) / 10;
    }
    return `${String(amount).replace(/\.0$/, "")}${suffixes[index]} votes`;
  }

  function cleanTitle(text) {
    if (typeof text !== "string") {
      return "";
    }
    const value = text.trim().replace(/\s+/g, " ");
    return value.replace(/^(?:\d{1,3}\. |#\d+ )/, "");
  }

  function formatAge(timestamp, nowMs) {
    if (!Number.isFinite(timestamp) || !Number.isFinite(nowMs)) {
      return "";
    }
    const days = Math.max(0, Math.floor((nowMs - timestamp) / (24 * 60 * 60 * 1000)));
    if (days < 1) {
      return "today";
    }
    if (days < 14) {
      return `${days} day${days === 1 ? "" : "s"} ago`;
    }
    if (days < 60) {
      const weeks = Math.floor(days / 7);
      return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    }
    if (days < 365) {
      const months = Math.floor(days / 30);
      return `${months} month${months === 1 ? "" : "s"} ago`;
    }
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
  }

  function youtubeThumb(url) {
    let canonical = canonicalUrl(url);
    if (!canonical) {
      return "";
    }
    try {
      const parsed = new URL(canonical);
      if (!YOUTUBE_MEDIA_HOSTS.has(parsed.hostname) || !["/watch"].includes(parsed.pathname)
        && !parsed.pathname.startsWith("/shorts/")) {
        return "";
      }
      const id = parsed.pathname === "/watch"
        ? parsed.searchParams.get("v")
        : parsed.pathname.split("/").filter(Boolean)[1];
      return id && VIDEO_ID_RE.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : "";
    } catch (error) {
      return "";
    }
  }

  function fallbackTitle(key) {
    try {
      const parsed = new URL(key);
      return `${siteOf(key)}${parsed.pathname || "/"}`.slice(0, MAX_TITLE);
    } catch (error) {
      return "unknown";
    }
  }

  function validHttpUrl(value) {
    if (typeof value !== "string" || value.length > MAX_URL || !/^https?:\/\//i.test(value)) {
      return false;
    }
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function addOptionalFields(target, raw) {
    if (validHttpUrl(raw.icon)) {
      target.icon = raw.icon;
    }
    if (Number.isInteger(raw.duration) && raw.duration >= 1 && raw.duration <= 1000000) {
      target.duration = raw.duration;
    }
    if (Number.isInteger(raw.views) && raw.views >= 0 && raw.views <= 1e13) {
      target.views = raw.views;
    }
    if (Number.isFinite(raw.score) && raw.score >= 0 && raw.score <= 10) {
      target.score = Math.round(raw.score * 10) / 10;
    }
    if (Number.isInteger(raw.votes) && raw.votes >= 0 && raw.votes <= 1e11) {
      target.votes = raw.votes;
    }
    if (Number.isFinite(raw.published)) {
      target.published = raw.published;
    }
    if (Number.isInteger(raw.year) && raw.year >= 1870 && raw.year <= 2100) {
      target.year = raw.year;
    }
    if (TYPES.includes(raw.type)) {
      target.type = raw.type;
    }
    if (Array.isArray(raw.genres) && raw.genres.length <= 8) {
      const genres = [];
      const seen = new Set();
      const valid = raw.genres.every(value => {
        if (typeof value !== "string") {
          return false;
        }
        const trimmed = value.trim();
        const key = trimmed.toLocaleLowerCase();
        if (!trimmed || trimmed.length > 40 || seen.has(key)) {
          return trimmed.length > 0 && trimmed.length <= 40 && seen.has(key);
        }
        seen.add(key);
        genres.push(trimmed);
        return true;
      });
      if (valid) {
        target.genres = genres;
      }
    }
    if (typeof raw.rating === "string") {
      const rating = raw.rating.trim();
      if (rating.length >= 1 && rating.length <= 12) {
        target.rating = rating;
      }
    }
    if (typeof raw.channel === "string") {
      const channel = raw.channel.trim();
      if (channel.length >= 1 && channel.length <= MAX_TITLE) {
        target.channel = channel;
      }
    }
  }

  function normalizeItems(value, options) {
    const settings = options || {};
    const max = Number.isFinite(settings.max) ? settings.max : MAX_ADDED;
    const withListed = settings.withListed === true;
    const normalized = {};
    if (!isObject(value)) {
      return normalized;
    }
    Object.keys(value).forEach(key => {
      if (canonicalUrl(key) !== key) {
        return;
      }
      const raw = value[key];
      if (!isObject(raw) || !Number.isFinite(raw.ts)) {
        return;
      }
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      const thumb = raw.thumb === "" ? "" : raw.thumb;
      if (typeof thumb !== "string" || thumb.length > MAX_URL
        || (thumb !== "" && !/^https?:\/\//i.test(thumb))) {
        return;
      }
      normalized[key] = {
        title: (title && title.length <= MAX_TITLE ? title : fallbackTitle(key)),
        thumb,
        kind: raw.kind === "short" ? "short" : "video",
        site: siteOf(key),
        ts: raw.ts
      };
      addOptionalFields(normalized[key], raw);
      if (withListed) {
        normalized[key].listed = raw.listed === undefined ? true : Boolean(raw.listed);
        if (raw.reason === "watched") {
          normalized[key].reason = "watched";
        }
        if (typeof raw.watched === "boolean" && raw.watched) {
          normalized[key].watched = true;
        }
      }
    });
    const keys = Object.keys(normalized);
    if (keys.length > max) {
      keys.sort((left, right) => normalized[left].ts - normalized[right].ts || left.localeCompare(right));
      keys.slice(0, keys.length - max).forEach(key => delete normalized[key]);
    }
    return normalized;
  }

  // Keep channel identities independent of a presentation URL.  Handles and the legacy channel paths are stable
  // enough to use as keys, while name keys let older / unusual cards still match.
  function youtubeChannelKey(href) {
    if (typeof href !== "string" || !href.trim()) return "";
    let url;
    try { url = new URL(href, "https://www.youtube.com"); } catch (error) { return ""; }
    if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return "";
    const match = url.pathname.match(/^\/(?:@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/i);
    return match ? `youtube.com|${match[0].toLowerCase()}` : "";
  }

  function channelNameKey(name, site = "youtube.com") {
    const text = typeof name === "string" ? name.trim().replace(/\s+/g, " ").toLowerCase() : "";
    const host = siteHostname(site);
    return text && host ? `${host}|name:${text}` : "";
  }

  // Row names are user data: keep them small, stable and insensitive to harmless spacing/case changes.
  function normalizeSectionTitles(list) {
    if (!Array.isArray(list)) return [];
    const result = [];
    const seen = new Set();
    list.forEach(value => {
      if (typeof value !== "string") return;
      const title = value.trim().replace(/\s+/g, " ").slice(0, 80);
      const key = title.toLocaleLowerCase();
      // A sentence ("Step inside for big names, …") is a row's tagline, not its name; older versions remembered some.
      if (/[.!]$/.test(title) && title.split(" ").length >= 5) return;
      if (!title || seen.has(key) || result.length >= 100) return;
      seen.add(key);
      result.push(title);
    });
    return result;
  }

  function channelLinkKey(site, href) {
    const host = siteHostname(site);
    if (!host || typeof href !== "string" || !href.trim()) return "";
    let url;
    try { url = new URL(href, `https://${host}`); } catch (error) { return ""; }
    if (siteHostname(url.hostname) !== host) return "";
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${host}|${pathname.toLowerCase()}`;
  }

  function normalizeChannels(value) {
    const normalized = {};
    if (!isObject(value)) return normalized;
    Object.keys(value).forEach(key => {
      const raw = value[key];
      if (!isObject(raw) || !Number.isFinite(raw.ts) || typeof raw.name !== "string") return;
      const name = raw.name.trim().replace(/\s+/g, " ");
      const site = siteHostname(raw.site || String(key).split("|")[0]) || "youtube.com";
      const linkKey = site === "youtube.com" ? youtubeChannelKey(raw.url || key) : channelLinkKey(site, raw.url || key);
      const nameKey = channelNameKey(name, site);
      const validKey = new RegExp(`^${site.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\|(?:\\/.+|name:.+)$`, "i").test(key);
      if (!validKey || !name || name.length > MAX_TITLE) return;
      const validUrl = site === "youtube.com" ? youtubeChannelKey(raw.url) : channelLinkKey(site, raw.url);
      const url = typeof raw.url === "string" && validUrl ? new URL(raw.url, `https://${site}`).href.replace(/[?#].*$/, "") : "";
      normalized[key.toLowerCase()] = { key: key.toLowerCase(), name, url, site, ts: raw.ts };
      if (nameKey) normalized[key.toLowerCase()].nameKey = nameKey;
      if (linkKey && linkKey !== key.toLowerCase()) normalized[key.toLowerCase()].linkKey = linkKey;
    });
    const keys = Object.keys(normalized);
    if (keys.length > MAX_CHANNELS) keys.sort((a, b) => normalized[a].ts - normalized[b].ts || a.localeCompare(b))
      .slice(0, keys.length - MAX_CHANNELS).forEach(key => delete normalized[key]);
    return normalized;
  }

  function normalizeWatchedShown(value) {
    const normalized = {};
    if (!isObject(value)) return normalized;
    Object.keys(value).forEach(key => {
      const ts = typeof value[key] === "number" ? value[key] : value[key] && value[key].ts;
      if (canonicalUrl(key) === key && Number.isFinite(ts)) normalized[key] = ts;
    });
    const keys = Object.keys(normalized);
    if (keys.length > MAX_WATCHED_SHOWN) keys.sort((a, b) => normalized[a] - normalized[b] || a.localeCompare(b))
      .slice(0, keys.length - MAX_WATCHED_SHOWN).forEach(key => delete normalized[key]);
    return normalized;
  }

  function markWatchedShown(shown, keys, nowMs) {
    const next = { ...normalizeWatchedShown(shown) };
    const ts = Number.isFinite(nowMs) ? nowMs : Date.now();
    (keys || []).forEach(key => { if (canonicalUrl(key) === key) next[key] = ts; });
    return normalizeWatchedShown(next);
  }

  function clearAutoWatched(host) {
    readLists(lists => {
      const site = String(host || "").replace(/^www\./, "");
      const hidden = { ...lists.hidden };
      const watchedShown = { ...lists.watchedShown };
      let changed = false;
      Object.entries(hidden).forEach(([key, entry]) => {
        if (entry && entry.reason === "watched" && String(entry.site || siteOf(key) || "").replace(/^www\./, "") === site) {
          delete hidden[key];
          delete watchedShown[key];
          changed = true;
        }
      });
      if (changed) writeLists({ hidden, watchedShown });
    });
  }

  function listedHidden(hidden) {
    return Object.entries(hidden || {})
      .filter(([, entry]) => entry && entry.listed !== false)
      .sort((left, right) => right[1].ts - left[1].ts || left[0].localeCompare(right[0]));
  }

  function restoreKeys(hidden, keys) {
    const next = { ...(hidden || {}) };
    (keys || []).forEach(key => delete next[key]);
    return next;
  }

  function removeFromList(hidden, keys) {
    const next = { ...(hidden || {}) };
    (keys || []).forEach(key => {
      if (next[key]) {
        next[key] = { ...next[key], listed: false };
      }
    });
    return next;
  }

  function toggleAdded(added, key, meta) {
    const next = { ...(added || {}) };
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      delete next[key];
      return next;
    }
    const normalized = normalizeItems({ [key]: { ...(meta || {}), ts: meta && Number.isFinite(meta.ts) ? meta.ts : Date.now() } }, { max: 1 });
    if (normalized[key]) {
      next[key] = normalized[key];
    }
    return normalizeItems(next, { max: MAX_ADDED });
  }

  function entryType(pair) {
    const entry = pair[1] || {};
    if (TYPES.includes(entry.type)) {
      return entry.type;
    }
    return entry.kind === "short" ? "short" : "video";
  }

  function sortEntries(entries, sortKey, direction, nowMs) {
    const pairs = Array.isArray(entries) ? entries.slice() : [];
    const key = SORT_KEYS.includes(sortKey) ? sortKey : "added";
    const multiplier = direction === "asc" ? 1 : -1;
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const valueFor = entry => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      if (key === "published") {
        if (Number.isFinite(entry.published)) {
          return entry.published;
        }
        return Number.isInteger(entry.year) ? Date.UTC(entry.year, 0, 1) : null;
      }
      if (key === "title" || key === "channel") {
        return typeof entry[key] === "string" ? entry[key] : null;
      }
      if (key === "added") {
        return Number.isFinite(entry.ts) ? entry.ts : null;
      }
      return Number.isFinite(entry[key]) ? entry[key] : null;
    };
    const titleCompare = (left, right) => {
      const leftTitle = left[1] && typeof left[1].title === "string" ? left[1].title : "";
      const rightTitle = right[1] && typeof right[1].title === "string" ? right[1].title : "";
      return leftTitle.localeCompare(rightTitle, undefined, { sensitivity: "base" })
        || String(left[0]).localeCompare(String(right[0]));
    };
    return pairs.map((pair, index) => ({ pair, index, value: valueFor(pair[1]), now }))
      .sort((left, right) => {
        const leftMissing = left.value === null;
        const rightMissing = right.value === null;
        if (leftMissing !== rightMissing) {
          return leftMissing ? 1 : -1;
        }
        if (!leftMissing) {
          let comparison;
          if (key === "title" || key === "channel") {
            comparison = String(left.value).localeCompare(String(right.value), undefined, { sensitivity: "base" });
          } else {
            comparison = left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
          }
          if (comparison) {
            return comparison * multiplier;
          }
        }
        return titleCompare(left.pair, right.pair) || left.index - right.index;
      })
      .map(item => item.pair);
  }

  // Only offer a sort that can change the order for this website: at least two entries carry the value and
  // they differ. "Date published" already falls back to the year, so "Year" is offered only when no entry
  // has an exact publish date (IMDb, Tubi); otherwise the two would sort identically.
  function availableSorts(entries) {
    const pairs = Array.isArray(entries) ? entries : [];
    if (pairs.length < 2) {
      return [];
    }
    const valueFor = (entry, key) => {
      if (key === "added") {
        return Number.isFinite(entry.ts) ? entry.ts : null;
      }
      if (key === "title" || key === "channel") {
        return typeof entry[key] === "string" && entry[key] ? entry[key].toLocaleLowerCase() : null;
      }
      if (key === "published") {
        if (Number.isFinite(entry.published)) {
          return entry.published;
        }
        return Number.isInteger(entry.year) ? Date.UTC(entry.year, 0, 1) : null;
      }
      return Number.isFinite(entry[key]) ? entry[key] : null;
    };
    const changesOrder = key => {
      const values = pairs.map(pair => valueFor(pair[1] || {}, key)).filter(value => value !== null);
      return values.length >= 2 && new Set(values).size >= 2;
    };
    const hasExactDates = pairs.some(pair => pair[1] && Number.isFinite(pair[1].published));
    return SORT_KEYS.filter(key => {
      if (key === "published" && !hasExactDates) {
        return false;
      }
      if (key === "year" && hasExactDates) {
        return false;
      }
      return changesOrder(key);
    });
  }

  function groupEntries(entries, mode) {
    const pairs = Array.isArray(entries) ? entries.slice() : [];
    if (!pairs.length) {
      return [];
    }
    if (mode === "none") {
      const videos = pairs.filter(pair => entryType(pair) !== "short");
      const shorts = pairs.filter(pair => entryType(pair) === "short");
      if (!shorts.length) {
        return [{ id: "video", label: "", entries: videos }];
      }
      return [
        videos.length ? { id: "video", label: "Videos", entries: videos } : null,
        { id: "short", label: "Shorts", entries: shorts }
      ].filter(Boolean);
    }
    if (mode === "type") {
      return TYPES.map(type => ({
        id: type,
        label: typeLabel(type),
        entries: pairs.filter(pair => entryType(pair) === type)
      })).filter(group => group.entries.length);
    }
    if (mode === "genre") {
      const grouped = new Map();
      pairs.forEach(pair => {
        const genres = pair[1] && Array.isArray(pair[1].genres) ? pair[1].genres : [];
        const label = genres[0] || "No genre";
        const id = label.toLocaleLowerCase();
        if (!grouped.has(id)) {
          grouped.set(id, { id: label, label, entries: [] });
        }
        grouped.get(id).entries.push(pair);
      });
      return Array.from(grouped.values()).sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
    }
    if (mode === "channel") {
      const grouped = new Map();
      pairs.forEach(pair => {
        const label = pair[1] && typeof pair[1].channel === "string" && pair[1].channel.trim() ? pair[1].channel.trim() : "No channel";
        const id = label.toLocaleLowerCase();
        if (!grouped.has(id)) grouped.set(id, { id, label, entries: [] });
        grouped.get(id).entries.push(pair);
      });
      return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    }
    if (mode === "added-date") {
      const now = Date.now(); const day = 86400000;
      const buckets = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["earlier", "Earlier"]].map(([id, label]) => ({ id, label, entries: [] }));
      pairs.forEach(pair => { const age = now - Number(pair[1] && pair[1].ts || 0); const at = age < day ? 0 : age < day * 7 ? 1 : age < day * 31 ? 2 : 3; buckets[at].entries.push(pair); });
      return buckets.filter(group => group.entries.length);
    }
    if (mode === "watched-date") {
      const now = Date.now(); const day = 86400000;
      const buckets = [["today", "Today"], ["week", "This week"], ["earlier", "Earlier"]].map(([id, label]) => ({ id, label, entries: [] }));
      pairs.forEach(pair => { const age = now - Number(pair[1] && pair[1].updated || 0); const at = age < day ? 0 : age < day * 7 ? 1 : 2; buckets[at].entries.push(pair); });
      return buckets.filter(group => group.entries.length);
    }
    if (mode === "site") {
      const grouped = new Map();
      pairs.forEach(pair => {
        const site = pair[1] && pair[1].site || siteOf(pair[0]); const label = siteDisplayName(site);
        if (!grouped.has(site)) grouped.set(site, { id: site, label, entries: [] });
        grouped.get(site).entries.push(pair);
      });
      return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    }
    if (mode === "decade" || mode === "rating") {
      const grouped = new Map();
      pairs.forEach(pair => {
        const raw = pair[1] && pair[1][mode === "decade" ? "year" : "rating"];
        const label = mode === "decade" && Number.isInteger(raw) ? `${Math.floor(raw / 10) * 10}s` : (typeof raw === "string" && raw ? raw : mode === "decade" ? "Unknown decade" : "Unrated");
        if (!grouped.has(label)) grouped.set(label, { id: label, label, entries: [] });
        grouped.get(label).entries.push(pair);
      });
      return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label));
    }
    return [{ id: "all", label: "", entries: pairs }];
  }

  // Only offer a grouping that splits this website's videos differently from the default view, which
  // already separates Shorts from other videos: "By type" needs two or more non-Short types, "By genre"
  // needs the videos to fall into at least two genre groups.
  // Card patterns the user taught for a site (legacy rules kept one in cardSelector). A bare tag ("a")
  // matched every link on the page, so it is never counted or used.
  function usablePicks(rule) {
    const list = rule && Array.isArray(rule.pickedSelectors) ? rule.pickedSelectors
      : (rule && typeof rule.cardSelector === "string" && rule.cardSelector ? [rule.cardSelector] : []);
    return list.filter(selector => typeof selector === "string" && selector.trim() && selector.length <= 300
      && !/^\s*[a-z][\w-]*\s*$/i.test(selector));
  }

  // Grouped views follow the chosen sort: groups are ordered by where their first video falls in the
  // sorted list (otherwise one-video genre groups made every sort look like it did nothing). The default
  // Videos/Shorts split and a "No genre" group keep their fixed places.
  function orderGroupsBySort(groups, sortedPairs, mode) {
    if (mode === "none" || !Array.isArray(groups)) {
      return groups;
    }
    const position = new Map((sortedPairs || []).map((pair, index) => [pair[0], index]));
    const first = group => Math.min(...group.entries.map(pair => position.has(pair[0]) ? position.get(pair[0]) : Infinity));
    const ordered = groups.slice().sort((left, right) => first(left) - first(right));
    const noGenre = ordered.filter(group => mode === "genre" && group.label === "No genre");
    return ordered.filter(group => !noGenre.includes(group)).concat(noGenre);
  }

  // The Added and Hidden pages use the same compact sort / direction / grouping controls.
  // Keeping the builder here also keeps their keyboard labels and persistence behaviour in step.
  function makeViewControls(options) {
    const settings = options || {};
    const doc = settings.document;
    if (!doc) return null;
    const slug = String(settings.key || "group").replace(/[^a-z0-9]+/gi, "-") || "group";
    const labels = settings.sortLabels || {};
    const groupLabels = settings.groupLabels || {};
    const controls = doc.createElement("div");
    controls.className = "site-controls";
    const makeSelect = (kind, values, selected) => {
      const select = doc.createElement("select");
      select.id = `${settings.idPrefix || "view"}-${kind}-${slug}`;
      values.forEach(value => {
        const option = doc.createElement("option");
        option.value = value;
        option.textContent = kind === "sort" ? labels[value] : groupLabels[value];
        option.selected = value === selected;
        select.appendChild(option);
      });
      return select;
    };
    const labelFor = (text, control) => {
      const label = doc.createElement("label");
      label.className = "visually-hidden";
      label.htmlFor = control.id;
      label.textContent = text;
      return label;
    };
    const save = changes => { if (typeof settings.onChange === "function") settings.onChange(changes); };
    const sorts = Array.isArray(settings.sorts) ? settings.sorts : [];
    const groups = Array.isArray(settings.groups) ? settings.groups : [];
    if (sorts.length >= 2) {
      const select = makeSelect("sort", sorts, settings.sort);
      select.addEventListener("change", () => save({ sort: select.value, dir: settings.defaultDirection(select.value) }));
      controls.append(labelFor("Sort by", select), select);
    }
    if (sorts.length) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "direction-button";
      button.id = `${settings.idPrefix || "view"}-direction-${slug}`;
      button.textContent = settings.dir === "asc" ? "↑" : "↓";
      const sortLabel = labels[settings.sort] || settings.sort;
      const directionLabel = settings.dir === "asc" ? "ascending" : "descending";
      button.setAttribute("aria-label", `${sorts.length === 1 ? `${sortLabel}, ` : ""}${directionLabel}`);
      button.title = `${sortLabel}: ${directionLabel}`;
      button.addEventListener("click", () => save({ sort: settings.sort, dir: settings.dir === "asc" ? "desc" : "asc" }));
      controls.appendChild(button);
    }
    if (groups.length > 1) {
      const select = makeSelect("group", groups, settings.group);
      select.addEventListener("change", () => save({ group: select.value }));
      controls.append(labelFor("Group by", select), select);
    }
    return controls;
  }

  function availableGroups(entries) {
    const pairs = Array.isArray(entries) ? entries : [];
    const result = ["none"];
    const otherTypes = new Set(pairs.map(entryType).filter(type => type !== "short"));
    if (otherTypes.size >= 2) {
      result.push("type");
    }
    const hasGenres = pairs.some(pair => pair[1] && Array.isArray(pair[1].genres) && pair[1].genres.length);
    if (hasGenres && groupEntries(pairs, "genre").length >= 2) {
      result.push("genre");
    }
    [["channel", "channel"], ["added-date", "ts"], ["decade", "year"], ["rating", "rating"]].forEach(([mode, field]) => {
      const values = pairs.map(pair => pair[1] && pair[1][field]).filter(value => value !== null && value !== undefined && value !== "");
      if (values.length >= 2 && groupEntries(pairs, mode).length >= 2) result.push(mode);
    });
    return result;
  }

  function groupBySite(added) {
    const grouped = new Map();
    Object.entries(added || {}).forEach(([key, entry]) => {
      const site = entry && typeof entry.site === "string" && entry.site ? entry.site : siteOf(key);
      if (!grouped.has(site)) {
        grouped.set(site, []);
      }
      grouped.get(site).push([key, entry]);
    });
    return Array.from(grouped.entries()).map(([site, entries]) => {
      const sorted = sortEntries(entries, "added", "desc");
      const iconEntry = sorted.find(([, entry]) => entry && typeof entry.icon === "string" && entry.icon);
      return { site, name: siteDisplayName(site), icon: iconEntry ? iconEntry[1].icon : "", entries: sorted };
    }).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
      || left.site.localeCompare(right.site));
  }

  function looksLikeHostname(site) {
    if (typeof site !== "string" || !site || site.length > 253 || /[^A-Za-z0-9.-]/.test(site)) {
      return false;
    }
    return site.split(".").every(label => label.length >= 1 && label.length <= 63
      && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
  }

  function normalizePrefs(value) {
    const result = {};
    if (!isObject(value)) {
      return result;
    }
    let siteCount = 0;
    for (const site of Object.keys(value)) {
      if (site !== "__page" && siteCount >= 200) {
        continue;
      }
      if ((!looksLikeHostname(site) && site !== "continue-watching" && site !== "__page") || !isObject(value[site])) {
        continue;
      }
      const raw = value[site];
      if (site === "__page") {
        const selectedTab = typeof raw.selectedTab === "string" && (raw.selectedTab === "continue-watching" || looksLikeHostname(raw.selectedTab))
          ? raw.selectedTab : "";
        Object.defineProperty(result, site, { value: {
          grouping: raw.grouping === "tabs" ? "tabs" : "none",
          sort: raw.sort === "recent" ? "recent" : "name",
          dir: raw.dir === "asc" || raw.dir === "desc" ? raw.dir : raw.sort === "recent" ? "desc" : "asc",
          selectedTab
        }, enumerable: true, writable: true, configurable: true });
        continue;
      }
      const pref = {
        sort: SORT_KEYS.includes(raw.sort) ? raw.sort : "added",
        dir: raw.dir === "asc" || raw.dir === "desc" ? raw.dir : raw.sort === "title" ? "asc" : "desc",
        group: ["type", "genre", "channel", "added-date", "decade", "rating", "site", "watched-date"].includes(raw.group) ? raw.group : "none",
        collapsed: typeof raw.collapsed === "boolean" ? raw.collapsed : false
      };
      Object.defineProperty(result, site, { value: pref, enumerable: true, writable: true, configurable: true });
      siteCount += 1;
    }
    return result;
  }

  function backupHostname(value) {
    return typeof value === "string" && /^[a-z0-9.-]{1,253}$/i.test(value);
  }

  function sanitizeBackupRules(value) {
    const result = {};
    if (!isObject(value)) {
      return result;
    }
    Object.keys(value).forEach(host => {
      if (!backupHostname(host) || !isObject(value[host])) {
        return;
      }
      const raw = value[host];
      const rule = {};
      ["enabled", "pendingPick", "bulkHide", "featuredCarousels"].forEach(field => {
        if (typeof raw[field] === "boolean") {
          rule[field] = raw[field];
        }
      });
      if (raw.scheme === "http" || raw.scheme === "https") {
        rule.scheme = raw.scheme;
      }
      if (typeof raw.cardSelector === "string" && raw.cardSelector.length <= 300) {
        rule.cardSelector = raw.cardSelector;
      }
      if (typeof raw.linkSelector === "string" && raw.linkSelector.length <= 300) {
        rule.linkSelector = raw.linkSelector;
      }
      if (Array.isArray(raw.pickedSelectors)) {
        rule.pickedSelectors = usablePicks({ pickedSelectors: raw.pickedSelectors })
          .slice(0, 12);
      }
      const hideKinds = normalizeHideKinds(raw.hideKinds);
      const hideKeywords = normalizeKeywords(raw.hideKeywords);
      if (Array.isArray(raw.hideKinds)) {
        rule.hideKinds = hideKinds;
      }
      if (Array.isArray(raw.hideKeywords)) {
        rule.hideKeywords = hideKeywords;
      }
      if (Array.isArray(raw.hideSections)) rule.hideSections = normalizeSectionTitles(raw.hideSections);
      result[host] = rule;
    });
    return result;
  }

  function sanitizeBackupPrefs(value) {
    const result = {};
    if (!isObject(value)) {
      return result;
    }
    Object.keys(value).forEach(site => {
      if ((!backupHostname(site) && site !== "__page") || !isObject(value[site])) {
        return;
      }
      const raw = value[site];
      if (site === "__page") {
        const pref = {};
        if (raw.grouping === "none" || raw.grouping === "tabs") pref.grouping = raw.grouping;
        if (raw.sort === "name" || raw.sort === "recent") pref.sort = raw.sort;
        if (raw.dir === "asc" || raw.dir === "desc") pref.dir = raw.dir;
        if (typeof raw.selectedTab === "string" && (raw.selectedTab === "continue-watching" || backupHostname(raw.selectedTab))) pref.selectedTab = raw.selectedTab;
        result[site] = pref;
        return;
      }
      const pref = {};
      ["sort", "dir", "group"].forEach(field => {
        if (typeof raw[field] === "string" && raw[field].length <= 20) {
          pref[field] = raw[field];
        }
      });
      if (typeof raw.collapsed === "boolean") {
        pref.collapsed = raw.collapsed;
      }
      result[site] = pref;
    });
    return result;
  }

  function sanitizeBackupHiddenPrefs(value) {
    const result = {};
    if (!isObject(value)) return result;
    Object.keys(value).forEach(site => {
      if ((!backupHostname(site) && site !== "watched-videos") || !isObject(value[site])) return;
      const raw = value[site];
      const pref = {};
      ["sort", "dir", "group"].forEach(field => {
        if (typeof raw[field] === "string" && raw[field].length <= 20) pref[field] = raw[field];
      });
      if (typeof raw.collapsed === "boolean") pref.collapsed = raw.collapsed;
      result[site] = pref;
    });
    return result;
  }

  function sanitizeBackupSeenRows(value) {
    const result = {};
    if (!isObject(value)) return result;
    Object.keys(value).forEach(host => {
      if (!backupHostname(host) || !Array.isArray(value[host])) return;
      result[host] = normalizeSectionTitles(value[host]).slice(-150);
    });
    return result;
  }

  function prepareUnhideAll(lists, nowMs) {
    const source = isObject(lists) ? lists : {};
    const watchedKeys = [
      ...Object.entries(normalizeItems(source.hidden, { max: MAX_HIDDEN, withListed: true }))
        .filter(([, entry]) => entry.reason === "watched").map(([key]) => key),
      ...Object.entries(normalizeProgress(source.watchProgress)).filter(([, entry]) => entry.watched).map(([key]) => key)
    ];
    return { hidden: {}, watchedShown: markWatchedShown(source.watchedShown, watchedKeys, nowMs) };
  }

  function clearWatchHistory(lists) {
    const source = isObject(lists) ? lists : {};
    const hidden = normalizeItems(source.hidden, { max: MAX_HIDDEN, withListed: true });
    Object.keys(hidden).forEach(key => { if (hidden[key].reason === "watched") delete hidden[key]; });
    // Watch Later is deliberately user-curated, not watch history.
    return { hidden, watchedShown: {}, watchProgress: {}, watchLater: normalizeWatchLater(source.watchLater) };
  }

  function buildBackup(data, version, nowMs) {
    const source = isObject(data) ? data : {};
    const timestamp = Number.isFinite(nowMs) ? nowMs : Date.now();
    return {
      app: "AddOrHide",
      format: 1,
      version,
      exportedAt: new Date(timestamp).toISOString(),
      hiddenItems: normalizeItems(source.hidden, { max: MAX_HIDDEN, withListed: true }),
      hiddenChannels: normalizeChannels(source.channels),
      watchedShown: normalizeWatchedShown(source.watchedShown),
      watchProgress: normalizeProgress(source.watchProgress),
      watchLater: normalizeWatchLater(source.watchLater),
      seenRows: sanitizeBackupSeenRows(source.seenRows),
      hiddenViewPrefs: sanitizeBackupHiddenPrefs(source.hiddenViewPrefs),
      watchSettings: normalizeWatchSettings(source.watchSettings),
      addedItems: normalizeItems(source.added, { max: MAX_ADDED }),
      siteRules: sanitizeBackupRules(source.siteRules),
      addedViewPrefs: sanitizeBackupPrefs(source.prefs)
    };
  }

  function parseBackup(text) {
    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      return { ok: false, error: "The backup is not valid JSON." };
    }
    if (!isObject(value) || value.app !== "AddOrHide") {
      return { ok: false, error: "This is not an AddOrHide backup." };
    }
    if (value.format !== 1) {
      return { ok: false, error: "This backup format is not supported." };
    }
    const required = ["hiddenItems", "addedItems", "siteRules", "addedViewPrefs"];
    if (required.some(key => !isObject(value[key]))) {
      return { ok: false, error: "The backup is missing required data." };
    }
    return {
      ok: true,
      backup: {
        app: "AddOrHide",
        format: 1,
        version: value.version,
        exportedAt: value.exportedAt,
        hiddenItems: normalizeItems(value.hiddenItems, { max: MAX_HIDDEN, withListed: true }),
        hiddenChannels: normalizeChannels(value.hiddenChannels),
        watchedShown: normalizeWatchedShown(value.watchedShown),
        watchProgress: normalizeProgress(value.watchProgress),
        watchLater: normalizeWatchLater(value.watchLater),
        seenRows: sanitizeBackupSeenRows(value.seenRows),
        hiddenViewPrefs: sanitizeBackupHiddenPrefs(value.hiddenViewPrefs),
        watchSettings: isObject(value.watchSettings) ? normalizeWatchSettings(value.watchSettings) : null,
        addedItems: normalizeItems(value.addedItems, { max: MAX_ADDED }),
        siteRules: sanitizeBackupRules(value.siteRules),
        addedViewPrefs: sanitizeBackupPrefs(value.addedViewPrefs)
      }
    };
  }

  function sameBackupValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function mergeBackupItems(current, imported, options) {
    const currentItems = normalizeItems(current, options);
    const importedItems = normalizeItems(imported, options);
    const merged = { ...currentItems };
    let count = 0;
    Object.keys(importedItems).forEach(key => {
      const existing = merged[key];
      if (!existing || importedItems[key].ts > existing.ts) {
        merged[key] = importedItems[key];
        if (!existing || !sameBackupValue(existing, importedItems[key])) {
          count += 1;
        }
      }
    });
    return { items: normalizeItems(merged, options), count };
  }

  function mergeBackupWatchLater(current, imported) {
    const merged = { ...normalizeWatchLater(current) };
    let count = 0;
    Object.entries(normalizeWatchLater(imported)).forEach(([key, entry]) => {
      if (!merged[key] || entry.ts > merged[key].ts) {
        if (!merged[key] || !sameBackupValue(merged[key], entry)) count += 1;
        merged[key] = entry;
      }
    });
    return { items: normalizeWatchLater(merged), count };
  }

  function mergeBackupChannels(current, imported) {
    const merged = { ...normalizeChannels(current) };
    Object.entries(normalizeChannels(imported)).forEach(([key, entry]) => {
      if (!merged[key] || entry.ts > merged[key].ts) merged[key] = entry;
    });
    return normalizeChannels(merged);
  }

  function mergeBackup(current, backup) {
    const source = isObject(current) ? current : {};
    const imported = isObject(backup) ? backup : {};
    const hiddenResult = mergeBackupItems(source.hidden, imported.hiddenItems,
      { max: MAX_HIDDEN, withListed: true });
    const addedResult = mergeBackupItems(source.added, imported.addedItems,
      { max: MAX_ADDED, withListed: false });
    // Channel records are not video items, so normalise the merged result with their dedicated schema.
    const channels = mergeBackupChannels(source.channels, imported.hiddenChannels);
    const watchedShown = normalizeWatchedShown({ ...normalizeWatchedShown(source.watchedShown), ...normalizeWatchedShown(imported.watchedShown) });
    const watchProgress = normalizeProgress({ ...normalizeProgress(source.watchProgress), ...normalizeProgress(imported.watchProgress) });
    const watchLaterResult = mergeBackupWatchLater(source.watchLater, imported.watchLater);
    const seenRows = sanitizeBackupSeenRows(source.seenRows);
    Object.entries(sanitizeBackupSeenRows(imported.seenRows)).forEach(([host, rows]) => {
      seenRows[host] = normalizeSectionTitles([...(seenRows[host] || []), ...rows]).slice(-150);
    });
    const hiddenViewPrefs = { ...sanitizeBackupHiddenPrefs(source.hiddenViewPrefs) };
    Object.entries(sanitizeBackupHiddenPrefs(imported.hiddenViewPrefs)).forEach(([site, pref]) => {
      hiddenViewPrefs[site] = { ...(hiddenViewPrefs[site] || {}), ...pref };
    });
    const sourceWatchSettings = normalizeWatchSettings(source.watchSettings);
    const watchSettings = imported.watchSettings === null || imported.watchSettings === undefined
      ? sourceWatchSettings : normalizeWatchSettings({ ...sourceWatchSettings, ...imported.watchSettings });
    const siteRules = isObject(source.siteRules) ? { ...source.siteRules } : {};
    let siteCount = 0;
    const importedRules = sanitizeBackupRules(imported.siteRules);
    Object.keys(importedRules).forEach(host => {
      const before = isObject(siteRules[host]) ? siteRules[host] : undefined;
      const next = { ...(before || {}), ...importedRules[host] };
      if (Array.isArray(importedRules[host].pickedSelectors)) {
        const picks = [...(Array.isArray(before && before.pickedSelectors) ? before.pickedSelectors : []),
          ...importedRules[host].pickedSelectors];
        next.pickedSelectors = Array.from(new Set(picks.filter(selector => typeof selector === "string"
          && selector.length <= 300))).slice(0, 12);
      }
      siteRules[host] = next;
      if (!before || !sameBackupValue(before, next)) {
        siteCount += 1;
      }
    });
    const prefs = isObject(source.prefs) ? { ...source.prefs } : {};
    const importedPrefs = sanitizeBackupPrefs(imported.addedViewPrefs);
    Object.keys(importedPrefs).forEach(site => {
      const before = isObject(prefs[site]) ? prefs[site] : {};
      const next = { ...before, ...importedPrefs[site] };
      prefs[site] = next;
    });
    return {
      hidden: hiddenResult.items,
      added: addedResult.items,
      channels: normalizeChannels(channels),
      watchedShown,
      watchProgress,
      watchLater: watchLaterResult.items,
      seenRows,
      hiddenViewPrefs,
      watchSettings,
      siteRules,
      prefs,
      counts: { added: addedResult.count, hidden: hiddenResult.count, ...(watchLaterResult.count ? { watchLater: watchLaterResult.count } : {}), sites: siteCount }
    };
  }

  function safeHref(url) {
    return canonicalUrl(url) || null;
  }

  function readLists(callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      cb({ hidden: {}, added: {}, channels: {}, watchedShown: {}, watchProgress: {}, watchLater: {} });
      return;
    }
    chrome.storage.local.get({ [HIDDEN_KEY]: {}, [ADDED_KEY]: {}, [CHANNELS_KEY]: {}, [WATCHED_SHOWN_KEY]: {}, [PROGRESS_KEY]: {}, [WATCH_LATER_KEY]: {} }, result => {
      cb({
        hidden: normalizeItems(result[HIDDEN_KEY], { max: MAX_HIDDEN, withListed: true }),
        added: normalizeItems(result[ADDED_KEY], { max: MAX_ADDED, withListed: false }),
        channels: normalizeChannels(result[CHANNELS_KEY]),
        watchedShown: normalizeWatchedShown(result[WATCHED_SHOWN_KEY]),
        watchProgress: normalizeProgress(result[PROGRESS_KEY]),
        watchLater: normalizeWatchLater(result[WATCH_LATER_KEY])
      });
    });
  }

  function writeLists(lists, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      cb();
      return;
    }
    const payload = {};
    if (lists && Object.prototype.hasOwnProperty.call(lists, "hidden")) {
      payload[HIDDEN_KEY] = normalizeItems(lists.hidden, { max: MAX_HIDDEN, withListed: true });
    }
    if (lists && Object.prototype.hasOwnProperty.call(lists, "added")) {
      payload[ADDED_KEY] = normalizeItems(lists.added, { max: MAX_ADDED, withListed: false });
    }
    if (lists && Object.prototype.hasOwnProperty.call(lists, "channels")) payload[CHANNELS_KEY] = normalizeChannels(lists.channels);
    if (lists && Object.prototype.hasOwnProperty.call(lists, "watchedShown")) payload[WATCHED_SHOWN_KEY] = normalizeWatchedShown(lists.watchedShown);
    if (lists && Object.prototype.hasOwnProperty.call(lists, "watchProgress")) payload[PROGRESS_KEY] = normalizeProgress(lists.watchProgress);
    if (lists && Object.prototype.hasOwnProperty.call(lists, "watchLater")) payload[WATCH_LATER_KEY] = normalizeWatchLater(lists.watchLater);
    chrome.storage.local.set(payload, cb);
  }

  function readPrefs(callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      cb({});
      return;
    }
    chrome.storage.local.get({ [PREFS_KEY]: {} }, result => cb(normalizePrefs(result[PREFS_KEY])));
  }

  function writePrefs(prefs, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      cb();
      return;
    }
    chrome.storage.local.set({ [PREFS_KEY]: normalizePrefs(prefs) }, cb);
  }

  function purgeLegacy() {
    if (typeof chrome === "undefined" || !chrome.storage) {
      return;
    }
    if (chrome.storage.local) {
      chrome.storage.local.remove(["cardMemory", "restoredVideos"]);
    }
    if (chrome.storage.sync) {
      chrome.storage.sync.remove(["mode", "replaceStyle", "videos"]);
    }
  }

  return {
    HIDDEN_KEY,
    CHANNELS_KEY,
    WATCHED_SHOWN_KEY,
    ADDED_KEY,
    SITES_KEY,
    SEEN_ROWS_KEY,
    PROGRESS_KEY,
    WATCH_LATER_KEY,
    WATCH_SETTINGS_KEY,
    PREFS_KEY,
    THEME_KEY,
    BUTTON_EDGE_KEY,
    BUTTONS_ENABLED_KEY,
    MIN_RESUME_SECONDS,
    buttonsEnabledOf,
    buttonEdgeOf,
    themeOf,
    normalizeHideKinds,
    normalizeSectionTitles,
    normalizeKeywords,
    keywordMatch,
    MAX_HIDDEN,
    MAX_WATCHED_SHOWN,
    MAX_ADDED,
    MAX_TITLE,
    MAX_URL,
    HOSTED_ADDED_URL,
    PLAYER_URL,
    SUPPORT_URL,
    canonicalUrl,
    playerFor,
    playerSiteName,
    siteOf,
    kindOf,
    typeOf,
    parseDuration,
    parseViews,
    parseVotes,
    parseScore,
    parseRelativeAge,
    parseYear,
    parseDate,
    splitGenres,
    siteDisplayName,
    hiddenSummaryText,
    addedCountText,
    addedSummaryText,
    siteMonogram,
    typeLabel,
    formatDuration,
    formatViews,
    formatScore,
    formatVotes,
    formatAge,
    cleanTitle,
    sortEntries,
    availableSorts,
    groupEntries,
    availableGroups,
    usablePicks,
    orderGroupsBySort,
    makeViewControls,
    groupBySite,
    normalizePrefs,
    youtubeThumb,
    normalizeItems,
    normalizeProgress,
    normalizeWatchLater,
    normalizeWatchSettings,
    bitmapBuckets,
    bucketCount,
    writeProgress,
    mergeProgressEntry,
    normalizeChannels,
    normalizeWatchedShown,
    youtubeChannelKey,
    channelKeyFromHref: youtubeChannelKey,
    channelNameKey,
    channelLinkKey,
    markWatchedShown,
    clearAutoWatched,
    prepareUnhideAll,
    clearWatchHistory,
    buildBackup,
    parseBackup,
    mergeBackup,
    listedHidden,
    restoreKeys,
    removeFromList,
    toggleAdded,
    safeHref,
    readLists,
    writeLists,
    readPrefs,
    writePrefs,
    purgeLegacy
  };
})());

if (typeof module !== "undefined") {
  module.exports = HOA;
}
