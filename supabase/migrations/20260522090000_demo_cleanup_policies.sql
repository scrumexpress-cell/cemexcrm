drop policy if exists "sitios_delete" on public.sitios;
create policy "sitios_delete" on public.sitios
  for delete to authenticated using (
    public.has_role(auth.uid(),'head')
    or (public.has_role(auth.uid(),'gerente') and zona_id = public.my_zona())
    or vendedor_id = auth.uid()
  );

drop policy if exists "obras_delete" on public.obras;
create policy "obras_delete" on public.obras
  for delete to authenticated using (
    created_by = auth.uid()
    or public.has_role(auth.uid(),'head')
    or public.has_role(auth.uid(),'gerente')
  );
