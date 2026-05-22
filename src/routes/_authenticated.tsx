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
import { LogOut, MapIcon, Bell, BarChart3, Briefcase, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resetAndSeedAll } from "@/lib/seed-sitios";
import {
  registerServiceWorker,
  ensureNotificationPermission,
  notifyLocal,
  subscribeForPush,
} from "@/lib/pwa";
import { syncPending, watchOnline } from "@/lib/offline-queue";
import { toast } from "sonner";
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
    // Auto-siembra de datos demo (una sola vez por usuario)
    void (async () => {
      const flagKey = `cemex-demo-seeded-v3-${user.id}`;
      if (typeof window === "undefined") return;
      if (window.localStorage.getItem(flagKey)) return;
      try {
        window.localStorage.setItem(flagKey, "pending");
        const { data: prof } = await supabase
          .from("profiles")
          .select("zona_id")
          .eq("id", user.id)
          .maybeSingle();
        await resetAndSeedAll(user, (prof?.zona_id as string | null) ?? null);
        window.localStorage.setItem(flagKey, "1");
        // refresca la vista actual para mostrar los datos sembrados
        router.invalidate();
      } catch (e) {
        window.localStorage.removeItem(flagKey);
        console.warn("auto-seed:", (e as Error).message);
      }
    })();
    void refreshUnread();

    // PWA: registrar service worker + pedir permiso + intentar suscribir a push
    void (async () => {
      await registerServiceWorker();
      const ok = await ensureNotificationPermission();
      if (ok) {
        await subscribeForPush(user.id);
      }
    })();

    // Drenar cola offline cuando hay red
    void syncPending().then((r) => {
      if (r.ok > 0) toast.success(`${r.ok} sitio(s) sincronizado(s) desde modo offline`);
    });
    const unwatchOnline = watchOnline(() => {
      void syncPending().then((r) => {
        if (r.ok > 0) toast.success(`${r.ok} sitio(s) sincronizado(s)`);
      });
    });

    const ch = supabase
      .channel("alertas-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alertas", filter: `usuario_id=eq.${user.id}` },
        (payload) => {
          void refreshUnread();
          const row = payload.new as { mensaje?: string | null; tipo?: string | null; sitio_id?: string | null } | null;
          if (payload.eventType === "INSERT" && row) {
            notifyLocal({
              title: "CEMEX Sites — nueva alerta",
              body: row.mensaje ?? row.tipo ?? "Alerta",
              tag: `alerta-${row.sitio_id ?? "general"}`,
              url: row.sitio_id ? `/sitios/${row.sitio_id}` : "/alertas",
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
      unwatchOnline();
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
  const role = profile?.role ?? "vendedor";
  const NavLink = ({
    to,
    icon: Icon,
    label,
    badge,
  }: {
    to: "/map" | "/alertas" | "/dashboard" | "/leads" | "/dia";
    icon: typeof MapIcon;
    label: string;
    badge?: number;
  }) => {
    const active = path === to || path.startsWith(to + "/");
    return (
      <Link
        to={to}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
          active ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <span className="relative inline-flex">
          <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
          {badge ? (
            <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center leading-none">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </span>
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-background">
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
      <main className="flex-1 flex flex-col pb-16 min-h-0 overflow-y-auto">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-card border-t flex h-16 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
        {role !== "head" && <NavLink to="/dia" icon={Sun} label="Mi día" />}
        {role !== "head" && <NavLink to="/map" icon={MapIcon} label="Mapa" />}
        <NavLink to="/leads" icon={Briefcase} label="Leads" />
        {role !== "vendedor" && (
          <NavLink to="/alertas" icon={Bell} label="Alertas" badge={unread} />
        )}
        {role === "head" && (
          <NavLink to="/dashboard" icon={BarChart3} label="Tablero" />
        )}
      </nav>
    </div>
  );
}
