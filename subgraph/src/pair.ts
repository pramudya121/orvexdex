import { BigDecimal, BigInt, Address, log } from "@graphprotocol/graph-ts";
import { Swap as SwapEvent, Sync, Mint, Burn } from "../generated/templates/Pair/Pair";
import { Pair, Token, Swap, PairDayData, Factory } from "../generated/schema";

// wzkLTC address on LitVM LiteForge — keep in sync with src/lib/chain.ts
const WZK = "0x3a153e8bcde02f4cf6c5eeecd9c83bc0296ffbd3";
const FACTORY_ID = "orvex";

function pow10(d: i32): BigDecimal {
  let bi = BigInt.fromI32(10).pow(d as u8);
  return bi.toBigDecimal();
}

function toDec(amount: BigInt, decimals: BigInt): BigDecimal {
  if (amount.equals(BigInt.zero())) return BigDecimal.zero();
  return amount.toBigDecimal().div(pow10(decimals.toI32()));
}

function priceInWZK(token: Token, pair: Pair): BigDecimal {
  if (token.id == WZK) return BigDecimal.fromString("1");
  if (pair.reserve0.equals(BigDecimal.zero()) || pair.reserve1.equals(BigDecimal.zero())) return token.derivedWZK;
  if (pair.token0 == WZK && pair.token1 == token.id) return pair.reserve0.div(pair.reserve1);
  if (pair.token1 == WZK && pair.token0 == token.id) return pair.reserve1.div(pair.reserve0);
  return token.derivedWZK;
}

export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address.toHexString());
  if (pair == null) return;
  let t0 = Token.load(pair.token0)!;
  let t1 = Token.load(pair.token1)!;
  pair.reserve0 = toDec(event.params.reserve0, t0.decimals);
  pair.reserve1 = toDec(event.params.reserve1, t1.decimals);

  // Update derived prices for non-WZK token if this pair contains WZK
  if (pair.token0 == WZK) t1.derivedWZK = priceInWZK(t1, pair);
  if (pair.token1 == WZK) t0.derivedWZK = priceInWZK(t0, pair);
  t0.save(); t1.save();

  // TVL: sum of both reserves valued in WZK
  let r0Wzk = pair.reserve0.times(t0.derivedWZK);
  let r1Wzk = pair.reserve1.times(t1.derivedWZK);
  pair.reserveWZK = r0Wzk.plus(r1Wzk);
  pair.save();
}

export function handleSwap(event: SwapEvent): void {
  let pair = Pair.load(event.address.toHexString());
  if (pair == null) return;
  let t0 = Token.load(pair.token0)!;
  let t1 = Token.load(pair.token1)!;

  let a0in = toDec(event.params.amount0In, t0.decimals);
  let a1in = toDec(event.params.amount1In, t1.decimals);
  let a0out = toDec(event.params.amount0Out, t0.decimals);
  let a1out = toDec(event.params.amount1Out, t1.decimals);

  // Volume in WZK = (input + output)/2 valued in WZK to avoid double counting
  let v0 = a0in.plus(a0out).times(t0.derivedWZK);
  let v1 = a1in.plus(a1out).times(t1.derivedWZK);
  let amountWZK = v0.plus(v1).div(BigDecimal.fromString("2"));

  pair.volumeWZK = pair.volumeWZK.plus(amountWZK);
  pair.txCount = pair.txCount.plus(BigInt.fromI32(1));
  pair.save();

  let factory = Factory.load(FACTORY_ID);
  if (factory != null) {
    factory.totalVolumeWZK = factory.totalVolumeWZK.plus(amountWZK);
    factory.save();
  }

  // Persist Swap entity
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let s = new Swap(id);
  s.pair = pair.id;
  s.sender = event.params.sender;
  s.to = event.params.to;
  s.amount0In = a0in;
  s.amount1In = a1in;
  s.amount0Out = a0out;
  s.amount1Out = a1out;
  s.amountWZK = amountWZK;
  s.timestamp = event.block.timestamp;
  s.block = event.block.number;
  s.txHash = event.transaction.hash;
  s.save();

  // Roll up into per-day bucket
  let dayId = (event.block.timestamp.toI32() / 86400) as i32;
  let dayStart = dayId * 86400;
  let pdId = pair.id + "-" + dayId.toString();
  let pd = PairDayData.load(pdId);
  if (pd == null) {
    pd = new PairDayData(pdId);
    pd.date = dayStart;
    pd.pair = pair.id;
    pd.dailyVolumeWZK = BigDecimal.zero();
    pd.dailyTxns = BigInt.zero();
  }
  pd.reserveWZK = pair.reserveWZK;
  pd.dailyVolumeWZK = pd.dailyVolumeWZK.plus(amountWZK);
  pd.dailyTxns = pd.dailyTxns.plus(BigInt.fromI32(1));
  pd.save();
}

export function handleMint(event: Mint): void {
  let pair = Pair.load(event.address.toHexString());
  if (pair == null) return;
  pair.txCount = pair.txCount.plus(BigInt.fromI32(1));
  pair.save();
}

export function handleBurn(event: Burn): void {
  let pair = Pair.load(event.address.toHexString());
  if (pair == null) return;
  pair.txCount = pair.txCount.plus(BigInt.fromI32(1));
  pair.save();
}
