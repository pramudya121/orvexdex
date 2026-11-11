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

export function createWalletProofMessage(wallet: string, action: "connect-x" | "check-x-follow") {
  return [
    "ORVEX DEX wallet authorization",
    `Action: ${action}`,
    `Wallet: ${wallet.toLowerCase()}`,
    `Issued At: ${Date.now()}`,
    `Nonce: ${crypto.randomUUID()}`,
  ].join("\n");
}

/**
 * Kick off the X OAuth 2.0 (PKCE) authorize redirect for `wallet`.
 * Stores the PKCE verifier, state, and wallet signature for the callback page.
 */
export async function startXConnect(wallet: string, proof: WalletProof): Promise<{ ok: boolean; error?: string }> {
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
    return raw
      ? (JSON.parse(raw) as {
          state: string;
          verifier: string;
          redirectUri: string;
          proof: WalletProof;
        })
      : null;
  } catch {
    return null;
  }
}

export function readPendingWallet(): string | null {
  const w = localStorage.getItem(WALLET_KEY);
  return w && /^0x[a-fA-F0-9]{40}$/.test(w) ? w : null;
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
