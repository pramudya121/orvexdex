import { PairCreated } from "../generated/Factory/Factory";
import { Pair as PairTemplate } from "../generated/templates";
import { Factory, Pair, Token } from "../generated/schema";
import { ERC20 } from "../generated/Factory/ERC20";
import { BigDecimal, BigInt, Address } from "@graphprotocol/graph-ts";

const FACTORY_ID = "orvex";

function loadOrCreateToken(addr: Address): Token {
  let token = Token.load(addr.toHexString());
  if (token == null) {
    token = new Token(addr.toHexString());
    let c = ERC20.bind(addr);
    let sym = c.try_symbol();
    let nm = c.try_name();
    let dec = c.try_decimals();
    token.symbol = sym.reverted ? "?" : sym.value;
    token.name = nm.reverted ? "?" : nm.value;
    token.decimals = dec.reverted ? BigInt.fromI32(18) : BigInt.fromI32(dec.value);
    token.derivedWZK = BigDecimal.zero();
    token.totalLiquidity = BigDecimal.zero();
    token.save();
  }
  return token as Token;
}

export function handlePairCreated(event: PairCreated): void {
  let factory = Factory.load(FACTORY_ID);
  if (factory == null) {
    factory = new Factory(FACTORY_ID);
    factory.pairCount = 0;
    factory.totalVolumeWZK = BigDecimal.zero();
    factory.totalLiquidityWZK = BigDecimal.zero();
  }
  factory.pairCount = factory.pairCount + 1;
  factory.save();

  let t0 = loadOrCreateToken(event.params.token0);
  let t1 = loadOrCreateToken(event.params.token1);

  let pair = new Pair(event.params.pair.toHexString());
  pair.token0 = t0.id;
  pair.token1 = t1.id;
  pair.reserve0 = BigDecimal.zero();
  pair.reserve1 = BigDecimal.zero();
  pair.totalSupply = BigDecimal.zero();
  pair.reserveWZK = BigDecimal.zero();
  pair.volumeWZK = BigDecimal.zero();
  pair.txCount = BigInt.zero();
  pair.createdAtBlock = event.block.number;
  pair.createdAtTimestamp = event.block.timestamp;
  pair.save();

  PairTemplate.create(event.params.pair);
}
