import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ToastProvider } from "@/components/ui/toaster";
import { RouteProgress } from "@/components/layout/RouteProgress";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { CommandPalette } from "@/components/CommandPalette";
import { WrongNetworkBanner } from "@/components/layout/WrongNetworkBanner";
import { PwaRegister } from "@/components/layout/PwaRegister";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "ORVEX" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "ORVEX" },
      { name: "twitter:card", content: "summary" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/92INgNvHZYbXuoglAr06eF9gJKs2/social-images/social-1778910309431-ChatGPT_Image_7_Mei_2026,_00.42.39.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/92INgNvHZYbXuoglAr06eF9gJKs2/social-images/social-1778910309431-ChatGPT_Image_7_Mei_2026,_00.42.39.webp" },
      { title: "ORVEX — The Connoisseur's DEX on LitVM" },
      { property: "og:title", content: "ORVEX — The Connoisseur's DEX on LitVM" },
      { name: "twitter:title", content: "ORVEX — The Connoisseur's DEX on LitVM" },
      { name: "description", content: "ORVEX is a connoisseur-grade decentralized exchange on LitVM LiteForge — institutional precision, deep liquidity, smart routing, and atomic on-chain settlement." },
      { property: "og:description", content: "ORVEX is a connoisseur-grade decentralized exchange on LitVM LiteForge — institutional precision, deep liquidity, smart routing, and atomic on-chain settlement." },
      { name: "twitter:description", content: "ORVEX is a connoisseur-grade decentralized exchange on LitVM LiteForge — institutional precision, deep liquidity, smart routing, and atomic on-chain settlement." },
      { name: "twitter:site", content: "@ORVEX_LitVM" },
      { name: "twitter:creator", content: "@ORVEX_LitVM" },
      { name: "theme-color", content: "#7A5CFF" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "ORVEX" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-512.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "ORVEX",
          url: "https://orvexdex.lovable.app",
          logo: "https://orvexdex.lovable.app/favicon.ico",
          sameAs: ["https://x.com/ORVEX_LitVM"],
          description: "ORVEX — connoisseur-grade decentralized exchange on LitVM LiteForge.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "ORVEX",
          url: "https://orvexdex.lovable.app",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://orvexdex.lovable.app/pools?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouteProgress />
          <ScrollToTop />
          <CommandPalette />
          <PwaRegister />
          <div className="min-h-screen flex flex-col">
            <Header />
            <WrongNetworkBanner />
            <main className="flex-1">
              <Outlet />
            </main>
            <Footer />
          </div>
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
