// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../interfaces/IUniswapV3Quoter.sol";
import "../interfaces/IUniswapV3Pool.sol";

contract MockUniswapV3Quoter is IUniswapV3Quoter {
    mapping(bytes32 => address) public pools;

    function registerPool(address tokenA, address tokenB, uint24 fee, address pool) external {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        pools[keccak256(abi.encodePacked(t0, t1, fee))] = pool;
    }

    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 /* sqrtPriceLimitX96 */
    ) external view override returns (uint256 amountOut) {
        (address t0, address t1) = tokenIn < tokenOut ? (tokenIn, tokenOut) : (tokenOut, tokenIn);
        address pool = pools[keccak256(abi.encodePacked(t0, t1, fee))];
        require(pool != address(0), "MockQuoter: Pool not registered");

        (uint160 sqrtP, , , , , , ) = IUniswapV3Pool(pool).slot0();
        uint128 L = IUniswapV3Pool(pool).liquidity();
        require(L > 0 && sqrtP > 0, "MockQuoter: Zero pool state");

        uint256 amountInWithFee = (amountIn * (1000000 - fee)) / 1000000;
        bool zeroForOne = (tokenIn == t0);

        if (zeroForOne) {
            uint256 denominator = ((uint256(L) << 96) / uint256(sqrtP)) + amountInWithFee;
            uint256 deltaSqrtP = (amountInWithFee * uint256(sqrtP)) / denominator;
            amountOut = (uint256(L) * deltaSqrtP) >> 96;
        } else {
            uint256 deltaSqrtP = (amountInWithFee << 96) / uint256(L);
            uint256 newSqrtP = uint256(sqrtP) + deltaSqrtP;
            amountOut = (uint256(L) << 96) / sqrtP - (uint256(L) << 96) / newSqrtP;
        }
    }
}
