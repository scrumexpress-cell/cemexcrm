// Cola offline simple sobre IndexedDB para crear sitios sin conexión.
// Cuando vuelve la red, drena la cola contra Supabase.

import { supabase } from "@/integrations/supabase/client";

const DB_NAME = "cemex-offline";
const DB_VERSION = 1;
const STORE = "pending-sitios";

export interface PendingSitio {
  id: string;
  payload: {
    lat: number;
    lng: number;
    nombre_referencia: string | null;
    direccion: string | null;
    estatus: string;
    volumen_m3: number | null;
    vendedor_id: string;
    zona_id: string | null;
    notas: string | null;
  };
  created_at: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueSitio(payload: PendingSitio["payload"]): Promise<string> {
  const db = await openDb();
  const id = crypto.randomUUID();
  const item: PendingSitio = { id, payload, created_at: new Date().toISOString() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

export async function listPending(): Promise<PendingSitio[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as PendingSitio[]);
    req.onerror = () => reject(req.error);
  });
}

async function removePending(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function syncPending(): Promise<{ ok: number; failed: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: 0, failed: 0 };
  }
  const items = await listPending();
  let ok = 0;
  let failed = 0;
  for (const item of items) {
    const { error } = await supabase.from("sitios").insert(item.payload);
    if (error) {
      failed += 1;
    } else {
      await removePending(item.id);
      ok += 1;
    }
  }
  return { ok, failed };
}

export function watchOnline(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => callback();
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
