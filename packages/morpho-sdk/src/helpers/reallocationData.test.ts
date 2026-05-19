import {
  ChainId,
  Holding,
  Market,
  type MarketId,
  MarketParams,
  MathLib,
  Position,
  Vault,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import { maxUint256, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  DisabledReallocationMarketError,
  MissingPublicAllocatorConfigError,
  type PublicAllocatorOptions,
  type PublicReallocation,
  UnknownReallocationMarketError,
  UnknownReallocationPositionError,
  UnknownReallocationVaultError,
  UnknownReallocationVaultMarketConfigError,
} from "../types/index.js";
import { ReallocationData } from "./reallocationData.js";

const TIMESTAMP = 1_700_000_000n;
const VAULT: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER_VAULT: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const LOAN_TOKEN: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

type LegacyPublicAllocatorOptions = {
  readonly enabled?: boolean;
  readonly reallocatableVaults?: Address[];
  readonly maxWithdrawalUtilization?: Record<MarketId, bigint | undefined>;
  readonly defaultMaxWithdrawalUtilization?: bigint;
  readonly delay?: bigint;
};

type LegacySimulationState = PreservedReallocationState & {
  getMarketPublicReallocations(
    marketId: MarketId,
    options?: LegacyPublicAllocatorOptions,
  ): {
    readonly withdrawals: readonly PublicReallocation[];
    readonly data: LegacySimulationState;
  };
};

type LegacySimulationStateConstructor = new (input: {
  readonly chainId: number;
  readonly block: { readonly number: bigint; readonly timestamp: bigint };
  readonly markets: MutableReallocationInput["markets"];
  readonly vaults: MutableReallocationInput["vaults"];
  readonly positions: MutableReallocationInput["positions"];
  readonly holdings: Record<Address, Record<Address, Holding>>;
  readonly vaultMarketConfigs: MutableReallocationInput["vaultMarketConfigs"];
}) => LegacySimulationState;

const simulationStateModulePath =
  "../../../simulation-sdk/src/SimulationState.ts";
const { SimulationState } = (await import(simulationStateModulePath)) as {
  readonly SimulationState: LegacySimulationStateConstructor;
};

const targetParams = new MarketParams({
  loanToken: LOAN_TOKEN,
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  oracle: "0x0000000000000000000000000000000000000001",
  irm: "0x0000000000000000000000000000000000000002",
  lltv: 860000000000000000n,
});

const sourceParams = new MarketParams({
  loanToken: LOAN_TOKEN,
  collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  oracle: "0x0000000000000000000000000000000000000003",
  irm: "0x0000000000000000000000000000000000000002",
  lltv: 860000000000000000n,
});

const alternateSourceParams = new MarketParams({
  loanToken: LOAN_TOKEN,
  collateralToken: "0xae78736Cd615f374D3085123A210448E74Fc6393",
  oracle: "0x0000000000000000000000000000000000000004",
  irm: "0x0000000000000000000000000000000000000002",
  lltv: 860000000000000000n,
});

const makeMarket = (
  params: MarketParams,
  {
    supply,
    borrow,
  }: {
    readonly supply: bigint;
    readonly borrow: bigint;
  },
) =>
  new Market({
    params,
    totalSupplyAssets: supply,
    totalBorrowAssets: borrow,
    totalSupplyShares: supply,
    totalBorrowShares: borrow,
    lastUpdate: TIMESTAMP,
    fee: 0n,
    price: 10n ** 36n,
  });

// biome-ignore lint/complexity/useMaxParams: compact fixture helper for market/user position rows.
const makePosition = (
  marketId: MarketId,
  supplyShares: bigint,
  user: Address = VAULT,
) =>
  new Position({
    user,
    marketId,
    supplyShares,
    borrowShares: 0n,
    collateral: 0n,
  });

const makeVaultMarketConfig = ({
  vault = VAULT,
  marketId,
  cap,
  maxIn,
  maxOut,
  enabled = true,
  pendingCap = { value: cap, validAt: TIMESTAMP - 1n },
  withPublicAllocatorConfig = true,
}: {
  readonly vault?: Address;
  readonly marketId: MarketId;
  readonly cap: bigint;
  readonly maxIn: bigint;
  readonly maxOut: bigint;
  readonly enabled?: boolean;
  readonly pendingCap?: { readonly value: bigint; readonly validAt: bigint };
  readonly withPublicAllocatorConfig?: boolean;
}) =>
  new VaultMarketConfig({
    vault,
    marketId,
    cap,
    pendingCap,
    removableAt: 0n,
    enabled,
    publicAllocatorConfig: withPublicAllocatorConfig
      ? new VaultMarketPublicAllocatorConfig({
          vault,
          marketId,
          maxIn,
          maxOut,
        })
      : undefined,
  });

const makeVault = ({
  address = VAULT,
  publicAllocatorConfig,
  withoutPublicAllocatorConfig = false,
  withdrawQueue = [sourceParams.id, targetParams.id],
}: {
  readonly address?: Address;
  readonly publicAllocatorConfig?: Vault["publicAllocatorConfig"];
  readonly withoutPublicAllocatorConfig?: boolean;
  readonly withdrawQueue?: readonly MarketId[];
} = {}) => {
  const resolvedPublicAllocatorConfig = withoutPublicAllocatorConfig
    ? undefined
    : (publicAllocatorConfig ?? {
        admin: zeroAddress,
        fee: 13n,
        accruedFee: 0n,
      });

  return new Vault({
    address,
    name: "Vault",
    symbol: "vTEST",
    decimalsOffset: 0n,
    asset: LOAN_TOKEN,
    curator: zeroAddress,
    owner: zeroAddress,
    guardian: zeroAddress,
    fee: 0n,
    feeRecipient: zeroAddress,
    skimRecipient: zeroAddress,
    pendingTimelock: { value: 0n, validAt: 0n },
    pendingGuardian: { value: zeroAddress, validAt: 0n },
    pendingOwner: zeroAddress,
    timelock: 0n,
    supplyQueue: [targetParams.id],
    withdrawQueue: [...withdrawQueue],
    totalSupply: 0n,
    totalAssets: 0n,
    lastTotalAssets: 0n,
    publicAllocatorConfig: resolvedPublicAllocatorConfig,
  });
};

const makeLegacyHolding = (user: Address) =>
  new Holding({
    user,
    token: LOAN_TOKEN,
    erc20Allowances: {
      morpho: maxUint256,
      permit2: 0n,
      "bundler3.generalAdapter1": 0n,
    },
    permit2BundlerAllowance: {
      amount: 0n,
      expiration: 0n,
      nonce: 0n,
    },
    balance: 0n,
  });

type MutableReallocationInput = {
  readonly chainId: number;
  markets: Record<MarketId, Market | undefined>;
  vaults: Record<Address, Vault | undefined>;
  positions: Record<Address, Record<MarketId, Position | undefined>>;
  vaultMarketConfigs: Record<
    Address,
    Record<MarketId, VaultMarketConfig | undefined>
  >;
};

const makeInput = ({
  targetSupply,
  targetBorrow,
  sourceSupply,
  sourceBorrow,
}: {
  readonly targetSupply: bigint;
  readonly targetBorrow: bigint;
  readonly sourceSupply: bigint;
  readonly sourceBorrow: bigint;
}): MutableReallocationInput => ({
  chainId: ChainId.EthMainnet,
  markets: {
    [targetParams.id]: makeMarket(targetParams, {
      supply: targetSupply,
      borrow: targetBorrow,
    }),
    [sourceParams.id]: makeMarket(sourceParams, {
      supply: sourceSupply,
      borrow: sourceBorrow,
    }),
  },
  vaults: {
    [VAULT]: makeVault(),
  },
  positions: {
    [VAULT]: {
      [targetParams.id]: makePosition(targetParams.id, 0n),
      [sourceParams.id]: makePosition(sourceParams.id, sourceSupply),
    },
  },
  vaultMarketConfigs: {
    [VAULT]: {
      [targetParams.id]: makeVaultMarketConfig({
        marketId: targetParams.id,
        cap: 10_000n * MathLib.WAD,
        maxIn: 10_000n * MathLib.WAD,
        maxOut: 0n,
      }),
      [sourceParams.id]: makeVaultMarketConfig({
        marketId: sourceParams.id,
        cap: 10_000n * MathLib.WAD,
        maxIn: 0n,
        maxOut: 10_000n * MathLib.WAD,
      }),
    },
  },
});

class TestReallocationData extends ReallocationData {
  public applyPublicReallocationForTest(params: {
    readonly vault: Address;
    readonly supplyMarketId: MarketId;
    readonly withdrawal: PublicReallocation;
    readonly timestamp: bigint;
  }) {
    return this.applyPublicReallocation(params);
  }
}

const applyPublicReallocation = (
  data: ReallocationData,
  withdrawal: PublicReallocation,
) =>
  new TestReallocationData(data).applyPublicReallocationForTest({
    vault: withdrawal.vault,
    supplyMarketId: targetParams.id,
    withdrawal,
    timestamp: TIMESTAMP,
  });

type PreservedReallocationState = Pick<
  ReallocationData,
  | "getAccrualPosition"
  | "getMarket"
  | "getPosition"
  | "getVault"
  | "getVaultMarketConfig"
>;

const makeLegacyState = (input: MutableReallocationInput) =>
  new SimulationState({
    chainId: input.chainId,
    block: { number: 1n, timestamp: TIMESTAMP },
    markets: input.markets,
    vaults: input.vaults,
    positions: input.positions,
    holdings: Object.fromEntries(
      Object.keys(input.vaults).map((vault) => [
        vault,
        { [LOAN_TOKEN]: makeLegacyHolding(vault as Address) },
      ]),
    ),
    vaultMarketConfigs: input.vaultMarketConfigs,
  });

const toLegacyOptions = (
  options: PublicAllocatorOptions = {},
): LegacyPublicAllocatorOptions => ({
  enabled: options.enabled,
  reallocatableVaults:
    options.reallocatableVaults == null
      ? undefined
      : [...options.reallocatableVaults],
  defaultMaxWithdrawalUtilization: options.defaultMaxWithdrawalUtilization,
  maxWithdrawalUtilization:
    options.maxWithdrawalUtilization == null
      ? undefined
      : { ...options.maxWithdrawalUtilization },
  delay: 0n,
});

const toReallocationOptions = (
  options: PublicAllocatorOptions = {},
): PublicAllocatorOptions => ({
  ...options,
  timestamp: TIMESTAMP,
});

const tryRead = <Value>(accessor: () => Value) => {
  try {
    return accessor();
  } catch {
    return undefined;
  }
};

const snapshotPreservedState = (
  data: PreservedReallocationState,
  {
    marketIds,
    vaults,
  }: {
    readonly marketIds: readonly MarketId[];
    readonly vaults: readonly Address[];
  },
) => ({
  markets: Object.fromEntries(
    marketIds.map((marketId) => [
      marketId,
      tryRead(() => {
        const market = data.getMarket(marketId);

        return {
          totalBorrowAssets: market.totalBorrowAssets,
          totalBorrowShares: market.totalBorrowShares,
          totalSupplyAssets: market.totalSupplyAssets,
          totalSupplyShares: market.totalSupplyShares,
          liquidity: market.liquidity,
        };
      }),
    ]),
  ),
  vaults: Object.fromEntries(
    vaults.map((vault) => [
      vault,
      tryRead(() => {
        const dataVault = data.getVault(vault);

        return {
          totalAssets: dataVault.totalAssets,
          accruedFee: dataVault.publicAllocatorConfig?.accruedFee,
          withdrawQueue: dataVault.withdrawQueue,
        };
      }),
    ]),
  ),
  positions: Object.fromEntries(
    vaults.map((vault) => [
      vault,
      Object.fromEntries(
        marketIds.map((marketId) => [
          marketId,
          tryRead(() => {
            const position = data.getPosition(vault, marketId);

            return {
              borrowShares: position.borrowShares,
              collateral: position.collateral,
              supplyShares: position.supplyShares,
            };
          }),
        ]),
      ),
    ]),
  ),
  vaultMarketConfigs: Object.fromEntries(
    vaults.map((vault) => [
      vault,
      Object.fromEntries(
        marketIds.map((marketId) => [
          marketId,
          tryRead(() => {
            const config = data.getVaultMarketConfig(vault, marketId);

            return {
              cap: config.cap,
              enabled: config.enabled,
              maxIn: config.publicAllocatorConfig?.maxIn,
              maxOut: config.publicAllocatorConfig?.maxOut,
              pendingCap: config.pendingCap,
            };
          }),
        ]),
      ),
    ]),
  ),
});

const expectPublicReallocationParity = ({
  input,
  marketId = targetParams.id,
  options,
  marketIds = [targetParams.id, sourceParams.id, alternateSourceParams.id],
  vaults = [VAULT, OTHER_VAULT],
}: {
  readonly input: () => MutableReallocationInput;
  readonly marketId?: MarketId;
  readonly options?: PublicAllocatorOptions;
  readonly marketIds?: readonly MarketId[];
  readonly vaults?: readonly Address[];
}) => {
  const reallocationResult = new ReallocationData(
    input(),
  ).getMarketPublicReallocations(marketId, toReallocationOptions(options));
  const legacyResult = makeLegacyState(input()).getMarketPublicReallocations(
    marketId,
    toLegacyOptions(options),
  );

  expect(reallocationResult.withdrawals).toEqual(legacyResult.withdrawals);
  expect(
    snapshotPreservedState(reallocationResult.data, { marketIds, vaults }),
  ).toEqual(snapshotPreservedState(legacyResult.data, { marketIds, vaults }));
};

const makeBaseInput = () =>
  makeInput({
    targetSupply: 1000n * MathLib.WAD,
    targetBorrow: 500n * MathLib.WAD,
    sourceSupply: 1000n * MathLib.WAD,
    sourceBorrow: 500n * MathLib.WAD,
  });

const makeMultiVaultInput = () => {
  const missingMarket = `0x${"22".repeat(32)}` as MarketId;
  const input = makeBaseInput();
  input.markets[alternateSourceParams.id] = makeMarket(alternateSourceParams, {
    supply: 1000n * MathLib.WAD,
    borrow: 100n * MathLib.WAD,
  });
  input.positions[VAULT]![alternateSourceParams.id] = makePosition(
    alternateSourceParams.id,
    1000n * MathLib.WAD,
  );
  input.vaults[VAULT] = makeVault({
    withdrawQueue: [
      missingMarket,
      sourceParams.id,
      alternateSourceParams.id,
      targetParams.id,
    ],
  });
  input.vaultMarketConfigs[VAULT]![targetParams.id] = makeVaultMarketConfig({
    marketId: targetParams.id,
    cap: 10_000n * MathLib.WAD,
    pendingCap: { value: 30n * MathLib.WAD, validAt: TIMESTAMP },
    maxIn: 30n * MathLib.WAD,
    maxOut: 0n,
  });
  input.vaultMarketConfigs[VAULT]![sourceParams.id] = makeVaultMarketConfig({
    marketId: sourceParams.id,
    cap: 10_000n * MathLib.WAD,
    maxIn: 0n,
    maxOut: 10n * MathLib.WAD,
  });
  input.vaultMarketConfigs[VAULT]![alternateSourceParams.id] =
    makeVaultMarketConfig({
      marketId: alternateSourceParams.id,
      cap: 10_000n * MathLib.WAD,
      maxIn: 0n,
      maxOut: 20n * MathLib.WAD,
    });
  input.vaults[OTHER_VAULT] = makeVault({
    address: OTHER_VAULT,
    withdrawQueue: [sourceParams.id, targetParams.id],
  });
  input.positions[OTHER_VAULT] = {
    [targetParams.id]: makePosition(targetParams.id, 0n, OTHER_VAULT),
    [sourceParams.id]: makePosition(
      sourceParams.id,
      1000n * MathLib.WAD,
      OTHER_VAULT,
    ),
  };
  input.vaultMarketConfigs[OTHER_VAULT] = {
    [targetParams.id]: makeVaultMarketConfig({
      vault: OTHER_VAULT,
      marketId: targetParams.id,
      cap: 10_000n * MathLib.WAD,
      pendingCap: { value: 15n * MathLib.WAD, validAt: TIMESTAMP },
      maxIn: 15n * MathLib.WAD,
      maxOut: 0n,
    }),
    [sourceParams.id]: makeVaultMarketConfig({
      vault: OTHER_VAULT,
      marketId: sourceParams.id,
      cap: 10_000n * MathLib.WAD,
      maxIn: 0n,
      maxOut: 15n * MathLib.WAD,
    }),
  };

  return input;
};

describe("ReallocationData SimulationState parity", () => {
  test("matches preserved getter happy paths", () => {
    const input = makeBaseInput();
    const data = new ReallocationData(input);
    const legacy = makeLegacyState(makeBaseInput());

    expect(data.getMarket(targetParams.id).id).toEqual(
      legacy.getMarket(targetParams.id).id,
    );
    expect(data.getVault(VAULT).address).toEqual(
      legacy.getVault(VAULT).address,
    );
    expect(data.getPosition(VAULT, sourceParams.id).supplyShares).toEqual(
      legacy.getPosition(VAULT, sourceParams.id).supplyShares,
    );
    expect(
      data.getAccrualPosition(VAULT, sourceParams.id).accrueInterest(TIMESTAMP)
        .supplyAssets,
    ).toEqual(
      legacy
        .getAccrualPosition(VAULT, sourceParams.id)
        .accrueInterest(TIMESTAMP).supplyAssets,
    );
    expect(
      data.getVaultMarketConfig(VAULT, sourceParams.id).publicAllocatorConfig
        ?.maxOut,
    ).toEqual(
      legacy.getVaultMarketConfig(VAULT, sourceParams.id).publicAllocatorConfig
        ?.maxOut,
    );
    expect(
      snapshotPreservedState(data, {
        marketIds: [targetParams.id, sourceParams.id],
        vaults: [VAULT],
      }),
    ).toEqual(
      snapshotPreservedState(legacy, {
        marketIds: [targetParams.id, sourceParams.id],
        vaults: [VAULT],
      }),
    );
  });

  test("matches preserved getter sad paths", () => {
    const data = new ReallocationData({ chainId: ChainId.EthMainnet });
    const legacy = makeLegacyState({
      chainId: ChainId.EthMainnet,
      markets: {},
      vaults: {},
      positions: {},
      vaultMarketConfigs: {},
    });
    const missingMarket = `0x${"33".repeat(32)}` as MarketId;

    expect(() => data.getMarket(missingMarket)).toThrow();
    expect(() => legacy.getMarket(missingMarket)).toThrow();
    expect(() => data.getVault(VAULT)).toThrow();
    expect(() => legacy.getVault(VAULT)).toThrow();
    expect(() => data.getPosition(VAULT, missingMarket)).toThrow();
    expect(() => legacy.getPosition(VAULT, missingMarket)).toThrow();
    expect(() => data.getAccrualPosition(VAULT, missingMarket)).toThrow();
    expect(() => legacy.getAccrualPosition(VAULT, missingMarket)).toThrow();
    expect(() => data.getVaultMarketConfig(VAULT, missingMarket)).toThrow();
    expect(() => legacy.getVaultMarketConfig(VAULT, missingMarket)).toThrow();
  });

  test.each([
    {
      name: "disabled allocator",
      input: makeBaseInput,
      options: { enabled: false },
    },
    {
      name: "empty reallocatable vault list",
      input: makeBaseInput,
      options: { reallocatableVaults: [] },
    },
    {
      name: "unknown reallocatable vault",
      input: makeBaseInput,
      options: { reallocatableVaults: [zeroAddress] },
    },
    {
      name: "caller-provided vault casing",
      input: makeBaseInput,
      options: { reallocatableVaults: [VAULT.toLowerCase() as Address] },
    },
    {
      name: "duplicate caller-provided vaults are normalized and deduped",
      input: makeBaseInput,
      options: {
        defaultMaxWithdrawalUtilization: MathLib.WAD,
        reallocatableVaults: [VAULT, VAULT.toLowerCase() as Address],
      },
    },
    {
      name: "source-specific withdrawal utilization override",
      input: makeBaseInput,
      options: {
        defaultMaxWithdrawalUtilization: MathLib.WAD,
        maxWithdrawalUtilization: {
          [sourceParams.id]: 51_0000000000000000n,
        },
      },
    },
    {
      name: "pending cap and repeated withdrawals",
      input: () => {
        const input = makeBaseInput();
        input.vaultMarketConfigs[VAULT]![targetParams.id] =
          makeVaultMarketConfig({
            marketId: targetParams.id,
            cap: 10_000n * MathLib.WAD,
            pendingCap: { value: 10n * MathLib.WAD, validAt: TIMESTAMP },
            maxIn: 10_000n * MathLib.WAD,
            maxOut: 0n,
          });
        input.vaultMarketConfigs[VAULT]![sourceParams.id] =
          makeVaultMarketConfig({
            marketId: sourceParams.id,
            cap: 10_000n * MathLib.WAD,
            maxIn: 0n,
            maxOut: 10n * MathLib.WAD,
          });

        return input;
      },
      options: { defaultMaxWithdrawalUtilization: MathLib.WAD },
    },
    {
      name: "disabled target vault-market config filters the vault",
      input: () => {
        const input = makeBaseInput();
        input.vaultMarketConfigs[VAULT]![targetParams.id] =
          makeVaultMarketConfig({
            marketId: targetParams.id,
            cap: 10_000n * MathLib.WAD,
            enabled: false,
            maxIn: 10_000n * MathLib.WAD,
            maxOut: 0n,
          });

        return input;
      },
    },
    {
      name: "configured vault missing from vault map is skipped",
      input: () => {
        const input = makeBaseInput();
        delete input.vaults[VAULT];

        return input;
      },
    },
    {
      name: "missing source position is skipped",
      input: () => {
        const input = makeBaseInput();
        delete input.positions[VAULT]![sourceParams.id];

        return input;
      },
      options: { defaultMaxWithdrawalUtilization: MathLib.WAD },
    },
    {
      name: "missing source market is skipped and other vaults continue",
      input: makeMultiVaultInput,
      options: { defaultMaxWithdrawalUtilization: MathLib.WAD },
    },
    {
      name: "missing target public allocator config filters the vault",
      input: () => {
        const input = makeMultiVaultInput();
        input.vaultMarketConfigs[VAULT]![targetParams.id] =
          makeVaultMarketConfig({
            marketId: targetParams.id,
            cap: 10_000n * MathLib.WAD,
            maxIn: 30n * MathLib.WAD,
            maxOut: 0n,
            withPublicAllocatorConfig: false,
          });
        delete input.vaultMarketConfigs[OTHER_VAULT];

        return input;
      },
    },
    {
      name: "missing source public allocator config skips that source",
      input: () => {
        const input = makeMultiVaultInput();
        input.vaultMarketConfigs[VAULT]![sourceParams.id] =
          makeVaultMarketConfig({
            marketId: sourceParams.id,
            cap: 10_000n * MathLib.WAD,
            maxIn: 0n,
            maxOut: 10n * MathLib.WAD,
            withPublicAllocatorConfig: false,
          });
        delete input.vaultMarketConfigs[OTHER_VAULT];

        return input;
      },
      options: { defaultMaxWithdrawalUtilization: MathLib.WAD },
    },
  ])("matches public allocator parity for $name", ({ input, options }) => {
    expectPublicReallocationParity({
      input,
      options,
    });
  });

  test("matches public allocator parity through the timestamp overload", () => {
    const reallocationResult = new ReallocationData(
      makeBaseInput(),
    ).getMarketPublicReallocations(targetParams.id, TIMESTAMP, {
      defaultMaxWithdrawalUtilization: MathLib.WAD,
    });
    const legacyResult = makeLegacyState(
      makeBaseInput(),
    ).getMarketPublicReallocations(targetParams.id, {
      delay: 0n,
      defaultMaxWithdrawalUtilization: MathLib.WAD,
    });

    expect(reallocationResult.withdrawals).toEqual(legacyResult.withdrawals);
    expect(
      snapshotPreservedState(reallocationResult.data, {
        marketIds: [targetParams.id, sourceParams.id],
        vaults: [VAULT],
      }),
    ).toEqual(
      snapshotPreservedState(legacyResult.data, {
        marketIds: [targetParams.id, sourceParams.id],
        vaults: [VAULT],
      }),
    );
  });
});

describe("ReallocationData unit coverage", () => {
  test("clones inputs and exposes getters without sharing mutable entity instances", () => {
    const emptyData = new ReallocationData({ chainId: ChainId.EthMainnet });
    expect(emptyData.markets).toEqual({});
    expect(emptyData.vaults).toEqual({});
    expect(emptyData.positions).toEqual({});
    expect(emptyData.vaultMarketConfigs).toEqual({});

    const input = makeInput({
      targetSupply: 1000n * MathLib.WAD,
      targetBorrow: 500n * MathLib.WAD,
      sourceSupply: 1000n * MathLib.WAD,
      sourceBorrow: 500n * MathLib.WAD,
    });
    const data = new ReallocationData({
      ...input,
      markets: { ...input.markets, ["0x00" as MarketId]: undefined },
      vaults: { ...input.vaults, [zeroAddress]: undefined },
      positions: {
        ...input.positions,
        [zeroAddress]: { ["0x00" as MarketId]: undefined },
      },
      vaultMarketConfigs: {
        ...input.vaultMarketConfigs,
        [zeroAddress]: { ["0x00" as MarketId]: undefined },
      },
    });
    const clone = data.clone();

    expect(data.chainId).toBe(ChainId.EthMainnet);
    expect(data.getMarket(targetParams.id)).not.toBe(
      input.markets![targetParams.id],
    );
    expect(data.getVault(VAULT)).not.toBe(input.vaults![VAULT]);
    expect(data.getPosition(VAULT, sourceParams.id)).not.toBe(
      input.positions![VAULT]![sourceParams.id],
    );
    expect(data.getVaultMarketConfig(VAULT, sourceParams.id)).not.toBe(
      input.vaultMarketConfigs![VAULT]![sourceParams.id],
    );
    expect(clone.getMarket(targetParams.id)).not.toBe(
      data.getMarket(targetParams.id),
    );
    expect(data.getPosition(VAULT, sourceParams.id).supplyShares).toBe(
      1000n * MathLib.WAD,
    );

    const missingMarket = `0x${"11".repeat(32)}` as MarketId;
    const missingAddress =
      "0x000000000000000000000000000000000000dEaD" as Address;
    expect(() => data.getMarket(missingMarket)).toThrow(
      UnknownReallocationMarketError,
    );
    expect(() => data.getVault(missingAddress)).toThrow(
      UnknownReallocationVaultError,
    );
    expect(() => data.getPosition(missingAddress, missingMarket)).toThrow(
      UnknownReallocationPositionError,
    );
    expect(() =>
      data.getVaultMarketConfig(missingAddress, missingMarket),
    ).toThrow(UnknownReallocationVaultMarketConfigError);
  });

  test("handles allocator options, filtering, pending caps, and repeated withdrawals", () => {
    const input = makeInput({
      targetSupply: 1000n * MathLib.WAD,
      targetBorrow: 500n * MathLib.WAD,
      sourceSupply: 1000n * MathLib.WAD,
      sourceBorrow: 500n * MathLib.WAD,
    });
    input.vaultMarketConfigs![VAULT]![targetParams.id] = makeVaultMarketConfig({
      marketId: targetParams.id,
      cap: 10_000n * MathLib.WAD,
      pendingCap: { value: 10n * MathLib.WAD, validAt: TIMESTAMP },
      maxIn: 10_000n * MathLib.WAD,
      maxOut: 0n,
    });
    input.vaultMarketConfigs![VAULT]![sourceParams.id] = makeVaultMarketConfig({
      marketId: sourceParams.id,
      cap: 10_000n * MathLib.WAD,
      maxIn: 0n,
      maxOut: 10n * MathLib.WAD,
    });
    const data = new ReallocationData(input);

    expect(
      data.getMarketPublicReallocations(targetParams.id, { enabled: false }),
    ).toEqual({ withdrawals: [], data });
    expect(
      data.getMarketPublicReallocations(targetParams.id, undefined, {
        timestamp: TIMESTAMP,
        reallocatableVaults: [],
      }).withdrawals,
    ).toEqual([]);
    expect(
      data.getMarketPublicReallocations(targetParams.id, {
        reallocatableVaults: [zeroAddress],
      }).withdrawals,
    ).toEqual([]);

    const { withdrawals, data: reallocatedData } =
      data.getMarketPublicReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
        defaultMaxWithdrawalUtilization: MathLib.WAD,
      });

    expect(withdrawals).toEqual([
      {
        vault: VAULT,
        id: sourceParams.id,
        assets: 10n * MathLib.WAD,
      },
    ]);
    expect(
      reallocatedData.getMarketPublicReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
        defaultMaxWithdrawalUtilization: MathLib.WAD,
      }).withdrawals,
    ).toEqual([]);
    expect(data.getMarket(targetParams.id).totalSupplyAssets).toBe(
      1000n * MathLib.WAD,
    );
    expect(reallocatedData.getMarket(targetParams.id).totalSupplyAssets).toBe(
      1010n * MathLib.WAD,
    );
    expect(
      reallocatedData.getVault(VAULT).publicAllocatorConfig?.accruedFee,
    ).toBe(13n);
  });

  test("skips unusable source markets and missing public allocator limits", () => {
    const missingMarket = `0x${"22".repeat(32)}` as MarketId;
    const input = makeInput({
      targetSupply: 1000n * MathLib.WAD,
      targetBorrow: 500n * MathLib.WAD,
      sourceSupply: 1000n * MathLib.WAD,
      sourceBorrow: 500n * MathLib.WAD,
    });
    input.markets![alternateSourceParams.id] = makeMarket(
      alternateSourceParams,
      {
        supply: 1000n * MathLib.WAD,
        borrow: 100n * MathLib.WAD,
      },
    );
    input.positions![VAULT]![alternateSourceParams.id] = makePosition(
      alternateSourceParams.id,
      1000n * MathLib.WAD,
    );
    input.vaults![VAULT] = makeVault({
      withdrawQueue: [
        missingMarket,
        sourceParams.id,
        alternateSourceParams.id,
        targetParams.id,
      ],
    });
    input.vaultMarketConfigs![VAULT]![targetParams.id] = makeVaultMarketConfig({
      marketId: targetParams.id,
      cap: 10_000n * MathLib.WAD,
      pendingCap: { value: 30n * MathLib.WAD, validAt: TIMESTAMP },
      maxIn: 30n * MathLib.WAD,
      maxOut: 0n,
    });
    input.vaultMarketConfigs![VAULT]![sourceParams.id] = makeVaultMarketConfig({
      marketId: sourceParams.id,
      cap: 10_000n * MathLib.WAD,
      maxIn: 0n,
      maxOut: 10n * MathLib.WAD,
    });
    input.vaultMarketConfigs![VAULT]![alternateSourceParams.id] =
      makeVaultMarketConfig({
        marketId: alternateSourceParams.id,
        cap: 10_000n * MathLib.WAD,
        maxIn: 0n,
        maxOut: 20n * MathLib.WAD,
      });
    input.vaults![OTHER_VAULT] = makeVault({
      address: OTHER_VAULT,
      withdrawQueue: [sourceParams.id, targetParams.id],
    });
    input.positions![OTHER_VAULT] = {
      [targetParams.id]: makePosition(targetParams.id, 0n, OTHER_VAULT),
      [sourceParams.id]: makePosition(
        sourceParams.id,
        1000n * MathLib.WAD,
        OTHER_VAULT,
      ),
    };
    input.vaultMarketConfigs![OTHER_VAULT] = {
      [targetParams.id]: makeVaultMarketConfig({
        vault: OTHER_VAULT,
        marketId: targetParams.id,
        cap: 10_000n * MathLib.WAD,
        pendingCap: { value: 15n * MathLib.WAD, validAt: TIMESTAMP },
        maxIn: 15n * MathLib.WAD,
        maxOut: 0n,
      }),
      [sourceParams.id]: makeVaultMarketConfig({
        vault: OTHER_VAULT,
        marketId: sourceParams.id,
        cap: 10_000n * MathLib.WAD,
        maxIn: 0n,
        maxOut: 15n * MathLib.WAD,
      }),
    };

    expect(
      new ReallocationData(input).getMarketPublicReallocations(
        targetParams.id,
        {
          timestamp: TIMESTAMP,
          defaultMaxWithdrawalUtilization: MathLib.WAD,
        },
      ).withdrawals,
    ).toEqual([
      {
        vault: VAULT,
        id: alternateSourceParams.id,
        assets: 20n * MathLib.WAD,
      },
      {
        vault: OTHER_VAULT,
        id: sourceParams.id,
        assets: 15n * MathLib.WAD,
      },
      {
        vault: VAULT,
        id: sourceParams.id,
        assets: 10n * MathLib.WAD,
      },
    ]);

    expect(
      new ReallocationData({
        ...input,
        vaultMarketConfigs: {
          [VAULT]: {
            ...input.vaultMarketConfigs![VAULT]!,
            [targetParams.id]: makeVaultMarketConfig({
              marketId: targetParams.id,
              cap: 10_000n * MathLib.WAD,
              maxIn: 30n * MathLib.WAD,
              maxOut: 0n,
              withPublicAllocatorConfig: false,
            }),
          },
        },
      }).getMarketPublicReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
      }).withdrawals,
    ).toEqual([]);

    expect(
      new ReallocationData({
        ...input,
        vaultMarketConfigs: {
          [VAULT]: {
            ...input.vaultMarketConfigs![VAULT]!,
            [sourceParams.id]: makeVaultMarketConfig({
              marketId: sourceParams.id,
              cap: 10_000n * MathLib.WAD,
              maxIn: 0n,
              maxOut: 10n * MathLib.WAD,
              withPublicAllocatorConfig: false,
            }),
          },
        },
      }).getMarketPublicReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
        defaultMaxWithdrawalUtilization: MathLib.WAD,
      }).withdrawals,
    ).toEqual([
      {
        vault: VAULT,
        id: alternateSourceParams.id,
        assets: 20n * MathLib.WAD,
      },
    ]);

    expect(
      new ReallocationData({
        ...input,
        vaultMarketConfigs: {
          [VAULT]: {
            ...input.vaultMarketConfigs![VAULT]!,
            [sourceParams.id]: makeVaultMarketConfig({
              marketId: sourceParams.id,
              cap: 10_000n * MathLib.WAD,
              enabled: false,
              maxIn: 0n,
              maxOut: 10n * MathLib.WAD,
            }),
          },
        },
      }).getMarketPublicReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
        defaultMaxWithdrawalUtilization: MathLib.WAD,
      }).withdrawals,
    ).toEqual([
      {
        vault: VAULT,
        id: alternateSourceParams.id,
        assets: 20n * MathLib.WAD,
      },
    ]);
  });

  test("throws typed errors for impossible direct apply states", () => {
    const baseInput = makeInput({
      targetSupply: 1000n * MathLib.WAD,
      targetBorrow: 500n * MathLib.WAD,
      sourceSupply: 1000n * MathLib.WAD,
      sourceBorrow: 500n * MathLib.WAD,
    });
    const withdrawal = {
      vault: VAULT,
      id: sourceParams.id,
      assets: MathLib.WAD,
    } satisfies PublicReallocation;

    expect(() =>
      applyPublicReallocation(
        new ReallocationData({
          ...baseInput,
          vaults: {
            [VAULT]: makeVault({ withoutPublicAllocatorConfig: true }),
          },
        }),
        withdrawal,
      ),
    ).toThrow(MissingPublicAllocatorConfigError);

    expect(() =>
      applyPublicReallocation(
        new ReallocationData({
          ...baseInput,
          vaultMarketConfigs: {
            [VAULT]: {
              ...baseInput.vaultMarketConfigs![VAULT]!,
              [sourceParams.id]: makeVaultMarketConfig({
                marketId: sourceParams.id,
                cap: 10_000n * MathLib.WAD,
                maxIn: 0n,
                maxOut: 10_000n * MathLib.WAD,
                withPublicAllocatorConfig: false,
              }),
            },
          },
        }),
        withdrawal,
      ),
    ).toThrow(UnknownReallocationVaultMarketConfigError);

    expect(() =>
      applyPublicReallocation(
        new ReallocationData({
          ...baseInput,
          vaultMarketConfigs: {
            [VAULT]: {
              ...baseInput.vaultMarketConfigs![VAULT]!,
              [targetParams.id]: makeVaultMarketConfig({
                marketId: targetParams.id,
                cap: 10_000n * MathLib.WAD,
                maxIn: 10_000n * MathLib.WAD,
                maxOut: 0n,
                withPublicAllocatorConfig: false,
              }),
            },
          },
        }),
        withdrawal,
      ),
    ).toThrow(UnknownReallocationVaultMarketConfigError);

    expect(() =>
      applyPublicReallocation(
        new ReallocationData({
          ...baseInput,
          vaultMarketConfigs: {
            [VAULT]: {
              ...baseInput.vaultMarketConfigs![VAULT]!,
              [sourceParams.id]: makeVaultMarketConfig({
                marketId: sourceParams.id,
                cap: 10_000n * MathLib.WAD,
                enabled: false,
                maxIn: 0n,
                maxOut: 10_000n * MathLib.WAD,
              }),
            },
          },
        }),
        withdrawal,
      ),
    ).toThrow(DisabledReallocationMarketError);

    expect(() =>
      applyPublicReallocation(
        new ReallocationData({
          ...baseInput,
          vaultMarketConfigs: {
            [VAULT]: {
              ...baseInput.vaultMarketConfigs![VAULT]!,
              [targetParams.id]: makeVaultMarketConfig({
                marketId: targetParams.id,
                cap: 10_000n * MathLib.WAD,
                enabled: false,
                maxIn: 10_000n * MathLib.WAD,
                maxOut: 0n,
              }),
            },
          },
        }),
        withdrawal,
      ),
    ).toThrow(DisabledReallocationMarketError);
  });
});
