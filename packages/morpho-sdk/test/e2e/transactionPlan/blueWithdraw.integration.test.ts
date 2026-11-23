import { getChainAddresses, MarketParams, MathLib } from "@morpho-org/blue-sdk";
import {
  blueAbi,
  vaultV2Abi,
  vaultV2BluePublicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  decodeFunctionData,
  encodeFunctionData,
  maxUint128,
  parseEther,
  parseSignature,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { signTypedData } from "viem/actions";
import { assert, expect } from "vitest";
import { blueBundlesV1Abi } from "../../../src/abis.js";
import { fetchBlueAccrualPosition } from "../../../src/fetch.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareBlueWithdraw,
  serializeTransactionPlan,
  type VaultV2BlueReallocation,
  WithdrawExceedsSupplyError,
  WithdrawSharesExceedSupplyError,
} from "../../../src/index.js";
import { CbbtcUsdcBlue } from "../../fixtures/blue.js";
import { borrow, supplyCollateral, supplyLoan } from "../../helpers/blue.js";
import { blueBundlesV1Test as test } from "../../helpers/blueBundlesV1.js";
import { destinationMarket } from "../../helpers/penalizedReallocations.js";
import {
  setUpSingleAdapterVaultV2,
  submitAndAcceptVaultV2Call,
} from "../../helpers/vaultV2.js";

function marketTuple({
  loanToken,
  collateralToken,
  oracle,
  irm,
  lltv,
}: MarketParams) {
  return { loanToken, collateralToken, oracle, irm, lltv };
}

test("withdraw with market and idle reallocations pays aggregate penalties", async ({
  client,
}) => {
  const penalty = 10n ** 16n;
  const sourceMarket = new MarketParams({
    ...destinationMarket,
    oracle: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
    lltv: parseEther("0.945"),
  });
  const blue = getChainAddresses(1).blue;
  const state = await client.readContract({
    address: blue,
    abi: blueAbi,
    functionName: "market",
    args: [destinationMarket.id],
  });
  if (state[4] === 0n) {
    await client.writeContract({
      address: blue,
      abi: blueAbi,
      functionName: "createMarket",
      args: [destinationMarket],
    });
  }
  await supplyLoan({
    client,
    chainId: 1,
    market: destinationMarket,
    supplyAmount: parseEther("0.2"),
  });
  await supplyCollateral({
    client,
    chainId: 1,
    market: destinationMarket,
    collateralAmount: parseEther("5"),
  });
  await borrow({
    client,
    chainId: 1,
    market: destinationMarket,
    borrowAmount: parseEther("0.1"),
  });
  const reallocations: VaultV2BlueReallocation[] = [];
  for (const [index, fromIdle] of [true, false].entries()) {
    const { vault, adapter, depositAndAllocate } =
      await setUpSingleAdapterVaultV2(client as AnvilTestClient, {
        asset: destinationMarket.loanToken,
        markets: fromIdle
          ? [destinationMarket]
          : [sourceMarket, destinationMarket],
        salt: toHex(BigInt(index), { size: 32 }),
      });
    const allocator = getChainAddress(1, "vaultV2BluePublicAllocator");
    await submitAndAcceptVaultV2Call(client as AnvilTestClient, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "setIsAllocator",
        args: [allocator, true],
      }),
    });
    await client.writeContract({
      address: allocator,
      abi: vaultV2BluePublicAllocatorAbi,
      functionName: "setIsActiveAdapter",
      args: [vault, adapter, true],
    });
    await client.writeContract({
      address: allocator,
      abi: vaultV2BluePublicAllocatorAbi,
      functionName: "setAbsoluteCap",
      args: [vault, adapter, destinationMarket, maxUint128],
    });
    if (fromIdle) {
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setCanPullFromIdle",
        args: [vault, true],
      });
    } else {
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setCanPullFromMarket",
        args: [vault, adapter, sourceMarket, true],
      });
    }
    const legPenalty = fromIdle ? 0n : penalty;
    await client.writeContract({
      address: allocator,
      abi: vaultV2BluePublicAllocatorAbi,
      functionName: "setPenalty",
      args: [vault, legPenalty],
    });
    const assets = parseEther(fromIdle ? "0.02" : "0.05");
    await depositAndAllocate({
      assets,
      perMarket: fromIdle ? [] : [{ market: sourceMarket, assets }],
    });
    reallocations.push({
      vault,
      from: fromIdle
        ? { type: "idle" }
        : { type: "market", adapter, marketParams: sourceMarket },
      to: { adapter },
      assets,
      penalty: legPenalty,
    });
  }
  const amount = parseEther("0.15");
  const now = (await client.getBlock()).timestamp;
  expect(reallocations.some(({ from }) => from.type === "idle")).toBe(true);
  expect(reallocations.some(({ from }) => from.type === "market")).toBe(true);
  const aggregate = reallocations.reduce(
    (sum, leg) => sum + MathLib.mulDivUp(leg.assets, leg.penalty, MathLib.WAD),
    0n,
  );
  expect(aggregate).toBeGreaterThan(0n);
  const position = await fetchBlueAccrualPosition(
    client.account.address,
    destinationMarket.id,
    client,
  );
  const plan = await prepareBlueWithdraw(client, {
    chainId: 1,
    account: client.account.address,
    marketId: destinationMarket.id,
    marketData: { chainId: 1, market: position.market },
    positionData: { chainId: 1, position },
    assets: amount,
    now,
    reallocations,
  });
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  const txs = buildTransactions(restored);
  expect(txs).toEqual(buildTransactions(plan));
  const withdrawal = txs.at(-1);
  assert(withdrawal);
  const decoded = decodeFunctionData({
    abi: blueBundlesV1Abi,
    data: withdrawal.data,
  });
  assert(decoded.functionName === "blueBundlesV1Withdraw");
  expect(decoded.args).toEqual([
    marketTuple(destinationMarket),
    amount,
    0n,
    { signature: { v: 0, r: zeroHash, s: zeroHash }, nonce: 0n, deadline: 0n },
    reallocations.map((leg) => ({
      vault: leg.vault,
      adapter: leg.to.adapter,
      marketParams: marketTuple(destinationMarket),
      fromIdle: leg.from.type === "idle",
      sourceAdapter:
        leg.from.type === "market" ? leg.from.adapter : zeroAddress,
      sourceMarketParams: marketTuple(
        leg.from.type === "market"
          ? sourceMarket
          : MarketParams.idle(destinationMarket.loanToken),
      ),
      assets: leg.assets,
      penalty: leg.penalty,
    })),
    0n,
    zeroAddress,
    BigInt(plan.expiresAt),
  ]);
  expect(withdrawal.to).toBe(getChainAddress(1, "bundles.blueBundlesV1"));
  const before = await client.balanceOf({ erc20: destinationMarket.loanToken });
  for (const tx of txs) {
    await client.sendTransaction(tx);
  }
  const received =
    (await client.balanceOf({ erc20: destinationMarket.loanToken })) - before;
  expect(received).toBe(amount - aggregate);
  expect(
    (
      await fetchBlueAccrualPosition(
        client.account.address,
        destinationMarket.id,
        client,
      )
    ).supplyShares,
  ).toBeLessThan(position.supplyShares);
});

for (const mode of ["assets", "shares"] as const) {
  for (const authorization of [
    "existing",
    "transaction",
    "signature",
  ] as const) {
    test(`withdraw ${mode}, authorization ${authorization}`, async ({
      client,
    }) => {
      await supplyLoan({
        client,
        chainId: 1,
        market: CbbtcUsdcBlue,
        supplyAmount: 1_000_000_000n,
      });
      const spender = getChainAddress(1, "bundles.blueBundlesV1");
      if (authorization === "existing") {
        await client.writeContract({
          address: getChainAddresses(1).blue,
          abi: blueAbi,
          functionName: "setAuthorization",
          args: [spender, true],
        });
      }
      const position = await fetchBlueAccrualPosition(
        client.account.address,
        CbbtcUsdcBlue.id,
        client,
      );
      const amount =
        mode === "assets"
          ? { assets: 500_000_000n }
          : { shares: position.supplyShares / 2n };
      const now = (await client.getBlock()).timestamp;
      const expiresAt = Number(now + 3600n);
      const excess =
        mode === "assets"
          ? { assets: position.supplyAssets + 1n }
          : { shares: position.supplyShares + 1n };
      await expect(
        prepareBlueWithdraw(client, {
          chainId: 1,
          account: client.account.address,
          marketId: CbbtcUsdcBlue.id,
          marketData: { chainId: 1, market: position.market },
          positionData: { chainId: 1, position },
          ...excess,
          now,
          expiresAt,
        }),
      ).rejects.toBeInstanceOf(
        mode === "assets"
          ? WithdrawExceedsSupplyError
          : WithdrawSharesExceedSupplyError,
      );
      let plan = await prepareBlueWithdraw(client, {
        chainId: 1,
        account: client.account.address,
        marketId: CbbtcUsdcBlue.id,
        marketData: { chainId: 1, market: position.market },
        positionData: { chainId: 1, position },
        ...amount,
        now,
        expiresAt,
        supportSignature: authorization === "signature",
      });
      expect(plan.steps.map(({ action }) => action.type)).toEqual(
        authorization === "transaction"
          ? ["morphoAuthorization", "blueWithdraw"]
          : ["blueWithdraw"],
      );
      expect(plan.signatureRequests.map(({ kind }) => kind)).toEqual(
        authorization === "signature" ? ["morphoAuthorization"] : [],
      );
      plan = applySignatures(
        plan,
        await Promise.all(
          getPendingSignatureRequests(plan).map(async ({ id, typedData }) => ({
            id,
            signature: await signTypedData(client, {
              ...typedData,
              account: client.account,
            }),
          })),
        ),
      );
      const restored = parseTransactionPlan(serializeTransactionPlan(plan));
      const transactions = buildTransactions(restored);
      expect(transactions).toEqual(buildTransactions(plan));
      const withdrawal = transactions.at(-1);
      assert(withdrawal);
      expect(withdrawal.to).toBe(spender);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: withdrawal.data,
      });
      assert(decoded.functionName === "blueBundlesV1Withdraw");
      const request = restored.signatureRequests[0];
      let expectedAuthorization: (typeof decoded.args)[3] = {
        signature: { v: 0, r: zeroHash, s: zeroHash },
        nonce: 0n,
        deadline: 0n,
      };
      if (authorization === "signature") {
        assert(
          request?.kind === "morphoAuthorization" &&
            request.signature !== undefined,
        );
        expect(request.args.owner).toBe(client.account.address);
        expect(request.args.authorized).toBe(spender);
        expect(request.args.deadline).toBe(BigInt(expiresAt));
        const signature = parseSignature(request.signature);
        expectedAuthorization = {
          signature: { v: Number(signature.v), r: signature.r, s: signature.s },
          nonce: request.args.nonce,
          deadline: BigInt(expiresAt),
        };
      }
      expect(decoded.args).toEqual([
        marketTuple(CbbtcUsdcBlue),
        "assets" in amount ? amount.assets : 0n,
        "shares" in amount ? amount.shares : 0n,
        expectedAuthorization,
        [],
        0n,
        zeroAddress,
        BigInt(expiresAt),
      ]);
      const balance = await client.balanceOf({
        erc20: CbbtcUsdcBlue.loanToken,
      });
      for (const transaction of transactions) {
        await client.sendTransaction(transaction);
      }
      const after = await fetchBlueAccrualPosition(
        client.account.address,
        CbbtcUsdcBlue.id,
        client,
      );
      expect(after.supplyShares).toBeLessThan(position.supplyShares);
      const received =
        (await client.balanceOf({ erc20: CbbtcUsdcBlue.loanToken })) - balance;
      if ("assets" in amount) {
        expect(received).toBe(amount.assets);
      } else {
        expect(received).toBeGreaterThan(0n);
        expect(position.supplyShares - after.supplyShares).toBe(amount.shares);
      }
    });
  }
}
