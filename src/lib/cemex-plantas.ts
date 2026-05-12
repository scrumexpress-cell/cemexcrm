// Plantas CEMEX (datos demo para Guadalajara metro)
export interface PlantaCemex {
  id: string;
  nombre: string;
  lng: number;
  lat: number;
}

export const PLANTAS_CEMEX: PlantaCemex[] = [
  { id: "gdl-norte", nombre: "Planta GDL Norte", lng: -103.3105, lat: 20.7195 },
  { id: "tlaquepaque", nombre: "Planta Tlaquepaque", lng: -103.3115, lat: 20.6235 },
  { id: "zapopan", nombre: "Planta Zapopan", lng: -103.4205, lat: 20.7045 },
];
