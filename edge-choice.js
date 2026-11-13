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
    // The rhombus outline and power sign colour describe the current state: green while the hover buttons show, red while they are hidden.
    // The note below names the action, and screen readers get it from the label.
    if (!toggle.querySelector("svg")) {
      toggle.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="hoa-power-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".22" stop-color="#c3c9d0"/><stop offset=".42" stop-color="#eef0f3"/><stop offset=".55" stop-color="#8f97a0"/><stop offset=".7" stop-color="#d5d9de"/><stop offset="1" stop-color="#6f7780"/></linearGradient><radialGradient id="hoa-power-sheen" cx=".35" cy=".25" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><linearGradient id="hoa-power-state" gradientUnits="userSpaceOnUse" x1="8" y1="8" x2="56" y2="56"><stop offset="0" stop-color="var(--power-ring-light)"/><stop offset="1" stop-color="var(--power-ring-dark)"/></linearGradient></defs><path d="M32 4.5 59.5 32 32 59.5 4.5 32Z" fill="url(#hoa-power-metal)"/><path d="M32 4.5 59.5 32 32 59.5 4.5 32Z" fill="url(#hoa-power-sheen)"/><path d="M32 12.5 51.5 32 32 51.5 12.5 32Z" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1" stroke-linejoin="round"/><path d="M32 4.5 59.5 32 32 59.5 4.5 32Z" fill="none" stroke="url(#hoa-power-state)" stroke-width="6" stroke-linejoin="round"/><g fill="none" stroke-width="4.5" stroke-linecap="round"><g stroke="#fff" stroke-opacity=".8" transform="translate(0 1)"><path d="M39.66 27.57A10 10 0 1 1 24.34 27.57"/><path d="M32 20.5v8.5"/></g><g stroke="url(#hoa-power-state)"><path d="M39.66 27.57A10 10 0 1 1 24.34 27.57"/><path d="M32 20.5v8.5"/></g></g></svg>';
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
