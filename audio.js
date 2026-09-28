/* DEADLINE // AUDIO SYSTEM
   - Looping site beat
   - Web Audio frequency analysis for reactive UI
   - Persistent audio across internal page changes (soft navigation)
   - Pauses the beat when another native <audio>/<video> plays
   - Integrates with Spotify Embed iFrame API when present
*/
(() => {
  const scriptEl = document.currentScript;
  const audioSrc = scriptEl
    ? new URL("audio/deadline-beat.wav", scriptEl.src).href
    : new URL("audio/deadline-beat.wav", location.href).href;

  const STORAGE_TIME = "deadlineBeatTime";
  const STORAGE_INTENT = "deadlineBeatIntent";
  const STORAGE_VOLUME = "deadlineBeatVolume";

  const state = {
    audio: null,
    context: null,
    analyser: null,
    mediaSources: new WeakMap(),
    raf: null,
    hasAudioFile: null,
    userPaused: localStorage.getItem(STORAGE_INTENT) === "paused",
    pausedByExternal: false,
    externalPlaying: false,
    externalMedia: new Set(),
    spotifyControllers: [],
    spotifyApiPromise: null,
    spotifyApi: null,
    level: 0,
    bass: 0,
    mid: 0,
    high: 0,
    punch: 0,
    prevBass: 0,
    prevMid: 0,
    prevHigh: 0,
    lastBassHit: 0,
    bassArmed: true,
    lastMidHit: 0,
    lastHighHit: 0,
    lastDropHit: 0,
    navigating: false,
    volume: (() => {
      const stored = Number(localStorage.getItem(STORAGE_VOLUME));
      return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 0.82;
    })(),
  };

  function isEntryPage() {
    return document.body?.id === "festival-entrance";
  }

  function savePosition(forceIntent) {
    if (!state.audio || !Number.isFinite(state.audio.currentTime)) return;
    localStorage.setItem(STORAGE_TIME, String(state.audio.currentTime));
    const intent = forceIntent || (state.audio.paused ? "paused" : "playing");
    localStorage.setItem(STORAGE_INTENT, intent);
  }

  function restorePosition() {
    if (!state.audio) return;
    const stored = Number(localStorage.getItem(STORAGE_TIME));
    if (!Number.isFinite(stored) || stored < 0) return;
    try {
      if (Number.isFinite(state.audio.duration) && state.audio.duration > 0) {
        state.audio.currentTime = Math.min(stored, Math.max(0, state.audio.duration - 0.05));
      } else {
        state.audio.currentTime = stored;
      }
    } catch (_) {}
  }

  function createAudioElement() {
    let audio = document.getElementById("festivalAudio");
    if (!audio) {
      audio = document.createElement("audio");
      audio.id = "festivalAudio";
      audio.preload = "auto";
      audio.setAttribute("aria-hidden", "true");
      document.body.appendChild(audio);
    }

    audio.loop = true;
    audio.muted = false;
    audio.volume = state.volume;

    // Always force the known-good WAV path so a stale MP3 <source> cannot win.
    audio.removeAttribute("src");
    while (audio.firstChild) audio.removeChild(audio.firstChild);
    const source = document.createElement("source");
    source.src = audioSrc;
    source.type = "audio/wav";
    audio.appendChild(source);

    return audio;
  }

  function ensureWidget() {
    const existing = document.getElementById("deadline-audio-widget");
    if (isEntryPage()) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const widget = document.createElement("section");
    widget.id = "deadline-audio-widget";
    widget.className = "deadline-audio-widget is-idle";
    widget.setAttribute("aria-label", "DEADLINE audio player");
    widget.innerHTML = `
      <div class="deadline-audio-corner deadline-audio-corner-tl"></div>
      <div class="deadline-audio-corner deadline-audio-corner-tr"></div>
      <div class="deadline-audio-corner deadline-audio-corner-bl"></div>
      <div class="deadline-audio-corner deadline-audio-corner-br"></div>
      <div class="deadline-audio-inner">
        <div class="deadline-audio-topline">
          <span class="deadline-audio-signal">SOUND_SIGNAL</span>
          <span class="deadline-audio-loop">LOOP</span>
        </div>
        <div class="deadline-audio-main">
          <button class="deadline-audio-toggle" type="button" aria-label="Tocar DEADLINE beat">▶</button>
          <div class="deadline-audio-copy">
            <strong>DEADLINE BEAT</strong>
            <span>PROD. BOK</span>
          </div>
          <div class="deadline-audio-bars" aria-hidden="true">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </div>
        </div>
        <div class="deadline-audio-status">AUDIO SIGNAL // WAITING</div>
        <div class="deadline-audio-volume-row">
          <span class="deadline-audio-volume-label">VOL</span>
          <input class="deadline-audio-volume" type="range" min="0" max="100" step="1" value="82" aria-label="Volume do DEADLINE beat">
          <span class="deadline-audio-volume-value">82%</span>
        </div>
        <div class="deadline-audio-line" aria-hidden="true"><span></span></div>
      </div>
    `;
    document.body.appendChild(widget);

    widget.querySelector(".deadline-audio-toggle")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (state.externalPlaying || !state.audio) return;
      if (state.audio.paused) await playBeat();
      else pauseBeat(true);
    });

    widget.querySelector(".deadline-audio-volume")?.addEventListener("input", (event) => {
      const value = Math.min(100, Math.max(0, Number(event.target.value)));
      state.volume = value / 100;
      if (state.audio) state.audio.volume = state.volume;
      localStorage.setItem(STORAGE_VOLUME, String(state.volume));
      updateWidget();
    });
  }

  function setStatus(text) {
    const widget = document.getElementById("deadline-audio-widget");
    widget?.querySelector(".deadline-audio-status")?.replaceChildren(document.createTextNode(text));
  }

  function updateWidget() {
    const widget = document.getElementById("deadline-audio-widget");
    if (!widget || !state.audio) return;

    const playing = !state.audio.paused && !state.externalPlaying;
    widget.classList.toggle("is-playing", playing);
    widget.classList.toggle("is-paused", state.audio.paused && !state.externalPlaying);
    widget.classList.toggle("is-external", state.externalPlaying);
    widget.classList.toggle("is-idle", !state.hasAudioFile && !state.externalPlaying);

    const button = widget.querySelector(".deadline-audio-toggle");
    if (button) {
      button.disabled = !state.hasAudioFile || state.externalPlaying;
      button.textContent = playing ? "Ⅱ" : "▶";
      button.setAttribute("aria-label", playing ? "Pausar DEADLINE beat" : "Tocar DEADLINE beat");
    }

    const volumeSlider = widget.querySelector(".deadline-audio-volume");
    const volumeValue = widget.querySelector(".deadline-audio-volume-value");
    if (volumeSlider) volumeSlider.value = String(Math.round(state.volume * 100));
    if (volumeValue) volumeValue.textContent = `${Math.round(state.volume * 100)}%`;

    if (!state.hasAudioFile) setStatus("AUDIO SIGNAL // ADD BEAT");
    else if (state.externalPlaying) setStatus("OTHER AUDIO // DEADLINE PAUSED");
    else if (playing) setStatus("PLAYING // LOOP ACTIVE");
    else setStatus("PAUSED // SIGNAL HOLD");
  }

  function ensureAudioContext() {
    if (!state.audio) return null;
    if (!state.context) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      state.context = new Ctx();
      state.analyser = state.context.createAnalyser();
      state.analyser.fftSize = 256;
      state.analyser.smoothingTimeConstant = 0.74;
      state.analyser.connect(state.context.destination);
    }
    return state.context;
  }

  function connectMediaElement(media) {
    if (!media || state.mediaSources.has(media)) return state.mediaSources.get(media) || null;
    const context = ensureAudioContext();
    if (!context || !state.analyser) return null;
    try {
      const source = context.createMediaElementSource(media);
      source.connect(state.analyser);
      state.mediaSources.set(media, source);
      return source;
    } catch (error) {
      console.info("DEADLINE audio analysis unavailable for this media element.", error.message);
      return null;
    }
  }

  async function playBeat({ fromBeginning = false } = {}) {
    if (!state.audio || state.externalPlaying) return false;

    const context = ensureAudioContext();
    try {
      if (context && context.state === "suspended") await context.resume();
      state.audio.muted = false;
      state.audio.volume = state.volume;

      if (fromBeginning) state.audio.currentTime = 0;
      else restorePosition();

      connectMediaElement(state.audio);
      await state.audio.play();

      state.userPaused = false;
      state.pausedByExternal = false;
      state.hasAudioFile = true;
      localStorage.setItem(STORAGE_INTENT, "playing");
      updateWidget();
      return true;
    } catch (error) {
      console.info("DEADLINE beat não conseguiu iniciar:", error.message);
      setStatus("AUDIO ERROR // CHECK BEAT");
      updateWidget();
      return false;
    }
  }

  function pauseBeat(byUser = false) {
    if (!state.audio) return;
    if (Number.isFinite(state.audio.currentTime)) {
      localStorage.setItem(STORAGE_TIME, String(state.audio.currentTime));
    }
    state.audio.pause();
    if (byUser) {
      state.userPaused = true;
      state.pausedByExternal = false;
      localStorage.setItem(STORAGE_INTENT, "paused");
    }
    updateWidget();
  }

  function pauseForExternal() {
    if (!state.audio || state.audio.paused) return;
    state.pausedByExternal = true;
    savePosition("playing");
    state.audio.pause();
    updateWidget();
  }

  async function resumeAfterExternal() {
    if (!state.audio || !state.pausedByExternal || state.userPaused) return;
    state.pausedByExternal = false;
    await playBeat();
  }

  function setExternalPlaying(isPlaying, sourceName = "OTHER AUDIO") {
    if (isPlaying) {
      state.externalPlaying = true;
      pauseForExternal();
      document.body.dataset.deadlineAudioSource = sourceName;
    } else {
      state.externalPlaying = false;
      delete document.body.dataset.deadlineAudioSource;
      resumeAfterExternal();
    }
    updateWidget();
  }

  function handleNativeMedia(media) {
    if (!media || media === state.audio || media.id === "introVideo" || media.muted || media.dataset.deadlineBound === "1") return;
    media.dataset.deadlineBound = "1";
    state.externalMedia.add(media);

    media.addEventListener("play", () => setExternalPlaying(true, media.tagName === "VIDEO" ? "VIDEO" : "AUDIO"));
    const maybeResume = () => {
      const somethingElse = [...state.externalMedia].some(item => item !== media && !item.paused && !item.ended && document.body.contains(item));
      if (!somethingElse) setExternalPlaying(false);
    };
    media.addEventListener("pause", maybeResume);
    media.addEventListener("ended", maybeResume);
  }

  function scanNativeMedia() {
    state.externalMedia = new Set();
    document.querySelectorAll("audio, video").forEach(handleNativeMedia);
  }

  function loadSpotifyApi() {
    if (state.spotifyApi) return Promise.resolve(state.spotifyApi);
    if (state.spotifyApiPromise) return state.spotifyApiPromise;

    state.spotifyApiPromise = new Promise((resolve) => {
      window.onSpotifyIframeApiReady = (IFrameAPI) => {
        state.spotifyApi = IFrameAPI;
        resolve(IFrameAPI);
      };
      if (!document.querySelector('script[data-deadline-spotify-api="1"]')) {
        const script = document.createElement("script");
        script.src = "https://open.spotify.com/embed/iframe-api/v1";
        script.async = true;
        script.dataset.deadlineSpotifyApi = "1";
        document.head.appendChild(script);
      }
    });
    return state.spotifyApiPromise;
  }

  function renderSpotifyFallback(host, url) {
    if (!host || !url || host.querySelector("iframe")) return;
    host.dataset.deadlineSpotifyFallback = "1";
    const iframe = document.createElement("iframe");
    iframe.className = "spotify-player";
    iframe.src = url;
    iframe.title = "Spotify player";
    iframe.loading = "eager";
    iframe.setAttribute("allow", "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("frameborder", "0");
    host.appendChild(iframe);
  }

  function setupSpotify() {
    const hosts = [...document.querySelectorAll(".spotify-player-host[data-spotify-url]")];
    if (!hosts.length) return;

    hosts.forEach((host) => {
      const url = host.dataset.spotifyUrl;
      if (!url || host.dataset.deadlineSpotifyReady === "1") return;
      host.dataset.deadlineSpotifyReady = "1";

      // Put a normal Spotify iframe in place immediately. This guarantees the
      // player is visible even while the iFrame API is loading during soft navigation.
      renderSpotifyFallback(host, url);

      loadSpotifyApi().then((IFrameAPI) => {
        if (!document.body.contains(host)) return;

        // The artist pages store the normal visual Embed URL in data-spotify-url
        // because that URL is perfect for a plain iframe. The iFrame API expects
        // the regular Spotify entity URL, so convert /embed/track/... back to
        // /track/... (same for album/artist).
        const apiUrl = url.replace("open.spotify.com/embed/", "open.spotify.com/");
        const options = { width: "100%", height: "152", url: apiUrl };
        try {
          IFrameAPI.createController(host, options, (EmbedController) => {
            state.spotifyControllers.push(EmbedController);
            EmbedController.addListener("playback_started", () => setExternalPlaying(true, "SPOTIFY"));
            EmbedController.addListener("playback_update", (event) => {
              const playing = Boolean(event?.data && !event.data.isPaused && !event.data.isBuffering);
              setExternalPlaying(playing, "SPOTIFY");
            });
          });
        } catch (error) {
          // Keep the already-visible normal iframe when the API is unavailable.
          console.info("DEADLINE Spotify Embed fallback:", error.message);
        }
      }).catch((error) => {
        // The fallback is already visible, so only log the API failure.
        console.info("DEADLINE Spotify iFrame API unavailable:", error?.message || "unknown error");
      });
    });
  }

  let externalPulse = 0;
  const effectTimers = new Map();

  function pulseClass(element, className, duration = 90) {
    if (!element) return;
    const key = `${element.id || element.tagName}.${className}`;
    const oldTimer = effectTimers.get(key);
    if (oldTimer) clearTimeout(oldTimer);
    element.classList.remove(className);
    // Force a reflow so consecutive beats retrigger the animation reliably.
    void element.offsetWidth;
    element.classList.add(className);
    effectTimers.set(key, window.setTimeout(() => {
      element.classList.remove(className);
      effectTimers.delete(key);
    }, duration));
  }

  function triggerAudioImpacts(now, bassAttack, midAttack, highAttack) {
    const widget = document.getElementById('deadline-audio-widget');
    if (!widget) return;

    // All one-shot reactions live INSIDE the audio popup.
    // The rest of the page stays stable and readable.

    // LOW / BASS: sparse physical hit on the popup only.
    if (state.bass < 0.17) state.bassArmed = true;
    const bassHit = state.bass > 0.29 && (bassAttack > 0.020 || (state.punch > 0.62 && bassAttack > 0.008));
    if (bassHit && state.bassArmed && now - state.lastBassHit > 420) {
      state.lastBassHit = now;
      state.bassArmed = false;
      pulseClass(widget, 'is-bass-hit', 95);
    }

    // MID: intentionally no one-shot animation.

    // HIGH: ultra-subtle digital accent on the popup only.
    const highHit = state.high > 0.22 && highAttack > 0.022;
    if (highHit && now - state.lastHighHit > 190) {
      state.lastHighHit = now;
      pulseClass(widget, 'is-high-hit', 62);
    }

    // DROP / very strong hit: larger one-shot deformation on the popup only.
    const dropHit = state.punch > 0.72 && bassAttack > 0.025;
    if (dropHit && now - state.lastDropHit > 650 && now - state.lastBassHit > 220) {
      state.lastDropHit = now;
      pulseClass(widget, 'is-drop-hit', 110);
    }

    // Keep previous values for attack detection.
    state.prevBass = state.bass;
    state.prevMid = state.mid;
    state.prevHigh = state.high;
  }

  function analyzeAudio() {
    if (state.analyser && state.context) {
      const bins = new Uint8Array(state.analyser.frequencyBinCount);
      state.analyser.getByteFrequencyData(bins);
      const average = bins.reduce((sum, v) => sum + v, 0) / (bins.length * 255);
      const bassEnd = Math.max(2, Math.floor(bins.length * 0.18));
      const midEnd = Math.max(bassEnd + 1, Math.floor(bins.length * 0.56));
      const bass = bins.slice(0, bassEnd).reduce((sum, v) => sum + v, 0) / (bassEnd * 255);
      const mid = bins.slice(bassEnd, midEnd).reduce((sum, v) => sum + v, 0) / ((midEnd - bassEnd) * 255);
      const high = bins.slice(midEnd).reduce((sum, v) => sum + v, 0) / (Math.max(1, bins.length - midEnd) * 255);

      state.level += (average - state.level) * 0.32;
      state.bass += (bass - state.bass) * 0.36;
      state.mid += (mid - state.mid) * 0.22;
      state.high += (high - state.high) * 0.20;
      const pulse = Math.max(0, state.bass - 0.2) * 1.8;
      state.punch += (Math.min(1, pulse) - state.punch) * 0.42;
    }

    const now = performance.now();
    const bassAttack = state.bass - state.prevBass;
    const midAttack = state.mid - state.prevMid;
    const highAttack = state.high - state.prevHigh;

    if (!state.externalPlaying) {
      triggerAudioImpacts(now, bassAttack, midAttack, highAttack);
    }

    const root = document.documentElement;
    root.style.setProperty("--audio-energy", state.level.toFixed(3));
    root.style.setProperty("--audio-bass", state.bass.toFixed(3));
    root.style.setProperty("--audio-mid", state.mid.toFixed(3));
    root.style.setProperty("--audio-high", state.high.toFixed(3));
    root.style.setProperty("--audio-punch", state.punch.toFixed(3));

    const widget = document.getElementById("deadline-audio-widget");
    if (widget) {
      widget.style.setProperty("--audio-energy", state.level.toFixed(3));
      widget.style.setProperty("--audio-bass", state.bass.toFixed(3));
      widget.style.setProperty("--audio-mid", state.mid.toFixed(3));
      widget.style.setProperty("--audio-high", state.high.toFixed(3));
      widget.style.setProperty("--audio-punch", state.punch.toFixed(3));
      const bars = widget.querySelectorAll(".deadline-audio-bars i");
      const values = [state.bass, state.bass * 1.2, state.mid, state.mid * 0.9, state.high, state.high * 1.15, state.mid * 1.1, state.bass * 0.8];
      bars.forEach((bar, index) => bar.style.setProperty("--bar-level", Math.min(1, values[index]).toFixed(3)));
    }

    if (state.externalPlaying && document.body.dataset.deadlineAudioSource === "SPOTIFY") {
      externalPulse += 0.17;
      const synthetic = 0.26 + 0.18 * (0.5 + 0.5 * Math.sin(externalPulse));
      root.style.setProperty("--audio-energy", synthetic.toFixed(3));
      root.style.setProperty("--audio-bass", (synthetic * 1.12).toFixed(3));
    }

    state.raf = requestAnimationFrame(analyzeAudio);
  }

  function executeInlineScripts(container, targetUrl) {
    const scripts = [...container.querySelectorAll("script")];
    scripts.forEach((oldScript) => {
      const src = oldScript.getAttribute("src");
      if (src && /audio\.js(?:$|\?)/.test(src)) {
        oldScript.remove();
        return;
      }
      if (src && /app\.js(?:$|\?)/.test(src)) {
        oldScript.remove();
        return;
      }
      const newScript = document.createElement("script");
      [...oldScript.attributes].forEach((attr) => newScript.setAttribute(attr.name, attr.value));
      if (src) newScript.src = new URL(src, targetUrl).href;
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });
  }

  function syncStyles(targetDoc, targetUrl) {
    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => link.remove());
    [...targetDoc.querySelectorAll('link[rel="stylesheet"]')].forEach((original) => {
      const clone = document.createElement("link");
      [...original.attributes].forEach((attr) => clone.setAttribute(attr.name, attr.value));
      const href = original.getAttribute("href");
      if (href) clone.href = new URL(href, targetUrl).href;
      document.head.appendChild(clone);
    });
  }

  async function navigate(url, push = true) {
    if (state.navigating) return;
    const targetUrl = new URL(url, location.href);
    if (targetUrl.origin !== location.origin) {
      location.href = targetUrl.href;
      return;
    }

    state.navigating = true;
    try {
      const response = await fetch(targetUrl.href, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const parser = new DOMParser();
      const targetDoc = parser.parseFromString(html, "text/html");

      const persistentAudio = state.audio;
      const persistentWidget = document.getElementById("deadline-audio-widget");
      if (persistentWidget) persistentWidget.remove();
      if (persistentAudio) persistentAudio.remove();

      syncStyles(targetDoc, targetUrl.href);
      document.title = targetDoc.title;
      document.body.id = targetDoc.body.id || "";
      document.body.className = targetDoc.body.className || "";
      for (const key of [...document.body.attributes].map(a => a.name)) {
        if (!new Set([...targetDoc.body.attributes].map(a => a.name)).has(key) && key !== "id" && key !== "class") {
          document.body.removeAttribute(key);
        }
      }
      [...targetDoc.body.attributes].forEach((attr) => document.body.setAttribute(attr.name, attr.value));

      const fragment = document.createDocumentFragment();
      [...targetDoc.body.childNodes].forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node;
          if (el.id === "festivalAudio" || el.id === "deadline-audio-widget") return;
        }
        fragment.appendChild(document.importNode(node, true));
      });
      document.body.replaceChildren(fragment);

      document.body.appendChild(persistentAudio || createAudioElement());
      ensureWidget();

      // Run page-specific scripts only after the new DOM is present.
      executeInlineScripts(document.body, targetUrl.href);

      // New page elements need the same media bindings.
      scanNativeMedia();
      setupSpotify();

      if (push) history.pushState({}, "", targetUrl.href);
      window.scrollTo(0, 0);

      updateWidget();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    } catch (error) {
      console.info("DEADLINE soft navigation unavailable; using normal navigation.", error.message);
      location.href = targetUrl.href;
    } finally {
      state.navigating = false;
    }
  }

  function shouldIntercept(anchor, event) {
    if (!anchor || !anchor.href) return false;
    if (event.defaultPrevented || event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== "_self") return false;
    if (anchor.hasAttribute("download")) return false;

    const targetUrl = new URL(anchor.href, location.href);
    if (targetUrl.origin !== location.origin) return false;
    if (targetUrl.hash && targetUrl.pathname === location.pathname && targetUrl.search === location.search) return false;
    return /\.html?$/.test(targetUrl.pathname) || targetUrl.pathname.endsWith("/");
  }

  function setupRouter() {
    document.addEventListener("click", (event) => {
      const anchor = event.target.closest?.("a");
      if (!shouldIntercept(anchor, event)) return;
      event.preventDefault();
      navigate(anchor.href, true);
    });

    window.addEventListener("popstate", () => navigate(location.href, false));
  }

  function init() {
    state.audio = createAudioElement();

    state.audio.addEventListener("loadedmetadata", () => {
      restorePosition();
      state.hasAudioFile = Number.isFinite(state.audio.duration) && state.audio.duration > 0;
      updateWidget();
    });
    state.audio.addEventListener("canplay", () => {
      state.hasAudioFile = true;
      updateWidget();
    });
    state.audio.addEventListener("error", () => {
      state.hasAudioFile = false;
      setStatus("AUDIO ERROR // FILE NOT READ");
      updateWidget();
    });
    state.audio.addEventListener("play", () => {
      state.hasAudioFile = true;
      localStorage.setItem(STORAGE_INTENT, "playing");
      updateWidget();
    });
    state.audio.addEventListener("pause", () => updateWidget());
    state.audio.addEventListener("timeupdate", () => {
      if (!state.audio.paused) savePosition("playing");
    });

    ensureWidget();
    scanNativeMedia();
    setupSpotify();
    setupRouter();

    window.addEventListener("pagehide", () => savePosition());
    window.addEventListener("beforeunload", () => savePosition());

    updateWidget();
    if (!state.raf) analyzeAudio();

    // Entry screen: the click handler below starts the audio and soft-navigates.
    const enterButton = document.getElementById("enterButton");
    enterButton?.addEventListener("click", async (event) => {
      event.preventDefault();
      await playBeat({ fromBeginning: true });
      document.body.classList.add("is-entering");
      window.setTimeout(() => navigate(enterButton.href, true), 760);
    }, { once: true, capture: true });

    // If someone opens a non-entry page with an existing play intent, attempt to
    // restore it. A normal user click can also resume if autoplay is blocked.
    if (!isEntryPage() && localStorage.getItem(STORAGE_INTENT) === "playing") {
      window.setTimeout(() => playBeat(), 100);
    }

    const resumeOnInteraction = () => {
      if (!isEntryPage() && localStorage.getItem(STORAGE_INTENT) === "playing" && state.audio?.paused && !state.userPaused) {
        playBeat();
      }
    };
    window.addEventListener("pointerdown", resumeOnInteraction, { passive: true });
    window.addEventListener("keydown", resumeOnInteraction, { passive: true });
  }

  window.DeadlineAudio = {
    play: () => playBeat(),
    playFromBeginning: () => playBeat({ fromBeginning: true }),
    pause: () => pauseBeat(true),
    navigate,
    getState: () => ({
      playing: Boolean(state.audio && !state.audio.paused),
      externalPlaying: state.externalPlaying,
      hasAudioFile: state.hasAudioFile,
      currentTime: state.audio?.currentTime || 0,
    }),
    registerMedia: handleNativeMedia,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
