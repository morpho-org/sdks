// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IIdentityRegistry {
    function isVerified(address userAddress) external view returns (bool);
}
