// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IVaultV2} from "./interfaces/IVaultV2.sol";
import {IVaultV2Factory} from "./interfaces/IVaultV2Factory.sol";
import {IMorphoVaultV1AdapterFactory} from "./interfaces/IMorphoVaultV1AdapterFactory.sol";
import {IMorphoMarketV1AdapterFactory} from "./interfaces/IMorphoMarketV1AdapterFactory.sol";
import {IMorphoMarketV1AdapterV2Factory} from "./interfaces/IMorphoMarketV1AdapterV2Factory.sol";
import {IMorphoVaultV1Adapter} from "./interfaces/IMorphoVaultV1Adapter.sol";
import {IMorphoMarketV1Adapter} from "./interfaces/IMorphoMarketV1Adapter.sol";
import {IMorphoMarketV1AdapterV2} from "./interfaces/IMorphoMarketV1AdapterV2.sol";
import {IMorpho, Id, MarketParams, Market, Position} from "../interfaces/IMorpho.sol";
import {IMetaMorpho, MarketConfig, PendingUint192, PendingAddress} from "../interfaces/IMetaMorpho.sol";
import {IOracle} from "../interfaces/IOracle.sol";
import {IAdaptiveCurveIrm} from "../interfaces/IAdaptiveCurveIrm.sol";
import {IERC20} from "../interfaces/IERC20.sol";

error UnknownOfFactory(address factory, address vault);
error UnsupportedVaultV2Adapter(address adapter);

/// @dev Adapter kind resolved on-chain from the configured adapter factories.
enum AdapterType {
    Unknown,
    MorphoVaultV1,
    MorphoMarketV1,
    MorphoMarketV1AdapterV2
}

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

struct MarketResponse {
    MarketParams marketParams;
    Market market;
    bool hasPrice;
    uint256 price;
    uint256 rateAtTarget;
}

/// @dev Minimal MetaMorpho V1 configuration. `eip5267Domain` is intentionally omitted: it is optional
/// on the `Token` entity and never used by any `AccrualVaultV2` capacity or accrual computation.
struct VaultV1Config {
    address asset;
    string symbol;
    string name;
    uint256 decimals;
    uint256 decimalsOffset;
}

/// @dev MetaMorpho V1 governance and accounting state wrapped by a `MorphoVaultV1Adapter`.
/// `publicAllocatorConfig` is intentionally omitted (optional, capacity-irrelevant). `totalAssets` is
/// omitted because `AccrualVault` recomputes it from the sum of allocations' supply assets.
struct VaultV1Response {
    VaultV1Config config;
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
    uint256 lastTotalAssets;
    bool hasLostAssets;
    uint256 lostAssets;
    Id[] supplyQueue;
    Id[] withdrawQueue;
}

/// @dev One MetaMorpho V1 market allocation: cap config, the vault's position, and market state.
/// `publicAllocatorConfig` on the market config is intentionally omitted (optional, capacity-irrelevant).
struct VaultV1MarketAllocation {
    uint256 cap;
    bool enabled;
    uint64 removableAt;
    PendingUint192 pendingCap;
    Position position;
    MarketResponse market;
}

/// @dev One `MorphoMarketV1Adapter` market: the adapter's position and the market state.
struct MarketV1Position {
    Position position;
    MarketResponse market;
}

/// @dev One `MorphoMarketV1AdapterV2` market: the adapter's supply shares and the market state.
struct MarketV1V2Allocation {
    bytes32 marketId;
    uint256 supplyShares;
    MarketResponse market;
}

/// @dev Full accrued state for one VaultV2 adapter. Only the branch matching `adapterType` is populated.
struct AdapterResponse {
    address adapter;
    uint8 adapterType;
    address parentVault;
    address skimRecipient;
    uint256 forceDeallocatePenalty;
    // AdapterType.MorphoVaultV1
    address morphoVaultV1;
    VaultV1Response vaultV1;
    VaultV1MarketAllocation[] vaultV1Allocations;
    uint256 vaultV1Shares;
    // AdapterType.MorphoMarketV1
    MarketV1Position[] marketV1Positions;
    // AdapterType.MorphoMarketV1AdapterV2
    address adaptiveCurveIrm;
    MarketV1V2Allocation[] marketV1V2Allocations;
}

struct AccrualVaultV2Response {
    Token token;
    address asset;
    uint128 _totalAssets;
    uint256 totalSupply;
    uint256 virtualShares;
    uint64 maxRate;
    uint64 lastUpdate;
    address liquidityAdapter;
    bytes liquidityData;
    bool isLiquidityAdapterKnown;
    VaultV2Allocation[] liquidityAllocations;
    uint96 performanceFee;
    uint96 managementFee;
    address performanceFeeRecipient;
    address managementFeeRecipient;
    uint256 assetBalance;
    bool hasLiquidityAdapter;
    AdapterResponse liquidityAdapterInfo;
    AdapterResponse[] adapters;
}

/// @dev Aggregates the full `AccrualVaultV2` tree — VaultV2 accounting, liquidity caps, asset balance,
/// force-deallocate penalties, and every adapter's deep accrual state (including nested MetaMorpho V1
/// vaults and Morpho Blue markets) — into a single deployless read.
contract GetAccrualVaultV2 {
    function query(
        IVaultV2 vault,
        IVaultV2Factory vaultV2Factory,
        IMorphoVaultV1AdapterFactory morphoVaultV1AdapterFactory,
        IMorphoMarketV1AdapterFactory morphoMarketV1AdapterFactory,
        IMorphoMarketV1AdapterV2Factory morphoMarketV1AdapterV2Factory,
        IMorpho morpho,
        IAdaptiveCurveIrm adaptiveCurveIrm
    ) external view returns (AccrualVaultV2Response memory res) {
        if (!vaultV2Factory.isVaultV2(address(vault))) {
            revert UnknownOfFactory(address(vaultV2Factory), address(vault));
        }

        res.token =
            Token({asset: vault.asset(), symbol: vault.symbol(), name: vault.name(), decimals: vault.decimals()});
        res.asset = vault.asset();
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
        res.assetBalance = IERC20(res.asset).balanceOf(address(vault));

        _queryLiquidityAllocations(
            res, vault, morphoVaultV1AdapterFactory, morphoMarketV1AdapterV2Factory
        );

        if (res.liquidityAdapter != address(0)) {
            res.hasLiquidityAdapter = true;
            res.liquidityAdapterInfo = _queryAdapter(
                vault,
                res.liquidityAdapter,
                morphoVaultV1AdapterFactory,
                morphoMarketV1AdapterFactory,
                morphoMarketV1AdapterV2Factory,
                morpho,
                adaptiveCurveIrm
            );
        }

        uint256 adaptersLength = vault.adaptersLength();
        res.adapters = new AdapterResponse[](adaptersLength);
        for (uint256 i; i < adaptersLength; ++i) {
            res.adapters[i] = _queryAdapter(
                vault,
                vault.adapters(i),
                morphoVaultV1AdapterFactory,
                morphoMarketV1AdapterFactory,
                morphoMarketV1AdapterV2Factory,
                morpho,
                adaptiveCurveIrm
            );
        }
    }

    /// @dev Computes the configured liquidity adapter's cap allocations, mirroring `GetVaultV2`.
    function _queryLiquidityAllocations(
        AccrualVaultV2Response memory res,
        IVaultV2 vault,
        IMorphoVaultV1AdapterFactory morphoVaultV1AdapterFactory,
        IMorphoMarketV1AdapterV2Factory morphoMarketV1AdapterV2Factory
    ) private view {
        bool isMorphoVaultV1Adapter = address(morphoVaultV1AdapterFactory) != address(0)
            && morphoVaultV1AdapterFactory.isMorphoVaultV1Adapter(res.liquidityAdapter);
        bool isMorphoMarketV1AdapterV2 = address(morphoMarketV1AdapterV2Factory) != address(0)
            && morphoMarketV1AdapterV2Factory.isMorphoMarketV1AdapterV2(res.liquidityAdapter);

        if (isMorphoVaultV1Adapter && res.liquidityData.length > 0) {
            revert UnsupportedVaultV2Adapter(res.liquidityAdapter);
        }

        res.isLiquidityAdapterKnown = isMorphoVaultV1Adapter || isMorphoMarketV1AdapterV2;

        if (isMorphoVaultV1Adapter) {
            res.liquidityAllocations = new VaultV2Allocation[](1);
            res.liquidityAllocations[0] = VaultV2Allocation({
                id: keccak256(abi.encode("this", res.liquidityAdapter)),
                absoluteCap: 0,
                relativeCap: 0,
                allocation: 0
            });
        } else if (isMorphoMarketV1AdapterV2) {
            MarketParams memory marketParams = abi.decode(res.liquidityData, (MarketParams));
            bytes32[] memory ids = IMorphoMarketV1AdapterV2(res.liquidityAdapter).ids(marketParams);

            res.liquidityAllocations = new VaultV2Allocation[](ids.length);
            for (uint256 i; i < ids.length; ++i) {
                res.liquidityAllocations[i] =
                    VaultV2Allocation({id: ids[i], absoluteCap: 0, relativeCap: 0, allocation: 0});
            }
        }

        uint256 liquidityAllocationsLength = res.liquidityAllocations.length;
        for (uint256 i; i < liquidityAllocationsLength; ++i) {
            VaultV2Allocation memory allocation = res.liquidityAllocations[i];

            allocation.absoluteCap = vault.absoluteCap(allocation.id);
            allocation.relativeCap = vault.relativeCap(allocation.id);
            allocation.allocation = vault.allocation(allocation.id);
        }
    }

    /// @dev Resolves one adapter's type via the configured factories and reads its full accrued state.
    function _queryAdapter(
        IVaultV2 parentVault,
        address adapter,
        IMorphoVaultV1AdapterFactory morphoVaultV1AdapterFactory,
        IMorphoMarketV1AdapterFactory morphoMarketV1AdapterFactory,
        IMorphoMarketV1AdapterV2Factory morphoMarketV1AdapterV2Factory,
        IMorpho morpho,
        IAdaptiveCurveIrm adaptiveCurveIrm
    ) private view returns (AdapterResponse memory res) {
        res.adapter = adapter;
        res.forceDeallocatePenalty = parentVault.forceDeallocatePenalty(adapter);

        if (
            address(morphoVaultV1AdapterFactory) != address(0)
                && morphoVaultV1AdapterFactory.isMorphoVaultV1Adapter(adapter)
        ) {
            res.adapterType = uint8(AdapterType.MorphoVaultV1);
            IMorphoVaultV1Adapter typed = IMorphoVaultV1Adapter(adapter);
            res.parentVault = typed.parentVault();
            res.skimRecipient = typed.skimRecipient();
            res.morphoVaultV1 = typed.morphoVaultV1();

            IMetaMorpho vaultV1 = IMetaMorpho(res.morphoVaultV1);
            res.vaultV1 = _queryVaultV1(vaultV1);

            uint256 length = res.vaultV1.withdrawQueue.length;
            res.vaultV1Allocations = new VaultV1MarketAllocation[](length);
            for (uint256 i; i < length; ++i) {
                res.vaultV1Allocations[i] =
                    _queryVaultV1Allocation(vaultV1, res.vaultV1.withdrawQueue[i], morpho, adaptiveCurveIrm);
            }

            res.vaultV1Shares = IERC20(res.morphoVaultV1).balanceOf(adapter);
        } else if (
            address(morphoMarketV1AdapterFactory) != address(0)
                && morphoMarketV1AdapterFactory.isMorphoMarketV1Adapter(adapter)
        ) {
            res.adapterType = uint8(AdapterType.MorphoMarketV1);
            IMorphoMarketV1Adapter typed = IMorphoMarketV1Adapter(adapter);
            res.parentVault = typed.parentVault();
            res.skimRecipient = typed.skimRecipient();

            uint256 length = typed.marketParamsListLength();
            res.marketV1Positions = new MarketV1Position[](length);
            for (uint256 i; i < length; ++i) {
                Id id = _id(typed.marketParamsList(i));
                res.marketV1Positions[i].position = morpho.position(id, adapter);
                res.marketV1Positions[i].market = _queryMarket(morpho, id, adaptiveCurveIrm);
            }
        } else if (
            address(morphoMarketV1AdapterV2Factory) != address(0)
                && morphoMarketV1AdapterV2Factory.isMorphoMarketV1AdapterV2(adapter)
        ) {
            res.adapterType = uint8(AdapterType.MorphoMarketV1AdapterV2);
            IMorphoMarketV1AdapterV2 typed = IMorphoMarketV1AdapterV2(adapter);
            res.parentVault = typed.parentVault();
            res.skimRecipient = typed.skimRecipient();
            res.adaptiveCurveIrm = typed.adaptiveCurveIrm();

            uint256 length = typed.marketIdsLength();
            res.marketV1V2Allocations = new MarketV1V2Allocation[](length);
            for (uint256 i; i < length; ++i) {
                bytes32 marketId = typed.marketIds(i);
                res.marketV1V2Allocations[i].marketId = marketId;
                res.marketV1V2Allocations[i].supplyShares = typed.supplyShares(marketId);
                res.marketV1V2Allocations[i].market = _queryMarket(morpho, Id.wrap(marketId), adaptiveCurveIrm);
            }
        } else {
            revert UnsupportedVaultV2Adapter(adapter);
        }
    }

    /// @dev Reads a MetaMorpho V1 vault's governance, accounting, and queue state.
    function _queryVaultV1(IMetaMorpho vault) private view returns (VaultV1Response memory res) {
        res.config = VaultV1Config({
            asset: vault.asset(),
            symbol: vault.symbol(),
            name: vault.name(),
            decimals: vault.decimals(),
            decimalsOffset: vault.DECIMALS_OFFSET()
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
        res.lastTotalAssets = vault.lastTotalAssets();

        // `lostAssets` only exists on MetaMorpho V1.1; the staticcall reverts on V1.0 vaults, leaving
        // `hasLostAssets` false so the SDK reports `undefined` (matching the multicall path).
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
    }

    /// @dev Reads one MetaMorpho V1 market allocation: cap config, the vault's position, and market state.
    function _queryVaultV1Allocation(IMetaMorpho vault, Id id, IMorpho morpho, IAdaptiveCurveIrm adaptiveCurveIrm)
        private
        view
        returns (VaultV1MarketAllocation memory res)
    {
        MarketConfig memory config = vault.config(id);
        res.cap = config.cap;
        res.enabled = config.enabled;
        res.removableAt = config.removableAt;
        res.pendingCap = vault.pendingCap(id);
        res.position = morpho.position(id, address(vault));
        res.market = _queryMarket(morpho, id, adaptiveCurveIrm);
    }

    /// @dev Reads a Morpho Blue market's params, accounting, oracle price, and adaptive IRM rate.
    function _queryMarket(IMorpho morpho, Id id, IAdaptiveCurveIrm adaptiveCurveIrm)
        private
        view
        returns (MarketResponse memory res)
    {
        res.marketParams = morpho.idToMarketParams(id);
        res.market = morpho.market(id);

        if (res.marketParams.oracle != address(0)) {
            try IOracle(res.marketParams.oracle).price() returns (uint256 price) {
                res.hasPrice = true;
                res.price = price;
            } catch {}
        }

        if (res.marketParams.irm == address(adaptiveCurveIrm)) {
            res.rateAtTarget = uint256(adaptiveCurveIrm.rateAtTarget(id));
        }
    }

    /// @dev Morpho Blue market id: keccak256 of the ABI-encoded market params (5 static words).
    function _id(MarketParams memory marketParams) private pure returns (Id) {
        return Id.wrap(keccak256(abi.encode(marketParams)));
    }
}
