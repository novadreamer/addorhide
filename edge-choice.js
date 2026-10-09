"use strict";

// The Add/Hide bar choices shared by the popup and the options page: Enable/Disable and Top/Bottom. They apply to
// every site; open pages follow as soon as a value changes.
function bindButtonChoices(enabledGroup, edgeGroup) {
  const radios = group => (group ? Array.from(group.querySelectorAll('input[type="radio"]')) : []);
  const enabledInputs = radios(enabledGroup);
  const edgeInputs = radios(edgeGroup);
  const showEnabled = enabled => {
    enabledInputs.forEach(input => {
      input.checked = (input.value === "on") === enabled;
    });
    // Position only matters while the buttons are shown.
    if (edgeGroup) {
      edgeGroup.disabled = !enabled;
    }
  };
  chrome.storage.local.get({ [HOA.BUTTONS_ENABLED_KEY]: true, [HOA.BUTTON_EDGE_KEY]: "top" }, result => {
    showEnabled(HOA.buttonsEnabledOf(result[HOA.BUTTONS_ENABLED_KEY]));
    const edge = HOA.buttonEdgeOf(result[HOA.BUTTON_EDGE_KEY]);
    edgeInputs.forEach(input => {
      input.checked = input.value === edge;
    });
  });
  enabledInputs.forEach(input => input.addEventListener("change", () => {
    if (input.checked) {
      const enabled = input.value === "on";
      chrome.storage.local.set({ [HOA.BUTTONS_ENABLED_KEY]: enabled });
      showEnabled(enabled);
    }
  }));
  edgeInputs.forEach(input => input.addEventListener("change", () => {
    if (input.checked) {
      chrome.storage.local.set({ [HOA.BUTTON_EDGE_KEY]: HOA.buttonEdgeOf(input.value) });
    }
  }));
}

bindButtonChoices(document.getElementById("buttons-enabled"), document.getElementById("button-edge"));
