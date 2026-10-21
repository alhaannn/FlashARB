// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IAerodromePool {
    function factory() external view returns (address);
    function stable() external view returns (bool);
}

interface IAerodromeFactory {
    function getFee(address pool, bool stable) external view returns (uint256);
}
