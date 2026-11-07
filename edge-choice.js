"use strict";

// The AddOrHide buttons controls shared by the popup and the options page: one Enable/Disable button and the
// Top/Bottom position buttons. They apply to every site; open pages follow as soon as a value changes.
function bindButtonControls(toggle, edgeGroup) {
  if (!toggle || !edgeGroup) {
    return;
  }
  const edgeButtons = Array.from(edgeGroup.querySelectorAll("[data-edge]"));
  const press = button => {
    button.classList.remove("is-pressed");
    void button.offsetWidth;
    button.classList.add("is-pressed");
  };
  const showEnabled = enabled => {
    // The ring describes the current state: green while the hover buttons show, red while they are hidden.
    // The note below names the action, and screen readers get it from the label.
    if (!toggle.querySelector("svg")) {
      toggle.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="hoa-power-ring" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--power-ring-light)"/><stop offset="1" stop-color="var(--power-ring-dark)"/></linearGradient><linearGradient id="hoa-power-disc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#eef0f1"/><stop offset="1" stop-color="#aeb5b9"/></linearGradient></defs><circle cx="32" cy="32" r="31.5" fill="url(#hoa-power-ring)"/><circle cx="32" cy="32" r="29.9" fill="none" stroke="rgba(255,255,255,.72)" stroke-width=".8"/><circle cx="32" cy="32" r="23.2" fill="url(#hoa-power-disc)" stroke="#fff" stroke-width="1.5"/><path d="M32 18.2v13.2M24.2 22.2a12.6 12.6 0 1 0 15.6 0" fill="none" stroke="#47525a" stroke-width="4" stroke-linecap="round"/><path d="M31.2 18.2v13.2M23.6 21.8a13.2 13.2 0 1 0 16.8 0" fill="none" stroke="rgba(255,255,255,.4)" stroke-width=".8" stroke-linecap="round"/></svg>';
    }
    toggle.setAttribute("aria-label", enabled ? "Turn off" : "Turn on");
    toggle.dataset.enabled = String(enabled);
    const note = document.getElementById("buttons-toggle-note");
    if (note) {
      note.textContent = enabled ? "Turn off the hover buttons"
        : "Turn on the hover buttons";
    }
    // Position only matters while the buttons are shown.
    edgeButtons.forEach(button => {
      button.disabled = !enabled;
    });
    // The popup's own icon greys out like the toolbar icon while the buttons are off.
    const brand = document.querySelector(".brand-lockup img");
    if (brand) {
      brand.src = enabled ? "icons/icon32.png" : "icons/icon-off32.png";
    }
  };
  const showEdge = edge => {
    edgeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.edge === edge)));
  };
  chrome.storage.local.get({ [HOA.BUTTONS_ENABLED_KEY]: true, [HOA.BUTTON_EDGE_KEY]: "top" }, result => {
    showEnabled(HOA.buttonsEnabledOf(result[HOA.BUTTONS_ENABLED_KEY]));
    showEdge(HOA.buttonEdgeOf(result[HOA.BUTTON_EDGE_KEY]));
  });
  toggle.addEventListener("click", () => {
    const enabled = toggle.dataset.enabled !== "true";
    press(toggle);
    showEnabled(enabled);
    chrome.storage.local.set({ [HOA.BUTTONS_ENABLED_KEY]: enabled });
  });
  edgeButtons.forEach(button => button.addEventListener("click", () => {
    const edge = HOA.buttonEdgeOf(button.dataset.edge);
    press(button);
    showEdge(edge);
    chrome.storage.local.set({ [HOA.BUTTON_EDGE_KEY]: edge });
  }));
  edgeButtons.concat(toggle).forEach(button => button.addEventListener("animationend", () => button.classList.remove("is-pressed")));
}

bindButtonControls(document.getElementById("buttons-toggle"), document.getElementById("button-edge"));
