import { midnightAbi } from "@morpho-org/midnight-sdk";
import {
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
} from "@morpho-org/morpho-test/midnight";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type AnvilTestClient,
  BASE_FORK_BLOCK,
  getErpcForkUrl,
} from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { type Address, decodeFunctionData, type Hex, maxUint128 } from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  buildTransactions,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareMidnightCancelOffers,
  serializeTransactionPlan,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});

type Client = AnvilTestClient<typeof base>;

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const groupA = `0x${"aa".repeat(32)}` as Hex;
const groupB = `0x${"bb".repeat(32)}` as Hex;
const groupC = `0x${"cc".repeat(32)}` as Hex;
const { A: maker } = E2E_MIDNIGHT_WALLETS;

const consumed = (
  client: Client,
  params: { readonly account: Address; readonly group: Hex },
) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "consumed",
    args: [params.account, params.group],
  });

/** Prepares, saves and restores the plan, then builds its one transaction offline. */
const prepareRestoredTransaction = async (
  client: Client,
  groups: readonly Hex[],
) => {
  const plan = await prepareMidnightCancelOffers(client, {
    chainId: base.id,
    account: maker,
    groups,
    now: (await client.getBlock()).timestamp,
  });
  expect(getPendingSignatureRequests(plan)).toEqual([]);
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  const built = buildTransactions(plan);
  const rebuilt = buildTransactions(restored);
  expect(rebuilt).toEqual(built);
  expect(rebuilt).toHaveLength(1);
  const [tx] = rebuilt;
  if (!tx) throw new Error("Expected the cancellation transaction");
  expect(tx.to).toBe(midnight);
  expect(tx.value).toBe(0n);
  return tx;
};

const sendFromMaker = async (
  client: Client,
  tx: { readonly to: Address; readonly data: Hex; readonly value: bigint },
) => {
  const hash = await client.sendTransaction({ ...tx, account: maker });
  const receipt = await client.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  expect(receipt.from.toLowerCase()).toBe(maker.toLowerCase());
  expect(receipt.to?.toLowerCase()).toBe(midnight.toLowerCase());
};

describe("TransactionPlan midnightCancelOffers at Base block 53,550,000", () => {
  test("cancels one group with a bare setConsumed restored from a saved plan", async ({
    client,
  }) => {
    // The shared Midnight fixtures take a client typed on the generic chain.
    await fundE2eMidnightWallets(client as unknown as AnvilTestClient, {
      wallets: { A: {} },
    });
    const tx = await prepareRestoredTransaction(client, [groupA]);

    expect(decodeFunctionData({ abi: midnightAbi, data: tx.data })).toEqual({
      functionName: "setConsumed",
      args: [groupA, maxUint128, maker],
    });
    await expect(
      consumed(client, { account: maker, group: groupA }),
    ).resolves.toBe(0n);

    await sendFromMaker(client, tx);

    await expect(
      consumed(client, { account: maker, group: groupA }),
    ).resolves.toBe(maxUint128);
  });

  test("cancels several groups in one core multicall restored from a saved plan", async ({
    client,
  }) => {
    await fundE2eMidnightWallets(client as unknown as AnvilTestClient, {
      wallets: { A: {} },
    });
    const groups = [groupA, groupB, groupC];
    const tx = await prepareRestoredTransaction(client, groups);

    const outer = decodeFunctionData({ abi: midnightAbi, data: tx.data });
    if (outer.functionName !== "multicall") {
      throw new Error(`expected multicall, got ${outer.functionName}`);
    }
    expect(
      outer.args[0].map((call) =>
        decodeFunctionData({ abi: midnightAbi, data: call }),
      ),
    ).toEqual(
      groups.map((group) => ({
        functionName: "setConsumed",
        args: [group, maxUint128, maker],
      })),
    );

    await sendFromMaker(client, tx);

    for (const group of groups) {
      await expect(consumed(client, { account: maker, group })).resolves.toBe(
        maxUint128,
      );
    }
  });
});
