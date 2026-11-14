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
  const CARD_LINKS_KEY = "cardLinks";
  const WATCHED_PARKED_KEY = "watchedParked";
  const WATCH_SETTINGS_KEY = "watchSettings";
  const MAX_HIDDEN = 1000;
  const MAX_CHANNELS = 500;
  const MAX_WATCHED_SHOWN = 1000;
  const MAX_ADDED = 500;
  const MAX_PROGRESS = 1500;
  const MAX_WATCH_LATER = 1500;
  const MAX_CARD_LINKS = 2000;
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
      // A saved live stream has no length (see watchLiveVideo in content.js).
      const live = raw.live === true && duration === 0;
      if (!Number.isFinite(duration) || (duration < 20 && !live) || duration > 1000000 || !Number.isFinite(position) || position < 0) return;
      const updated = Number(raw.updated);
      if (!Number.isFinite(updated)) return;
      const title = typeof raw.title === "string" ? raw.title.trim().slice(0, MAX_TITLE) : fallbackTitle(key);
      const thumb = typeof raw.thumbnail === "string" && raw.thumbnail.length <= MAX_URL && (!raw.thumbnail || validHttpUrl(raw.thumbnail)) ? raw.thumbnail : "";
      const entry = { site: siteOf(canonical), title: title || fallbackTitle(canonical), url: canonical, thumbnail: thumb, duration, position: Math.min(position, duration), buckets: bitmapBuckets(raw.buckets), watched: raw.watched === true, ts: Number.isFinite(raw.ts) ? raw.ts : updated, updated };
      if (Number.isFinite(Number(raw.played)) && Number(raw.played) >= 0) entry.played = Number(raw.played);
      if (raw.untagged === true) entry.untagged = true;
      if (raw.unlisted === true) entry.unlisted = true;
      if (live) entry.live = true;
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
  const TEXT_COLLATOR = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const LEADING_SORT_DECORATION = /^[\s\p{Cf}"'“”‘’`()[\]{}<>«»‹›〈〉《》「」『』【】〔〕﴾﴿]+/u;

  function compareText(left, right) {
    const leftRaw = String(left == null ? "" : left);
    const rightRaw = String(right == null ? "" : right);
    const leftText = leftRaw.replace(LEADING_SORT_DECORATION, "");
    const rightText = rightRaw.replace(LEADING_SORT_DECORATION, "");
    // Keep Latin site/title labels together before Arabic labels; the collator still
    // supplies locale-aware, numeric ordering within either script.
    const script = text => /^[\u0600-\u06ff]/u.test(text) ? 1 : 0;
    const scriptComparison = script(leftText) - script(rightText);
    if (scriptComparison) return scriptComparison;
    const comparison = TEXT_COLLATOR.compare(leftText, rightText);
    if (comparison) return comparison;
    return leftRaw < rightRaw ? -1 : leftRaw > rightRaw ? 1 : 0;
  }
  const TYPES = ["video", "short", "playlist", "movie", "tv", "live", "past", "clip", "music", "sport", "person", "category", "genre", "other"];
  const SORT_KEYS = ["added", "published", "views", "votes", "score", "duration", "title", "year", "channel"];
  const TYPE_LABELS = Object.freeze({
    video: "Video",
    short: "Short",
    playlist: "Playlist",
    movie: "Movie",
    tv: "TV",
    live: "Live",
    past: "Past broadcast",
    clip: "Clip",
    music: "Music",
    sport: "Sport",
    person: "Person",
    category: "Category",
    genre: "Genre",
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
    "app.roku.com": "The Roku Channel",
    "amazon.com": "Prime Video",
    "watch.plex.tv": "Plex",
    "plex.tv": "Plex",
    "cartoony.net": "Cartoony",
    "carateen.tv": "Carateen",
    "filmrise.com": "FilmRise",
    "fawesome.tv": "Fawesome",
    "tubitv.com": "Tubi",
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

  const HOST_ALIASES = Object.freeze({ "therokuchannel.roku.com": "app.roku.com" });

  function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function isYoutubeWatch(url) {
    return YOUTUBE_HOSTS.has(url.hostname) && url.pathname === "/watch";
  }

  const PRIME_DETAIL = /^https?:\/\/(?:www\.)?(?:amazon\.com\/(?:gp\/video\/)?detail\/|primevideo\.com\/(?:[^/]+\/)?detail\/)/i;
  // Addresses that changed shape: entries saved under the old one move to the new one.
  const movesKey = key => Boolean(HOST_ALIASES[siteHostname(key)] || PRIME_DETAIL.test(key));

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
    if (HOST_ALIASES[url.hostname]) url.hostname = HOST_ALIASES[url.hostname];
    const hostname = url.hostname;
    // Prime Video titles: the code after "?" only says which row the link was in.
    if (PRIME_DETAIL.test(url.href)) url.search = "";
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
      if (url.pathname === "/playlist") {
        const list = url.searchParams.get("list");
        if (!list) return null;
        return `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`;
      }
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

  function isChannelUrl(value) {
    let url;
    try {
      url = new URL(value, "https://www.youtube.com");
    } catch (error) {
      return false;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const segments = url.pathname.split("/").filter(Boolean);
    const first = (segments[0] || "").toLowerCase();
    if (isCategoryUrl(url.href)) return false;
    // Never let an otherwise plausible channel path turn a video into a channel.
    if (["shorts", "watch", "video", "videos"].includes(first)) return false;
    const hasSingleSegment = () => segments.length === 1 && Boolean(segments[0]);
    const oneChannelPath = prefixes => prefixes.includes(first) && Boolean(segments[1]) && segments.length <= 3;
    if (host === "youtube.com") return oneChannelPath(["@", "channel", "c", "user"])
      || (/^@[^/]+$/i.test(segments[0] || "") && segments.length <= 2);
    if (host === "twitch.tv") return hasSingleSegment() && !["directory", "videos", "downloads", "settings", "subscriptions", "inventory", "wallet", "drops", "p", "jobs", "turbo", "search", "friends", "following", "prime"].includes(first);
    if (host === "kick.com") return hasSingleSegment() && !["browse", "categories", "following", "search", "category", "video"].includes(first);
    if (host === "rumble.com") return oneChannelPath(["c", "user"]);
    if (host === "odysee.com") return /^@[^/]+$/i.test(segments[0] || "") && segments.length === 1;
    if (host === "dailymotion.com") return hasSingleSegment() && !["video", "playlist", "search", "us", "library", "following"].includes(first);
    const videoTab = ["shorts", "watch", "video", "videos"].includes((segments[2] || "").toLowerCase());
    return !videoTab && (oneChannelPath(["@", "c", "channel", "channels", "user", "profile"])
      || (/^@[^/]+$/i.test(segments[0] || "") && segments.length <= 2));
  }

  function isCategoryUrl(value) {
    let url;
    try {
      url = new URL(value, "https://www.youtube.com");
    } catch (error) {
      return false;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const segments = url.pathname.split("/").filter(Boolean);
    const first = (segments[0] || "").toLowerCase();
    if (segments.some(segment => segment.toLowerCase() === "details")) return false;
    if (["shorts", "watch", "video", "videos"].includes(first)) return false;
    const hasCategoryPath = (prefixes, start = 0) => prefixes.includes((segments[start] || "").toLowerCase())
      && Boolean(segments[start + 1]) && segments.length >= start + 2 && segments.length <= start + 3;
    if (host === "twitch.tv") {
      if (hasCategoryPath(["category", "game", "event"], 1)
        && (segments[0] || "").toLowerCase() === "directory") {
        return true;
      }
    }
    return hasCategoryPath(["category", "categories", "browse", "genre", "genres", "tag", "tags", "topic", "topics", "collection", "collections"]);
  }

  function cardKey(origin, title) {
    let base;
    try { base = new URL(origin).origin; } catch (error) { return ""; }
    const slug = String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug ? `${base}/hoa-card/${slug}` : "";
  }

  function isHoaCardKey(key) {
    try { return new URL(key).pathname.startsWith("/hoa-card/"); } catch (error) { return false; }
  }

  function normalizeCardLinks(value) {
    const normalized = {};
    if (!isObject(value)) return normalized;
    Object.keys(value).forEach(key => {
      const link = canonicalUrl(value[key]);
      try {
        if (isHoaCardKey(key) && link && new URL(key).origin === new URL(link).origin) normalized[key] = link;
      } catch (error) { /* ignore malformed origins */ }
    });
    const keys = Object.keys(normalized);
    return keys.length <= MAX_CARD_LINKS ? normalized : Object.fromEntries(keys.slice(-MAX_CARD_LINKS).map(key => [key, normalized[key]]));
  }

  function isPlayerSurface(element, pageUrl) {
    if (!element || !element.querySelectorAll) return false;
    const videos = element.matches && element.matches("video") ? [element] : Array.from(element.querySelectorAll("video"));
    if (!videos.length || (element.closest && element.closest("a[href]"))) return false;
    let current;
    try { current = new URL(pageUrl || location.href).href; } catch (error) { current = ""; }
    const links = Array.from(element.querySelectorAll("a[href]"));
    if (links.some(link => {
      let href = "";
      try { href = new URL(link.href || link.getAttribute("href"), pageUrl || location.href).href; } catch (error) { return true; }
      return !isChannelUrl(href) && href !== current;
    })) return false;
    const box = element.getBoundingClientRect();
    const area = Math.max(0, box.width) * Math.max(0, box.height);
    if (!area) return false;
    return videos.some(video => {
      if (video.closest && video.closest("a[href]")) return false;
      const rect = video.getBoundingClientRect();
      const left = Math.max(box.left, rect.left); const right = Math.min(box.right, rect.right);
      const top = Math.max(box.top, rect.top); const bottom = Math.min(box.bottom, rect.bottom);
      return Math.max(0, right - left) * Math.max(0, bottom - top) >= area / 2;
    });
  }

  // Every card on every pass asks this, and each answer costs several URL parses.
  const kindCache = new Map();
  const VIDEO_PATHS = new Set(["watch", "play", "player", "embed", "v", "video", "videos", "clip", "clips", "live"]);
  const TITLE_PATHS = new Set(["details", "detail", "title", "titles", "movie", "movies", "film", "films", "series", "show", "shows", "tv", "tv-shows", "free-movies"]);
  const CARD_LINK_WORDS = new Set(["shorts", ...VIDEO_PATHS, ...TITLE_PATHS,
    "category", "categories", "browse", "genre", "genres", "tag", "tags", "topic", "topics", "collection", "collections",
    "channel", "channels", "user", "profile"]);

  const PERSON_PATHS = new Set(["person", "people", "persons", "actor", "actors", "director", "directors", "producer", "producers", "writer", "writers", "composer", "composers", "cinematography", "editor", "editors", "crew", "celebrity", "celebrities", "talent", "filmography"]);

  // An actor's or director's page: /person/name, also after a language or country part (/en-GB/person/name), and IMDb's /name/nm123.
  function isPersonUrl(value) {
    try {
      const segments = new URL(value).pathname.split("/").filter(Boolean).map(segment => segment.toLowerCase());
      const start = /^[a-z]{2}(?:-[a-z]{2})?$/.test(segments[0] || "") ? 1 : 0;
      if (!segments[start + 1]) return false;
      if (segments[start] === "name") return /^nm\d+$/.test(segments[start + 1]);
      return segments.some((segment, index) => PERSON_PATHS.has(segment) && Boolean(segments[index + 1]));
    } catch (error) {
      return false;
    }
  }

  function kindOf(url) {
    const known = kindCache.get(url);
    if (known) return known;
    let kind = "video";
    try {
      const parsed = new URL(url);
      if (isPersonUrl(parsed.href)) kind = "person";
      else if (isCategoryUrl(parsed.href)) kind = "category";
      else if (isChannelUrl(parsed.href)) kind = "channel";
      else if (YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.pathname.startsWith("/shorts/")) kind = "short";
      else {
        const segments = parsed.pathname.split("/").filter(Boolean).map(segment => segment.toLowerCase());
        if (!VIDEO_PATHS.has(segments[0]) && !segments.some(segment => segment === "watch")
          && (TITLE_PATHS.has(segments[0]) || segments.some(segment => segment === "details"))) kind = "title";
      }
    } catch (error) {
      kind = "video";
    }
    if (kindCache.size >= 2000) kindCache.clear();
    kindCache.set(url, kind);
    return kind;
  }

  function chooseCardLink(card, preferred) {
    if (!card || !card.querySelectorAll) return preferred || null;
    const excluded = link => Boolean(link && link.closest && link.closest(".hoa-actions, #hoa-toast, #hoa-banner"));
    if (!preferred) {
      const candidates = [
        ...(card.matches && card.matches("a[href]") ? [card] : []),
        ...Array.from(card.querySelectorAll("a[href]"))
      ].filter(link => !excluded(link));
      const picture = card.querySelector("img, picture, video");
      return (picture && candidates.find(link => (link.contains && link.contains(picture)) || (picture.contains && picture.contains(link))))
        || candidates[0] || null;
    }
    if (kindOf(preferred.href || preferred.getAttribute("href") || "") !== "title") return preferred;
    const candidates = [
      ...(card.matches && card.matches("a[href]") ? [card] : []),
      ...Array.from(card.querySelectorAll("a[href]"))
    ].filter(link => !excluded(link));
    const idsFor = link => {
      try {
        const url = new URL(link.href || link.getAttribute("href") || "", typeof location === "undefined" ? "https://www.youtube.com" : location.href);
        return [...url.pathname.split("/").filter(Boolean), ...url.searchParams.values()]
          .map(value => value.toLowerCase()).filter(value => value.length >= 6 && !CARD_LINK_WORDS.has(value));
      } catch (error) {
        return [];
      }
    };
    const preferredIds = new Set(idsFor(preferred));
    const sharesContent = link => idsFor(link).some(id => preferredIds.has(id));
    const textFor = link => `${link.getAttribute("href") || ""} ${link.getAttribute("aria-label") || ""} ${link.getAttribute("title") || ""} ${link.textContent || ""}`;
    const hasPlayEvidence = link => {
      for (let node = link; node && card.contains(node); node = node.parentElement) {
        const itemtype = node.getAttribute && node.getAttribute("itemtype") || "";
        const itemprop = node.getAttribute && node.getAttribute("itemprop") || "";
        const label = `${node.getAttribute && node.getAttribute("class") || ""} ${node.getAttribute && node.getAttribute("title") || ""} ${node.getAttribute && node.getAttribute("aria-label") || ""}`;
        if (/WatchAction$/i.test(itemtype) || /(^|\s)potentialAction(\s|$)/i.test(itemprop) || /play/i.test(label)) return true;
        if (node === card) break;
      }
      return false;
    };
    const isSameDoor = link => link !== preferred && sharesContent(link) && !/trailer|preview/i.test(textFor(link));
    // Invalid nested anchors can make a cloned details link appear inside the play
    // overlay. Prefer an actual player URL before falling back to visual play evidence.
    return candidates.find(link => isSameDoor(link) && kindOf(link.href || link.getAttribute("href") || "") === "video")
      || candidates.find(link => isSameDoor(link) && hasPlayEvidence(link)) || preferred;
  }

  const typeCache = new Map();
  function typeOf(url) {
    const known = typeCache.get(url);
    if (known) return known;
    const type = linkType(url);
    if (typeCache.size >= 2000) typeCache.clear();
    typeCache.set(url, type);
    return type;
  }

  function linkType(url) {
    if (isPersonUrl(url)) return "person";
    if (isCategoryUrl(url)) return "category";
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (host === "twitch.tv" || host === "kick.com") {
        if (/^\/videos\/\d+(?:\/|$)/.test(path) || /^\/[^/]+\/videos\/\d+(?:\/|$)/.test(path)) return "past";
        if (/^\/clips?\/[^/]+(?:\/|$)/.test(path) || /^\/[^/]+\/clips?\/[^/]+(?:\/|$)/.test(path)) return "clip";
        if (/^\/[^/]+\/?$/.test(path) && isChannelUrl(parsed.href)) return "live";
      }
      if (host === "clips.twitch.tv" && /^\/[^/]+\/?$/.test(path)) return "clip";
      if (host === "watch.shout-tv.com" && /^\/section\/[^/]+(?:\/|$)/.test(path)) return "genre";
      // The Roku Channel plays a movie at /watch; a series opens a page of seasons and episodes at /details.
      if (["therokuchannel.roku.com", "app.roku.com"].includes(parsed.hostname.toLowerCase())) {
        if (path.startsWith("/watch/")) return "movie";
        if (path.startsWith("/details/")) return "tv";
      }
      const youtube = YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())
        || parsed.hostname.toLowerCase().endsWith(".youtube.com");
      if ((youtube && parsed.pathname === "/playlist" && parsed.searchParams.get("list"))
        || /^\/playlists?\/[^/]+/i.test(parsed.pathname)) {
        return "playlist";
      }
      if (youtube && /(^|\/)shorts(?:\/|$)/.test(path)) {
        return "short";
      }
      if (/(^|\/)(?:free-)?movies?(?:\/|$)/.test(path)) {
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

  function normalizeRating(value) {
    const text = String(value || "").trim().toUpperCase();
    if (/^(?:NOT\s*RATED|UNRATED|NR|UR)$/.test(text)) return "NR";
    const normalized = text.replace(/[\s-]/g, "");
    if (!/^(?:TVY7(?:FV)?|TVY|TVG|TVPG|TV14|TVMA|G|PG|PG13|R|NC17|X|12\+|16\+|18\+|7\+)$/.test(normalized)) return "";
    return ({ TVY: "TV-Y", TVY7: "TV-Y7", TVY7FV: "TV-Y7", TVG: "TV-G", TVPG: "TV-PG", TV14: "TV-14", TVMA: "TV-MA", PG13: "PG-13", NC17: "NC-17" })[normalized] || normalized;
  }

  function roleFromText(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const roles = { actor: "Actor", actress: "Actor", acting: "Actor", director: "Director", directing: "Director", writer: "Writer", writing: "Writer", producer: "Producer", production: "Producer", composer: "Composer", cinematographer: "Cinematographer", camera: "Cinematographer", editor: "Editor", editing: "Editor", creator: "Creator", host: "Host" };
    return roles[text.toLowerCase()] || "Actor";
  }

  const GENRE_TRANSLATIONS = Object.freeze({
    accion: "Action", acao: "Action", azione: "Action", action: "Action",
    aventura: "Adventure", aventure: "Adventure", abenteuer: "Adventure", adventure: "Adventure",
    comedia: "Comedy", comedie: "Comedy", commedia: "Comedy", komodie: "Comedy", comedy: "Comedy",
    drama: "Drama", drame: "Drama", dramma: "Drama",
    terror: "Horror", horreur: "Horror", orrore: "Horror", horror: "Horror",
    suspenso: "Thriller", suspense: "Thriller", thriller: "Thriller",
    "ciencia ficcion": "Science Fiction", "ficcao cientifica": "Science Fiction", "science fiction": "Science Fiction", fantascienza: "Science Fiction",
    fantasia: "Fantasy", fantastique: "Fantasy", fantasy: "Fantasy",
    romance: "Romance", romantico: "Romance", romantique: "Romance",
    documental: "Documentary", documentario: "Documentary", documentaire: "Documentary", dokumentation: "Documentary",
    animacion: "Animation", animacao: "Animation", animazione: "Animation", animation: "Animation",
    infantil: "Kids", infantiles: "Kids", ninos: "Kids", kids: "Kids",
    familia: "Family", famille: "Family", famiglia: "Family", family: "Family",
    crimen: "Crime", crime: "Crime", policial: "Crime",
    misterio: "Mystery", mystere: "Mystery", mystery: "Mystery",
    musical: "Music", musica: "Music", music: "Music",
    deportes: "Sports", esportes: "Sports", sports: "Sports",
    telenovela: "Telenovela", novelas: "Telenovela",
    reality: "Reality", belico: "War", guerra: "War", war: "War",
    western: "Western", occidental: "Western", historia: "History", history: "History"
  });

  function genreKey(value) {
    return String(value || "").trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  }

  function englishGenre(name) {
    const value = String(name || "").trim();
    return GENRE_TRANSLATIONS[genreKey(value)] || value;
  }

  function translatedGenres(values) {
    const result = [];
    const seen = new Set();
    (Array.isArray(values) ? values : []).forEach(value => String(value || "").split("/").map(part => part.trim()).filter(Boolean).forEach(part => {
      const translated = englishGenre(part);
      const key = genreKey(translated);
      if (translated && !seen.has(key) && result.length < 5) {
        seen.add(key);
        result.push(translated);
      }
    }));
    return result;
  }

  function metadataOnly(text) {
    const rest = String(text || "")
      .replace(/\b(?:19|20)\d{2}\b/g, " ")
      .replace(/\b\d+\s*h(?:rs?|ours?)?(?![a-z])|\b\d+\s*m(?:ins?|inutes?)?(?![a-ce-z])/gi, " ")
      .replace(/\b(?:G|PG|PG-13|R|NC-17|NR|UR|TV-?(?:Y7?|Y7-?FV|G|PG|14|MA)|Unrated|Not Rated|HD|4K|UHD|CC|AD)\b/gi, " ")
      .replace(/(?:Details|More info|Watch now|Trailer|Season[s]?\s*\d*|\d+\s*Seasons?)/gi, " ")
      .replace(/[·•|,\-–—:()[\]]/g, " ").replace(/\s+/g, " ").trim();
    return !rest;
  }

  function looksLikeBadge(text) {
    return /^(\d{1,2}:){1,2}\d{2}$/.test(text) || /^(live|new|shorts?)$/i.test(text)
      || /^(?:video(?: card| thumbnail)?|card|thumbnail|poster|image|play(?: video| now)?|watch(?: now| video)?|more info|details|now playing|free to watch|trending|most liked|new episodes?)$/i.test(text)
      || metadataOnly(text);
  }

  function weakName(title, key) {
    return !title || title === siteOf(key) || looksLikeBadge(title);
  }

  function pageInfo(doc, key) {
    const info = {};
    if (!doc || !doc.querySelectorAll) return info;
    const meta = selector => { const node = doc.querySelector(selector); return node ? (node.getAttribute("content") || "").trim() : ""; };
    const absolute = value => { try { const url = new URL(value, key); return /^https?:$/.test(url.protocol) && url.href.length <= MAX_URL ? url.href : ""; } catch (error) { return ""; } };
    const items = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const walk = value => { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") { items.push(value); if (value["@graph"]) walk(value["@graph"]); } };
        walk(JSON.parse(script.textContent));
      } catch (error) { /* not JSON */ }
    });
    const typeOf = item => [].concat(item["@type"] || []).map(String);
    const main = items.find(item => typeOf(item).some(type => /^(Movie|TVSeries|TVSeason|TVEpisode|Episode|VideoObject|Person|CreativeWork|Clip)$/.test(type))) || {};
    const types = typeOf(main);
    if (types.some(type => type === "Movie")) info.type = "movie";
    else if (types.some(type => /^(TVSeries|TVSeason|TVEpisode|Episode)$/.test(type))) info.type = "tv";
    else if (types.includes("Person")) info.type = "person";
    if (types.includes("Person")) {
      const job = String(main.jobTitle || "").trim();
      if (job) info.role = roleFromText(job);
    }
    const scripts = () => Array.from(doc.querySelectorAll("script:not([src])")).map(script => script.textContent || "").join("\n").slice(0, 2000000);
    const scriptText = scripts();
    const normalizedScript = scriptText.replace(/\\"/g, '"');
    const vixType = (normalizedScript.match(/"videoType"\s*:\s*"(MOVIE|SERIES|SHOW|EPISODE)"/i) || [])[1];
    if (!info.type && vixType) info.type = vixType.toUpperCase() === "MOVIE" ? "movie" : "tv";
    if (!info.type && /(?:^|\.)vix\.com$/i.test(siteOf(key)) && /\/detail\/series-/i.test(new URL(key).pathname)) info.type = "tv";
    // ViX keeps the title right before videoType in its page data; elsewhere the first "title" in a script is often the site's.
    const inlineTitle = vixType ? (normalizedScript.match(/"title"\s*:\s*"([^"\\]{1,200})"\s*,\s*"videoType"/i) || [])[1] : "";
    const name = typeof main.name === "string" ? main.name : "";
    const ogTitle = meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || (doc.title || "");
    info.title = cleanTitle(name || inlineTitle || ogTitle.replace(/\s+[|–—-]\s+[^|–—-]+$/, "")).slice(0, MAX_TITLE);
    const pageText = () => {
      if (!doc.body) return "";
      const parts = []; let size = 0; const view = doc.defaultView;
      const filter = view && view.NodeFilter ? view.NodeFilter.SHOW_TEXT : 4;
      const walker = doc.createTreeWalker(doc.body, filter);
      for (let node = walker.nextNode(); node && size < 300000; node = walker.nextNode()) { if (node.parentElement && node.parentElement.closest("script, style, noscript")) continue; parts.push(node.nodeValue); size += node.nodeValue.length; }
      return parts.join(" ").replace(/\s+/g, " ");
    };
    const yearIn = (text, pattern) => { const match = String(text || "").match(pattern); return match ? match[1] : ""; };
    const badge = doc.querySelector('[data-automation-id="release-year-badge"], [data-testid="release-year-badge"]');
    const date = [main.datePublished, main.dateCreated, main.startDate, main.releaseDate, main.copyrightYear,
      main.releasedEvent && main.releasedEvent.startDate, meta('meta[itemprop="datePublished"]'), meta('meta[property="video:release_date"]'), badge && badge.textContent,
      () => yearIn(scriptText, /"(?:releaseYear|release_year|productionYear|production_year|releaseDate|release_date|originalReleaseDate|premiereDate|firstAirDate|first_air_date|releaseTime)"\s*:\s*\[?\s*"?((?:18|19|20)\d{2})\b/),
      () => yearIn(pageText(), /\b(?:Release(?:d| year| date)?|Year|Premiered|First aired)\s*:?\s*((?:18|19|20)\d{2})\b/i),
      () => yearIn(pageText(), /\b((?:18|19|20)\d{2})\s*[•·]/),
      () => yearIn(pageText(), /\b((?:18|19|20)\d{2})\s*(?=[•·|]\s*(?:TV-?(?:Y7?|G|PG|14|MA)|G|PG-?13|R|NC-?17)|\d+\s*(?:h|hr))/i),
      () => yearIn(scriptText, /"year"\s*:\s*"?((?:18|19|20)\d{2})\b/),
      // Any language: a metadata cell holding only a year (ViX: <span class="DetailBody_metadataItem…">2016</span>).
      () => { const cell = Array.from(doc.querySelectorAll('[class*="metadata" i]')).find(node => node.childElementCount === 0 && /^(?:18|19|20)\d{2}$/.test((node.textContent || "").trim()));
        return cell ? cell.textContent.trim() : ""; },
      main.uploadDate]
      .map(value => String((typeof value === "function" ? value() : value) || "")).find(value => /\b(?:18|19|20)\d{2}\b/.test(value));
    const year = Number((date && date.match(/\b(?:18|19|20)\d{2}\b/)[0]) || 0);
    if (year && year >= 1870 && year <= new Date().getFullYear() + 1) info.year = year;
    const inlineRating = (normalizedScript.match(/"(?:contentRating|mpaaRating|maturityRating|rating|ratingValue)"\s*:\s*"([^"\\]+)"/i) || [])[1];
    const rating = normalizeRating(main.contentRating || inlineRating);
    if (rating) info.rating = rating;
    const rawGenres = main.genre || (normalizedScript.match(/"(?:genres|genre)"\s*:\s*(\[[^\]]*\]|"[^"]+")/i) || [])[1];
    let genres = translatedGenres(HOA_splitGenres(Array.isArray(rawGenres) ? rawGenres.join(",") : String(rawGenres || "").replace(/[\[\]"]/g, "")));
    if (!genres.length) {
      const selectors = ['a[href*="/generos/"]', 'a[href*="/genero/"]', 'a[href*="/genres/"]', 'a[href*="/genre/"]', 'a[href*="/generi/"]', 'a[href*="/genres?"]'];
      const linked = selectors.flatMap(selector => Array.from(doc.querySelectorAll(selector)).map(node => (node.textContent || "").trim()).filter(Boolean));
      genres = translatedGenres(linked);
    }
    if (genres.length) info.genres = genres;
    if (info.type === "person" && !info.role) {
      const department = (normalizedScript.match(/"known_for_department"\s*:\s*"([^"\\]+)"/i) || [])[1];
      if (department) info.role = roleFromText(department);
    }
    const image = [].concat(main.image || []).map(value => (value && typeof value === "object" ? value.url : value)).find(value => typeof value === "string");
    info.thumb = absolute(image || meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]'));
    return info;
  }

  function HOA_splitGenres(text) {
    return splitGenres(text);
  }

  function enrichPatch(saved, info, key) {
    const entry = isObject(saved) ? saved : {};
    const details = isObject(info) ? info : {};
    const patch = {};
    const plain = String(entry.title || "").replace(/…$/, "");
    const ours = / – (.+)$/.exec(plain);
    const better = details.title && !weakName(details.title, key) && details.title !== entry.title
      && (weakName(entry.title, key) || plain.includes(details.title) || (ours && (details.title.startsWith(ours[1]) || ours[1].startsWith(details.title))));
    if (better) patch.title = details.title;
    const year = patch.year || entry.year || details.year;
    const named = patch.title || entry.title || "";
    if (year && named.endsWith(` (${year})`)) patch.title = named.slice(0, -` (${year})`.length);
    if (!entry.year && Number.isInteger(details.year) && details.year >= 1870 && details.year <= 2100) patch.year = details.year;
    if (!entry.thumb && details.thumb) patch.thumb = details.thumb;
    if (details.type && (!entry.type || entry.type === "video" || (entry.type === "live" && details.type === "past"))) patch.type = details.type;
    if (!entry.rating && details.rating) patch.rating = details.rating;
    if ((!Array.isArray(entry.genres) || !entry.genres.length) && Array.isArray(details.genres) && details.genres.length) patch.genres = details.genres;
    if (entry.type === "person" && !entry.role && details.role) patch.role = details.role;
    patch.enrichedAt = Date.now();
    return patch;
  }

  function needsEnrich(entry, key) {
    if (!entry || !isObject(entry)) return false;
    if (Number.isFinite(entry.enrichedAt) && Date.now() - entry.enrichedAt < 7 * 86400000) return false;
    const storedKind = typeof entry.kind === "string" ? entry.kind : "";
    const kind = storedKind || kindOf(key);
    const type = entry.type || typeOf(key);
    const nonYoutube = siteOf(key) !== "youtube.com";
    return kind !== "channel" && kind !== "category" && !["playlist", "genre", "category", "live"].includes(type) && !isHoaCardKey(key)
      && (!entry.thumb || (!entry.year && kind !== "person") || (nonYoutube && (!Array.isArray(entry.genres) || !entry.genres.length || !entry.type || entry.type === "video"))
        || !entry.title || entry.title === siteOf(key) || looksLikeBadge(entry.title) || / – /.test(entry.title || ""));
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

  // A site's own name, not its address: known ones by name, others from the address ("cartoony.net" is Cartoony).
  function siteDisplayName(site) {
    const hostname = siteHostname(site);
    if (SITE_NAMES[hostname]) return SITE_NAMES[hostname];
    const parts = String(hostname || "").split(".").filter(Boolean);
    if (parts.length < 2 || /^\d+$/.test(parts[parts.length - 1])) return hostname;
    const names = parts.slice(0, -1).filter(part => !["www", "app", "watch", "play", "m", "tv", "web", "en", "co", "com"].includes(part));
    const name = names[names.length - 1] || parts[parts.length - 2];
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : hostname;
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
      return "No hidden items.";
    }
    return withSites(count === 1 ? "There is 1 hidden item" : `There are ${count} hidden items`, sites);
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

  function roleLabel(entry, fallbackType) {
    const type = entry && entry.type || fallbackType || "";
    if (type === "person" && entry && typeof entry.role === "string" && entry.role.trim()) return entry.role.trim();
    return typeLabel(type);
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
    // "Anna Pigeon [TV Series]" (Fandango at Home): the bracket says what it is, which the type already does.
    return value.replace(/^(?:\d{1,3}\. |#\d+ )/, "").replace(/\s*\[(?:TV Series|TV Show|Series|Movie|Film|TV Movie)\]$/i, "");
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
    if (Number.isFinite(raw.enrichedAt) && raw.enrichedAt >= 0) {
      target.enrichedAt = raw.enrichedAt;
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
    if (typeof raw.role === "string") {
      const role = raw.role.trim();
      if (role.length >= 1 && role.length <= 80) target.role = role;
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
    Object.keys(value).forEach(savedKey => {
      // Saved under an address the site has since moved from: kept, under the new one.
      const moved = canonicalUrl(savedKey);
      const key = moved && moved !== savedKey && movesKey(savedKey) ? moved : savedKey;
      if (canonicalUrl(key) !== key && !isHoaCardKey(key)) {
        return;
      }
      const raw = value[savedKey];
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
        // Shorts are an explicit historical choice. Everything else follows the URL
        // so saved channels migrate into their own section without a data rewrite.
        kind: ["video", "short", "channel", "category", "person", "title"].includes(raw.kind) ? raw.kind : kindOf(key),
        site: siteOf(key),
        ts: raw.ts
      };
      addOptionalFields(normalized[key], raw);
      // Live cards on Kick/Twitch historically saved their channel door as a channel item.
      // Preserve those entries as live videos so they remain with the site's video group.
      if ((siteOf(key) === "kick.com" || siteOf(key) === "twitch.tv") && normalized[key].kind === "channel"
        && isSingleSegmentLiveKey(key)) {
        normalized[key].kind = "video";
        normalized[key].type = "live";
        if (!title || title.toLowerCase() === "true") {
          normalized[key].title = liveSlug(key);
        }
      }
      // Items saved before their site's types were known say "video"; the link can tell better.
      if (raw.kind === "category") normalized[key].type = "category";
      if (!normalized[key].type || normalized[key].type === "video") {
        const linkType = typeOf(key);
        if (linkType !== "video") normalized[key].type = linkType;
      }
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

  function isSingleSegmentLiveKey(key) {
    try {
      const url = new URL(key);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      const segments = url.pathname.split("/").filter(Boolean);
      return (host === "kick.com" || host === "twitch.tv") && segments.length === 1 && isChannelUrl(url.href);
    } catch (error) {
      return false;
    }
  }

  function liveSlug(key) {
    try {
      return decodeURIComponent(new URL(key).pathname.split("/").filter(Boolean)[0] || "").trim().toLowerCase();
    } catch (error) {
      return "";
    }
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
      if (!title || seen.has(key) || result.length >= 300) return;
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
      const moved = canonicalUrl(key);
      const target = moved && moved !== key && movesKey(key) ? moved : key;
      if (canonicalUrl(target) === target && Number.isFinite(ts)) normalized[target] = ts;
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

  // Watched was turned on or off for a site: a fresh start for its watched videos. Videos restored or removed from
  // the list under the old setting follow the new one. Off returns the auto-hidden ones to the feed; a video known
  // only from YouTube's own red bar has no watch record to come back from, so it waits here until Watched is on again.
  function resetWatched(host, turnedOff) {
    readLists(lists => {
      const site = String(host || "").replace(/^www\./, "");
      const onSite = (key, entry) => String((entry && entry.site) || siteOf(key) || "").replace(/^www\./, "") === site;
      const hidden = { ...lists.hidden };
      const watchedShown = { ...lists.watchedShown };
      const watchProgress = { ...lists.watchProgress };
      const watchedParked = { ...lists.watchedParked };
      const untagged = key => Boolean(watchProgress[key] && watchProgress[key].untagged);
      const changed = {};
      Object.entries(hidden).forEach(([key, entry]) => {
        if (!entry || !onSite(key, entry)) return;
        if (turnedOff && entry.reason === "watched") {
          if (!(watchProgress[key] && watchProgress[key].watched) && !untagged(key)) { watchedParked[key] = { ...entry, listed: true }; changed.watchedParked = true; }
          delete hidden[key]; changed.hidden = true;
        } else if (!turnedOff && entry.listed === false && isWatchedRecord(key, entry, watchProgress)) {
          hidden[key] = { ...entry, listed: true }; changed.hidden = true;
        }
      });
      if (!turnedOff) {
        Object.entries(watchedParked).forEach(([key, entry]) => {
          if (!onSite(key, entry)) return;
          if (!hidden[key] && !untagged(key)) { hidden[key] = { ...entry, listed: true }; changed.hidden = true; }
          delete watchedParked[key]; changed.watchedParked = true;
        });
      }
      Object.keys(watchedShown).forEach(key => { if (onSite(key)) { delete watchedShown[key]; changed.watchedShown = true; } });
      Object.entries(watchProgress).forEach(([key, entry]) => {
        if (entry && entry.unlisted && onSite(key, entry)) { const { unlisted, ...rest } = entry; watchProgress[key] = rest; changed.watchProgress = true; }
      });
      const payload = {};
      if (changed.hidden) payload.hidden = hidden;
      if (changed.watchedShown) payload.watchedShown = watchedShown;
      if (changed.watchProgress) payload.watchProgress = watchProgress;
      if (changed.watchedParked) payload.watchedParked = watchedParked;
      if (Object.keys(payload).length) writeLists(payload);
    });
  }

  function clearAutoWatched(host) { resetWatched(host, true); }

  // Whether this site hides watched videos, so they belong on the Hidden Videos list.
  function watchedHiddenOn(siteRules, site) {
    const bare = String(site || "").replace(/^www\./, "");
    return Object.entries(siteRules || {}).some(([host, rule]) => host.replace(/^www\./, "") === bare && rule
      && rule.enabled !== false && Array.isArray(rule.hideKinds) && rule.hideKinds.includes("watched"));
  }

  function listedHidden(hidden) {
    return Object.entries(hidden || {})
      .filter(([, entry]) => entry && entry.listed !== false)
      .sort((left, right) => right[1].ts - left[1].ts || left[0].localeCompare(right[0]));
  }

  // A hidden record that belongs in Watched Videos, however it got hidden: a video hidden by hand and watched later too.
  function isWatchedRecord(key, entry, progress) {
    const seen = progress && progress[key];
    return Boolean(entry && (entry.reason === "watched" || entry.watched === true || (seen && seen.watched && !seen.untagged)));
  }

  // Whether Watched Videos really lists this video. The player button uses it, so it can never claim otherwise.
  function inWatchedList(key, hidden, progress, shown, siteRules) {
    const record = hidden && hidden[key];
    if (record) return record.listed !== false && isWatchedRecord(key, record, progress);
    return watchedOnlyKeys(progress && progress[key] ? { [key]: progress[key] } : {}, hidden, shown, siteRules).length > 0;
  }

  // Listed under Watched Videos with no hidden record of their own. Restored or removed ones stay off, and so do
  // videos on sites where Watched is off: those stay in the feed with their Watched tag, so nothing is hidden.
  function watchedOnlyKeys(progress, hidden, shown, siteRules) {
    return Object.keys(progress || {}).filter(key => {
      const entry = progress[key];
      return entry && entry.watched && !entry.untagged && !entry.unlisted && !(hidden && hidden[key]) && !(shown && shown[key])
        && (siteRules === undefined || watchedHiddenOn(siteRules, entry.site || siteOf(key)));
    });
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
      return compareText(leftTitle, rightTitle) || compareText(String(left[0]), String(right[0]));
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
            comparison = compareText(String(left.value), String(right.value));
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

  // Group headings read as Title Case ("Science Fiction", "Voice Actors", "This Week"). Only a word's first
  // letter is raised, so names such as "TV" or "iCarly"-style spellings keep their own capitals; short joining
  // words stay lower case unless they open or close the heading.
  const TITLE_SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "the", "to", "vs", "with"]);
  function titleCase(text) {
    const words = String(text || "").split(" ");
    return words.map((word, index) => word.split("-").map((part, partIndex) => {
      const edge = index === 0 || index === words.length - 1 || partIndex > 0;
      if (!edge && TITLE_SMALL_WORDS.has(part.toLocaleLowerCase())) return part.toLocaleLowerCase();
      return part.charAt(0).toLocaleUpperCase() + part.slice(1);
    }).join("-")).join(" ");
  }

  // "Director of photography" -> "Directors of photography": the noun before "of"/"for"/"in" is the one
  // that takes the plural. Already-plural roles ("Guests") keep their spelling.
  function pluralNoun(word) {
    const lower = word.toLocaleLowerCase();
    const irregular = { person: "people", self: "selves", child: "children" };
    if (irregular[lower]) return word.charAt(0) + irregular[lower].slice(1);
    if (/(wo)?man$/i.test(word)) return word.replace(/an$/i, match => match[0] === "A" ? "EN" : "en");
    if (/s$/i.test(word)) return word;
    if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
    if (/(x|z|ch|sh)$/i.test(word)) return `${word}es`;
    return `${word}s`;
  }
  function pluralRole(role) {
    const match = /^(.*?)(\s+(?:of|for|in|on|at|to|with)\s.*)$/i.exec(role);
    const head = match ? match[1] : role;
    const tail = match ? match[2] : "";
    const words = head.split(" ");
    words[words.length - 1] = pluralNoun(words[words.length - 1]);
    return words.join(" ") + tail;
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
      const nonPeople = TYPES.filter(type => type !== "person").map(type => ({
        id: type,
        label: { movie: "Movies", tv: "TV Shows", past: "Past Broadcasts", clip: "Clips", genre: "Genres" }[type] || typeLabel(type),
        entries: pairs.filter(pair => entryType(pair) === type)
      })).filter(group => group.entries.length);
      const people = new Map();
      pairs.filter(pair => entryType(pair) === "person").forEach(pair => {
        const role = pair[1] && typeof pair[1].role === "string" && pair[1].role.trim() ? pair[1].role.trim() : "Person";
        const label = role === "Person" ? "People" : titleCase(pluralRole(role));
        if (!people.has(label)) people.set(label, { id: `person:${role.toLocaleLowerCase()}`, label, entries: [] });
        people.get(label).entries.push(pair);
      });
      return [...nonPeople, ...Array.from(people.values()).sort((a, b) => compareText(a.label, b.label))];
    }
    if (mode === "genre") {
      const grouped = new Map();
      pairs.forEach(pair => {
        const genres = pair[1] && Array.isArray(pair[1].genres) ? pair[1].genres : [];
        const label = genres[0] ? titleCase(genres[0]) : "No Genre";
        const id = label.toLocaleLowerCase();
        if (!grouped.has(id)) {
          grouped.set(id, { id: genres[0] || "No genre", label, entries: [] });
        }
        grouped.get(id).entries.push(pair);
      });
      return Array.from(grouped.values()).sort((left, right) => compareText(left.label, right.label));
    }
    if (mode === "channel") {
      const grouped = new Map();
      pairs.forEach(pair => {
        const label = pair[1] && typeof pair[1].channel === "string" && pair[1].channel.trim() ? pair[1].channel.trim() : "No Channel";
        const id = label.toLocaleLowerCase();
        if (!grouped.has(id)) grouped.set(id, { id, label, entries: [] });
        grouped.get(id).entries.push(pair);
      });
      return Array.from(grouped.values()).sort((a, b) => compareText(a.label, b.label));
    }
    if (mode === "added-date") {
      const now = Date.now(); const day = 86400000;
      const buckets = [["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["earlier", "Earlier"]].map(([id, label]) => ({ id, label, entries: [] }));
      pairs.forEach(pair => { const age = now - Number(pair[1] && pair[1].ts || 0); const at = age < day ? 0 : age < day * 7 ? 1 : age < day * 31 ? 2 : 3; buckets[at].entries.push(pair); });
      return buckets.filter(group => group.entries.length);
    }
    if (mode === "watched-date") {
      const now = Date.now(); const day = 86400000;
      const buckets = [["today", "Today"], ["week", "This Week"], ["earlier", "Earlier"]].map(([id, label]) => ({ id, label, entries: [] }));
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
      return Array.from(grouped.values()).sort((a, b) => compareText(a.label, b.label));
    }
    if (mode === "decade" || mode === "rating") {
      const grouped = new Map();
      pairs.forEach(pair => {
        const raw = pair[1] && pair[1][mode === "decade" ? "year" : "rating"];
        const label = mode === "decade" && Number.isInteger(raw) ? `${Math.floor(raw / 10) * 10}s` : (typeof raw === "string" && raw ? raw : mode === "decade" ? "Unknown Decade" : "Unrated");
        if (!grouped.has(label)) grouped.set(label, { id: label, label, entries: [] });
        grouped.get(label).entries.push(pair);
      });
      const ratingOrder = ["G", "TV-Y", "TV-Y7", "TV-G", "PG", "TV-PG", "PG-13", "TV-14", "R", "TV-MA", "NC-17"];
      const compare = (a, b) => {
        if (mode !== "rating") return compareText(a.label, b.label);
        const left = ratingOrder.indexOf(a.label); const right = ratingOrder.indexOf(b.label);
        const leftOrder = left < 0 ? (a.label === "Unrated" ? 1000 : 100) : left;
        const rightOrder = right < 0 ? (b.label === "Unrated" ? 1000 : 100) : right;
        return leftOrder - rightOrder || compareText(a.label, b.label);
      };
      return Array.from(grouped.values()).sort(compare);
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
  // Videos/Shorts split and a "No Genre" group keep their fixed places.
  function orderGroupsBySort(groups, sortedPairs, mode) {
    if (mode === "none" || !Array.isArray(groups)) {
      return groups;
    }
    const position = new Map((sortedPairs || []).map((pair, index) => [pair[0], index]));
    const first = group => Math.min(...group.entries.map(pair => position.has(pair[0]) ? position.get(pair[0]) : Infinity));
    const ordered = groups.slice().sort((left, right) => first(left) - first(right));
    const noGenre = ordered.filter(group => mode === "genre" && group.label === "No Genre");
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
    if (otherTypes.size >= 2 || pairs.some(pair => !["video", "short"].includes(entryType(pair)))) {
      result.push("type");
    }
    const hasGenres = pairs.some(pair => pair[1] && Array.isArray(pair[1].genres) && pair[1].genres.length);
    if (hasGenres) {
      result.push("genre");
    }
    [["channel", "channel"], ["added-date", "ts"], ["decade", "year"], ["rating", "rating"]].forEach(([mode, field]) => {
      const values = pairs.map(pair => pair[1] && pair[1][field]).filter(value => value !== null && value !== undefined && value !== "");
      if (mode === "added-date" ? values.length >= 2 && groupEntries(pairs, mode).length >= 2 : values.length >= 1) result.push(mode);
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
    }).sort((left, right) => compareText(left.name, right.name) || compareText(left.site, right.site));
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
      if ((!looksLikeHostname(site) && !["continue-watching", "watch-later", "added-channels", "__page"].includes(site)) || !isObject(value[site])) {
        continue;
      }
      const raw = value[site];
      if (site === "__page") {
        const selectedTab = typeof raw.selectedTab === "string" && (["continue-watching", "watch-later", "channels"].includes(raw.selectedTab) || looksLikeHostname(raw.selectedTab))
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
        sort: SORT_KEYS.includes(raw.sort) || raw.sort === "site" ? raw.sort : "added",
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
    Object.keys(hidden).forEach(key => { if (hidden[key].reason === "watched") delete hidden[key]; else delete hidden[key].watched; });
    // Watch Later is deliberately user-curated, not watch history.
    // A card's address is only worth keeping while something saved still uses it.
    const kept = new Set([...Object.keys(hidden), ...Object.keys(isObject(source.added) ? source.added : {}), ...Object.keys(normalizeWatchLater(source.watchLater))]);
    const cardLinks = Object.fromEntries(Object.entries(normalizeCardLinks(source.cardLinks)).filter(([, link]) => kept.has(link)));
    return { hidden, watchedShown: {}, watchProgress: {}, watchLater: normalizeWatchLater(source.watchLater), cardLinks, watchedParked: {} };
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
      cardLinks: normalizeCardLinks(source.cardLinks),
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
        cardLinks: normalizeCardLinks(value.cardLinks),
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
    const cardLinks = normalizeCardLinks({ ...normalizeCardLinks(source.cardLinks), ...normalizeCardLinks(imported.cardLinks) });
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
      cardLinks,
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

  function openUrl(key) {
    if (isHoaCardKey(key)) {
      try { return new URL(key).origin + "/"; } catch (error) { return null; }
    }
    return safeHref(key);
  }

  function readLists(callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      cb({ hidden: {}, added: {}, channels: {}, watchedShown: {}, watchProgress: {}, watchLater: {}, cardLinks: {}, watchedParked: {} });
      return;
    }
    chrome.storage.local.get({ [HIDDEN_KEY]: {}, [ADDED_KEY]: {}, [CHANNELS_KEY]: {}, [WATCHED_SHOWN_KEY]: {}, [PROGRESS_KEY]: {}, [WATCH_LATER_KEY]: {}, [CARD_LINKS_KEY]: {}, [WATCHED_PARKED_KEY]: {} }, result => {
      cb({
        hidden: normalizeItems(result[HIDDEN_KEY], { max: MAX_HIDDEN, withListed: true }),
        added: normalizeItems(result[ADDED_KEY], { max: MAX_ADDED, withListed: false }),
        channels: normalizeChannels(result[CHANNELS_KEY]),
        watchedShown: normalizeWatchedShown(result[WATCHED_SHOWN_KEY]),
        watchProgress: normalizeProgress(result[PROGRESS_KEY]),
        watchLater: normalizeWatchLater(result[WATCH_LATER_KEY]),
        cardLinks: normalizeCardLinks(result[CARD_LINKS_KEY]),
        watchedParked: normalizeItems(result[WATCHED_PARKED_KEY], { max: MAX_HIDDEN, withListed: true })
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
    if (lists && Object.prototype.hasOwnProperty.call(lists, "cardLinks")) payload[CARD_LINKS_KEY] = normalizeCardLinks(lists.cardLinks);
    if (lists && Object.prototype.hasOwnProperty.call(lists, "watchedParked")) payload[WATCHED_PARKED_KEY] = normalizeItems(lists.watchedParked, { max: MAX_HIDDEN, withListed: true });
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
    CARD_LINKS_KEY,
    WATCHED_PARKED_KEY,
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
    MAX_CARD_LINKS,
    MAX_TITLE,
    MAX_URL,
    HOSTED_ADDED_URL,
    PLAYER_URL,
    SUPPORT_URL,
    canonicalUrl,
    compareText,
    playerFor,
    playerSiteName,
    siteOf,
    cardKey,
    isHoaCardKey,
    normalizeCardLinks,
    kindOf,
    isPersonUrl,
    chooseCardLink,
    isChannelUrl,
    isCategoryUrl,
    isPlayerSurface,
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
    normalizeRating,
    roleFromText,
    englishGenre,
    pageInfo,
    enrichPatch,
    needsEnrich,
    roleLabel,
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
    resetWatched,
    isWatchedRecord,
    inWatchedList,
    watchedHiddenOn,
    prepareUnhideAll,
    clearWatchHistory,
    buildBackup,
    parseBackup,
    mergeBackup,
    listedHidden,
    watchedOnlyKeys,
    restoreKeys,
    removeFromList,
    toggleAdded,
    safeHref,
    openUrl,
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
