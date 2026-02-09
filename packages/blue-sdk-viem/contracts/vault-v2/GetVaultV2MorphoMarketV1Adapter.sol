// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorphoMarketV1Adapter} from "./interfaces/IMorphoMarketV1Adapter.sol";
import {MarketParams} from "../interfaces/IMorpho.sol";
import {IMorphoMarketV1AdapterFactory} from "./interfaces/IMorphoMarketV1AdapterFactory.sol";

struct VaultV2MorphoMarketV1AdapterResponse {
    address parentVault;
    address skimRecipient;
    MarketParams[] marketParamsList;
}

error UnknownOfFactory(address factory, address adapter);

contract GetVaultV2MorphoMarketV1Adapter {
    function query(IMorphoMarketV1Adapter adapter, IMorphoMarketV1AdapterFactory factory)
        external
        view
        returns (VaultV2MorphoMarketV1AdapterResponse memory res)
    {
        if (!factory.isMorphoMarketV1Adapter(address(adapter))) {
            revert UnknownOfFactory(address(factory), address(adapter));
        }

        res.parentVault = adapter.parentVault();
        res.skimRecipient = adapter.skimRecipient();

        uint256 length = adapter.marketParamsListLength();
        res.marketParamsList = new MarketParams[](length);
        for (uint256 i = 0; i < length; i++) {
            res.marketParamsList[i] = adapter.marketParamsList(i);
        }
    }
}
