import { getChainAddresses } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { vaultV2Abi } from "@morpho-org/morpho-sdk/abis";
import { type E2eScenario, getE2eRuns } from "@morpho-org/morpho-test";
import { erc4626Abi, isAddressEqual, parseUnits, zeroAddress } from "viem";
import { describe, expect } from "vitest";
import {
  ConsumerLimitViolationError,
  type SlippageQuote,
  simulate,
  toSimulationLimits,
} from "../../src/index.js";
import { simulationClientFor } from "../../src/test-helpers/index.js";
import { deployIdleVaultV2 } from "../setup.js";
import { getE2eAssets } from "./assets.js";
import { describeE2e, E2E_ACTORS, withE2eActor } from "./setup.js";
import { prepareE2eTransactions, sendE2eSimulated } from "./simulate.js";
import { createE2eVaultV1, createE2eVaultV2 } from "./vaults.js";

const expectInKindMinimumRejected = async (
  client: Parameters<typeof prepareE2eTransactions>[0],
  {
    output,
    quote,
  }: {
    readonly output: Parameters<typeof prepareE2eTransactions>[1]["output"];
    readonly quote: Required<Pick<SlippageQuote, "sharesBurned" | "positions">>;
  },
) => {
  const owner = client.account.address;
  const { tx, transactions } = await prepareE2eTransactions(client, {
    account: owner,
    output,
  });
  const report = await simulate(
    simulationClientFor(client.transport.url, client.chain),
    {
      blockNumber: await client.getBlockNumber({ cacheTime: 0 }),
      transactions,
      limits: toSimulationLimits(tx.action, {
        owner,
        slippageTolerance: 0n,
        expected: {
          ...quote,
          positions: quote.positions.map((position) => ({
            ...position,
            supplyShares: position.supplyShares + 1n,
          })),
        },
      }),
    },
    { timeoutMs: 30_000 },
  );
  expect(report).toMatchObject({
    ok: false,
    failures: quote.positions.map(() =>
      expect.any(ConsumerLimitViolationError),
    ),
  });
  expect(report).toMatchObject({
    failures: quote.positions.map(({ supplyShares }) => ({
      field: "positions",
      check: "slippageTolerance",
      expected: supplyShares + 1n,
      observed: supplyShares,
      tolerance: 0n,
    })),
  });
};

const v1Requires = [
  "blue",
  "adaptiveCurveIrm",
  "metaMorphoFactory",
  "bundles.vaultBundlesV1",
] as const;
const v2Requires = [
  "blue",
  "adaptiveCurveIrm",
  "vaultV2Factory",
  "morphoMarketV1AdapterV2Factory",
] as const;
const v1Scenarios = [
  {
    name: "simulationVaultV1",
    action: "depositWithdrawRedeem",
    requires: v1Requires,
  },
  {
    name: "simulationVaultV1InKind",
    action: "inKindRedeem",
    requires: [...v1Requires, "bundles.vaultExitBundlesV1"],
  },
  {
    name: "simulationVaultMigration",
    action: "migrateToV2",
    requires: [...v1Requires, "vaultV2Factory"],
  },
] as const satisfies readonly (E2eScenario & { readonly action: string })[];

for (const scenario of v1Scenarios) {
  if (getE2eRuns({ scenario, env: process.env }).length === 0) continue;
  describeE2e(scenario, (baseTest, { chainId }) => {
    for (const actor of E2E_ACTORS)
      describe(actor, () => {
        const test = withE2eActor(baseTest, actor);
        describe.each(getE2eAssets(chainId))("$symbol", (asset) => {
          test(scenario.action, {
            tags:
              asset.symbol === getE2eAssets(chainId)[0]!.symbol &&
              actor === "EOA"
                ? []
                : ["nightly"],
          }, async ({ client }) => {
            const owner = client.account.address;
            const { vault, entity, market, amount, tracked } =
              await createE2eVaultV1(client, {
                chainId,
                asset,
                seed: scenario.action !== "depositWithdrawRedeem",
              });
            const common = {
              chainId,
              account: owner,
              preview: true,
              ...tracked,
            } as const;
            if (scenario.action === "depositWithdrawRedeem") {
              const sharesMinted = await client.readContract({
                address: vault,
                abi: erc4626Abi,
                functionName: "previewDeposit",
                args: [amount],
              });
              const deposit = entity.deposit({
                userAddress: owner,
                amount,
                vaultData: await entity.getData(),
                slippageTolerance: 0n,
              });
              expect((await deposit.getRequirements()).length).toBeGreaterThan(
                0,
              );
              const { result: deposited } = await sendE2eSimulated(client, {
                ...common,
                output: deposit,
                limits: { slippageTolerance: 0n },
              });
              expect(deposited.verification.operations).toMatchObject([
                {
                  operation: "vaultV1Deposit",
                  vault,
                  checkedLimits: {
                    quote: { assetsPaid: amount, sharesMinted },
                    slippageTolerance: 0n,
                  },
                },
              ]);
              expect(await client.balanceOf({ erc20: vault })).toBe(
                sharesMinted,
              );

              const withdrawnAssets = amount / 4n;
              const sharesBurned = await client.readContract({
                address: vault,
                abi: erc4626Abi,
                functionName: "previewWithdraw",
                args: [withdrawnAssets],
              });
              const withdraw = entity.withdraw({
                userAddress: owner,
                amount: withdrawnAssets,
                vaultData: await entity.getData(),
                slippageTolerance: 0n,
              });
              const { result: withdrawn } = await sendE2eSimulated(client, {
                ...common,
                output: withdraw,
                limits: { slippageTolerance: 0n, expected: { sharesBurned } },
              });
              expect(withdrawn.verification.operations).toMatchObject([
                {
                  operation: "vaultV1Withdraw",
                  vault,
                  checkedLimits: {
                    quote: { assetsReceived: withdrawnAssets, sharesBurned },
                    slippageTolerance: 0n,
                  },
                },
              ]);
              expect(await client.balanceOf({ erc20: vault })).toBe(
                sharesMinted - sharesBurned,
              );

              const shares = await client.balanceOf({ erc20: vault });
              const assetsReceived = await client.readContract({
                address: vault,
                abi: erc4626Abi,
                functionName: "previewRedeem",
                args: [shares],
              });
              const { result: redeemed } = await sendE2eSimulated(client, {
                ...common,
                output: entity.redeem({ userAddress: owner, shares }),
                limits: { slippageTolerance: 0n, expected: { assetsReceived } },
              });
              expect(redeemed.verification.operations).toMatchObject([
                {
                  operation: "vaultV1Redeem",
                  vault,
                  checkedLimits: {
                    quote: { assetsReceived, sharesBurned: shares },
                    slippageTolerance: 0n,
                  },
                },
              ]);
              expect(await client.balanceOf({ erc20: vault })).toBe(0n);
              return;
            }

            if (scenario.action === "inKindRedeem") {
              const exitAssets = amount / 2n;
              const sharesBurned = await client.readContract({
                address: vault,
                abi: erc4626Abi,
                functionName: "previewWithdraw",
                args: [exitAssets],
              });
              const blue = client
                .extend(morphoViemExtension())
                .morpho.blue(market, chainId);
              const before = await blue.getPositionData(owner);
              const positions = [
                {
                  marketId: market.id,
                  supplyShares: before.market.toSupplyShares(
                    exitAssets,
                    "Down",
                  ),
                },
              ];
              const output = entity.inKindRedeem({
                userAddress: owner,
                amount: exitAssets,
                marketParamsList: [market],
                vaultData: await entity.getData(),
              });
              await expectInKindMinimumRejected(client, {
                output,
                quote: { sharesBurned, positions },
              });
              const { result } = await sendE2eSimulated(client, {
                ...common,
                output,
                limits: {
                  slippageTolerance: 0n,
                  expected: { sharesBurned, positions },
                },
              });
              expect(result.verification.operations).toMatchObject([
                {
                  operation: "vaultV1InKindRedeem",
                  vault,
                  checkedLimits: {
                    quote: { sharesBurned, positions },
                    slippageTolerance: 0n,
                  },
                },
              ]);
              expect(
                (await blue.getPositionData(owner)).supplyShares -
                  before.supplyShares,
              ).toBe(positions[0]!.supplyShares);
              return;
            }

            const targetVault = await deployIdleVaultV2(client, asset.address);
            const target = client
              .extend(morphoViemExtension())
              .morpho.vaultV2(targetVault, chainId);
            const shares = await client.balanceOf({ erc20: vault });
            const assets = await client.readContract({
              address: vault,
              abi: erc4626Abi,
              functionName: "previewRedeem",
              args: [shares],
            });
            const sharesMinted = await client.readContract({
              address: targetVault,
              abi: erc4626Abi,
              functionName: "previewDeposit",
              args: [assets],
            });
            const output = entity.migrateToV2({
              userAddress: owner,
              sourceVault: await entity.getData(),
              targetVault: await target.getData(),
              shares,
              slippageTolerance: 0n,
            });
            const { result } = await sendE2eSimulated(client, {
              ...common,
              wallets: [...tracked.wallets, targetVault],
              tokens: [...tracked.tokens, targetVault],
              output,
              limits: { slippageTolerance: 0n, expected: { sharesMinted } },
            });
            expect(result.verification.operations).toMatchObject([
              {
                operation: "vaultV1MigrateToV2",
                sourceVault: vault,
                targetVault,
                checkedLimits: {
                  quote: { sharesBurned: shares, sharesMinted },
                  slippageTolerance: 0n,
                },
              },
            ]);
            expect(await client.balanceOf({ erc20: vault })).toBe(0n);
            expect(await client.balanceOf({ erc20: targetVault })).toBe(
              sharesMinted,
            );
          });
        });
      });
  });
}

const feeRedeemScenario: E2eScenario = {
  name: "simulationVaultV2FeeRedeem",
  requires: [...v2Requires, "bundles.vaultBundlesV1"],
};
describeE2e(feeRedeemScenario, (baseTest, { chainId }) => {
  for (const actor of E2E_ACTORS)
    describe(actor, () => {
      const test = withE2eActor(baseTest, actor);
      describe.each(getE2eAssets(chainId))("$symbol", (asset) => {
        test("vaultV2 full redeem: fee-recipient typed inputs preserve the exact gross burn", {
          tags: ["nightly"],
        }, async ({ client }) => {
          const owner = client.account.address;
          const { vault, entity, tracked } = await createE2eVaultV2(client, {
            chainId,
            asset,
            fees: true,
            liquidity: true,
          });
          const shares = await client.balanceOf({ erc20: vault });
          const [, pendingFeeShares] = await client.readContract({
            address: vault,
            abi: vaultV2Abi,
            functionName: "accrueInterestView",
          });
          expect(shares).toBeGreaterThan(0n);
          expect(pendingFeeShares).toBeGreaterThan(0n);
          const now = (await client.getBlock()).timestamp;
          const { result } = await sendE2eSimulated(client, {
            chainId,
            account: owner,
            ...tracked,
            preview: true,
            output: entity.redeem({
              userAddress: owner,
              shares,
              now,
              deadline: now + 600n,
            }),
            limits: {
              operations: [
                { type: "vaultV2Redeem", vault, inputs: { shares } },
              ],
            },
          });
          expect(result.verification.operations).toMatchObject([
            {
              operation: "vaultV2Redeem",
              vault,
              checkedLimits: {
                fieldChecks: { sharesBurned: "exact" },
                quote: { sharesBurned: shares },
              },
            },
          ]);
          const minted = result.transfers
            .filter(
              (transfer) =>
                isAddressEqual(transfer.token, vault) &&
                isAddressEqual(transfer.from, zeroAddress) &&
                isAddressEqual(transfer.to, owner),
            )
            .reduce((sum, transfer) => sum + transfer.amount, 0n);
          const burned = result.transfers
            .filter(
              (transfer) =>
                isAddressEqual(transfer.token, vault) &&
                isAddressEqual(transfer.from, owner) &&
                isAddressEqual(transfer.to, zeroAddress),
            )
            .reduce((sum, transfer) => sum + transfer.amount, 0n);
          expect(minted).toBeGreaterThan(0n);
          expect(burned).toBe(shares);
          expect(await client.balanceOf({ erc20: vault })).toBe(minted);
        });
      });
    });
});

for (const action of [
  "withdraw",
  "inKindRedeem",
  "forceWithdraw",
  "forceRedeem",
] as const) {
  const scenario: E2eScenario = {
    name: `simulationVaultV2${action}`,
    requires: [
      ...v2Requires,
      ...(action === "withdraw"
        ? ["bundles.vaultBundlesV1" as const]
        : action === "forceRedeem"
          ? []
          : ["bundles.vaultExitBundlesV1" as const]),
    ],
  };
  if (getE2eRuns({ scenario, env: process.env }).length === 0) continue;
  describeE2e(scenario, (baseTest, { chainId }) => {
    for (const actor of E2E_ACTORS)
      describe(actor, () => {
        const test = withE2eActor(baseTest, actor);
        describe.each(getE2eAssets(chainId))("$symbol", (asset) => {
          test(`vaultV2 ${action}: preview and final match execution`, {
            tags:
              asset.symbol === getE2eAssets(chainId)[0]!.symbol &&
              actor === "EOA"
                ? []
                : ["nightly"],
          }, async ({ client }) => {
            const owner = client.account.address;
            const fees = action === "withdraw" || action === "forceRedeem";
            const {
              vault,
              entity,
              market,
              adapter,
              allocation,
              decimals,
              tracked,
            } = await createE2eVaultV2(client, {
              chainId,
              asset,
              fees,
              liquidity: action === "withdraw",
            });
            const amount = parseUnits("4", decimals);
            const sharesBurned = await client.readContract({
              address: vault,
              abi: erc4626Abi,
              functionName: "previewWithdraw",
              args: [amount],
            });
            const assetsReceived =
              action === "forceRedeem"
                ? await client.readContract({
                    address: vault,
                    abi: erc4626Abi,
                    functionName: "previewRedeem",
                    args: [sharesBurned],
                  })
                : amount;
            const blue = client
              .extend(morphoViemExtension())
              .morpho.blue(market, chainId);
            const beforePosition = await blue.getPositionData(owner);
            const positions = [
              {
                marketId: market.id,
                supplyShares: beforePosition.market.toSupplyShares(
                  amount,
                  "Down",
                ),
              },
            ];
            const sharesBefore = await client.balanceOf({ erc20: vault });
            if (fees) {
              const [, feeShares] = await client.readContract({
                address: vault,
                abi: vaultV2Abi,
                functionName: "accrueInterestView",
              });
              expect(feeShares).toBeGreaterThan(0n);
              expect(
                isAddressEqual(
                  await client.readContract({
                    address: vault,
                    abi: vaultV2Abi,
                    functionName: "performanceFeeRecipient",
                  }),
                  owner,
                ),
              ).toBe(true);
            }
            const vaultData = await entity.getData();
            const now = (await client.getBlock()).timestamp;
            const output = (() => {
              switch (action) {
                case "withdraw":
                  return entity.withdraw({
                    now,
                    userAddress: owner,
                    amount,
                    vaultData,
                    slippageTolerance: 0n,
                  });
                case "inKindRedeem":
                  return entity.inKindRedeem({
                    now,
                    userAddress: owner,
                    amount,
                    vaultData,
                    marketParamsList: [market],
                  });
                case "forceWithdraw":
                  return entity.forceWithdraw({
                    now,
                    userAddress: owner,
                    exitAssets: amount,
                    vaultData,
                    slippageTolerance: 0n,
                  });
                case "forceRedeem": {
                  const forcedRedeem = entity.forceRedeem({
                    now,
                    userAddress: owner,
                    deallocations: [
                      {
                        adapter,
                        marketParams: market,
                        amount: allocation / 2n,
                      },
                    ],
                    redeem: { shares: sharesBurned },
                  });
                  return { ...forcedRedeem, getRequirements: async () => [] };
                }
              }
            })();
            const quote =
              action === "inKindRedeem"
                ? { sharesBurned, positions }
                : { sharesBurned, assetsReceived };
            if (action === "inKindRedeem")
              await expectInKindMinimumRejected(client, {
                output,
                quote: { sharesBurned, positions },
              });
            const addresses = getChainAddresses(chainId);
            const hasRestrictedIntermediary =
              Object.values(addresses.bundles ?? {}).some(
                (address) => address != null,
              ) || addresses.midnightBundlesV2 != null;
            const { result } = await sendE2eSimulated(client, {
              chainId,
              account: owner,
              preview: true,
              allowedWarningCodes:
                (action === "forceWithdraw" || action === "forceRedeem") &&
                !hasRestrictedIntermediary
                  ? ["RETENTION_CHECK_SKIPPED"]
                  : [],
              ...tracked,
              output,
              limits: {
                slippageTolerance: 0n,
                expected:
                  action === "withdraw"
                    ? { sharesBurned }
                    : action === "forceWithdraw"
                      ? { assetsReceived }
                      : quote,
              },
            });
            const operation = `vaultV2${action[0]!.toUpperCase()}${action.slice(1)}`;
            expect(result.verification.operations).toMatchObject([
              {
                operation,
                vault,
                checkedLimits: { quote, slippageTolerance: 0n },
              },
            ]);
            if (action === "inKindRedeem")
              expect(
                (await blue.getPositionData(owner)).supplyShares -
                  beforePosition.supplyShares,
              ).toBe(positions[0]!.supplyShares);
            if (fees) {
              const minted = result.transfers
                .filter(
                  (transfer) =>
                    isAddressEqual(transfer.token, vault) &&
                    isAddressEqual(transfer.from, zeroAddress) &&
                    isAddressEqual(transfer.to, owner),
                )
                .reduce((sum, transfer) => sum + transfer.amount, 0n);
              const burned = result.transfers
                .filter(
                  (transfer) =>
                    isAddressEqual(transfer.token, vault) &&
                    isAddressEqual(transfer.from, owner) &&
                    isAddressEqual(transfer.to, zeroAddress),
                )
                .reduce((sum, transfer) => sum + transfer.amount, 0n);
              expect(minted).toBeGreaterThan(0n);
              expect(burned).toBe(sharesBurned);
              expect(await client.balanceOf({ erc20: vault })).toBe(
                sharesBefore + minted - burned,
              );
              expect(
                sharesBefore - (await client.balanceOf({ erc20: vault })),
              ).toBeLessThan(burned);
            }
          });
        });
      });
  });
}
