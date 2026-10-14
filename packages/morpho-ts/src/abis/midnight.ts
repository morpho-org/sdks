/** ABI tuple definition for Midnight collateral parameters. */
export const midnightCollateralParamsAbi = {
  type: "tuple",
  internalType: "struct CollateralParams",
  components: [
    { name: "token", type: "address", internalType: "address" },
    { name: "lltv", type: "uint256", internalType: "uint256" },
    { name: "liquidationCursor", type: "uint256", internalType: "uint256" },
    { name: "oracle", type: "address", internalType: "address" },
  ],
} as const;

/** ABI tuple definition for a Midnight market. */
export const midnightMarketAbi = {
  type: "tuple",
  internalType: "struct Market",
  components: [
    { name: "chainId", type: "uint256", internalType: "uint256" },
    { name: "midnight", type: "address", internalType: "address" },
    { name: "loanToken", type: "address", internalType: "address" },
    {
      name: "collateralParams",
      type: "tuple[]",
      internalType: "struct CollateralParams[]",
      components: midnightCollateralParamsAbi.components,
    },
    { name: "maturity", type: "uint256", internalType: "uint256" },
    { name: "rcfThreshold", type: "uint256", internalType: "uint256" },
    { name: "enterGate", type: "address", internalType: "address" },
    { name: "liquidatorGate", type: "address", internalType: "address" },
  ],
} as const;

/** ABI tuple definition for a Midnight offer. */
export const midnightOfferAbi = {
  type: "tuple",
  internalType: "struct Offer",
  components: [
    {
      name: "market",
      type: "tuple",
      internalType: "struct Market",
      components: midnightMarketAbi.components,
    },
    { name: "buy", type: "bool", internalType: "bool" },
    { name: "maker", type: "address", internalType: "address" },
    { name: "start", type: "uint256", internalType: "uint256" },
    { name: "expiry", type: "uint256", internalType: "uint256" },
    { name: "tick", type: "uint256", internalType: "uint256" },
    { name: "group", type: "bytes32", internalType: "bytes32" },
    { name: "callback", type: "address", internalType: "address" },
    { name: "callbackData", type: "bytes", internalType: "bytes" },
    {
      name: "receiverIfMakerIsSeller",
      type: "address",
      internalType: "address",
    },
    { name: "ratifier", type: "address", internalType: "address" },
    { name: "reduceOnly", type: "bool", internalType: "bool" },
    { name: "maxUnits", type: "uint128", internalType: "uint128" },
    { name: "maxAssets", type: "uint128", internalType: "uint128" },
    { name: "continuousFeeCap", type: "uint256", internalType: "uint256" },
  ],
} as const;

/** ABI fragment for Midnight core position and market-state reads. */
export const midnightCoreReadAbi = [
  {
    type: "function",
    name: "position",
    inputs: [
      { name: "id", type: "bytes32", internalType: "bytes32" },
      { name: "user", type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "credit", type: "uint128", internalType: "uint128" },
      { name: "pendingFee", type: "uint128", internalType: "uint128" },
      { name: "lastLossFactor", type: "uint128", internalType: "uint128" },
      { name: "lastAccrual", type: "uint128", internalType: "uint128" },
      { name: "debt", type: "uint128", internalType: "uint128" },
      { name: "collateralBitmap", type: "uint128", internalType: "uint128" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "marketState",
    inputs: [{ name: "id", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      { name: "totalUnits", type: "uint128", internalType: "uint128" },
      { name: "lossFactor", type: "uint128", internalType: "uint128" },
      { name: "withdrawable", type: "uint128", internalType: "uint128" },
      {
        name: "continuousFeeCredit",
        type: "uint128",
        internalType: "uint128",
      },
      { name: "settlementFeeCbp0", type: "uint16", internalType: "uint16" },
      { name: "settlementFeeCbp1", type: "uint16", internalType: "uint16" },
      { name: "settlementFeeCbp2", type: "uint16", internalType: "uint16" },
      { name: "settlementFeeCbp3", type: "uint16", internalType: "uint16" },
      { name: "settlementFeeCbp4", type: "uint16", internalType: "uint16" },
      { name: "settlementFeeCbp5", type: "uint16", internalType: "uint16" },
      { name: "settlementFeeCbp6", type: "uint16", internalType: "uint16" },
      { name: "continuousFee", type: "uint32", internalType: "uint32" },
      { name: "tickSpacing", type: "uint8", internalType: "uint8" },
    ],
    stateMutability: "view",
  },
] as const;
