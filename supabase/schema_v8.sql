-- Schema v8 — Permitir lectura de perfiles entre usuarios autenticados
--
-- Problema: en la sección de comentarios el selector de "Mencionar" aparecía
-- vacío porque la única política de SELECT sobre `profiles` era
-- `profiles_self_read` (sólo permite leer el propio perfil). Por eso aunque
-- hubiera varios gerentes y leads dados de alta, nadie podía verlos para
-- mencionarlos.
--
-- Solución: agregar una política que permita a cualquier usuario autenticado
-- leer los perfiles. Los datos expuestos (nombre, email, rol, zona) son
-- necesarios para colaborar entre vendedores, gerentes y heads dentro del CRM.

drop policy if exists "profiles_authenticated_read" on public.profiles;
create policy "profiles_authenticated_read" on public.profiles
  for select to authenticated
  using (true);
