// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

/// @dev Subset of morpho-org/vault-v2@e7821fd `IMidnightAdapterFactory` read by the deployless queries.
interface IMidnightAdapterFactory {
    function isCreated(address account) external view returns (bool);
}
