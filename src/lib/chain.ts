import type { Chain } from "viem";

export const litvm = {
  id: 4441,
  name: "LitVM LiteForge",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://liteforge.rpc.caldera.xyz/http"] },
    public: { http: ["https://liteforge.rpc.caldera.xyz/http"] },
  },
  blockExplorers: {
    default: { name: "LitVM Explorer", url: "https://liteforge.explorer.caldera.xyz" },
  },
  testnet: true,
} as const satisfies Chain;

export const ADDR = {
  factory: "0x42e4E19020aa23947e1BE3260b7e4CCFDd246128",
  router: "0x03D2D542100fa926de135a08B609c8538E45F6ee",
  library: "0x998AEFD25622eCB6D6Fb8eBE87B01dC930d712a0",
  multicall: "0x25E7345084F79efC1b296d0c4a1B664191544bC4",
  wzkLTC: "0x3A153e8BcDe02F4Cf6C5eeECD9c83bC0296FFbD3",
  faucet: "0x1C9FAFD0A5803d51EB2BEb9D54304cAe574734CF",
  TRX: "0x8705875084c72C0cDC01c1Ac36A807808c8E5850",
  XRP: "0xA860Fc63d7C3d5cAf5295dE72AEeb4260D7819D4",
  ADA: "0x7b277d0387ccDFC395Eae0EFe2321765afAb37c8",
  ZEC: "0x0177E73214265D1d6f29a273155803Af5Bf47cFa",
  XMR: "0x05466944d61662225ad19916725975230bb5b2B7",
  ORVX: "0x7216EAb89cDbb52D3D8A0e2F305F9Afb5cE122a3",
  farm: "0x4bfE047FF04D960999f51AeC644200c20Ad55AbB",
  domainController: "0xA62Ef6bD41b131Be85f4B87C895aee5BF87cE981",
  domainRegistrar: "0x14eBDFe5b92E1e4ddC0059627b729DcB2E361594",
  domainResolver: "0x6BaBa44Fa03E79f1C849372079a33F8182D5bddA",
  domainRegistry: "0xc7291D28450c1c3f25F5DfB1Bc1058fde35A9524",
  aiGuardrail: "0x2F2428bBa5a0172eb09f860535549c77D0Bb73C1",
  aiExecutionController: "0x163ee8a51a9Cd0D24A10D7bD336E5f94845fE8AA",
  multiTokenVault: "0x10A15b2cd5a2C664C4554636b45E7c297B21d5Db",
  aiTradingAgent: "0x6A14dB4B430F28741Cef47E7AAabe0e9c6409e39",
} as const;

export const DOMAIN_TLD = "orvex";

// Multi-DEX registry — all Uniswap V2 forks on LitVM.
// Add new DEXes here to surface them across analytics, aggregator, and routing.
export type DexConfig = {
  id: string;
  name: string;
  factory: `0x${string}`;
  router?: `0x${string}`;
  color: string; // tailwind-friendly hex
};

export const DEXES: readonly DexConfig[] = [
  {
    id: "orvex",
    name: "OrvexSwap",
    factory: "0x42e4E19020aa23947e1BE3260b7e4CCFDd246128",
    router: "0x03D2D542100fa926de135a08B609c8538E45F6ee",
    color: "#c084fc",
  },
  {
    id: "drunkencats",
    name: "DrunkenCats",
    factory: "0x7D0FFa85a986CDCDD8f56dF7d1EF6ffb2A164c8C",
    router: "0xb0e39b72824fA03b2CbD4486ddDc3630D680eA1b",
    color: "#f59e0b",
  },
] as const;

export const findDex = (factory: string) =>
  DEXES.find((d) => d.factory.toLowerCase() === factory.toLowerCase());

export const explorerTx = (hash: string) =>
  `${litvm.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddr = (a: string) =>
  `${litvm.blockExplorers.default.url}/address/${a}`;
