import { ChainId, getChainAddresses } from "@morpho-org/blue-sdk";
import {
  isRequirementSignature,
  morphoViemExtension,
} from "@morpho-org/morpho-sdk";
import {
  blueAbi,
  midnightBlueBuyCallbackFactoryAbi,
} from "@morpho-org/morpho-sdk/abis";
import { type E2eScenario, getE2eAsset } from "@morpho-org/morpho-test";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  type Chain,
  decodeEventLog,
  erc20Abi,
  isAddressEqual,
  maxUint256,
  parseUnits,
  toEventSelector,
  zeroHash,
} from "viem";
import { describe, expect } from "vitest";
import { seededMarketData } from "../setup.js";
import { type E2eAsset, fundE2eAsset, getE2eAssets } from "./assets.js";
import {
  createE2eMarket,
  describeE2e,
  E2E_ACTORS,
  installE2eAssetAt,
  withE2eActor,
} from "./setup.js";
import { sendE2eSimulated } from "./simulate.js";

const scenario: E2eScenario = {
  name: "simulationBlueActions",
  requires: ["blue", "adaptiveCurveIrm", "bundles.blueBundlesV1"],
};
const callbackScenario: E2eScenario = {
  name: "simulationBlueBuyCallback",
  requires: [...scenario.requires, "midnightBlueBuyCallbackFactory"],
};
const collateralFallback: Address =
  "0xE2e0000000000000000000000000000000000004";
const destinationOracle: Address = "0xe2e0000000000000000000000000000000000005";

const expectRestatedApproval = (
  sent: Awaited<ReturnType<typeof sendE2eSimulated>>,
  {
    token,
    owner,
    spender,
  }: {
    readonly token: Address;
    readonly owner: Address;
    readonly spender: Address;
  },
) => {
  const evidence = [
    sent.result.calls.at(-1)!.logs,
    sent.receipts.at(-1)!.logs,
  ].map((logs) =>
    logs
      .filter(
        (log) =>
          isAddressEqual(log.address, token) &&
          log.topics[0] ===
            toEventSelector("Approval(address,address,uint256)"),
      )
      .map(
        (log) =>
          decodeEventLog({
            abi: erc20Abi,
            eventName: "Approval",
            data: log.data,
            topics: [log.topics[0]!, ...log.topics.slice(1)],
          }).args,
      ),
  );
  expect(evidence[0]).toEqual([{ owner, spender, value: maxUint256 }]);
  expect(evidence[1]).toEqual(evidence[0]);
};

const setupMarket = async (
  client: AnvilTestClient<Chain>,
  {
    chainId,
    asset,
  }: {
    readonly chainId: number;
    readonly asset: E2eAsset & { readonly collateralToken?: Address };
  },
) => {
  const user = client.account.address;
  const { blue: morpho } = getChainAddresses(chainId);
  const native = getE2eAsset(chainId);
  const collateralToken =
    asset.collateralToken ??
    (isAddressEqual(asset.address, native.address)
      ? collateralFallback
      : native.address);
  if (collateralToken === collateralFallback)
    await installE2eAssetAt(client, collateralFallback);
  const market = await createE2eMarket(client, {
    chainId,
    loanToken: asset.address,
    collateralToken,
  });
  const { decimals } = await fundE2eAsset(client, {
    token: asset.address,
    amount: "40",
  });
  const { amount: collateralAssets } = await fundE2eAsset(client, {
    token: collateralToken,
    amount: "5",
  });
  // Seed the dead shares before supplying liquidity.
  await seededMarketData(client, market);
  const liquidity = parseUnits("10", decimals);
  await client.writeContract({
    address: morpho,
    abi: blueAbi,
    functionName: "supply",
    args: [market, liquidity, 0n, user, "0x"],
  });
  const blue = client
    .extend(morphoViemExtension({ supportSignature: true }))
    .morpho.blue(market, chainId);
  return {
    user,
    morpho,
    market,
    blue,
    decimals,
    liquidity,
    collateralAssets,
    tracked: {
      wallets: [user, morpho],
      tokens: [asset.address, collateralToken],
    },
  };
};

describeE2e(scenario, (baseTest, { chainId }) => {
  const matrixAssets = getE2eAssets(chainId);
  const incidentCollateral = matrixAssets.find(
    ({ symbol }) =>
      symbol === (chainId === ChainId.EthMainnet ? "wstETH" : "XAUt0"),
  );
  const incidentLoan = matrixAssets.find(
    ({ symbol }) =>
      symbol === (chainId === ChainId.EthMainnet ? "USDT" : "USDC"),
  );
  const collateralVariants =
    incidentCollateral && incidentLoan
      ? [
          {
            ...incidentLoan,
            symbol: `${incidentLoan.symbol} loan / ${incidentCollateral.symbol} collateral`,
            collateralToken: incidentCollateral.address,
          },
        ]
      : [];
  const blueAssets = [...matrixAssets, ...collateralVariants];
  for (const actor of E2E_ACTORS)
    describe(actor, () => {
      const test = withE2eActor(baseTest, actor);
      describe.each(blueAssets)("$symbol loan", (asset) => {
        const tags =
          asset.symbol === getE2eAssets(chainId)[0]!.symbol && actor === "EOA"
            ? []
            : ["nightly"];
        describe.each(["assets", "shares"] as const)(
          "blueWithdraw by %s",
          (mode) => {
            test("preview and final match execution", {
              tags: mode === "assets" ? tags : ["nightly"],
            }, async ({ client }) => {
              const { user, market, blue, decimals, tracked } =
                await setupMarket(client, { chainId, asset });
              const positionData = await blue.getPositionData(user);
              const assets = parseUnits("1", decimals);
              const shares =
                mode === "shares"
                  ? positionData.supplyShares
                  : positionData.market.toSupplyShares(assets, "Up");
              const assetsReceived =
                mode === "shares"
                  ? positionData.market.toSupplyAssets(shares, "Down")
                  : assets;
              const output = blue.withdraw({
                userAddress: user,
                positionData,
                ...(mode === "shares" ? { shares } : { assets }),
                deadline: maxUint256,
              });
              expect((await output.getRequirements()).length).toBeGreaterThan(
                0,
              );
              const balance = await client.balanceOf({ erc20: asset.address });
              const { result } = await sendE2eSimulated(client, {
                chainId,
                account: user,
                output,
                preview: true,
                ...tracked,
                limits: {
                  slippageTolerance: 0n,
                  expected:
                    mode === "assets"
                      ? { sharesBurned: shares }
                      : { assetsReceived },
                },
              });
              expect(result.verification.operations[0]?.operation).toBe(
                "blueWithdraw",
              );
              expect(result.verification.operations[0]).toMatchObject({
                marketId: market.id,
                checkedLimits: {
                  quote: { sharesBurned: shares, assetsReceived },
                  slippageTolerance: 0n,
                },
              });
              expect((await blue.getPositionData(user)).supplyShares).toBe(
                positionData.supplyShares - shares,
              );
              expect(await client.balanceOf({ erc20: asset.address })).toBe(
                balance + assetsReceived,
              );
            });
          },
        );

        test("blueSupplyCollateral, blueBorrow, partial/full blueRepay, blueWithdrawCollateral: preview and final match execution", {
          tags,
        }, async ({ client }) => {
          const {
            user,
            morpho,
            market,
            blue,
            decimals,
            collateralAssets,
            tracked,
          } = await setupMarket(client, { chainId, asset });
          const common = {
            chainId,
            account: user,
            preview: true,
            ...tracked,
          } as const;
          const collateral = blue.supplyCollateral({
            userAddress: user,
            collateralAssets,
            deadline: maxUint256,
          });
          expect((await collateral.getRequirements()).length).toBeGreaterThan(
            0,
          );
          const { result: supplied } = await sendE2eSimulated(client, {
            ...common,
            output: collateral,
            limits: { slippageTolerance: 0n },
          });
          expect(supplied.verification.operations[0]?.operation).toBe(
            "blueSupplyCollateral",
          );
          expect(supplied.verification.operations[0]).toMatchObject({
            marketId: market.id,
            checkedLimits: {
              quote: {
                assetsPaid: collateralAssets,
                collateralSupplied: collateralAssets,
              },
              slippageTolerance: 0n,
            },
          });
          const suppliedPosition = await blue.getPositionData(user);
          expect(suppliedPosition.collateral).toBe(collateralAssets);
          expect(suppliedPosition.borrowShares).toBe(0n);

          const spender = getChainAddresses(chainId).bundles!.blueBundlesV1!;
          const checkCollateralApproval =
            "collateralToken" in asset ||
            (chainId === ChainId.ArbitrumMainnet &&
              isAddressEqual(
                market.collateralToken,
                getChainAddresses(chainId).wNative!,
              ));
          if (checkCollateralApproval)
            await client.approve({
              address: market.collateralToken,
              args: [spender, maxUint256],
            });

          const borrowAssets = parseUnits("2", decimals);
          const borrow = blue.borrow({
            userAddress: user,
            positionData: suppliedPosition,
            borrowAssets,
            deadline: maxUint256,
          });
          expect(
            (await borrow.getRequirements()).some(isRequirementSignature),
          ).toBe(true);
          const borrowShares = suppliedPosition.market.toBorrowShares(
            borrowAssets,
            "Up",
          );
          const borrowSent = await sendE2eSimulated(client, {
            ...common,
            output: borrow,
            limits: {
              slippageTolerance: 0n,
              expected: { sharesMinted: borrowShares },
            },
          });
          const { result: borrowed } = borrowSent;
          if (checkCollateralApproval)
            expectRestatedApproval(borrowSent, {
              token: market.collateralToken,
              owner: user,
              spender,
            });
          expect(borrowed.verification.operations[0]?.operation).toBe(
            "blueBorrow",
          );
          expect(borrowed.verification.operations[0]).toMatchObject({
            marketId: market.id,
            checkedLimits: {
              quote: {
                assetsReceived: borrowAssets,
                sharesMinted: borrowShares,
              },
              slippageTolerance: 0n,
            },
          });
          const borrowedPosition = await blue.getPositionData(user);
          expect(borrowedPosition.borrowShares).toBe(borrowShares);

          const now = (await client.getBlock()).timestamp;
          const deadline = now + 3_600n;
          const repayAssets = parseUnits("1", decimals);
          const repayMarket = borrowedPosition.market.accrueInterest(
            (await client.getBlock()).timestamp + 1n,
          );
          const sharesBurned = repayMarket.toBorrowShares(repayAssets, "Down");
          const partial = blue.repay({
            now,
            userAddress: user,
            positionData: borrowedPosition,
            repayAssets,
            deadline,
          });
          const { result: partiallyRepaid } = await sendE2eSimulated(client, {
            ...common,
            output: partial,
            limits: { slippageTolerance: 0n, expected: { sharesBurned } },
          });
          expect(partiallyRepaid.verification.operations[0]?.operation).toBe(
            "blueRepay",
          );
          expect(partiallyRepaid.verification.operations[0]).toMatchObject({
            marketId: market.id,
            checkedLimits: {
              quote: { assetsPaid: repayAssets, sharesBurned },
              slippageTolerance: 0n,
            },
          });
          const remaining = await blue.getPositionData(user);
          expect(remaining.borrowShares).toBe(borrowShares - sharesBurned);
          expect(remaining.borrowShares).toBeGreaterThan(0n);

          const fullNow = (await client.getBlock()).timestamp;
          const fullDeadline = fullNow + 3_600n;
          const full = blue.repay({
            now: fullNow,
            userAddress: user,
            positionData: remaining,
            repayShares: maxUint256,
            deadline: fullDeadline,
          });
          const { result: fullyRepaid } = await sendE2eSimulated(client, {
            ...common,
            output: full,
            limits: {
              slippageTolerance: 0n,
              expected: { sharesBurned: remaining.borrowShares },
            },
          });
          expect(fullyRepaid.verification.operations[0]?.operation).toBe(
            "blueRepay",
          );
          expect(fullyRepaid.verification.operations[0]).toMatchObject({
            marketId: market.id,
            checkedLimits: {
              quote: {
                assetsPaid: remaining.market
                  .accrueInterest(fullDeadline)
                  .toBorrowAssets(remaining.borrowShares, "Up"),
                sharesBurned: remaining.borrowShares,
              },
              slippageTolerance: 0n,
            },
          });
          const repaid = await blue.getPositionData(user);
          expect(repaid.borrowShares).toBe(0n);
          expect(repaid.collateral).toBe(collateralAssets);

          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [getChainAddresses(chainId).bundles!.blueBundlesV1!, false],
          });
          const withdraw = blue.withdrawCollateral({
            userAddress: user,
            positionData: repaid,
            collateralAssets,
            deadline: maxUint256,
          });
          const checkLoanApproval =
            asset.symbol === "USDT0" ||
            asset.symbol === "XAUt0" ||
            (chainId === ChainId.ArbitrumMainnet && asset.symbol === "wNative");
          if (checkLoanApproval)
            await client.approve({
              address: asset.address,
              args: [spender, maxUint256],
            });
          expect((await withdraw.getRequirements()).length).toBeGreaterThan(0);
          const withdrawSent = await sendE2eSimulated(client, {
            ...common,
            output: withdraw,
            limits: { slippageTolerance: 0n },
          });
          const { result: withdrawn } = withdrawSent;
          if (checkLoanApproval)
            expectRestatedApproval(withdrawSent, {
              token: asset.address,
              owner: user,
              spender,
            });
          expect(withdrawn.verification.operations[0]?.operation).toBe(
            "blueWithdrawCollateral",
          );
          expect(withdrawn.verification.operations[0]).toMatchObject({
            marketId: market.id,
            checkedLimits: {
              quote: {
                collateralWithdrawn: collateralAssets,
                assetsReceived: collateralAssets,
              },
              slippageTolerance: 0n,
            },
          });
          expect((await blue.getPositionData(user)).collateral).toBe(0n);
          expect(
            await client.balanceOf({ erc20: market.collateralToken }),
          ).toBe(collateralAssets);
        });

        test("blueRefinance: full debt and collateral migrate with caller-supplied quotes", {
          tags,
        }, async ({ client }) => {
          const {
            user,
            morpho,
            market,
            blue,
            decimals,
            liquidity,
            collateralAssets,
            tracked,
          } = await setupMarket(client, { chainId, asset });
          const destinationMarket = await createE2eMarket(client, {
            chainId,
            loanToken: market.loanToken,
            collateralToken: market.collateralToken,
            oracle: destinationOracle,
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supply",
            args: [destinationMarket, liquidity, 0n, user, "0x"],
          });
          await client.approve({
            address: market.collateralToken,
            args: [morpho, collateralAssets],
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [market, collateralAssets, user, "0x"],
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "borrow",
            args: [market, parseUnits("2", decimals), 0n, user, user],
          });
          const destination = client
            .extend(morphoViemExtension({ supportSignature: true }))
            .morpho.blue(destinationMarket, chainId);
          const positionData = await blue.getPositionData(user);
          const destinationPosition = await destination.getPositionData(user);
          const output = blue.refinance({
            userAddress: user,
            positionData,
            destination: {
              marketParams: destinationMarket,
              positionData: destinationPosition,
            },
            deadline: maxUint256,
          });
          expect(
            (await output.getRequirements()).some(isRequirementSignature),
          ).toBe(true);
          const executionTimestamp = (await client.getBlock()).timestamp + 1n;
          const sharesMinted = destinationPosition.market
            .accrueInterest(executionTimestamp)
            .toBorrowShares(
              positionData.accrueInterest(executionTimestamp).borrowAssets,
              "Up",
            );
          const { result } = await sendE2eSimulated(client, {
            chainId,
            account: user,
            output,
            preview: true,
            ...tracked,
            limits: {
              slippageTolerance: 0n,
              expected: {
                sharesBurned: positionData.borrowShares,
                sharesMinted,
              },
            },
          });
          expect(result.verification.operations[0]?.operation).toBe(
            "blueRefinance",
          );
          expect(result.verification.operations[0]).toMatchObject({
            sourceMarketId: market.id,
            targetMarketId: destinationMarket.id,
            checkedLimits: {
              quote: { sharesBurned: positionData.borrowShares, sharesMinted },
              slippageTolerance: 0n,
            },
          });
          const sourceAfter = await blue.getPositionData(user);
          const destinationAfter = await destination.getPositionData(user);
          expect([sourceAfter.borrowShares, sourceAfter.collateral]).toEqual([
            0n,
            0n,
          ]);
          expect(destinationAfter.borrowShares).toBe(sharesMinted);
          expect(destinationAfter.collateral).toBe(collateralAssets);
        });

        test("erc20Approval and blueAuthorization: derived effects match execution", {
          tags,
        }, async ({ client }) => {
          const { user, morpho, market, blue, tracked } = await setupMarket(
            client,
            { chainId, asset },
          );
          const { blueBundlesV1 } = getChainAddresses(chainId).bundles!;
          const supply = client
            .extend(morphoViemExtension({ supportSignature: false }))
            .morpho.blue(market, chainId)
            .supplyCollateral({
              userAddress: user,
              collateralAssets: 1n,
              deadline: maxUint256,
            });
          const withdraw = client
            .extend(morphoViemExtension({ supportSignature: false }))
            .morpho.blue(market, chainId)
            .withdraw({
              userAddress: user,
              positionData: await blue.getPositionData(user),
              assets: 1n,
              deadline: maxUint256,
            });
          const requirements = [
            ...(await supply.getRequirements()),
            ...(await withdraw.getRequirements()),
          ];
          expect(requirements).toHaveLength(2);
          expect(
            requirements.map((requirement) =>
              isRequirementSignature(requirement)
                ? "signature"
                : requirement.action.type,
            ),
          ).toEqual(["erc20Approval", "blueAuthorization"]);
          for (const requirement of requirements) {
            expect(isRequirementSignature(requirement)).toBe(false);
            if (isRequirementSignature(requirement))
              throw new Error("Expected a standalone call requirement");
            const { result, receipts } = await sendE2eSimulated(client, {
              chainId,
              account: user,
              ...tracked,
              limits: {},
              preview: true,
              output: {
                getRequirements: async () => [],
                buildTx: () => requirement,
              },
            });
            expect(result.verification.operations).toEqual([]);
            expect(result.verification.limits).not.toBe("none");
            expect(result.calls).toHaveLength(1);
            expect(receipts).toHaveLength(1);
            const logsBySource = [result.calls[0]!.logs, receipts[0]!.logs];
            if (requirement.action.type === "erc20Approval") {
              const approvals = logsBySource.map((logs) => {
                const events = logs
                  .filter(
                    (log) =>
                      isAddressEqual(log.address, market.collateralToken) &&
                      log.topics[0] ===
                        toEventSelector("Approval(address,address,uint256)"),
                  )
                  .map((log) =>
                    decodeEventLog({
                      abi: erc20Abi,
                      eventName: "Approval",
                      data: log.data,
                      topics: [log.topics[0]!, ...log.topics.slice(1)],
                    }),
                  );
                expect(events).toHaveLength(1);
                return events[0]!.args;
              });
              expect(approvals[0]).toEqual(approvals[1]);
              expect(isAddressEqual(approvals[0]!.owner, user)).toBe(true);
              expect(
                isAddressEqual(approvals[0]!.spender, blueBundlesV1!),
              ).toBe(true);
              expect(approvals[0]!.value).toBe(requirement.action.args.amount);
            } else {
              expect(requirement.action.type).toBe("blueAuthorization");
              const authorizations = logsBySource.map((logs) => {
                const events = logs
                  .filter(
                    (log) =>
                      isAddressEqual(log.address, morpho) &&
                      log.topics[0] ===
                        toEventSelector(
                          "SetAuthorization(address,address,address,bool)",
                        ),
                  )
                  .map((log) =>
                    decodeEventLog({
                      abi: blueAbi,
                      eventName: "SetAuthorization",
                      data: log.data,
                      topics: [log.topics[0]!, ...log.topics.slice(1)],
                    }),
                  );
                expect(events).toHaveLength(1);
                return events[0]!.args;
              });
              expect(authorizations[0]).toEqual(authorizations[1]);
              expect(isAddressEqual(authorizations[0]!.caller, user)).toBe(
                true,
              );
              expect(isAddressEqual(authorizations[0]!.authorizer, user)).toBe(
                true,
              );
              expect(
                isAddressEqual(authorizations[0]!.authorized, blueBundlesV1!),
              ).toBe(true);
              expect(authorizations[0]!.newIsAuthorized).toBe(true);
            }
          }
          expect(
            await client.readContract({
              address: market.collateralToken,
              abi: erc20Abi,
              functionName: "allowance",
              args: [user, blueBundlesV1!],
            }),
          ).toBeGreaterThanOrEqual(1n);
          expect(
            await client.readContract({
              address: morpho,
              abi: blueAbi,
              functionName: "isAuthorized",
              args: [user, blueBundlesV1!],
            }),
          ).toBe(true);
        });
      });
    });
});

describeE2e(callbackScenario, (baseTest, { chainId }) => {
  for (const actor of E2E_ACTORS)
    describe(actor, () => {
      const test = withE2eActor(baseTest, actor);
      describe.each(getE2eAssets(chainId))("$symbol loan", (asset) => {
        test("blueWithdrawBuyCallback: owner receives the entire callback supply", {
          tags:
            asset.symbol === getE2eAssets(chainId)[0]!.symbol && actor === "EOA"
              ? []
              : ["nightly"],
        }, async ({ client }) => {
          const { user, morpho, market, blue, tracked, liquidity } =
            await setupMarket(client, { chainId, asset });
          const factory =
            getChainAddresses(chainId).midnightBlueBuyCallbackFactory!;
          const { result: callback, request } = await client.simulateContract({
            address: factory,
            abi: midnightBlueBuyCallbackFactoryAbi,
            functionName: "createBlueBuyCallback",
            args: [user, zeroHash],
          });
          await client.writeContract(request);
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supply",
            args: [market, liquidity, 0n, callback, "0x"],
          });
          const positionData = await blue.getPositionData(callback);
          const output = blue.withdrawBuyCallback({
            userAddress: user,
            callbackAddress: callback,
            positionData,
          });
          expect(await output.getRequirements()).toEqual([]);
          const assetsReceived = positionData.market.toSupplyAssets(
            positionData.supplyShares,
            "Down",
          );
          const before = await client.balanceOf({ erc20: asset.address });
          const { result } = await sendE2eSimulated(client, {
            chainId,
            account: user,
            output: { ...output, buildTx: () => output.buildTx() },
            preview: true,
            wallets: [...tracked.wallets, callback],
            tokens: tracked.tokens,
            limits: {
              onBehalf: callback,
              slippageTolerance: 0n,
              expected: { assetsReceived },
            },
          });
          expect(result.verification.operations[0]?.operation).toBe(
            "blueWithdraw",
          );
          expect(result.verification.operations[0]).toMatchObject({
            marketId: market.id,
            account: callback,
            receiver: user,
            checkedLimits: {
              quote: {
                sharesBurned: positionData.supplyShares,
                assetsReceived,
              },
              slippageTolerance: 0n,
            },
          });
          expect((await blue.getPositionData(callback)).supplyShares).toBe(0n);
          expect(await client.balanceOf({ erc20: asset.address })).toBe(
            before + assetsReceived,
          );
        });
      });
    });
});
