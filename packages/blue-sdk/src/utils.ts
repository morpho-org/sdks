export enum CapacityLimitReason {
  liquidity = "Liquidity",
  balance = "Balance",
  position = "Position",
  collateral = "Collateral",
  cap = "Cap",
  vaultV2_absoluteCap = "VaultV2_AbsoluteCap",
  vaultV2_relativeCap = "VaultV2_RelativeCap",
  vaultV2_forceDeallocateLiquidity = "vaultV2_forceDeallocateLiquidity",
  vaultV2_forceDeallocateBalance = "vaultV2_forceDeallocateBalance",
}

export interface CapacityLimit {
  value: bigint;
  limiter: CapacityLimitReason;
}
