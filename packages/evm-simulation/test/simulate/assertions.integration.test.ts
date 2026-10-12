import { metaMorphoAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  parseEther,
  parseUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { SimulationRevertedError, simulate } from "../../src/index.js";
import { test } from "../setup.js";

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const STEAKHOUSE: Address = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
const RECIPIENT: Address = "0x3333333333333333333333333333333333333333";

const configFor = (client: { transport: { url?: string } }) => ({
  timeoutMs: 30_000,
  chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
});

// biome-ignore lint/complexity/useMaxParams: keep the expected error fields explicit at call sites.
const expectAssertionFailure = async (
  result: Promise<unknown>,
  reasonCode: "INSUFFICIENT_BALANCE" | "CAP_EXCEEDED",
  context: Readonly<Record<string, unknown>>,
) => {
  const error = await result.catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(SimulationRevertedError);
  expect(error).toMatchObject({
    reasonCode,
    details: undefined,
    context: {
      stage: "execution",
      chainId: mainnet.id,
      mode: "final",
      ...context,
    },
  });
};

describe.sequential("simulate — transaction assertions", () => {
  test("error: assertBefore rejects a USDC transfer above the sender balance", async ({
    client,
  }) => {
    const balance = parseUnits("1", 6);
    const transfer = parseUnits("2", 6);
    await client.deal({ erc20: USDC, amount: balance });

    await expectAssertionFailure(
      simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: client.account.address,
            to: USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [RECIPIENT, transfer],
            }),
            assertBefore: [
              {
                type: "erc20Balance",
                token: USDC,
                account: client.account.address,
                min: transfer,
              },
            ],
          },
        ],
      }),
      "INSUFFICIENT_BALANCE",
      {
        transactionIndex: 0,
        phase: "before",
        assertionIndex: 0,
        assertion: "erc20Balance",
        account: client.account.address,
        token: USDC,
        expected: transfer,
        observed: balance,
      },
    );
  }, 60_000);

  test("error: a fresh account reports an observed ERC-20 balance of zero", async ({
    client,
  }) => {
    const account = privateKeyToAddress(generatePrivateKey());
    await expectAssertionFailure(
      simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: account,
            to: USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [RECIPIENT, 1n],
            }),
            assertBefore: [
              { type: "erc20Balance", token: USDC, account, min: 1n },
            ],
          },
        ],
      }),
      "INSUFFICIENT_BALANCE",
      {
        transactionIndex: 0,
        phase: "before",
        assertionIndex: 0,
        assertion: "erc20Balance",
        account,
        token: USDC,
        expected: 1n,
        observed: 0n,
      },
    );
  }, 60_000);

  test("error: maxDeposit rejects a deposit when the vault supply queue is empty", async ({
    client,
  }) => {
    const curator = await client.readContract({
      address: STEAKHOUSE,
      abi: metaMorphoAbi,
      functionName: "curator",
    });
    await client.setBalance({ address: curator, value: parseEther("1") });
    await client.impersonateAccount({ address: curator });
    try {
      await client.writeContract({
        account: curator,
        address: STEAKHOUSE,
        abi: metaMorphoAbi,
        functionName: "setSupplyQueue",
        args: [[]],
      });
    } finally {
      await client.stopImpersonatingAccount({ address: curator });
    }

    await expectAssertionFailure(
      simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: client.account.address,
            to: STEAKHOUSE,
            data: encodeFunctionData({
              abi: erc4626Abi,
              functionName: "deposit",
              args: [1n, client.account.address],
            }),
            assertBefore: [
              {
                type: "maxDeposit",
                vault: STEAKHOUSE,
                receiver: client.account.address,
                min: 1n,
              },
            ],
          },
        ],
      }),
      "CAP_EXCEEDED",
      {
        transactionIndex: 0,
        phase: "before",
        assertionIndex: 0,
        assertion: "maxDeposit",
        account: client.account.address,
        vault: STEAKHOUSE,
        expected: 1n,
        observed: 0n,
      },
    );
  }, 60_000);

  test("error: assertAfter observes the recipient balance after a USDC transfer", async ({
    client,
  }) => {
    const amount = parseUnits("1", 6);
    await client.deal({ erc20: USDC, amount });
    const recipient = privateKeyToAddress(generatePrivateKey());

    await expectAssertionFailure(
      simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: client.account.address,
            to: USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [recipient, amount],
            }),
            assertAfter: [
              {
                type: "erc20Balance",
                token: USDC,
                account: recipient,
                min: amount + 1n,
              },
            ],
          },
        ],
      }),
      "INSUFFICIENT_BALANCE",
      {
        transactionIndex: 0,
        phase: "after",
        assertionIndex: 0,
        assertion: "erc20Balance",
        account: recipient,
        token: USDC,
        expected: amount + 1n,
        observed: amount,
      },
    );
  }, 60_000);

  test("behavior: passing assertions do not change the simulation result", async ({
    client,
  }) => {
    const transaction = {
      from: client.account.address,
      to: RECIPIENT,
      data: "0x" as const,
    };
    const assertions = [
      {
        type: "erc20Balance",
        token: USDC,
        account: client.account.address,
        min: 0n,
      },
      {
        type: "nativeBalance",
        account: client.account.address,
        min: 0n,
      },
      {
        type: "maxDeposit",
        vault: STEAKHOUSE,
        receiver: client.account.address,
        min: 0n,
      },
    ] as const;

    const withoutAssertions = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [transaction],
    });
    const withAssertions = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          ...transaction,
          assertBefore: assertions,
          assertAfter: assertions,
        },
      ],
    });
    expect(withAssertions).toStrictEqual(withoutAssertions);
  }, 60_000);
});
