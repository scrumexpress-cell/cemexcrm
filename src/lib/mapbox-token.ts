const KEY = "cemex_mapbox_token";

export function getMapboxToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ||
    window.localStorage.getItem(KEY)
  );
}

export function setMapboxToken(token: string) {
  window.localStorage.setItem(KEY, token);
}
