"use strict";

// var, not const: the popup re-injects this file (picker, Enable) into pages that already have it,
// and a second const declaration in the same content-script world throws and aborts the injection.
var HOA = Object.freeze((() => {
  const HIDDEN_KEY = "hiddenItems";
  const ADDED_KEY = "addedItems";
  const SITES_KEY = "siteRules";
  const MAX_HIDDEN = 1000;
  const MAX_ADDED = 500;
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
  const SORT_KEYS = ["added", "published", "views", "votes", "score", "duration", "title", "year"];
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
    "dailymotion.com": "Dailymotion"
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

  function hiddenSummaryText(count) {
    if (!Number.isInteger(count) || count <= 0) {
      return "No hidden videos.";
    }
    return count === 1 ? "There is 1 hidden video." : `There are ${count} hidden videos.`;
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
      }
    });
    const keys = Object.keys(normalized);
    if (keys.length > max) {
      keys.sort((left, right) => normalized[left].ts - normalized[right].ts || left.localeCompare(right));
      keys.slice(0, keys.length - max).forEach(key => delete normalized[key]);
    }
    return normalized;
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

  function groupByKind(entries) {
    const result = { video: [], short: [] };
    Object.entries(entries || {}).forEach(pair => {
      result[pair[1] && pair[1].kind === "short" ? "short" : "video"].push(pair);
    });
    return result;
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
      if (key === "title") {
        return typeof entry.title === "string" ? entry.title : null;
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
          if (key === "title") {
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
      if (key === "title") {
        return typeof entry.title === "string" && entry.title ? entry.title.toLocaleLowerCase() : null;
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
    for (const site of Object.keys(value)) {
      if (Object.keys(result).length >= 200) {
        break;
      }
      if (!looksLikeHostname(site) || !isObject(value[site])) {
        continue;
      }
      const raw = value[site];
      const pref = {
        sort: SORT_KEYS.includes(raw.sort) ? raw.sort : "added",
        dir: raw.dir === "asc" || raw.dir === "desc" ? raw.dir : raw.sort === "title" ? "asc" : "desc",
        group: raw.group === "type" || raw.group === "genre" ? raw.group : "none",
        collapsed: typeof raw.collapsed === "boolean" ? raw.collapsed : false
      };
      Object.defineProperty(result, site, { value: pref, enumerable: true, writable: true, configurable: true });
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
      ["enabled", "pendingPick", "bulkHide"].forEach(field => {
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
      if (!backupHostname(site) || !isObject(value[site])) {
        return;
      }
      const raw = value[site];
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

  function buildBackup(data, version, nowMs) {
    const source = isObject(data) ? data : {};
    const timestamp = Number.isFinite(nowMs) ? nowMs : Date.now();
    return {
      app: "AddOrHide",
      format: 1,
      version,
      exportedAt: new Date(timestamp).toISOString(),
      hiddenItems: normalizeItems(source.hidden, { max: MAX_HIDDEN, withListed: true }),
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

  function mergeBackup(current, backup) {
    const source = isObject(current) ? current : {};
    const imported = isObject(backup) ? backup : {};
    const hiddenResult = mergeBackupItems(source.hidden, imported.hiddenItems,
      { max: MAX_HIDDEN, withListed: true });
    const addedResult = mergeBackupItems(source.added, imported.addedItems,
      { max: MAX_ADDED, withListed: false });
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
      siteRules,
      prefs,
      counts: { added: addedResult.count, hidden: hiddenResult.count, sites: siteCount }
    };
  }

  function safeHref(url) {
    return canonicalUrl(url) || null;
  }

  function readLists(callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      cb({ hidden: {}, added: {} });
      return;
    }
    chrome.storage.local.get({ [HIDDEN_KEY]: {}, [ADDED_KEY]: {} }, result => {
      cb({
        hidden: normalizeItems(result[HIDDEN_KEY], { max: MAX_HIDDEN, withListed: true }),
        added: normalizeItems(result[ADDED_KEY], { max: MAX_ADDED, withListed: false })
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
    ADDED_KEY,
    SITES_KEY,
    PREFS_KEY,
    THEME_KEY,
    BUTTON_EDGE_KEY,
    BUTTONS_ENABLED_KEY,
    buttonsEnabledOf,
    buttonEdgeOf,
    themeOf,
    MAX_HIDDEN,
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
    groupBySite,
    normalizePrefs,
    youtubeThumb,
    normalizeItems,
    buildBackup,
    parseBackup,
    mergeBackup,
    listedHidden,
    restoreKeys,
    removeFromList,
    toggleAdded,
    groupByKind,
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
