// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @title IPoolCallee - Aerodrome / Velodrome Flash Swap Callback Interface
interface IPoolCallee {
    function hook(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
}
