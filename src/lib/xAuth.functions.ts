import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const ORVEX_X_HANDLE = "ORVEX_LitVM";
export const ORVEX_X_URL = "https://x.com/ORVEX_LitVM";

const X_API = "https://api.x.com/2";

const walletSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address");

type XUser = { id: string; username?: string; name?: string };

function redirectAllowed(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.pathname !== "/auth/x/callback") return false;
    const host = u.hostname;
    if (u.protocol === "https:" && host.endsWith(".lovable.app")) return true;
    if (u.protocol === "http:" && (host === "localhost" || host === "127.0.0.1")) return true;
    return false;
  } catch {
    return false;
  }
}

async function xGet(token: string, path: string): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${X_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

function errText(status: number, body: unknown): string {
  const detail =
    (body as { detail?: string; title?: string; errors?: { message?: string }[] }) ?? {};
  const parts = [detail.detail, detail.title, detail.errors?.[0]?.message].filter(Boolean);
  return `X API error [${status}]${parts.length ? `: ${parts.join(" — ")}` : ""}`.slice(0, 300);
}

/** Check whether `meId` follows `targetId` by paging the following list. */
async function userFollows(token: string, meId: string, targetId: string): Promise<boolean> {
  let nextToken: string | undefined;
  for (let page = 0; page < 6; page++) {
    const qs = new URLSearchParams({ max_results: "1000" });
    if (nextToken) qs.set("pagination_token", nextToken);
    const r = await xGet(token, `/users/${meId}/following?${qs.toString()}`);
    if (!r.ok) throw new Error(errText(r.status, r.body));
    const users = (r.body.data as XUser[] | undefined) ?? [];
    if (users.some((u) => u.id === targetId)) return true;
    const meta = r.body.meta as { next_token?: string } | undefined;
    nextToken = meta?.next_token;
    if (!nextToken) return false;
  }
  return false;
}

async function getVerifiedRow(wallet: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("x_verifications")
    .select("wallet_address, x_user_id, x_username, x_name, followed, verified_at, x_access_token, x_refresh_token, token_expires_at")
    .eq("wallet_address", wallet.toLowerCase())
    .maybeSingle();
  return { row: data, supabaseAdmin };
}

/** Public client ID so the browser can build the X authorize URL. */
export const getXClientId = createServerFn({ method: "GET" }).handler(async () => {
  const clientId = process.env["X_CLIENT_ID"];
  if (!clientId) return { clientId: null as string | null };
  return { clientId };
});

export const exchangeXCode = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        code: z.string().min(1).max(512),
        verifier: z.string().min(16).max(256),
        redirectUri: z.string().url(),
        wallet: walletSchema,
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const clientId = process.env["X_CLIENT_ID"];
    const clientSecret = process.env["X_CLIENT_SECRET"];
    if (!clientId || !clientSecret)
      return {
        ok: false,
        error: "X verification is not configured yet. The owner must add X_CLIENT_ID and X_CLIENT_SECRET in project settings.",
      };
    if (!redirectAllowed(data.redirectUri)) return { ok: false, error: "Invalid redirect address" };

    const tokenRes = await fetch(`${X_API}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: data.code,
        redirect_uri: data.redirectUri,
        client_id: clientId,
        code_verifier: data.verifier,
      }),
    });
    const tokenBody = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!tokenRes.ok || !tokenBody.access_token)
      return { ok: false, error: `X sign-in failed [${tokenRes.status}]. Check that the callback URL is registered in the X Developer Portal.` };

    const token = tokenBody.access_token;
    const me = await xGet(token, "/users/me?user.fields=profile_image_url");
    if (!me.ok) return { ok: false, error: errText(me.status, me.body) };
    const meUser = me.body.data as XUser | undefined;
    if (!meUser?.id) return { ok: false, error: "Could not read your X account" };

    const target = await xGet(token, `/users/by/username/${ORVEX_X_HANDLE}`);
    if (!target.ok) return { ok: false, error: errText(target.status, target.body) };
    const targetUser = target.body.data as XUser | undefined;

    let followed = false;
    if (targetUser?.id) {
      try {
        followed = await userFollows(token, meUser.id, targetUser.id);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Follow check failed" };
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const expiresAt = tokenBody.expires_in
      ? new Date(Date.now() + (tokenBody.expires_in - 60) * 1000).toISOString()
      : null;
    await supabaseAdmin.from("x_verifications").upsert(
      {
        wallet_address: data.wallet.toLowerCase(),
        x_user_id: meUser.id,
        x_username: meUser.username ?? null,
        x_name: meUser.name ?? null,
        followed,
        verified_at: followed ? now : null,
        x_access_token: token,
        x_refresh_token: tokenBody.refresh_token ?? null,
        token_expires_at: expiresAt,
        updated_at: now,
      },
      { onConflict: "wallet_address" }
    );

    return { ok: true, username: meUser.username ?? null, name: meUser.name ?? null, followed };
  });

export const recheckXFollow = createServerFn({ method: "POST" })
  .validator((input) => z.object({ wallet: walletSchema }).parse(input))
  .handler(async ({ data }) => {
    const { row, supabaseAdmin } = await getVerifiedRow(data.wallet);
    if (!row?.x_access_token)
      return { ok: false, error: "Connect your X account first", followed: false };

    let token: string = row.x_access_token;
    const expiresSoon =
      row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now() + 60_000;
    if (expiresSoon) {
      if (!row.x_refresh_token)
        return { ok: false, error: "X session expired — reconnect your account", followed: false };
      const clientId = process.env["X_CLIENT_ID"];
      const clientSecret = process.env["X_CLIENT_SECRET"];
      if (!clientId || !clientSecret)
        return { ok: false, error: "X verification is not configured yet", followed: false };
      const res = await fetch(`${X_API}/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: row.x_refresh_token,
          client_id: clientId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!res.ok || !body.access_token)
        return { ok: false, error: "X session expired — reconnect your account", followed: false };
      token = body.access_token;
      await supabaseAdmin
        .from("x_verifications")
        .update({
          x_access_token: token,
          x_refresh_token: body.refresh_token ?? row.x_refresh_token,
          token_expires_at: body.expires_in
            ? new Date(Date.now() + (body.expires_in - 60) * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("wallet_address", data.wallet.toLowerCase());
    }

    const me = await xGet(token, `/users/${row.x_user_id}`);
    if (!me.ok) return { ok: false, error: errText(me.status, me.body), followed: false };
    const meUser = me.body.data as XUser | undefined;

    const target = await xGet(token, `/users/by/username/${ORVEX_X_HANDLE}`);
    if (!target.ok) return { ok: false, error: errText(target.status, target.body), followed: false };
    const targetUser = target.body.data as XUser | undefined;

    let followed = false;
    if (row.x_user_id && targetUser?.id) {
      try {
        followed = await userFollows(token, row.x_user_id, targetUser.id);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Follow check failed", followed: false };
      }
    }

    await supabaseAdmin
      .from("x_verifications")
      .update({
        followed,
        verified_at: followed ? new Date().toISOString() : null,
        x_username: meUser?.username ?? row.x_username,
        updated_at: new Date().toISOString(),
      })
      .eq("wallet_address", data.wallet.toLowerCase());

    return { ok: true, username: meUser?.username ?? row.x_username, followed };
  });

/** Verification status for a wallet — never returns tokens. */
export const getXVerification = createServerFn({ method: "GET" })
  .validator((input) => z.object({ wallet: walletSchema }).parse(input))
  .handler(async ({ data }) => {
    const { row } = await getVerifiedRow(data.wallet);
    if (!row) return { connected: false, username: null, name: null, followed: false, verifiedAt: null };
    return {
      connected: true,
      username: row.x_username,
      name: row.x_name,
      followed: !!row.followed,
      verifiedAt: row.verified_at,
    };
  });
