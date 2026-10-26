"use strict";

importScripts("shared.js", "catalog.js", "sites.js");

function reconcileSites(callback) {
  try {
    HOA_SITES.reconcile(callback);
  } catch (error) {
    // Browser lifecycle events can arrive while an extension API is unavailable.
    if (typeof callback === "function") {
      callback();
    }
  }
}

chrome.runtime.onInstalled.addListener(() => reconcileSites(() => {
  try {
    HOA_SITES.injectIntoOpenTabs();
  } catch (error) {
    // Swallow per-tab injection failures during installation/update.
  }
}));
chrome.runtime.onStartup.addListener(reconcileSites);
chrome.permissions.onRemoved.addListener(reconcileSites);
chrome.permissions.onAdded.addListener(permissions => {
  try {
    HOA_SITES.activateGranted(permissions.origins || []);
  } catch (error) {
    // Browser lifecycle events can arrive while an extension API is unavailable.
  }
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes["siteRules"]) {
    reconcileSites();
  }
});

const PLAYER_WINDOWS_KEY = "hoaPlayerWindows";
const PLAYER_SITES = new Set(["youtube", "twitch", "twitchvideo", "twitchclip", "imdb"]);
const PLAYER_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PLAYER_CHANNEL_RE = /^[A-Za-z0-9_]{2,25}$/;
const PLAYER_SLUG_RE = /^[A-Za-z0-9_-]{2,100}$/;
const PLAYER_RESERVED_CHANNELS = new Set([
  "directory", "videos", "settings", "search", "downloads", "jobs", "p", "turbo", "prime",
  "subscriptions", "inventory", "wallet", "drops", "friends", "messages", "following", "login", "signup"
]);

function validPlayerHash(hash) {
  if (typeof hash !== "string" || !hash || hash.includes("#")) {
    return false;
  }
  const params = new URLSearchParams(hash);
  const entries = Array.from(params.entries());
  const siteEntries = entries.filter(([key]) => key === "site");
  const titleEntries = entries.filter(([key]) => key === "title");
  if (siteEntries.length !== 1 || titleEntries.length > 1 || params.size < 2 || params.size > 3) {
    return false;
  }
  if (titleEntries.length && (!titleEntries[0][1].trim() || titleEntries[0][1].length > 120)) {
    return false;
  }
  const site = params.get("site");
  if (!PLAYER_SITES.has(site)) {
    return false;
  }
  const expected = site === "youtube" || site === "imdb" ? "id"
    : site === "twitch" ? "channel" : site === "twitchvideo" ? "video" : "clip";
  if (entries.filter(([key]) => key === expected).length !== 1
    || entries.some(([key]) => key !== "site" && key !== expected && key !== "title")) {
    return false;
  }
  const value = params.get(expected);
  if (site === "youtube" && !PLAYER_VIDEO_ID_RE.test(value)) {
    return false;
  }
  if (site === "imdb" && !/^vi\d+$/.test(value)) {
    return false;
  }
  if (site === "twitch" && (!PLAYER_CHANNEL_RE.test(value) || PLAYER_RESERVED_CHANNELS.has(value.toLowerCase()))) {
    return false;
  }
  if (site === "twitchvideo" && !/^\d+$/.test(value)) {
    return false;
  }
  return site !== "twitchclip" || PLAYER_SLUG_RE.test(value);
}

function playerWindowMode(incognito) {
  return incognito ? "incognito" : "normal";
}

function playerError() {
  return chrome.runtime.lastError ? chrome.runtime.lastError.message : "Unknown browser error";
}

function rememberPlayerWindow(mode, windowId, callback) {
  chrome.storage.session.get({ [PLAYER_WINDOWS_KEY]: {} }, result => {
    if (chrome.runtime.lastError) {
      callback(playerError());
      return;
    }
    const windows = result[PLAYER_WINDOWS_KEY] && typeof result[PLAYER_WINDOWS_KEY] === "object"
      ? result[PLAYER_WINDOWS_KEY] : {};
    windows[mode] = windowId;
    chrome.storage.session.set({ [PLAYER_WINDOWS_KEY]: windows }, () => {
      callback(chrome.runtime.lastError ? playerError() : null);
    });
  });
}

function focusPlayerWindow(windowId, sendResponse) {
  chrome.windows.update(windowId, { focused: true }, () => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: playerError() });
      return;
    }
    sendResponse({ ok: true });
  });
}

const PLAYER_WIDTH = 900;
const PLAYER_HEIGHT = 560;
const HIDDEN_WINDOW_KEY = "hoaHiddenWindow";
const HIDDEN_WIDTH = 720;
const HIDDEN_HEIGHT = 680;

// A new player window opens centred over the browser window the user clicked from (the worker cannot read the
// screen size). It shrinks to fit a smaller window. A reused window stays wherever the user moved it.
function centredBounds(sourceWindowId, wantedWidth, wantedHeight, callback) {
  if (!Number.isInteger(sourceWindowId)) {
    callback({ width: wantedWidth, height: wantedHeight });
    return;
  }
  chrome.windows.get(sourceWindowId, source => {
    if (chrome.runtime.lastError || !source || !Number.isFinite(source.width) || !Number.isFinite(source.height)) {
      callback({ width: wantedWidth, height: wantedHeight });
      return;
    }
    const width = Math.max(480, Math.min(wantedWidth, source.width - 40));
    const height = Math.max(300, Math.min(wantedHeight, source.height - 40));
    callback({
      width,
      height,
      left: Math.round((source.left || 0) + (source.width - width) / 2),
      top: Math.round((source.top || 0) + (source.height - height) / 2)
    });
  });
}

function createPlayerWindow(hash, incognito, mode, sourceWindowId, sendResponse) {
  centredBounds(sourceWindowId, PLAYER_WIDTH, PLAYER_HEIGHT, bounds => chrome.windows.create({
    url: `${HOA.PLAYER_URL}#${hash}`,
    type: "popup",
    ...bounds,
    focused: true,
    incognito: Boolean(incognito)
  }, created => {
    if (chrome.runtime.lastError || !created || !Number.isInteger(created.id)) {
      sendResponse({ ok: false, error: playerError() });
      return;
    }
    rememberPlayerWindow(mode, created.id, error => {
      if (error) {
        sendResponse({ ok: false, error });
        return;
      }
      sendResponse({ ok: true });
    });
  }));
}

function openHiddenWindow(sourceWindowId, sendResponse) {
  const url = chrome.runtime.getURL("hidden.html");
  chrome.storage.session.get({ [HIDDEN_WINDOW_KEY]: null }, result => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: playerError() });
      return;
    }
    const rememberedId = result[HIDDEN_WINDOW_KEY];
    if (Number.isInteger(rememberedId)) {
      chrome.windows.get(rememberedId, existing => {
        if (!chrome.runtime.lastError && existing && Number.isInteger(existing.id)) {
          chrome.windows.update(existing.id, { focused: true }, () => {
            sendResponse(chrome.runtime.lastError ? { ok: false, error: playerError() } : { ok: true });
          });
          return;
        }
        createHiddenWindow(url, sourceWindowId, sendResponse);
      });
      return;
    }
    createHiddenWindow(url, sourceWindowId, sendResponse);
  });
}

function createHiddenWindow(url, sourceWindowId, sendResponse) {
  centredBounds(sourceWindowId, HIDDEN_WIDTH, HIDDEN_HEIGHT, bounds => chrome.windows.create({
    url,
    type: "popup",
    ...bounds,
    focused: true
  }, created => {
    if (chrome.runtime.lastError || !created || !Number.isInteger(created.id)) {
      sendResponse({ ok: false, error: playerError() });
      return;
    }
    chrome.storage.session.set({ [HIDDEN_WINDOW_KEY]: created.id }, () => {
      sendResponse(chrome.runtime.lastError ? { ok: false, error: playerError() } : { ok: true });
    });
  }));
}

function openPlayerWindow(hash, incognito, sourceWindowId, sendResponse) {
  const mode = playerWindowMode(incognito);
  chrome.storage.session.get({ [PLAYER_WINDOWS_KEY]: {} }, result => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: playerError() });
      return;
    }
    const windows = result[PLAYER_WINDOWS_KEY] && typeof result[PLAYER_WINDOWS_KEY] === "object"
      ? result[PLAYER_WINDOWS_KEY] : {};
    const rememberedId = windows[mode];
    if (!Number.isInteger(rememberedId)) {
      createPlayerWindow(hash, incognito, mode, sourceWindowId, sendResponse);
      return;
    }
    chrome.windows.get(rememberedId, { populate: true }, existing => {
      if (chrome.runtime.lastError || !existing) {
        createPlayerWindow(hash, incognito, mode, sourceWindowId, sendResponse);
        return;
      }
      const tab = Array.isArray(existing.tabs) ? existing.tabs.find(item => Number.isInteger(item.id)) : null;
      if (!tab) {
        createPlayerWindow(hash, incognito, mode, sourceWindowId, sendResponse);
        return;
      }
      chrome.tabs.update(tab.id, { url: `${HOA.PLAYER_URL}#${hash}` }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: playerError() });
          return;
        }
        focusPlayerWindow(existing.id, sendResponse);
      });
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "hoa-play") {
    return undefined;
  }
  if (!validPlayerHash(message.hash)) {
    sendResponse({ ok: false, error: "Invalid player request" });
    return true;
  }
  const tab = sender && sender.tab;
  openPlayerWindow(message.hash, Boolean(tab && tab.incognito), tab ? tab.windowId : undefined, sendResponse);
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "hoa-open-hidden") {
    return undefined;
  }
  const sourceWindowId = Number.isInteger(message.windowId) ? message.windowId : undefined;
  openHiddenWindow(sourceWindowId, sendResponse);
  return true;
});

// The toolbar icon shows whether the AddOrHide buttons are on: grey with an OFF badge while they are disabled.
const ICONS_ON = { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png", 128: "icons/icon128.png" };
const ICONS_OFF = { 16: "icons/icon-off16.png", 32: "icons/icon-off32.png", 48: "icons/icon-off48.png", 128: "icons/icon-off128.png" };

function showButtonsState() {
  chrome.storage.local.get({ [HOA.BUTTONS_ENABLED_KEY]: true }, result => {
    const enabled = HOA.buttonsEnabledOf(result[HOA.BUTTONS_ENABLED_KEY]);
    chrome.action.setIcon({ path: enabled ? ICONS_ON : ICONS_OFF }, () => void chrome.runtime.lastError);
    chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#55555f" });
    chrome.action.setTitle({ title: enabled ? "AddOrHide" : "AddOrHide: buttons are disabled" });
  });
}

chrome.runtime.onInstalled.addListener(showButtonsState);
chrome.runtime.onStartup.addListener(showButtonsState);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[HOA.BUTTONS_ENABLED_KEY]) {
    showButtonsState();
  }
});
showButtonsState();
