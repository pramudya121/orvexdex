import { useCallback, useEffect, useState } from "react";
import { exchangeXCode, getXClientId, getXVerification } from "./xAuth.functions";

const OAUTH_KEY = "orvex-x-oauth";
const WALLET_KEY = "orvex-x-pending-wallet";

export type XStatus = {
  loading: boolean;
  connected: boolean;
  username: string | null;
  name: string | null;
  followed: boolean;
  error: string | null;
};

function base64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type WalletProof = { message: string; signature: string };

type XConnectContext = { redirectUri: string; state: string };

export function createWalletProofMessage(
  wallet: string,
  action: "connect-x" | "check-x-follow",
  context?: XConnectContext,
) {
  if ((action === "connect-x") !== Boolean(context)) {
    throw new Error("OAuth connection proofs require a redirect URI and state.");
  }

  return [
    "ORVEX DEX wallet authorization",
    `Action: ${action}`,
    `Wallet: ${wallet.toLowerCase()}`,
    ...(context ? [`Redirect URI: ${context.redirectUri}`, `OAuth State: ${context.state}`] : []),
    `Issued At: ${Date.now()}`,
    `Nonce: ${crypto.randomUUID()}`,
  ].join("\n");
}

/**
 * Kick off the X OAuth 2.0 (PKCE) authorize redirect for `wallet`.
 * Stores the PKCE verifier, state, and context-bound wallet signature for the callback page.
 */
export async function startXConnect(
  wallet: string,
  signMessage: (message: string) => Promise<string>,
): Promise<{ ok: boolean; error?: string }> {
  const { clientId } = await getXClientId();
  if (!clientId)
    return { ok: false, error: "X verification is not configured yet. The owner must add the X Client ID and Client Secret in project settings." };
  if (typeof window === "undefined") return { ok: false, error: "Browser only" };

  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  );
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = `${window.location.origin}/auth/x/callback`;
  const message = createWalletProofMessage(wallet, "connect-x", { redirectUri, state });
  const proof = { message, signature: await signMessage(message) };

  sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ state, verifier, redirectUri, proof }));
  localStorage.setItem(WALLET_KEY, wallet);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "users.read follows.read offline.access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  window.location.href = `https://x.com/i/oauth2/authorize?${params.toString()}`;
  return { ok: true };
}

export function readPendingOAuth(): {
  state: string;
  verifier: string;
  redirectUri: string;
  proof: WalletProof;
} | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_KEY);
    sessionStorage.removeItem(OAUTH_KEY);
    if (!raw) return null;

    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const pending = value as Record<string, unknown>;
    const proof = pending.proof;
    if (!proof || typeof proof !== "object") return null;
    const walletProof = proof as Record<string, unknown>;
    if (
      typeof pending.state !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(pending.state) ||
      typeof pending.verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(pending.verifier) ||
      typeof pending.redirectUri !== "string" ||
      typeof walletProof.message !== "string" || walletProof.message.length > 512 ||
      typeof walletProof.signature !== "string" || !/^0x[a-fA-F0-9]{130}$/.test(walletProof.signature) ||
      !walletProof.message.includes(`Redirect URI: ${pending.redirectUri}\nOAuth State: ${pending.state}`)
    ) {
      return null;
    }

    const redirect = new URL(pending.redirectUri);
    if (redirect.pathname !== "/auth/x/callback" || redirect.search || redirect.hash) return null;

    return {
      state: pending.state,
      verifier: pending.verifier,
      redirectUri: pending.redirectUri,
      proof: { message: walletProof.message, signature: walletProof.signature },
    };
  } catch {
    return null;
  }
}

export function readPendingWallet(): string | null {
  try {
    const wallet = localStorage.getItem(WALLET_KEY);
    return wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet) ? wallet : null;
  } catch {
    return null;
  }
}

/** Live X verification status for the connected wallet. */
export function useXVerification(wallet?: string) {
  const [status, setStatus] = useState<XStatus>({
    loading: true,
    connected: false,
    username: null,
    name: null,
    followed: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!wallet) {
      setStatus({ loading: false, connected: false, username: null, name: null, followed: false, error: null });
      return;
    }
    setStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await getXVerification({ data: { wallet } });
      setStatus({
        loading: false,
        connected: res.connected,
        username: res.username,
        name: res.name,
        followed: res.followed,
        error: null,
      });
    } catch {
      setStatus((s) => ({ ...s, loading: false, error: "Could not load X verification status" }));
    }
  }, [wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...status, refresh };
}
