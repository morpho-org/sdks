export enum SupplyMigrationLimiter {
  position = "position",
  liquidity = "liquidity",
  withdrawPaused = "withdrawPaused",
  borrowPaused = "borrowPaused",
  protocolCap = "protocolCap",
}

export enum BorrowMigrationLimiter {
  position = "position",
  repayPaused = "repayPaused",
}

export enum CollateralMigrationLimiter {}
