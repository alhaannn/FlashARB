// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./interfaces/IUniswapV2Callee.sol";
import "./interfaces/IPoolCallee.sol";
import "./interfaces/IAerodromePool.sol";
import "./interfaces/IUniswapV3Pool.sol";
import "./interfaces/IUniswapV4.sol";
import "./interfaces/IWETH.sol";
import "./libraries/UniswapV2Library.sol";

/// @title FlashArbExecutor - Production-Grade Full-Mesh DEX Arbitrage Executor
/// @notice Executes uncollateralized flash swap arbitrage between Uniswap V2, V3, and V4 compatible DEX pools
/// @dev Implements Uniswap V2 Callee, Aerodrome Pool Callee, Uniswap V3 Callback, PancakeSwap V3 Callback, and Uniswap V4 Unlock Callback
contract FlashArbExecutor is
    IUniswapV2Callee,
    IPoolCallee,
    IUniswapV3SwapCallback,
    IPancakeV3SwapCallback,
    IUnlockCallback,
    Ownable
{
    using SafeERC20 for IERC20;

    address public immutable WETH;
    address public poolManager;

    event ArbitrageExecuted(
        address indexed poolBorrow,
        address indexed poolTarget,
        address indexed profitToken,
        uint256 profitAmount,
        uint256 validatorTip
    );

    enum ArbType {
        TWO_POOL,
        TRIANGULAR,
        V2_TO_V3,
        V3_TO_V3,
        V3_TO_V2,
        V4_TO_V4,
        V4_TO_V3,
        V4_TO_V2,
        V2_TO_V4,
        V3_TO_V4
    }

    struct ArbParams {
        ArbType arbType;
        address poolBorrow;
        address poolTarget;
        address pool3;
        uint256 amountBorrow;
        bool borrowToken0;
        uint256 minProfit;
        uint256 validatorTip;
        address recipient;
    }

    struct V4ArbParams {
        ArbType arbType;
        PoolKey v4KeyBorrow;
        PoolKey v4KeyTarget;
        address targetPool;
        uint256 amountBorrow;
        bool borrowToken0;
        uint256 minProfit;
        uint256 validatorTip;
        address recipient;
    }

    // Active execution context guards to prevent unauthenticated callbacks and reentrancy
    address private _activeV2BorrowPool;
    address private _activeV3BorrowPool;
    bool private _activeV4Borrow;

    struct V3SwapContext {
        address expectedPool;
        address payingToken;
        uint256 maxAmountToPay;
        bool callbackExecuted;
    }
    V3SwapContext private _v3Context;

    constructor(address _weth) Ownable(msg.sender) {
        require(_weth != address(0), "FlashArb: Invalid WETH");
        WETH = _weth;
        // Default to Base Mainnet Uniswap V4 PoolManager
        poolManager = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    }

    function setPoolManager(address _poolManager) external onlyOwner {
        require(_poolManager != address(0), "FlashArb: Invalid PoolManager");
        poolManager = _poolManager;
    }

    /// @notice Initiates a flash swap arbitrage between two V2 pools (poolBorrow and poolTarget)
    function executeFlashArb(
        address poolBorrow,
        address poolTarget,
        uint256 amountBorrow,
        bool borrowToken0,
        uint256 minProfit,
        uint256 validatorTip
    ) external onlyOwner {
        require(amountBorrow > 0, "FlashArb: Zero borrow amount");
        require(poolBorrow != address(0) && poolTarget != address(0), "FlashArb: Zero pool address");
        require(poolBorrow != poolTarget, "FlashArb: Identical pools");
        require(_activeV2BorrowPool == address(0), "FlashArb: Active swap in progress");

        bytes memory data = abi.encode(
            ArbParams({
                arbType: ArbType.TWO_POOL,
                poolBorrow: poolBorrow,
                poolTarget: poolTarget,
                pool3: address(0),
                amountBorrow: amountBorrow,
                borrowToken0: borrowToken0,
                minProfit: minProfit,
                validatorTip: validatorTip,
                recipient: msg.sender
            })
        );

        uint256 amount0Out = borrowToken0 ? amountBorrow : 0;
        uint256 amount1Out = borrowToken0 ? 0 : amountBorrow;

        _activeV2BorrowPool = poolBorrow;
        IUniswapV2Pair(poolBorrow).swap(amount0Out, amount1Out, address(this), data);
        _activeV2BorrowPool = address(0);
    }

    /// @notice Initiates a 3-hop intra-DEX triangular flash swap arbitrage
    function executeTriangularFlashArb(
        address pool1,
        address pool2,
        address pool3,
        uint256 amountBorrow,
        bool borrowToken0,
        uint256 minProfit,
        uint256 validatorTip
    ) external onlyOwner {
        require(amountBorrow > 0, "FlashArb: Zero borrow amount");
        require(pool1 != address(0) && pool2 != address(0) && pool3 != address(0), "FlashArb: Zero pool address");
        require(pool1 != pool2 && pool2 != pool3 && pool1 != pool3, "FlashArb: Duplicate pools in triangle");
        require(_activeV2BorrowPool == address(0), "FlashArb: Active swap in progress");

        bytes memory data = abi.encode(
            ArbParams({
                arbType: ArbType.TRIANGULAR,
                poolBorrow: pool1,
                poolTarget: pool2,
                pool3: pool3,
                amountBorrow: amountBorrow,
                borrowToken0: borrowToken0,
                minProfit: minProfit,
                validatorTip: validatorTip,
                recipient: msg.sender
            })
        );

        uint256 amount0Out = borrowToken0 ? amountBorrow : 0;
        uint256 amount1Out = borrowToken0 ? 0 : amountBorrow;

        _activeV2BorrowPool = pool1;
        IUniswapV2Pair(pool1).swap(amount0Out, amount1Out, address(this), data);
        _activeV2BorrowPool = address(0);
    }

    /// @notice Borrow from V2 (constant product) ➔ Swap on V3 (concentrated liquidity) ➔ Repay V2
    function executeV2ToV3FlashArb(
        address poolV2Borrow,
        address poolV3Target,
        uint256 amountBorrow,
        bool borrowToken0,
        uint256 minProfit,
        uint256 validatorTip
    ) external onlyOwner {
        require(amountBorrow > 0, "FlashArb: Zero borrow amount");
        require(poolV2Borrow != address(0) && poolV3Target != address(0), "FlashArb: Zero pool address");
        require(_activeV2BorrowPool == address(0), "FlashArb: Active swap in progress");

        bytes memory data = abi.encode(
            ArbParams({
                arbType: ArbType.V2_TO_V3,
                poolBorrow: poolV2Borrow,
                poolTarget: poolV3Target,
                pool3: address(0),
                amountBorrow: amountBorrow,
                borrowToken0: borrowToken0,
                minProfit: minProfit,
                validatorTip: validatorTip,
                recipient: msg.sender
            })
        );

        uint256 amount0Out = borrowToken0 ? amountBorrow : 0;
        uint256 amount1Out = borrowToken0 ? 0 : amountBorrow;

        _activeV2BorrowPool = poolV2Borrow;
        IUniswapV2Pair(poolV2Borrow).swap(amount0Out, amount1Out, address(this), data);
        _activeV2BorrowPool = address(0);
    }

    /// @notice Borrow from Pool A (V3) ➔ Swap on Pool B (V3) ➔ Repay Pool A (V3)
    function executeV3ToV3FlashArb(
        address poolV3Borrow,
        address poolV3Target,
        uint256 amountBorrow,
        bool borrowToken0,
        uint256 minProfit,
        uint256 validatorTip
    ) external onlyOwner {
        require(amountBorrow > 0, "FlashArb: Zero borrow amount");
        require(poolV3Borrow != address(0) && poolV3Target != address(0), "FlashArb: Zero pool address");
        require(poolV3Borrow != poolV3Target, "FlashArb: Duplicate pools in V3-V3 arb");
        require(_activeV3BorrowPool == address(0), "FlashArb: Active V3 swap in progress");

        bytes memory data = abi.encode(
            ArbParams({
                arbType: ArbType.V3_TO_V3,
                poolBorrow: poolV3Borrow,
                poolTarget: poolV3Target,
                pool3: address(0),
                amountBorrow: amountBorrow,
                borrowToken0: borrowToken0,
                minProfit: minProfit,
                validatorTip: validatorTip,
                recipient: msg.sender
            })
        );

        bool zeroForOne = !borrowToken0;
        uint160 sqrtPriceLimitX96 = zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341;

        _activeV3BorrowPool = poolV3Borrow;
        IUniswapV3Pool(poolV3Borrow).swap(
            address(this),
            zeroForOne,
            -int256(amountBorrow),
            sqrtPriceLimitX96,
            data
        );
        _activeV3BorrowPool = address(0);
    }

    /// @notice Borrow from V3 (concentrated liquidity) ➔ Swap on V2 (constant product) ➔ Repay V3
    function executeV3ToV2FlashArb(
        address poolV3Borrow,
        address poolV2Target,
        uint256 amountBorrow,
        bool borrowToken0,
        uint256 minProfit,
        uint256 validatorTip
    ) external onlyOwner {
        require(amountBorrow > 0, "FlashArb: Zero borrow amount");
        require(poolV3Borrow != address(0) && poolV2Target != address(0), "FlashArb: Zero pool address");
        require(_activeV3BorrowPool == address(0), "FlashArb: Active V3 swap in progress");

        bytes memory data = abi.encode(
            ArbParams({
                arbType: ArbType.V3_TO_V2,
                poolBorrow: poolV3Borrow,
                poolTarget: poolV2Target,
                pool3: address(0),
                amountBorrow: amountBorrow,
                borrowToken0: borrowToken0,
                minProfit: minProfit,
                validatorTip: validatorTip,
                recipient: msg.sender
            })
        );

        bool zeroForOne = !borrowToken0;
        uint160 sqrtPriceLimitX96 = zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341;

        _activeV3BorrowPool = poolV3Borrow;
        IUniswapV3Pool(poolV3Borrow).swap(
            address(this),
            zeroForOne,
            -int256(amountBorrow),
            sqrtPriceLimitX96,
            data
        );
        _activeV3BorrowPool = address(0);
    }

    /// @notice Universal Uniswap V4 Arbitrage Executor (V4 -> V4, V4 -> V3, V4 -> V2)
    /// Borrow from Uniswap V4 (0% flash fee) ➔ Swap on target pool ➔ Repay V4
    function executeV4Arbitrage(
        PoolKey calldata v4KeyBorrow,
        uint8 targetDexType, // 1: V3, 2: V2, 3: V4
        address targetPool,
        PoolKey calldata targetV4Key,
        uint256 amountBorrow,
        bool borrowToken0,
        uint256 minProfit,
        uint256 validatorTip
    ) external onlyOwner {
        require(amountBorrow > 0, "FlashArb: Zero borrow amount");
        require(poolManager != address(0), "FlashArb: Zero PoolManager");
        require(!_activeV4Borrow, "FlashArb: Active V4 swap in progress");

        ArbType arbType;
        if (targetDexType == 1) {
            arbType = ArbType.V4_TO_V3;
            require(targetPool != address(0), "FlashArb: Zero target V3 pool");
        } else if (targetDexType == 2) {
            arbType = ArbType.V4_TO_V2;
            require(targetPool != address(0), "FlashArb: Zero target V2 pool");
        } else {
            arbType = ArbType.V4_TO_V4;
        }

        bytes memory data = abi.encode(
            V4ArbParams({
                arbType: arbType,
                v4KeyBorrow: v4KeyBorrow,
                v4KeyTarget: targetV4Key,
                targetPool: targetPool,
                amountBorrow: amountBorrow,
                borrowToken0: borrowToken0,
                minProfit: minProfit,
                validatorTip: validatorTip,
                recipient: msg.sender
            })
        );

        _activeV4Borrow = true;
        IPoolManager(poolManager).unlock(data);
        _activeV4Borrow = false;
    }

    /// @notice Callback invoked by Uniswap V2 pair during flash swap
    function uniswapV2Call(
        address sender,
        uint256 /* amount0 */,
        uint256 /* amount1 */,
        bytes calldata data
    ) external override {
        _handleFlashCallback(sender, data);
    }

    /// @notice Callback invoked by Aerodrome / Velodrome pool during flash swap
    function hook(
        address sender,
        uint256 /* amount0 */,
        uint256 /* amount1 */,
        bytes calldata data
    ) external override {
        _handleFlashCallback(sender, data);
    }

    function _handleFlashCallback(address sender, bytes calldata data) internal {
        require(sender == address(this), "FlashArb: Unauthorized sender");
        require(_activeV2BorrowPool != address(0) && msg.sender == _activeV2BorrowPool, "FlashArb: Unauthorized V2 caller");

        ArbParams memory params = abi.decode(data, (ArbParams));
        require(msg.sender == params.poolBorrow, "FlashArb: Callback pool mismatch");

        if (params.arbType == ArbType.TWO_POOL) {
            _executeTwoPoolLogic(params);
        } else if (params.arbType == ArbType.TRIANGULAR) {
            _executeTriangularLogic(params);
        } else {
            _executeV2ToV3Logic(params);
        }
    }

    function _executeTwoPoolLogic(ArbParams memory params) internal {
        (address borrowedToken, address repayToken) = _resolveTokens(params.poolBorrow, params.borrowToken0);

        address targetT0 = IUniswapV2Pair(params.poolTarget).token0();
        address targetT1 = IUniswapV2Pair(params.poolTarget).token1();
        require(
            (targetT0 == borrowedToken && targetT1 == repayToken) ||
            (targetT0 == repayToken && targetT1 == borrowedToken),
            "FlashArb: Token mismatch in target pool"
        );

        uint256 amountRequired = _getRepaymentAmount(params.poolBorrow, params.amountBorrow, params.borrowToken0);
        uint256 amountOut = _executeTargetSwap(params.poolTarget, borrowedToken, params.amountBorrow);

        require(amountOut > amountRequired, "FlashArb: Arbitrage unprofitable");
        uint256 netProfit = amountOut - amountRequired;
        require(netProfit >= params.minProfit, "FlashArb: Profit below minProfit threshold");

        IERC20(repayToken).safeTransfer(params.poolBorrow, amountRequired);
        netProfit = _handleValidatorTip(params.validatorTip, repayToken, netProfit);
        IERC20(repayToken).safeTransfer(params.recipient, netProfit);

        emit ArbitrageExecuted(
            params.poolBorrow,
            params.poolTarget,
            repayToken,
            netProfit,
            params.validatorTip
        );
    }

    function _executeTriangularLogic(ArbParams memory params) internal {
        (address tokenA, address baseToken) = _resolveTokens(params.poolBorrow, params.borrowToken0);
        uint256 amountRequired = _getRepaymentAmount(params.poolBorrow, params.amountBorrow, params.borrowToken0);
        uint256 amountTokenB = _executeTargetSwap(params.poolTarget, tokenA, params.amountBorrow);

        address tokenB = (IUniswapV2Pair(params.poolTarget).token0() == tokenA)
            ? IUniswapV2Pair(params.poolTarget).token1()
            : IUniswapV2Pair(params.poolTarget).token0();

        uint256 finalBaseOut = _executeTargetSwap(params.pool3, tokenB, amountTokenB);

        require(finalBaseOut > amountRequired, "FlashArb: Arbitrage unprofitable");
        uint256 netProfit = finalBaseOut - amountRequired;
        require(netProfit >= params.minProfit, "FlashArb: Profit below minProfit threshold");

        IERC20(baseToken).safeTransfer(params.poolBorrow, amountRequired);
        netProfit = _handleValidatorTip(params.validatorTip, baseToken, netProfit);
        IERC20(baseToken).safeTransfer(params.recipient, netProfit);

        emit ArbitrageExecuted(
            params.poolBorrow,
            params.poolTarget,
            baseToken,
            netProfit,
            params.validatorTip
        );
    }

    function _executeV2ToV3Logic(ArbParams memory params) internal {
        (address borrowedToken, address repayToken) = _resolveTokens(params.poolBorrow, params.borrowToken0);
        uint256 amountRequired = _getRepaymentAmount(params.poolBorrow, params.amountBorrow, params.borrowToken0);

        uint256 amountOut = _executeV3TargetSwap(params.poolTarget, borrowedToken, repayToken, params.amountBorrow);

        require(amountOut > amountRequired, "FlashArb: V2-V3 arb unprofitable");
        uint256 netProfit = amountOut - amountRequired;
        require(netProfit >= params.minProfit, "FlashArb: V2-V3 profit below threshold");

        IERC20(repayToken).safeTransfer(params.poolBorrow, amountRequired);
        netProfit = _handleValidatorTip(params.validatorTip, repayToken, netProfit);
        IERC20(repayToken).safeTransfer(params.recipient, netProfit);

        emit ArbitrageExecuted(
            params.poolBorrow,
            params.poolTarget,
            repayToken,
            netProfit,
            params.validatorTip
        );
    }

    /// @notice Callback for Uniswap V3 / Slipstream swaps
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        _handleV3SwapCallback(amount0Delta, amount1Delta, data);
    }

    /// @notice Callback for PancakeSwap V3 swaps
    function pancakeV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        _handleV3SwapCallback(amount0Delta, amount1Delta, data);
    }

    function _handleV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) internal {
        // Case 1: Caller is the active V3 borrow pool (outer flash swap callback)
        if (_activeV3BorrowPool != address(0) && msg.sender == _activeV3BorrowPool) {
            ArbParams memory params = abi.decode(data, (ArbParams));
            if (params.arbType == ArbType.V3_TO_V2) {
                _executeV3ToV2Logic(amount0Delta, amount1Delta, params);
            } else {
                _executeV3ToV3Logic(amount0Delta, amount1Delta, params);
            }
            return;
        }

        // Case 2: Caller is the active V3 target pool (inner swap callback)
        require(_v3Context.expectedPool != address(0) && msg.sender == _v3Context.expectedPool, "FlashArb: Unauthorized V3 callback caller");
        require(!_v3Context.callbackExecuted, "FlashArb: V3 callback already executed");

        require((amount0Delta > 0 && amount1Delta <= 0) || (amount1Delta > 0 && amount0Delta <= 0), "FlashArb: Inconsistent V3 deltas");

        uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
        require(amountToPay <= _v3Context.maxAmountToPay, "FlashArb: Amount to pay exceeds borrow");

        require(data.length >= 32, "FlashArb: Invalid callback data length");
        address payingToken = abi.decode(data, (address));
        require(payingToken == _v3Context.payingToken, "FlashArb: Invalid paying token");

        _v3Context.callbackExecuted = true;
        IERC20(payingToken).safeTransfer(msg.sender, amountToPay);
    }

    function _executeV3ToV3Logic(
        int256 amount0Delta,
        int256 amount1Delta,
        ArbParams memory params
    ) internal {
        require(params.arbType == ArbType.V3_TO_V3, "FlashArb: Invalid V3-V3 arb type");
        require(msg.sender == params.poolBorrow, "FlashArb: Callback pool mismatch");

        address borrowedToken;
        address repayToken;
        {
            address b0 = IUniswapV3Pool(params.poolBorrow).token0();
            address b1 = IUniswapV3Pool(params.poolBorrow).token1();
            borrowedToken = params.borrowToken0 ? b0 : b1;
            repayToken = params.borrowToken0 ? b1 : b0;
        }

        uint256 amountRequired = params.borrowToken0 ? uint256(amount1Delta) : uint256(amount0Delta);
        uint256 amountOut = _executeV3TargetSwap(params.poolTarget, borrowedToken, repayToken, params.amountBorrow);

        require(amountOut > amountRequired, "FlashArb: V3-V3 arb unprofitable");
        uint256 netProfit = amountOut - amountRequired;
        require(netProfit >= params.minProfit, "FlashArb: V3-V3 profit below threshold");

        IERC20(repayToken).safeTransfer(msg.sender, amountRequired);
        netProfit = _handleValidatorTip(params.validatorTip, repayToken, netProfit);
        IERC20(repayToken).safeTransfer(params.recipient, netProfit);

        emit ArbitrageExecuted(
            params.poolBorrow,
            params.poolTarget,
            repayToken,
            netProfit,
            params.validatorTip
        );
    }

    function _executeV3ToV2Logic(
        int256 amount0Delta,
        int256 amount1Delta,
        ArbParams memory params
    ) internal {
        require(params.arbType == ArbType.V3_TO_V2, "FlashArb: Invalid V3-V2 arb type");
        require(msg.sender == params.poolBorrow, "FlashArb: Callback pool mismatch");

        address borrowedToken;
        address repayToken;
        {
            address b0 = IUniswapV3Pool(params.poolBorrow).token0();
            address b1 = IUniswapV3Pool(params.poolBorrow).token1();
            borrowedToken = params.borrowToken0 ? b0 : b1;
            repayToken = params.borrowToken0 ? b1 : b0;

            address targetT0 = IUniswapV2Pair(params.poolTarget).token0();
            address targetT1 = IUniswapV2Pair(params.poolTarget).token1();
            require(
                (targetT0 == borrowedToken && targetT1 == repayToken) ||
                (targetT0 == repayToken && targetT1 == borrowedToken),
                "FlashArb: Token mismatch in target V2 pool"
            );
        }

        uint256 amountRequired = params.borrowToken0 ? uint256(amount1Delta) : uint256(amount0Delta);
        uint256 amountOut = _executeTargetSwap(params.poolTarget, borrowedToken, params.amountBorrow);

        require(amountOut > amountRequired, "FlashArb: V3-V2 arb unprofitable");
        uint256 netProfit = amountOut - amountRequired;
        require(netProfit >= params.minProfit, "FlashArb: V3-V2 profit below threshold");

        IERC20(repayToken).safeTransfer(msg.sender, amountRequired);
        netProfit = _handleValidatorTip(params.validatorTip, repayToken, netProfit);
        IERC20(repayToken).safeTransfer(params.recipient, netProfit);

        emit ArbitrageExecuted(
            params.poolBorrow,
            params.poolTarget,
            repayToken,
            netProfit,
            params.validatorTip
        );
    }

    /// @notice Helper executing exact-input swap against an arbitrary Uniswap V3 compatible pool
    function _executeV3TargetSwap(
        address targetPool,
        address borrowedToken,
        address repayToken,
        uint256 amountBorrow
    ) internal returns (uint256 amountOut) {
        address v3T0 = IUniswapV3Pool(targetPool).token0();
        address v3T1 = IUniswapV3Pool(targetPool).token1();
        require(
            (v3T0 == borrowedToken && v3T1 == repayToken) ||
            (v3T0 == repayToken && v3T1 == borrowedToken),
            "FlashArb: Token mismatch in target V3 pool"
        );

        require(_v3Context.expectedPool == address(0), "FlashArb: Active V3 swap in progress");

        bool targetZeroForOne = (v3T0 == borrowedToken);
        uint160 targetSqrtLimit = targetZeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341;

        _v3Context = V3SwapContext({
            expectedPool: targetPool,
            payingToken: borrowedToken,
            maxAmountToPay: amountBorrow,
            callbackExecuted: false
        });

        uint256 balBefore = IERC20(repayToken).balanceOf(address(this));
        IUniswapV3Pool(targetPool).swap(
            address(this),
            targetZeroForOne,
            int256(amountBorrow),
            targetSqrtLimit,
            abi.encode(borrowedToken)
        );

        require(_v3Context.callbackExecuted, "FlashArb: Target V3 callback not executed");
        delete _v3Context;

        amountOut = IERC20(repayToken).balanceOf(address(this)) - balBefore;
    }

    /// @notice Uniswap V4 Flash Accounting unlockCallback
    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        require(msg.sender == poolManager, "FlashArb: Unauthorized V4 callback");
        require(_activeV4Borrow, "FlashArb: No active V4 execution");

        V4ArbParams memory params = abi.decode(data, (V4ArbParams));

        address borrowedToken = params.borrowToken0 ? params.v4KeyBorrow.currency0 : params.v4KeyBorrow.currency1;
        address repayToken = params.borrowToken0 ? params.v4KeyBorrow.currency1 : params.v4KeyBorrow.currency0;

        // 1. Swap on V4 borrow pool: exact output (we want amountBorrow of borrowedToken)
        bool zeroForOne = !params.borrowToken0;
        uint160 sqrtLimit = zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341;

        int256 delta = IPoolManager(poolManager).swap(
            params.v4KeyBorrow,
            IPoolManager.SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(params.amountBorrow),
                sqrtPriceLimitX96: sqrtLimit
            }),
            ""
        );

        // Required repayment amount in repayToken
        uint256 amountRequired = params.borrowToken0
            ? uint256(uint128(-int128(delta)))
            : uint256(uint128(-int128(delta >> 128)));

        // Take borrowed tokens from PoolManager to this contract
        IPoolManager(poolManager).take(borrowedToken, address(this), params.amountBorrow);

        // 2. Execute target swap on target venue
        uint256 amountOut;
        if (params.arbType == ArbType.V4_TO_V3) {
            amountOut = _executeV3TargetSwap(params.targetPool, borrowedToken, repayToken, params.amountBorrow);
        } else if (params.arbType == ArbType.V4_TO_V2) {
            amountOut = _executeTargetSwap(params.targetPool, borrowedToken, params.amountBorrow);
        } else {
            // V4_TO_V4
            bool targetZeroForOne = (params.v4KeyTarget.currency0 == borrowedToken);
            uint160 targetLimit = targetZeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341;

            IERC20(borrowedToken).safeTransfer(poolManager, params.amountBorrow);
            IPoolManager(poolManager).settle(borrowedToken);

            int256 targetDelta = IPoolManager(poolManager).swap(
                params.v4KeyTarget,
                IPoolManager.SwapParams({
                    zeroForOne: targetZeroForOne,
                    amountSpecified: int256(params.amountBorrow),
                    sqrtPriceLimitX96: targetLimit
                }),
                ""
            );
            amountOut = targetZeroForOne
                ? uint256(uint128(-int128(targetDelta)))
                : uint256(uint128(-int128(targetDelta >> 128)));
            IPoolManager(poolManager).take(repayToken, address(this), amountOut);
        }

        require(amountOut > amountRequired, "FlashArb: V4 arb unprofitable");
        uint256 netProfit = amountOut - amountRequired;
        require(netProfit >= params.minProfit, "FlashArb: V4 profit below threshold");

        // 3. Settle debt to PoolManager
        IERC20(repayToken).safeTransfer(poolManager, amountRequired);
        IPoolManager(poolManager).settle(repayToken);

        // 4. Handle validator tip and profit
        netProfit = _handleValidatorTip(params.validatorTip, repayToken, netProfit);
        IERC20(repayToken).safeTransfer(params.recipient, netProfit);

        emit ArbitrageExecuted(
            address(uint160(uint256(keccak256(abi.encode(params.v4KeyBorrow))))),
            params.targetPool != address(0) ? params.targetPool : address(uint160(uint256(keccak256(abi.encode(params.v4KeyTarget))))),
            repayToken,
            netProfit,
            params.validatorTip
        );

        return "";
    }

    function _resolveTokens(address pool, bool borrowToken0) internal view returns (address borrowed, address repay) {
        address t0 = IUniswapV2Pair(pool).token0();
        address t1 = IUniswapV2Pair(pool).token1();
        borrowed = borrowToken0 ? t0 : t1;
        repay = borrowToken0 ? t1 : t0;
    }

    function _getFeeBps(address pool) internal view returns (uint256) {
        try IAerodromePool(pool).factory() returns (address factory) {
            try IAerodromePool(pool).stable() returns (bool stable) {
                try IAerodromeFactory(factory).getFee(pool, stable) returns (uint256 fee) {
                    if (fee > 0 && fee <= 1000) {
                        return fee;
                    }
                } catch {}
            } catch {}
        } catch {}
        return 30; // standard 30 bps (0.3%) for Uniswap V2
    }

    function _getRepaymentAmount(address pool, uint256 amountBorrow, bool borrowToken0) internal view returns (uint256) {
        (uint112 r0, uint112 r1, ) = IUniswapV2Pair(pool).getReserves();
        uint256 feeBps = _getFeeBps(pool);
        (uint256 reserveIn, uint256 reserveOut) = borrowToken0 ? (uint256(r1), uint256(r0)) : (uint256(r0), uint256(r1));

        require(amountBorrow > 0, "FlashArb: Zero borrow amount");
        require(reserveOut > amountBorrow, "FlashArb: Insufficient liquidity for borrow");

        uint256 numerator = reserveIn * amountBorrow * 10000;
        uint256 denominator = (reserveOut - amountBorrow) * (10000 - feeBps);
        return (numerator / denominator) + 1;
    }

    function _executeTargetSwap(address poolTarget, address borrowedToken, uint256 amountBorrow) internal returns (uint256 amountOut) {
        IERC20(borrowedToken).safeTransfer(poolTarget, amountBorrow);

        (uint112 r0, uint112 r1, ) = IUniswapV2Pair(poolTarget).getReserves();
        address targetToken0 = IUniswapV2Pair(poolTarget).token0();
        uint256 feeBps = _getFeeBps(poolTarget);

        if (targetToken0 == borrowedToken) {
            amountOut = _getAmountOut(amountBorrow, uint256(r0), uint256(r1), feeBps);
            IUniswapV2Pair(poolTarget).swap(0, amountOut, address(this), "");
        } else {
            amountOut = _getAmountOut(amountBorrow, uint256(r1), uint256(r0), feeBps);
            IUniswapV2Pair(poolTarget).swap(amountOut, 0, address(this), "");
        }
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut, uint256 feeBps) internal pure returns (uint256) {
        require(amountIn > 0, "FlashArb: Insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "FlashArb: Insufficient liquidity");
        uint256 amountInWithFee = amountIn * (10000 - feeBps);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 10000) + amountInWithFee;
        return numerator / denominator;
    }

    function _handleValidatorTip(uint256 tip, address profitToken, uint256 profit) internal returns (uint256) {
        if (tip == 0) return profit;
        require(profit > tip, "FlashArb: Tip exceeds profit");
        require(profitToken == WETH, "FlashArb: Tip only supported for WETH profit");

        IWETH(WETH).withdraw(tip);
        (bool success, ) = block.coinbase.call{value: tip}("");
        require(success, "FlashArb: Miner tip transfer failed");
        return profit - tip;
    }

    /// @notice Rescue any ERC20 tokens mistakenly sent to this contract
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Rescue ETH mistakenly sent to this contract
    function rescueETH(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success, ) = to.call{value: balance}("");
        require(success, "FlashArb: ETH transfer failed");
    }

    receive() external payable {}
}
