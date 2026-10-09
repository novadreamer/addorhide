"use strict";

function isStableClass(token) {
  return typeof token === "string"
    && token.length >= 2 && token.length <= 40
    && !/^hoa-/.test(token)
    && /^[A-Za-z_-][\w-]*$/.test(token)
    && !/\d{3,}/.test(token)
    && !/^(css-|jsx-|sc-|emotion-)/i.test(token)
    && !/-sc-/i.test(token)
    && !/^[A-Za-z]+-[a-z0-9]{5,}(?:-\d+)?$/.test(token)
    && !/^[a-z]{1,3}[A-Za-z0-9]{5,}$/.test(token)
    && !/active|hover|focus|selected|current|open|visible|loading|show|hide|disabled|expanded|fade|animate/i.test(token);
}

function pickerCssEscape(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/g, character => `\\${character}`);
}

function describeCandidate(tagName, classes, attributes) {
  const tag = typeof tagName === "string" && /^[A-Za-z][\w-]*$/.test(tagName) ? tagName.toLowerCase() : "div";
  const classPart = (Array.isArray(classes) ? classes : []).filter(isStableClass).slice(0, 3)
    .map(token => `.${pickerCssEscape(token)}`).join("");
  const attrPart = (Array.isArray(attributes) ? attributes : []).filter(attribute => attribute
    && typeof attribute.name === "string" && typeof attribute.value === "string"
    && /^(data-testid|data-test|data-test-id|data-a-target|data-component|data-id|role)$/.test(attribute.name)
    && /^[\w:-]{1,60}$/.test(attribute.value))
    .slice(0, 4)
    .map(attribute => `[${attribute.name}="${pickerCssEscape(attribute.value)}"]`).join("");
  return `${tag}${classPart}${attrPart}`;
}

function stableClassFragment(token) {
  if (typeof token !== "string" || token.length > 120) {
    return "";
  }
  const parts = token.split(/__|--/).filter(Boolean);
  if (parts.length < 2) {
    return "";
  }
  const tail = parts[parts.length - 1];
  return tail.length >= 5 && tail.length <= 40 && /^[A-Za-z][A-Za-z_-]*$/.test(tail) && /[_-]|^[a-z]{5,}$/.test(tail)
    ? `__${tail}` : "";
}

if (typeof module !== "undefined") {
  module.exports = { isStableClass, describeCandidate, stableClassFragment };
}

if (typeof window !== "undefined") {
  if (typeof window.__hoaPickerTeardown === "function") {
    window.__hoaPickerTeardown();
  }
  window.__hoaPicker = true;

  const ownNodes = [];
  let overlay;
  let highlight;
  let panel;
  let message;
  let currentSelector = null;
  let currentMatches = [];
  let pickMode = true;
  let lastHighlight = 0;

  function makeNode(tag, className) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    ownNodes.push(node);
    return node;
  }

  function hasAnchor(element) {
    return Boolean(element && ((element.matches && element.matches("a[href]")) || element.querySelector("a[href]")));
  }

  function selectorFor(element, classes, attributes) {
    return describeCandidate(element.localName, classes, attributes);
  }

  function candidateSelectors(element) {
    const selectors = new Set();
    const classes = Array.from(element.classList || []).filter(isStableClass);
    if (classes.length) {
      selectors.add(selectorFor(element, classes, []));
      classes.forEach(token => selectors.add(selectorFor(element, [token], [])));
    }
    // CSS-module and BEM-hashed classes (VideoCard-module-scss-module__Ab12Cd__video_card) change per build;
    // their readable tail is stable, so match on it as a substring.
    Array.from(element.classList || []).filter(token => !isStableClass(token)).forEach(token => {
      const tail = stableClassFragment(token);
      if (tail) {
        selectors.add(`${element.localName}[class*="${pickerCssEscape(tail)}"]`);
      }
    });
    const names = ["data-testid", "data-test", "data-test-id", "data-a-target", "data-component", "data-id", "role"];
    const attributes = names.map(name => ({ name, value: element.getAttribute(name) }))
      .filter(attribute => attribute.value !== null);
    attributes.forEach(attribute => selectors.add(selectorFor(element, [], [attribute])));
    const siblingParent = element.parentElement;
    if (siblingParent) {
      Array.from(element.attributes || []).forEach(attribute => {
        const siblings = Array.from(siblingParent.children).filter(child => child.localName === element.localName);
        if (siblings.length >= 2 && siblings.every(sibling => sibling.getAttribute(attribute.name) === attribute.value)) {
          selectors.add(selectorFor(element, [], [{ name: attribute.name, value: attribute.value }]));
        }
      });
    }
    if (hasAnchor(element)) {
      selectors.add(`${element.localName}:has(> a[href])`);
      const anchor = element.querySelector("a[href]");
      if (anchor) {
        try {
          const path = new URL(anchor.href || anchor.getAttribute("href"), location.href).pathname.split("/").filter(Boolean)[0];
          if (path) {
            selectors.add(`${element.localName}:has(a[href*="/${pickerCssEscape(path)}"])`);
          }
        } catch (error) {
          // Ignore relative or malformed links when building optional candidates.
        }
      }
    }
    // A bare tag ("a", "div") matches every link or box on the page, never one kind of card. It can come from
    // a sibling attribute describeCandidate does not keep (target="_blank").
    return Array.from(selectors).filter(selector => selector && !/^[a-z][\w-]*$/i.test(selector));
  }

  function workableMatches(selector) {
    try {
      const matches = Array.from(document.querySelectorAll(selector));
      return matches.length >= 2 && matches.length <= 300 ? matches : null;
    } catch (error) {
      return null;
    }
  }

  function area(element) {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  }

  // card is the ancestor the selector was built from (not the image under the mouse): its matches must
  // include it, look like it in size, and not be nested in each other.
  function scoreCandidate(selector, card) {
    const matches = workableMatches(selector);
    if (!matches || !matches.includes(card) || matches.filter(hasAnchor).length / matches.length < 0.8) {
      return null;
    }
    const nested = matches.filter(match => matches.some(other => other !== match && other.contains(match))).length;
    if (nested / matches.length > 0.1) {
      return null;
    }
    const cardArea = area(card);
    const visibleAreas = matches.map(area).filter(value => value > 0);
    if (cardArea > 0 && visibleAreas.length) {
      const similar = visibleAreas.filter(value => value >= cardArea * 0.4 && value <= cardArea * 2.5).length;
      if (similar / visibleAreas.length < 0.6) {
        return null;
      }
    }
    return { selector, matches, parts: (selector.match(/[.#:[\s>]/g) || []).length };
  }

  function buildSelector(element) {
    if (!element || !element.localName || element === document.documentElement || element === document.body) {
      return null;
    }
    let node = element;
    // Class/attribute patterns describe the card itself; structural :has() patterns also catch menus and
    // footers that merely link to the same section, so they are only a fallback.
    const best = { plain: null, structural: null };
    for (let level = 0; node && node !== document.documentElement && node !== document.body && level < 12; level += 1) {
      if (hasAnchor(node)) {
        candidateSelectors(node).forEach(selector => {
          const scored = scoreCandidate(selector, node);
          const kind = selector.includes(":has(") ? "structural" : "plain";
          const current = best[kind];
          if (scored && (!current || scored.matches.length > current.matches.length
            || (scored.matches.length === current.matches.length && scored.parts < current.parts))) {
            best[kind] = scored;
          }
        });
      }
      node = node.parentElement;
    }
    const chosen = best.plain || best.structural;
    return chosen ? chosen.selector : null;
  }

  function setPanel(text) {
    message.textContent = text;
  }

  function clearButtons() {
    panel.querySelectorAll("button").forEach(button => button.remove());
  }

  function addPanelButton(label, handler) {
    const button = makeNode("button");
    button.type = "button";
    button.className = "hoa-picker-button";
    button.textContent = label;
    button.style.minHeight = "32px";
    button.style.padding = "6px 12px";
    button.style.color = "#fff";
    button.style.background = label === "Cancel" ? "transparent" : "#5b5bf0";
    button.style.border = label === "Cancel" ? "1px solid rgba(255,255,255,.45)" : "1px solid transparent";
    button.style.borderRadius = "8px";
    button.style.font = "600 13px/1.2 \"Inter\", \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif";
    button.style.cursor = "pointer";
    button.addEventListener("click", handler);
    panel.appendChild(button);
  }

  function clearMatchHighlights() {
    currentMatches.forEach(node => {
      node.style.removeProperty("outline");
    });
    currentMatches = [];
  }

  function showPickMessage(text = "Click one video or card. Esc cancels.") {
    clearButtons();
    clearMatchHighlights();
    currentSelector = null;
    setPanel(text);
  }

  function saveSelector(keepOpen) {
    const host = location.hostname.toLowerCase();
    chrome.storage.local.get({ [HOA.SITES_KEY]: {} }, result => {
      const rules = result[HOA.SITES_KEY] && typeof result[HOA.SITES_KEY] === "object" ? result[HOA.SITES_KEY] : {};
      const existing = rules[host] && typeof rules[host] === "object" ? rules[host] : {};
      const legacy = typeof existing.cardSelector === "string" && existing.cardSelector ? [existing.cardSelector] : [];
      const prior = Array.isArray(existing.pickedSelectors) ? existing.pickedSelectors : legacy;
      const picks = [...prior.filter(selector => typeof selector === "string" && selector.length <= 300), currentSelector]
        .filter((selector, index, list) => selector && list.indexOf(selector) === index).slice(-12);
      const next = { ...rules, [host]: { ...existing, enabled: true, pendingPick: false, pickedSelectors: picks } };
      chrome.storage.local.set({ [HOA.SITES_KEY]: next }, () => {
        if (chrome.runtime.lastError) {
          setPanel("Couldn't save this pattern. Try again.");
          return;
        }
        if (keepOpen) {
          pickMode = true;
          showPickMessage("Saved. Click a different kind of card, or Esc to finish.");
        } else {
          teardown();
        }
      });
    });
  }

  function showResult(selector, matches) {
    currentSelector = selector;
    clearButtons();
    clearMatchHighlights();
    currentMatches = matches.slice(0, 300);
    currentMatches.forEach(node => { node.style.outline = "1px solid rgba(91,91,240,.55)"; });
    setPanel(`Found ${matches.length} similar cards on this page`);
    addPanelButton("Save", () => saveSelector(false));
    addPanelButton("Save and pick another", () => saveSelector(true));
    addPanelButton("Pick again", () => showPickMessage());
    addPanelButton("Cancel", teardown);
  }

  function showNoPattern() {
    clearButtons();
    clearMatchHighlights();
    currentSelector = null;
    setPanel("Couldn't find a reliable pattern here. Try clicking a different part of the card.");
    addPanelButton("Pick again", () => showPickMessage());
    addPanelButton("Cancel", teardown);
  }

  function elementsAtPoint(event) {
    overlay.style.pointerEvents = "none";
    const elements = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(event.clientX, event.clientY) : [event.target];
    overlay.style.pointerEvents = "auto";
    return elements.filter(element => !ownNodes.some(node => node === element || node.contains(element)));
  }

  function updateHighlight(event) {
    if (!pickMode || panel.contains(event.target)) {
      return;
    }
    const now = Date.now();
    if (now - lastHighlight < 80) {
      return;
    }
    lastHighlight = now;
    const element = elementsAtPoint(event)[0];
    const selector = element && buildSelector(element);
    const matches = selector && workableMatches(selector);
    if (!selector || !matches) {
      highlight.hidden = true;
      return;
    }
    const card = matches.find(match => match === element || match.contains(element)) || matches[0];
    const rect = card.getBoundingClientRect();
    highlight.hidden = false;
    highlight.style.left = `${rect.left}px`;
    highlight.style.top = `${rect.top}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  }

  function chooseCard(event) {
    if (!pickMode || panel.contains(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const element = elementsAtPoint(event)[0];
    const selector = element && buildSelector(element);
    const matches = selector && workableMatches(selector);
    if (!selector || !matches) {
      showNoPattern();
      return;
    }
    pickMode = false;
    highlight.hidden = true;
    showResult(selector, matches);
  }

  function teardown() {
    document.removeEventListener("mousemove", updateHighlight, true);
    document.removeEventListener("click", chooseCard, true);
    document.removeEventListener("keydown", onKeyDown, true);
    clearMatchHighlights();
    ownNodes.forEach(node => node.remove());
    ownNodes.length = 0;
    window.__hoaPicker = false;
    window.__hoaPickerTeardown = null;
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      teardown();
    }
  }

  function start() {
    overlay = makeNode("div", "hoa-picker-overlay");
    overlay.id = "hoa-picker-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483647";
    overlay.style.cursor = "crosshair";
    overlay.style.background = "transparent";
    overlay.style.pointerEvents = "auto";
    highlight = makeNode("div", "hoa-picker-highlight");
    highlight.id = "hoa-picker-highlight";
    highlight.hidden = true;
    highlight.style.position = "fixed";
    highlight.style.pointerEvents = "none";
    highlight.style.border = "2px solid #5b5bf0";
    highlight.style.borderRadius = "8px";
    highlight.style.background = "rgba(91, 91, 240, .12)";
    highlight.style.zIndex = "2147483646";
    panel = makeNode("div", "hoa-picker-panel");
    panel.id = "hoa-picker-panel";
    panel.style.position = "fixed";
    panel.style.left = "50%";
    panel.style.bottom = "20px";
    panel.style.transform = "translateX(-50%)";
    panel.style.zIndex = "2147483647";
    panel.style.padding = "12px 14px";
    panel.style.background = "rgba(20, 20, 28, .96)";
    panel.style.color = "#fff";
    panel.style.border = "1px solid #5b5bf0";
    panel.style.borderRadius = "12px";
    panel.style.boxShadow = "0 12px 32px rgba(0, 0, 0, .3)";
    panel.style.font = "14px/1.45 \"Inter\", \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif";
    panel.style.display = "flex";
    panel.style.gap = "8px";
    panel.style.alignItems = "center";
    message = makeNode("span");
    panel.appendChild(message);
    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(highlight);
    document.documentElement.appendChild(panel);
    showPickMessage();
    document.addEventListener("mousemove", updateHighlight, true);
    document.addEventListener("click", chooseCard, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  window.__hoaPickerTeardown = teardown;
  start();
}
