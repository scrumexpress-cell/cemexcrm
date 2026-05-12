import type { Role } from "@/integrations/supabase/client";

export function roleHome(role: Role | null | undefined): "/map" | "/leads" | "/dashboard" {
  if (role === "head") return "/dashboard";
  if (role === "gerente") return "/leads";
  return "/map";
}
