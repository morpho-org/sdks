// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IVaultV2, Caps} from "./interfaces/IVaultV2.sol";
import {IMorphoVaultV1AdapterFactory} from "./interfaces/IMorphoVaultV1AdapterFactory.sol";
import {IMorphoMarketV1AdapterV2Factory} from "./interfaces/IMorphoMarketV1AdapterV2Factory.sol";
import {IVaultV2Factory} from "./interfaces/IVaultV2Factory.sol";

error UnknownFromFactory(address factory, address vault);

struct Token {
    address asset;
    string symbol;
    string name;
    uint256 decimals;
}

struct VaultV2Allocation {
    bytes32 id;
    uint256 absoluteCap;
    uint256 relativeCap;
    uint256 allocation;
}

struct VaultV2Response {
    Token token;
    address asset;
    uint256 totalAssets;
    uint128 _totalAssets;
    uint256 totalSupply;
    uint256 virtualShares;
    uint64 maxRate;
    uint64 lastUpdate;
    address[] adapters;
    address liquidityAdapter;
    bytes liquidityData;
    bool isLiquidityAdapterKnown;
    VaultV2Allocation[] liquidityAllocations;
    uint96 performanceFee;
    uint96 managementFee;
    address performanceFeeRecipient;
    address managementFeeRecipient;
}

contract GetVaultV2 {
    function query(
        IVaultV2 vault,
        IVaultV2Factory vaultV2Factory,
        IMorphoVaultV1AdapterFactory morphoVaultV1AdapterFactory,
        IMorphoMarketV1AdapterV2Factory morphoMarketV1AdapterV2Factory
    ) external view returns (VaultV2Response memory res) {
        if (!vaultV2Factory.isVaultV2(address(vault))) {
            revert UnknownFromFactory(address(vaultV2Factory), address(vault));
        }

        res.token =
            Token({asset: vault.asset(), symbol: vault.symbol(), name: vault.name(), decimals: vault.decimals()});
        res.asset = vault.asset();
        res.totalAssets = vault.totalAssets();
        res._totalAssets = vault._totalAssets();
        res.totalSupply = vault.totalSupply();
        res.virtualShares = vault.virtualShares();
        res.maxRate = vault.maxRate();
        res.lastUpdate = vault.lastUpdate();
        res.liquidityAdapter = vault.liquidityAdapter();
        res.liquidityData = vault.liquidityData();
        res.performanceFee = vault.performanceFee();
        res.managementFee = vault.managementFee();
        res.performanceFeeRecipient = vault.performanceFeeRecipient();
        res.managementFeeRecipient = vault.managementFeeRecipient();

        uint256 adaptersLength = vault.adaptersLength();
        res.adapters = new address[](adaptersLength);
        for (uint256 i; i < adaptersLength; ++i) {
            res.adapters[i] = vault.adapters(i);
        }

        if (
            address(morphoVaultV1AdapterFactory) != address(0)
                && morphoVaultV1AdapterFactory.isMorphoVaultV1Adapter(res.liquidityAdapter)
        ) {
            res.isLiquidityAdapterKnown = true;
        } else if (
            address(morphoMarketV1AdapterV2Factory) != address(0)
                && morphoMarketV1AdapterV2Factory.isMorphoMarketV1AdapterV2(res.liquidityAdapter)
        ) {
            res.isLiquidityAdapterKnown = true;
        }

        if (res.isLiquidityAdapterKnown) {
            res.liquidityAllocations = new VaultV2Allocation[](1);
            res.liquidityAllocations[0] = VaultV2Allocation({
                id: keccak256(abi.encode("this", res.liquidityAdapter)),
                absoluteCap: 0,
                relativeCap: 0,
                allocation: 0
            });
        }

        uint256 liquidityAllocationsLength = res.liquidityAllocations.length;
        for (uint256 i; i < liquidityAllocationsLength; ++i) {
            VaultV2Allocation memory allocation = res.liquidityAllocations[i];

            allocation.absoluteCap = vault.absoluteCap(allocation.id);
            allocation.relativeCap = vault.relativeCap(allocation.id);
            allocation.allocation = vault.allocation(allocation.id);
        }
    }
}
