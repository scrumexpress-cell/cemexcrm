import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { roleHome } from "@/lib/role-home";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (profile) navigate({ to: roleHome(profile.role) });
  }, [user, profile, loading, navigate]);

  return (
    <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
      Cargando...
    </div>
  );
}
