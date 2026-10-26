(function () {
  "use strict";

  if (window.HOA_THEME && window.HOA_THEME.__hoaTheme) {
    return;
  }

  var STORAGE_KEY = "theme";
  var CACHE_KEY = "hoaTheme";
  var extensionPage = location.protocol === "chrome-extension:";
  var explicit = "";

  function themeOf(value) {
    return value === "light" || value === "dark" ? value : "";
  }

  function apply(value) {
    explicit = themeOf(value);
    if (explicit) {
      document.documentElement.dataset.theme = explicit;
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function readCache() {
    if (!extensionPage) {
      return "";
    }
    try {
      return themeOf(localStorage.getItem(CACHE_KEY));
    } catch (error) {
      return "";
    }
  }

  function mirror(value) {
    if (!extensionPage) {
      return;
    }
    try {
      if (value) {
        localStorage.setItem(CACHE_KEY, value);
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
    } catch (error) {
      // Private browsing or a blocked storage area should not stop theme updates.
    }
  }

  function effective() {
    if (explicit) {
      return explicit;
    }
    try {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark" : "light";
    } catch (error) {
      return "light";
    }
  }

  function toggle() {
    var next = effective() === "dark" ? "light" : "dark";
    apply(next);
    mirror(next);
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: next });
    }
  }

  apply(readCache());

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get({ [STORAGE_KEY]: "" }, function (result) {
      var value = themeOf(result && result[STORAGE_KEY]);
      apply(value);
      mirror(value);
    });
  }
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== "local" || !changes[STORAGE_KEY]) {
        return;
      }
      var value = themeOf(changes[STORAGE_KEY].newValue);
      apply(value);
      mirror(value);
    });
  }

  window.HOA_THEME = { effective: effective, toggle: toggle, __hoaTheme: true };
}());
