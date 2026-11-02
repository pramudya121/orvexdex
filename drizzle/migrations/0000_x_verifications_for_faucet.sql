CREATE TABLE public.x_verifications (
  wallet_address text PRIMARY KEY,
  x_user_id text,
  x_username text,
  x_name text,
  followed boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  x_access_token text,
  x_refresh_token text,
  token_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.x_verifications IS 'X (Twitter) verification for faucet claims: links a wallet to its X account, follow status of @ORVEX_LitVM, and server-only OAuth tokens. No anon/authenticated access by design — all reads/writes go through privileged server code.';

GRANT ALL ON public.x_verifications TO service_role;

ALTER TABLE public.x_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON public.x_verifications
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);