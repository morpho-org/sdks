import type { Address, Hex } from "viem";
import { ORACLE_PRICE_SCALE } from "../constants.js";
import type { IMarket } from "../market/Market.js";
import { Market } from "../market/Market.js";
import type { IMarketParams } from "../market/MarketParams.js";
import { MathLib } from "../math/MathLib.js";
import type { IAccrualPosition, IPosition } from "../position/Position.js";
import { AccrualPosition } from "../position/Position.js";
import type { MarketId } from "../types.js";
import type { IVault } from "../vault/Vault.js";
import type { IVaultConfig } from "../vault/VaultConfig.js";
import type { IVaultMarketConfig } from "../vault/VaultMarketConfig.js";
import type { IVaultV2 } from "../vault/v2/VaultV2.js";
import type { IVaultV2Adapter } from "../vault/v2/VaultV2Adapter.js";

/** @internal */
export const USER = "0x0000000000000000000000000000000000000001" as Address;
/** @internal */
export const LOAN_TOKEN =
  "0x0000000000000000000000000000000000000002" as Address;
/** @internal */
export const COLLATERAL_TOKEN =
  "0x0000000000000000000000000000000000000003" as Address;
/** @internal */
export const ORACLE = "0x0000000000000000000000000000000000000004" as Address;
/** @internal */
export const IRM = "0x0000000000000000000000000000000000000005" as Address;
/** @internal */
export const VAULT_ADDRESS =
  "0x0000000000000000000000000000000000000006" as Address;
/** @internal */
export const ADAPTER = "0x0000000000000000000000000000000000000007" as Address;
/** @internal */
export const LIQUIDITY_ADAPTER =
  "0x0000000000000000000000000000000000000008" as Address;
/** @internal */
export const RECIPIENT =
  "0x0000000000000000000000000000000000000009" as Address;
/** @internal */
export const EMPTY_HEX = "0x" as Hex;

/** @internal */
export function marketParams(
  overrides: Partial<IMarketParams> = {},
): IMarketParams {
  return {
    loanToken: LOAN_TOKEN,
    collateralToken: COLLATERAL_TOKEN,
    oracle: ORACLE,
    irm: IRM,
    lltv: 860_000_000_000_000_000n,
    ...overrides,
  };
}

/** @internal */
export function marketInput(overrides: Partial<IMarket> = {}): IMarket {
  return {
    params: marketParams(),
    totalSupplyAssets: 4_000_000n,
    totalBorrowAssets: 2_000_000n,
    totalSupplyShares: 3_000_001n,
    totalBorrowShares: 1_000_001n,
    lastUpdate: 100n,
    fee: 100_000_000_000_000_000n,
    price: ORACLE_PRICE_SCALE,
    rateAtTarget: MathLib.WAD / 100_000n,
    ...overrides,
  };
}

/** @internal */
export function market(overrides: Partial<IMarket> = {}) {
  return new Market(marketInput(overrides));
}

/** @internal */
export function positionInput(overrides: Partial<IPosition> = {}): IPosition {
  const m = market();
  return {
    user: USER,
    marketId: m.id,
    supplyShares: 100n,
    borrowShares: 50n,
    collateral: 200n,
    ...overrides,
  };
}

/** @internal */
export function accrualPosition(
  positionOverrides: Partial<IAccrualPosition> = {},
  marketOverrides: Partial<IMarket> = {},
) {
  return new AccrualPosition(
    {
      user: USER,
      supplyShares: 100n,
      borrowShares: 50n,
      collateral: 200n,
      ...positionOverrides,
    },
    marketInput(marketOverrides),
  );
}

/** @internal */
export function vaultConfig(
  overrides: Partial<IVaultConfig> = {},
): IVaultConfig {
  return {
    address: VAULT_ADDRESS,
    name: "Vault",
    symbol: "vTKN",
    asset: LOAN_TOKEN,
    decimalsOffset: 0n,
    ...overrides,
  };
}

/** @internal */
export function vaultInput(overrides: Partial<IVault> = {}): IVault {
  return {
    ...vaultConfig(),
    curator: USER,
    owner: USER,
    guardian: USER,
    fee: 100_000_000_000_000_000n,
    feeRecipient: RECIPIENT,
    skimRecipient: RECIPIENT,
    pendingTimelock: { value: 0n, validAt: 0n },
    pendingGuardian: { value: USER, validAt: 0n },
    pendingOwner: USER,
    timelock: 0n,
    supplyQueue: [],
    withdrawQueue: [],
    totalSupply: 1_000n,
    totalAssets: 1_000n,
    lastTotalAssets: 900n,
    ...overrides,
  };
}

/** @internal */
export function vaultMarketConfig(
  marketId: MarketId,
  overrides: Partial<IVaultMarketConfig> = {},
): IVaultMarketConfig {
  return {
    vault: VAULT_ADDRESS,
    marketId,
    cap: 1_000n,
    pendingCap: { value: 0n, validAt: 0n },
    removableAt: 0n,
    enabled: true,
    ...overrides,
  };
}

/** @internal */
export function vaultV2Input(overrides: Partial<IVaultV2> = {}): IVaultV2 {
  return {
    address: VAULT_ADDRESS,
    name: "Vault V2",
    symbol: "v2TKN",
    decimals: 18,
    asset: LOAN_TOKEN,
    _totalAssets: 1_000n,
    totalSupply: 1_000n,
    virtualShares: 100n,
    maxRate: MathLib.WAD / 100_000n,
    lastUpdate: 100n,
    adapters: [ADAPTER],
    liquidityAdapter: LIQUIDITY_ADAPTER,
    liquidityData: EMPTY_HEX,
    liquidityAllocations: [
      {
        id: `${"0x"}${"01".padStart(64, "0")}`,
        absoluteCap: 2_000n,
        relativeCap: MathLib.WAD,
        allocation: 500n,
      },
    ],
    performanceFee: 100_000_000_000_000_000n,
    managementFee: 0n,
    performanceFeeRecipient: RECIPIENT,
    managementFeeRecipient: RECIPIENT,
    ...overrides,
  };
}

/** @internal */
export function vaultV2AdapterInput(
  overrides: Partial<IVaultV2Adapter> = {},
): IVaultV2Adapter {
  return {
    type: "TestAdapter",
    address: ADAPTER,
    parentVault: VAULT_ADDRESS,
    adapterId: `${"0x"}${"02".padStart(64, "0")}`,
    skimRecipient: RECIPIENT,
    ...overrides,
  };
}
