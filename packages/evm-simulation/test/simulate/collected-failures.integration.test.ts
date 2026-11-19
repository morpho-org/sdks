import { getChainAddress } from "@morpho-org/morpho-sdk/addresses";
import { markets } from "@morpho-org/morpho-test";
import {
  metaMorphoAbi,
  metaMorphoFactoryAbi,
} from "@morpho-org/morpho-ts/abis";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  parseUnits,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  BlacklistViolationError,
  ConsumerLimitViolationError,
  SimulationAssertError,
  SimulationRevertedError,
  simulate,
  UnexpectedTokenApprovalError,
} from "../../src/index.js";
import { simulationClientFor } from "../../src/test-helpers/index.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 25_832_676n,
});
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const SPENDER = "0x3333333333333333333333333333333333333333";
const amount = parseUnits("1", 6);
const market = markets[mainnet.id].usdc_wstEth;
const limitsFor = (vault: Address) =>
  ({
    operations: [
      {
        type: "vaultV1Deposit",
        vault,
        quote: { assetsPaid: amount, sharesMinted: 1n },
        slippageTolerance: 0n,
      },
    ],
  }) as const;

/** Creates a USDC MetaMorpho vault on the fork through the registered factory. */
const createVault = async (
  client: AnvilTestClient<typeof mainnet>,
): Promise<Address> => {
  const { result: vault, request } = await client.simulateContract({
    address: getChainAddress(mainnet.id, "metaMorphoFactory"),
    abi: metaMorphoFactoryAbi,
    functionName: "createMetaMorpho",
    args: [client.account.address, 0n, USDC, "Test Vault", "tVault", zeroHash],
  });
  await client.writeContract(request);
  // A zero timelock lets the owner accept the cap in the same block it is submitted.
  await client.writeContract({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "submitCap",
    args: [market, amount * 10n],
  });
  await client.writeContract({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "acceptCap",
    args: [market],
  });
  await client.writeContract({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "setSupplyQueue",
    args: [[market.id]],
  });
  return vault;
};
const configFor = (url: string) => simulationClientFor(url, mainnet);

describe.sequential("simulate collected failures", () => {
  test("reports the slippage failure, then the retention failure", async ({
    client,
  }) => {
    const vault = await createVault(client);
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await client.deal({ erc20: USDC, amount });
    const report = await simulate(
      configFor(client.transport.url!),
      {
        limits: limitsFor(vault),
        transactions: [
          {
            from: client.account.address,
            to: USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [
                getChainAddress(mainnet.id, "bundles.vaultBundlesV1"),
                amount,
              ],
            }),
          },
        ],
      },
      { timeoutMs: 30_000 },
    );
    expect(report.ok).toBe(false);
    expect(!report.ok && report.failures).toEqual([
      expect.any(ConsumerLimitViolationError),
      expect.any(BlacklistViolationError),
    ]);
  });

  test("reports a failing assertion, then the unexpected approval", async ({
    client,
  }) => {
    const vault = await createVault(client);
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await client.deal({ erc20: USDC, amount });
    const from = client.account.address;
    const report = await simulate(
      configFor(client.transport.url!),
      {
        limits: limitsFor(vault),
        transactions: [
          {
            from,
            to: USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [vault, amount],
            }),
          },
          {
            from,
            to: vault,
            data: encodeFunctionData({
              abi: erc4626Abi,
              functionName: "deposit",
              args: [amount, from],
            }),
            assertBefore: [
              {
                to: USDC,
                data: encodeFunctionData({
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [from],
                }),
                check: () => "assertion failed",
              },
            ],
          },
          {
            from,
            to: USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [SPENDER, 1n],
            }),
          },
        ],
      },
      { timeoutMs: 30_000 },
    );
    expect(report.ok).toBe(false);
    expect(!report.ok && report.failures).toEqual([
      expect.any(SimulationAssertError),
      expect.any(UnexpectedTokenApprovalError),
    ]);
  });

  test("reports the earlier assertion failure, then the terminal revert", async ({
    client,
  }) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await client.deal({ erc20: USDC, amount: 0n });
    const from = client.account.address;
    const report = await simulate(
      configFor(client.transport.url!),
      {
        limits: "none",
        transactions: [
          {
            from,
            to: USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [SPENDER, 1n],
            }),
            assertBefore: [
              {
                to: USDC,
                data: encodeFunctionData({
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [from],
                }),
                check: () => "assertion failed",
              },
            ],
          },
          {
            from,
            to: USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [SPENDER, amount],
            }),
          },
        ],
      },
      { timeoutMs: 30_000 },
    );
    expect(report.ok).toBe(false);
    expect(!report.ok && report.failures).toEqual([
      expect.any(SimulationAssertError),
      expect.any(SimulationRevertedError),
    ]);
  });
});
