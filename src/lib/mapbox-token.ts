const KEY = "cemex_mapbox_token";

const DEFAULT_TOKEN =
  "pk.eyJ1IjoiYWdpbGlkYWRlbmRpZ2l0YWwiLCJhIjoiY21wMWs3MHlmMDF1dzMxb253Mnh3OWQ5NCJ9.pzKNq9mT3tcYjECcPLIjWQ";

export function getMapboxToken(): string | null {
  if (typeof window === "undefined") return DEFAULT_TOKEN;
  return (
    (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ||
    window.localStorage.getItem(KEY) ||
    DEFAULT_TOKEN
  );
}

export function setMapboxToken(token: string) {
  window.localStorage.setItem(KEY, token);
}
