// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IBluePublicAllocator} from "./interfaces/IBluePublicAllocator.sol";
import {IVaultV2} from "./interfaces/IVaultV2.sol";

struct VaultV2BlueMarketPublicAllocatorRequest {
    address adapter;
    bytes32 adapterMarketCapId;
}

struct VaultV2BlueMarketPublicAllocatorResponse {
    address adapter;
    bytes32 adapterMarketCapId;
    uint256 absoluteCap;
    bool canPullFromMarket;
}

struct VaultV2AllocationResponse {
    bytes32 id;
    uint256 absoluteCap;
    uint256 relativeCap;
    uint256 allocation;
}

struct VaultV2BluePublicAllocatorResponse {
    bool isAllocator;
    bool canPullFromIdle;
    uint64 penalty;
    bool[] isActiveAdapters;
    VaultV2BlueMarketPublicAllocatorResponse[] marketConfigs;
    VaultV2AllocationResponse[] allocations;
}

contract GetVaultV2BluePublicAllocatorConfig {
    function query(
        IBluePublicAllocator allocator,
        IVaultV2 vault,
        address[] calldata adapters,
        VaultV2BlueMarketPublicAllocatorRequest[] calldata marketRequests,
        bytes32[] calldata allocationIds
    ) external view returns (VaultV2BluePublicAllocatorResponse memory res) {
        res.isAllocator = vault.isAllocator(address(allocator));
        (res.canPullFromIdle, res.penalty) = allocator.vaultData(address(vault));

        uint256 adaptersLength = adapters.length;
        res.isActiveAdapters = new bool[](adaptersLength);
        for (uint256 i; i < adaptersLength; ++i) {
            res.isActiveAdapters[i] = allocator.isActiveAdapter(address(vault), adapters[i]);
        }

        uint256 marketRequestsLength = marketRequests.length;
        res.marketConfigs = new VaultV2BlueMarketPublicAllocatorResponse[](marketRequestsLength);
        for (uint256 i; i < marketRequestsLength; ++i) {
            VaultV2BlueMarketPublicAllocatorRequest calldata request = marketRequests[i];
            res.marketConfigs[i] = VaultV2BlueMarketPublicAllocatorResponse({
                adapter: request.adapter,
                adapterMarketCapId: request.adapterMarketCapId,
                absoluteCap: allocator.absoluteCap(address(vault), request.adapterMarketCapId),
                canPullFromMarket: allocator.canPullFromMarket(address(vault), request.adapterMarketCapId)
            });
        }

        uint256 allocationIdsLength = allocationIds.length;
        res.allocations = new VaultV2AllocationResponse[](allocationIdsLength);
        for (uint256 i; i < allocationIdsLength; ++i) {
            bytes32 id = allocationIds[i];
            res.allocations[i] = VaultV2AllocationResponse({
                id: id,
                absoluteCap: vault.absoluteCap(id),
                relativeCap: vault.relativeCap(id),
                allocation: vault.allocation(id)
            });
        }
    }
}
