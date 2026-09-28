// DEADLINE // SCROLL-CONTROLLED STATUE
// Frames expected at: img/statue-frames/frame_001.jpg ... frame_141.jpg
(() => {
  const section = document.querySelector('.rules-section');
  const frame = document.getElementById('deadline-statue-frame');
  const box = frame?.closest('.rules-statue-frame');
  const code = box?.querySelector('.rules-statue-code');

  if (!section || !frame || !box) return;

  const frameCount = Number(section.dataset.statueFrames || 141);
  const framePath = (n) => `img/statue-frames/frame_${String(n).padStart(3, '0')}.jpg`;

  const cache = new Map();
  let currentFrame = 1;
  let requestedFrame = 1;
  let rafId = 0;

  function preload(n) {
    if (n < 1 || n > frameCount || cache.has(n)) return;
    const img = new Image();
    img.src = framePath(n);
    cache.set(n, img);
  }

  function showFrame(n) {
    n = Math.max(1, Math.min(frameCount, n));
    if (n === currentFrame && frame.src.endsWith(framePath(n))) {
      if (code) code.textContent = `360° // FRAME ${String(n).padStart(3, '0')}`;
      return;
    }

    requestedFrame = n;
    const cached = cache.get(n);

    const apply = (src) => {
      frame.src = src;
      currentFrame = n;
      box.classList.add('has-image');
      if (code) code.textContent = `360° // FRAME ${String(n).padStart(3, '0')}`;
    };

    if (cached?.complete && cached.naturalWidth > 0) {
      apply(cached.src);
      return;
    }

    const loader = cached || new Image();
    if (!cached) {
      loader.src = framePath(n);
      cache.set(n, loader);
    }

    loader.onload = () => {
      if (requestedFrame === n) apply(loader.src);
    };
    loader.onerror = () => {
      // Keep the last valid frame if a file is missing.
    };
  }

  function getProgress() {
    const rect = section.getBoundingClientRect();
    const total = window.innerHeight + rect.height;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, (window.innerHeight - rect.top) / total));
  }

  // Keep the statue on a more visible angle when the section first enters
  // the viewport, then start the rotation a little later. This gives the face
  // time to be seen instead of arriving on the back-facing frame.
  const rotationDelay = 0.35; // first ~35% of the section scroll
  const startingFrame = 1;

  function getStatueFrame(progress) {
    if (progress <= rotationDelay) return startingFrame;
    const local = (progress - rotationDelay) / (1 - rotationDelay);
    return startingFrame + Math.round(local * (frameCount - startingFrame));
  }

  function updateFromScroll() {
    rafId = 0;
    const progress = getProgress();
    const next = getStatueFrame(progress);

    // Preload a small window around the frame the user is approaching.
    for (let offset = -3; offset <= 10; offset++) preload(next + offset);
    showFrame(next);
  }

  function requestUpdate() {
    if (!rafId) rafId = requestAnimationFrame(updateFromScroll);
  }

  // Make the first frame available immediately.
  preload(startingFrame);
  showFrame(startingFrame);

  // Warm up a small visible-angle window first, then let the browser load the rest lazily.
  for (let n = Math.max(1, startingFrame - 3); n <= Math.min(startingFrame + 18, frameCount); n++) preload(n);

  frame.addEventListener('error', () => {
    box.classList.remove('has-image');
  });

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
  window.addEventListener('load', requestUpdate, { once: true });
})();
