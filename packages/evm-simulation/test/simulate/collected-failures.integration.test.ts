import { getChainAddress } from "@morpho-org/morpho-sdk/addresses";
import { markets } from "@morpho-org/morpho-test";
import {
  metaMorphoAbi,
  metaMorphoFactoryAbi,
} from "@morpho-org/morpho-ts/abis";
import {
  type AnvilTestClient,
  getErpcForkUrl,
  MAINNET_FORK_BLOCK,
} from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  getAddress,
  parseUnits,
  stringify,
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
  forkBlockNumber: MAINNET_FORK_BLOCK,
});
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
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
    expect(report.verification).toEqual({ retention: "checked" });
    expect(report.warnings).toEqual([]);
  });

  test("catches retention from real balance reads when the Transfer log is dropped", async ({
    client,
  }) => {
    const vault = await createVault(client);
    const bundles = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await client.deal({ erc20: USDC, amount });
    // Strip USDC Transfer logs from the node's eth_simulateV1 response, so only
    // the real in-block balanceOf reads can show the retained USDC.
    let droppedInbound = 0;
    const dropUsdcTransfers: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      const body = await response.json();
      for (const block of Array.isArray(body.result) ? body.result : []) {
        for (const call of block.calls ?? []) {
          call.logs = (call.logs ?? []).filter(
            (log: { address: string; topics: string[] }) => {
              const drop =
                log.address.toLowerCase() === USDC.toLowerCase() &&
                log.topics[0] === TRANSFER_TOPIC;
              if (
                drop &&
                log.topics[2]
                  ?.toLowerCase()
                  .endsWith(bundles.slice(2).toLowerCase())
              ) {
                droppedInbound += 1;
              }
              return !drop;
            },
          );
        }
      }
      return new Response(stringify(body), {
        status: response.status,
        headers: response.headers,
      });
    };
    const report = await simulate(
      simulationClientFor(
        client.transport.url!,
        mainnet,
        30_000,
        dropUsdcTransfers,
      ),
      {
        limits: limitsFor(vault),
        transactions: [
          {
            from: client.account.address,
            to: USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [bundles, amount],
            }),
          },
        ],
      },
      { timeoutMs: 30_000 },
    );
    // The filter must have removed the inbound log, or the log-based check could pass this test alone.
    expect(droppedInbound).toBeGreaterThan(0);
    expect(report.ok).toBe(false);
    const retention = report.ok
      ? []
      : report.failures.filter(
          (failure) => failure instanceof BlacklistViolationError,
        );
    expect(retention).toHaveLength(1);
    expect(retention[0]?.assetChanges).toEqual([
      { address: bundles, token: getAddress(USDC), netRetained: amount },
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
    expect(report.verification).toEqual({ retention: "checked" });
    expect(report.warnings).toEqual([]);
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
    expect(report).not.toHaveProperty("verification");
    expect(report.warnings).toEqual([]);
  });
});
