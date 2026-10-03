import { midnightAbi, midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import {
  ChainId,
  getChainAddress,
  registerCustomAddresses,
} from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
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
import { midnightBundlesV2Bytecode } from "../../fixtures/midnightBundlesV2.js";

const test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 49_600_000n,
  hardfork: "Karst",
  stepsTracing: false,
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
/** Fresh deployer so every fork test deploys MidnightBundlesV2 at the same address. */
const deployer = "0x00000000000000000000000000000000000b2d00" as Address;
const groupA = `0x${"aa".repeat(32)}` as Hex;
const groupB = `0x${"bb".repeat(32)}` as Hex;

const deployMidnightBundlesV2 = async (
  client: AnvilTestClient<typeof base>,
) => {
  await client.setBalance({ address: deployer, value: parseEther("1") });
  const hash = await client.deployContract({
    account: deployer,
    abi: midnightBundlesV2Abi,
    bytecode: midnightBundlesV2Bytecode,
    args: [
      midnight,
      getChainAddress(ChainId.BaseMainnet, "blue"),
      getChainAddress(ChainId.BaseMainnet, "midnightBlueBuyCallbackFactory"),
      getChainAddress(ChainId.BaseMainnet, "midnightMempool"),
    ],
  });
  const { contractAddress } = await client.waitForTransactionReceipt({ hash });
  if (!contractAddress) throw new Error("MidnightBundlesV2 deployment failed");
  registerCustomAddresses({
    addresses: { [base.id]: { midnightBundlesV2: contractAddress } },
  });
};

const consumed = (client: AnvilTestClient<typeof base>, group: Hex) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "consumed",
    args: [client.account.address, group],
  });

/** Records consumption the way a fill does, as the maker acting on itself. */
const fill = (
  client: AnvilTestClient<typeof base>,
  params: { readonly group: Hex; readonly amount: bigint },
) =>
  client.writeContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "setConsumed",
    args: [params.group, params.amount, client.account.address],
  });

const prepareCancelOffers = async (
  client: AnvilTestClient<typeof base>,
  cancellations: readonly { group: Hex; maxConsumed: bigint }[],
) => {
  await deployMidnightBundlesV2(client);
  const output = client
    .extend(morphoViemExtension())
    .morpho.midnight(base.id)
    .cancelOffers({
      accountAddress: client.account.address,
      cancellations,
      deadline: maxUint256,
    });
  const [authorization, ...rest] = await output.getRequirements();
  expect(rest).toEqual([]);
  if (!authorization || isRequirementSignature(authorization)) {
    throw new Error("expected a MidnightBundlesV2 authorization transaction");
  }
  expect(authorization.action.type).toBe("midnightAuthorization");
  await client.sendTransaction(authorization);
  await expect(output.getRequirements()).resolves.toEqual([]);

  return output.buildTx();
};

describe("Midnight batch cancellation on fork", () => {
  test("cancels every group whose consumption is within its ceiling", async ({
    client,
  }) => {
    await fill(client, { group: groupA, amount: 10n });
    const tx = await prepareCancelOffers(client, [
      { group: groupA, maxConsumed: 10n },
      { group: groupB, maxConsumed: 0n },
    ]);

    await client.sendTransaction(tx);

    await expect(consumed(client, groupA)).resolves.toBe(maxUint128);
    await expect(consumed(client, groupB)).resolves.toBe(maxUint128);
  });

  test("reverts the whole batch when an intervening fill exceeds a ceiling", async ({
    client,
  }) => {
    const tx = await prepareCancelOffers(client, [
      { group: groupA, maxConsumed: 0n },
      { group: groupB, maxConsumed: 10n },
    ]);
    await fill(client, { group: groupB, amount: 11n });

    await expect(client.sendTransaction(tx)).rejects.toThrow(
      toFunctionSelector("ConsumedAboveMax()"),
    );

    await expect(consumed(client, groupA)).resolves.toBe(0n);
    await expect(consumed(client, groupB)).resolves.toBe(11n);
  });
});
