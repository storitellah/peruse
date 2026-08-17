// Progressive Web App install + offline registration.
//
// Peruse installs as a real app on Chrome/Edge (and other Chromium browsers) via
// the native install prompt, and runs offline through the service worker. This
// module captures the install opportunity and exposes it to the Settings UI.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
type Cb = (available: boolean) => void;
const subs = new Set<Cb>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    subs.forEach((cb) => cb(true));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    subs.forEach((cb) => cb(false));
  });
}

/** True when the app is already running as an installed standalone app. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function canInstall(): boolean {
  return !!deferred;
}

export function onInstallAvailable(cb: Cb): () => void {
  subs.add(cb);
  cb(canInstall());
  return () => subs.delete(cb);
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  subs.forEach((cb) => cb(false));
  return outcome;
}

/** Register the service worker (production only, so dev stays uncached). */
export function registerSW(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support just won't be available */
    });
  });
}
