import {
  type ActionOutput,
  isRequirementSignature,
} from "@morpho-org/morpho-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import { type Address, type Chain, ethAddress, isAddressEqual } from "viem";
import { expect } from "vitest";
import {
  type SimulationResult,
  simulate,
  toSimulationLimits,
} from "../../src/index.js";

/** A tracked balance delta that differs from simulation, or has no measurement. */
export interface E2eMidnightMismatch {
  readonly account: Address;
  readonly token: Address;
  readonly expected: bigint;
  readonly actual: bigint | undefined;
}

/** Compares every wallet/token pair and rejects untracked simulated tokens for tracked wallets. */
export const compareE2eMidnightChanges = (params: {
  readonly assetChanges: SimulationResult["assetChanges"];
  readonly wallets: readonly Address[];
  readonly tokens: readonly Address[];
  readonly deltas: readonly {
    readonly account: Address;
    readonly token: Address;
    readonly diff: bigint;
  }[];
  readonly sender: Address;
  readonly gasFees: bigint;
}): readonly E2eMidnightMismatch[] => {
  const mismatches: E2eMidnightMismatch[] = [];
  for (const account of params.wallets) {
    const changes =
      params.assetChanges.find((entry) =>
        isAddressEqual(entry.account, account),
      )?.changes ?? [];
    for (const token of params.tokens) {
      const expected =
        changes.find((entry) => isAddressEqual(entry.token, token))?.diff ?? 0n;
      const measured = params.deltas.find(
        (entry) =>
          isAddressEqual(entry.account, account) &&
          isAddressEqual(entry.token, token),
      );
      const actual =
        measured == null
          ? undefined
          : measured.diff +
            (isAddressEqual(token, ethAddress) &&
            isAddressEqual(account, params.sender)
              ? params.gasFees
              : 0n);
      if (actual !== expected)
        mismatches.push({ account, token, expected, actual });
    }
    for (const { token, diff } of changes) {
      if (
        diff !== 0n &&
        !params.tokens.some((tracked) => isAddressEqual(tracked, token))
      )
        mismatches.push({ account, token, expected: diff, actual: undefined });
    }
  }
  return mismatches;
};

/** Signature requirements cannot be sent as onchain E2E calls. */
export class E2eMidnightSignatureRequirementError extends Error {
  public constructor() {
    super(
      "Expected onchain requirements; disable signature support for this E2E flow",
    );
    this.name = "E2eMidnightSignatureRequirementError";
  }
}

/** The executed bundle did not match simulation for at least one tracked balance. */
export class E2eMidnightSimulationMismatchError extends Error {
  public constructor(
    public readonly mismatches: readonly E2eMidnightMismatch[],
  ) {
    super(
      mismatches
        .map(
          ({ account, token, expected, actual }) =>
            `${account}/${token}: expected "${expected}", got "${actual ?? "untracked"}"`,
        )
        .join("; "),
    );
    this.name = "E2eMidnightSimulationMismatchError";
  }
}

/**
 * Simulates all onchain requirements and the built transaction before sending any of them.
 * Measures all wallet/token pairs, including native ETH when ethAddress is tracked. Gas is
 * excluded from simulation; execution adds back receipt execution fees and any reported L1 fee.
 * An unreported chain-specific fee fails comparison rather than being silently ignored.
 */
export const sendE2eMidnightSimulated = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly chainId: number;
    readonly account: Address;
    readonly output: {
      readonly getRequirements: () => ReturnType<
        ActionOutput["getRequirements"]
      >;
      readonly buildTx: () => ReturnType<ActionOutput["buildTx"]>;
    };
    readonly wallets: readonly Address[];
    readonly tokens: readonly Address[];
    readonly limits?: Omit<Parameters<typeof toSimulationLimits>[1], "owner">;
    /** Optional execution gas price, for exercising native fee normalization on forks. */
    readonly gasPrice?: bigint;
    /** Test fault injection after balance snapshots, before the first transaction is sent. */
    readonly beforeSend?: () => Promise<void>;
  },
) => {
  expect(params.wallets.length).toBeGreaterThan(0);
  expect(params.tokens.length).toBeGreaterThan(0);
  expect(
    params.wallets.some((wallet) => isAddressEqual(wallet, params.account)),
  ).toBe(true);
  const requirements = await params.output.getRequirements();
  const calls = requirements.map((requirement) => {
    if (isRequirementSignature(requirement))
      throw new E2eMidnightSignatureRequirementError();
    return requirement;
  });
  const tx = params.output.buildTx();
  const transactions = [...calls, tx].map(({ to, data, value }) => ({
    from: params.account,
    to,
    data,
    value,
  }));
  expect(client.transport.url).toBeDefined();
  const result = await simulate(
    {
      timeoutMs: 30_000,
      chains: new Map([
        [params.chainId, { simulateV1Url: client.transport.url! }],
      ]),
    },
    {
      chainId: params.chainId,
      blockNumber: await client.getBlockNumber({ cacheTime: 0 }),
      transactions,
      limits: toSimulationLimits(tx.action, {
        ...params.limits,
        owner: params.account,
      }),
    },
  );
  const pairs = params.wallets.flatMap((account) =>
    params.tokens.map((token) => ({ account, token })),
  );
  const read = () =>
    Promise.all(
      pairs.map(({ account, token }) =>
        isAddressEqual(token, ethAddress)
          ? client.getBalance({ address: account })
          : client.balanceOf({ erc20: token, owner: account }),
      ),
    );
  const before = await read();
  await params.beforeSend?.();
  let gasFees = 0n;
  for (const transaction of transactions) {
    const { timestamp } = await client.getBlock();
    await client.setNextBlockTimestamp({
      timestamp:
        result.verification.blockTimestamp > timestamp
          ? result.verification.blockTimestamp
          : timestamp,
    });
    const hash = await client.sendTransaction({
      ...transaction,
      account: params.account,
      gas: 8_000_000n,
      ...(params.gasPrice == null ? {} : { gasPrice: params.gasPrice }),
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    gasFees += receipt.gasUsed * receipt.effectiveGasPrice;
    if (
      "l1Fee" in receipt &&
      (typeof receipt.l1Fee === "bigint" || typeof receipt.l1Fee === "string")
    )
      gasFees += BigInt(receipt.l1Fee);
  }
  const after = await read();
  const mismatches = compareE2eMidnightChanges({
    ...params,
    assetChanges: result.assetChanges,
    sender: params.account,
    gasFees,
    deltas: pairs.map((pair, i) => ({ ...pair, diff: after[i]! - before[i]! })),
  });
  if (mismatches.length > 0)
    throw new E2eMidnightSimulationMismatchError(mismatches);
  return { result, gasFees };
};
