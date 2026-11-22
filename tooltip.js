"use strict";

// Tooltips centred on the thing they describe (the browser's own title tooltip appears beside the pointer and
// cannot be positioned). Any element with a title gets it: the title moves to data-tip while hovered or focused,
// so the native tooltip never shows as well, and comes back afterwards so code and tests still read .title.
(() => {
  let tip = null;
  let owner = null;

  function ensureTip() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "hoa-tip";
      tip.setAttribute("role", "tooltip");
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }

  function hide() {
    if (owner && owner.dataset.tip !== undefined) {
      if (!owner.hasAttribute("title")) owner.setAttribute("title", owner.dataset.tip);
      delete owner.dataset.tip;
    }
    owner = null;
    if (tip) tip.hidden = true;
  }

  function show(element) {
    const text = (element.getAttribute("title") || "").trim();
    if (!text) return;
    hide();
    owner = element;
    element.dataset.tip = text;
    element.removeAttribute("title");
    // An icon-only control keeps an accessible name once its title is gone.
    if (!element.getAttribute("aria-label") && !(element.textContent || "").trim()) element.setAttribute("aria-label", text);
    const node = ensureTip();
    node.textContent = text;
    node.hidden = false;
    const box = element.getBoundingClientRect();
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const margin = 6;
    let left = box.left + box.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    // Below the element, or above it when there is no room underneath.
    let top = box.bottom + margin;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, box.top - height - margin);
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  }

  document.addEventListener("pointerover", event => {
    const element = event.target instanceof Element ? event.target.closest("[title]") : null;
    if (element && element !== owner) show(element);
  });
  document.addEventListener("pointerout", event => {
    if (owner && !(event.relatedTarget instanceof Node && owner.contains(event.relatedTarget))) hide();
  });
  document.addEventListener("focusin", event => {
    const element = event.target instanceof Element ? event.target.closest("[title]") : null;
    if (element && element.matches(":focus-visible")) show(element);
  });
  document.addEventListener("focusout", hide);
  // A click usually changes what the control does (and its title): drop the stale tip.
  document.addEventListener("pointerdown", hide, true);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
})();
