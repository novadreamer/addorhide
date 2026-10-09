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
    // The button names what clicking it does: red Disable while the hover buttons show, green Enable while they
    // are hidden.
    toggle.textContent = enabled ? "Disable" : "Enable";
    toggle.dataset.enabled = String(enabled);
    const note = document.getElementById("buttons-toggle-note");
    if (note) {
      note.textContent = enabled ? "Disable to hide the hover buttons on thumbnails"
        : "Enable to show the hover buttons on thumbnails";
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
