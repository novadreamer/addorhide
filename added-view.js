"use strict";

if (location.pathname === "/robots.txt" && location.hash === "#addorhide-added") {
  document.title = "Added Videos - AddOrHide";
  while (document.body.firstChild) {
    document.body.firstChild.remove();
  }
  document.body.className = "hoa-added-view";
  let viewport = document.head.querySelector('meta[name="viewport"]');
  if (!viewport) {
    viewport = document.createElement("meta");
    viewport.name = "viewport";
    document.head.appendChild(viewport);
  }
  viewport.content = "width=device-width, initial-scale=1";
  const main = document.createElement("main");
  document.body.appendChild(main);
  HOA_ADDED.mount(main);
}
