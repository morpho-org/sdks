// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IMidnightAdapterFactory {
    function isMidnightAdapter(address account) external view returns (bool);
}
