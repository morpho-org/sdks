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
   * The vault's liquidity adapter is a Midnight adapter. Midnight adapters revert vault-initiated
   * allocations and deallocations (`SelfAllocationOnly`), so deposits cannot be pushed to it and exits
   * can only draw on the vault's idle assets.
   */
  midnightSelfAllocation = "Midnight_SelfAllocationOnly",
}

/** Bounded capacity value and the reason for the bound. */
export interface CapacityLimit {
  value: bigint;
  limiter: CapacityLimitReason;
}
