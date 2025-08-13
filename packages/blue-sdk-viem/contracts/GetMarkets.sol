// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorpho, Id, MarketParams, Market} from "./interfaces/IMorpho.sol";
import {IOracle} from "./interfaces/IOracle.sol";
import {IAdaptiveCurveIrm} from "./interfaces/IAdaptiveCurveIrm.sol";
import {MarketResponse} from "./GetMarket.sol";

contract GetMarkets {
    function query(IMorpho morpho, Id[] calldata ids, IAdaptiveCurveIrm adaptiveCurveIrm)
        external
        view
        returns (MarketResponse[] memory res)
    {
        uint256 nbIds = ids.length;

        res = new MarketResponse[](nbIds);

        for (uint256 i = 0; i < nbIds; i++) {
            Id id = ids[i];
            MarketResponse memory resI = res[i];

            resI.marketParams = morpho.idToMarketParams(id);
            resI.market = morpho.market(id);

            if (resI.marketParams.oracle != address(0)) {
                try IOracle(resI.marketParams.oracle).price() returns (uint256 price) {
                    resI.hasPrice = true;
                    resI.price = price;
                } catch {}
            }

            if (resI.marketParams.irm == address(adaptiveCurveIrm)) {
                resI.rateAtTarget = uint256(adaptiveCurveIrm.rateAtTarget(id));
            }
        }
    }
}
