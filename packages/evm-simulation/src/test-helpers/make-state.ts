import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import type { MarketState, PositionState, VaultState } from "../result.js";
import type { CheckContext } from "../simulate/check/helpers.js";
import type {
  MarketInternals,
  ParsedState,
  VaultInternals,
} from "../simulate/state/types.js";
import { positionKey } from "../simulate/state/types.js";

/** Default owner for state/check fixtures. */
export const TEST_OWNER: Address = getAddress(
  "0x1111111111111111111111111111111111111111",
);
/** Default market id for state/check fixtures. */
export const TEST_MARKET_ID =
  "0xb8c25cd0a6f03f8b34c8b9b12e24a2a1b3f0f0f0f0f0f0f0f0f0f0f0f0f0f0f" as MarketId;

const base = {
  balances: [],
  allowances: [],
  morphoAuthorizations: [],
  nonces: [],
  positions: [],
  markets: [],
  vaults: [],
} as const;

/** Empty {@link ParsedState} fixture; callers spread overrides. */
export function makeParsedState(
  overrides: Partial<ParsedState> = {},
): ParsedState {
  const internals = overrides.internals;
  return {
    ...base,
    ...overrides,
    internals: {
      markets: new Map(internals?.markets ?? []),
      vaults: new Map(internals?.vaults ?? []),
      positions: new Map(internals?.positions ?? []),
    },
  };
}

/** `ParsedState` carrying one market+position pair. */
export function makeMarketState(params: {
  marketId: MarketId;
  owner?: Address;
  params?: Partial<MarketInternals["params"]>;
  market?: Partial<MarketState>;
  position?: Partial<PositionState>;
  internals?: Partial<MarketInternals>;
}): ParsedState {
  const {
    marketId,
    owner = TEST_OWNER,
    params: paramsOverride = {},
    market = {},
    position = {},
    internals = {},
  } = params;
  const markets = new Map<MarketId, MarketInternals>();
  const positions = new Map<
    string,
    ParsedState["internals"]["positions"] extends ReadonlyMap<string, infer V>
      ? V
      : never
  >();
  markets.set(marketId, {
    marketId,
    params: {
      loanToken: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
      collateralToken: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
      oracle: getAddress("0x0000000000000000000000000000000000000001"),
      irm: getAddress("0x0000000000000000000000000000000000000002"),
      lltv: 900000000000000000n,
      ...paramsOverride,
    },
    ...internals,
  });
  positions.set(positionKey(marketId, owner), {
    ltvWad: { type: "debtFree" },
    healthFactorWad: { type: "unbounded", reason: "zeroCollateral" },
  });
  return makeParsedState({
    markets: [
      {
        marketId,
        totalSupplyAssets: 1_000n,
        totalSupplyShares: 1_000n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        liquidityAssets: 1_000n,
        lastUpdate: 1_700_000_000n,
        feeWad: 0n,
        ...market,
      },
    ],
    positions: [
      {
        marketId,
        user: owner,
        supplyAssets: 0n,
        supplyShares: 0n,
        borrowAssets: 0n,
        borrowShares: 0n,
        collateral: 0n,
        ...position,
      },
    ],
    internals: { markets, vaults: new Map(), positions },
  });
}

/** `ParsedState` carrying one vault. */
export function makeVaultState(params: {
  vault: Address;
  version?: "v1" | "v2";
  vaultState?: Partial<VaultState>;
  internals?: Partial<VaultInternals>;
}): ParsedState {
  const vaults = new Map<Address, VaultInternals>();
  vaults.set(params.vault, {
    version: params.version ?? "v1",
    sharePriceE27: 10n ** 27n,
    allocations: [],
    ...params.internals,
  });
  return makeParsedState({
    vaults: [
      {
        vault: params.vault,
        version: params.version ?? "v1",
        asset: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
        totalAssets: 1_000n,
        totalShares: 1_000n,
        userShares: 500n,
        idleAssets: 0n,
        allocations: [],
        ...params.vaultState,
      },
    ],
    internals: { markets: new Map(), vaults, positions: new Map() },
  });
}

/** Minimal {@link CheckContext} fixture; `addresses` defaults to empty. */
export function makeCheckContext(
  overrides: Partial<CheckContext> = {},
): CheckContext {
  return {
    chainId: 1,
    mode: "final",
    block: {
      chainId: 1,
      stateBlockNumber: 20_000_000n,
      stateBlockHash: `0x${"ab".repeat(32)}`,
      stateBlockTimestamp: 1_700_000_000n,
      blockNumber: 20_000_001n,
      blockTimestamp: 1_700_000_012n,
    },
    owner: TEST_OWNER,
    limits: {
      maxSlippageWad: 3_00000000000000n,
      minLltvBufferWad: 5_0000000000000000n,
      maxSignatureLifetimeSeconds: 7_200n,
      operations: [],
    },
    addresses: {} as CheckContext["addresses"],
    ...overrides,
  };
}

/** Empty signed-diff shape for check fixtures. */
export const emptyDiff = {
  balances: [],
  allowances: [],
  morphoAuthorizations: [],
  nonces: [],
  positions: [],
  markets: [],
  vaults: [],
} as const;
