// Registro de PWA + Notification API (notificaciones locales).
// Push real (VAPID) se maneja aparte si el server lo soporta.

import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

let registration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return registration;
  } catch (e) {
    console.warn("SW register failed:", (e as Error).message);
    return null;
  }
}

export function getRegistration() {
  return registration;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

export function notifyLocal(opts: {
  title: string;
  body?: string;
  tag?: string;
  url?: string;
}) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (registration?.active) {
    registration.active.postMessage({
      type: "notify",
      title: opts.title,
      body: opts.body,
      tag: opts.tag,
      data: { url: opts.url },
    });
  } else {
    try {
      new Notification(opts.title, { body: opts.body, tag: opts.tag });
    } catch {
      /* ignore */
    }
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function subscribeForPush(userId: string): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !registration) return false;
  try {
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.buffer.slice(
          key.byteOffset,
          key.byteOffset + key.byteLength,
        ) as ArrayBuffer,
      });
    }
    const json = sub.toJSON();
    const endpoint = json.endpoint!;
    const p256dh = json.keys?.p256dh ?? "";
    const auth = json.keys?.auth ?? "";
    if (!endpoint || !p256dh || !auth) return false;

    await supabase
      .from("push_subscriptions")
      .upsert(
        {
          usuario_id: userId,
          endpoint,
          p256dh,
          auth_key: auth,
          user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
        { onConflict: "usuario_id,endpoint" },
      );
    return true;
  } catch (e) {
    console.warn("push subscribe failed:", (e as Error).message);
    return false;
  }
}
