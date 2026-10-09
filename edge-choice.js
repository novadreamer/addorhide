"use strict";

// The Top/Bottom choice for the Add/Hide bar, shared by the popup and the options page. It applies to every site;
// open pages re-place their buttons as soon as the value changes.
function bindButtonEdgeChoice(group) {
  if (!group) {
    return;
  }
  const inputs = Array.from(group.querySelectorAll('input[type="radio"]'));
  chrome.storage.local.get({ [HOA.BUTTON_EDGE_KEY]: "top" }, result => {
    const current = HOA.buttonEdgeOf(result[HOA.BUTTON_EDGE_KEY]);
    inputs.forEach(input => {
      input.checked = input.value === current;
    });
  });
  inputs.forEach(input => input.addEventListener("change", () => {
    if (input.checked) {
      chrome.storage.local.set({ [HOA.BUTTON_EDGE_KEY]: HOA.buttonEdgeOf(input.value) });
    }
  }));
}

bindButtonEdgeChoice(document.getElementById("button-edge"));
