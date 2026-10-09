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
