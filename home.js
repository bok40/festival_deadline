const hero = document.getElementById("home");
const video = document.getElementById("statueVideo");
const shell = document.getElementById("statueShell");

if (hero && video && shell) {
  let targetTime = 0;
  let currentTime = 0;
  let loaded = false;
  let ticking = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function getHeaderHeight() {
    return window.innerWidth <= 800 ? 72 : 92;
  }

  // Scroll progress is measured only inside the HOME hero.
  function scrollProgress() {
    const heroTop = hero.offsetTop;
    const travel = Math.max(1, hero.offsetHeight - window.innerHeight);
    return clamp((window.scrollY - heroTop) / travel, 0, 1);
  }

  // The statue is fixed to the viewport while HOME is active,
  // and is explicitly hidden before LINEUP takes over.
  function updateVisibility() {
    const heroTop = hero.offsetTop;
    const heroBottom = heroTop + hero.offsetHeight;
    const headerHeight = getHeaderHeight();
    const shouldShow = window.scrollY < (heroBottom - headerHeight - 2);

    shell.classList.toggle("is-hidden", !shouldShow);
    shell.setAttribute("aria-hidden", String(!shouldShow));
  }

  function updateTarget() {
    if (loaded && Number.isFinite(video.duration) && video.duration > 0) {
      targetTime = scrollProgress() * Math.max(0, video.duration - 0.01);
    }
    updateVisibility();
  }

  function render() {
    currentTime += (targetTime - currentTime) * 0.10;

    if (loaded && Number.isFinite(currentTime)) {
      // Keep seeking sparse and smooth so the browser is not hammered on fast scrolls.
      if (Math.abs(video.currentTime - currentTime) > 0.02) {
        video.currentTime = currentTime;
      }
    }

    requestAnimationFrame(render);
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateTarget();
      ticking = false;
    });
  }

  video.addEventListener("loadedmetadata", () => {
    loaded = true;
    video.pause();
    video.currentTime = 0;
    currentTime = 0;
    targetTime = 0;
    updateVisibility();
    requestAnimationFrame(render);
  }, { once: true });

  video.addEventListener("error", () => {
    shell.classList.add("media-error");
  });

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);

  updateVisibility();
  requestAnimationFrame(render);
}
