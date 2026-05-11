import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, MapIcon, Bell, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import cemexLogo from "@/assets/cemex-logo.jpg";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading, signOut, profile } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    void refreshUnread();
    const ch = supabase
      .channel("alertas-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alertas", filter: `usuario_id=eq.${user.id}` },
        () => void refreshUnread(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function refreshUnread() {
    const { count } = await supabase
      .from("alertas")
      .select("*", { count: "exact", head: true })
      .eq("leida", false);
    setUnread(count ?? 0);
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Cargando...
      </div>
    );
  }

  const path = location.pathname;
  const NavLink = ({
    to,
    icon: Icon,
    label,
    badge,
  }: {
    to: "/map" | "/alertas" | "/dashboard";
    icon: typeof MapIcon;
    label: string;
    badge?: number;
  }) => {
    const active = path === to || path.startsWith(to + "/");
    return (
      <Link
        to={to}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium relative ${
          active ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
        <span>{label}</span>
        {badge ? (
          <span className="absolute top-1 right-[28%] min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 bg-primary text-primary-foreground shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/map" className="flex items-center gap-2.5">
            <div className="bg-white rounded-md px-2 py-1 flex items-center">
              <img src={cemexLogo} alt="CEMEX" className="h-5 object-contain" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-sm">Sites</div>
              <div className="text-[10px] opacity-80 uppercase tracking-wide">
                {profile?.role ?? "vendedor"}
              </div>
            </div>
          </Link>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await signOut();
              router.invalidate();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 flex flex-col pb-16">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-card border-t flex h-16 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
        <NavLink to="/map" icon={MapIcon} label="Mapa" />
        <NavLink to="/alertas" icon={Bell} label="Alertas" badge={unread} />
        <NavLink to="/dashboard" icon={BarChart3} label="Tablero" />
      </nav>
    </div>
  );
}
