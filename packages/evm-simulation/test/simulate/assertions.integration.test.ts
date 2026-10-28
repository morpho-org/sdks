import { metaMorphoAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  hexToBigInt,
  parseEther,
  parseUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  erc20BalanceAssertion,
  maxDepositAssertion,
  nativeBalanceAssertion,
  SimulationAssertError,
  SimulationRevertedError,
  simulate,
} from "../../src/index.js";
import { test } from "../setup.js";

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const STEAKHOUSE: Address = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
const RECIPIENT: Address = "0x3333333333333333333333333333333333333333";

const configFor = (client: { transport: { url?: string } }) => ({
  timeoutMs: 30_000,
  chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
});

const expectAssertionFailure = async (
  result: Promise<unknown>,
  expected: {
    transactionIndex: number;
    phase: "before" | "after";
    observed: bigint;
    to: Address;
  },
) => {
  const error = await result.catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(SimulationAssertError);
  expect(error).not.toBeInstanceOf(SimulationRevertedError);
  expect(error).toMatchObject({
    code: "SIMULATION_ASSERT_FAILED",
    transactionIndex: expected.transactionIndex,
    phase: expected.phase,
  });
  expect((error as SimulationAssertError).assertion.to).toBe(expected.to);
  expect(hexToBigInt((error as SimulationAssertError).returnData)).toBe(
    expected.observed,
  );
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
        limits: "none",
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
              erc20BalanceAssertion({
                token: USDC,
                account: client.account.address,
                min: transfer,
              }),
            ],
          },
        ],
      }),
      {
        transactionIndex: 0,
        phase: "before",
        observed: balance,
        to: USDC,
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
        limits: "none",
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
              erc20BalanceAssertion({ token: USDC, account, min: 1n }),
            ],
          },
        ],
      }),
      {
        transactionIndex: 0,
        phase: "before",
        observed: 0n,
        to: USDC,
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
        limits: "none",
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
              maxDepositAssertion({
                vault: STEAKHOUSE,
                receiver: client.account.address,
                min: 1n,
              }),
            ],
          },
        ],
      }),
      {
        transactionIndex: 0,
        phase: "before",
        observed: 0n,
        to: STEAKHOUSE,
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
        limits: "none",
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
              erc20BalanceAssertion({
                token: USDC,
                account: recipient,
                min: amount + 1n,
              }),
            ],
          },
        ],
      }),
      {
        transactionIndex: 0,
        phase: "after",
        observed: amount,
        to: USDC,
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
      erc20BalanceAssertion({
        token: USDC,
        account: client.account.address,
        min: 0n,
      }),
      nativeBalanceAssertion({ account: client.account.address, min: 0n }),
      maxDepositAssertion({
        vault: STEAKHOUSE,
        receiver: client.account.address,
        min: 0n,
      }),
    ];
    const allowanceIsZero = {
      to: USDC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "allowance",
        args: [
          client.account.address,
          privateKeyToAddress(generatePrivateKey()),
        ],
      }),
      check: (returnData: `0x${string}`) =>
        hexToBigInt(returnData) === 0n
          ? undefined
          : `Allowance is "${hexToBigInt(returnData)}", expected "0".`,
    };

    const withoutAssertions = await simulate(configFor(client), {
      chainId: mainnet.id,
      limits: "none",
      transactions: [transaction],
    });
    const withAssertions = await simulate(configFor(client), {
      chainId: mainnet.id,
      limits: "none",
      transactions: [
        {
          ...transaction,
          assertBefore: assertions,
          assertAfter: [...assertions, allowanceIsZero],
        },
      ],
    });
    // `"none"` is reported back to the caller instead of an empty limit set.
    expect(withoutAssertions.verification.limits).toBe("none");
    expect(withAssertions).toStrictEqual(withoutAssertions);
  }, 60_000);
});
