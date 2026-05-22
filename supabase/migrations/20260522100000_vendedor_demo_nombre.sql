-- Demo seller name override so seed data can show varied Mexican names
-- without creating real auth.users / profiles rows.
alter table public.sitios
  add column if not exists vendedor_demo_nombre text;
