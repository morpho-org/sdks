// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

/// @dev Subset of morpho-org/vault-v2@e7821fd `IMidnightAdapter` read by the deployless queries.
interface IMidnightAdapter {
    function parentVault() external view returns (address);
    function asset() external view returns (address);
    function skimRecipient() external view returns (address);
    function midnight() external view returns (address);
    function enterGateFactory() external view returns (address);
    function maxTtm() external view returns (uint128);
    function minNetBuyRate() external view returns (uint128);
    function maxNetSellRate() external view returns (uint128);
    function shortfallAllowance() external view returns (uint128);
    function durations() external view returns (uint256[] memory);
    function durationAllocations(uint256 length) external view returns (uint256[] memory);
    function marketIdsLength() external view returns (uint256);
    function marketIds(uint256 index) external view returns (bytes32);
    function marketData(bytes32 marketId)
        external
        view
        returns (
            uint128 netCredit,
            uint64 netRate,
            uint40 maturity,
            uint8 index,
            bool forceSellable,
            bool forceRemoved,
            uint256 minForceSellPrice
        );
}
