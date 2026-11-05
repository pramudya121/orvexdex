create table public.tokens (
  address text primary key,
  symbol text not null default '',
  name text not null default '',
  decimals integer not null default 18,
  logo_url text,
  category text not null default 'DeFi',
  first_seen_block bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pools (
  address text primary key,
  token0 text not null,
  token1 text not null,
  reserve0 numeric not null default 0,
  reserve1 numeric not null default 0,
  factory text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.swaps_history (
  id bigint generated always as identity primary key,
  pool text not null,
  tx_hash text not null,
  log_index integer not null,
  block_number bigint not null,
  block_time timestamptz not null,
  amount0 numeric not null,
  amount1 numeric not null,
  sender text,
  recipient text,
  unique (tx_hash, log_index)
);
create index swaps_pool_block_idx on public.swaps_history (pool, block_number desc);
create index swaps_time_brin on public.swaps_history using brin (block_time);

create table public.token_stats (
  token text primary key,
  price numeric,
  price_change_24h numeric,
  open_24h numeric,
  high_24h numeric,
  low_24h numeric,
  volume_24h numeric,
  liquidity numeric,
  pool_count integer,
  trades_24h integer,
  canonical_pool text,
  sparkline jsonb,
  zklbtc_usd numeric,
  updated_at timestamptz not null default now()
);

create table public.indexer_state (
  id text primary key default 'default',
  last_block bigint not null default 0,
  lease_until timestamptz,
  zklbtc_usd numeric,
  updated_at timestamptz not null default now()
);

insert into public.indexer_state (id, last_block) values ('default', 0) on conflict (id) do nothing;

grant select on public.tokens, public.pools, public.swaps_history, public.token_stats, public.indexer_state to anon, authenticated;
grant all on public.tokens, public.pools, public.swaps_history, public.token_stats, public.indexer_state to service_role;

alter table public.tokens enable row level security;
alter table public.pools enable row level security;
alter table public.swaps_history enable row level security;
alter table public.token_stats enable row level security;
alter table public.indexer_state enable row level security;

create policy "Public read tokens" on public.tokens for select to anon, authenticated using (true);
create policy "Public read pools" on public.pools for select to anon, authenticated using (true);
create policy "Public read swaps" on public.swaps_history for select to anon, authenticated using (true);
create policy "Public read token stats" on public.token_stats for select to anon, authenticated using (true);
create policy "Public read indexer state" on public.indexer_state for select to anon, authenticated using (true);

alter publication supabase_realtime add table public.swaps_history;
alter publication supabase_realtime add table public.token_stats;
alter publication supabase_realtime add table public.pools;

create or replace function public.refresh_token_stats(p_zklbtc_usd numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w text := '0x3a153e8bcde02f4cf6c5eeecd9c83bc0296ffbd3';
  usd numeric;
begin
  usd := coalesce(p_zklbtc_usd, (select zklbtc_usd from public.indexer_state where id = 'default'), 90);

  create temp table tmp_px on commit drop as
    select t, px from (
      select case when p.token0 = w then p.token1 else p.token0 end as t,
             case when p.token0 = w
                  then p.reserve1 / nullif(p.reserve0, 0)
                  else p.reserve0 / nullif(p.reserve1, 0) end as px,
             row_number() over (
               partition by case when p.token0 = w then p.token1 else p.token0 end
               order by case when p.token0 = w then p.reserve0 else p.reserve1 end desc
             ) as rn
      from public.pools p
      where (p.token0 = w or p.token1 = w) and p.reserve0 > 0 and p.reserve1 > 0
    ) x
    where rn = 1 and px is not null;

  create temp table tmp_canon on commit drop as
    select t, pool, wzk_is0 from (
      select case when p.token0 = w then p.token1 else p.token0 end as t,
             p.address as pool,
             (p.token0 = w) as wzk_is0,
             row_number() over (
               partition by case when p.token0 = w then p.token1 else p.token0 end
               order by case when p.token0 = w then p.reserve0 else p.reserve1 end desc
             ) as rn
      from public.pools p
      where (p.token0 = w or p.token1 = w) and p.reserve0 > 0 and p.reserve1 > 0
    ) y
    where rn = 1;

  create temp table tmp_px24 on commit drop as
    select c.token as token, s.block_number, s.log_index, s.block_time,
           case when c.wzk_is0 then s.amount0 / nullif(s.amount1, 0)
                else s.amount1 / nullif(s.amount0, 0) end as price
    from (
      select pool, block_number, log_index, block_time,
             amount0in + amount0out as amount0,
             amount1in + amount1out as amount1
      from public.swaps_history
      where block_time > now() - interval '24 hours'
    ) s
    join tmp_canon c on c.pool = s.pool;

  create temp table tmp_ohlc on commit drop as
    select token,
           (array_agg(price order by block_number asc, log_index asc))[1] as open_24h,
           max(price) as high_24h,
           min(price) as low_24h,
           (array_agg(price order by block_number desc, log_index desc))[1] as close_24h,
           count(*)::int as trades_24h
    from tmp_px24
    where price is not null
    group by token;

  create temp table tmp_spark on commit drop as
    select token, json_agg(price order by hr) as sparkline
    from (
      select distinct on (token, hr) token, hr, price
      from (
        select token, price, floor(extract(epoch from block_time) / 3600) as hr
        from tmp_px24
        where price is not null
      ) q
      order by token, hr, block_number desc, log_index desc
    ) d
    group by token;

  create temp table tmp_vol on commit drop as
    select tok, sum(val) as vol from (
      select p.token0 as tok, (s.amount0in + s.amount0out) * coalesce(px0.px, 0) as val
      from public.swaps_history s
      join public.pools p on p.address = s.pool
      left join tmp_px px0 on px0.token = p.token0
      where s.block_time > now() - interval '24 hours'
      union all
      select p.token1 as tok, (s.amount1in + s.amount1out) * coalesce(px1.px, 0) as val
      from public.swaps_history s
      join public.pools p on p.address = s.pool
      left join tmp_px px1 on px1.token = p.token1
      where s.block_time > now() - interval '24 hours'
    ) v
    group by tok;

  create temp table tmp_liq on commit drop as
    select case when p.token0 = w then p.token1 else p.token0 end as t,
           sum((case when p.token0 = w then p.reserve0 else p.reserve1 end) * 2) as liq
    from public.pools p
    where (p.token0 = w or p.token1 = w) and p.reserve0 > 0 and p.reserve1 > 0
    group by 1;

  create temp table tmp_pc on commit drop as
    select tok, count(*)::int as cnt from (
      select token0 as tok, address from public.pools
      union all
      select token1, address from public.pools
    ) pc
    group by tok;

  delete from public.token_stats where token <> '';

  insert into public.token_stats
    (token, price, price_change_24h, open_24h, high_24h, low_24h, volume_24h, liquidity, pool_count, trades_24h, canonical_pool, sparkline, zklbtc_usd, updated_at)
  select
    px.t,
    px.px * usd,
    case when o.open_24h > 0 then (o.close_24h - o.open_24h) / o.open_24h end,
    o.open_24h * usd, o.high_24h * usd, o.low_24h * usd,
    coalesce(v.vol, 0) * usd,
    coalesce(l.liq, 0) * usd,
    coalesce(pc.cnt, 0),
    coalesce(o.trades_24h, 0),
    c.pool,
    sp.sparkline,
    usd,
    now()
  from tmp_px px
  left join tmp_ohlc o on o.token = px.t
  left join tmp_vol v on v.tok = px.t
  left join tmp_liq l on l.t = px.t
  left join tmp_pc pc on pc.tok = px.t
  left join tmp_canon c on c.t = px.t
  left join tmp_spark sp on sp.token = px.t;
end;
$$;

create or replace function public.token_candles(p_token text, p_interval text)
returns table (candle_time timestamptz, open numeric, high numeric, low numeric, close numeric, volume numeric, trades bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w text := '0x3a153e8bcde02f4cf6c5eeecd9c83bc0296ffbd3';
  secs bigint;
begin
  secs := case p_interval
    when '1m' then 60 when '5m' then 300 when '15m' then 900
    when '1h' then 3600 when '4h' then 14400 when '1d' then 86400
    else 3600 end;

  return query
  with canon as (
    select case when p.token0 = w then p.token1 else p.token0 end as t,
           p.address as pool,
           (p.token0 = w) as wzk_is0
    from public.pools p
    where (p.token0 = w or p.token1 = w) and p.reserve0 > 0 and p.reserve1 > 0
      and case when p.token0 = w then p.token1 else p.token0 end = lower(p_token)
    order by case when p.token0 = w then p.reserve0 else p.reserve1 end desc
    limit 1
  ),
  sw as (
    select s.block_time, s.log_index,
           (case when canon.wzk_is0 then s.amount0in + s.amount0out else s.amount1in + s.amount1out end) as wzk_amt,
           (case when canon.wzk_is0 then s.amount1in + s.amount1out else s.amount0in + s.amount0out end) as tok_amt
    from public.swaps_history s
    join canon on canon.pool = s.pool
    where (case when canon.wzk_is0 then s.amount1in + s.amount1out else s.amount0in + s.amount0out end) > 0
  ),
  px as (
    select to_timestamp(floor(extract(epoch from block_time) / secs) * secs) as bucket,
           wzk_amt / tok_amt as price,
           wzk_amt as wzk_vol,
           block_time, log_index
    from sw
  )
  select
    bucket,
    (array_agg(price order by block_time asc, log_index asc))[1],
    max(price),
    min(price),
    (array_agg(price order by block_time desc, log_index desc))[1],
    sum(wzk_vol) * coalesce((select zklbtc_usd from public.indexer_state where id = 'default'), 90),
    count(*)
  from px
  group by bucket
  order by bucket desc
  limit 2000;
end;
$$;

create or replace function public.token_trades(p_token text, p_limit integer default 50)
returns table (tx_hash text, trade_time timestamptz, side text, price numeric, amount numeric, total numeric, maker text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w text := '0x3a153e8bcde02f4cf6c5eeecd9c83bc0296ffbd3';
begin
  return query
  with canon as (
    select case when p.token0 = w then p.token1 else p.token0 end as t,
           p.address as pool,
           (p.token0 = w) as wzk_is0
    from public.pools p
    where (p.token0 = w or p.token1 = w) and p.reserve0 > 0 and p.reserve1 > 0
      and case when p.token0 = w then p.token1 else p.token0 end = lower(p_token)
    order by case when p.token0 = w then p.reserve0 else p.reserve1 end desc
    limit 1
  )
  select
    s.tx_hash,
    s.block_time,
    case when canon.wzk_is0 then case when s.amount0in > 0 then 'buy' else 'sell' end
         else case when s.amount1in > 0 then 'buy' else 'sell' end end as side,
    (case when canon.wzk_is0 then s.amount0in + s.amount0out else s.amount1in + s.amount1out end)
      / nullif(case when canon.wzk_is0 then s.amount1in + s.amount1out else s.amount0in + s.amount0out end, 0)
      * coalesce((select zklbtc_usd from public.indexer_state where id = 'default'), 90),
    (case when canon.wzk_is0 then s.amount1in + s.amount1out else s.amount0in + s.amount0out end),
    (case when canon.wzk_is0 then s.amount0in + s.amount0out else s.amount1in + s.amount1out end)
      * coalesce((select zklbtc_usd from public.indexer_state where id = 'default'), 90),
    coalesce(s.recipient, s.sender)
  from public.swaps_history s
  join canon on canon.pool = s.pool
  order by s.block_time desc, s.log_index desc
  limit greatest(least(coalesce(p_limit, 50), 200), 1);
end;
$$;

grant execute on function public.refresh_token_stats(numeric) to service_role;
grant execute on function public.token_candles(text, text) to anon, authenticated, service_role;
grant execute on function public.token_trades(text, integer) to anon, authenticated, service_role;