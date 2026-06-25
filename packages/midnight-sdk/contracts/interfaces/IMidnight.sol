// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IMidnight {
    function collateral(bytes32 id, address user, uint256 index) external view returns (uint128);

    function consumed(address user, bytes32 group) external view returns (uint256);

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

    function settlementFee(bytes32 id, uint256 timeToMaturity) external view returns (uint256);
}
