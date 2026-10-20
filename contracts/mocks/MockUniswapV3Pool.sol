// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IUniswapV3Pool.sol";

contract MockUniswapV3Pool is IUniswapV3Pool {
    using SafeERC20 for IERC20;

    address public override token0;
    address public override token1;
    uint24 public override fee;
    uint128 public override liquidity;

    uint160 private _sqrtPriceX96;
    int24 private _tick;

    constructor(address _token0, address _token1, uint24 _fee) {
        token0 = _token0;
        token1 = _token1;
        fee = _fee;
    }

    function setSlot0(uint160 sqrtPriceX96_, int24 tick_) external {
        _sqrtPriceX96 = sqrtPriceX96_;
        _tick = tick_;
    }

    function setLiquidity(uint128 liquidity_) external {
        liquidity = liquidity_;
    }

    function slot0() external view override returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    ) {
        return (_sqrtPriceX96, _tick, 0, 1, 1, 0, true);
    }

    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 /* sqrtPriceLimitX96 */,
        bytes calldata data
    ) external override returns (int256 amount0, int256 amount1) {
        require(amountSpecified > 0, "MockV3: Exact input only");
        uint256 amountIn = uint256(amountSpecified);
        require(liquidity > 0, "MockV3: Zero liquidity");

        // Fee deduction (fee is in millionths, e.g. 3000 = 0.3%)
        uint256 amountInWithFee = (amountIn * (1000000 - fee)) / 1000000;
        uint256 amountOut;

        if (zeroForOne) {
            // Swapping token0 for token1
            // Rearranged to avoid intermediate 512-bit overflow:
            // deltaSqrtP = (amountInWithFee * sqrtPriceX96) / ((L << 96) / sqrtPriceX96 + amountInWithFee)
            uint256 denominator = ((uint256(liquidity) << 96) / uint256(_sqrtPriceX96)) + amountInWithFee;
            uint256 deltaSqrtP = (amountInWithFee * uint256(_sqrtPriceX96)) / denominator;
            if (deltaSqrtP >= _sqrtPriceX96) deltaSqrtP = _sqrtPriceX96 / 2;
            
            amountOut = (uint256(liquidity) * deltaSqrtP) >> 96;
            require(amountOut > 0, "MockV3: Zero output");
            require(IERC20(token1).balanceOf(address(this)) >= amountOut, "MockV3: Insufficient token1 reserve");

            IERC20(token1).safeTransfer(recipient, amountOut);

            uint256 bal0Before = IERC20(token0).balanceOf(address(this));
            if (data.length > 0) {
                IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(int256(amountIn), -int256(amountOut), data);
            }
            uint256 bal0After = IERC20(token0).balanceOf(address(this));
            require(bal0After >= bal0Before + amountIn, "MockV3: Insufficient payment token0");

            _sqrtPriceX96 = uint160(_sqrtPriceX96 - deltaSqrtP);
            return (int256(amountIn), -int256(amountOut));
        } else {
            // Swapping token1 for token0
            uint256 deltaSqrtP = (amountInWithFee << 96) / uint256(liquidity);
            uint256 newSqrtP = uint256(_sqrtPriceX96) + deltaSqrtP;
            amountOut = (uint256(liquidity) << 96) / _sqrtPriceX96 - (uint256(liquidity) << 96) / newSqrtP;
            require(amountOut > 0, "MockV3: Zero output");
            require(IERC20(token0).balanceOf(address(this)) >= amountOut, "MockV3: Insufficient token0 reserve");

            IERC20(token0).safeTransfer(recipient, amountOut);

            uint256 bal1Before = IERC20(token1).balanceOf(address(this));
            if (data.length > 0) {
                IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(-int256(amountOut), int256(amountIn), data);
            }
            uint256 bal1After = IERC20(token1).balanceOf(address(this));
            require(bal1After >= bal1Before + amountIn, "MockV3: Insufficient payment token1");

            _sqrtPriceX96 = uint160(newSqrtP);
            return (-int256(amountOut), int256(amountIn));
        }
    }
}
