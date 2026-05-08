import { ADDR } from "./chain";

export type Token = {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  logo: string;
  isNative?: boolean;
  isWrapped?: boolean;
  faucetIndex?: number;
};

// Litecoin logo for zkLTC + wzkLTC
const LTC_LOGO = "https://s2.coinmarketcap.com/static/img/coins/64x64/2.png";

export const NATIVE: Token = {
  address: "0x0000000000000000000000000000000000000000",
  symbol: "zkLTC",
  name: "LitVM zkLTC",
  decimals: 18,
  logo: LTC_LOGO,
  isNative: true,
};

export const WZKLTC: Token = {
  address: ADDR.wzkLTC,
  symbol: "wzkLTC",
  name: "Wrapped zkLTC",
  decimals: 18,
  logo: LTC_LOGO,
  isWrapped: true,
};

// faucetIndex aligns with Faucet.tokens(uint8) ordering.
// Order assumed: 0=wzkLTC, 1=TRX, 2=XRP, 3=ADA, 4=ZEC, 5=XMR, 6=ORVX
export const TOKENS: Token[] = [
  NATIVE,
  WZKLTC,
  { address: ADDR.TRX, symbol: "TRX", name: "TRON", decimals: 18, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/1958.png", faucetIndex: 1 },
  { address: ADDR.XRP, symbol: "XRP", name: "XRP", decimals: 18, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/52.png", faucetIndex: 2 },
  { address: ADDR.ADA, symbol: "ADA", name: "Cardano", decimals: 18, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/2010.png", faucetIndex: 3 },
  { address: ADDR.ZEC, symbol: "ZEC", name: "Zcash", decimals: 18, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/1437.png", faucetIndex: 4 },
  { address: ADDR.XMR, symbol: "XMR", name: "Monero", decimals: 18, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/328.png", faucetIndex: 5 },
  { address: ADDR.ORVX, symbol: "ORVX", name: "Orvex", decimals: 18, logo: LTC_LOGO, faucetIndex: 6 },
];

// Faucet token list (matches contract index ordering)
export const FAUCET_TOKENS: Token[] = [
  { ...WZKLTC, faucetIndex: 0 },
  ...TOKENS.filter((t) => t.faucetIndex !== undefined && t.faucetIndex !== 0),
].sort((a, b) => (a.faucetIndex ?? 0) - (b.faucetIndex ?? 0));

export const findToken = (addr: string) =>
  TOKENS.find((t) => t.address.toLowerCase() === addr.toLowerCase());
