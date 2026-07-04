// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AggregatorRouter
 * @notice Router agregator sederhana yang bisa mengeksekusi swap ke banyak
 *         router DEX (Uniswap V2 fork). Admin bebas menambah / menghapus /
 *         memperbarui daftar router. Frontend cukup mengirim `routerId`.
 *
 *         Keamanan:
 *          - Ownable manual (tanpa dependency eksternal).
 *          - ReentrancyGuard sederhana.
 *          - SafeERC20-style low-level call untuk approve / transferFrom.
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

contract AggregatorRouter {
    // ---------------------------------------------------------------------
    // Ownership
    // ---------------------------------------------------------------------
    address public owner;
    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }
    event OwnershipTransferred(address indexed from, address indexed to);

    // ---------------------------------------------------------------------
    // Reentrancy guard
    // ---------------------------------------------------------------------
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ---------------------------------------------------------------------
    // Router registry
    //   routerId -> router address (0x0 = slot kosong / dihapus)
    // ---------------------------------------------------------------------
    mapping(uint256 => address) public dexRouters;
    mapping(uint256 => string)  public dexNames;   // opsional, buat UX
    uint256 public nextRouterId;                   // auto-increment saat add

    event RouterAdded(uint256 indexed id, address router, string name);
    event RouterUpdated(uint256 indexed id, address oldRouter, address newRouter);
    event RouterRemoved(uint256 indexed id, address router);

    event SwapExecuted(
        uint256 indexed routerId,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_OWNER");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Tambah router baru, mengembalikan id yang diassign.
    function addRouter(address router, string calldata name) external onlyOwner returns (uint256 id) {
        require(router != address(0), "ZERO_ROUTER");
        id = nextRouterId++;
        dexRouters[id] = router;
        dexNames[id]   = name;
        emit RouterAdded(id, router, name);
    }

    /// @notice Perbarui alamat router pada id tertentu.
    function updateRouter(uint256 id, address newRouter) external onlyOwner {
        require(newRouter != address(0), "ZERO_ROUTER");
        address old = dexRouters[id];
        require(old != address(0), "EMPTY_SLOT");
        dexRouters[id] = newRouter;
        emit RouterUpdated(id, old, newRouter);
    }

    /// @notice Hapus router dari daftar (set ke 0x0).
    function removeRouter(uint256 id) external onlyOwner {
        address old = dexRouters[id];
        require(old != address(0), "EMPTY_SLOT");
        delete dexRouters[id];
        delete dexNames[id];
        emit RouterRemoved(id, old);
    }

    // ---------------------------------------------------------------------
    // Swap
    // ---------------------------------------------------------------------
    /**
     * @param routerId     ID router yang dipilih user di frontend.
     * @param tokenIn      Token yang di-swap dari user.
     * @param tokenOut     Token yang diterima.
     * @param amountIn     Jumlah tokenIn.
     * @param amountOutMin Minimum tokenOut (slippage guard).
     * @param to           Penerima tokenOut.
     */
    function executeSwapWithRouter(
        uint256 routerId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address to
    ) external nonReentrant returns (uint256 amountOut) {
        address router = dexRouters[routerId];
        require(router != address(0), "ROUTER_NOT_FOUND");
        require(amountIn > 0, "ZERO_AMOUNT_IN");
        require(to != address(0), "ZERO_TO");
        require(tokenIn != tokenOut, "SAME_TOKEN");

        // 1) Tarik token dari user
        _safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);

        // 2) Approve router (reset dulu ke 0 untuk token non-standar spt USDT)
        _safeApprove(tokenIn, router, 0);
        _safeApprove(tokenIn, router, amountIn);

        // 3) Susun path & panggil router
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256 balBefore = IERC20(tokenOut).balanceOf(to);

        try IUniswapV2Router(router).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            to,
            block.timestamp + 300
        ) returns (uint256[] memory amounts) {
            amountOut = amounts[amounts.length - 1];
        } catch Error(string memory reason) {
            // Reset approval & bubble up alasan revert
            _safeApprove(tokenIn, router, 0);
            revert(string(abi.encodePacked("ROUTER_FAILED: ", reason)));
        } catch {
            _safeApprove(tokenIn, router, 0);
            revert("ROUTER_FAILED");
        }

        // 4) Verifikasi user benar-benar menerima output
        uint256 received = IERC20(tokenOut).balanceOf(to) - balBefore;
        require(received >= amountOutMin, "INSUFFICIENT_OUTPUT");

        emit SwapExecuted(routerId, msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    // ---------------------------------------------------------------------
    // Safe ERC20 helpers
    // ---------------------------------------------------------------------
    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FROM_FAILED");
    }

    function _safeApprove(address token, address spender, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "APPROVE_FAILED");
    }

    /// @notice Emergency: tarik token yang mungkin nyangkut di kontrak.
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "RESCUE_FAILED");
    }
}
