import { parseAbi } from "viem";

const collateralParamsComponents = [
  { name: "token", type: "address" },
  { name: "lltv", type: "uint256" },
  { name: "maxLif", type: "uint256" },
  { name: "oracle", type: "address" },
] as const;

const marketComponents = [
  { name: "loanToken", type: "address" },
  {
    name: "collateralParams",
    type: "tuple[]",
    components: collateralParamsComponents,
  },
  { name: "maturity", type: "uint256" },
  { name: "rcfThreshold", type: "uint256" },
  { name: "enterGate", type: "address" },
  { name: "liquidatorGate", type: "address" },
] as const;

const offerComponents = [
  { name: "market", type: "tuple", components: marketComponents },
  { name: "buy", type: "bool" },
  { name: "maker", type: "address" },
  { name: "start", type: "uint256" },
  { name: "expiry", type: "uint256" },
  { name: "tick", type: "uint256" },
  { name: "group", type: "bytes32" },
  { name: "callback", type: "address" },
  { name: "callbackData", type: "bytes" },
  { name: "receiverIfMakerIsSeller", type: "address" },
  { name: "ratifier", type: "address" },
  { name: "reduceOnly", type: "bool" },
  { name: "maxUnits", type: "uint256" },
  { name: "maxAssets", type: "uint256" },
] as const;

const tokenPermitComponents = [
  { name: "kind", type: "uint8" },
  { name: "data", type: "bytes" },
] as const;

const takeComponents = [
  { name: "units", type: "uint256" },
  { name: "offer", type: "tuple", components: offerComponents },
  { name: "ratifierData", type: "bytes" },
] as const;

const collateralWithdrawalComponents = [
  { name: "collateralIndex", type: "uint256" },
  { name: "assets", type: "uint256" },
] as const;

const collateralSupplyComponents = [
  { name: "collateralIndex", type: "uint256" },
  { name: "assets", type: "uint256" },
  { name: "permit", type: "tuple", components: tokenPermitComponents },
] as const;

/**
 * Pinned ABI fragment for the core Midnight contract.
 *
 * Source: `morpho-org/midnight` commit `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`,
 * `src/interfaces/IMidnight.sol`.
 *
 * @example
 * ```ts
 * import { midnightAbi } from "@morpho-org/midnight-sdk";
 *
 * console.log(midnightAbi.length);
 * ```
 */
export const midnightAbi = parseAbi([
  "function position(bytes32 id, address user) view returns (uint128 credit, uint128 pendingFee, uint128 lastLossFactor, uint128 lastAccrual, uint128 debt, uint128 collateralBitmap)",
  "function marketState(bytes32 id) view returns (uint128 totalUnits, uint128 lossFactor, uint128 withdrawable, uint128 continuousFeeCredit, uint16 settlementFeeCbp0, uint16 settlementFeeCbp1, uint16 settlementFeeCbp2, uint16 settlementFeeCbp3, uint16 settlementFeeCbp4, uint16 settlementFeeCbp5, uint16 settlementFeeCbp6, uint32 continuousFee, uint8 tickSpacing)",
  "function consumed(address user, bytes32 group) view returns (uint256)",
  "function isAuthorized(address authorizer, address authorized) view returns (bool)",
  "function supplyCollateral((address loanToken,(address token,uint256 lltv,uint256 maxLif,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate) market, uint256 collateralIndex, uint256 assets, address onBehalf)",
  "function withdrawCollateral((address loanToken,(address token,uint256 lltv,uint256 maxLif,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate) market, uint256 collateralIndex, uint256 assets, address onBehalf, address receiver)",
  "function repay((address loanToken,(address token,uint256 lltv,uint256 maxLif,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate) market, uint256 units, address onBehalf, address callback, bytes data)",
  "function setIsAuthorized(address authorized, bool newIsAuthorized, address onBehalf)",
  "function toId((address loanToken,(address token,uint256 lltv,uint256 maxLif,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate) market) view returns (bytes32)",
  "function toMarket(bytes32 id) view returns ((address loanToken,(address token,uint256 lltv,uint256 maxLif,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate))",
  "function creditOf(bytes32 id, address user) view returns (uint128)",
  "function debtOf(bytes32 id, address user) view returns (uint128)",
  "function collateral(bytes32 id, address user, uint256 index) view returns (uint128)",
  "function withdrawable(bytes32 id) view returns (uint128)",
  "function isHealthy((address loanToken,(address token,uint256 lltv,uint256 maxLif,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate) market, bytes32 id, address borrower) view returns (bool)",
  "function tickSpacing(bytes32 id) view returns (uint8)",
  "function settlementFee(bytes32 id, uint256 timeToMaturity) view returns (uint256)",
]);

/**
 * Pinned ABI fragment for MidnightBundles.
 *
 * Source: `morpho-org/midnight` commit `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`,
 * `src/periphery/interfaces/IMidnightBundles.sol`.
 *
 * @example
 * ```ts
 * import { midnightBundlesAbi } from "@morpho-org/midnight-sdk";
 *
 * console.log(midnightBundlesAbi.length);
 * ```
 */
export const midnightBundlesAbi = [
  {
    type: "function",
    name: "buyWithUnitsTargetAndWithdrawCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targetUnits", type: "uint256" },
      { name: "maxBuyerAssets", type: "uint256" },
      { name: "taker", type: "address" },
      {
        name: "loanTokenPermit",
        type: "tuple",
        components: tokenPermitComponents,
      },
      { name: "takes", type: "tuple[]", components: takeComponents },
      {
        name: "collateralWithdrawals",
        type: "tuple[]",
        components: collateralWithdrawalComponents,
      },
      { name: "collateralReceiver", type: "address" },
      { name: "referralFeePct", type: "uint256" },
      { name: "referralFeeRecipient", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "supplyCollateralAndSellWithUnitsTarget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targetUnits", type: "uint256" },
      { name: "minSellerAssets", type: "uint256" },
      { name: "taker", type: "address" },
      { name: "receiverIfTakerIsSeller", type: "address" },
      {
        name: "collateralSupplies",
        type: "tuple[]",
        components: collateralSupplyComponents,
      },
      { name: "takes", type: "tuple[]", components: takeComponents },
      { name: "referralFeePct", type: "uint256" },
      { name: "referralFeeRecipient", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buyWithAssetsTargetAndWithdrawCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targetBuyerAssets", type: "uint256" },
      { name: "minUnits", type: "uint256" },
      { name: "taker", type: "address" },
      {
        name: "loanTokenPermit",
        type: "tuple",
        components: tokenPermitComponents,
      },
      { name: "takes", type: "tuple[]", components: takeComponents },
      {
        name: "collateralWithdrawals",
        type: "tuple[]",
        components: collateralWithdrawalComponents,
      },
      { name: "collateralReceiver", type: "address" },
      { name: "referralFeePct", type: "uint256" },
      { name: "referralFeeRecipient", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "supplyCollateralAndSellWithAssetsTarget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targetSellerAssets", type: "uint256" },
      { name: "maxUnits", type: "uint256" },
      { name: "taker", type: "address" },
      { name: "receiverIfTakerIsSeller", type: "address" },
      {
        name: "collateralSupplies",
        type: "tuple[]",
        components: collateralSupplyComponents,
      },
      { name: "takes", type: "tuple[]", components: takeComponents },
      { name: "referralFeePct", type: "uint256" },
      { name: "referralFeeRecipient", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repayAndWithdrawCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "market", type: "tuple", components: marketComponents },
      { name: "assets", type: "uint256" },
      { name: "onBehalf", type: "address" },
      {
        name: "loanTokenPermit",
        type: "tuple",
        components: tokenPermitComponents,
      },
      {
        name: "collateralWithdrawals",
        type: "tuple[]",
        components: collateralWithdrawalComponents,
      },
      { name: "collateralReceiver", type: "address" },
      { name: "referralFeePct", type: "uint256" },
      { name: "referralFeeRecipient", type: "address" },
    ],
    outputs: [],
  },
] as const;

/**
 * Placeholder ABI for mempool submission.
 *
 * The current SDK helper returns a raw `{ to, data }` descriptor because the
 * TIB does not pin a mempool Solidity interface.
 *
 * @example
 * ```ts
 * import { midnightMempoolAbi } from "@morpho-org/midnight-sdk";
 *
 * console.log(midnightMempoolAbi.length);
 * ```
 */
export const midnightMempoolAbi = [] as const;

/**
 * Pinned ABI fragment for EcrecoverRatifier.
 *
 * @example
 * ```ts
 * import { ecrecoverRatifierAbi } from "@morpho-org/midnight-sdk";
 *
 * console.log(ecrecoverRatifierAbi.length);
 * ```
 */
export const ecrecoverRatifierAbi = parseAbi([
  "function cancelRoot(address maker, bytes32 root)",
  "function MIDNIGHT() view returns (address)",
  "function isRootCanceled(address maker, bytes32 root) view returns (bool)",
]);

/**
 * Pinned ABI fragment for SetterRatifier.
 *
 * @example
 * ```ts
 * import { setterRatifierAbi } from "@morpho-org/midnight-sdk";
 *
 * console.log(setterRatifierAbi.length);
 * ```
 */
export const setterRatifierAbi = parseAbi([
  "function setIsRootRatified(address maker, bytes32 root, bool newIsRootRatified)",
  "function MIDNIGHT() view returns (address)",
  "function isRootRatified(address maker, bytes32 root) view returns (bool)",
]);

/**
 * Minimal ERC-20 ABI used by allowance fetch helpers and approval descriptors.
 *
 * @example
 * ```ts
 * import { erc20Abi } from "@morpho-org/midnight-sdk";
 *
 * console.log(erc20Abi.length);
 * ```
 */
export const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
