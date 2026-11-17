import {
  MarketParams,
  MarketUtils,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  erc20Abi,
  maxUint256,
  padHex,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { expect } from "vitest";
import { midnightSupplyCollateralBatch } from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
});

test("supplies two collateral tokens atomically on Base", async ({
  client,
}) => {
  const midnight = getChainAddress(base.id, "midnight");
  const tokens = [
    getChainAddress(base.id, "wNative"),
    getChainAddress(base.id, "usdc"),
  ];
  const oracle = "0x0000000000000000000000000000000000080001" as Address;
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  const market = new MarketParams({
    chainId: base.id,
    midnight,
    loanToken: tokens[1]!,
    collateralParams: tokens.map((token) => ({
      token,
      lltv: 770_000_000_000_000_000n,
      liquidationCursor: 300_000_000_000_000_000n,
      oracle,
    })),
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  });
  const id = MarketUtils.toId(market);
  const account = client.account.address;
  const collateralSupplies = [
    { collateralIndex: 0n, assets: 100n },
    { collateralIndex: 1n, assets: 200n },
  ];
  const before = await Promise.all(
    collateralSupplies.map(({ collateralIndex }) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [id, account, collateralIndex],
      }),
    ),
  );
  for (const [index, token] of tokens.entries()) {
    await client.deal({
      erc20: token,
      account,
      amount: collateralSupplies[index]!.assets,
    });
    const hash = await client.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, maxUint256],
    });
    expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
      "success",
    );
  }
  const tx = midnightSupplyCollateralBatch({
    chainId: base.id,
    market,
    collateralSupplies,
    onBehalf: account,
  });
  const hash = await client.sendTransaction(tx);
  expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
    "success",
  );
  for (const [
    index,
    { collateralIndex, assets },
  ] of collateralSupplies.entries()) {
    expect(
      await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [id, account, collateralIndex],
      }),
    ).toBe(before[index]! + assets);
  }
});
