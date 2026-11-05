"use strict";

const HOA_SITES_CATALOG = typeof HOA_CATALOG !== "undefined" ? HOA_CATALOG
  : typeof require === "function" ? require("./catalog.js") : null;

const HOA_SITES = Object.freeze((() => {
  const SITE_KEY = "siteRules";

  function validHostname(hostname) {
    if (typeof hostname !== "string") {
      return false;
    }
    const host = hostname.toLowerCase();
    if (!host || host.length > 253 || /[\s*:/]/.test(host)) {
      return false;
    }
    const labels = host.split(".");
    return labels.every(label => label.length >= 1 && label.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
  }

  function isSupportedPageUrl(value) {
    let url;
    try {
      url = new URL(value);
    } catch (error) {
      return false;
    }
    if (!["http:", "https:"].includes(url.protocol) || !validHostname(url.hostname)) {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return host !== "chromewebstore.google.com"
      && host !== "addons.mozilla.org"
      && !(host === "chrome.google.com"
        && (url.pathname === "/webstore" || url.pathname.startsWith("/webstore/")));
  }

  function isBuiltIn(hostname) {
    const rule = HOA_SITES_CATALOG && HOA_SITES_CATALOG.find(hostname);
    return Boolean(rule && rule.builtIn);
  }

  function isCatalog(hostname) {
    const rule = HOA_SITES_CATALOG && HOA_SITES_CATALOG.find(hostname);
    return Boolean(rule && !rule.builtIn);
  }

  // chrome.permissions.request only accepts patterns covered by the manifest's optional_host_permissions
  // ("https://*/*" and "http://*/*" separately). A wildcard-scheme pattern ("*://host/*") is rejected with
  // "Only permissions specified in the manifest may be requested", so the scheme must be explicit.
  function matchPattern(hostname, scheme) {
    return `${scheme === "http" ? "http" : "https"}://${hostname}/*`;
  }

  function schemeOfRule(rule) {
    return rule && rule.scheme === "http" ? "http" : "https";
  }

  function pickedSelectors(rule) {
    if (rule && Array.isArray(rule.pickedSelectors)) {
      return rule.pickedSelectors.filter(selector => typeof selector === "string" && selector.length <= 300);
    }
    return rule && typeof rule.cardSelector === "string" && rule.cardSelector ? [rule.cardSelector] : [];
  }

  function hostFromPattern(pattern) {
    if (typeof pattern !== "string") {
      return null;
    }
    const match = /^(?:\*|https?):\/\/([^/*:]+)\/\*$/.exec(pattern);
    return match && validHostname(match[1]) ? match[1].toLowerCase() : null;
  }

  function scriptId(hostname) {
    return `hoa-site-${hostname}`;
  }

  function playerHosts(hostname) {
    const rule = HOA_SITES_CATALOG && HOA_SITES_CATALOG.find(hostname);
    return rule && Array.isArray(rule.playerHosts) ? rule.playerHosts.filter(validHostname) : [];
  }

  function registeredHosts(hostname) {
    return [hostname, ...playerHosts(hostname)];
  }

  function chromeError(fallback) {
    return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError
      ? chrome.runtime.lastError.message || fallback : fallback;
  }

  function readRules(callback) {
    chrome.storage.local.get({ [SITE_KEY]: {} }, result => {
      const rules = result && result[SITE_KEY];
      callback(rules && typeof rules === "object" && !Array.isArray(rules) ? rules : {});
    });
  }

  function setRules(rules, callback) {
    chrome.storage.local.set({ [SITE_KEY]: rules }, callback);
  }

  function unregister(hostname, callback) {
    chrome.scripting.unregisterContentScripts({ ids: registeredHosts(hostname).map(scriptId) }, () => {
      callback();
    });
  }

  function register(hostname, scheme, callback) {
    const details = registeredHosts(hostname).map(host => ({
      id: scriptId(host), matches: [matchPattern(host, scheme)], js: ["shared.js", "catalog.js", "content.js"], css: ["content.css"],
      allFrames: true, runAt: "document_start", persistAcrossSessions: true
    }));
    chrome.scripting.registerContentScripts(details, () => {
      if (chrome.runtime.lastError && /duplicate script id/i.test(chrome.runtime.lastError.message || "")) {
        chrome.scripting.updateContentScripts(details, () => callback());
        return;
      }
      callback(chrome.runtime.lastError ? chromeError("Could not register the site script.") : "");
    });
  }

  function inject(tabId, callback) {
    chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["shared.js", "catalog.js", "content.js"] }, () => {
      if (chrome.runtime.lastError) {
        callback(chromeError("Could not inject the site script."));
        return;
      }
      chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ["content.css"] }, () => {
        callback(chrome.runtime.lastError ? chromeError("Could not inject site styles.") : "");
      });
    });
  }

  function enableSite(hostname, tabId, currentRules, callback, requestedScheme) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (!validHostname(hostname) || typeof chrome === "undefined" || !chrome.permissions
      || !chrome.storage) {
      cb({ ok: false, error: "That site is not supported." });
      return;
    }
    const rules = currentRules && typeof currentRules === "object" && !Array.isArray(currentRules)
      ? currentRules : {};
    const existing = rules[hostname] && typeof rules[hostname] === "object" ? rules[hostname] : {};
    const scheme = requestedScheme === "http" ? "http" : "https";
    const next = {
      ...rules,
      [hostname]: {
        ...existing,
        enabled: true,
        scheme,
        pendingPick: isCatalog(hostname) ? false : !pickedSelectors(existing).length,
        cardSelector: typeof existing.cardSelector === "string" ? existing.cardSelector : "",
        linkSelector: typeof existing.linkSelector === "string" ? existing.linkSelector : "",
        pickedSelectors: pickedSelectors(existing),
        bulkHide: existing.bulkHide === true
      }
    };
    chrome.storage.local.set({ [SITE_KEY]: next });
    // Keep this request synchronous with the popup's click handler.
    chrome.permissions.request({ origins: registeredHosts(hostname).map(host => matchPattern(host, scheme)) }, granted => {
      if (chrome.runtime.lastError || !granted) {
        const error = chromeError("Permission was not granted.");
        readRules(rules => {
          const existing = rules[hostname] && typeof rules[hostname] === "object" ? rules[hostname] : {};
          setRules({ ...rules, [hostname]: { ...existing, enabled: false, pendingPick: false } }, () => {
            cb({ ok: false, error });
          });
        });
        return;
      }
      unregister(hostname, () => register(hostname, scheme, error => {
        if (error) {
          cb({ ok: false, error });
          return;
        }
        inject(tabId, injectError => cb(injectError
          ? { ok: false, error: injectError } : { ok: true }));
      }));
    });
  }

  function removePermissionAndScript(hostname, callback) {
    unregister(hostname, () => {
      // Whichever scheme was granted gets revoked; removing one that was never granted is harmless.
      chrome.permissions.remove({ origins: registeredHosts(hostname).map(host => matchPattern(host, "https")) }, () => {
        chrome.permissions.remove({ origins: registeredHosts(hostname).map(host => matchPattern(host, "http")) }, () => callback());
      });
    });
  }

  function disableSite(hostname, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    readRules(rules => {
      const existing = rules[hostname] && typeof rules[hostname] === "object" ? rules[hostname] : {};
      const next = { ...rules, [hostname]: { ...existing, enabled: false } };
      setRules(next, () => removePermissionAndScript(hostname, () => cb({ ok: true })));
    });
  }

  function forgetSite(hostname, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    readRules(rules => {
      const next = { ...rules };
      delete next[hostname];
      setRules(next, () => {
        chrome.storage.local.get({ seenRows: {} }, result => {
          const seenRows = result.seenRows && typeof result.seenRows === "object" ? { ...result.seenRows } : {};
          delete seenRows[hostname];
          chrome.storage.local.set({ seenRows }, () => removePermissionAndScript(hostname, () => cb({ ok: true })));
        });
      });
    });
  }

  function startPicker(tabId, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    chrome.scripting.executeScript({ target: { tabId }, files: ["shared.js", "picker.js"] }, () => {
      cb(chrome.runtime.lastError ? { ok: false, error: chromeError("Could not start the picker.") } : { ok: true });
    });
  }

  function injectGranted(tabId, callback) {
    chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["shared.js", "catalog.js", "content.js"] }, () => {
      chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ["content.css"] }, callback);
    });
  }

  function enablePlayers(hostname, tabId, callback, requestedScheme) {
    const cb = typeof callback === "function" ? callback : () => {};
    const scheme = requestedScheme === "http" ? "http" : "https";
    const hosts = playerHosts(hostname);
    if (!hosts.length || typeof chrome === "undefined" || !chrome.permissions || !chrome.scripting) {
      cb({ ok: false, error: "That video player is not supported." });
      return;
    }
    chrome.permissions.request({ origins: hosts.map(host => matchPattern(host, scheme)) }, granted => {
      if (chrome.runtime.lastError || !granted) { cb({ ok: false, error: chromeError("Permission was not granted.") }); return; }
      registerPlayers(hostname, scheme, error => {
        if (error) { cb({ ok: false, error }); return; }
        inject(tabId, injectError => cb(injectError ? { ok: false, error: injectError } : { ok: true }));
      });
    });
  }

  function registerPlayers(hostname, scheme, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    const hosts = playerHosts(hostname);
    if (!hosts.length) { cb(""); return; }
    const details = hosts.map(host => ({
      id: scriptId(host), matches: [matchPattern(host, scheme)], js: ["shared.js", "catalog.js", "content.js"], css: ["content.css"],
      allFrames: true, runAt: "document_start", persistAcrossSessions: true
    }));
    chrome.scripting.registerContentScripts(details, () => {
      if (chrome.runtime.lastError && /duplicate script id/i.test(chrome.runtime.lastError.message || "")) {
        chrome.scripting.updateContentScripts(details, () => cb(chrome.runtime.lastError ? chromeError("Could not register the player script.") : ""));
        return;
      }
      cb(chrome.runtime.lastError ? chromeError("Could not register the player script.") : "");
    });
  }

  function injectIntoOpenTabs(callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting || !chrome.storage) {
      cb();
      return;
    }
    readRules(siteRules => {
      chrome.tabs.query({}, tabs => {
        const candidates = Array.isArray(tabs) ? tabs : [];
        let remaining = candidates.length;
        if (!remaining) {
          cb();
          return;
        }
        const done = () => {
          remaining -= 1;
          if (!remaining) {
            cb();
          }
        };
        candidates.forEach(tab => {
          let url;
          try {
            url = new URL(tab.url || "");
          } catch (error) {
            done();
            return;
          }
          if (!isSupportedPageUrl(url.href)) {
            done();
            return;
          }
          const host = url.hostname.toLowerCase();
          const catalogRule = HOA_SITES_CATALOG && HOA_SITES_CATALOG.find(host);
          const stored = siteRules[host] && typeof siteRules[host] === "object" ? siteRules[host] : null;
          const builtin = Boolean(catalogRule && catalogRule.builtIn);
          const enabled = Boolean(stored && stored.enabled === true);
          const pattern = matchPattern(host, url.protocol === "http:" ? "http" : "https");
          const injectIfAllowed = granted => {
            if (!builtin && (!enabled || !granted)) {
              done();
              return;
            }
            injectGranted(tab.id, done);
          };
          if (builtin) {
            injectIfAllowed(true);
          } else {
            chrome.permissions.contains({ origins: [pattern] }, granted => injectIfAllowed(granted));
          }
        });
      });
    });
  }

  function activateGranted(origins, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.permissions
      || !chrome.scripting || !chrome.tabs) {
      cb();
      return;
    }
    const patterns = Array.isArray(origins) ? origins : [];
    let index = 0;
    const activateNext = () => {
      if (index >= patterns.length) {
        cb();
        return;
      }
      const pattern = patterns[index++];
      const host = hostFromPattern(pattern);
      if (!host || isBuiltIn(host)) {
        activateNext();
        return;
      }
      reconcile(() => {
        readRules(siteRules => {
          chrome.tabs.query({ url: pattern }, tabs => {
            const matchingTabs = Array.isArray(tabs) ? tabs : [];
            let remaining = matchingTabs.length;
            let pickerStarted = false;
            if (!remaining) {
              activateNext();
              return;
            }
            const done = () => {
              remaining -= 1;
              if (!remaining) {
                activateNext();
              }
            };
            matchingTabs.forEach(tab => {
              injectGranted(tab.id, () => {
                const rule = siteRules[host];
                if (!pickerStarted && tab.active === true && rule
                  && typeof rule === "object" && rule.pendingPick === true) {
                  pickerStarted = true;
                  startPicker(tab.id, () => {
                    const current = siteRules[host] && typeof siteRules[host] === "object"
                      ? siteRules[host] : {};
                    siteRules = { ...siteRules, [host]: { ...current, pendingPick: false } };
                    setRules(siteRules, done);
                  });
                  return;
                }
                done();
              });
            });
          });
        });
      });
    };
    activateNext();
  }

  function reconcile(callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.permissions || !chrome.scripting) {
      cb();
      return;
    }
    readRules(rules => {
      const hosts = Object.keys(rules).filter(host => rules[host] && rules[host].enabled === true
        && !isBuiltIn(host) && validHostname(host));
      const desired = new Map();
      let remaining = hosts.length;
      if (!remaining) {
        getRegisteredAndReconcile(new Map(), cb);
        return;
      }
      hosts.forEach(host => chrome.permissions.contains({ origins: registeredHosts(host).map(playerHost => matchPattern(playerHost, schemeOfRule(rules[host]))) }, granted => {
        if (granted) {
          desired.set(host, schemeOfRule(rules[host]));
        }
        remaining -= 1;
        if (!remaining) {
          getRegisteredAndReconcile(desired, cb);
        }
      }));
    });
  }

  function getRegisteredAndReconcile(desired, callback) {
    chrome.scripting.getRegisteredContentScripts(scripts => {
      const registered = Array.isArray(scripts) ? scripts : [];
      const registeredIds = new Set(registered.filter(script => typeof script.id === "string" && script.id.startsWith("hoa-site-"))
        .map(script => script.id.slice("hoa-site-".length)));
      const rootsFor = host => Array.from(desired.keys()).find(root => registeredHosts(root).includes(host));
      const missing = Array.from(desired.keys()).filter(host => !registeredIds.has(host));
      const stale = Array.from(registeredIds).filter(host => !rootsFor(host));
      let pending = missing.length + stale.length;
      if (!pending) {
        callback();
        return;
      }
      const done = () => {
        pending -= 1;
        if (!pending) {
          callback();
        }
      };
      missing.forEach(host => register(host, desired.get(host), done));
      stale.forEach(host => unregister(host, done));
    });
  }

  return { validHostname, isSupportedPageUrl, isCatalog, isBuiltIn, matchPattern, schemeOfRule, hostFromPattern, scriptId, playerHosts,
    enableSite, enablePlayers, disableSite, forgetSite, startPicker, reconcile, activateGranted, injectIntoOpenTabs };
})());

if (typeof module !== "undefined") {
  module.exports = HOA_SITES;
}
