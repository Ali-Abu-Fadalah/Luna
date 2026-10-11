/* Public edition: local workflows and bounded public-image reads only.
   Private catalog, company backend and AI transports are not distributed. */
importScripts(
  "../shared/foundation.js",
  "../services/ayshei/ayshei-core.js",
  "../services/ai/groq-core.js"
);

const enableActionClick = () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
};
chrome.runtime.onInstalled.addListener(enableActionClick);
chrome.runtime.onStartup.addListener(enableActionClick);
enableActionClick();
chrome.storage?.local?.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
chrome.storage?.session?.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});

const excluded = "Private service connections are not included in the public edition of Luna.";
const fetchPublicImage = async (value) => {
  const url = new URL(String(value || ""));
  const host = url.hostname.toLowerCase();
  const approved = ["dubicars.com", "dubizzle.com", "noon.com", "bayut.com"];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !approved.some((root) => host === root || host.endsWith(`.${root}`)) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
  ) {
    throw new Error("Choose a public HTTPS image URL without credentials.");
  }
  const limit = 15 * 1024 * 1024;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15000);
  try {
    const response = await fetch(url.href, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      cache: "no-store",
      signal: abort.signal
    });
    if (!response.ok) throw new Error(`Image returned HTTP ${response.status}.`);
    const contentType = String(response.headers.get("content-type") || "")
      .split(";")[0]
      .toLowerCase();
    if (!["image/avif", "image/jpeg", "image/png", "image/webp"].includes(contentType))
      throw new Error("Unsupported image format.");
    if (Number(response.headers.get("content-length")) > limit)
      throw new Error("Image is too large.");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value: bytes } = await reader.read();
        if (done) break;
        size += bytes.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new Error("Image is too large.");
        }
        chunks.push(bytes);
      }
    } finally {
      reader.releaseLock();
    }
    if (!size) throw new Error("Image is empty.");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return { base64: btoa(binary), contentType };
  } finally {
    clearTimeout(timer);
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender?.id !== chrome.runtime.id) return;
  if (
    message?.type === globalThis.LunaFoundation.messageTypes.groq &&
    message.operation === "status"
  ) {
    sendResponse({
      ok: true,
      data: {
        workerUrl: "",
        connected: false,
        detail: excluded,
        localProviders: { groq: false, gemini: false, openrouter: false }
      }
    });
    return;
  }
  if (message?.type === globalThis.LunaFoundation.messageTypes.imageFetch) {
    fetchPublicImage(message.url)
      .then((data) => sendResponse({ ok: true, data }))
      .catch(() =>
        sendResponse({ ok: false, detail: "The public image could not be read safely." })
      );
    return true;
  }
  if (
    [
      globalThis.LunaFoundation.messageTypes.groq,
      globalThis.LunaFoundation.messageTypes.aysheiLookup
    ].includes(message?.type)
  ) {
    sendResponse({ ok: false, detail: excluded });
  }
});
