"use strict";

var HOA_LOCK = (() => {
  const ITERATIONS = 200000;
  const encoder = new TextEncoder();

  function base64(bytes) {
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function bytesFromBase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function constantTimeEqual(left, right) {
    if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return difference === 0;
  }

  async function hashPassword(password, salt) {
    const saltBytes = salt instanceof Uint8Array ? salt : typeof salt === "string" ? bytesFromBase64(salt) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", encoder.encode(String(password)), { name: "PBKDF2" }, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
    return { salt: base64(saltBytes), hash: base64(new Uint8Array(bits)), iterations: ITERATIONS };
  }

  async function verify(password, lock) {
    if (!lock || typeof lock.salt !== "string" || typeof lock.hash !== "string") return false;
    try {
      const salt = bytesFromBase64(lock.salt);
      const iterations = Number.isInteger(lock.iterations) && lock.iterations > 0 ? lock.iterations : ITERATIONS;
      const key = await crypto.subtle.importKey("raw", encoder.encode(String(password)), { name: "PBKDF2" }, false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
      return constantTimeEqual(base64(new Uint8Array(bits)), lock.hash);
    } catch (error) {
      return false;
    }
  }

  function titleFor(pageId) {
    return pageId === "hidden" ? "Hidden Videos" : "Added Videos";
  }

  function renderLockScreen(container, pageId, lock, onUnlocked) {
    while (container.firstChild) container.firstChild.remove();
    const screen = document.createElement("section");
    screen.className = "hoa-lock-screen";
    screen.setAttribute("aria-labelledby", "hoa-lock-title");
    const card = document.createElement("div");
    card.className = "hoa-lock-card";
    const icon = document.createElement("div");
    icon.className = "hoa-lock-icon";
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
    const title = document.createElement("h1");
    title.id = "hoa-lock-title";
    title.textContent = titleFor(pageId);
    const copy = document.createElement("p");
    copy.className = "muted";
    copy.textContent = "Enter your password to unlock this page.";
    const form = document.createElement("form");
    form.className = "hoa-lock-form";
    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "current-password";
    input.autofocus = true;
    input.placeholder = "Password";
    input.setAttribute("aria-label", "Password");
    const button = document.createElement("button");
    button.type = "submit";
    button.className = "primary-button";
    button.textContent = "Unlock";
    const error = document.createElement("p");
    error.className = "status error";
    error.setAttribute("role", "status");
    error.textContent = "";
    form.append(input, button);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      button.disabled = true;
      error.textContent = "";
      if (await verify(input.value, lock)) {
        sessionStorage.setItem(`hoa-unlocked-${pageId}`, lock.hash.slice(0, 16));
        while (container.firstChild) container.firstChild.remove();
        onUnlocked();
        return;
      }
      error.textContent = "Wrong password.";
      button.disabled = false;
      input.select();
    });
    card.append(icon, title, copy, form, error);
    screen.appendChild(card);
    container.appendChild(screen);
    window.setTimeout(() => input.focus(), 0);
  }

  function hasValidToken(pageId, lock) {
    return !!(lock && typeof lock.hash === "string" && sessionStorage.getItem(`hoa-unlocked-${pageId}`) === lock.hash.slice(0, 16));
  }

  function currentPageId() {
    if (location.pathname.includes("hidden.html")) return "hidden";
    if (location.pathname.includes("added.html") || (location.pathname === "/robots.txt" && location.hash === "#addorhide-added")) return "added";
    return "";
  }

  function gate(pageId, container, onUnlocked) {
    chrome.storage.local.get({ pageLock: null }, async result => {
      const lock = result.pageLock && typeof result.pageLock === "object" ? result.pageLock : null;
      if (!lock || typeof lock.hash !== "string" || lock[pageId] !== true || hasValidToken(pageId, lock)) {
        onUnlocked();
        return;
      }
      renderLockScreen(container, pageId, lock, onUnlocked);
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.pageLock) return;
    chrome.storage.local.get({ pageLock: null }, result => {
      const lock = result.pageLock && typeof result.pageLock === "object" ? result.pageLock : null;
      const pageId = currentPageId();
      if (!pageId) return;
      if (lock && lock[pageId] === true && !hasValidToken(pageId, lock)) location.reload();
    });
  });

  return { hashPassword, verify, gate };
})();
