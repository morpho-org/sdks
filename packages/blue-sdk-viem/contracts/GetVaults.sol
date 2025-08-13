// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorpho, Id, MarketParams} from "./interfaces/IMorpho.sol";
import {Eip5267Domain} from "./interfaces/IERC20Permit.sol";
import {IMetaMorpho, PendingUint192, PendingAddress} from "./interfaces/IMetaMorpho.sol";
import {IPublicAllocator} from "./interfaces/IPublicAllocator.sol";
import {VaultConfig, PublicAllocatorConfig, VaultResponse} from "./GetVault.sol";

contract GetVaults {
    function query(IMetaMorpho[] calldata vaults, IPublicAllocator publicAllocator)
        external
        view
        returns (VaultResponse[] memory res)
    {
        uint256 nbVaults = vaults.length;

        res = new VaultResponse[](nbVaults);

        for (uint256 j = 0; j < nbVaults; j++) {
            IMetaMorpho vault = vaults[j];
            VaultResponse memory resI = res[j];

            resI.config = VaultConfig({
                vault: address(vault),
                asset: vault.asset(),
                symbol: vault.symbol(),
                name: vault.name(),
                decimals: vault.decimals(),
                decimalsOffset: vault.DECIMALS_OFFSET(),
                eip5267Domain: vault.eip712Domain()
            });

            resI.owner = vault.owner();
            resI.curator = vault.curator();
            resI.guardian = vault.guardian();
            resI.timelock = vault.timelock();
            resI.pendingTimelock = vault.pendingTimelock();
            resI.pendingGuardian = vault.pendingGuardian();
            resI.pendingOwner = vault.pendingOwner();
            resI.fee = vault.fee();
            resI.feeRecipient = vault.feeRecipient();
            resI.skimRecipient = vault.skimRecipient();
            resI.totalSupply = vault.totalSupply();
            resI.totalAssets = vault.totalAssets();
            resI.lastTotalAssets = vault.lastTotalAssets();

            uint256 supplyQueueLength = vault.supplyQueueLength();
            resI.supplyQueue = new Id[](supplyQueueLength);
            for (uint256 i; i < supplyQueueLength; ++i) {
                resI.supplyQueue[i] = vault.supplyQueue(i);
            }

            uint256 withdrawQueueLength = vault.withdrawQueueLength();
            resI.withdrawQueue = new Id[](withdrawQueueLength);
            for (uint256 i; i < withdrawQueueLength; ++i) {
                resI.withdrawQueue[i] = vault.withdrawQueue(i);
            }

            if (address(publicAllocator) != address(0) && vault.isAllocator(address(publicAllocator))) {
                resI.publicAllocatorConfig = PublicAllocatorConfig({
                    admin: publicAllocator.admin(address(vault)),
                    fee: publicAllocator.fee(address(vault)),
                    accruedFee: publicAllocator.accruedFee(address(vault))
                });
            }
        }
    }
}
