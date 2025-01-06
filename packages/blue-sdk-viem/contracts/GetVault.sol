// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorpho, Id, MarketParams} from "./interfaces/IMorpho.sol";
import {Eip5267Domain} from "./interfaces/IERC20Permit.sol";
import {IMetaMorpho, PendingUint192, PendingAddress} from "./interfaces/IMetaMorpho.sol";
import {IPublicAllocator} from "./interfaces/IPublicAllocator.sol";

struct VaultConfig {
    address asset;
    string symbol;
    string name;
    uint256 decimals;
    uint256 decimalsOffset;
    Eip5267Domain eip5267Domain;
}

struct PublicAllocatorConfig {
    address admin;
    uint256 fee;
    uint256 accruedFee;
}

struct VaultResponse {
    VaultConfig config;
    address owner;
    address curator;
    address guardian;
    uint256 timelock;
    PendingUint192 pendingTimelock;
    PendingAddress pendingGuardian;
    address pendingOwner;
    uint256 fee;
    address feeRecipient;
    address skimRecipient;
    uint256 totalSupply;
    uint256 totalAssets;
    uint256 lastTotalAssets;
    Id[] supplyQueue;
    Id[] withdrawQueue;
    PublicAllocatorConfig publicAllocatorConfig;
}

contract GetVault {
    function query(IMetaMorpho vault, IPublicAllocator publicAllocator)
        external
        view
        returns (VaultResponse memory res)
    {
        res.config = VaultConfig({
            asset: vault.asset(),
            symbol: vault.symbol(),
            name: vault.name(),
            decimals: vault.decimals(),
            decimalsOffset: vault.DECIMALS_OFFSET(),
            eip5267Domain: vault.eip712Domain()
        });

        res.owner = vault.owner();
        res.curator = vault.curator();
        res.guardian = vault.guardian();
        res.timelock = vault.timelock();
        res.pendingTimelock = vault.pendingTimelock();
        res.pendingGuardian = vault.pendingGuardian();
        res.pendingOwner = vault.pendingOwner();
        res.fee = vault.fee();
        res.feeRecipient = vault.feeRecipient();
        res.skimRecipient = vault.skimRecipient();
        res.totalSupply = vault.totalSupply();
        res.totalAssets = vault.totalAssets();
        res.lastTotalAssets = vault.lastTotalAssets();

        uint256 supplyQueueLength = vault.supplyQueueLength();
        res.supplyQueue = new Id[](supplyQueueLength);
        for (uint256 i; i < supplyQueueLength; ++i) {
            res.supplyQueue[i] = vault.supplyQueue(i);
        }

        uint256 withdrawQueueLength = vault.withdrawQueueLength();
        res.withdrawQueue = new Id[](withdrawQueueLength);
        for (uint256 i; i < withdrawQueueLength; ++i) {
            res.withdrawQueue[i] = vault.withdrawQueue(i);
        }

        if (vault.isAllocator(address(publicAllocator))) {
            res.publicAllocatorConfig = PublicAllocatorConfig({
                admin: publicAllocator.admin(address(vault)),
                fee: publicAllocator.fee(address(vault)),
                accruedFee: publicAllocator.accruedFee(address(vault))
            });
        }
    }
}
