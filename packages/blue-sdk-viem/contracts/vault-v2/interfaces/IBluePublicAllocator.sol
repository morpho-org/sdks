// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Morpho Association
pragma solidity ^0.8.0;

interface IBluePublicAllocator {
    function absoluteCap(address vault, bytes32 id) external view returns (uint256);
    function canDeallocate(address vault, bytes32 id) external view returns (bool);
    function isActiveAdapter(address vault, address adapter) external view returns (bool);
    function vaultData(address vault)
        external
        view
        returns (bool canAllocateFromIdle, uint120 nativePenalty, uint120 accruedNativePenalty);
}
