"""
Multi-DEX On-Chain Market Analysis (Uniswap V2 forks)
=====================================================

Instalasi library sebelum menjalankan:
    pip install web3==6.* python-dotenv

Cara pakai:
    1. Ubah RPC_URL sesuai chain yang kamu pakai (contoh: LitVM LiteForge).
    2. Ubah TOKEN_A / TOKEN_B ke pasangan yang mau dianalisis.
    3. Jalankan:  python scripts/dex_market_analysis.py
"""

from decimal import Decimal, getcontext
from web3 import Web3

getcontext().prec = 40  # presisi tinggi untuk hitung harga

# ---------------------------------------------------------------------------
# 1) KONFIGURASI JARINGAN
# ---------------------------------------------------------------------------
RPC_URL = "https://liteforge.rpc.caldera.xyz/http"  # ganti sesuai chain kamu

# ---------------------------------------------------------------------------
# 2) DAFTAR DEX (Nama -> Alamat Factory)
#    Tambah / hapus DEX di sini saja — kode di bawah tidak perlu diubah.
# ---------------------------------------------------------------------------
DEX_FACTORIES = {
    "OrvexSwap":   "0x42e4E19020aa23947e1BE3260b7e4CCFDd246128",
    "DrunkenCats": "0x7D0FFa854edaE7659A1989Be42Df4CCe218F4c8C",
    "GenericV2":   "0xe8aDcf45C359eB63aAf0e0a129463600151A0291",
}

# ---------------------------------------------------------------------------
# 3) TOKEN YANG MAU DIANALISIS
# ---------------------------------------------------------------------------
TOKEN_A = "0x3A153e8BcDe02F4Cf6C5eeECD9c83bC0296FFbD3"  # wzkLTC
TOKEN_B = "0x7216EAb89cDbb52D3D8A0e2F305F9Afb5cE122a3"  # ORVX

# ---------------------------------------------------------------------------
# 4) HUMAN-READABLE ABI (tanpa file JSON panjang)
# ---------------------------------------------------------------------------
FACTORY_ABI = [
    "function getPair(address tokenA, address tokenB) view returns (address)",
]

PAIR_ABI = [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
]

ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function symbol()  view returns (string)",
]

ZERO_ADDR = "0x0000000000000000000000000000000000000000"


# ---------------------------------------------------------------------------
# 5) HELPER
# ---------------------------------------------------------------------------
def get_token_meta(w3: Web3, token_addr: str):
    """Ambil symbol & decimals dari kontrak ERC20."""
    c = w3.eth.contract(address=Web3.to_checksum_address(token_addr), abi=ERC20_ABI)
    return c.functions.symbol().call(), c.functions.decimals().call()


def analyze_dex(w3: Web3, name: str, factory_addr: str, token_a: str, token_b: str):
    """Cari pool untuk (token_a, token_b) di 1 DEX lalu hitung harga."""
    print(f"\n=== {name} ===")
    print(f"Factory : {factory_addr}")

    # 5.1 Panggil getPair(tokenA, tokenB) di factory
    factory = w3.eth.contract(address=Web3.to_checksum_address(factory_addr), abi=FACTORY_ABI)
    pair_addr = factory.functions.getPair(
        Web3.to_checksum_address(token_a),
        Web3.to_checksum_address(token_b),
    ).call()

    # 5.2 Kalau pool tidak ada, address = 0x0
    if pair_addr == ZERO_ADDR:
        print("Pool    : TIDAK ADA di DEX ini")
        return

    print(f"Pool    : {pair_addr}")

    # 5.3 Baca reserves + urutan token
    pair = w3.eth.contract(address=Web3.to_checksum_address(pair_addr), abi=PAIR_ABI)
    reserve0, reserve1, _ = pair.functions.getReserves().call()
    token0 = pair.functions.token0().call()
    token1 = pair.functions.token1().call()

    sym0, dec0 = get_token_meta(w3, token0)
    sym1, dec1 = get_token_meta(w3, token1)

    # 5.4 Normalisasi ke satuan human readable
    r0 = Decimal(reserve0) / (Decimal(10) ** dec0)
    r1 = Decimal(reserve1) / (Decimal(10) ** dec1)

    print(f"Reserve : {r0:,.6f} {sym0}  |  {r1:,.6f} {sym1}")

    # 5.5 Harga = rasio reserves (AMM Uniswap V2)
    if r0 > 0 and r1 > 0:
        price_1_in_0 = r0 / r1  # 1 sym1 = ? sym0
        price_0_in_1 = r1 / r0  # 1 sym0 = ? sym1
        print(f"Harga   : 1 {sym1} = {price_1_in_0:,.8f} {sym0}")
        print(f"          1 {sym0} = {price_0_in_1:,.8f} {sym1}")
    else:
        print("Harga   : pool kosong (reserve = 0)")


# ---------------------------------------------------------------------------
# 6) MAIN
# ---------------------------------------------------------------------------
def main():
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        raise SystemExit(f"Gagal connect ke RPC {RPC_URL}")

    print(f"Terhubung ke chain id: {w3.eth.chain_id}")
    print(f"Menganalisis pasangan: {TOKEN_A}  <->  {TOKEN_B}")

    for name, factory in DEX_FACTORIES.items():
        try:
            analyze_dex(w3, name, factory, TOKEN_A, TOKEN_B)
        except Exception as e:
            print(f"\n=== {name} ===\nERROR: {e}")


if __name__ == "__main__":
    main()
