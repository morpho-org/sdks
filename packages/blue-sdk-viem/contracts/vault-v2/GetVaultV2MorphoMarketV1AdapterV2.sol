// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorphoMarketV1AdapterV2} from "./interfaces/IMorphoMarketV1AdapterV2.sol";
import {IMorphoMarketV1AdapterV2Factory} from "./interfaces/IMorphoMarketV1AdapterV2Factory.sol";

struct MarketSupplyShares {
    bytes32 marketId;
    uint256 supplyShares;
}

struct VaultV2MorphoMarketV1AdapterV2Response {
    address parentVault;
    address skimRecipient;
    address adaptiveCurveIrm;
    MarketSupplyShares[] marketSupplyShares;
}

error UnknownOfFactory(address factory, address adapter);

contract GetVaultV2MorphoMarketV1AdapterV2 {
    function query(IMorphoMarketV1AdapterV2 adapter, IMorphoMarketV1AdapterV2Factory factory)
        external
        view
        returns (VaultV2MorphoMarketV1AdapterV2Response memory res)
    {
        if (!factory.isMorphoMarketV1AdapterV2(address(adapter))) {
            revert UnknownOfFactory(address(factory), address(adapter));
        }

        res.parentVault = adapter.parentVault();
        res.skimRecipient = adapter.skimRecipient();
        res.adaptiveCurveIrm = adapter.adaptiveCurveIrm();

        uint256 length = adapter.marketIdsLength();
        res.marketSupplyShares = new MarketSupplyShares[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 marketId = adapter.marketIds(i);
            res.marketSupplyShares[i] = MarketSupplyShares(marketId, adapter.supplyShares(marketId));
        }
    }
}
