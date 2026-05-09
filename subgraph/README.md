# ORVEX Subgraph (LitVM LiteForge)

Indexes ORVEX Factory + Pair contracts on **LitVM LiteForge Testnet** (chainId `4441`,
RPC `https://liteforge.rpc.caldera.xyz/http`) and exposes per-pool **TVL** and
**24h volume** via GraphQL.

## Why self-hosted?

The Graph Studio / Hosted Service does not yet ship LitVM LiteForge in their
supported network registry. To deploy you must run your own `graph-node`
pointed at the LitVM RPC. Once it indexes you can query it from the frontend
exactly like any other subgraph.

## 1. Spin up graph-node + IPFS + Postgres

```yaml
# docker-compose.yml
version: "3"
services:
  graph-node:
    image: graphprotocol/graph-node:latest
    ports: ["8000:8000","8001:8001","8020:8020","8030:8030"]
    depends_on: [ipfs, postgres]
    environment:
      postgres_host: postgres
      postgres_user: graph
      postgres_pass: graph
      postgres_db: graph
      ipfs: "ipfs:5001"
      ethereum: "litvm-liteforge:https://liteforge.rpc.caldera.xyz/http"
      GRAPH_LOG: info
  ipfs:
    image: ipfs/kubo:latest
    ports: ["5001:5001"]
  postgres:
    image: postgres:14
    environment:
      POSTGRES_USER: graph
      POSTGRES_PASSWORD: graph
      POSTGRES_DB: graph
```

`docker compose up -d`

## 2. Build & deploy the subgraph

```bash
cd subgraph
npm install
npm run codegen
npm run build
npm run create-local
npm run deploy-local
```

Query endpoint will be:
```
http://localhost:8000/subgraphs/name/orvex/orvex
```

## 3. Wire the frontend

Set `VITE_ORVEX_SUBGRAPH_URL` in your environment, e.g.

```
VITE_ORVEX_SUBGRAPH_URL=http://localhost:8000/subgraphs/name/orvex/orvex
```

Sample query for the Pools page:

```graphql
{
  pairs(orderBy: reserveWZK, orderDirection: desc, first: 50) {
    id
    token0 { id symbol decimals }
    token1 { id symbol decimals }
    reserve0 reserve1 totalSupply
    reserveWZK volumeWZK txCount
  }
}
```

And for 24h volume per pool:

```graphql
{
  pairDayDatas(where: { date_gte: <now - 86400> }, first: 1000) {
    pair { id }
    dailyVolumeWZK
    dailyTxns
  }
}
```

The frontend currently falls back to **on-chain `getLogs` indexing** in
`src/lib/poolStats.ts` whenever `VITE_ORVEX_SUBGRAPH_URL` is unset, so the UI
keeps working without a subgraph deployment.

## 4. Update contract addresses

If you redeploy the Factory, edit `subgraph.yaml` → `dataSources[0].source.address`
and the `WZK` constant in `src/pair.ts`, then re-deploy.
