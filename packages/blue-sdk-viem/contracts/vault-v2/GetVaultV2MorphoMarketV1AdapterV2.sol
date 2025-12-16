// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorphoMarketV1AdapterV2} from "./interfaces/IMorphoMarketV1AdapterV2.sol";
import {MarketParams} from "../interfaces/IMorpho.sol";

struct VaultV2MorphoMarketV1AdapterV2Response {
    address parentVault;
    address skimRecipient;
    address adaptiveCurveIrm;
    bytes32[] marketIds;
    uint256[] supplyShares;
}

contract GetVaultV2MorphoMarketV1AdapterV2 {
    function query(IMorphoMarketV1AdapterV2 adapter)
        external
        view
        returns (VaultV2MorphoMarketV1AdapterV2Response memory res)
    {
        res.parentVault = adapter.parentVault();
        res.skimRecipient = adapter.skimRecipient();
        res.adaptiveCurveIrm = adapter.adaptiveCurveIrm();

        uint256 length = adapter.marketIdsLength();
        res.marketIds = new bytes32[](length);
        res.supplyShares = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 marketId = adapter.marketIds(i);
            res.marketIds[i] = marketId;
            res.supplyShares[i] = adapter.supplyShares(marketId);
        }
    }
}
