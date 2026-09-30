import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import type {
  MarketState,
  PositionState,
  VaultState,
  VerificationSnapshot,
} from "../domain/evidence.js";

/** Shared fixture accounts for effect-verification unit tests. @internal */
export const FIXTURE_OWNER: Address = getAddress(
  "0x1111111111111111111111111111111111111111",
);
/** @internal */
export const FIXTURE_TOKEN: Address = getAddress(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
);
/** @internal */
export const FIXTURE_COLLATERAL: Address = getAddress(
  "0x9999999999999999999999999999999999999999",
);
/** @internal */
export const FIXTURE_ORACLE: Address = getAddress(
  "0x4444444444444444444444444444444444444444",
);
/** @internal */
export const FIXTURE_IRM: Address = getAddress(
  "0x5555555555555555555555555555555555555555",
);
/** @internal */
export const FIXTURE_MARKET_ID = `0x${"cd".repeat(32)}` as MarketId;
/** @internal */
export const FIXTURE_MARKET_ID_2 = `0x${"ef".repeat(32)}` as MarketId;
/** @internal */
export const FIXTURE_VAULT: Address = getAddress(
  "0x7777777777777777777777777777777777777777",
);
/** @internal */
export const FIXTURE_VAULT_V2: Address = getAddress(
  "0x8888888888888888888888888888888888888888",
);
/** @internal */
export const FIXTURE_ADAPTER: Address = getAddress(
  "0xABaBaBaBABabABabAbAbABAbABabababaBaBABaB",
);
/** @internal */
export const FIXTURE_NOW = 1_700_000_000n;

/** Build a market state with sane defaults for effect tests. @internal */
export const fixtureMarket = (
  overrides: Partial<MarketState> = {},
  marketId: MarketId = FIXTURE_MARKET_ID,
): MarketState => ({
  market: {
    marketId,
    params: {
      loanToken: FIXTURE_TOKEN,
      collateralToken: FIXTURE_COLLATERAL,
      oracle: FIXTURE_ORACLE,
      irm: FIXTURE_IRM,
      lltv: 8n * 10n ** 17n,
    },
  },
  totalSupplyAssets: 10_000n,
  totalSupplyShares: 10_000n,
  totalBorrowAssets: 4_000n,
  totalBorrowShares: 4_000n,
  lastUpdate: FIXTURE_NOW,
  feeWad: 0n,
  liquidityAssets: 6_000n,
  utilizationWad: { type: "finite", valueWad: 4n * 10n ** 17n },
  borrowApyWad: { type: "applicable", value: 10n ** 16n },
  oraclePrice: {
    type: "applicable",
    value: { value: 10n ** 36n, scale: 10n ** 36n },
  },
  borrowRatePerSecondWad: { type: "applicable", value: 3n },
  rateAtTargetPerSecondWad: { type: "applicable", value: 3n },
  preLiquidation: { type: "notApplicable", reason: "noPreLiquidation" },
  ...overrides,
});

/** Build a position state; defaults to a supplier with no debt. @internal */
export const fixturePosition = (
  overrides: Partial<PositionState> = {},
): PositionState => ({
  marketId: FIXTURE_MARKET_ID,
  owner: FIXTURE_OWNER,
  supplyAssets: 0n,
  supplyShares: 0n,
  borrowAssets: 0n,
  borrowShares: 0n,
  collateralAssets: 0n,
  ltvWad: { type: "debtFree" },
  healthFactorWad: { type: "unbounded", reason: "zeroCollateral" },
  ...overrides,
});

/** Build a snapshot around the given markets/positions. @internal */
export const fixtureSnapshot = (
  overrides: Partial<VerificationSnapshot> = {},
): VerificationSnapshot => ({
  wallet: [],
  permissions: [],
  positions: [],
  vaults: [],
  markets: [],
  ...overrides,
});

/** Build a vault state (V1 or V2) with sane defaults for effect tests. @internal */
export const fixtureVault = (overrides: Partial<VaultState> = {}): VaultState =>
  ({
    type: "vaultV1",
    vault: FIXTURE_VAULT,
    owner: FIXTURE_OWNER,
    asset: FIXTURE_TOKEN,
    totalAssets: 10_000n,
    totalShares: 10_000n,
    ownerShares: 1_000n,
    idleAssets: 2_000n,
    sharePriceE27: 10n ** 27n,
    feeRecipient: getAddress("0x6666666666666666666666666666666666666666"),
    performanceFeeWad: 0n,
    allocations: [],
    lastTotalAssets: 10_000n,
    decimalsOffset: 6n,
    ...overrides,
  }) as VaultState;
