// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IMidnightAdapter {
    function parentVault() external view returns (address);
    function asset() external view returns (address);
    function skimRecipient() external view returns (address);
    function adapterId() external view returns (bytes32);
    function midnight() external view returns (address);
    function maxTtm() external view returns (uint32);
    function minRate() external view returns (uint64);
    function noSalesWithShortfall() external view returns (bool);
    function noSalesBelowFaceValue() external view returns (bool);
    function durations() external view returns (uint256[] memory);
    function durationAllocations(uint256 length) external view returns (uint256[] memory);
    function marketIdsLength() external view returns (uint256);
    function marketIds(uint256 index) external view returns (bytes32);
    function marketData(bytes32 marketId)
        external
        view
        returns (uint128 netCredit, uint64 rate, uint48 maturity, uint8 index, bool forceSellable);
}
