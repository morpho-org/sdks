/** ABI tuple definition for Morpho Blue market params. */
export const marketParamsAbi = {
  type: "tuple",
  components: [
    { type: "address", name: "loanToken" },
    { type: "address", name: "collateralToken" },
    { type: "address", name: "oracle" },
    { type: "address", name: "irm" },
    { type: "uint256", name: "lltv" },
  ],
} as const;
