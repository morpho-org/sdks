// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorphoMarketV1Adapter} from "./interfaces/IMorphoMarketV1Adapter.sol";
import {MarketParams} from "../interfaces/IMorpho.sol";

struct VaultV2MorphoMarketV1AdapterResponse {
    address parentVault;
    bytes32 adapterId;
    address skimRecipient;
    MarketParams[] marketParamsList;
}

contract GetVaultV2MorphoMarketV1Adapter {
    function query(IMorphoMarketV1Adapter adapter)
        external
        view
        returns (VaultV2MorphoMarketV1AdapterResponse memory res)
    {
        res.parentVault = adapter.parentVault();
        res.adapterId = adapter.adapterId();
        res.skimRecipient = adapter.skimRecipient();

        uint256 length = adapter.marketParamsListLength();
        res.marketParamsList = new MarketParams[](length);
        for (uint256 i = 0; i < length; i++) {
            (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) =
                adapter.marketParamsList(i);
            res.marketParamsList[i] = MarketParams(loanToken, collateralToken, oracle, irm, lltv);
        }
    }
}
