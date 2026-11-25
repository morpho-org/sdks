import {
  type ActionRequirement,
  isRequirementSignature,
  type RequirementSignature,
  type Transaction,
} from "@morpho-org/morpho-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { ChainId } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  type Chain,
  decodeFunctionData,
  erc20Abi,
  ethAddress,
  isAddressEqual,
  type TransactionReceipt,
} from "viem";
import { expect } from "vitest";
import {
  type SimulationInputLimits,
  type SimulationReport,
  type SimulationResult,
  type SimulationWarning,
  simulate,
  toSimulationAuthorizations,
  toSimulationLimits,
} from "../../src/index.js";
import {
  simulationClientFor,
  unwrapReport,
} from "../../src/test-helpers/index.js";

/** A tracked balance delta that differs from simulation, or has no measurement. */
export interface E2eSimulationMismatch {
  readonly account: Address;
  readonly token: Address;
  readonly expected: bigint;
  readonly actual: bigint | undefined;
}

/** Compares every wallet/token pair and rejects untracked simulated tokens for tracked wallets. */
export const compareE2eChanges = (params: {
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
}): readonly E2eSimulationMismatch[] => {
  const mismatches: E2eSimulationMismatch[] = [];
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

/** Signs prerequisites as the actor, then builds the transaction without sending any calls. */
export const prepareE2eTransactions = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly account: Address;
    readonly output: {
      readonly getRequirements: () => Promise<readonly ActionRequirement[]>;
      readonly buildTx: (
        signatures: readonly RequirementSignature[],
      ) => Transaction;
    };
  },
) => {
  const requirements = await params.output.getRequirements();
  const calls: Transaction[] = [];
  const signatures: RequirementSignature[] = [];
  for (const requirement of requirements) {
    if (isRequirementSignature(requirement))
      signatures.push(await requirement.sign(client, params.account));
    else calls.push(requirement);
  }
  const tx = params.output.buildTx(signatures);
  return {
    requirements,
    tx,
    transactions: [...calls, tx].map(({ to, data, value }) => ({
      from: params.account,
      to,
      data,
      value,
    })),
  };
};

/** The executed bundle did not match simulation for at least one tracked balance. */
export class E2eSimulationMismatchError extends Error {
  public constructor(
    public readonly mismatches: readonly E2eSimulationMismatch[],
  ) {
    super(
      mismatches
        .map(
          ({ account, token, expected, actual }) =>
            `${account}/${token}: expected "${expected}", got "${actual ?? "untracked"}"`,
        )
        .join("; "),
    );
    this.name = "E2eSimulationMismatchError";
  }
}

/** Requires a successful report without unexpected warnings or failure severity. */
export const expectE2eReport = (
  report: Pick<SimulationReport, "ok" | "warnings">,
  allowedWarningCodes: readonly SimulationWarning["code"][] = [],
) => {
  expect(report).toEqual(expect.objectContaining({ ok: true }));
  expect(report).not.toHaveProperty("severity");
  expect(
    report.warnings.filter(({ code }) => !allowedWarningCodes.includes(code)),
  ).toEqual([]);
};

/**
 * Simulates all onchain requirements and the built transaction before sending any of them.
 * Measures all wallet/token pairs, including native ETH when ethAddress is tracked. Gas is
 * excluded from simulation; execution adds back receipt execution fees and any reported L1 fee,
 * or uses Base's Anvil fee vaults when receipts omit L1 and operator fees.
 * An unreported chain-specific fee fails comparison rather than being silently ignored.
 */
export const sendE2eSimulated = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly chainId: number;
    readonly account: Address;
    readonly output: Parameters<typeof prepareE2eTransactions>[1]["output"];
    readonly wallets: readonly Address[];
    readonly tokens: readonly Address[];
    readonly limits?:
      | Omit<Parameters<typeof toSimulationLimits>[1], "owner">
      | SimulationInputLimits
      | "none";
    readonly preview?: boolean;
    readonly allowedWarningCodes?: readonly SimulationWarning["code"][];
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
  const { tx, transactions, requirements } = await prepareE2eTransactions(
    client,
    params,
  );
  expect(client.transport.url).toBeDefined();
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const limits =
    params.limits === "none"
      ? "none"
      : params.limits && "operations" in params.limits
        ? params.limits
        : toSimulationLimits(tx.action, {
            token: tx.to,
            ...params.limits,
            owner: params.account,
          });
  const authorizations = params.preview
    ? toSimulationAuthorizations({ owner: params.account, requirements })
    : [];
  const previewReport = params.preview
    ? await simulate(
        simulationClientFor(client.transport.url, client.chain),
        {
          blockNumber,
          mode: "preview",
          authorizations,
          transactions: [params.output.buildTx([])].map(
            ({ to, data, value }) => ({
              from: params.account,
              to,
              data,
              value,
            }),
          ),
          limits,
        },
        { timeoutMs: 30_000 },
      )
    : undefined;
  if (previewReport) expectE2eReport(previewReport, params.allowedWarningCodes);
  const preview = previewReport ? unwrapReport(previewReport) : undefined;
  if (preview) {
    expect(preview.verification.mode).toBe("preview");
    expect(
      preview.verification.authorizations.map(
        ({ authorization }) => authorization,
      ),
    ).toStrictEqual(authorizations);
    expect(preview.verification.authorizations).toHaveLength(
      requirements.length,
    );
    preview.verification.authorizations.forEach(
      ({ authorizationIndex, calls }, index) => {
        expect(authorizationIndex).toBe(index);
        expect(calls).toHaveLength(1);
        const { transaction, result: preparation } = calls[0]!;
        const requirement = requirements[index]!;
        expect(preparation.status).toBe(true);
        expect(transaction.from).toBeDefined();
        expect(isAddressEqual(transaction.from!, params.account)).toBe(true);
        expect(transaction.value).toBe(0n);
        if (!isRequirementSignature(requirement)) {
          expect(isAddressEqual(transaction.to, requirement.to)).toBe(true);
          expect(transaction.data).toBe(requirement.data);
          return;
        }
        const [authorization] = toSimulationAuthorizations({
          owner: params.account,
          requirements: [requirement],
        });
        if (authorization?.type === "blueAuthorizationSignature") {
          const { domain, message } = authorization.typedData;
          expect(isAddressEqual(transaction.to, domain.verifyingContract)).toBe(
            true,
          );
          expect(
            decodeFunctionData({ abi: blueAbi, data: transaction.data }),
          ).toEqual({
            functionName: "setAuthorization",
            args: [message.authorized, message.isAuthorized],
          });
        } else {
          expect(authorization?.type).toBeOneOf([
            "erc2612Permit",
            "permit2SignatureTransfer",
          ]);
          if (
            authorization?.type !== "erc2612Permit" &&
            authorization?.type !== "permit2SignatureTransfer"
          )
            return;
          const { domain, message } = authorization.typedData;
          const token =
            "permitted" in message
              ? message.permitted.token
              : domain.verifyingContract;
          const amount =
            "permitted" in message ? message.permitted.amount : message.value;
          expect(isAddressEqual(transaction.to, token)).toBe(true);
          expect(
            decodeFunctionData({ abi: erc20Abi, data: transaction.data }),
          ).toEqual({
            functionName: "approve",
            args: [message.spender, amount],
          });
        }
      },
    );
  }
  const report = await simulate(
    simulationClientFor(client.transport.url, client.chain),
    {
      blockNumber,
      transactions,
      limits,
    },
    { timeoutMs: 30_000 },
  );
  expectE2eReport(report, params.allowedWarningCodes);
  const result = unwrapReport(report);
  if (preview)
    expect(preview.verification.operations).toEqual(
      result.verification.operations,
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
  const readBaseFees = async () =>
    params.chainId === ChainId.BaseMainnet &&
    params.tokens.some((token) => isAddressEqual(token, ethAddress))
      ? (await client.getBalance({
          address: "0x420000000000000000000000000000000000001A",
        })) +
        (await client.getBalance({
          address: "0x420000000000000000000000000000000000001b",
        }))
      : undefined;
  const baseFeesBefore = await readBaseFees();
  let gasFees = 0n;
  let reportedL1Fees = 0n;
  const receipts: TransactionReceipt[] = [];
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
    receipts.push(receipt);
    expect(receipt.status).toBe("success");
    gasFees += receipt.gasUsed * receipt.effectiveGasPrice;
    if (
      "l1Fee" in receipt &&
      (typeof receipt.l1Fee === "bigint" || typeof receipt.l1Fee === "string")
    )
      reportedL1Fees += BigInt(receipt.l1Fee);
  }
  gasFees +=
    baseFeesBefore === undefined
      ? reportedL1Fees
      : (await readBaseFees())! - baseFeesBefore;
  const after = await read();
  const mismatches = compareE2eChanges({
    ...params,
    assetChanges: result.assetChanges,
    sender: params.account,
    gasFees,
    deltas: pairs.map((pair, i) => ({ ...pair, diff: after[i]! - before[i]! })),
  });
  if (mismatches.length > 0) throw new E2eSimulationMismatchError(mismatches);
  if (preview) {
    const previewMismatches = compareE2eChanges({
      ...params,
      assetChanges: preview.assetChanges,
      sender: params.account,
      gasFees,
      deltas: pairs.map((pair, i) => ({
        ...pair,
        diff: after[i]! - before[i]!,
      })),
    });
    if (previewMismatches.length > 0)
      throw new E2eSimulationMismatchError(previewMismatches);
  }
  return { result, gasFees, receipts };
};
