import {
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  OfferUtils,
  SetterRatifierUtils,
  setterRatifierAbi,
  Tree,
} from "@morpho-org/midnight-sdk";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
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
import {
  midnightSupplyCollateralBatch,
  midnightWithdrawCollateralBatch,
  morphoViemExtension,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
});

test.for([false, true])(
  "withdraws two collaterals; unhealthy=%s is atomic on Base",
  async (unhealthy, { client }) => {
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
      { collateralIndex: 0n, assets: 10_000n },
      { collateralIndex: 1n, assets: 20_000n },
    ];
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

    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const receiver = "0x0000000000000000000000000000000000080002" as Address;
    // Open real debt through a ratified lend offer before attempting either withdrawal.
    const maker = "0x0000000000000000000000000000000000080003" as Address;
    const ratifier = getChainAddress(base.id, "setterRatifier");
    await client.setBalance({ address: maker, value: 10n ** 18n });
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [ratifier, true, maker],
      account: maker,
    });
    await client.deal({
      erc20: market.loanToken,
      account: maker,
      amount: 20_000n,
    });
    await client.writeContract({
      address: market.loanToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, maxUint256],
      account: maker,
    });
    const tree = Tree.create([
      Offer.create({
        market,
        buy: true,
        maker,
        expiry: market.maturity,
        tick: 5_000n,
        ratifier,
        maxUnits: 10_000n,
      }),
    ]);
    await client.writeContract({
      address: ratifier,
      abi: setterRatifierAbi,
      functionName: "setIsRootRatified",
      args: [maker, tree.root, true],
      account: maker,
    });
    const item = SetterRatifierUtils.ratify({ tree })[0]!;
    const borrow = entity.takeBorrow({
      accountAddress: account,
      marketData: await entity.getMarketData(id),
      positionData: await entity.getPositionData({
        marketId: id,
        accountAddress: account,
      }),
      collateralPrices: [10n ** 36n, 10n ** 36n],
      target: { type: "units", units: 10_000n, minSellerAssets: 1n },
      takeableOffers: [
        {
          units: 10_000n,
          offer: OfferUtils.toStruct({ offer: item.offer }),
          ratifierData: item.ratifierData,
        },
      ],
      deadline: Time.timestamp() + 600n,
    });
    for (const requirement of await borrow.getRequirements()) {
      if (!("to" in requirement))
        throw new Error("expected onchain requirement");
      const requirementHash = await client.sendTransaction(requirement);
      expect(
        (await client.waitForTransactionReceipt({ hash: requirementHash }))
          .status,
      ).toBe("success");
    }
    const borrowHash = await client.sendTransaction(borrow.buildTx());
    expect(
      (await client.waitForTransactionReceipt({ hash: borrowHash })).status,
    ).toBe("success");
    const position = await entity.getPositionData({
      marketId: id,
      accountAddress: account,
    });
    expect(position.debt).toBe(10_000n);
    const collateralWithdrawals = [
      { collateralIndex: 0n, assets: 1_000n },
      { collateralIndex: 1n, assets: unhealthy ? 19_000n : 2_000n },
    ];
    const tokensByIndex = collateralWithdrawals.map(
      ({ collateralIndex }) =>
        MarketUtils.getCollateralByIndex(market, collateralIndex).token,
    );
    const receiverBefore = await Promise.all(
      tokensByIndex.map((address) =>
        client.readContract({
          address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [receiver],
        }),
      ),
    );
    const withdrawal = unhealthy
      ? midnightWithdrawCollateralBatch({
          chainId: base.id,
          market,
          collateralWithdrawals,
          onBehalf: account,
          receiver,
        })
      : entity
          .withdrawCollateralBatch({
            accountAddress: account,
            marketData: await entity.getMarketData(id),
            positionData: position,
            collateralPrices: [10n ** 36n, 10n ** 36n],
            collateralWithdrawals,
            receiver,
          })
          .buildTx();
    const withdrawalHash = await client.sendTransaction({
      ...withdrawal,
      gas: 8_000_000n,
    });
    expect(
      (await client.waitForTransactionReceipt({ hash: withdrawalHash })).status,
    ).toBe(unhealthy ? "reverted" : "success");
    for (const [
      index,
      { collateralIndex, assets },
    ] of collateralWithdrawals.entries()) {
      expect(
        await client.readContract({
          address: midnight,
          abi: midnightAbi,
          functionName: "collateral",
          args: [id, account, collateralIndex],
        }),
      ).toBe(position.collateral[index]! - (unhealthy ? 0n : assets));
      expect(
        await client.readContract({
          address: tokensByIndex[index]!,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [receiver],
        }),
      ).toBe(receiverBefore[index]! + (unhealthy ? 0n : assets));
    }
  },
);
