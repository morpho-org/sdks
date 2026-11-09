import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import {
  MarketUtils,
  midnightAbi,
  Offer,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { fault } from "@morpho-org/test/chaos";
import {
  type Address,
  ContractFunctionExecutionError,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  isAddressEqual,
  maxUint256,
  parseEther,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import type { MidnightActions } from "../../src/entities/midnight/midnight.js";
import { morphoViemExtension } from "../../src/index.js";
import { withChainTimestamp } from "../helpers/time.js";
import {
  expectMidnightFlowFailsClosed,
  midnightChaosTest,
  setUpMidnightChaosMarket,
  withMidnightFaultProxy,
} from "./midnightSetup.js";

const faults = [
  fault.refuse(),
  fault.status(503, "RPC unavailable"),
  fault.rawBody("{not json"),
  fault.rpcError(-32603, "RPC unavailable"),
  fault.forwardThenDrop(),
] as const;
const flows = [
  "takeLend",
  "takeBorrow",
  "supplyCollateralTakeBorrow",
  "takeWithdraw",
  "takeRepayWithdrawCollateral",
  "repayWithdrawCollateral",
  "redeem",
] as const;

describe.sequential("chaos: Midnight taker RPC", () => {
  for (const flow of flows) {
    midnightChaosTest.for(faults)(
      `${flow} fails closed on $kind`,
      { tags: ["nightly"] },
      async (injectedFault, { client }) => {
        const { params, lender, borrower } =
          await setUpMidnightChaosMarket(client);
        const midnight = getChainAddress(base.id, "midnight");
        const bundles = getChainAddress(base.id, "midnightBundlesV2");
        const creditor = E2E_MIDNIGHT_WALLETS.C;
        const units = parseEther("0.1");
        const sharedClient = client as unknown as AnvilTestClient;
        await fundE2eMidnightWallets(sharedClient, {
          market: params,
          wallets: {
            B: { loanAssets: parseEther("1") },
            C: { loanAssets: parseEther("2") },
          },
          approve: midnight,
        });

        const offers = [];
        for (const [maker, buy, reduceOnly] of [
          [borrower, false, false],
          [lender, true, false],
          [creditor, false, true],
        ] as const) {
          const tree = Tree.create([
            Offer.create({
              market: params,
              maker,
              buy,
              reduceOnly,
              expiry: params.maturity,
              tick: 5_000n,
              maxUnits: parseEther("2"),
              ratifier: getChainAddress(base.id, "setterRatifier"),
            }),
          ]);
          await postE2eSetterTree(sharedClient, {
            chainId: base.id,
            maker,
            tree,
          });
          offers.push(getE2eTakeableOffers({ tree, units })[0]!);
        }
        const [borrowOffer, lendOffer, exitOffer] = offers;
        // A real fill creates creditor credit and borrower debt; partial repayment funds redemption.
        await client.writeContract({
          account: creditor,
          address: midnight,
          abi: midnightAbi,
          functionName: "take",
          args: [
            borrowOffer!.offer,
            borrowOffer!.ratifierData,
            parseEther("1"),
            creditor,
            zeroAddress,
            zeroAddress,
            "0x",
          ],
        });
        await client.writeContract({
          account: borrower,
          address: midnight,
          abi: midnightAbi,
          functionName: "repay",
          args: [
            MarketUtils.toStruct(params),
            parseEther("0.5"),
            borrower,
            zeroAddress,
            "0x",
          ],
        });

        const entity = client
          .extend(morphoViemExtension())
          .morpho.midnight(base.id);
        const marketId = MarketUtils.toId(params);
        const borrowerPosition = await entity.getPositionData({
          marketId,
          accountAddress: borrower,
        });
        const creditorPosition = await entity.getPositionData({
          marketId,
          accountAddress: creditor,
        });
        expect(borrowerPosition.debt).toBeGreaterThan(units);
        expect(creditorPosition.credit).toBeGreaterThan(units);
        expect(creditorPosition.market.withdrawable).toBeGreaterThan(units);
        const { timestamp } = await client.getBlock();
        const deadline = timestamp + 600n;
        const marketData = borrowerPosition.market;
        const buyTarget = {
          type: "units",
          units,
          maxBuyerAssets: units,
        } as const;
        const sellTarget = {
          type: "units",
          units,
          minSellerAssets: 1n,
        } as const;
        const health = {
          accountAddress: borrower,
          marketData,
          positionData: borrowerPosition,
          collateralPrices: [ORACLE_PRICE_SCALE],
          deadline,
        };
        const prepare = async (sdk: MidnightActions) => {
          // redeem is offline: its RPC boundary is the caller's explicit position snapshot fetch.
          const positionData =
            flow === "redeem"
              ? await sdk.getPositionData({
                  marketId,
                  accountAddress: creditor,
                })
              : creditorPosition;
          return withChainTimestamp(timestamp, () => {
            switch (flow) {
              case "takeLend":
                return sdk.takeLend({
                  accountAddress: lender,
                  marketData,
                  target: buyTarget,
                  takeableOffers: [borrowOffer!],
                  maxContinuousFee: maxUint256,
                  deadline,
                });
              case "takeBorrow":
                return sdk.takeBorrow({
                  ...health,
                  target: sellTarget,
                  takeableOffers: [lendOffer!],
                });
              case "supplyCollateralTakeBorrow":
                return sdk.supplyCollateralTakeBorrow({
                  ...health,
                  target: sellTarget,
                  takeableOffers: [lendOffer!],
                  collateralSupplies: [{ collateralIndex: 0n, assets: units }],
                });
              case "takeWithdraw":
                return sdk.takeWithdraw({
                  accountAddress: creditor,
                  marketData,
                  target: sellTarget,
                  takeableOffers: [lendOffer!],
                  deadline,
                });
              case "takeRepayWithdrawCollateral":
                return sdk.takeRepayWithdrawCollateral({
                  ...health,
                  target: buyTarget,
                  takeableOffers: [exitOffer!],
                  repayEnabled: false,
                  maxContinuousFee: maxUint256,
                  collateralWithdrawals: [
                    { collateralIndex: 0n, assets: units },
                  ],
                });
              case "repayWithdrawCollateral":
                return sdk.repayWithdrawCollateral({
                  ...health,
                  repay: { type: "assets", assets: units },
                  collateralWithdrawals: [
                    { collateralIndex: 0n, assets: units },
                  ],
                });
              case "redeem":
                return sdk.redeem({
                  accountAddress: creditor,
                  positionData,
                  units,
                });
            }
          });
        };

        const allowanceToken =
          flow === "supplyCollateralTakeBorrow"
            ? params.collateralParams[0]!.token
            : params.loanToken;
        const authorizationRead =
          flow === "takeBorrow" || flow === "takeWithdraw";
        const owner = flow === "takeLend" ? lender : borrower;
        const calldata = authorizationRead
          ? encodeFunctionData({
              abi: midnightAbi,
              functionName: "isAuthorized",
              args: [flow === "takeWithdraw" ? creditor : borrower, bundles],
            })
          : encodeFunctionData({
              abi: erc20Abi,
              functionName: "allowance",
              args: [owner, bundles],
            });
        const match = ({ params: rpcParams }: { params: unknown }) => {
          const [call] = rpcParams as readonly { to?: Address; data?: Hex }[];
          if (flow === "redeem") {
            // Fault both deployless and direct fallback, not a recoverable single query failure.
            return (
              call?.to == null ||
              (isAddressEqual(call.to, midnight) &&
                call.data?.startsWith(
                  toFunctionSelector("position(bytes32,address)"),
                ) === true)
            );
          }
          return (
            call?.to != null &&
            isAddressEqual(
              call.to,
              authorizationRead ? midnight : allowanceToken,
            ) &&
            call.data === calldata
          );
        };

        await withMidnightFaultProxy(
          { client },
          async ({ client: healthy, proxy }) => {
            const action = await prepare(healthy.morpho.midnight(base.id));
            await action.getRequirements();
            const tx = action.buildTx();
            expect(tx.to).toBe(flow === "redeem" ? midnight : bundles);
            expect(tx.data).not.toBe("0x");
            expect(proxy.log.some(({ method }) => method === "eth_call")).toBe(
              true,
            );
          },
        );
        await withMidnightFaultProxy(
          {
            client,
            faults: [{ method: "eth_call", match, fault: injectedFault }],
          },
          async ({ client: faulted, proxy }) => {
            await expectMidnightFlowFailsClosed(
              () => prepare(faulted.morpho.midnight(base.id)),
              ContractFunctionExecutionError,
            );
            expect(
              proxy.log.filter(({ outcome }) => outcome === injectedFault.kind),
            ).not.toHaveLength(0);
            expect(
              proxy.log.some(({ method }) => method.startsWith("eth_send")),
            ).toBe(false);
          },
        );
      },
    );
  }
});
