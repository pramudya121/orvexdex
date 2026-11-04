import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { exchangeXCode } from "@/lib/xAuth.functions";
import { readPendingOAuth, readPendingWallet } from "@/lib/xAuthFlow";
import { Button } from "@/components/ui/button";
import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";

export const Route = createFileRoute("/auth/x/callback")({
  component: XCallbackPage,
  head: () => ({
    meta: [
      { title: "Connecting X — ORVEX" },
      { name: "description", content: "Finishing X account verification for ORVEX faucet claims." },
      { property: "og:title", content: "Connecting X — ORVEX" },
      {
        property: "og:description",
        content: "Finishing X account verification for ORVEX faucet claims.",
      },
    ],
  }),
});

function XCallbackPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<{ kind: "working" | "ok" | "error"; message: string }>({
    kind: "working",
    message: "Connecting your X account…",
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const urlState = params.get("state");
      const oauthError = params.get("error");
      const pending = readPendingOAuth();
      const wallet = readPendingWallet();

      if (oauthError) {
        setState({ kind: "error", message: `X declined the connection: ${oauthError}` });
        return;
      }
      if (!code || !pending || !wallet) {
        setState({ kind: "error", message: "Missing connection data. Please start the X connection again from the Faucet page." });
        return;
      }
      if (!urlState || urlState !== pending.state) {
        setState({ kind: "error", message: "Security check failed (state mismatch). Please try again." });
        return;
      }

      const res = await exchangeXCode({
        data: { code, verifier: pending.verifier, redirectUri: pending.redirectUri, wallet },
      });
      if (cancelled) return;
      if (!res.ok) {
        setState({ kind: "error", message: res.error ?? "X sign-in failed" });
        return;
      }
      setState({
        kind: "ok",
        message: res.followed
          ? `Connected as @${res.username} — you follow @ORVEX_LitVM. Faucet claims are unlocked.`
          : `Connected as @${res.username}. Now follow @ORVEX_LitVM on X, then press "Check follow" on the Faucet page.`,
      });
      setTimeout(() => {
        void navigate({ to: "/faucet" });
      }, 2500);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="glass-strong rounded-3xl p-8 md:p-12 max-w-lg w-full text-center animate-rise">
        {state.kind === "working" && (
          <LoaderCircle className="h-12 w-12 mx-auto text-primary animate-spin mb-4" aria-hidden="true" />
        )}
        {state.kind === "ok" && (
          <CheckCircle2 className="h-12 w-12 mx-auto text-accent mb-4" aria-hidden="true" />
        )}
        {state.kind === "error" && (
          <TriangleAlert className="h-12 w-12 mx-auto text-destructive mb-4" aria-hidden="true" />
        )}
        <h1 className="text-2xl font-bold mb-3">
          {state.kind === "ok" ? "X connected" : state.kind === "error" ? "Connection failed" : "One moment…"}
        </h1>
        <p className="text-muted-foreground">{state.message}</p>
        {state.kind === "error" && (
          <Button className="mt-6" onClick={() => void navigate({ to: "/faucet" })}>
            Back to Faucet
          </Button>
        )}
      </div>
    </div>
  );
}
