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
    // The neon ring and power sign colour describe the current state: green while the hover buttons show, red while they are hidden.
    // The note below names the action, and screen readers get it from the label.
    if (!toggle.querySelector("svg")) {
      toggle.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="hoa-power-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".22" stop-color="#c3c9d0"/><stop offset=".42" stop-color="#eef0f3"/><stop offset=".55" stop-color="#8f97a0"/><stop offset=".7" stop-color="#d5d9de"/><stop offset="1" stop-color="#6f7780"/></linearGradient><linearGradient id="hoa-power-dish" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".45"/></linearGradient><linearGradient id="hoa-power-bevel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#c9ced4"/><stop offset="1" stop-color="#4b535c"/></linearGradient><linearGradient id="hoa-power-silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".5" stop-color="#aeb5bd"/><stop offset="1" stop-color="#e3e6ea"/></linearGradient><linearGradient id="hoa-power-state" gradientUnits="userSpaceOnUse" x1="8" y1="8" x2="56" y2="56"><stop offset="0" stop-color="var(--power-ring-light)"/><stop offset="1" stop-color="var(--power-ring-dark)"/></linearGradient><filter id="hoa-power-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="32" cy="32" r="26" fill="none" stroke="url(#hoa-power-state)" stroke-width="6" filter="url(#hoa-power-glow)"/><circle cx="32" cy="32" r="29.2" fill="none" stroke="url(#hoa-power-silver)" stroke-width="1.1"/><circle cx="32" cy="32" r="22.8" fill="none" stroke="url(#hoa-power-silver)" stroke-width="1.1"/><circle cx="32" cy="32" r="21.6" fill="url(#hoa-power-bevel)"/><circle cx="32" cy="32" r="19.8" fill="url(#hoa-power-metal)"/><circle cx="32" cy="32" r="19.8" fill="url(#hoa-power-dish)"/><g fill="none" stroke-linecap="round"><g stroke="#10241a" stroke-opacity=".35" stroke-width="5.6"><path d="M38.5 26.8A9 9 0 1 1 25.5 26.8"/><path d="M32 21.5v8"/></g><g stroke="url(#hoa-power-state)" stroke-width="3.8" filter="url(#hoa-power-glow)"><path d="M38.5 26.8A9 9 0 1 1 25.5 26.8"/><path d="M32 21.5v8"/></g></g></svg>';
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
