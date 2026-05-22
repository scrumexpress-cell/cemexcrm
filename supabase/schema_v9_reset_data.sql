-- =====================================================
-- v9: Reset de datos transaccionales (NO toca usuarios)
-- =====================================================
-- Limpia todas las oportunidades, alertas, tareas, comentarios,
-- fotos, interacciones, obras, shares y audit log.
-- Conserva: auth.users y public.profiles (logins y perfiles).
--
-- Ejecutar UNA sola vez para dejar la plataforma en cero
-- para pruebas.
-- =====================================================

begin;

-- Notificaciones / alertas
delete from public.alertas;

-- Tareas de seguimiento
delete from public.tareas;

-- Comentarios y menciones
delete from public.sitio_comentarios;

-- Shares públicos
delete from public.sitio_shares;

-- Fotos (registros en DB; los archivos en Storage se limpian aparte si aplica)
delete from public.fotos;

-- Interacciones / bitácora
delete from public.interacciones;

-- Sitios primero deben desligarse de obras para evitar conflictos del trigger
update public.sitios set obra_id = null;

-- Obras (licitaciones)
delete from public.obras;

-- Sitios (oportunidades)
delete from public.sitios;

-- Audit log
delete from public.audit_log;

-- Archivos físicos de fotos en Storage (bucket sitio-fotos)
delete from storage.objects where bucket_id = 'sitio-fotos';

commit;
