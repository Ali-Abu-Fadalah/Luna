globalThis.LunaPermissionSettings = (() => {
  const origins = Object.freeze(["https://*/*"]);
  const status = document.querySelector("#settings-websites-status");
  const message = document.querySelector("#settings-websites-message");
  const enableButton = document.querySelector("#settings-enable-websites");
  const revokeButton = document.querySelector("#settings-revoke-websites");
  const permissions = globalThis.chrome?.permissions;

  if (!status || !message || !enableButton || !revokeButton) {
    return Object.freeze({ ready: Promise.resolve() });
  }

  const render = (enabled) => {
    status.dataset.permissionState = enabled ? "enabled" : "built-in";
    status.textContent = enabled ? "Other sites enabled" : "Built-in sites only";
    message.textContent = enabled
      ? "Optional broad website access is enabled. Luna still reads a page only after an explicit scrape action."
      : "Only Luna's built-in approved website access is active.";
    enableButton.disabled = enabled;
    revokeButton.disabled = !enabled;
  };

  const refresh = async () => {
    if (!permissions?.contains) {
      render(false);
      message.textContent = "Chrome website permission controls are unavailable.";
      return false;
    }
    try {
      const enabled = await permissions.contains({ origins: [...origins] });
      render(enabled);
      return enabled;
    } catch (error) {
      render(false);
      message.textContent = "Luna could not read the optional website permission state.";
      return false;
    }
  };

  enableButton.addEventListener("click", async () => {
    if (!permissions?.request) return;
    enableButton.disabled = true;
    try {
      await permissions.request({ origins: [...origins] });
    } finally {
      await refresh();
    }
  });

  revokeButton.addEventListener("click", async () => {
    if (!permissions?.remove) return;
    revokeButton.disabled = true;
    try {
      await permissions.remove({ origins: [...origins] });
    } finally {
      await refresh();
    }
  });

  [permissions?.onAdded, permissions?.onRemoved].forEach((event) => {
    event?.addListener?.(() => refresh());
  });

  const ready = refresh();
  return Object.freeze({ ready, refresh });
})();
