// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IMidnight {
    function position(bytes32 id, address user)
        external
        view
        returns (
            uint128 credit,
            uint128 pendingFee,
            uint128 lastLossFactor,
            uint128 lastAccrual,
            uint128 debt,
            uint128 collateralBitmap
        );

    function marketState(bytes32 id)
        external
        view
        returns (
            uint128 totalUnits,
            uint128 lossFactor,
            uint128 withdrawable,
            uint128 continuousFeeCredit,
            uint16 settlementFeeCbp0,
            uint16 settlementFeeCbp1,
            uint16 settlementFeeCbp2,
            uint16 settlementFeeCbp3,
            uint16 settlementFeeCbp4,
            uint16 settlementFeeCbp5,
            uint16 settlementFeeCbp6,
            uint32 continuousFee,
            uint8 tickSpacing
        );
}
