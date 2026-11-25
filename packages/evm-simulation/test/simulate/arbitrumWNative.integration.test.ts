import { MarketParams } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  isAddressEqual,
  maxUint256,
  parseAbi,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";
import { arbitrum } from "viem/chains";
import { describe, expect } from "vitest";
import {
  ConsumerLimitViolationError,
  type SimulateParams,
  simulate,
} from "../../src/index.js";
import { simulationClientFor } from "../../src/test-helpers/index.js";

// Arbitrum's aeWETH emits only zero-address Transfers on wrap/unwrap (no Deposit/Withdrawal).
const ARBITRUM_FORK_BLOCK = 527_062_000n;
const AEWETH: Address = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const AMOUNT = parseEther("1");
const wethAbi = parseAbi([
  "function deposit() payable",
  "function withdraw(uint256)",
]);
const WethUsdcBlue = new MarketParams({
  loanToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  collateralToken: AEWETH,
  oracle: "0x282FEB10549fde52bD61A6979424Ddf18A4971A2",
  irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
  lltv: parseUnits("86", 16),
});

const test = createViemTest(arbitrum, {
  forkUrl: getErpcForkUrl(arbitrum.id, process.env.ERPC_SECRET),
  chainId: arbitrum.id,
  forkBlockNumber: ARBITRUM_FORK_BLOCK,
}).extend<{ client: AnvilTestClient<typeof arbitrum> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await client.setBalance({
      address: client.account.address,
      value: 10n * AMOUNT,
    });
    await use(client);
  },
});

const configFor = (client: { transport: { url?: string } }) =>
  simulationClientFor(client.transport.url, arbitrum);

/** Simulates `params` and returns the result after asserting an `ok` report without warnings. */
const simulateClean = async (
  client: { transport: { url?: string } },
  params: SimulateParams,
) => {
  const report = await simulate(configFor(client), params);
  expect(report.warnings).toEqual([]);
  expect(report.ok).toBe(true);
  if (!report.ok) throw new Error("unreachable");
  return report.result;
};

const wNativeTransfers = (transfers: readonly { token: Address }[]) =>
  transfers.filter(({ token }) => isAddressEqual(token, AEWETH));

describe.sequential("simulate — Arbitrum Transfer-only wNative", () => {
  test("error: native Blue collateral quote rejects a separate wNative pull", async ({
    client,
  }) => {
    const extra = parseEther("0.1");
    await client.writeContract({
      address: AEWETH,
      abi: wethAbi,
      functionName: "deposit",
      value: extra,
    });
    const tx = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WethUsdcBlue, arbitrum.id)
      .supplyCollateral({
        userAddress: client.account.address,
        collateralAssets: AMOUNT,
        nativeAmount: AMOUNT,
        deadline: maxUint256,
      })
      .buildTx();
    const report = await simulate(configFor(client), {
      limits: {
        operations: [
          {
            type: "blueSupplyCollateral",
            marketId: WethUsdcBlue.id,
            assetPaid: ethAddress,
            quote: { collateralSupplied: AMOUNT, assetsPaid: AMOUNT },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
        {
          from: client.account.address,
          to: AEWETH,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: ["0x000000000000000000000000000000000000dEaD", extra],
          }),
        },
      ],
    });
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(false);
    if (report.ok) throw new Error("unreachable");
    expect(report.failures).toContainEqual(
      expect.any(ConsumerLimitViolationError),
    );
    expect(report.failures).toContainEqual(
      expect.objectContaining({
        field: "assetsPaid",
        observed: AMOUNT + extra,
        bound: AMOUNT,
      }),
    );
  }, 60_000);

  test("default: native wrap reports the mint without warnings", async ({
    client,
  }) => {
    const report = await simulateClean(client, {
      limits: "none",
      transactions: [
        {
          from: client.account.address,
          to: AEWETH,
          data: encodeFunctionData({ abi: wethAbi, functionName: "deposit" }),
          value: AMOUNT,
        },
      ],
    });

    expect(wNativeTransfers(report.transfers)).toEqual([
      {
        token: AEWETH,
        from: zeroAddress,
        to: client.account.address,
        amount: AMOUNT,
        txIdx: 0,
      },
    ]);
  }, 60_000);

  test("behavior: unwrap to native reports the burn without warnings", async ({
    client,
  }) => {
    await client.sendTransaction({
      to: AEWETH,
      data: encodeFunctionData({ abi: wethAbi, functionName: "deposit" }),
      value: AMOUNT,
    });

    const report = await simulateClean(client, {
      limits: "none",
      transactions: [
        {
          from: client.account.address,
          to: AEWETH,
          data: encodeFunctionData({
            abi: wethAbi,
            functionName: "withdraw",
            args: [AMOUNT],
          }),
        },
      ],
    });

    expect(wNativeTransfers(report.transfers)).toEqual([
      {
        token: AEWETH,
        from: client.account.address,
        to: zeroAddress,
        amount: AMOUNT,
        txIdx: 0,
      },
    ]);
  }, 60_000);

  test("behavior: native-funded Blue collateral supply passes its limits without warnings", async ({
    client,
  }) => {
    const blueBundles = getChainAddresses(arbitrum.id).bundles!.blueBundlesV1!;
    const tx = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WethUsdcBlue, arbitrum.id)
      .supplyCollateral({
        userAddress: client.account.address,
        collateralAssets: AMOUNT,
        nativeAmount: AMOUNT,
        deadline: maxUint256,
      })
      .buildTx();
    expect(tx.value).toBe(AMOUNT);

    const report = await simulateClean(client, {
      limits: {
        operations: [
          {
            type: "blueSupplyCollateral",
            marketId: WethUsdcBlue.id,
            assetPaid: ethAddress,
            quote: { collateralSupplied: AMOUNT, assetsPaid: AMOUNT },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      ],
    });

    expect(wNativeTransfers(report.transfers)).toContainEqual({
      token: AEWETH,
      from: zeroAddress,
      to: blueBundles,
      amount: AMOUNT,
      txIdx: 0,
    });
  }, 60_000);
});
