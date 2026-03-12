export enum CapacityLimitReason {
  liquidity = "Liquidity",
  balance = "Balance",
  position = "Position",
  collateral = "Collateral",
  cap = "Cap",
  vaultV2_absoluteCap = "VaultV2_AbsoluteCap",
  vaultV2_relativeCap = "VaultV2_RelativeCap",
  VaultV2_ForceLiquidity = "VaultV2_ForceLiquidity",
  VaultV2_ForceBalance = "VaultV2_ForceBalance",
}

export interface CapacityLimit {
  value: bigint;
  limiter: CapacityLimitReason;
}
