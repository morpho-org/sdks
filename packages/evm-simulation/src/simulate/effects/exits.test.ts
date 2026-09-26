import { type Address, getAddress, zeroAddress } from "viem";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type { VerificationDiff } from "../../domain/evidence.js";
import type { EffectiveSimulationLimits } from "../../domain/limits.js";
import type { DecodedOperation } from "../../domain/operations.js";
import type { DecodedBundle } from "../../domain/stages.js";
import { brandPinned } from "../../domain/stages.js";
import {
  AssetChangeMismatchError,
  StateChangeMismatchError,
} from "../../errors.js";
import {
  FIXTURE_ADAPTER,
  FIXTURE_MARKET_ID,
  FIXTURE_NOW,
  FIXTURE_OWNER,
  FIXTURE_TOKEN,
  FIXTURE_VAULT,
  FIXTURE_VAULT_V2,
  fixturePosition,
  fixtureSnapshot,
  fixtureVault,
} from "../../test-helpers/index.js";
import { verifyExitOperation } from "./exits.js";

const context: SimulationErrorContext = {
  stage: "verification",
  chainId: 1,
  mode: "final",
};

const limits: EffectiveSimulationLimits = {
  maxSlippageWad: 10n ** 15n,
  minLltvBufferWad: 0n,
  maxSignatureLifetimeSeconds: 7200n,
  wallet: { maxDebit: [], minCredit: [] },
  operations: [],
};

const emptyDiff: VerificationDiff = {
  wallet: [],
  permissions: [],
  positions: [],
  vaults: [],
  markets: [],
};

const bundle = {} as DecodedBundle;
const inputs = brandPinned({
  bundle,
  context: {
    chainId: 1,
    stateBlockNumber: 20_000_000n,
    stateBlockHash: `0x${"ab".repeat(32)}`,
    stateBlockTimestamp: FIXTURE_NOW,
    blockNumber: 20_000_000n,
    blockTimestamp: FIXTURE_NOW,
  },
  before: fixtureSnapshot(),
  internals: { vaultData: new Map() },
});

type ExitOp = Extract<
  DecodedOperation,
  {
    readonly type:
      | "vaultV1MigrateToV2"
      | "vaultV2ForceWithdraw"
      | "vaultV2ForceRedeem"
      | "vaultV1InKindRedeem"
      | "vaultV2InKindRedeem";
  }
>;

const baseOp = (type: string, fields: object): ExitOp =>
  ({
    type,
    transactionIndex: 0,
    callPath: [],
    chainId: 1,
    deployment: FIXTURE_VAULT,
    owner: FIXTURE_OWNER,
    deadline: FIXTURE_NOW + 600n,
    referralFee: { rateWad: 0n, recipient: FIXTURE_OWNER },
    asset: FIXTURE_TOKEN,
    onBehalf: FIXTURE_OWNER,
    receiver: FIXTURE_OWNER,
    ...fields,
  }) as unknown as ExitOp;

const v2 = (overrides: object = {}) =>
  fixtureVault({
    type: "vaultV2",
    vault: FIXTURE_VAULT_V2,
    managementFeeWad: 0n,
    managementFeeRecipient: FIXTURE_OWNER,
    maxRatePerSecondWad: 0n,
    lastUpdate: FIXTURE_NOW,
    recordedTotalAssets: 10_000n,
    virtualShares: 1n,
    liquidityAdapter: zeroAddress,
    lastTotalAssets: undefined,
    decimalsOffset: undefined,
    ...overrides,
  } as never);

describe("verifyExitOperation", () => {
  test("migrate: passes on preview-matched burn/mint with no wallet touch", () => {
    const source = fixtureVault();
    const target = v2();
    const burned = 400n;
    const assetsOut = 400n; // shares-mode amount coerced: use assets mode
    const expectedMinted =
      (assetsOut * (target.totalShares + 1n)) / (10_000n + 1n);
    const before = fixtureSnapshot({ vaults: [source, target] });
    const after = fixtureSnapshot({
      vaults: [
        fixtureVault({ ownerShares: 1_000n - burned }),
        v2({
          ownerShares: 1_000n + expectedMinted,
          totalShares: 10_000n + expectedMinted,
          totalAssets: 10_000n + assetsOut,
        }),
      ],
    });
    const result = verifyExitOperation({
      bundle,
      operation: baseOp("vaultV1MigrateToV2", {
        sourceVault: FIXTURE_VAULT,
        targetVault: FIXTURE_VAULT_V2,
        amount: { type: "assets", assets: assetsOut },
        tokenSignature: { type: "none" },
        route: "vaultBundlesV1",
        maxTargetSharePriceE27: 0n,
      }),
      inputs,
      before,
      accruedBefore: before,
      after,
      actionDiff: emptyDiff,
      limits,
      context,
    });
    expect(
      (result.outcome as { targetSharesMinted: bigint }).targetSharesMinted,
    ).toBe(expectedMinted);
  });

  test("migrate error: AssetChangeMismatchError when wallet gains the asset", () => {
    const source = fixtureVault();
    const target = v2();
    const assetsOut = 400n;
    const expectedMinted =
      (assetsOut * (target.totalShares + 1n)) / (10_000n + 1n);
    const before = fixtureSnapshot({ vaults: [source, target] });
    const after = fixtureSnapshot({
      vaults: [
        fixtureVault({ ownerShares: 600n }),
        v2({
          ownerShares: 1_000n + expectedMinted,
          totalShares: 10_000n + expectedMinted,
        }),
      ],
    });
    const diff: VerificationDiff = {
      ...emptyDiff,
      wallet: [{ account: FIXTURE_OWNER, token: FIXTURE_TOKEN, assets: 5n }],
    };
    expect(() =>
      verifyExitOperation({
        bundle,
        operation: baseOp("vaultV1MigrateToV2", {
          sourceVault: FIXTURE_VAULT,
          targetVault: FIXTURE_VAULT_V2,
          amount: { type: "assets", assets: assetsOut },
          tokenSignature: { type: "none" },
          route: "vaultBundlesV1",
          maxTargetSharePriceE27: 0n,
        }),
        inputs,
        before,
        accruedBefore: before,
        after,
        actionDiff: diff,
        limits,
        context,
      }),
    ).toThrow(AssetChangeMismatchError);
  });

  test("forceWithdraw: ordered deallocations drop allocations exactly", () => {
    const allocation = {
      adapter: FIXTURE_ADAPTER,
      marketId: FIXTURE_MARKET_ID,
      assets: 1_000n,
      shares: 1_000n,
      absoluteCapAssets: 0n,
      relativeCapWad: 0n,
      penaltyWad: 0n,
    };
    const before = fixtureSnapshot({
      vaults: [v2({ vault: FIXTURE_VAULT, allocations: [allocation] })],
    });
    const after = fixtureSnapshot({
      vaults: [
        v2({
          vault: FIXTURE_VAULT,
          allocations: [{ ...allocation, assets: 400n }],
          ownerShares: 400n,
          idleAssets: 2_000n - 600n,
        }),
      ],
    });
    const diff: VerificationDiff = {
      ...emptyDiff,
      wallet: [{ account: FIXTURE_OWNER, token: FIXTURE_TOKEN, assets: 600n }],
    };
    const result = verifyExitOperation({
      bundle,
      operation: baseOp("vaultV2ForceWithdraw", {
        vault: FIXTURE_VAULT,
        adapter: FIXTURE_ADAPTER,
        exitAssets: 600n,
        deallocations: [
          {
            adapter: FIXTURE_ADAPTER,
            marketId: FIXTURE_MARKET_ID,
            amount: 600n,
          },
        ],
        minSharePriceE27: 0n,
        tokenSignature: { type: "none" },
        route: "vaultExitBundlesV1",
      }),
      inputs,
      before,
      accruedBefore: before,
      after,
      actionDiff: diff,
      limits,
      context,
    });
    expect((result.outcome as { assetsReceived: bigint }).assetsReceived).toBe(
      600n,
    );
  });

  test("forceWithdraw error: undeclared allocation change → StateChangeMismatchError", () => {
    const a1 = {
      adapter: FIXTURE_ADAPTER,
      marketId: FIXTURE_MARKET_ID,
      assets: 1_000n,
      shares: 1_000n,
      absoluteCapAssets: 0n,
      relativeCapWad: 0n,
      penaltyWad: 0n,
    };
    const OTHER: Address = getAddress(
      "0xCdCDCdCdcdcdcdCdcDcDCdcDcDCdCdcdCdcDCDcD",
    );
    const a2 = { ...a1, adapter: OTHER };
    const before = fixtureSnapshot({
      vaults: [v2({ vault: FIXTURE_VAULT, allocations: [a1, a2] })],
    });
    const after = fixtureSnapshot({
      vaults: [
        v2({
          vault: FIXTURE_VAULT,
          allocations: [
            { ...a1, assets: 400n },
            { ...a2, assets: 900n }, // undeclared change
          ],
          ownerShares: 400n,
          idleAssets: 1_400n,
        }),
      ],
    });
    const diff: VerificationDiff = {
      ...emptyDiff,
      wallet: [{ account: FIXTURE_OWNER, token: FIXTURE_TOKEN, assets: 600n }],
    };
    expect(() =>
      verifyExitOperation({
        bundle,
        operation: baseOp("vaultV2ForceWithdraw", {
          vault: FIXTURE_VAULT,
          adapter: FIXTURE_ADAPTER,
          exitAssets: 600n,
          deallocations: [
            {
              adapter: FIXTURE_ADAPTER,
              marketId: FIXTURE_MARKET_ID,
              amount: 600n,
            },
          ],
          minSharePriceE27: 0n,
          tokenSignature: { type: "none" },
          route: "vaultExitBundlesV1",
        }),
        inputs,
        before,
        accruedBefore: before,
        after,
        actionDiff: diff,
        limits,
        context,
      }),
    ).toThrow(StateChangeMismatchError);
  });

  test("in-kind redeem: owner supply shares increase, no asset credit", () => {
    const before = fixtureSnapshot({
      vaults: [fixtureVault()],
      positions: [fixturePosition({ supplyShares: 100n })],
    });
    const after = fixtureSnapshot({
      vaults: [fixtureVault({ ownerShares: 600n })],
      positions: [fixturePosition({ supplyShares: 150n })],
    });
    const result = verifyExitOperation({
      bundle,
      operation: baseOp("vaultV1InKindRedeem", {
        vault: FIXTURE_VAULT,
        assets: 0n,
        markets: [{ marketId: FIXTURE_MARKET_ID, loanToken: FIXTURE_TOKEN }],
        route: "vaultExitBundlesV1",
        tokenSignature: { type: "none" },
      }),
      inputs,
      before,
      accruedBefore: before,
      after,
      actionDiff: emptyDiff,
      limits,
      context,
    });
    expect((result.outcome as { sharesBurned: bigint }).sharesBurned).toBe(
      400n,
    );
  });

  test("in-kind redeem error: asset credit → StateChangeMismatchError", () => {
    const before = fixtureSnapshot({
      vaults: [fixtureVault()],
      positions: [fixturePosition({ supplyShares: 100n })],
    });
    const after = fixtureSnapshot({
      vaults: [fixtureVault({ ownerShares: 600n })],
      positions: [fixturePosition({ supplyShares: 150n })],
    });
    const diff: VerificationDiff = {
      ...emptyDiff,
      wallet: [{ account: FIXTURE_OWNER, token: FIXTURE_TOKEN, assets: 10n }],
    };
    expect(() =>
      verifyExitOperation({
        bundle,
        operation: baseOp("vaultV1InKindRedeem", {
          vault: FIXTURE_VAULT,
          assets: 0n,
          markets: [{ marketId: FIXTURE_MARKET_ID, loanToken: FIXTURE_TOKEN }],
          route: "vaultExitBundlesV1",
          tokenSignature: { type: "none" },
        }),
        inputs,
        before,
        accruedBefore: before,
        after,
        actionDiff: diff,
        limits,
        context,
      }),
    ).toThrow(StateChangeMismatchError);
  });
});
