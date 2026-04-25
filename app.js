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
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  
  try {
    const remote = await fetchJson("cms.json");
    const base = normalizeConfig(remote);
    
    // 1. Tenter Supabase en priorité pour les données les plus fraîches
    const fromSupabase = await fetchSupabaseConfig(base);
    if (fromSupabase) {
      console.log("NN: Config chargée depuis Supabase.");
      return normalizeConfig({ ...fromSupabase, supabase: base.supabase });
    }
    
    // 2. Fallback sur le LocalStorage uniquement si on est en développement ou si Supabase échoue
    const local = safeJsonParse(localStorage.getItem(CMS_STORAGE_KEY));
    if (local && (isLocal || !base.supabase.enabled)) {
      console.log("NN: Config chargée depuis LocalStorage (mode preview/fallback).");
      return normalizeConfig(local);
    }

    console.log("NN: Config chargée depuis cms.json (par défaut).");
    return base;
  } catch (err) {
    console.error("NN: Erreur lors du chargement de la config :", err);
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

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target.querySelector("video");
        if (!video) return;
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    },
    { threshold: 0.5 }
  );

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
      const isYoutube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");
      const isTiktok = videoUrl.includes("tiktok.com");

      if (isYoutube || isTiktok) {
        const iframe = document.createElement("iframe");
        iframe.className = "tile__video";
        let embedUrl = videoUrl;
        
        if (isYoutube) {
          const id = videoUrl.split("v=")[1] || videoUrl.split("/").pop();
          embedUrl = `https://www.youtube.com/embed/${id.split("&")[0]}?autoplay=1&mute=1&loop=1`;
        } else if (isTiktok) {
          const id = videoUrl.split("/video/")[1] || videoUrl.split("/").pop();
          embedUrl = `https://www.tiktok.com/embed/v2/${id.split("?")[0]}`;
        }
        
        iframe.src = embedUrl;
        iframe.frameBorder = "0";
        iframe.allow = "autoplay; encrypted-media";
        media.appendChild(iframe);
      } else {
        const video = document.createElement("video");
        video.className = "tile__video";
        video.muted = true;
        video.playsInline = true;
        video.loop = true;
        video.preload = "metadata";
        if (thumbnail) video.poster = thumbnail;
        video.src = videoUrl;
        media.appendChild(video);
        observer.observe(a);
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

    const descEl = document.createElement("div");
    descEl.className = "tile__desc";
    descEl.textContent = description || "";

    body.append(tagEl, titleEl, metaEl, descEl);
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

const updateMetadata = (config) => {
  const name = config.branding?.name || "NANANI NANANA";
  const slogan = config.branding?.slogan || "";
  const title = `${name} — ${slogan}`;
  
  document.title = title;
  
  const metaTitle = document.querySelector('meta[property="og:title"]');
  if (metaTitle) metaTitle.setAttribute("content", title);
  
  const metaDesc = document.querySelector('meta[name="description"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  const sloganFull = config.branding?.eyebrow + " : " + config.branding?.slogan;
  if (metaDesc) metaDesc.setAttribute("content", sloganFull);
  if (ogDesc) ogDesc.setAttribute("content", sloganFull);
};

const renderTextBlocks = (config) => {
  updateMetadata(config);
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

const setupBackgroundEngine = (config) => {
  const canvas = byId("bgCanvas");
  if (!canvas) return { setSection: () => {} };
  
  const mode = config.branding?.backgroundMode || "generative";
  if (mode === "video") {
    canvas.style.display = "none";
    // Si on veut vraiment supporter le mode vidéo, il faudrait rajouter un overlay vidéo ici ou réactiver l'ancien système.
    // Pour l'instant, on cache le canvas.
    return { setSection: () => {} };
  }

  canvas.style.display = "block";
  const ctx = canvas.getContext("2d");
  let w, h;
  let frame = 0;
  let currentMode = Math.floor(Math.random() * 5);
  let targetMode = currentMode;
  let transition = 1;
  
  const resize = () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  };
  window.addEventListener("resize", resize);
  resize();

  // --- Animations ---
  
  const drawParticles = (f, t) => {
    ctx.strokeStyle = `rgba(${varToRgb('--accent-rgb')}, ${0.4 * t})`;
    for(let i=0; i<40; i++) {
      const x = (Math.sin(f * 0.01 + i) * w * 0.4) + w/2;
      const y = (Math.cos(f * 0.02 + i * 2) * h * 0.4) + h/2;
      ctx.beginPath();
      ctx.arc(x, y, 4 + Math.sin(f*0.05)*2, 0, Math.PI*2);
      ctx.stroke();
    }
  };

  const drawGrid = (f, t) => {
    const step = 80;
    ctx.strokeStyle = `rgba(255,255,255,${0.15 * t})`;
    for(let x=0; x<w; x+=step) {
      ctx.beginPath();
      for(let y=0; y<h; y+=15) {
        const off = Math.sin(x*0.01 + y*0.01 + f*0.05) * 40;
        ctx.lineTo(x + off, y);
      }
      ctx.stroke();
    }
  };

  const drawStars = (f, t) => {
    for(let i=0; i<150; i++) {
      const s = (i * 13.5 + f * 4) % w;
      const y = (i * 21.3) % h;
      const size = (s / w) * 4;
      ctx.fillStyle = `rgba(255,255,255,${(s/w) * 0.6 * t})`;
      ctx.fillRect(s, y, size, size);
    }
  };

  const drawHelix = (f, t) => {
    ctx.fillStyle = `rgba(${varToRgb('--accent-rgb')}, ${0.5 * t})`;
    for(let i=0; i<40; i++) {
      const x = w/2 + Math.sin(f*0.05 + i*0.4) * 150;
      const y = (i * (h/40));
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI*2);
      ctx.fill();
    }
  };

  const drawFlow = (f, t) => {
    ctx.fillStyle = `rgba(255,255,255,${0.08 * t})`;
    for(let i=0; i<6; i++) {
      ctx.beginPath();
      ctx.ellipse(w/2, h/2, w*0.35 + Math.sin(f*0.02+i)*80, h*0.35 + Math.cos(f*0.02+i)*80, f*0.01, 0, Math.PI*2);
      ctx.fill();
    }
  };

  const modes = [drawParticles, drawGrid, drawStars, drawHelix, drawFlow];

  const varToRgb = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "255,255,255";

  const loop = () => {
    frame++;
    ctx.clearRect(0, 0, w, h);
    
    if (transition < 1) transition += 0.01;
    
    modes[currentMode](frame, 1);
    
    requestAnimationFrame(loop);
  };
  loop();

  return {
    setSection: (key) => {
      // On peut changer de mode aléatoirement au scroll
      if (Math.random() > 0.7) {
        currentMode = Math.floor(Math.random() * modes.length);
      }
    }
  };
};

const setupVideoStory = (config) => {
  const engine = setupBackgroundEngine(config);
  const sections = Array.from(document.querySelectorAll(".panel[data-video-key]"));
  
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.find(e => e.isIntersecting);
    if (visible) {
      engine.setSection(visible.target.dataset.videoKey);
      setActiveNav(visible.target.dataset.videoKey);
    }
  }, { threshold: 0.5 });

  sections.forEach(s => observer.observe(s));

  const setActiveNav = (key) => {
    document.querySelectorAll('.nav__link[data-target]').forEach(l => {
      l.classList.toggle("is-active", l.dataset.target === key);
    });
  };

  return { lockToSection: (id) => {} };
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

const setupHeaderHide = () => {
  const header = document.querySelector(".header");
  if (!header) return;
  let lastScroll = 0;
  window.addEventListener("scroll", () => {
    const currentScroll = window.pageYOffset;
    if (currentScroll <= 0) {
      header.classList.remove("is-hidden");
      return;
    }
    if (currentScroll > lastScroll && !header.classList.contains("is-hidden")) {
      header.classList.add("is-hidden");
    } else if (currentScroll < lastScroll && header.classList.contains("is-hidden")) {
      header.classList.remove("is-hidden");
    }
    lastScroll = currentScroll;
  }, { passive: true });
};

const setupScrollReveal = () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("reveal-active");
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll(".panel__content").forEach(el => {
    el.classList.add("reveal");
    observer.observe(el);
  });
};

const main = async () => {
  await cleanupServiceWorkers();
  setupCursor();
  setupProgress();
  setupHeroScrollButton();
  setupHeaderHide();
  setupScrollReveal();

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
