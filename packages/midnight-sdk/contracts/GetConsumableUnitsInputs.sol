// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMidnight} from "./interfaces/IMidnight.sol";

struct ConsumableUnitsInputsResponse {
    uint256 consumed;
    uint256 settlementFee;
}

contract GetConsumableUnitsInputs {
    function query(
        IMidnight midnight,
        bytes32 id,
        address user,
        bytes32 group,
        uint256 timeToMaturity,
        bool fetchSettlementFee
    ) external view returns (ConsumableUnitsInputsResponse memory res) {
        res.consumed = midnight.consumed(user, group);

        if (fetchSettlementFee) {
            res.settlementFee = midnight.settlementFee(id, timeToMaturity);
        }
    }
}
