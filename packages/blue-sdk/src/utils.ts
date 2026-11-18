/** Reason why a capacity calculation is capped. */
export enum CapacityLimitReason {
  liquidity = "Liquidity",
  balance = "Balance",
  position = "Position",
  collateral = "Collateral",
  cap = "Cap",
  vaultV2_absoluteCap = "VaultV2_AbsoluteCap",
  vaultV2_relativeCap = "VaultV2_RelativeCap",
  /**
   * Applies only to deposits: Midnight liquidity adapters revert vault-initiated allocations
   * (`SelfAllocationOnly`). Exits can draw on adapter credit via `withdrawToVault`, subject to
   * market liquidity (`CapacityLimitReason.liquidity`).
   */
  midnightSelfAllocation = "Midnight_SelfAllocationOnly",
}

/** Bounded capacity value and the reason for the bound. */
export interface CapacityLimit {
  value: bigint;
  limiter: CapacityLimitReason;
}
