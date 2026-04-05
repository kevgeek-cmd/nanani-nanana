const CMS_STORAGE_KEY = "nn_cms_config_v1";
const CMS_UI_KEY = "nn_cms_ui_v1";

const byId = (id) => document.getElementById(id);

const cleanupServiceWorkers = async () => {
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!isLocalhost) return;
  if (!("serviceWorker" in navigator)) return;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map((r) => {
        const scriptUrl = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "";
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

const nowDateIso = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const normalizeConfig = (config) => {
  const cfg = typeof config === "object" && config ? config : {};

  const defaults = {
    supabase: {
      enabled: false,
      url: "",
      anonKey: "",
      configId: "default"
    },
    general: {
      siteTitle: "NANANI NANANA",
      faviconUrl: ""
    },
    branding: { name: "NANANI NANANA", slogan: "Musique · Art · Spectacle · Sport · Culture", eyebrow: "Média digital visuel" },
    menu: [
      { target: "home", label: "Accueil" },
      { target: "about", label: "À propos" },
      { target: "media", label: "Contenus" },
      { target: "contact", label: "Contact" }
    ],
    sections: {
      home: { cta: "Découvrir", hint: "Scroll pour entrer dans l’histoire." },
      about: {
        title: "On parle de nous",
        text: "",
        pills: ["Éditorial", "Visuel", "Communauté"],
        card: { label: "Notre angle", title: "", copy: "" }
      },
      media: { title: "Contenus / Média", subtitle: "" },
      ads: { title: "Publicité", subtitle: "" },
      contact: { title: "Contact", text: "", note: "Le formulaire envoie un email via votre client mail (modifiable dans le CMS)." }
    },
    backgroundVideos: {
      home: { provider: "cc0", src: "", poster: "" },
      about: { provider: "cc0", src: "", poster: "" },
      media: { provider: "cc0", src: "", poster: "" },
      ads: { provider: "cc0", src: "", poster: "" },
      contact: { provider: "cc0", src: "", poster: "" }
    },
    content: [],
    ads: [],
    blogPosts: [],
    contact: {
      email: "contact@nanani-nanana.media",
      formEndpoint: "",
      socials: [
        { label: "Instagram", url: "https://instagram.com/" },
        { label: "TikTok", url: "https://tiktok.com/" },
        { label: "YouTube", url: "https://youtube.com/" }
      ]
    },
    providers: {
      pixabay: { apiKey: "", enabled: false },
      pexels: { apiKey: "", enabled: false }
    }
  };

  const normalized = {
    ...defaults,
    ...cfg,
    supabase: { ...defaults.supabase, ...(cfg.supabase || {}) },
    general: { ...defaults.general, ...(cfg.general || {}) },
    branding: { ...defaults.branding, ...(cfg.branding || {}) },
    sections: { ...defaults.sections, ...(cfg.sections || {}) },
    backgroundVideos: { ...defaults.backgroundVideos, ...(cfg.backgroundVideos || {}) },
    contact: { ...defaults.contact, ...(cfg.contact || {}) },
    providers: {
      ...defaults.providers,
      ...(cfg.providers || {}),
      pixabay: { ...defaults.providers.pixabay, ...((cfg.providers || {}).pixabay || {}) },
      pexels: { ...defaults.providers.pexels, ...((cfg.providers || {}).pexels || {}) }
    },
    menu: Array.isArray(cfg.menu) ? cfg.menu : defaults.menu,
    content: Array.isArray(cfg.content) ? cfg.content : defaults.content,
    ads: Array.isArray(cfg.ads) ? cfg.ads : defaults.ads,
    blogPosts: Array.isArray(cfg.blogPosts) ? cfg.blogPosts : defaults.blogPosts
  };

  normalized.blogPosts = normalized.blogPosts
    .map((p, idx) => {
      const id = String(p?.id || `post-${idx + 1}`);
      const title = String(p?.title || "").trim();
      const slug = String(p?.slug || slugify(title) || id).trim();
      return {
        id,
        title,
        slug,
        excerpt: String(p?.excerpt || "").trim(),
        coverUrl: String(p?.coverUrl || "").trim(),
        content: String(p?.content || "").trim(),
        published: Boolean(p?.published),
        date: String(p?.date || nowDateIso()).trim()
      };
    })
    .filter((p) => p.id);

  return normalized;
};

const fetchJson = async (url, init) => {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
};

const loadBaseConfig = async () => {
  const local = safeJsonParse(localStorage.getItem(CMS_STORAGE_KEY));
  if (local) return normalizeConfig(local);
  try {
    const remote = await fetchJson("cms.json", { cache: "no-store" });
    return normalizeConfig(remote);
  } catch {
    return normalizeConfig(null);
  }
};

const showToast = (message) => {
  const toast = byId("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
};

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v === null || typeof v === "undefined") continue;
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c instanceof Node) node.appendChild(c);
    else if (typeof c === "string") node.appendChild(document.createTextNode(c));
  }
  return node;
};

const card = (title, children = []) =>
  el("section", { class: "cms-card" }, [el("div", { class: "cms-card__title", text: title }), ...children]);

const field = ({ label, value, onInput, type = "text", placeholder = "", right = null }) =>
  el("label", { class: "cms-field" }, [
    el("span", { class: "cms-field__label", text: label }),
    el("div", { class: "cms-field__row" }, [
      el("input", { class: "cms-field__input", type, value, placeholder, oninput: (e) => onInput(e.target.value) }),
      right
    ])
  ]);

const textareaField = ({ label, value, onInput, placeholder = "" }) =>
  el("label", { class: "cms-field" }, [
    el("span", { class: "cms-field__label", text: label }),
    el("textarea", { class: "cms-field__input cms-field__textarea", placeholder, oninput: (e) => onInput(e.target.value) }, [
      value || ""
    ])
  ]);

const toggleField = ({ label, checked, onChange }) =>
  el("label", { class: "cms-toggle" }, [
    el("span", { class: "cms-toggle__label", text: label }),
    el("input", { type: "checkbox", checked: checked ? "checked" : null, oninput: (e) => onChange(Boolean(e.target.checked)) })
  ]);

const uploadButton = ({ onDataUrl }) => {
  const input = el("input", { type: "file", accept: "image/*", hidden: true });
  const btn = el("button", { class: "cms-upload", type: "button", text: "Upload", onclick: () => input.click() });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onDataUrl(String(reader.result || ""));
      input.value = "";
    };
    reader.readAsDataURL(file);
  });
  return el("div", {}, [btn, input]);
};

let state = null;
let dirty = false;
let activeTab = "general";
let selectedPostId = "";
let supabaseClient = null;
let isAdmin = false;

const setDirty = (value) => {
  dirty = Boolean(value);
  const saveBtn = byId("saveBtn");
  if (saveBtn) saveBtn.classList.toggle("cms-save--dirty", dirty);
};

const setAuthError = (message) => {
  const el = byId("authError");
  if (!el) return;
  const msg = String(message || "").trim();
  el.textContent = msg;
  el.hidden = !msg;
};

const showAuthGate = () => {
  const gate = byId("authGate");
  const app = byId("cmsApp");
  const mainEl = byId("cmsMain");
  const sidebar = byId("cmsSidebar");
  if (gate) gate.hidden = false;
  if (app) app.hidden = true;
  if (mainEl) mainEl.hidden = true;
  if (sidebar) sidebar.hidden = true;
};

const showCmsApp = () => {
  const gate = byId("authGate");
  const app = byId("cmsApp");
  const mainEl = byId("cmsMain");
  const sidebar = byId("cmsSidebar");
  if (gate) gate.hidden = true;
  if (app) app.hidden = false;
  if (mainEl) mainEl.hidden = false;
  if (sidebar) sidebar.hidden = false;
};

const getSupabaseClient = (cfg) => {
  const enabled = Boolean(cfg?.supabase?.enabled);
  const url = String(cfg?.supabase?.url || "").trim();
  const anonKey = String(cfg?.supabase?.anonKey || "").trim();
  if (!enabled || !url || !anonKey) return null;
  const factory = window.supabase?.createClient;
  if (typeof factory !== "function") return null;
  return factory(url, anonKey);
};

const stripSupabaseSecrets = (cfg) => {
  const next = { ...cfg };
  if (next.supabase) next.supabase = { ...next.supabase, anonKey: "" };
  return next;
};

const save = async () => {
  if (supabaseClient) {
    if (!isAdmin) {
      showToast("Accès refusé (admin requis).");
      return;
    }
    const configId = String(state?.supabase?.configId || "default").trim() || "default";
    const payload = stripSupabaseSecrets(state);
    const { error } = await supabaseClient.from("site_config").upsert({ id: configId, data: payload }, { onConflict: "id" });
    if (error) {
      showToast(error.message);
      return;
    }
    setDirty(false);
    showToast("Enregistré (Supabase).");
    return;
  }

  localStorage.setItem(CMS_STORAGE_KEY, JSON.stringify(state));
  setDirty(false);
  showToast("Enregistré (local).");
};

const exportJson = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nanani-nanana.cms.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Exporté.");
};

const importJson = async (file) => {
  const text = await file.text();
  const parsed = safeJsonParse(text);
  if (!parsed) {
    showToast("JSON invalide.");
    return;
  }
  state = normalizeConfig(parsed);
  setDirty(true);
  render();
  showToast("Importé.");
};

const reset = async () => {
  localStorage.removeItem(CMS_STORAGE_KEY);
  state = await loadBaseConfig();
  setDirty(false);
  render();
  showToast("Reset.");
};

const tabs = [
  { id: "general", label: "Général", subtitle: "Paramètres du site." },
  { id: "header", label: "En-tête", subtitle: "Menu et identité." },
  { id: "texts", label: "Textes", subtitle: "Éditer tous les textes visibles du site." },
  { id: "ads", label: "Publicités", subtitle: "Blocs partenaires." },
  { id: "blog", label: "Blog", subtitle: "Articles et publications." },
  { id: "videos", label: "Vidéos", subtitle: "Vidéos de fond + contenus 9:16." },
  { id: "contact", label: "Contact", subtitle: "Email et réseaux." },
  { id: "admins", label: "Admins", subtitle: "Gérer les comptes administrateurs." }
];

const setActiveTab = (tabId) => {
  const t = tabs.find((x) => x.id === tabId);
  activeTab = t ? t.id : "general";
  localStorage.setItem(CMS_UI_KEY, JSON.stringify({ tab: activeTab, post: selectedPostId }));
  render();
};

const updateTopbar = () => {
  const t = tabs.find((x) => x.id === activeTab) || tabs[0];
  const title = byId("cmsTitle");
  const sub = byId("cmsSubtitle");
  if (title) title.textContent = t.label;
  if (sub) sub.textContent = t.subtitle;
};

const renderNav = () => {
  const nav = byId("cmsNav");
  if (!nav) return;
  nav.innerHTML = "";

  for (const t of tabs) {
    const btn = el(
      "button",
      {
        type: "button",
        class: `cms__navItem ${t.id === activeTab ? "is-active" : ""}`,
        onclick: () => setActiveTab(t.id)
      },
      [t.label]
    );
    nav.appendChild(btn);
  }
};

const renderGeneral = () => {
  return el("div", { class: "cms-grid" }, [
    card("Paramètres du site", [
      el("div", { class: "cms-card__body" }, [
        field({
          label: "Nom du site (onglet navigateur)",
          value: state.general.siteTitle || "",
          onInput: (v) => {
            state.general.siteTitle = v;
            setDirty(true);
          }
        }),
        field({
          label: "Favicon (URL ou upload)",
          value: state.general.faviconUrl || "",
          onInput: (v) => {
            state.general.faviconUrl = v;
            setDirty(true);
          },
          right: uploadButton({
            onDataUrl: (dataUrl) => {
              state.general.faviconUrl = dataUrl;
              setDirty(true);
              render();
            }
          })
        })
      ])
    ]),
    card("Hero / Identité", [
      el("div", { class: "cms-card__body" }, [
        field({
          label: "Nom",
          value: state.branding.name || "",
          onInput: (v) => {
            state.branding.name = v;
            setDirty(true);
          }
        }),
        field({
          label: "Badge",
          value: state.branding.eyebrow || "",
          onInput: (v) => {
            state.branding.eyebrow = v;
            setDirty(true);
          }
        }),
        textareaField({
          label: "Slogan",
          value: state.branding.slogan || "",
          onInput: (v) => {
            state.branding.slogan = v;
            setDirty(true);
          }
        })
      ])
    ]),
    card("Supabase (mode multi-admin)", [
      el("div", { class: "cms-card__body" }, [
        toggleField({
          label: "Activer Supabase",
          checked: Boolean(state.supabase?.enabled),
          onChange: (v) => {
            state.supabase.enabled = v;
            setDirty(true);
          }
        }),
        field({
          label: "Supabase URL",
          value: state.supabase?.url || "",
          placeholder: "https://xxxx.supabase.co",
          onInput: (v) => {
            state.supabase.url = v;
            setDirty(true);
          }
        }),
        field({
          label: "Anon Key",
          value: state.supabase?.anonKey || "",
          placeholder: "eyJhbGciOi...",
          onInput: (v) => {
            state.supabase.anonKey = v;
            setDirty(true);
          }
        }),
        field({
          label: "Config ID",
          value: state.supabase?.configId || "default",
          onInput: (v) => {
            state.supabase.configId = v || "default";
            setDirty(true);
          }
        }),
        el("div", { class: "cms-auth__note", text: "Après Enregistrer, recharge la page du CMS pour activer la connexion Supabase." })
      ])
    ])
  ]);
};

const renderHeader = () => {
  return el("div", { class: "cms-grid" }, [
    card("Menu", [
      el("div", { class: "cms-card__body" }, [
        ...state.menu.map((item, idx) =>
          field({
            label: item.target,
            value: item.label || "",
            onInput: (v) => {
              state.menu[idx] = { ...item, label: v };
              setDirty(true);
            }
          })
        )
      ])
    ]),
    card("Textes", [
      el("div", { class: "cms-card__body" }, [
        field({
          label: "À propos — Titre",
          value: state.sections.about.title || "",
          onInput: (v) => {
            state.sections.about.title = v;
            setDirty(true);
          }
        }),
        textareaField({
          label: "À propos — Texte",
          value: state.sections.about.text || "",
          onInput: (v) => {
            state.sections.about.text = v;
            setDirty(true);
          }
        }),
        field({
          label: "Contenus — Titre",
          value: state.sections.media.title || "",
          onInput: (v) => {
            state.sections.media.title = v;
            setDirty(true);
          }
        }),
        field({
          label: "Contenus — Sous-titre",
          value: state.sections.media.subtitle || "",
          onInput: (v) => {
            state.sections.media.subtitle = v;
            setDirty(true);
          }
        })
      ])
    ])
  ]);
};

const renderTexts = () => {
  return el("div", { class: "cms-grid" }, [
    card("Accueil (Hero)", [
      el("div", { class: "cms-card__body" }, [
        field({
          label: "Hint (petit texte)",
          value: state.sections.home.hint || "",
          onInput: (v) => {
            state.sections.home.hint = v;
            setDirty(true);
          }
        })
      ])
    ]),
    card("À propos", [
      el("div", { class: "cms-card__body" }, [
        field({
          label: "Titre",
          value: state.sections.about.title || "",
          onInput: (v) => {
            state.sections.about.title = v;
            setDirty(true);
          }
        }),
        textareaField({
          label: "Texte",
          value: state.sections.about.text || "",
          onInput: (v) => {
            state.sections.about.text = v;
            setDirty(true);
          }
        }),
        field({
          label: "Pills (séparées par ,)",
          value: (state.sections.about.pills || []).join(", "),
          onInput: (v) => {
            state.sections.about.pills = String(v || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            setDirty(true);
          }
        }),
        field({
          label: "Carte — Label",
          value: state.sections.about.card.label || "",
          onInput: (v) => {
            state.sections.about.card.label = v;
            setDirty(true);
          }
        }),
        field({
          label: "Carte — Titre",
          value: state.sections.about.card.title || "",
          onInput: (v) => {
            state.sections.about.card.title = v;
            setDirty(true);
          }
        }),
        textareaField({
          label: "Carte — Texte",
          value: state.sections.about.card.copy || "",
          onInput: (v) => {
            state.sections.about.card.copy = v;
            setDirty(true);
          }
        })
      ])
    ]),
    card("Publicité", [
      el("div", { class: "cms-card__body" }, [
        field({
          label: "Sous-titre",
          value: state.sections.ads.subtitle || "",
          onInput: (v) => {
            state.sections.ads.subtitle = v;
            setDirty(true);
          }
        })
      ])
    ]),
    card("Contact", [
      el("div", { class: "cms-card__body" }, [
        field({
          label: "Texte",
          value: state.sections.contact.text || "",
          onInput: (v) => {
            state.sections.contact.text = v;
            setDirty(true);
          }
        }),
        field({
          label: "Email",
          value: state.contact.email || "",
          onInput: (v) => {
            state.contact.email = v;
            setDirty(true);
          }
        }),
        textareaField({
          label: "Note du formulaire",
          value: state.sections.contact.note || "",
          onInput: (v) => {
            state.sections.contact.note = v;
            setDirty(true);
          }
        }),
        el("button", { class: "cms-btn cms-btn--ghost", type: "button", onclick: () => setActiveTab("videos") }, [
          "Éditer les vidéos d’arrière-plan"
        ]),
        el("button", { class: "cms-btn cms-btn--ghost", type: "button", onclick: () => setActiveTab("videos") }, [
          "Éditer les tuiles (titres/desc)"
        ])
      ])
    ])
  ]);
};

const renderAds = () => {
  const list = el("div", { class: "cms-list" });

  const add = el("button", {
    class: "cms-btn cms-btn--ghost",
    type: "button",
    text: "Ajouter",
    onclick: () => {
      state.ads.push({ label: "", imageUrl: "", linkUrl: "" });
      setDirty(true);
      render();
    }
  });

  const body = el("div", { class: "cms-card__body" }, [el("div", { class: "cms-row" }, [add])]);
  for (let i = 0; i < state.ads.length; i++) {
    const item = state.ads[i];
    body.appendChild(
      el("div", { class: "cms-item" }, [
        el("div", { class: "cms-item__head" }, [
          el("div", { class: "cms-item__title", text: item.label || `Bloc #${i + 1}` }),
          el("button", {
            class: "cms-iconBtn",
            type: "button",
            text: "Supprimer",
            onclick: () => {
              state.ads.splice(i, 1);
              setDirty(true);
              render();
            }
          })
        ]),
        field({
          label: "Label",
          value: item.label || "",
          onInput: (v) => {
            state.ads[i] = { ...item, label: v };
            setDirty(true);
          }
        }),
        field({
          label: "Image (URL ou upload)",
          value: item.imageUrl || "",
          onInput: (v) => {
            state.ads[i] = { ...item, imageUrl: v };
            setDirty(true);
          },
          right: uploadButton({
            onDataUrl: (dataUrl) => {
              state.ads[i] = { ...item, imageUrl: dataUrl };
              setDirty(true);
              render();
            }
          })
        }),
        field({
          label: "Lien",
          value: item.linkUrl || "",
          onInput: (v) => {
            state.ads[i] = { ...item, linkUrl: v };
            setDirty(true);
          }
        })
      ])
    );
  }

  list.appendChild(card("Publicités", [body]));
  return list;
};

const findSelectedPostIndex = () => {
  const idx = state.blogPosts.findIndex((p) => p.id === selectedPostId);
  return idx >= 0 ? idx : 0;
};

const createPost = () => {
  const id = `post-${Date.now()}`;
  const post = { id, title: "", slug: id, excerpt: "", coverUrl: "", content: "", published: false, date: nowDateIso() };
  state.blogPosts.unshift(post);
  selectedPostId = id;
  setDirty(true);
  render();
};

const renderBlog = () => {
  if (!selectedPostId && state.blogPosts[0]) selectedPostId = state.blogPosts[0].id;
  const idx = findSelectedPostIndex();
  const post = state.blogPosts[idx] || null;

  const list = el("div", { class: "cms-postList" }, [
    el("div", { class: "cms-postList__head" }, [
      el("div", { class: "cms-postList__title", text: "Articles" }),
      el("button", { class: "cms-btn cms-btn--primary", type: "button", text: "Nouveau", onclick: createPost })
    ]),
    ...state.blogPosts.map((p) =>
      el(
        "button",
        {
          type: "button",
          class: `cms-postList__item ${p.id === selectedPostId ? "is-active" : ""}`,
          onclick: () => {
            selectedPostId = p.id;
            localStorage.setItem(CMS_UI_KEY, JSON.stringify({ tab: activeTab, post: selectedPostId }));
            render();
          }
        },
        [
          el("div", { class: "cms-postList__name", text: p.title || "Sans titre" }),
          el("div", { class: "cms-postList__meta", text: `${p.published ? "Publié" : "Brouillon"} · ${p.date || ""}` })
        ]
      )
    )
  ]);

  if (!post) {
    return el("div", { class: "cms-gridWide" }, [list, card("Éditeur", [el("div", { class: "cms-card__body", text: "Crée un article." })])]);
  }

  const remove = el("button", {
    class: "cms-iconBtn",
    type: "button",
    text: "Supprimer",
    onclick: () => {
      state.blogPosts = state.blogPosts.filter((x) => x.id !== post.id);
      selectedPostId = state.blogPosts[0]?.id || "";
      setDirty(true);
      render();
    }
  });

  const editor = card("Éditeur", [
    el("div", { class: "cms-card__body" }, [
      el("div", { class: "cms-row cms-row--spread" }, [
        toggleField({
          label: "Publié",
          checked: post.published,
          onChange: (v) => {
            state.blogPosts[idx] = { ...post, published: v };
            setDirty(true);
            render();
          }
        }),
        remove
      ]),
      field({
        label: "Titre",
        value: post.title,
        onInput: (v) => {
          const nextTitle = v;
          const nextSlug = post.slug && post.slug !== slugify(post.title) ? post.slug : slugify(nextTitle);
          state.blogPosts[idx] = { ...post, title: nextTitle, slug: nextSlug || post.slug };
          setDirty(true);
        }
      }),
      field({
        label: "Slug",
        value: post.slug,
        onInput: (v) => {
          state.blogPosts[idx] = { ...post, slug: slugify(v) };
          setDirty(true);
        }
      }),
      field({
        label: "Date (YYYY-MM-DD)",
        value: post.date,
        onInput: (v) => {
          state.blogPosts[idx] = { ...post, date: v };
          setDirty(true);
        }
      }),
      field({
        label: "Image de couverture (URL ou upload)",
        value: post.coverUrl,
        onInput: (v) => {
          state.blogPosts[idx] = { ...post, coverUrl: v };
          setDirty(true);
        },
        right: uploadButton({
          onDataUrl: (dataUrl) => {
            state.blogPosts[idx] = { ...post, coverUrl: dataUrl };
            setDirty(true);
            render();
          }
        })
      }),
      textareaField({
        label: "Extrait",
        value: post.excerpt,
        onInput: (v) => {
          state.blogPosts[idx] = { ...post, excerpt: v };
          setDirty(true);
        }
      }),
      textareaField({
        label: "Contenu",
        value: post.content,
        onInput: (v) => {
          state.blogPosts[idx] = { ...post, content: v };
          setDirty(true);
        }
      })
    ])
  ]);

  return el("div", { class: "cms-gridWide" }, [list, editor]);
};

const renderVideos = () => {
  const videoKeys = ["home", "about", "media", "ads", "contact"];

  const bg = card("Arrière-plan — vidéos par section", [
    el("div", { class: "cms-card__body" }, [
      el("div", {
        class: "cms-field__label",
        text: "Colle une URL MP4. Le fond change automatiquement quand tu scrolles ou cliques le menu."
      }),
      ...videoKeys.map((k) => {
        const entry = state.backgroundVideos[k] || { src: "", poster: "", provider: "custom" };
        return el("div", { class: "cms-item" }, [
          el("div", { class: "cms-item__head" }, [el("div", { class: "cms-item__title", text: `Section: ${k}` })]),
          field({
            label: "MP4 URL",
            value: entry.src || "",
            onInput: (v) => {
              state.backgroundVideos[k] = { ...entry, src: v, provider: entry.provider || "custom" };
              setDirty(true);
            }
          }),
          field({
            label: "Poster (optionnel)",
            value: entry.poster || "",
            onInput: (v) => {
              state.backgroundVideos[k] = { ...entry, poster: v, provider: entry.provider || "custom" };
              setDirty(true);
            }
          }),
          el("div", { class: "cms-row" }, [
            el(
              "a",
              {
                class: "cms-btn cms-btn--ghost",
                href: entry.src || "#",
                target: entry.src ? "_blank" : null,
                rel: entry.src ? "noopener noreferrer" : null
              },
              ["Tester la vidéo"]
            )
          ])
        ]);
      })
    ])
  ]);

  const content = card("Contenus 9:16", [
    el("div", { class: "cms-card__body" }, [
      el("div", { class: "cms-row" }, [
        el("button", {
          class: "cms-btn cms-btn--ghost",
          type: "button",
          text: "Ajouter",
          onclick: () => {
            state.content.push({ title: "", tag: "", meta: "", description: "", url: "", videoUrl: "", thumbnail: "" });
            setDirty(true);
            render();
          }
        })
      ]),
      ...state.content.map((item, idx) =>
        el("div", { class: "cms-item" }, [
          el("div", { class: "cms-item__head" }, [
            el("div", { class: "cms-item__title", text: item.title || `Item #${idx + 1}` }),
            el("button", {
              class: "cms-iconBtn",
              type: "button",
              text: "Supprimer",
              onclick: () => {
                state.content.splice(idx, 1);
                setDirty(true);
                render();
              }
            })
          ]),
          field({
            label: "Titre",
            value: item.title || "",
            onInput: (v) => {
              state.content[idx] = { ...item, title: v };
              setDirty(true);
            }
          }),
          field({
            label: "Tag",
            value: item.tag || "",
            onInput: (v) => {
              state.content[idx] = { ...item, tag: v };
              setDirty(true);
            }
          }),
          field({
            label: "Meta",
            value: item.meta || "",
            onInput: (v) => {
              state.content[idx] = { ...item, meta: v };
              setDirty(true);
            }
          }),
          field({
            label: "Lien",
            value: item.url || "",
            onInput: (v) => {
              state.content[idx] = { ...item, url: v };
              setDirty(true);
            }
          }),
          field({
            label: "Vidéo (MP4 9:16)",
            value: item.videoUrl || item.video || "",
            onInput: (v) => {
              state.content[idx] = { ...item, videoUrl: v };
              setDirty(true);
            }
          }),
          field({
            label: "Thumbnail (URL ou upload)",
            value: item.thumbnail || "",
            onInput: (v) => {
              state.content[idx] = { ...item, thumbnail: v };
              setDirty(true);
            },
            right: uploadButton({
              onDataUrl: (dataUrl) => {
                state.content[idx] = { ...item, thumbnail: dataUrl };
                setDirty(true);
                render();
              }
            })
          }),
          textareaField({
            label: "Description (bas de vignette)",
            value: item.description || "",
            onInput: (v) => {
              state.content[idx] = { ...item, description: v };
              setDirty(true);
            }
          })
        ])
      )
    ])
  ]);

  return el("div", { class: "cms-grid" }, [bg, content]);
};

const renderContact = () => {
  const socials = Array.isArray(state.contact.socials) ? state.contact.socials : [];

  const add = el("button", {
    class: "cms-btn cms-btn--ghost",
    type: "button",
    text: "Ajouter un réseau",
    onclick: () => {
      state.contact.socials = socials.concat([{ label: "", url: "" }]);
      setDirty(true);
      render();
    }
  });

  return el("div", { class: "cms-grid" }, [
    card("Contact", [
      el("div", { class: "cms-card__body" }, [
        field({
          label: "Email",
          value: state.contact.email || "",
          onInput: (v) => {
            state.contact.email = v;
            setDirty(true);
          }
        }),
        field({
          label: "URL du formulaire (ex: Formspree) — optionnel",
          value: state.contact.formEndpoint || "",
          placeholder: "https://formspree.io/f/...",
          onInput: (v) => {
            state.contact.formEndpoint = v;
            setDirty(true);
          }
        })
      ])
    ]),
    card("Réseaux", [
      el("div", { class: "cms-card__body" }, [
        el("div", { class: "cms-row" }, [add]),
        ...socials.map((s, idx) =>
          el("div", { class: "cms-item" }, [
            el("div", { class: "cms-item__head" }, [
              el("div", { class: "cms-item__title", text: s.label || `Réseau #${idx + 1}` }),
              el("button", {
                class: "cms-iconBtn",
                type: "button",
                text: "Supprimer",
                onclick: () => {
                  state.contact.socials.splice(idx, 1);
                  setDirty(true);
                  render();
                }
              })
            ]),
            field({
              label: "Label",
              value: s.label || "",
              onInput: (v) => {
                state.contact.socials[idx] = { ...s, label: v };
                setDirty(true);
              }
            }),
            field({
              label: "URL",
              value: s.url || "",
              onInput: (v) => {
                state.contact.socials[idx] = { ...s, url: v };
                setDirty(true);
              }
            })
          ])
        )
      ])
    ])
  ]);
};

const renderAdmins = () => {
  if (!supabaseClient) {
    return el("div", { class: "cms-grid" }, [
      card("Admins", [
        el("div", { class: "cms-card__body" }, [
          el("div", { class: "cms-auth__subtitle", text: "Active Supabase (cms.json) pour gérer des admins en ligne." })
        ])
      ])
    ]);
  }

  if (!isAdmin) {
    return el("div", { class: "cms-grid" }, [
      card("Accès refusé", [
        el("div", { class: "cms-card__body" }, [
          el("div", { class: "cms-auth__subtitle", text: "Ton compte est connecté, mais n’est pas admin." }),
          el("div", { class: "cms-auth__note", text: "Ajoute ton email dans la table Supabase admins pour activer l’accès." })
        ])
      ])
    ]);
  }

  const listWrap = el("div", { class: "cms-card__body" }, []);

  const emailInput = el("input", { class: "cms-field__input", type: "email", placeholder: "email@domaine.com" });
  const addBtn = el("button", {
    class: "cms-btn cms-btn--primary",
    type: "button",
    text: "Ajouter",
    onclick: async () => {
      const email = String(emailInput.value || "").trim().toLowerCase();
      if (!email) return;
      const { error } = await supabaseClient.from("admins").upsert({ email }, { onConflict: "email" });
      if (error) {
        showToast(error.message);
        return;
      }
      emailInput.value = "";
      showToast("Admin ajouté.");
      await refreshAdmins();
    }
  });

  const adminsList = el("div", { class: "cms-item", id: "adminsList" }, []);
  listWrap.appendChild(el("div", { class: "cms-row" }, [emailInput, addBtn]));
  listWrap.appendChild(adminsList);

  const refreshAdmins = async () => {
    const { data, error } = await supabaseClient.from("admins").select("email,created_at").order("created_at", { ascending: true });
    const wrap = byId("adminsList");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (error) {
      wrap.appendChild(el("div", { class: "cms-auth__subtitle", text: error.message }));
      return;
    }
    for (const a of data || []) {
      const email = String(a?.email || "").trim();
      const item = el("div", { class: "cms-item__head" }, [
        el("div", { class: "cms-item__title", text: email }),
        el("button", {
          class: "cms-iconBtn",
          type: "button",
          text: "Réinitialiser MDP",
          onclick: async () => {
            const redirectTo = `${location.origin}/admin.html`;
            const { error: resetErr } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
            if (resetErr) {
              showToast(resetErr.message);
              return;
            }
            showToast("Email de réinitialisation envoyé.");
          }
        }),
        el("button", {
          class: "cms-iconBtn",
          type: "button",
          text: "Retirer",
          onclick: async () => {
            const { error: delErr } = await supabaseClient.from("admins").delete().eq("email", email);
            if (delErr) {
              showToast(delErr.message);
              return;
            }
            showToast("Admin retiré.");
            await refreshAdmins();
          }
        })
      ]);
      wrap.appendChild(item);
    }
  };

  queueMicrotask(refreshAdmins);

  const myPassCard = card("Mon mot de passe", [
    el("div", { class: "cms-card__body" }, [
      el("div", { class: "cms-auth__subtitle", text: "Change uniquement ton mot de passe." }),
      (() => {
        const input = el("input", { class: "cms-field__input", type: "password", placeholder: "Nouveau mot de passe" });
        const btn = el("button", {
          class: "cms-btn cms-btn--primary",
          type: "button",
          text: "Mettre à jour",
          onclick: async () => {
            const pwd = String(input.value || "").trim();
            if (!pwd) return;
            const { error } = await supabaseClient.auth.updateUser({ password: pwd });
            if (error) {
              showToast(error.message);
              return;
            }
            input.value = "";
            showToast("Mot de passe mis à jour.");
          }
        });
        return el("div", { class: "cms-row" }, [input, btn]);
      })()
    ])
  ]);

  return el("div", { class: "cms-grid" }, [card("Admins", [listWrap]), myPassCard]);
};

const render = () => {
  renderNav();
  updateTopbar();

  const root = byId("adminRoot");
  if (!root || !state) return;
  root.innerHTML = "";

  const view =
    activeTab === "general"
      ? renderGeneral()
      : activeTab === "header"
        ? renderHeader()
        : activeTab === "texts"
          ? renderTexts()
        : activeTab === "ads"
          ? renderAds()
          : activeTab === "blog"
            ? renderBlog()
            : activeTab === "videos"
              ? renderVideos()
              : activeTab === "admins"
                ? renderAdmins()
                : renderContact();

  root.appendChild(view);
};

const wire = () => {
  const saveBtn = byId("saveBtn");
  const exportBtn = byId("exportBtn");
  const importFile = byId("importFile");
  const resetBtn = byId("resetBtn");
  const logoutBtn = byId("logoutBtn");
  const authForm = byId("authForm");

  if (saveBtn) saveBtn.addEventListener("click", () => void save());
  if (exportBtn) exportBtn.addEventListener("click", exportJson);
  if (resetBtn) resetBtn.addEventListener("click", reset);
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (!supabaseClient) return;
      await supabaseClient.auth.signOut();
      isAdmin = false;
      showAuthGate();
    });
  }

  if (importFile) {
    importFile.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await importJson(file);
      e.target.value = "";
    });
  }

  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setAuthError("");
      if (!supabaseClient) {
        setAuthError("Supabase n’est pas configuré (cms.json).");
        return;
      }
      const fd = new FormData(authForm);
      const email = String(fd.get("email") || "").trim();
      const password = String(fd.get("password") || "").trim();
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.message);
        return;
      }
      await bootstrapAfterAuth();
    });
  }

  // no signup button (création de compte via admin uniquement)

  window.addEventListener("beforeunload", (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
};

const computeIsAdmin = async () => {
  if (!supabaseClient) return false;
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const email = String(sessionData?.session?.user?.email || "").trim().toLowerCase();
  if (!email) return false;
  const { data, error } = await supabaseClient.from("admins").select("email").eq("email", email).maybeSingle();
  if (error) return false;
  return Boolean(data?.email);
};

const loadRemoteConfigFromSupabase = async (baseCfg) => {
  const configId = String(baseCfg?.supabase?.configId || "default").trim() || "default";
  const { data, error } = await supabaseClient.from("site_config").select("data").eq("id", configId).maybeSingle();
  if (error) throw error;
  const remote = data?.data && typeof data.data === "object" ? data.data : null;
  if (!remote) return normalizeConfig(baseCfg);
  return normalizeConfig({ ...remote, supabase: baseCfg.supabase });
};

const bootstrapAfterAuth = async () => {
  isAdmin = await computeIsAdmin();
  if (!isAdmin) {
    showAuthGate();
    setAuthError("Connexion OK, mais accès refusé : ton email n’est pas admin.");
    return;
  }
  const baseCfg = await loadBaseConfig();
  state = await loadRemoteConfigFromSupabase(baseCfg);
  const ui = safeJsonParse(localStorage.getItem(CMS_UI_KEY));
  if (ui?.tab) activeTab = String(ui.tab);
  if (ui?.post) selectedPostId = String(ui.post);
  showCmsApp();
  render();
};

const main = async () => {
  await cleanupServiceWorkers();
  const baseCfg = await loadBaseConfig();
  supabaseClient = getSupabaseClient(baseCfg);
  wire();

  if (!supabaseClient) {
    showAuthGate();
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (!data?.session) {
    showAuthGate();
    return;
  }

  await bootstrapAfterAuth();
};

main();
