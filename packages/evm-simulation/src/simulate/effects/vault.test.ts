import { type Address, getAddress } from "viem";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type { VerificationDiff } from "../../domain/evidence.js";
import type { EffectiveSimulationLimits } from "../../domain/limits.js";
import type { DecodedOperation } from "../../domain/operations.js";
import type { DecodedBundle } from "../../domain/stages.js";
import { brandPinned } from "../../domain/stages.js";
import { StateChangeMismatchError } from "../../errors.js";
import {
  FIXTURE_NOW,
  FIXTURE_OWNER,
  FIXTURE_TOKEN,
  FIXTURE_VAULT,
  FIXTURE_VAULT_V2,
  fixtureSnapshot,
  fixtureVault,
} from "../../test-helpers/index.js";
import { verifyVaultOperation } from "./vault.js";

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

const RECEIVER: Address = getAddress(
  "0x8888888888888888888888888888888888888888",
);

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

type VaultOp = Extract<
  DecodedOperation,
  {
    readonly type:
      | "vaultV1Deposit"
      | "vaultV2Deposit"
      | "vaultV1Withdraw"
      | "vaultV2Withdraw"
      | "vaultV1Redeem"
      | "vaultV2Redeem"
      | "vaultV1MigrateToV2"
      | "vaultV2ForceWithdraw"
      | "vaultV2ForceRedeem"
      | "vaultV1InKindRedeem"
      | "vaultV2InKindRedeem";
  }
>;

const op = (fields: object, type: string): VaultOp =>
  ({
    type,
    transactionIndex: 0,
    callPath: [],
    chainId: 1,
    deployment: FIXTURE_VAULT,
    owner: FIXTURE_OWNER,
    deadline: FIXTURE_NOW + 600n,
    referralFee: { rateWad: 0n, recipient: FIXTURE_OWNER },
    tokenSignature: { type: "none" },
    route: "vaultBundlesV1",
    vault: FIXTURE_VAULT,
    asset: FIXTURE_TOKEN,
    onBehalf: FIXTURE_OWNER,
    receiver: FIXTURE_OWNER,
    ...fields,
  }) as unknown as VaultOp;

describe("verifyVaultOperation", () => {
  test("deposit: passing case credits owner shares and totals", () => {
    const before = fixtureSnapshot({
      vaults: [fixtureVault({ totalAssets: 10_000n, totalShares: 10_000n })],
    });
    // toShares: assets=1000, supply=10000+10^6? decimalsOffset=6 → 1_010_000 ; assets*(supply)/(ta+1)
    const v = fixtureVault({ totalAssets: 10_000n, totalShares: 10_000n });
    const supply = v.totalShares + 10n ** 6n;
    const expectedShares = (1_000n * supply) / (10_000n + 1n);
    const after = fixtureSnapshot({
      vaults: [
        fixtureVault({
          totalAssets: 11_000n,
          totalShares: 10_000n + expectedShares,
          ownerShares: 1_000n + expectedShares,
        }),
      ],
    });
    const result = verifyVaultOperation({
      bundle,
      operation: op(
        { funding: { type: "erc20", token: FIXTURE_TOKEN, assets: 1_000n } },
        "vaultV1Deposit",
      ),
      inputs,
      before,
      accruedBefore: before,
      after,
      actionDiff: emptyDiff,
      limits,
      context,
    });
    expect(
      (result.operation.outcome as { sharesMinted: bigint }).sharesMinted,
    ).toBe(expectedShares);
  });

  test("deposit error: StateChangeMismatchError on wrong minted shares", () => {
    const before = fixtureSnapshot({ vaults: [fixtureVault()] });
    const after = fixtureSnapshot({
      vaults: [
        fixtureVault({
          totalAssets: 11_000n,
          totalShares: 10_005n,
          ownerShares: 1_005n,
        }),
      ],
    });
    expect(() =>
      verifyVaultOperation({
        bundle,
        operation: op(
          { funding: { type: "erc20", token: FIXTURE_TOKEN, assets: 1_000n } },
          "vaultV1Deposit",
        ),
        inputs,
        before,
        accruedBefore: before,
        after,
        actionDiff: emptyDiff,
        limits,
        context,
      }),
    ).toThrow(StateChangeMismatchError);
  });

  test("withdraw: passing case burns preview shares and credits receiver", () => {
    const before = fixtureSnapshot({ vaults: [fixtureVault()] });
    const v = fixtureVault();
    const supply = v.totalShares + 10n ** 6n;
    const shares = (500n * supply + v.totalAssets) / (v.totalAssets + 1n);
    const after = fixtureSnapshot({
      vaults: [
        fixtureVault({
          totalAssets: 9_500n,
          ownerShares: 1_000n - shares,
        }),
      ],
    });
    const diff: VerificationDiff = {
      ...emptyDiff,
      wallet: [{ account: RECEIVER, token: FIXTURE_TOKEN, assets: 500n }],
    };
    const result = verifyVaultOperation({
      bundle,
      operation: op({ assets: 500n, receiver: RECEIVER }, "vaultV1Withdraw"),
      inputs,
      before,
      accruedBefore: before,
      after,
      actionDiff: diff,
      limits,
      context,
    });
    expect(
      (result.operation.outcome as { sharesBurned: bigint }).sharesBurned,
    ).toBe(shares);
  });

  test("withdraw error: receiver credit mismatch fails", () => {
    const before = fixtureSnapshot({ vaults: [fixtureVault()] });
    const v = fixtureVault();
    const supply = v.totalShares + 10n ** 6n;
    const shares = (500n * supply + v.totalAssets) / (v.totalAssets + 1n);
    const after = fixtureSnapshot({
      vaults: [
        fixtureVault({ totalAssets: 9_500n, ownerShares: 1_000n - shares }),
      ],
    });
    expect(() =>
      verifyVaultOperation({
        bundle,
        operation: op({ assets: 500n }, "vaultV1Withdraw"),
        inputs,
        before,
        accruedBefore: before,
        after,
        actionDiff: emptyDiff, // no credit observed
        limits,
        context,
      }),
    ).toThrow(StateChangeMismatchError);
  });

  test("redeem: passing case burns exact shares and credits preview assets", () => {
    const before = fixtureSnapshot({ vaults: [fixtureVault()] });
    const expectedAssets = (200n * (10_000n + 1n)) / (10_000n + 10n ** 6n);
    const after = fixtureSnapshot({
      vaults: [fixtureVault({ ownerShares: 800n })],
    });
    const diff: VerificationDiff = {
      ...emptyDiff,
      wallet: [
        { account: RECEIVER, token: FIXTURE_TOKEN, assets: expectedAssets },
      ],
    };
    const result = verifyVaultOperation({
      bundle,
      operation: op({ shares: 200n, receiver: RECEIVER }, "vaultV1Redeem"),
      inputs,
      before,
      accruedBefore: before,
      after,
      actionDiff: diff,
      limits,
      context,
    });
    expect(
      (result.operation.outcome as { assetsReceived: bigint }).assetsReceived,
    ).toBe(expectedAssets);
  });

  test("redeem error: wrong burned share count fails", () => {
    const before = fixtureSnapshot({ vaults: [fixtureVault()] });
    const after = fixtureSnapshot({
      vaults: [fixtureVault({ ownerShares: 850n })],
    });
    expect(() =>
      verifyVaultOperation({
        bundle,
        operation: op({ shares: 200n }, "vaultV1Redeem"),
        inputs,
        before,
        accruedBefore: before,
        after,
        actionDiff: emptyDiff,
        limits,
        context,
      }),
    ).toThrow(StateChangeMismatchError);
  });

  test("deposit V2: rate-cap via totalAssets + assets", () => {
    const v2 = fixtureVault({
      type: "vaultV2",
      vault: FIXTURE_VAULT_V2,
      managementFeeWad: 0n,
      managementFeeRecipient: FIXTURE_OWNER,
      maxRatePerSecondWad: 0n,
      lastUpdate: FIXTURE_NOW,
      recordedTotalAssets: 10_000n,
      virtualShares: 1n,
      liquidityAdapter: getAddress(
        "0x0000000000000000000000000000000000000000",
      ),
      lastTotalAssets: undefined,
      decimalsOffset: undefined,
    } as never);
    const before = fixtureSnapshot({ vaults: [v2] });
    const supply = v2.totalShares + 1n;
    const expectedShares = (1_000n * supply) / (10_000n + 1n);
    const after = fixtureSnapshot({
      vaults: [
        fixtureVault({
          type: "vaultV2",
          vault: FIXTURE_VAULT_V2,
          totalAssets: 11_000n,
          totalShares: 10_000n + expectedShares,
          ownerShares: 1_000n + expectedShares,
          managementFeeWad: 0n,
          managementFeeRecipient: FIXTURE_OWNER,
          maxRatePerSecondWad: 0n,
          lastUpdate: FIXTURE_NOW,
          recordedTotalAssets: 10_000n,
          virtualShares: 1n,
          liquidityAdapter: getAddress(
            "0x0000000000000000000000000000000000000000",
          ),
        } as never),
      ],
    });
    const result = verifyVaultOperation({
      bundle,
      operation: op(
        {
          vault: FIXTURE_VAULT_V2,
          funding: { type: "erc20", token: FIXTURE_TOKEN, assets: 1_000n },
        },
        "vaultV2Deposit",
      ),
      inputs,
      before,
      accruedBefore: before,
      after,
      actionDiff: emptyDiff,
      limits,
      context,
    });
    expect(
      (result.operation.outcome as { sharesMinted: bigint }).sharesMinted,
    ).toBe(expectedShares);
  });
});
