// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorpho, Id, MarketParams, Market} from "./interfaces/IMorpho.sol";
import {IOracle} from "./interfaces/IOracle.sol";
import {IAdaptiveCurveIrm} from "./interfaces/IAdaptiveCurveIrm.sol";

struct MarketResponse {
    MarketParams marketParams;
    Market market;
    uint256 price;
    uint256 rateAtTarget;
}

contract GetMarket {
    function query(IMorpho morpho, Id id, IAdaptiveCurveIrm adaptiveCurveIrm)
        external
        view
        returns (MarketResponse memory res)
    {
        res.marketParams = morpho.idToMarketParams(id);
        res.market = morpho.market(id);

        if (res.marketParams.oracle != address(0)) {
            res.price = IOracle(res.marketParams.oracle).price();
        }

        if (res.marketParams.irm == address(adaptiveCurveIrm)) {
            res.rateAtTarget = uint256(adaptiveCurveIrm.rateAtTarget(id));
        }
    }
}