// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./interfaces/IUniswapV2Callee.sol";
import "./interfaces/IUniswapV3Pool.sol";
import "./interfaces/IWETH.sol";
import "./libraries/UniswapV2Library.sol";

/// @title FlashArbExecutor - Production-Grade DEX Arbitrage Executor
/// @notice Executes uncollateralized flash swap arbitrage between two Uniswap V2 compatible DEX pools
/// @dev Implements Uniswap V2 Callee, Uniswap V3 Callback, and Flashbots block.coinbase tipping
contract FlashArbExecutor is IUniswapV2Callee, IUniswapV3SwapCallback, Ownable {
    using SafeERC20 for IERC20;

    address public immutable WETH;

    event ArbitrageExecuted(
        address indexed poolBorrow,
        address indexed poolTarget,
        address indexed profitToken,
        uint256 profitAmount,
        uint256 validatorTip
    );

    enum ArbType { TWO_POOL, TRIANGULAR, V2_TO_V3 }

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

    constructor(address _weth) Ownable(msg.sender) {
        require(_weth != address(0), "FlashArb: Invalid WETH");
        WETH = _weth;
    }

    /// @notice Initiates a flash swap arbitrage between poolBorrow and poolTarget
    function executeFlashArb(
        address poolBorrow,
        address poolTarget,
        uint256 amountBorrow,
        bool borrowToken0,
        uint256 minProfit,
        uint256 validatorTip
    ) external onlyOwner {
        require(amountBorrow > 0, "FlashArb: Zero borrow amount");
        require(poolBorrow != poolTarget, "FlashArb: Identical pools");

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

        IUniswapV2Pair(poolBorrow).swap(amount0Out, amount1Out, address(this), data);
    }

    /// @notice Initiates a 3-hop intra-DEX triangular flash swap arbitrage (Solution 4)
    /// Route: Pool 1 (Base <-> TokenA) ➔ Pool 2 (TokenA <-> TokenB) ➔ Pool 3 (TokenB <-> Base)
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
        require(pool1 != pool2 && pool2 != pool3 && pool1 != pool3, "FlashArb: Duplicate pools in triangle");

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

        IUniswapV2Pair(pool1).swap(amount0Out, amount1Out, address(this), data);
    }

    /// @notice Solution 5: Executes flash swap between Uniswap V2 and Uniswap V3 / Slipstream
    /// Borrow from V2 (constant product) ➔ Swap on V3 (concentrated liquidity) ➔ Repay V2
    function executeV2ToV3FlashArb(
        address poolV2Borrow,
        address poolV3Target,
        uint256 amountBorrow,
        bool borrowToken0,
        uint256 minProfit,
        uint256 validatorTip
    ) external onlyOwner {
        require(amountBorrow > 0, "FlashArb: Zero borrow amount");

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

        IUniswapV2Pair(poolV2Borrow).swap(amount0Out, amount1Out, address(this), data);
    }

    /// @notice Callback invoked by Uniswap V2 pair during flash swap
    function uniswapV2Call(
        address sender,
        uint256 /* amount0 */,
        uint256 /* amount1 */,
        bytes calldata data
    ) external override {
        require(sender == address(this), "FlashArb: Unauthorized sender");

        ArbParams memory params = abi.decode(data, (ArbParams));
        require(msg.sender == params.poolBorrow, "FlashArb: Unauthorized caller");

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

        bool zeroForOne = (IUniswapV3Pool(params.poolTarget).token0() == borrowedToken);
        uint160 sqrtPriceLimitX96 = zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341;

        uint256 balBefore = IERC20(repayToken).balanceOf(address(this));
        IUniswapV3Pool(params.poolTarget).swap(
            address(this),
            zeroForOne,
            int256(params.amountBorrow),
            sqrtPriceLimitX96,
            abi.encode(borrowedToken)
        );
        uint256 amountOut = IERC20(repayToken).balanceOf(address(this)) - balBefore;

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
        address payingToken = abi.decode(data, (address));
        uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
        IERC20(payingToken).safeTransfer(msg.sender, amountToPay);
    }

    function _resolveTokens(address pool, bool borrowToken0) internal view returns (address borrowed, address repay) {
        address t0 = IUniswapV2Pair(pool).token0();
        address t1 = IUniswapV2Pair(pool).token1();
        borrowed = borrowToken0 ? t0 : t1;
        repay = borrowToken0 ? t1 : t0;
    }

    function _getRepaymentAmount(address pool, uint256 amountBorrow, bool borrowToken0) internal view returns (uint256) {
        (uint112 r0, uint112 r1, ) = IUniswapV2Pair(pool).getReserves();
        return borrowToken0
            ? UniswapV2Library.getAmountIn(amountBorrow, r1, r0)
            : UniswapV2Library.getAmountIn(amountBorrow, r0, r1);
    }

    function _executeTargetSwap(address poolTarget, address borrowedToken, uint256 amountBorrow) internal returns (uint256 amountOut) {
        IERC20(borrowedToken).safeTransfer(poolTarget, amountBorrow);

        (uint112 r0, uint112 r1, ) = IUniswapV2Pair(poolTarget).getReserves();
        address targetToken0 = IUniswapV2Pair(poolTarget).token0();

        if (targetToken0 == borrowedToken) {
            amountOut = UniswapV2Library.getAmountOut(amountBorrow, r0, r1);
            IUniswapV2Pair(poolTarget).swap(0, amountOut, address(this), "");
        } else {
            amountOut = UniswapV2Library.getAmountOut(amountBorrow, r1, r0);
            IUniswapV2Pair(poolTarget).swap(amountOut, 0, address(this), "");
        }
    }

    function _handleValidatorTip(uint256 tip, address profitToken, uint256 profit) internal returns (uint256) {
        if (tip == 0) return profit;
        require(profit > tip, "FlashArb: Tip exceeds profit");

        if (profitToken == WETH) {
            IWETH(WETH).withdraw(tip);
            (bool success, ) = block.coinbase.call{value: tip}("");
            require(success, "FlashArb: Miner tip transfer failed");
        }
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
