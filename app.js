const CMS_STORAGE_KEY = "nn_cms_config_v1";

const byId = (id) => document.getElementById(id);

const cleanupServiceWorkers = async () => {
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!isLocalhost) return;
  if (!("serviceWorker" in navigator)) return;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map((r) => {
        const scriptUrl =
          r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "";
        try {
          const u = new URL(scriptUrl);
          if (u.origin === location.origin && u.pathname.endsWith("/sw.js")) return false;
        } catch {}
        return r.unregister();
      })
    );
  } catch {}

  try {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith("nn-")).map((k) => caches.delete(k)));
  } catch {}
};

const safeJsonParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const setText = (el, value) => {
  if (!el) return;
  el.textContent = typeof value === "string" ? value : "";
};

const setHref = (el, value) => {
  if (!el) return;
  if (!value) {
    el.removeAttribute("href");
    return;
  }
  el.setAttribute("href", value);
};

const showToast = (message) => {
  const toast = byId("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
};

const fetchJson = async (url) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
};

const normalizeConfig = (config) => {
  const cfg = typeof config === "object" && config ? config : {};

  const defaults = {
    supabase: { enabled: false, url: "", anonKey: "", configId: "default" },
    branding: { name: "NANANI NANANA", slogan: "Musique · Art · Spectacle · Sport · Culture", eyebrow: "Média digital visuel" },
    menu: [
      { target: "home", label: "Accueil" },
      { target: "about", label: "À propos" },
      { target: "media", label: "Contenus" },
      { target: "contact", label: "Contact" },
    ],
    sections: {
      home: { cta: "Découvrir", hint: "Scroll pour entrer dans l’histoire." },
      about: {
        title: "On parle de nous",
        text: "",
        pills: ["Éditorial", "Visuel", "Communauté"],
        card: { label: "Notre angle", title: "", copy: "" },
      },
      media: { title: "Contenus / Média", subtitle: "" },
      ads: { title: "Publicité", subtitle: "" },
      contact: { title: "Contact", text: "Une idée, une collaboration, un contenu ? Écrivez-nous.", note: "" },
    },
    backgroundVideos: {},
    content: [],
    ads: [],
    contact: {
      email: "contact@nanani-nanana.media",
      web3formsKey: "",
      socials: [
        { label: "Instagram", url: "https://instagram.com/" },
        { label: "TikTok", url: "https://tiktok.com/" },
        { label: "YouTube", url: "https://youtube.com/" },
      ],
    },
    providers: {
      pixabay: { apiKey: "", enabled: false },
      pexels: { apiKey: "", enabled: false },
    },
  };

  return {
    ...defaults,
    ...cfg,
    supabase: { ...defaults.supabase, ...(cfg.supabase || {}) },
    branding: { ...defaults.branding, ...(cfg.branding || {}) },
    sections: { ...defaults.sections, ...(cfg.sections || {}) },
    contact: { ...defaults.contact, ...(cfg.contact || {}) },
    providers: {
      ...defaults.providers,
      ...(cfg.providers || {}),
      pixabay: { ...defaults.providers.pixabay, ...((cfg.providers || {}).pixabay || {}) },
      pexels: { ...defaults.providers.pexels, ...((cfg.providers || {}).pexels || {}) },
    },
    menu: Array.isArray(cfg.menu) ? cfg.menu : defaults.menu,
    content: Array.isArray(cfg.content) ? cfg.content : defaults.content,
    ads: Array.isArray(cfg.ads) ? cfg.ads : defaults.ads,
    backgroundVideos: typeof cfg.backgroundVideos === "object" && cfg.backgroundVideos ? cfg.backgroundVideos : defaults.backgroundVideos,
  };
};

const fetchSupabaseConfig = async (cfg) => {
  const sb = cfg?.supabase || {};
  const enabled = Boolean(sb.enabled);
  const url = String(sb.url || "").trim();
  const anonKey = String(sb.anonKey || "").trim();
  const configId = String(sb.configId || "default").trim() || "default";
  if (!enabled || !url || !anonKey) return null;

  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/site_config?id=eq.${encodeURIComponent(configId)}&select=data`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });
  if (!res.ok) return null;
  const json = await res.json();
  const row = Array.isArray(json) ? json[0] : null;
  const data = row?.data && typeof row.data === "object" ? row.data : null;
  return data;
};

const loadConfig = async () => {
  const local = safeJsonParse(localStorage.getItem(CMS_STORAGE_KEY));
  if (local) return normalizeConfig(local);

  try {
    const remote = await fetchJson("cms.json");
    const base = normalizeConfig(remote);
    const fromSupabase = await fetchSupabaseConfig(base);
    if (fromSupabase) return normalizeConfig({ ...fromSupabase, supabase: base.supabase });
    return base;
  } catch {
    return normalizeConfig(null);
  }
};

const renderMenu = (config) => {
  const nav = byId("nav");
  if (!nav) return;

  const links = nav.querySelectorAll(".nav__link[data-target]");
  const byTarget = new Map();
  for (const link of links) byTarget.set(link.dataset.target, link);

  for (const item of config.menu) {
    if (!item || typeof item !== "object") continue;
    const target = String(item.target || "").trim();
    const label = String(item.label || "").trim();
    const link = byTarget.get(target);
    if (!link) continue;
    setText(link, label || link.textContent);
    setHref(link, `#${target}`);
  }
};

const renderContentGrid = (config) => {
  const grid = byId("mediaGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const items = Array.isArray(config.content) ? config.content : [];
  const fragment = document.createDocumentFragment();
  const canAutoplay = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  for (const item of items) {
    const title = String(item?.title || "").trim();
    const tag = String(item?.tag || "").trim();
    const meta = String(item?.meta || "").trim();
    const description = String(item?.description || "").trim();
    const href = String(item?.url || "").trim();
    const thumbnail = String(item?.thumbnail || "").trim();
    const videoUrl = String(item?.videoUrl || item?.video || "").trim();

    const a = document.createElement("a");
    a.className = "tile";
    a.href = href || "#";
    a.target = href ? "_blank" : "_self";
    a.rel = href ? "noopener noreferrer" : "";

    const media = document.createElement("div");
    media.className = "tile__media";

    if (videoUrl) {
      const video = document.createElement("video");
      video.className = "tile__video";
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.preload = "none";
      if (thumbnail) video.poster = thumbnail;
      video.dataset.src = videoUrl;
      media.appendChild(video);

      if (canAutoplay) {
        const ensureSrc = () => {
          if (video.getAttribute("src")) return;
          const src = String(video.dataset.src || "").trim();
          if (!src) return;
          video.src = src;
          try {
            video.load();
          } catch {}
        };

        const play = async () => {
          ensureSrc();
          try {
            const p = video.play();
            if (p && typeof p.then === "function") await p;
          } catch {}
        };
        const pause = () => {
          try {
            video.pause();
          } catch {}
        };
        media.addEventListener("pointerenter", play);
        media.addEventListener("pointerleave", pause);
        media.addEventListener("focusin", play);
        media.addEventListener("focusout", pause);
      }
    } else if (thumbnail) {
      const img = document.createElement("img");
      img.className = "tile__img";
      img.alt = title || "Contenu";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = thumbnail;
      media.appendChild(img);
    }

    if (description) {
      const desc = document.createElement("div");
      desc.className = "tile__desc";
      desc.textContent = description;
      media.appendChild(desc);
    }

    const body = document.createElement("div");
    body.className = "tile__body";

    const tagEl = document.createElement("div");
    tagEl.className = "tile__tag";
    tagEl.textContent = tag || "Média";

    const titleEl = document.createElement("div");
    titleEl.className = "tile__title";
    titleEl.textContent = title || "Nouveau contenu";

    const metaEl = document.createElement("div");
    metaEl.className = "tile__meta";
    metaEl.textContent = meta || "Cliquez pour ouvrir";

    body.append(tagEl, titleEl, metaEl);
    a.append(media, body);
    fragment.appendChild(a);
  }

  grid.appendChild(fragment);
};

const renderAds = (config) => {
  const grid = byId("adsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const items = Array.isArray(config.ads) ? config.ads : [];
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const imgUrl = String(item?.imageUrl || "").trim();
    const linkUrl = String(item?.linkUrl || "").trim();
    const label = String(item?.label || "").trim();

    const a = document.createElement("a");
    a.className = "ad";
    a.href = linkUrl || "#";
    a.target = linkUrl ? "_blank" : "_self";
    a.rel = linkUrl ? "noopener noreferrer" : "";
    a.setAttribute("aria-label", label || "Publicité");

    if (imgUrl) {
      const img = document.createElement("img");
      img.className = "ad__img";
      img.alt = label || "Publicité";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = imgUrl;
      a.appendChild(img);
    }

    fragment.appendChild(a);
  }

  grid.appendChild(fragment);
};

const renderContact = (config) => {
  const emailEl = byId("contactEmail");
  const email = String(config.contact?.email || "").trim();
  setText(emailEl, email || "contact@nanani-nanana.media");
  setHref(emailEl, email ? `mailto:${email}` : "");

  const socials = byId("socialLinks");
  if (socials) {
    socials.innerHTML = "";
    const items = Array.isArray(config.contact?.socials) ? config.contact.socials : [];
    const fragment = document.createDocumentFragment();

    for (const s of items) {
      const label = String(s?.label || "").trim();
      const url = String(s?.url || "").trim();
      if (!label || !url) continue;
      const a = document.createElement("a");
      a.className = "chip";
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = label;
      fragment.appendChild(a);
    }
    socials.appendChild(fragment);
  }

  const form = byId("contactForm");
  if (form) {
    const btn = byId("contactSubmit");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get("name") || "").trim();
      const from = String(fd.get("email") || "").trim();
      const message = String(fd.get("message") || "").trim();

      if (!name || !from || !message) {
        showToast("Veuillez compléter tous les champs.");
        return;
      }

      const accessKey = String(config.contact?.web3formsKey || "").trim();

      if (accessKey) {
        if (btn) btn.textContent = "Envoi...";
        try {
          const res = await fetch("https://api.web3forms.com/submit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              access_key: accessKey,
              name: name,
              email: from,
              message: message,
              subject: `NANANI NANANA — Nouveau message de ${name}`
            })
          });
          if (res.ok) {
            showToast("Message envoyé avec succès !");
            form.reset();
          } else {
            showToast("Erreur lors de l'envoi. Veuillez réessayer.");
          }
        } catch {
          showToast("Erreur réseau. Impossible d'envoyer le message.");
        } finally {
          if (btn) btn.textContent = "Envoyer";
        }
      } else {
        // Fallback to mailto
        const to = email || "contact@nanani-nanana.media";
        const subject = encodeURIComponent(`NANANI NANANA — Message de ${name}`);
        const body = encodeURIComponent(`Nom: ${name}\nEmail: ${from}\n\n${message}`);
        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
        showToast("Ouverture de votre client mail…");
        form.reset();
      }
    });
  }
};

const renderTextBlocks = (config) => {
  setText(byId("brandTop"), config.branding?.name);
  setText(byId("loaderBrand"), config.branding?.name);
  setText(byId("heroTitle"), config.branding?.name);
  setText(byId("heroSlogan"), config.branding?.slogan);
  setText(byId("heroEyebrow"), config.branding?.eyebrow);

  setText(byId("heroCta"), config.sections?.home?.cta);
  setText(byId("heroHint"), config.sections?.home?.hint);

  setText(byId("aboutTitle"), config.sections?.about?.title);
  setText(byId("aboutText"), config.sections?.about?.text);

  const pillsWrap = byId("aboutPills");
  const pills = Array.isArray(config.sections?.about?.pills) ? config.sections.about.pills : [];
  if (pillsWrap) {
    pillsWrap.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (const p of pills) {
      const label = String(p || "").trim();
      if (!label) continue;
      const span = document.createElement("span");
      span.className = "pill";
      span.textContent = label;
      fragment.appendChild(span);
    }
    pillsWrap.appendChild(fragment);
  }

  setText(byId("aboutCardLabel"), config.sections?.about?.card?.label);
  setText(byId("aboutCardTitle"), config.sections?.about?.card?.title);
  setText(byId("aboutCardCopy"), config.sections?.about?.card?.copy);

  setText(byId("mediaTitle"), config.sections?.media?.title);
  setText(byId("mediaSubtitle"), config.sections?.media?.subtitle);

  setText(byId("adsTitle"), config.sections?.ads?.title);
  setText(byId("adsSubtitle"), config.sections?.ads?.subtitle);

  setText(byId("contactTitle"), config.sections?.contact?.title);
  setText(byId("contactText"), config.sections?.contact?.text);
  const note = String(config.sections?.contact?.note || "").trim();
  if (note) setText(byId("contactNote"), note);
};

const setupCursor = () => {
  const cursor = byId("cursor");
  if (!cursor) return;

  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!canHover) {
    cursor.classList.add("is-hidden");
    return;
  }

  let x = -100;
  let y = -100;
  let tx = -100;
  let ty = -100;

  const tick = () => {
    tx += (x - tx) * 0.18;
    ty += (y - ty) * 0.18;
    cursor.style.transform = `translate(${tx - 9}px, ${ty - 9}px)`;
    window.requestAnimationFrame(tick);
  };

  window.addEventListener("mousemove", (e) => {
    x = e.clientX;
    y = e.clientY;
  });

  const activables = "a,button,input,textarea,select,label";
  document.addEventListener("pointerover", (e) => {
    const t = e.target instanceof Element ? e.target.closest(activables) : null;
    if (t) cursor.classList.add("is-active");
  });
  document.addEventListener("pointerout", () => cursor.classList.remove("is-active"));

  window.requestAnimationFrame(tick);
};

const setupProgress = () => {
  const bar = byId("progressBar");
  if (!bar) return;

  const onScroll = () => {
    const el = document.documentElement;
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    const p = clamp(el.scrollTop / max, 0, 1);
    bar.style.width = `${p * 100}%`;
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
};

const setupVideoStory = (config) => {
  const sections = Array.from(document.querySelectorAll(".panel[data-video-key]"));
  if (!sections.length) return { setActiveSection: () => {} };

  const fallback = byId("bgFallback");
  const videoA = byId("bgVideoA");
  const videoB = byId("bgVideoB");

  const videos = { a: videoA, b: videoB };
  let active = "a";
  let currentKey = "";
  let currentSrc = "";
  let lockUntil = 0;
  let lockedKey = "";
  let isScrolling = false;
  let scrollIdleTimer = 0;
  let playBlocked = false;

  const applyFallback = (enabled) => {
    if (fallback) fallback.style.opacity = enabled ? "1" : "0";
  };

  const pauseAndUnload = (el) => {
    if (!el) return;
    try {
      el.pause();
    } catch {}
    try {
      el.currentTime = 0;
    } catch {}
  };

  const prime = (el, src, poster) =>
    new Promise((resolve) => {
      if (!el) return resolve(false);

      el.loop = true;
      el.muted = true;
      el.playsInline = true;
      el.preload = "metadata";
      if (poster) el.poster = poster;

      const done = (ok) => {
        el.removeEventListener("canplay", onCanPlay);
        window.clearTimeout(t);
        resolve(ok);
      };

      const onCanPlay = () => done(true);
      el.addEventListener("canplay", onCanPlay, { once: true });

      const t = window.setTimeout(() => done(false), 2400);

      el.src = src;
      el.load();
    });

  const playSafe = async (el) => {
    if (!el) return;
    try {
      const p = el.play();
      if (p && typeof p.then === "function") await p;
      playBlocked = false;
    } catch {}
  };

  const tryUnlockAutoplay = async () => {
    const a = videos.a;
    const b = videos.b;
    if (a?.getAttribute("src")) await playSafe(a);
    if (b?.getAttribute("src")) await playSafe(b);
  };

  const onFirstUserGesture = async () => {
    if (!playBlocked) return;
    await tryUnlockAutoplay();
  };

  document.addEventListener("pointerdown", onFirstUserGesture, { passive: true });
  document.addEventListener("keydown", onFirstUserGesture);

  const swapTo = async ({ src, poster }) => {
    const nextSrc = String(src || "").trim();
    if (!nextSrc) {
      currentSrc = "";
      applyFallback(true);
      if (videos.a) videos.a.classList.remove("is-active");
      if (videos.b) videos.b.classList.remove("is-active");
      pauseAndUnload(videos.a);
      pauseAndUnload(videos.b);
      return;
    }

    if (nextSrc === currentSrc) return;
    currentSrc = nextSrc;

    const incomingKey = active === "a" ? "b" : "a";
    const incoming = videos[incomingKey];
    const outgoing = videos[active];

    applyFallback(false);
    const ok = await prime(incoming, nextSrc, poster);
    if (incoming?.getAttribute("src") !== nextSrc) return;
    await playSafe(incoming);
    if (incoming?.paused) playBlocked = true;

    incoming.classList.add("is-active");
    outgoing?.classList.remove("is-active");
    active = incomingKey;

    window.setTimeout(() => {
      if (!outgoing) return;
      outgoing.preload = "none";
      pauseAndUnload(outgoing);
    }, ok ? 720 : 260);
  };

  const getVideoForKey = (key) => {
    const entry = config.backgroundVideos?.[key];
    if (!entry || typeof entry !== "object") return null;
    const src = String(entry.src || "").trim();
    const poster = String(entry.poster || "").trim();
    return src ? { src, poster } : null;
  };

  const setActiveSection = (key, options = {}) => {
    const safeKey = String(key || "").trim();
    if (!safeKey || safeKey === currentKey) return;
    if (!options.force && performance.now() - setActiveSection._lastAt < 350) return;
    setActiveSection._lastAt = performance.now();
    currentKey = safeKey;
    const video = getVideoForKey(safeKey);
    swapTo(video || { src: "", poster: "" });
  };
  setActiveSection._lastAt = 0;

  const pickSectionKeyAtViewport = () => {
    const centerY = window.innerHeight * 0.45;
    let bestKey = "";
    let bestDist = Number.POSITIVE_INFINITY;

    for (const s of sections) {
      const rect = s.getBoundingClientRect();
      const inRange = rect.top <= centerY && rect.bottom >= centerY;
      const dist = inRange ? 0 : Math.min(Math.abs(rect.top - centerY), Math.abs(rect.bottom - centerY));
      if (dist < bestDist) {
        bestDist = dist;
        bestKey = String(s.dataset.videoKey || "");
      }
    }
    return bestKey;
  };

  const scheduleScrollIdleUpdate = () => {
    isScrolling = true;
    window.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = window.setTimeout(() => {
      isScrolling = false;
      const key = pickSectionKeyAtViewport();
      if (!key) return;
      setActiveSection(key, { force: true });
      setActiveNav(key);
    }, 180);
  };

  const lockToSection = (key, durationMs = 1400) => {
    const safeKey = String(key || "").trim();
    if (!safeKey) return;
    lockedKey = safeKey;
    lockUntil = performance.now() + Math.max(0, Number(durationMs) || 0);
    setActiveSection(safeKey, { force: true });
    setActiveNav(safeKey);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;
      if (visible.intersectionRatio < 0.35) return;
      const key = visible.target instanceof HTMLElement ? visible.target.dataset.videoKey : "";
      if (isScrolling) return;
      if (lockUntil && performance.now() < lockUntil && key !== lockedKey) return;
      if (key === lockedKey) lockUntil = 0;
      setActiveSection(key);
      setActiveNav(String(key || ""));
    },
    { root: null, rootMargin: "-22% 0px -52% 0px", threshold: [0, 0.2, 0.35, 0.55, 0.8] },
  );

  for (const s of sections) observer.observe(s);
  window.addEventListener("scroll", scheduleScrollIdleUpdate, { passive: true });

  const setActiveNav = (key) => {
    const links = document.querySelectorAll('.nav__link[data-target]:not(.nav__cms)');
    for (const l of links) {
      const t = l instanceof HTMLElement ? l.dataset.target : "";
      l.classList.toggle("is-active", t === key);
    }
  };

  const firstKey = sections[0]?.dataset?.videoKey || "";
  setActiveSection(firstKey);
  setActiveNav(firstKey);

  return { setActiveSection, lockToSection };
};

const setupHeroScrollButton = () => {
  const btn = byId("heroScroll");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const about = byId("about");
    if (!about) return;
    about.scrollIntoView({ behavior: "smooth", block: "start" });
  });
};

const setupAnchorScroll = (onSectionSelected) => {
  document.addEventListener("click", (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    const id = href.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    if (typeof onSectionSelected === "function") onSectionSelected(id);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  });
};

const hideLoader = () => {
  const loader = byId("loader");
  if (!loader) return;
  loader.classList.add("is-hidden");
};

const main = async () => {
  await cleanupServiceWorkers();
  setupCursor();
  setupProgress();
  setupHeroScrollButton();

  const config = await loadConfig();
  renderMenu(config);
  renderTextBlocks(config);
  renderContentGrid(config);
  renderAds(config);
  renderContact(config);

  const story = setupVideoStory(config);
  setupAnchorScroll((id) => story.lockToSection(id));
  window.setTimeout(hideLoader, 400);
};

main();
