// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

struct VaultData {
    bool canAllocateFromIdle;
    uint120 nativePenalty;
    uint120 accruedNativePenalty;
}

/// @dev Stateful EVM fixture for exercising BluePublicAllocator read paths on an Anvil fork.
contract BluePublicAllocatorReadFixture {
    mapping(address vault => mapping(bytes32 id => uint256)) public absoluteCap;
    mapping(address vault => mapping(bytes32 id => bool)) public canDeallocate;
    mapping(address vault => mapping(address adapter => bool)) public isActiveAdapter;
    mapping(address vault => VaultData) public vaultData;

    function setAbsoluteCap(address vault, bytes32 id, uint256 value) external {
        absoluteCap[vault][id] = value;
    }

    function setCanDeallocate(address vault, bytes32 id, bool value) external {
        canDeallocate[vault][id] = value;
    }

    function setIsActiveAdapter(address vault, address adapter, bool value) external {
        isActiveAdapter[vault][adapter] = value;
    }

    function setVaultData(address vault, bool canAllocateFromIdle, uint120 nativePenalty) external {
        vaultData[vault] = VaultData(canAllocateFromIdle, nativePenalty, 0);
    }
}
