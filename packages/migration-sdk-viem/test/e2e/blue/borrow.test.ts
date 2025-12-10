import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MarketParams,
  MathLib,
  addressesRegistry,
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
import { SimulationState } from "@morpho-org/simulation-sdk";
import type { ViemTestContext } from "@morpho-org/test/vitest";
import { sendTransaction } from "viem/actions";
import { type TestAPI, describe, expect } from "vitest";
import { MigratableBorrowPosition_Blue } from "../../../src/index.js";
import { test } from "../setup.js";

const TEST_CONFIGS = [
  {
    chainId: ChainId.EthMainnet,
    testFn: test[ChainId.EthMainnet] as TestAPI<ViemTestContext>,
    marketFrom: markets[ChainId.EthMainnet].eth_wstEth_2,
    marketTo: new MarketParams({
      ...markets[ChainId.EthMainnet].eth_wstEth_2,
      lltv: parseUnits("0.965", 18),
    }),
  },
  {
    chainId: ChainId.BaseMainnet,
    testFn: test[ChainId.BaseMainnet] as TestAPI<ViemTestContext>,
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

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

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
    bundlerPositions,
    userData,
    bundlerData,
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
          [
            address,
            await fetchHolding(generalAdapter1, address, client),
          ] as const,
      ),
    ),
    Promise.all(
      marketIds.map(
        async (id) => [id, await fetchPosition(user, id, client)] as const,
      ),
    ),
    Promise.all(
      marketIds.map(
        async (id) =>
          [id, await fetchPosition(generalAdapter1, id, client)] as const,
      ),
    ),
    fetchUser(user, client),
    fetchUser(generalAdapter1, client),
  ]);
  return new SimulationState({
    chainId,
    block,
    global: { feeRecipient: zeroAddress },
    markets: fromEntries(markets),
    tokens: fromEntries(tokens),
    holdings: {
      [user]: fromEntries(holdings),
      [generalAdapter1]: fromEntries(bundlerHoldings),
    },
    positions: {
      [user]: fromEntries(positions),
      [generalAdapter1]: fromEntries(bundlerPositions),
    },
    users: { [user]: userData, [generalAdapter1]: bundlerData },
  });
};

describe("Borrow position on blue", () => {
  for (const { chainId, testFn, marketFrom, marketTo } of TEST_CONFIGS) {
    const {
      bundler3: { bundler3, generalAdapter1 },
      morpho,
    } = addressesRegistry[chainId];

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
        const collateralToMigrate = (2n * collateralAmount) / 3n;
        const borrowToMigrate = (2n * borrowAmount) / 3n;
        const slippageFrom = DEFAULT_SLIPPAGE_TOLERANCE;
        const slippageTo = DEFAULT_SLIPPAGE_TOLERANCE - 10n;

        const operation = migratablePosition.getMigrationOperations(
          {
            marketTo: marketTo.id,
            collateralAssets: collateralToMigrate,
            borrowAssets: borrowToMigrate,
            slippageFrom,
            slippageTo,
          },
          chainId,
        );

        expect(operation).toEqual({
          type: "Blue_SupplyCollateral",
          sender: client.account.address,
          args: {
            id: marketTo.id,
            assets: collateralToMigrate,
            onBehalf: client.account.address,
            callback: [
              {
                type: "Blue_Borrow",
                args: {
                  id: marketTo.id,
                  assets: borrowToMigrate,
                  receiver: generalAdapter1,
                  onBehalf: client.account.address,
                  slippage: slippageTo,
                },
              },
              {
                type: "Blue_Repay",
                args: {
                  id: marketFrom.id,
                  assets: borrowToMigrate,
                  slippage: slippageFrom,
                  onBehalf: client.account.address,
                },
              },
              {
                type: "Blue_WithdrawCollateral",
                args: {
                  id: marketFrom.id,
                  assets: collateralToMigrate,
                  onBehalf: client.account.address,
                  receiver: generalAdapter1,
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
            sender: generalAdapter1,
            args: {
              id: marketTo.id,
              assets: collateralToMigrate,
              onBehalf: client.account.address,
              callback: [
                {
                  type: "Blue_SetAuthorization",
                  sender: bundler3,
                  args: {
                    owner: client.account.address,
                    isAuthorized: true,
                    authorized: generalAdapter1,
                  },
                },
                {
                  type: "Blue_Borrow",
                  sender: generalAdapter1,
                  args: {
                    id: marketTo.id,
                    assets: borrowToMigrate,
                    receiver: generalAdapter1,
                    onBehalf: client.account.address,
                    slippage: slippageTo,
                  },
                },
                {
                  type: "Blue_Repay",
                  sender: generalAdapter1,
                  args: {
                    id: marketFrom.id,
                    assets: borrowToMigrate,
                    slippage: slippageFrom,
                    onBehalf: client.account.address,
                  },
                },
                {
                  type: "Blue_WithdrawCollateral",
                  sender: generalAdapter1,
                  args: {
                    id: marketFrom.id,
                    assets: collateralToMigrate,
                    onBehalf: client.account.address,
                    receiver: generalAdapter1,
                  },
                },
              ],
            },
          },
          {
            type: "Erc20_Transfer",
            sender: generalAdapter1,
            address: marketFrom.collateralToken,
            args: {
              amount: maxUint256,
              from: generalAdapter1,
              to: client.account.address,
            },
          },
          {
            type: "Erc20_Transfer",
            sender: generalAdapter1,
            address: marketFrom.loanToken,
            args: {
              amount: maxUint256,
              from: generalAdapter1,
              to: client.account.address,
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
        expect(finalPositionFrom.borrowShares).toEqual(
          initialPositionFrom.borrowShares -
            finalPositionFrom.market.toBorrowShares(borrowToMigrate),
        );
        expect(finalPositionTo.borrowAssets).toEqual(borrowToMigrate + 1n);
      });

      testFn(
        "should partially migrate borrow position with shares",
        async ({ client }) => {
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
          const collateralToMigrate = (2n * collateralAmount) / 3n;
          const borrowToMigrate = (2n * borrowAmount) / 3n;

          const slippageFrom = DEFAULT_SLIPPAGE_TOLERANCE;
          const slippageTo = DEFAULT_SLIPPAGE_TOLERANCE - 10n;

          const sharesToMigrate =
            initialPositionFrom.market.toBorrowShares(borrowToMigrate);

          const operation = migratablePosition.getMigrationOperations(
            {
              marketTo: marketTo.id,
              collateralAssets: collateralToMigrate,
              borrowShares: sharesToMigrate,
              slippageFrom,
              slippageTo,
            },
            chainId,
          );

          expect(operation).toEqual({
            type: "Blue_SupplyCollateral",
            sender: client.account.address,
            args: {
              id: marketTo.id,
              assets: collateralToMigrate,
              onBehalf: client.account.address,
              callback: [
                {
                  type: "Blue_Borrow",
                  args: {
                    id: marketTo.id,
                    assets: MathLib.wMulUp(
                      borrowToMigrate,
                      MathLib.WAD + slippageFrom,
                    ),
                    receiver: generalAdapter1,
                    onBehalf: client.account.address,
                    slippage: slippageTo,
                  },
                },
                {
                  type: "Blue_Repay",
                  args: {
                    id: marketFrom.id,
                    shares: sharesToMigrate,
                    slippage: slippageFrom,
                    onBehalf: client.account.address,
                  },
                },
                {
                  type: "Blue_WithdrawCollateral",
                  args: {
                    id: marketFrom.id,
                    assets: collateralToMigrate,
                    onBehalf: client.account.address,
                    receiver: generalAdapter1,
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
              sender: generalAdapter1,
              args: {
                id: marketTo.id,
                assets: collateralToMigrate,
                onBehalf: client.account.address,
                callback: [
                  {
                    type: "Blue_SetAuthorization",
                    sender: bundler3,
                    args: {
                      owner: client.account.address,
                      isAuthorized: true,
                      authorized: generalAdapter1,
                    },
                  },
                  {
                    type: "Blue_Borrow",
                    sender: generalAdapter1,
                    args: {
                      id: marketTo.id,
                      assets: MathLib.wMulUp(
                        borrowToMigrate,
                        MathLib.WAD + slippageFrom,
                      ),
                      receiver: generalAdapter1,
                      onBehalf: client.account.address,
                      slippage: slippageTo,
                    },
                  },
                  {
                    type: "Blue_Repay",
                    sender: generalAdapter1,
                    args: {
                      id: marketFrom.id,
                      shares: sharesToMigrate,
                      slippage: slippageFrom,
                      onBehalf: client.account.address,
                    },
                  },
                  {
                    type: "Blue_WithdrawCollateral",
                    sender: generalAdapter1,
                    args: {
                      id: marketFrom.id,
                      assets: collateralToMigrate,
                      onBehalf: client.account.address,
                      receiver: generalAdapter1,
                    },
                  },
                ],
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: marketFrom.collateralToken,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: marketFrom.loanToken,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: client.account.address,
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
          expect(finalPositionFrom.borrowShares).toEqual(
            initialPositionFrom.borrowShares - sharesToMigrate,
          );
          const expectedBorrowAssets = MathLib.wMulUp(
            borrowToMigrate,
            MathLib.WAD + slippageFrom,
          );
          expect(finalPositionTo.borrowAssets).toEqual(
            expectedBorrowAssets + 1n,
          );
        },
      );

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
            collateralAssets: migratablePosition.position.collateral,
            borrowShares: migratablePosition.position.borrowShares,
            slippageFrom,
            slippageTo,
          },
          chainId,
        );
        expect(operation).toEqual({
          type: "Blue_SupplyCollateral",
          sender: client.account.address,
          args: {
            id: marketTo.id,
            assets: collateralAmount,
            onBehalf: client.account.address,
            callback: [
              {
                type: "Blue_Borrow",
                args: {
                  id: marketTo.id,
                  assets: MathLib.wMulUp(
                    initialPositionFrom.borrowAssets,
                    MathLib.WAD + slippageFrom,
                  ),
                  receiver: generalAdapter1,
                  onBehalf: client.account.address,
                  slippage: slippageTo,
                },
              },
              {
                type: "Blue_Repay",
                args: {
                  id: marketFrom.id,
                  shares: initialPositionFrom.borrowShares,
                  slippage: slippageFrom,
                  onBehalf: client.account.address,
                },
              },
              {
                type: "Blue_WithdrawCollateral",
                args: {
                  id: marketFrom.id,
                  assets: collateralAmount,
                  onBehalf: client.account.address,
                  receiver: generalAdapter1,
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
            sender: generalAdapter1,
            args: {
              id: marketTo.id,
              assets: collateralAmount,
              onBehalf: client.account.address,
              callback: [
                {
                  type: "Blue_SetAuthorization",
                  sender: bundler3,
                  args: {
                    owner: client.account.address,
                    isAuthorized: true,
                    authorized: generalAdapter1,
                  },
                },
                {
                  type: "Blue_Borrow",
                  sender: generalAdapter1,
                  args: {
                    id: marketTo.id,
                    assets: MathLib.wMulUp(
                      initialPositionFrom.borrowAssets,
                      MathLib.WAD + slippageFrom,
                    ),
                    receiver: generalAdapter1,
                    onBehalf: client.account.address,
                    slippage: slippageTo,
                  },
                },
                {
                  type: "Blue_Repay",
                  sender: generalAdapter1,
                  args: {
                    id: marketFrom.id,
                    shares: initialPositionFrom.borrowShares,
                    slippage: slippageFrom,
                    onBehalf: client.account.address,
                  },
                },
                {
                  type: "Blue_WithdrawCollateral",
                  sender: generalAdapter1,
                  args: {
                    id: marketFrom.id,
                    assets: collateralAmount,
                    onBehalf: client.account.address,
                    receiver: generalAdapter1,
                  },
                },
              ],
            },
          },
          {
            type: "Erc20_Transfer",
            sender: generalAdapter1,
            address: marketFrom.collateralToken,
            args: {
              amount: maxUint256,
              from: generalAdapter1,
              to: client.account.address,
            },
          },
          {
            type: "Erc20_Transfer",
            sender: generalAdapter1,
            address: marketFrom.loanToken,
            args: {
              amount: maxUint256,
              from: generalAdapter1,
              to: client.account.address,
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

        expect(finalPositionFrom.collateral).toEqual(0n);
        expect(finalPositionTo.collateral).toEqual(collateralAmount);
        expect(finalPositionFrom.borrowShares).toEqual(0n);
        const expectedBorrowAssets = MathLib.wMulUp(
          initialPositionFrom.borrowAssets,
          MathLib.WAD + slippageFrom,
        );
        expect(finalPositionTo.borrowAssets).toEqual(expectedBorrowAssets + 1n);
        const [loanTokenBundlerBalance, collateralTokenBundlerBalance] =
          await Promise.all([
            client.balanceOf({
              erc20: marketFrom.loanToken,
              owner: generalAdapter1,
            }),
            client.balanceOf({
              erc20: marketFrom.collateralToken,
              owner: generalAdapter1,
            }),
          ]);
        expect(loanTokenBundlerBalance).toEqual(0n);
        expect(collateralTokenBundlerBalance).toEqual(0n);
      });
    });
  }
});
