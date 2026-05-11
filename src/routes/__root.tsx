import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página no encontrada</h2>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Inicio
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1, maximum-scale=1",
        },
        { title: "CEMEX Sites — Tablero de Prospección" },
        {
          name: "description",
          content:
            "Registro y seguimiento de sitios de construcción en Jalisco para el equipo CEMEX.",
        },
        { property: "og:title", content: "CEMEX Sites — Tablero de Prospección" },
        { name: "twitter:title", content: "CEMEX Sites — Tablero de Prospección" },
        { name: "description", content: "CEMEX Sites Hub is a mobile-first web app for sales teams to track construction sites." },
        { property: "og:description", content: "CEMEX Sites Hub is a mobile-first web app for sales teams to track construction sites." },
        { name: "twitter:description", content: "CEMEX Sites Hub is a mobile-first web app for sales teams to track construction sites." },
        { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d3d1aad2-a2cd-4214-af4d-31ced4861d3e/id-preview-9900865e--b7cd507b-6400-40d4-993a-cd1db84e4763.lovable.app-1778530957703.png" },
        { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d3d1aad2-a2cd-4214-af4d-31ced4861d3e/id-preview-9900865e--b7cd507b-6400-40d4-993a-cd1db84e4763.lovable.app-1778530957703.png" },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:type", content: "website" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        {
          rel: "stylesheet",
          href: "https://api.mapbox.com/mapbox-gl-js/v3.5.1/mapbox-gl.css",
        },
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
        },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
