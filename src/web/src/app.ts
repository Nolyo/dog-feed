type Slot = "morning" | "evening";

type SlotState =
  | { done: false }
  | { done: true; createdAt: string; photoUrl: string };

type TodayResponse = {
  date: string;
  hours: { morning: number; evening: number };
  morning: SlotState;
  evening: SlotState;
};

type HistoryItem = {
  date: string;
  slot: Slot;
  createdAt: string;
  photoUrl: string;
};

const SLOT_LABEL: Record<Slot, string> = {
  morning: "Matin",
  evening: "Soir",
};

async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data.error || `Erreur ${res.status}`,
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: "Réseau indisponible" };
  }
}

function isStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function renderApp(root: HTMLElement): Promise<void> {
  const me = await api<{ authenticated: boolean }>("/api/me");
  if (!me.ok) {
    root.innerHTML = `<div class="error">Impossible de contacter le serveur.</div>`;
    return;
  }
  if (!me.data.authenticated) {
    renderLogin(root);
    return;
  }
  renderMain(root, "today");
}

function renderLogin(root: HTMLElement): void {
  root.innerHTML = `
    <div class="header-bar">
      <div>
        <h1>Dog Feed 🐶</h1>
        <p class="sub">Entre le PIN pour commencer</p>
      </div>
    </div>
    <div id="login-error" class="error hidden"></div>
    <form id="login-form" class="card">
      <input id="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" placeholder="PIN" maxlength="12" />
      <button type="submit">Entrer</button>
    </form>
    <p class="footer-hint">App familiale — repas des chiens</p>
  `;

  const form = root.querySelector<HTMLFormElement>("#login-form")!;
  const pinInput = root.querySelector<HTMLInputElement>("#pin")!;
  const err = root.querySelector<HTMLDivElement>("#login-error")!;
  pinInput.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.classList.add("hidden");
    const res = await api<{ ok: boolean }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ pin: pinInput.value }),
    });
    if (!res.ok) {
      err.textContent = res.error;
      err.classList.remove("hidden");
      return;
    }
    renderMain(root, "today");
  });
}

const INSTALL_DISMISS_KEY = "dogfeed_install_dismissed";

function pushSupported(): boolean {
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function isPushActive(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== "granted") return false;
  return (await getPushSubscription()) !== null;
}

function renderMain(root: HTMLElement, tab: "today" | "history"): void {
  root.innerHTML = `
    <div class="header-bar">
      <div>
        <h1>Dog Feed 🐶</h1>
        <p class="sub" id="date-line">Chargement…</p>
      </div>
      <div class="header-actions">
        <button type="button" class="icon-btn" id="settings-btn" aria-label="Réglages" title="Réglages">
          ⚙️
          <span class="dot off" id="push-dot" hidden></span>
        </button>
        <button type="button" class="logout" id="logout">Sortir</button>
      </div>
    </div>
    <div id="banners"></div>
    <div class="tabs">
      <button type="button" data-tab="today" class="${tab === "today" ? "active" : ""}">Aujourd'hui</button>
      <button type="button" data-tab="history" class="${tab === "history" ? "active" : ""}">Historique</button>
    </div>
    <div id="content"></div>
    <div id="lightbox" class="lightbox hidden" role="dialog"></div>
    <div id="settings-root"></div>
  `;

  root.querySelector("#logout")!.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: "{}" });
    renderLogin(root);
  });

  root.querySelector("#settings-btn")!.addEventListener("click", () => {
    void openSettings(root);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.tab as "today" | "history";
      renderMain(root, t);
    });
  });

  const lightbox = root.querySelector<HTMLDivElement>("#lightbox")!;
  lightbox.addEventListener("click", () => lightbox.classList.add("hidden"));

  setupInstallBanner(root.querySelector("#banners")!);
  void refreshPushDot(root);

  if (tab === "today") void loadToday(root);
  else void loadHistory(root);
}

async function refreshPushDot(root: HTMLElement): Promise<void> {
  const dot = root.querySelector<HTMLSpanElement>("#push-dot");
  if (!dot) return;
  if (!pushSupported()) {
    dot.hidden = true;
    return;
  }
  const active = await isPushActive();
  dot.hidden = false;
  dot.classList.toggle("off", !active);
  dot.title = active ? "Notifications activées" : "Notifications désactivées";
}

function setupInstallBanner(el: HTMLElement): void {
  const dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
  if (!(isIos() && !isStandalone()) || dismissed) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `
    <div class="banner" id="install-banner">
      <div class="banner-body">
        <strong>iPhone : écran d’accueil</strong>
        Partager → « Sur l’écran d’accueil » pour les notifs (iOS 16.4+).
      </div>
      <button type="button" class="banner-dismiss" id="dismiss-install" aria-label="Fermer">×</button>
    </div>
  `;

  el.querySelector("#dismiss-install")?.addEventListener("click", () => {
    localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    el.innerHTML = "";
  });
}

async function openSettings(root: HTMLElement): Promise<void> {
  const host = root.querySelector("#settings-root");
  if (!host) return;

  const active = await isPushActive();
  const supported = pushSupported();
  let statusText: string;
  if (!supported) {
    statusText = "Non supporté sur cet appareil / navigateur.";
  } else if (Notification.permission === "denied") {
    statusText = "Bloquées dans les réglages du téléphone.";
  } else if (active) {
    statusText = "Tu reçois les rappels repas.";
  } else {
    statusText = "Désactivées — pas de rappel push.";
  }

  host.innerHTML = `
    <div class="settings-sheet" id="settings-sheet" role="dialog" aria-modal="true" aria-label="Réglages">
      <div class="settings-panel">
        <h2>Réglages</h2>
        <p class="muted" style="margin:0 0 4px">Notifications & options</p>
        <div class="settings-row">
          <div>
            <div class="label">Notifications repas</div>
            <div class="hint" id="push-hint">${statusText}</div>
          </div>
          <button type="button" class="toggle-btn ${active ? "is-on" : "is-off"}" id="push-toggle" ${!supported || Notification.permission === "denied" ? "disabled" : ""}>
            ${active ? "Désactiver" : "Activer"}
          </button>
        </div>
        ${
          isIos() && !isStandalone()
            ? `<p class="muted" style="margin:12px 0 0;font-size:0.85rem">Sur iPhone, installe l’app (Partager → écran d’accueil) pour que les notifs fonctionnent.</p>`
            : ""
        }
        <div class="close-row">
          <button type="button" class="secondary" id="settings-close">Fermer</button>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    host.innerHTML = "";
  };

  host.querySelector("#settings-close")?.addEventListener("click", close);
  host.querySelector("#settings-sheet")?.addEventListener("click", (e) => {
    if (e.target === host.querySelector("#settings-sheet")) close();
  });

  const toggle = host.querySelector<HTMLButtonElement>("#push-toggle");
  const hint = host.querySelector<HTMLElement>("#push-hint");
  if (!toggle || !hint || !supported) return;

  toggle.addEventListener("click", async () => {
    toggle.disabled = true;
    const currentlyOn = await isPushActive();
    try {
      if (currentlyOn) {
        await disablePush();
        toggle.textContent = "Activer";
        toggle.classList.remove("is-on");
        toggle.classList.add("is-off");
        hint.textContent = "Désactivées — pas de rappel push.";
      } else {
        await enablePush();
        toggle.textContent = "Désactiver";
        toggle.classList.remove("is-off");
        toggle.classList.add("is-on");
        hint.textContent = "Tu reçois les rappels repas.";
      }
      await refreshPushDot(root);
    } catch (e) {
      hint.textContent = e instanceof Error ? e.message : "Échec";
    } finally {
      toggle.disabled = Notification.permission === "denied";
    }
  });
}

async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    throw new Error("Permission refusée.");
  }
  const reg = await navigator.serviceWorker.ready;
  const keyRes = await api<{ publicKey: string }>("/api/vapid-public-key");
  if (!keyRes.ok) throw new Error(keyRes.error);

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.data.publicKey),
    });
  }
  const json = sub.toJSON();
  const save = await api("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });
  if (!save.ok) throw new Error(save.error);
}

async function disablePush(): Promise<void> {
  const sub = await getPushSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    /* continue server cleanup */
  }
  await api("/api/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

function openLightbox(root: HTMLElement, src: string): void {
  const box = root.querySelector<HTMLDivElement>("#lightbox")!;
  box.innerHTML = `<img src="${src}" alt="Photo repas" />`;
  box.classList.remove("hidden");
}

async function loadToday(root: HTMLElement): Promise<void> {
  const content = root.querySelector("#content")!;
  const dateLine = root.querySelector("#date-line")!;
  content.innerHTML = `<p class="muted">Chargement…</p>`;

  const res = await api<TodayResponse>("/api/today");
  if (!res.ok) {
    if (res.status === 401) {
      renderLogin(root);
      return;
    }
    content.innerHTML = `<div class="error">${res.error}</div>`;
    return;
  }

  const t = res.data;
  dateLine.textContent = `Aujourd’hui · ${t.date}`;

  content.innerHTML = `
    ${slotCard("morning", t.hours.morning, t.morning)}
    ${slotCard("evening", t.hours.evening, t.evening)}
  `;

  content.querySelectorAll<HTMLImageElement>("[data-zoom]").forEach((img) => {
    img.addEventListener("click", () => openLightbox(root, img.src));
  });

  content.querySelectorAll<HTMLButtonElement>("[data-feed]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = btn.dataset.feed as Slot;
      openCapture(root, slot);
    });
  });
}

function slotCard(slot: Slot, hour: number, state: SlotState): string {
  if (state.done) {
    return `
      <article class="card done">
        <div class="card-head">
          <h2>${SLOT_LABEL[slot]} · ${hour}h</h2>
          <span class="badge ok">Fait ✓</span>
        </div>
        <p class="muted">Validé à ${new Date(state.createdAt).toLocaleTimeString("fr-FR")}</p>
        <img class="thumb" data-zoom src="${state.photoUrl}" alt="Preuve ${SLOT_LABEL[slot]}" />
      </article>
    `;
  }
  return `
    <article class="card">
      <div class="card-head">
        <h2>${SLOT_LABEL[slot]} · ${hour}h</h2>
        <span class="badge todo">À faire</span>
      </div>
      <p class="muted">Prends une photo de la gamelle pour valider.</p>
      <button type="button" data-feed="${slot}">Nourrir — prendre la photo</button>
    </article>
  `;
}

async function loadHistory(root: HTMLElement): Promise<void> {
  const content = root.querySelector("#content")!;
  const dateLine = root.querySelector("#date-line")!;
  dateLine.textContent = "14 derniers jours";
  content.innerHTML = `<p class="muted">Chargement…</p>`;

  const res = await api<{ items: HistoryItem[] }>("/api/history?days=14");
  if (!res.ok) {
    if (res.status === 401) {
      renderLogin(root);
      return;
    }
    content.innerHTML = `<div class="error">${res.error}</div>`;
    return;
  }

  if (res.data.items.length === 0) {
    content.innerHTML = `<div class="card"><p class="muted">Aucun repas enregistré pour l’instant.</p></div>`;
    return;
  }

  const byDate = new Map<string, HistoryItem[]>();
  for (const item of res.data.items) {
    const list = byDate.get(item.date) || [];
    list.push(item);
    byDate.set(item.date, list);
  }

  const html: string[] = [];
  for (const [date, items] of byDate) {
    html.push(`<div class="history-day"><h3>${date}</h3>`);
    for (const item of items) {
      html.push(`
        <div class="history-item">
          <img data-zoom src="${item.photoUrl}" alt="${SLOT_LABEL[item.slot]}" />
          <div>
            <strong>${SLOT_LABEL[item.slot]}</strong>
            <p class="muted" style="margin:4px 0 0">${new Date(item.createdAt).toLocaleString("fr-FR")}</p>
          </div>
        </div>
      `);
    }
    html.push(`</div>`);
  }
  content.innerHTML = html.join("");
  content.querySelectorAll<HTMLImageElement>("[data-zoom]").forEach((img) => {
    img.addEventListener("click", () => openLightbox(root, img.src));
  });
}

function openCapture(root: HTMLElement, slot: Slot): void {
  const content = root.querySelector("#content")!;
  const dateLine = root.querySelector("#date-line")!;
  dateLine.textContent = `Photo · ${SLOT_LABEL[slot]}`;

  content.innerHTML = `
    <div class="card">
      <p class="muted">Utilise la caméra (pas la galerie). Cadre la gamelle, puis valide.</p>
      <div class="camera-wrap">
        <video id="video" playsinline autoplay muted></video>
        <img id="preview" class="hidden" alt="Aperçu" />
      </div>
      <input id="file-fallback" type="file" accept="image/*" capture="environment" class="hidden" />
      <div id="cap-error" class="error hidden"></div>
      <div class="row" id="live-actions">
        <button type="button" class="secondary" id="cancel">Retour</button>
        <button type="button" id="shutter">Capturer</button>
      </div>
      <div class="row hidden" id="preview-actions">
        <button type="button" class="secondary" id="retake">Reprendre</button>
        <button type="button" id="upload">Valider</button>
      </div>
    </div>
  `;

  const video = content.querySelector<HTMLVideoElement>("#video")!;
  const preview = content.querySelector<HTMLImageElement>("#preview")!;
  const err = content.querySelector<HTMLDivElement>("#cap-error")!;
  const liveActions = content.querySelector("#live-actions")!;
  const previewActions = content.querySelector("#preview-actions")!;
  const fileFallback = content.querySelector<HTMLInputElement>("#file-fallback")!;

  let stream: MediaStream | null = null;
  let blob: Blob | null = null;

  const stopStream = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  content.querySelector("#cancel")!.addEventListener("click", () => {
    stopStream();
    renderMain(root, "today");
  });

  const showPreview = (b: Blob) => {
    blob = b;
    preview.src = URL.createObjectURL(b);
    video.classList.add("hidden");
    preview.classList.remove("hidden");
    liveActions.classList.add("hidden");
    previewActions.classList.remove("hidden");
  };

  content.querySelector("#retake")!.addEventListener("click", () => {
    blob = null;
    preview.classList.add("hidden");
    video.classList.remove("hidden");
    liveActions.classList.remove("hidden");
    previewActions.classList.add("hidden");
  });

  content.querySelector("#shutter")!.addEventListener("click", async () => {
    if (!stream) {
      fileFallback.click();
      return;
    }
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    const canvas = document.createElement("canvas");
    canvas.width = settings.width || video.videoWidth || 1280;
    canvas.height = settings.height || video.videoHeight || 960;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const b = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!b) {
      err.textContent = "Échec capture";
      err.classList.remove("hidden");
      return;
    }
    showPreview(b);
  });

  fileFallback.addEventListener("change", () => {
    const f = fileFallback.files?.[0];
    if (f) showPreview(f);
  });

  content.querySelector("#upload")!.addEventListener("click", async () => {
    if (!blob) return;
    const btn = content.querySelector<HTMLButtonElement>("#upload")!;
    btn.disabled = true;
    btn.textContent = "Envoi…";
    err.classList.add("hidden");

    const fd = new FormData();
    fd.append("slot", slot);
    fd.append("photo", blob, `${slot}.jpg`);

    const res = await api("/api/feed", { method: "POST", body: fd });
    stopStream();
    if (!res.ok) {
      err.textContent = res.error;
      err.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Valider";
      return;
    }
    renderMain(root, "today");
  });

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      video.srcObject = stream;
      await video.play();
    } catch {
      // iOS Safari sometimes prefers capture input
      err.textContent =
        "Caméra live indisponible — bascule sur l’appareil photo système.";
      err.classList.remove("hidden");
      fileFallback.classList.remove("hidden");
      content.querySelector<HTMLButtonElement>("#shutter")!.textContent =
        "Ouvrir l’appareil photo";
    }
  })();
}
