import { parseAbi } from "viem";

/** Morpho Blue methods exercised by the Market integration test. */
export const blueAbi = parseAbi([
  "function accrueInterest((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams)",
  "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function owner() view returns (address)",
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
  "function setFee((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 newFee)",
  "function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)",
  "function supplyCollateral((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, address onBehalf, bytes data)",
]);

/** AdaptiveCurveIRM method used to read market rates at target. */
export const adaptiveCurveIrmAbi = parseAbi([
  "function rateAtTarget(bytes32 id) view returns (int256)",
]);

/** Morpho Blue oracle method used to read market prices. */
export const blueOracleAbi = parseAbi([
  "function price() view returns (uint256)",
]);
