/** Reason why a capacity calculation is capped. */
export enum CapacityLimitReason {
  liquidity = "Liquidity",
  balance = "Balance",
  position = "Position",
  collateral = "Collateral",
  cap = "Cap",
  vaultV2_absoluteCap = "VaultV2_AbsoluteCap",
  vaultV2_relativeCap = "VaultV2_RelativeCap",
  /** Midnight adapters cannot be used as Vault V2 liquidity adapters. */
  midnightSelfAllocation = "Midnight_SelfAllocationOnly",
}

/** Bounded capacity value and the reason for the bound. */
export interface CapacityLimit {
  value: bigint;
  limiter: CapacityLimitReason;
}
