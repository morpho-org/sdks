import {
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { ChainId, getChainAddress, Time } from "@morpho-org/morpho-ts";
import {
  type AnvilTestClient,
  BASE_FORK_BLOCK,
  getErpcForkUrl,
} from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  decodeFunctionData,
  type Hex,
  maxUint128,
  maxUint256,
  parseEther,
  toFunctionSelector,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  isRequirementSignature,
  morphoViemExtension,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});

type Client = AnvilTestClient<typeof base>;

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const midnightBundlesV2 = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBundlesV2",
);
const groupA = `0x${"aa".repeat(32)}` as Hex;
const groupB = `0x${"bb".repeat(32)}` as Hex;
const groupC = `0x${"cc".repeat(32)}` as Hex;
const setConsumedSelector = toFunctionSelector(
  "setConsumed(bytes32,uint128,address)",
);
const multicallSelector = toFunctionSelector("multicall(bytes[])");
const unauthorized = toFunctionSelector("Unauthorized()");

const { A: maker, B: operator, C: stranger } = E2E_MIDNIGHT_WALLETS;

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

/** Records consumption the way a fill does, as the maker acting on itself. */
const fill = (
  client: Client,
  params: {
    readonly account: Address;
    readonly group: Hex;
    readonly amount: bigint;
  },
) =>
  client.writeContract({
    account: params.account,
    address: midnight,
    abi: midnightAbi,
    functionName: "setConsumed",
    args: [params.group, params.amount, params.account],
  });

const isBundleAuthorized = (client: Client, account: Address) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    args: [account, midnightBundlesV2],
  });

/** Builds a cancellation through the entity and checks it needs nothing first. */
const prepareCancelOffers = async (
  client: Client,
  params: { readonly accountAddress: Address; readonly groups: readonly Hex[] },
) => {
  const output = client
    .extend(morphoViemExtension())
    .morpho.midnight(base.id)
    .cancelOffers(params);
  await expect(output.getRequirements()).resolves.toEqual([]);

  const tx = output.buildTx();
  expect(tx.to).toBe(midnight);
  expect(tx.value).toBe(0n);
  return tx;
};

/** The shared Midnight fixtures take a client typed on the generic chain. */
const sharedClient = (client: Client) => client as unknown as AnvilTestClient;

/** Clears code and funds gas for the named wallets. */
const fundWallets = (client: Client) =>
  fundE2eMidnightWallets(sharedClient(client), {
    wallets: { A: {}, B: {}, C: {} },
  });

describe("Midnight direct cancellation on fork", () => {
  test("cancels one group with a bare setConsumed and no prior authorization", async ({
    client,
  }) => {
    await fundWallets(client);
    await fill(client, { account: maker, group: groupA, amount: 10n });
    const tx = await prepareCancelOffers(client, {
      accountAddress: maker,
      groups: [groupA],
    });

    expect(tx.data.startsWith(setConsumedSelector)).toBe(true);
    expect(decodeFunctionData({ abi: midnightAbi, data: tx.data })).toEqual({
      functionName: "setConsumed",
      args: [groupA, maxUint128, maker],
    });
    await expect(isBundleAuthorized(client, maker)).resolves.toBe(false);

    const hash = await client.sendTransaction({ ...tx, account: maker });
    const receipt = await client.waitForTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
    expect(receipt.to?.toLowerCase()).toBe(midnight.toLowerCase());
    await expect(
      consumed(client, { account: maker, group: groupA }),
    ).resolves.toBe(maxUint128);
    await expect(isBundleAuthorized(client, maker)).resolves.toBe(false);
  });

  test("cancels three groups in one multicall transaction", async ({
    client,
  }) => {
    await fundWallets(client);
    await fill(client, { account: maker, group: groupB, amount: 10n });
    const groups = [groupA, groupB, groupC];
    const tx = await prepareCancelOffers(client, {
      accountAddress: maker,
      groups,
    });

    expect(tx.data.startsWith(multicallSelector)).toBe(true);

    const hash = await client.sendTransaction({ ...tx, account: maker });
    const receipt = await client.waitForTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
    expect(receipt.to?.toLowerCase()).toBe(midnight.toLowerCase());
    for (const group of groups) {
      await expect(consumed(client, { account: maker, group })).resolves.toBe(
        maxUint128,
      );
    }
  });

  test("lets a Midnight-authorized operator cancel for the maker", async ({
    client,
  }) => {
    await fundWallets(client);
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [operator, true, maker],
    });
    const groups = [groupA, groupB];
    const single = await prepareCancelOffers(client, {
      accountAddress: maker,
      groups: [groupC],
    });
    const batch = await prepareCancelOffers(client, {
      accountAddress: maker,
      groups,
    });

    await client.sendTransaction({ ...single, account: operator });
    await client.sendTransaction({ ...batch, account: operator });

    for (const group of [...groups, groupC]) {
      await expect(consumed(client, { account: maker, group })).resolves.toBe(
        maxUint128,
      );
      // The operator's own groups are untouched.
      await expect(
        consumed(client, { account: operator, group }),
      ).resolves.toBe(0n);
    }
  });

  test("reverts for a sender that is neither the maker nor its operator, changing no group", async ({
    client,
  }) => {
    await fundWallets(client);
    await fill(client, { account: maker, group: groupB, amount: 10n });
    const groups = [groupA, groupB, groupC];
    const single = await prepareCancelOffers(client, {
      accountAddress: maker,
      groups: [groupA],
    });
    const batch = await prepareCancelOffers(client, {
      accountAddress: maker,
      groups,
    });

    for (const tx of [single, batch]) {
      // Anvil drops revert data from failed transactions, so read the reason from a call first.
      await expect(client.call({ ...tx, account: stranger })).rejects.toThrow(
        unauthorized,
      );
      await expect(
        client.sendTransaction({ ...tx, account: stranger }),
      ).rejects.toThrow();
    }

    await expect(
      consumed(client, { account: maker, group: groupA }),
    ).resolves.toBe(0n);
    await expect(
      consumed(client, { account: maker, group: groupB }),
    ).resolves.toBe(10n);
    await expect(
      consumed(client, { account: maker, group: groupC }),
    ).resolves.toBe(0n);
    // The sender's own groups are not cancelled in the maker's place.
    for (const group of groups) {
      await expect(
        consumed(client, { account: stranger, group }),
      ).resolves.toBe(0n);
    }
  });

  test("a setConsumed below current consumption reverts, so a cancelled group stays cancelled", async ({
    client,
  }) => {
    await fundWallets(client);
    await fill(client, { account: maker, group: groupB, amount: 10n });
    const tx = await prepareCancelOffers(client, {
      accountAddress: maker,
      groups: [groupA],
    });
    const hash = await client.sendTransaction({ ...tx, account: maker });
    expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
      "success",
    );

    for (const { group, amount } of [
      { group: groupA, amount: 0n },
      { group: groupA, amount: maxUint128 - 1n },
      { group: groupB, amount: 9n },
    ]) {
      // Anvil drops revert data from failed transactions, so read the reason from a call first.
      const reverted = await client
        .simulateContract({
          account: maker,
          address: midnight,
          abi: midnightAbi,
          functionName: "setConsumed",
          args: [group, amount, maker],
        })
        .then(
          () => undefined,
          (error: unknown) =>
            error instanceof BaseError
              ? error.walk((e) => e instanceof ContractFunctionRevertedError)
              : undefined,
        );
      expect(reverted).toBeInstanceOf(ContractFunctionRevertedError);
      expect((reverted as ContractFunctionRevertedError).data?.errorName).toBe(
        "AlreadyConsumed",
      );
      await expect(
        fill(client, { account: maker, group, amount }),
      ).rejects.toThrow();
    }

    await expect(
      consumed(client, { account: maker, group: groupA }),
    ).resolves.toBe(maxUint128);
    await expect(
      consumed(client, { account: maker, group: groupB }),
    ).resolves.toBe(10n);
  });

  test("a retried cancellation succeeds", async ({ client }) => {
    await fundWallets(client);
    const single = await prepareCancelOffers(client, {
      accountAddress: maker,
      groups: [groupA],
    });
    // Overlaps the single cancellation, so one entry is already consumed in full.
    const batch = await prepareCancelOffers(client, {
      accountAddress: maker,
      groups: [groupA, groupB],
    });

    for (const tx of [single, single, batch, batch]) {
      const hash = await client.sendTransaction({ ...tx, account: maker });
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
        "success",
      );
    }

    for (const group of [groupA, groupB]) {
      await expect(consumed(client, { account: maker, group })).resolves.toBe(
        maxUint128,
      );
    }
  });

  test("a cancelled group cannot be taken", async ({ client }) => {
    const setterRatifier = getChainAddress(base.id, "setterRatifier");
    const taker = operator;
    const units = parseEther("1");
    const collateralAssets = parseEther("10");
    const { params, marketData } = await createE2eMidnightMarket(
      sharedClient(client),
      base.id,
    );
    await fundE2eMidnightWallets(sharedClient(client), {
      market: params,
      wallets: { A: { collateralAssets }, B: { loanAssets: units } },
      approve: midnight,
    });
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(params), 0n, collateralAssets, maker],
    });
    const tree = Tree.create([
      Offer.create({
        market: params,
        buy: false,
        maker,
        expiry: params.maturity,
        tick: 5_000n,
        ratifier: setterRatifier,
        maxUnits: 2n * units,
      }),
    ]);
    await postE2eSetterTree(sharedClient(client), {
      chainId: base.id,
      maker,
      tree,
    });
    const takeableOffers = getE2eTakeableOffers({ tree, units });
    const group = takeableOffers[0]?.offer.group;
    if (group === undefined) throw new Error("expected a takeable offer");

    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const take = entity.takeLend({
      marketData,
      accountAddress: taker,
      target: { type: "assets", assets: units / 2n, minUnits: 1n },
      takeableOffers,
      maxContinuousFee: maxUint256,
      // Anvil mines new fork blocks at the local clock, so the local clock bounds the deadline.
      deadline: Time.timestamp() + 600n,
    });
    for (const requirement of await take.getRequirements()) {
      if (isRequirementSignature(requirement))
        throw new Error("expected an onchain call requirement");
      await client.sendTransaction({ ...requirement, account: taker });
    }
    const takeTx = take.buildTx();
    // The offer is takeable until its group is cancelled.
    await expect(
      client.call({ ...takeTx, account: taker }),
    ).resolves.toBeDefined();

    const cancelTx = await prepareCancelOffers(client, {
      accountAddress: maker,
      groups: [group],
    });
    await client.sendTransaction({ ...cancelTx, account: maker });
    await expect(consumed(client, { account: maker, group })).resolves.toBe(
      maxUint128,
    );

    const error = await client.call({ ...takeTx, account: taker }).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    if (!(error instanceof BaseError))
      throw new Error("expected the take of a cancelled group to revert");
    const revert = error.walk(
      (cause) => typeof (cause as { data?: unknown }).data === "string",
    ) as { data: Hex } | null;
    if (revert === null)
      throw new Error(`expected revert data, got: ${error.shortMessage}`);
    expect(
      decodeErrorResult({ abi: midnightBundlesV2Abi, data: revert.data })
        .errorName,
    ).toBe("OutOfOffers");
  });
});
