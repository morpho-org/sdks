import {
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  concatHex,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  padHex,
  parseEther,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MidnightZeroReceiverError,
  midnightRepayWithdrawCollateral,
  morphoViemExtension,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
});

const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle = "0x0000000000000000000000000000000000080000" as const;
const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const midnightBundlesV2 = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBundlesV2",
);
const marketData = new Market({
  params: new MarketParams({
    chainId: base.id,
    midnight,
    loanToken: usdc,
    collateralParams: [
      {
        token: wNative,
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  }),
  totalUnits: 1_000_000n,
  lossFactor: 0n,
  withdrawable: 1_000_000n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
  continuousFee: 0,
  tickSpacing: 1,
});
const marketId = MarketUtils.toId(marketData.params);
const collateralAssets = parseEther("2");
const withdrawnAssets = parseEther("0.5");

describe("Midnight zero collateral receiver", () => {
  test("behavior: MidnightBundlesV2 burns collateral withdrawn to the zero address", async ({
    client,
  }) => {
    await client.setCode({
      address: oracle,
      bytecode: concatHex([
        "0x7f",
        padHex(toHex(10n ** 36n), { size: 32 }),
        "0x60005260206000f3",
      ]),
    });
    await client.deal({ erc20: wNative, amount: collateralAssets });
    await client.writeContract({
      account: client.account.address,
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });

    const midnightClient = client.extend(morphoViemExtension());
    const supply = midnightClient.morpho.midnight(base.id).supplyCollateral({
      marketData,
      accountAddress: client.account.address,
      collateralAssets,
      reservedCollateralAssets: 0n,
    });
    await client.sendTransaction({
      ...supply.buildTx(),
      account: client.account.address,
    });
    await client.writeContract({
      account: client.account.address,
      address: midnight,
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [midnightBundlesV2, true, client.account.address],
    });

    const collateralBefore = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "collateral",
      args: [marketId, client.account.address, 0n],
    });
    const zeroAddressBalanceBefore = await client.readContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [zeroAddress],
    });
    const data = encodeFunctionData({
      abi: midnightBundlesV2Abi,
      functionName: "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
      args: [
        MarketUtils.toStruct(marketData.params),
        0n,
        0n,
        true,
        true,
        [],
        [{ collateralIndex: 0n, assets: withdrawnAssets }],
        zeroAddress,
        0n,
        zeroAddress,
        0n,
        maxUint256,
        zeroAddress,
      ],
    });
    const hash = await client.sendTransaction({
      account: client.account.address,
      to: midnightBundlesV2,
      data,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, client.account.address, 0n],
      }),
    ).resolves.toBe(collateralBefore - withdrawnAssets);
    await expect(
      client.readContract({
        address: wNative,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [zeroAddress],
      }),
    ).resolves.toBe(zeroAddressBalanceBefore + withdrawnAssets);
  });

  test("error: midnightRepayWithdrawCollateral rejects the zero collateralReceiver", () => {
    const build = () =>
      midnightRepayWithdrawCollateral({
        chainId: base.id,
        market: marketData.params,
        repay: { type: "assets", assets: 0n },
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: withdrawnAssets },
        ],
        collateralReceiver: zeroAddress,
        deadline: maxUint256,
      });

    expect(build).toThrow(MidnightZeroReceiverError);
    expect(build).toThrow(
      expect.objectContaining({ field: "collateralReceiver" }),
    );
  });
});
