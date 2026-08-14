// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IBluePublicAllocator} from "./interfaces/IBluePublicAllocator.sol";
import {IVaultV2} from "./interfaces/IVaultV2.sol";

struct VaultV2MarketPublicAllocatorRequest {
    address adapter;
    bytes32 marketParamsId;
}

struct VaultV2MarketPublicAllocatorResponse {
    address adapter;
    bytes32 marketParamsId;
    uint256 absoluteCap;
    bool canPullFromMarket;
    bool isActiveAdapter;
}

struct VaultV2AllocationResponse {
    bytes32 id;
    uint256 absoluteCap;
    uint256 relativeCap;
    uint256 allocation;
}

struct VaultV2PublicAllocatorResponse {
    bool canPullFromIdle;
    uint64 penalty;
    VaultV2MarketPublicAllocatorResponse[] marketConfigs;
    VaultV2AllocationResponse[] allocations;
}

contract GetVaultV2PublicAllocatorConfig {
    function query(
        IBluePublicAllocator allocator,
        IVaultV2 vault,
        VaultV2MarketPublicAllocatorRequest[] calldata marketRequests,
        bytes32[] calldata allocationIds
    ) external view returns (VaultV2PublicAllocatorResponse memory res) {
        (res.canPullFromIdle, res.penalty) = allocator.vaultData(address(vault));

        uint256 marketRequestsLength = marketRequests.length;
        res.marketConfigs = new VaultV2MarketPublicAllocatorResponse[](marketRequestsLength);
        for (uint256 i; i < marketRequestsLength; ++i) {
            VaultV2MarketPublicAllocatorRequest calldata request = marketRequests[i];
            res.marketConfigs[i] = VaultV2MarketPublicAllocatorResponse({
                adapter: request.adapter,
                marketParamsId: request.marketParamsId,
                absoluteCap: allocator.absoluteCap(address(vault), request.marketParamsId),
                canPullFromMarket: allocator.canPullFromMarket(address(vault), request.marketParamsId),
                isActiveAdapter: allocator.isActiveAdapter(address(vault), request.adapter)
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
