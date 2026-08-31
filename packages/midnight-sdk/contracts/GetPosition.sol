// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMidnight} from "./interfaces/IMidnight.sol";

uint256 constant MAX_COLLATERALS = 128;

struct PositionResponse {
    uint128 credit;
    uint128 pendingFee;
    uint128 lastLossFactor;
    uint128 lastAccrual;
    uint128 debt;
    uint128 collateralBitmap;
    uint128[MAX_COLLATERALS] collateral;
}

contract GetPosition {
    function query(IMidnight midnight, bytes32 id, address user) external view returns (PositionResponse memory res) {
        (
            res.credit,
            res.pendingFee,
            res.lastLossFactor,
            res.lastAccrual,
            res.debt,
            res.collateralBitmap
        ) = midnight.position(id, user);

        for (uint256 i; i < MAX_COLLATERALS; ++i) {
            res.collateral[i] = midnight.collateral(id, user, i);
        }
    }
}
