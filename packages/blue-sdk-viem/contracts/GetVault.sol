// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorpho, Id, MarketParams} from "./interfaces/IMorpho.sol";
import {IERC20Permit, Eip5267Domain} from "./interfaces/IERC20Permit.sol";
import {IMetaMorpho, PendingUint192, PendingAddress} from "./interfaces/IMetaMorpho.sol";
import {IPublicAllocator} from "./interfaces/IPublicAllocator.sol";
import {IMetaMorphoFactory} from "./interfaces/IMetaMorphoFactory.sol";

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
    bool hasLostAssets;
    uint256 lostAssets;
    Id[] supplyQueue;
    Id[] withdrawQueue;
    PublicAllocatorConfig publicAllocatorConfig;
}

error UnknownOfFactory(address factory, address vault);

contract GetVault {
    function query(IMetaMorpho vault, IPublicAllocator publicAllocator, IMetaMorphoFactory metaMorphoFactory)
        external
        view
        returns (VaultResponse memory res)
    {
        if (!metaMorphoFactory.isMetaMorpho(address(vault))) {
            // MetaMorpho factory V1.0 only exists on Ethereum (1) and Base (8453)
            bool isV1_0Factory = (block.chainid == 1 || block.chainid == 8453)
                && IMetaMorphoFactory(0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101).isMetaMorpho(address(vault));

            if (!isV1_0Factory) {
                revert UnknownOfFactory(address(metaMorphoFactory), address(vault));
            }
        }

        res.config = VaultConfig({
            asset: vault.asset(),
            symbol: vault.symbol(),
            name: vault.name(),
            decimals: vault.decimals(),
            decimalsOffset: vault.DECIMALS_OFFSET(),
            eip5267Domain: _queryEip5267Domain(address(vault))
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

        // `lostAssets` only exists on MetaMorpho V1.1; the staticcall reverts on V1.0 vaults,
        // leaving `hasLostAssets` false so the SDK reports `undefined` (matching the multicall path).
        (bool lostAssetsOk, bytes memory lostAssetsData) =
            address(vault).staticcall(abi.encodeWithSignature("lostAssets()"));
        if (lostAssetsOk && lostAssetsData.length >= 32) {
            res.hasLostAssets = true;
            res.lostAssets = abi.decode(lostAssetsData, (uint256));
        }

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

        if (address(publicAllocator) != address(0) && vault.isAllocator(address(publicAllocator))) {
            res.publicAllocatorConfig = PublicAllocatorConfig({
                admin: publicAllocator.admin(address(vault)),
                fee: publicAllocator.fee(address(vault)),
                accruedFee: publicAllocator.accruedFee(address(vault))
            });
        }
    }

    /// @dev Reads the vault's EIP-5267 domain by decoding raw returndata as a tuple.
    /// Decoding the high-level `eip712Domain()` struct return directly hits a Solidity
    /// via-IR decoding regression that reverts on valid domains (same workaround as
    /// `GetToken`). MetaMorpho vaults always implement EIP-5267, so success is required.
    function _queryEip5267Domain(address vault) private view returns (Eip5267Domain memory value) {
        (bool success, bytes memory returnData) = vault.staticcall(abi.encodeCall(IERC20Permit.eip712Domain, ()));
        require(success, "eip712Domain failed");

        (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32 salt,
            uint256[] memory extensions
        ) = abi.decode(returnData, (bytes1, string, string, uint256, address, bytes32, uint256[]));

        value = Eip5267Domain({
            fields: fields,
            name: name,
            version: version,
            chainId: chainId,
            verifyingContract: verifyingContract,
            salt: salt,
            extensions: extensions
        });
    }
}
