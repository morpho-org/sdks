import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MarketParams,
  MathLib,
  addresses,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import {
  getAddress,
  maxUint256,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";

import {
  blueAbi,
  fetchAccrualPosition,
  fetchHolding,
  fetchMarket,
  fetchPosition,
  fetchToken,
  fetchUser,
} from "@morpho-org/blue-sdk-viem";
import {
  encodeBundle,
  finalizeBundle,
  populateBundle,
} from "@morpho-org/bundler-sdk-viem";
import { markets } from "@morpho-org/morpho-test";
import { fromEntries } from "@morpho-org/morpho-ts";
import type { ViemTestContext } from "@morpho-org/test/vitest";
import { sendTransaction } from "viem/actions";
import { type TestAPI, describe, expect } from "vitest";
import { SimulationState } from "../../../../simulation-sdk/src/SimulationState.js";
import { MigratableBorrowPosition_Blue } from "../../../src/index.js";
import { test } from "../setup.js";

const TEST_CONFIGS: {
  chainId: ChainId;
  testFn: TestAPI<ViemTestContext>;
  marketFrom: MarketParams;
  marketTo: MarketParams;
}[] = [
  {
    chainId: ChainId.EthMainnet,
    testFn: test[ChainId.EthMainnet],
    marketFrom: markets[ChainId.EthMainnet].eth_wstEth_2,
    marketTo: new MarketParams({
      ...markets[ChainId.EthMainnet].eth_wstEth_2,
      lltv: parseUnits("0.965", 18),
    }),
  },
  {
    chainId: ChainId.BaseMainnet,
    //@ts-expect-error
    testFn: test[ChainId.BaseMainnet],
    marketFrom: new MarketParams({
      collateralToken: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
      loanToken: "0x4200000000000000000000000000000000000006",
      lltv: parseEther("0.965"),
      oracle: "0xaE10cbdAa587646246c8253E4532A002EE4fa7A4",
      irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
    }),
    marketTo: new MarketParams({
      collateralToken: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
      loanToken: "0x4200000000000000000000000000000000000006",
      lltv: parseEther("0.945"),
      oracle: "0xaE10cbdAa587646246c8253E4532A002EE4fa7A4",
      irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
    }),
  },
] as const;

const fetchSimulationState = async (
  client: ViemTestContext["client"],
  marketParams: MarketParams[],
) => {
  const chainId = client.chain.id;

  const { bundler } = getChainAddresses(chainId);

  const marketIds = [...new Set(marketParams.map(({ id }) => id))];
  const tokenAddresses = [
    ...new Set(
      marketParams.flatMap(({ collateralToken, loanToken }) => [
        collateralToken,
        loanToken,
      ]),
    ),
  ];
  const user = client.account.address;

  const [
    block,
    markets,
    tokens,
    holdings,
    bundlerHoldings,
    positions,
    userData,
  ] = await Promise.all([
    client.getBlock({ blockTag: "latest" }),
    Promise.all(
      marketIds.map(async (id) => [id, await fetchMarket(id, client)] as const),
    ),
    Promise.all(
      tokenAddresses.map(
        async (address) =>
          [address, await fetchToken(address, client)] as const,
      ),
    ),
    Promise.all(
      tokenAddresses.map(
        async (address) =>
          [address, await fetchHolding(user, address, client)] as const,
      ),
    ),
    Promise.all(
      tokenAddresses.map(
        async (address) =>
          [address, await fetchHolding(bundler, address, client)] as const,
      ),
    ),
    Promise.all(
      marketIds.map(
        async (id) => [id, await fetchPosition(user, id, client)] as const,
      ),
    ),
    fetchUser(user, client),
  ]);
  return new SimulationState({
    chainId,
    block,
    global: { feeRecipient: zeroAddress },
    markets: fromEntries(markets),
    tokens: fromEntries(tokens),
    holdings: {
      [user]: fromEntries(holdings),
      [bundler]: fromEntries(bundlerHoldings),
    },
    positions: { [user]: fromEntries(positions) },
    users: { [user]: userData },
  });
};

describe("Borrow position on blue", () => {
  for (const { chainId, testFn, marketFrom, marketTo } of TEST_CONFIGS) {
    const { bundler, morpho } = addresses[chainId];

    const writeSupply = async (
      client: ViemTestContext["client"],
      marketParams: MarketParams,
      amount: bigint,
      onBehalf = client.account.address,
    ) => {
      await client.deal({
        erc20: marketParams.loanToken,
        amount: amount,
      });
      await client.approve({
        address: marketParams.loanToken,
        args: [morpho, amount],
      });
      await client.writeContract({
        abi: blueAbi,
        address: morpho,
        functionName: "supply",
        args: [{ ...marketParams }, amount, 0n, onBehalf, "0x"],
      });
    };
    const writeBorrow = async (
      client: ViemTestContext["client"],
      marketParams: MarketParams,
      collateral: bigint,
      borrow: bigint,
    ) => {
      await client.deal({
        erc20: marketParams.collateralToken,
        amount: collateral,
      });
      await client.approve({
        address: marketParams.collateralToken,
        args: [morpho, collateral],
      });
      await client.writeContract({
        abi: blueAbi,
        address: morpho,
        functionName: "supplyCollateral",
        args: [marketParams, collateral, client.account.address, "0x"],
      });

      await client.writeContract({
        abi: blueAbi,
        address: morpho,
        functionName: "borrow",
        args: [
          { ...marketParams },
          borrow,
          0n,
          client.account.address,
          client.account.address,
        ],
      });

      await client.mine({ blocks: 500 }); //accrue some interests
    };

    describe(`on chain ${chainId}`, () => {
      testFn("should partially migrate borrow position", async ({ client }) => {
        const collateralAmount = parseEther("5");
        const borrowAmount = parseEther("1");

        // increase liquidities
        const lp = getAddress(client.account.address.replace(/.$/, "0"));
        await writeSupply(client, marketFrom, borrowAmount, lp);
        await writeSupply(client, marketTo, borrowAmount * 2n, lp);

        await writeBorrow(client, marketFrom, collateralAmount, borrowAmount);

        const dataBefore = await fetchSimulationState(client, [
          marketFrom,
          marketTo,
        ]);

        const initialPositionFrom = dataBefore
          .getAccrualPosition(client.account.address, marketFrom.id)
          .accrueInterest(dataBefore.block.timestamp);

        const migratablePosition = new MigratableBorrowPosition_Blue({
          market: initialPositionFrom.market,
          position: initialPositionFrom,
        });
        const collateralToMigrate = collateralAmount / 2n;
        const borrowToMigrate = borrowAmount / 2n;
        const slippageFrom = DEFAULT_SLIPPAGE_TOLERANCE;
        const slippageTo = DEFAULT_SLIPPAGE_TOLERANCE - 10n;

        const operation = migratablePosition.getMigrationOperations(
          {
            marketTo: marketTo.id,
            collateralAmount: collateralToMigrate,
            borrowAmount: borrowToMigrate,
            slippageFrom,
            slippageTo,
          },
          chainId,
        );

        expect(operation).toEqual({
          type: "Blue_SupplyCollateral",
          address: "0x",
          sender: client.account.address,
          args: {
            id: marketTo.id,
            assets: collateralToMigrate,
            onBehalf: client.account.address,
            callback: [
              {
                type: "Blue_Borrow",
                address: "0x",
                sender: client.account.address,
                args: {
                  id: marketTo.id,
                  assets: borrowToMigrate,
                  receiver: bundler,
                  onBehalf: client.account.address,
                  slippage: slippageTo,
                },
              },
              {
                type: "Blue_Repay",
                address: "0x",
                sender: client.account.address,
                args: {
                  id: marketFrom.id,
                  assets: borrowToMigrate,
                  slippage: slippageFrom,
                  onBehalf: client.account.address,
                },
              },
              {
                type: "Blue_WithdrawCollateral",
                address: "0x",
                sender: client.account.address,
                args: {
                  id: marketFrom.id,
                  assets: collateralToMigrate,
                  onBehalf: client.account.address,
                  receiver: bundler,
                },
              },
            ],
          },
        });
        const populatedBundle = populateBundle([operation], dataBefore);
        const finalizedBundle = finalizeBundle(
          populatedBundle.operations,
          dataBefore,
          client.account.address,
        );
        expect(finalizedBundle).toEqual([
          {
            type: "Blue_SupplyCollateral",
            address: "0x",
            sender: bundler,
            args: {
              id: marketTo.id,
              assets: collateralToMigrate,
              onBehalf: client.account.address,
              callback: [
                {
                  type: "Blue_SetAuthorization",
                  sender: bundler,
                  address: morpho,
                  args: {
                    owner: client.account.address,
                    isBundlerAuthorized: true,
                  },
                },
                {
                  type: "Blue_Borrow",
                  address: "0x",
                  sender: bundler,
                  args: {
                    id: marketTo.id,
                    assets: borrowToMigrate,
                    receiver: bundler,
                    onBehalf: client.account.address,
                    slippage: slippageTo,
                  },
                },
                {
                  type: "Blue_Repay",
                  address: "0x",
                  sender: bundler,
                  args: {
                    id: marketFrom.id,
                    assets: borrowToMigrate,
                    slippage: slippageFrom,
                    onBehalf: client.account.address,
                  },
                },
                {
                  type: "Blue_WithdrawCollateral",
                  address: "0x",
                  sender: bundler,
                  args: {
                    id: marketFrom.id,
                    assets: collateralToMigrate,
                    onBehalf: client.account.address,
                    receiver: bundler,
                  },
                },
              ],
            },
          },
        ]);
        const bundle = encodeBundle(finalizedBundle, dataBefore, false);
        for (const req of bundle.requirements.txs) {
          await sendTransaction(client, req.tx);
        }
        await sendTransaction(client, bundle.tx());

        const [finalPositionFrom, finalPositionTo] = await Promise.all([
          fetchAccrualPosition(client.account.address, marketFrom.id, client),
          fetchAccrualPosition(client.account.address, marketTo.id, client),
        ]);

        expect(finalPositionFrom.collateral).toEqual(
          collateralAmount - collateralToMigrate,
        );
        expect(finalPositionTo.collateral).toEqual(collateralToMigrate);
        expect(finalPositionFrom.borrowShares).approximately(
          initialPositionFrom.borrowShares -
            finalPositionFrom.market.toBorrowShares(borrowToMigrate),
          2n,
        );
        expect(finalPositionTo.borrowAssets).approximately(borrowToMigrate, 2n);
      });

      testFn("should fully migrate borrow position", async ({ client }) => {
        const collateralAmount = parseEther("5");
        const borrowAmount = parseEther("1");

        // increase liquidities
        const lp = getAddress(client.account.address.replace(/.$/, "0"));
        await writeSupply(client, marketFrom, borrowAmount, lp);
        await writeSupply(client, marketTo, borrowAmount * 2n, lp);

        await writeBorrow(client, marketFrom, collateralAmount, borrowAmount);

        const dataBefore = await fetchSimulationState(client, [
          marketFrom,
          marketTo,
        ]);

        const initialPositionFrom = dataBefore
          .getAccrualPosition(client.account.address, marketFrom.id)
          .accrueInterest(dataBefore.block.timestamp);

        const migratablePosition = new MigratableBorrowPosition_Blue({
          market: initialPositionFrom.market,
          position: initialPositionFrom,
        });
        const slippageFrom = DEFAULT_SLIPPAGE_TOLERANCE;
        const slippageTo = DEFAULT_SLIPPAGE_TOLERANCE - 10n;
        const operation = migratablePosition.getMigrationOperations(
          {
            marketTo: marketTo.id,
            collateralAmount: maxUint256,
            borrowAmount: maxUint256,
            slippageFrom,
            slippageTo,
          },
          chainId,
        );
        expect(operation).toEqual({
          type: "Blue_SupplyCollateral",
          address: "0x",
          sender: client.account.address,
          args: {
            id: marketTo.id,
            assets: collateralAmount,
            onBehalf: client.account.address,
            callback: [
              {
                type: "Blue_Borrow",
                address: "0x",
                sender: client.account.address,
                args: {
                  id: marketTo.id,
                  assets: MathLib.wMulUp(
                    initialPositionFrom.borrowAssets,
                    MathLib.WAD + slippageFrom,
                  ),
                  receiver: bundler,
                  onBehalf: client.account.address,
                  slippage: slippageTo,
                },
              },
              {
                type: "Blue_Repay",
                address: "0x",
                sender: client.account.address,
                args: {
                  id: marketFrom.id,
                  shares: initialPositionFrom.borrowShares,
                  slippage: slippageFrom,
                  onBehalf: client.account.address,
                },
              },
              {
                type: "Blue_WithdrawCollateral",
                address: "0x",
                sender: client.account.address,
                args: {
                  id: marketFrom.id,
                  assets: collateralAmount,
                  onBehalf: client.account.address,
                  receiver: bundler,
                },
              },
            ],
          },
        });
        const populatedBundle = populateBundle([operation], dataBefore, {});
        const finalizedBundle = finalizeBundle(
          populatedBundle.operations,
          dataBefore,
          client.account.address,
        );
        expect(finalizedBundle).toEqual([
          {
            type: "Blue_SupplyCollateral",
            address: "0x",
            sender: bundler,
            args: {
              id: marketTo.id,
              assets: collateralAmount,
              onBehalf: client.account.address,
              callback: [
                {
                  type: "Blue_SetAuthorization",
                  sender: bundler,
                  address: morpho,
                  args: {
                    owner: client.account.address,
                    isBundlerAuthorized: true,
                  },
                },
                {
                  type: "Blue_Borrow",
                  address: "0x",
                  sender: bundler,
                  args: {
                    id: marketTo.id,
                    assets: MathLib.wMulUp(
                      initialPositionFrom.borrowAssets,
                      MathLib.WAD + slippageFrom,
                    ),
                    receiver: bundler,
                    onBehalf: client.account.address,
                    slippage: slippageTo,
                  },
                },
                {
                  type: "Blue_Repay",
                  address: "0x",
                  sender: bundler,
                  args: {
                    id: marketFrom.id,
                    shares: initialPositionFrom.borrowShares,
                    slippage: slippageFrom,
                    onBehalf: client.account.address,
                  },
                },
                {
                  type: "Blue_WithdrawCollateral",
                  address: "0x",
                  sender: bundler,
                  args: {
                    id: marketFrom.id,
                    assets: collateralAmount,
                    onBehalf: client.account.address,
                    receiver: bundler,
                  },
                },
              ],
            },
          },
          {
            address: marketFrom.loanToken,
            args: {
              amount: maxUint256,
              from: bundler,
              to: client.account.address,
            },
            sender: bundler,
            type: "Erc20_Transfer",
          },
        ]);
        const bundle = encodeBundle(finalizedBundle, dataBefore, false);
        for (const req of bundle.requirements.txs) {
          await sendTransaction(client, req.tx);
        }
        await sendTransaction(client, bundle.tx());

        const [finalPositionFrom, finalPositionTo] = await Promise.all([
          fetchAccrualPosition(client.account.address, marketFrom.id, client),
          fetchAccrualPosition(client.account.address, marketTo.id, client),
        ]);

        expect(finalPositionFrom.collateral).toEqual(0n);
        expect(finalPositionTo.collateral).toEqual(collateralAmount);
        expect(finalPositionFrom.borrowShares).toEqual(0n);
        const expectedBorrowAssets = MathLib.wMulUp(
          initialPositionFrom.borrowAssets,
          MathLib.WAD + slippageFrom,
        );
        expect(finalPositionTo.borrowAssets).approximately(
          expectedBorrowAssets,
          2n,
        );
        const [loanTokenBundlerBalance, collateralTokenBundlerBalance] =
          await Promise.all([
            client.balanceOf({ erc20: marketFrom.loanToken, owner: bundler }),
            client.balanceOf({
              erc20: marketFrom.collateralToken,
              owner: bundler,
            }),
          ]);
        expect(loanTokenBundlerBalance).toEqual(0n);
        expect(collateralTokenBundlerBalance).toEqual(0n);
      });
    });
  }
});
