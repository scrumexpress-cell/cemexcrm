import { PLANTAS_CEMEX, type PlantaCemex } from "@/lib/cemex-plantas";

export function distMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function plantaMasCercana(
  coords: { lat: number; lng: number },
): { planta: PlantaCemex; distancia: number } | null {
  if (PLANTAS_CEMEX.length === 0) return null;
  let best: { planta: PlantaCemex; distancia: number } | null = null;
  for (const p of PLANTAS_CEMEX) {
    const d = distMeters(coords, p);
    if (!best || d < best.distancia) best = { planta: p, distancia: d };
  }
  return best;
}
