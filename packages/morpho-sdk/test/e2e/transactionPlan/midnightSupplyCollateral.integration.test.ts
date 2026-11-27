import {
  MarketParams,
  MarketUtils,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { BASE_FORK_BLOCK, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  concatHex,
  decodeFunctionData,
  erc20Abi,
  maxUint256,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  buildTransactions,
  parseTransactionPlan,
  prepareMidnightSupplyCollateral,
  serializeTransactionPlan,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});

for (const funding of ["sufficient", "insufficient"] as const) {
  test(`supplies Midnight collateral with ${funding} core allowance`, async ({
    client,
  }) => {
    const chainId = base.id;
    const account = client.account.address;
    const midnight = getChainAddress(chainId, "midnight");
    const bundle = getChainAddress(chainId, "midnightBundlesV2");
    const usdc = getChainAddress(chainId, "usdc");
    const wNative = getChainAddress(chainId, "wNative");
    const oracle = "0x0000000000000000000000000000000000080001";
    const { timestamp: now } = await client.getBlock();
    await client.setCode({
      address: oracle,
      bytecode: concatHex([
        "0x7f",
        toHex(10n ** 36n, { size: 32 }),
        "0x60005260206000f3",
      ]),
    });
    const market = new MarketParams({
      chainId,
      midnight,
      loanToken: usdc,
      collateralParams: [usdc, wNative].map((collateralToken) => ({
        token: collateralToken,
        lltv: 770_000_000_000_000_000n,
        liquidationCursor: 300_000_000_000_000_000n,
        oracle,
      })),
      maturity: now + 86_400n,
      rcfThreshold: 0n,
      enterGate: zeroAddress,
      liquidatorGate: zeroAddress,
    });
    const collateralIndex = 1n;
    const { token } = MarketUtils.getCollateralByIndex(market, collateralIndex);
    expect(token).toBe(usdc);
    const collateralAssets = 100n;
    await client.deal({ erc20: token, account, amount: collateralAssets });
    await client.approve({
      address: token,
      args: [funding === "sufficient" ? midnight : bundle, collateralAssets],
    });
    const allowanceTo = (spender: typeof midnight) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, spender],
      });
    if (funding === "sufficient") {
      expect(await allowanceTo(midnight)).toBeGreaterThanOrEqual(
        collateralAssets,
      );
    } else {
      expect(await allowanceTo(bundle)).toBeGreaterThanOrEqual(
        collateralAssets,
      );
      expect(await allowanceTo(midnight)).toBeLessThan(collateralAssets);
    }
    const marketId = MarketUtils.toId(market);
    const collateralAt = (index: bigint) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, account, index],
      });
    const before = await collateralAt(collateralIndex);
    const otherBefore = await collateralAt(0n);
    const plan = await prepareMidnightSupplyCollateral(client, {
      chainId,
      account,
      market,
      collateralIndex,
      collateralAssets,
      now,
    });
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps.map(({ action }) => action.type)).toEqual(
      funding === "sufficient"
        ? ["midnightSupplyCollateral"]
        : ["erc20Approval", "midnightSupplyCollateral"],
    );
    const transactions = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    expect(transactions).toEqual(buildTransactions(plan));
    if (funding === "insufficient") {
      const approval = transactions[0];
      assert(approval);
      expect(approval.to).toBe(token);
      expect(
        decodeFunctionData({ abi: erc20Abi, data: approval.data }),
      ).toEqual({
        functionName: "approve",
        args: [midnight, maxUint256],
      });
    }
    const supply = transactions.at(-1);
    assert(supply);
    expect(supply.to).toBe(midnight);
    expect(decodeFunctionData({ abi: midnightAbi, data: supply.data })).toEqual(
      {
        functionName: "supplyCollateral",
        args: [
          MarketUtils.toStruct(market),
          collateralIndex,
          collateralAssets,
          account,
        ],
      },
    );
    for (const tx of transactions) {
      const hash = await client.sendTransaction({
        ...tx,
        account: client.account,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
      expect(receipt.from.toLowerCase()).toBe(account.toLowerCase());
    }
    expect(await collateralAt(collateralIndex)).toBe(before + collateralAssets);
    expect(await collateralAt(0n)).toBe(otherBefore);
  });
}
