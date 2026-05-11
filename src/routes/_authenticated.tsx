import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, MapIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading, signOut, profile } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 bg-primary text-primary-foreground shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/map" className="flex items-center gap-2">
            <MapIcon className="h-5 w-5" />
            <div className="leading-tight">
              <div className="font-bold text-sm">CEMEX Sites</div>
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
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
