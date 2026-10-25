/* Bounded presentation only. Module controllers own every workflow and saved value. */
globalThis.LunaMotion = (() => {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  let entrance = null;

  function settle() {
    entrance?.cancel();
    entrance = null;
  }

  function quiet() {
    return (
      preference.matches ||
      document.hidden ||
      document.body.dataset.depth === "quiet" ||
      document.body.dataset.motion === "reduced"
    );
  }

  function sync() {
    if (quiet()) settle();
  }

  function enter(node) {
    settle();
    if (!node?.animate || quiet()) return;
    const animation = node.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 480, easing: "cubic-bezier(.2,.88,.23,1)" }
    );
    entrance = animation;
    animation.onfinish = () => {
      if (entrance === animation) entrance = null;
      animation.cancel();
    };
  }

  preference.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", settle);
  new MutationObserver(sync).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-depth", "data-motion"]
  });
  return Object.freeze({ enter, settle, sync });
})();
