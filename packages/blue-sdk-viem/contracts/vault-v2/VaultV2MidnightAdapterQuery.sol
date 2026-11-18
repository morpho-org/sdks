// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMidnightAdapter} from "./interfaces/IMidnightAdapter.sol";
import {IMidnight} from "./interfaces/IMidnight.sol";

struct MidnightAdapterMarketData {
    uint128 netCredit;
    uint64 netRate;
    uint40 maturity;
    uint8 index;
    bool forceSellable;
    bool forceRemoved;
    uint256 minForceSellPrice;
}

struct MidnightAdapterPosition {
    uint128 credit;
    uint128 pendingFee;
    uint128 lastLossFactor;
    uint128 lastAccrual;
}

struct MidnightAdapterMarketResponse {
    bytes32 id;
    MidnightAdapterMarketData marketData;
    MidnightAdapterPosition position;
    uint128 lossFactor;
    uint128 withdrawable;
}

struct VaultV2MidnightAdapterResponse {
    address parentVault;
    address asset;
    address skimRecipient;
    address midnight;
    address enterGateFactory;
    uint128 maxTtm;
    uint128 minNetBuyRate;
    uint128 maxNetSellRate;
    uint128 shortfallAllowance;
    uint256[] durations;
    uint256[] durationAllocations;
    MidnightAdapterMarketResponse[] markets;
    uint256 timestamp;
}

library VaultV2MidnightAdapterQuery {
    function query(IMidnightAdapter adapter)
        internal
        view
        returns (VaultV2MidnightAdapterResponse memory res)
    {
        res.parentVault = adapter.parentVault();
        res.asset = adapter.asset();
        res.skimRecipient = adapter.skimRecipient();
        res.midnight = adapter.midnight();
        res.enterGateFactory = adapter.enterGateFactory();
        res.maxTtm = adapter.maxTtm();
        res.minNetBuyRate = adapter.minNetBuyRate();
        res.maxNetSellRate = adapter.maxNetSellRate();
        res.shortfallAllowance = adapter.shortfallAllowance();
        res.durations = adapter.durations();
        res.durationAllocations = adapter.durationAllocations(res.durations.length);

        uint256 length = adapter.marketIdsLength();
        res.markets = new MidnightAdapterMarketResponse[](length);
        IMidnight midnight = IMidnight(res.midnight);

        for (uint256 i; i < length; ++i) {
            bytes32 id = adapter.marketIds(i);
            MidnightAdapterMarketData memory marketData;
            (
                marketData.netCredit,
                marketData.netRate,
                marketData.maturity,
                marketData.index,
                marketData.forceSellable,
                marketData.forceRemoved,
                marketData.minForceSellPrice
            ) = adapter.marketData(id);

            MidnightAdapterPosition memory position;
            (
                position.credit,
                position.pendingFee,
                position.lastLossFactor,
                position.lastAccrual,,

            ) = midnight.position(id, address(adapter));
            (, uint128 lossFactor, uint128 withdrawable,,,,,,,,,,) = midnight.marketState(id);

            res.markets[i] = MidnightAdapterMarketResponse({
                id: id,
                marketData: marketData,
                position: position,
                lossFactor: lossFactor,
                withdrawable: withdrawable
            });
        }

        res.timestamp = block.timestamp;
    }
}
