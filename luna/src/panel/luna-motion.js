/* Presentation only. Timelines never drive queue decisions or page actions. */
globalThis.LunaMotion = (() => {
  const gsap = globalThis.gsap;
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const button = document.querySelector("#luna-motion-toggle");
  const home = document.querySelector(".home-dashboard");
  const sculpture = document.querySelector(".lunar-sculpture");
  let ambientPaused = false;
  let entrance = null;
  let targets = [];
  const atmosphere = gsap
    ?.timeline({ paused: true, repeat: -1, yoyo: true })
    .to(".ambient-wash", { x: -14, y: 8, opacity: 0.3, duration: 18, ease: "sine.inOut" }, 0)
    .to(".ambient-horizon", { rotation: -14, opacity: 0.25, duration: 18, ease: "sine.inOut" }, 0);
  const moon = gsap
    ?.timeline({ paused: true, repeat: -1, yoyo: true })
    .to(".lunar-core", { y: -2, duration: 14, ease: "sine.inOut" }, 0);

  function settle() {
    entrance?.progress(1).kill();
    if (targets.length) gsap?.set(targets, { clearProps: "opacity,transform" });
    entrance = null;
    targets = [];
  }
  function sync() {
    const paused = ambientPaused || preference.matches;
    if (button) {
      button.setAttribute("aria-pressed", String(paused));
      button.setAttribute("aria-label", paused ? "Resume ambient light" : "Pause ambient light");
      button.title = button.getAttribute("aria-label");
      button.disabled = preference.matches;
    }
    atmosphere?.paused(paused || document.hidden);
    moon?.paused(paused || document.hidden || home.hidden);
    if (preference.matches) {
      atmosphere?.pause(0);
      moon?.pause(0);
      settle();
    }
  }
  function enter(node) {
    settle();
    if (!gsap || !node || preference.matches || document.hidden) return;
    targets = [node];
    entrance = gsap.fromTo(
      targets,
      { opacity: 0.65 },
      {
        opacity: 1,
        duration: 0.2,
        ease: "power2.out",
        clearProps: "opacity,transform"
      }
    );
  }
  button?.addEventListener("click", () => {
    ambientPaused = !ambientPaused;
    sync();
  });
  preference.addEventListener("change", sync);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) settle();
    sync();
  });
  new MutationObserver(sync).observe(home, { attributes: true, attributeFilter: ["hidden"] });
  document.querySelector(".home-intro")?.addEventListener("pointermove", (event) => {
    if (
      !gsap ||
      ambientPaused ||
      preference.matches ||
      home.hidden ||
      !matchMedia("(hover: hover)").matches
    )
      return;
    const box = event.currentTarget.getBoundingClientRect();
    gsap.to(sculpture, {
      x: ((event.clientX - box.left) / box.width - 0.5) * 6,
      y: ((event.clientY - box.top) / box.height - 0.5) * 6,
      duration: 0.7,
      ease: "power2.out",
      overwrite: true
    });
  });
  document.querySelector(".home-intro")?.addEventListener("pointerleave", () => {
    if (gsap)
      gsap.to(sculpture, { x: 0, y: 0, duration: 0.5, clearProps: "transform", overwrite: true });
  });
  sync();
  return Object.freeze({ enter, settle, sync });
})();
