-- =====================================================
-- v5: Etapas del pipeline de oportunidad
-- =====================================================
-- Estados del flujo:
--   1. deteccion        -> apenas se identificó la obra (puede no tener datos completos)
--   2. registro_inicial -> ya se capturó en mapa con datos parciales
--   3. info_completa    -> tiene volumen, dirección y contacto/referencia
--   4. en_seguimiento   -> hay al menos una interacción registrada
--   5. cerrado          -> tiene estatus_final (ganado/perdido/pospuesto/inactivo)

DO $$ BEGIN
  CREATE TYPE sitio_etapa AS ENUM (
    'deteccion',
    'registro_inicial',
    'info_completa',
    'en_seguimiento',
    'cerrado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.sitios
  ADD COLUMN IF NOT EXISTS etapa sitio_etapa NOT NULL DEFAULT 'registro_inicial';

-- Backfill etapa a partir del estado actual
UPDATE public.sitios SET etapa = 'cerrado'
  WHERE estatus_final IS NOT NULL AND etapa <> 'cerrado';

UPDATE public.sitios s SET etapa = 'en_seguimiento'
  WHERE estatus_final IS NULL
    AND etapa IN ('deteccion','registro_inicial','info_completa')
    AND EXISTS (SELECT 1 FROM public.interacciones i WHERE i.sitio_id = s.id);

UPDATE public.sitios SET etapa = 'info_completa'
  WHERE estatus_final IS NULL
    AND etapa = 'registro_inicial'
    AND volumen_m3 IS NOT NULL
    AND direccion IS NOT NULL
    AND nombre_referencia IS NOT NULL;

-- Trigger: avanzar etapa automáticamente al registrar interacciones / cierre
CREATE OR REPLACE FUNCTION public.sitio_auto_etapa()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estatus_final IS NOT NULL THEN
    NEW.etapa := 'cerrado';
  ELSIF NEW.etapa NOT IN ('en_seguimiento','cerrado')
        AND NEW.volumen_m3 IS NOT NULL
        AND NEW.direccion IS NOT NULL
        AND NEW.nombre_referencia IS NOT NULL THEN
    NEW.etapa := 'info_completa';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sitio_auto_etapa_trg ON public.sitios;
CREATE TRIGGER sitio_auto_etapa_trg
  BEFORE INSERT OR UPDATE ON public.sitios
  FOR EACH ROW EXECUTE FUNCTION public.sitio_auto_etapa();

CREATE OR REPLACE FUNCTION public.interaccion_avanza_etapa()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.sitios
     SET etapa = 'en_seguimiento'
   WHERE id = NEW.sitio_id
     AND estatus_final IS NULL
     AND etapa <> 'en_seguimiento';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS interaccion_avanza_etapa_trg ON public.interacciones;
CREATE TRIGGER interaccion_avanza_etapa_trg
  AFTER INSERT ON public.interacciones
  FOR EACH ROW EXECUTE FUNCTION public.interaccion_avanza_etapa();
