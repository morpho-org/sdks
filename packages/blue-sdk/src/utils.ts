export enum CapacityLimitReason {
  liquidity = "Liquidity",
  balance = "Balance",
  position = "Position",
  collateral = "Collateral",
  cap = "Cap",
  vaultV2_absoluteCap = "VaultV2_AbsoluteCap",
  vaultV2_relativeCap = "VaultV2_RelativeCap",
  VaultV2_ForceDeallocateLiquidity = "VaultV2_ForceDeallocateLiquidity",
}

export interface CapacityLimit {
  value: bigint;
  limiter: CapacityLimitReason;
}
