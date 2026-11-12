import {
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  rateRatifierV1Abi,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  type E2eScenario,
  getE2eAsset,
  installE2eAsset,
  installE2eOracle,
  wrapE2eNative,
} from "@morpho-org/morpho-test";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  type Chain,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  isAddressEqual,
  maxUint256,
  parseAbi,
  parseEther,
  parseEventLogs,
  zeroAddress,
} from "viem";
import { expect } from "vitest";
import type { MidnightActionOutput } from "../../src/entities/midnight/types.js";
import {
  type ActionRequirement,
  type BaseAction,
  getMidnightApprovalRequirements,
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
  isRequirementApproval,
  isRequirementSignature,
  midnightCancelAndMake,
  morphoViemExtension,
} from "../../src/index.js";
import { createE2eMarket, describeE2e } from "./setup.js";

const scenario: E2eScenario = {
  name: "midnight-native",
  requires: [
    "midnight",
    "midnightBundlesV2",
    "setterRatifier",
    "rateRatifierV1",
  ],
};
const blueScenario: E2eScenario = {
  name: "midnight-native-blue",
  requires: [
    "midnight",
    "midnightBundlesV2",
    "blue",
    "adaptiveCurveIrm",
    "midnightBlueBuyCallbackFactory",
    "rateRatifierV1",
  ],
};

type Client = AnvilTestClient<Chain>;
type Output = MidnightActionOutput<BaseAction>;

const { A, B, C, D } = E2E_MIDNIGHT_WALLETS;
const units = parseEther("1");
const collateralAssets = 4n * units;
const oraclePrice = 10n ** 36n;
const takeGas = 8_000_000n;
const deadline = () => Time.timestamp() + 600n;
const wethCollateralLoanToken =
  "0xE2e0000000000000000000000000000000000004" as Address;

const setUp = async (params: {
  readonly client: Client;
  readonly chainId: number;
  readonly wallets: Parameters<typeof fundE2eMidnightWallets>[1]["wallets"];
  readonly maturity?: bigint;
  readonly nativeCollateral?: boolean;
}) => {
  const { client, chainId, wallets, maturity } = params;
  const initial = await createE2eMidnightMarket(
    client,
    chainId,
    maturity === undefined ? {} : { maturity },
  );
  const market = params.nativeCollateral
    ? new MarketParams({
        ...initial.params,
        collateralParams: initial.params.collateralParams.map((collateral) => ({
          ...collateral,
          token: getChainAddress(chainId, "wNative"),
        })),
      })
    : initial.params;
  const marketData = new Market({ ...initial.marketData, params: market });
  await fundE2eMidnightWallets(client, { market, wallets });

  return {
    client,
    chainId,
    market,
    marketData,
    marketId: MarketUtils.toId(market),
    midnight: client.extend(morphoViemExtension()).morpho.midnight(chainId),
  };
};

type Ctx = Awaited<ReturnType<typeof setUp>>;

const position = async (ctx: Ctx, user: Address) => {
  const [credit, , , , debt] = await ctx.client.readContract({
    address: ctx.market.midnight,
    abi: midnightAbi,
    functionName: "position",
    args: [ctx.marketId, user],
  });
  const collateral = await ctx.client.readContract({
    address: ctx.market.midnight,
    abi: midnightAbi,
    functionName: "collateral",
    args: [ctx.marketId, user, 0n],
  });
  return { credit, debt, collateral };
};

const tokenBalance = (params: {
  readonly client: Client;
  readonly token: Address;
  readonly account: Address;
}) =>
  params.client.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.account],
  });

const send = async (
  client: Client,
  transaction: Parameters<Client["sendTransaction"]>[0],
) => {
  const hash = await client.sendTransaction(transaction);
  const receipt = await client.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  return receipt;
};

const sendRequirements = async (
  client: Client,
  params: {
    readonly account: Address;
    readonly requirements: readonly ActionRequirement[];
  },
) => {
  for (const requirement of params.requirements) {
    if (isRequirementSignature(requirement))
      expect.unreachable("expected onchain requirements");
    await send(client, {
      ...requirement,
      account: params.account,
    } as Parameters<Client["sendTransaction"]>[0]);
  }
};

const execute = async (
  ctx: Ctx,
  params: { readonly account: Address; readonly output: Output },
) => {
  await sendRequirements(ctx.client, {
    account: params.account,
    requirements: await params.output.getRequirements(),
  });
  return send(ctx.client, {
    ...params.output.buildTx(),
    account: params.account,
    gas: takeGas,
  } as Parameters<Client["sendTransaction"]>[0]);
};

const executeNative = async (
  ctx: Ctx,
  params: {
    readonly account: Address;
    readonly output: Output;
    readonly nativeAmount: bigint;
    readonly maxPull: bigint;
  },
) => {
  const { account, nativeAmount, output, maxPull } = params;
  const wNative = getChainAddress(ctx.chainId, "wNative");
  const bundles = getChainAddress(ctx.chainId, "midnightBundlesV2");
  const existing = await tokenBalance({
    client: ctx.client,
    token: wNative,
    account,
  });
  if (existing > 0n)
    await ctx.client.writeContract({
      account,
      address: wNative,
      abi: parseAbi(["function withdraw(uint256) external"]),
      functionName: "withdraw",
      args: [existing],
    });
  if (nativeAmount < maxPull)
    await wrapE2eNative(ctx.client, {
      wNative,
      account,
      amount: maxPull - nativeAmount + units / 10n,
    });
  await ctx.client.writeContract({
    account,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [bundles, maxPull - nativeAmount],
  });
  const approval = (await output.getRequirements()).find(
    (requirement) =>
      isRequirementApproval(requirement) &&
      isAddressEqual(requirement.to, wNative) &&
      isAddressEqual(requirement.action.args.spender, bundles) &&
      requirement.action.args.amount >= maxPull,
  );
  expect(approval).toBeDefined();
  await sendRequirements(ctx.client, {
    account,
    requirements: await output.getRequirements(),
  });
  expect(
    await ctx.client.readContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, bundles],
    }),
  ).toBeGreaterThanOrEqual(maxPull);
  await ctx.client.setBalance({
    address: account,
    value: nativeAmount + parseEther("1"),
  });
  const nativeBefore = await ctx.client.getBalance({ address: account });
  const wNativeEthBefore = await ctx.client.getBalance({ address: wNative });
  const bundlesEthBefore = await ctx.client.getBalance({ address: bundles });
  const tokenBefore = await tokenBalance({
    client: ctx.client,
    token: wNative,
    account,
  });
  const transaction = {
    ...output.buildTx(),
    account,
    gas: takeGas,
  } as Parameters<Client["sendTransaction"]>[0];
  expect(transaction.value).toBe(nativeAmount);
  const receipt = await send(ctx.client, transaction);
  const nativeAfter = await ctx.client.getBalance({ address: account });
  const wNativeEthAfter = await ctx.client.getBalance({ address: wNative });
  const bundlesEthAfter = await ctx.client.getBalance({ address: bundles });
  const tokenAfter = await tokenBalance({
    client: ctx.client,
    token: wNative,
    account,
  });
  const transfers = parseEventLogs({
    abi: erc20Abi,
    logs: receipt.logs.filter((log) => isAddressEqual(log.address, wNative)),
    eventName: "Transfer",
  });
  const pulled = transfers.reduce((total, { args }) => {
    if (
      isAddressEqual(args.from, bundles) &&
      !isAddressEqual(args.to, account) &&
      !isAddressEqual(args.to, zeroAddress)
    )
      return total + args.value;
    return total;
  }, 0n);
  expect(nativeBefore - nativeAfter).toBeGreaterThanOrEqual(
    nativeAmount + receipt.gasUsed * receipt.effectiveGasPrice,
  );
  expect(wNativeEthAfter - wNativeEthBefore).toBe(nativeAmount);
  expect(bundlesEthBefore).toBe(0n);
  expect(bundlesEthAfter).toBe(0n);
  expect(
    await tokenBalance({
      client: ctx.client,
      token: wNative,
      account: bundles,
    }),
  ).toBe(0n);
  expect(
    transfers.reduce(
      (total, { args }) =>
        isAddressEqual(args.from, account) && isAddressEqual(args.to, bundles)
          ? total + args.value
          : total,
      0n,
    ),
  ).toBe(maxPull);
  if (ctx.chainId === 1)
    expect(nativeBefore - nativeAfter).toBe(
      nativeAmount + receipt.gasUsed * receipt.effectiveGasPrice,
    );
  expect(tokenAfter).toBe(tokenBefore + nativeAmount - pulled);
  expect(pulled).toBeGreaterThan(0n);
  if (nativeAmount < maxPull) expect(pulled).toBeGreaterThan(nativeAmount);
  if (maxPull > pulled) expect(tokenAfter).toBeGreaterThan(0n);
  return { pulled, receipt };
};

const openLoan = async (
  ctx: Ctx,
  params: { readonly nativeAmount?: bigint } = {},
) => {
  await execute(ctx, {
    account: B,
    output: ctx.midnight.supplyCollateral({
      accountAddress: B,
      marketData: ctx.marketData,
      collateralAssets,
    }),
  });

  const tree = Tree.create([
    Offer.create({
      market: ctx.market,
      buy: false,
      maker: B,
      expiry: ctx.market.maturity,
      tick: 5_000n,
      ratifier: getChainAddress(ctx.chainId, "setterRatifier"),
      receiverIfMakerIsSeller: B,
      maxUnits: units,
    }),
  ]);
  await postE2eSetterTree(ctx.client, {
    chainId: ctx.chainId,
    maker: B,
    tree,
  });

  const take = ctx.midnight.takeLend({
    marketData: ctx.marketData,
    accountAddress: A,
    target: { type: "units", units, maxBuyerAssets: 2n * units },
    takeableOffers: getE2eTakeableOffers({ tree, units }),
    maxContinuousFee: maxUint256,
    deadline: deadline(),
    ...(params.nativeAmount === undefined
      ? {}
      : { nativeAmount: params.nativeAmount }),
  });
  if (params.nativeAmount === undefined) {
    await execute(ctx, { account: A, output: take });
  } else {
    const { pulled } = await executeNative(ctx, {
      account: A,
      output: take,
      nativeAmount: params.nativeAmount,
      maxPull: 2n * units,
    });
    expect(pulled).toBeLessThan(2n * units);
  }

  await expect(position(ctx, A)).resolves.toMatchObject({ credit: units });
  await expect(position(ctx, B)).resolves.toMatchObject({ debt: units });
};

const positionData = async (ctx: Ctx, accountAddress: Address) =>
  ctx.midnight.getPositionData({
    marketId: ctx.marketId,
    accountAddress,
  });

describeE2e(scenario, (test, { chainId }) => {
  for (const funding of ["full", "partial"] as const) {
    const nativeFor = (cap: bigint) => (funding === "full" ? cap : cap / 4n);
    test.skipIf(getE2eAsset(chainId).requiresInstall)(
      `L1-T8: takeLend wraps native ETH and keeps unpulled WETH (${funding} native)`,
      { tags: ["nightly"] },
      async ({ client }) => {
        const ctx = await setUp({
          client,
          chainId,
          wallets: {
            A: { loanAssets: 2n * units },
            B: { collateralAssets },
          },
        });
        await openLoan(ctx, { nativeAmount: nativeFor(2n * units) });

        await expect(position(ctx, A)).resolves.toMatchObject({
          credit: units,
        });
        await expect(position(ctx, B)).resolves.toMatchObject({ debt: units });
      },
    );

    test.skipIf(getE2eAsset(chainId).requiresInstall)(
      `L1-T8: takeRepayWithdrawCollateral wraps native ETH and keeps unpulled WETH (${funding} native)`,
      { tags: ["nightly"] },
      async ({ client }) => {
        const ctx = await setUp({
          client,
          chainId,
          wallets: {
            A: { loanAssets: 2n * units },
            B: { loanAssets: 2n * units, collateralAssets },
            D: { collateralAssets },
          },
        });
        await openLoan(ctx);

        await execute(ctx, {
          account: D,
          output: ctx.midnight.supplyCollateral({
            accountAddress: D,
            marketData: ctx.marketData,
            collateralAssets,
          }),
        });
        const tree = Tree.create([
          Offer.create({
            market: ctx.market,
            buy: false,
            maker: D,
            expiry: ctx.market.maturity,
            tick: 5_000n,
            ratifier: getChainAddress(chainId, "setterRatifier"),
            receiverIfMakerIsSeller: D,
            maxUnits: units,
          }),
        ]);
        await postE2eSetterTree(client, { chainId, maker: D, tree });

        const marketData = await ctx.midnight.getMarketData(ctx.marketId);
        const borrowerPosition = await positionData(ctx, B);
        const collateralBalanceBefore = await tokenBalance({
          client,
          token: ctx.market.collateralParams[0]!.token,
          account: B,
        });
        const output = ctx.midnight.takeRepayWithdrawCollateral({
          accountAddress: B,
          marketData,
          positionData: borrowerPosition,
          collateralPrices: [oraclePrice],
          target: { type: "units", units, maxBuyerAssets: 2n * units },
          takeableOffers: getE2eTakeableOffers({ tree, units }),
          repayEnabled: false,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
          maxContinuousFee: maxUint256,
          deadline: deadline(),
          nativeAmount: nativeFor(2n * units),
        });
        const { pulled } = await executeNative(ctx, {
          account: B,
          output,
          nativeAmount: nativeFor(2n * units),
          maxPull: 2n * units,
        });

        expect(pulled).toBeLessThan(2n * units);
        await expect(position(ctx, B)).resolves.toMatchObject({
          debt: 0n,
          collateral: 0n,
        });
        await expect(position(ctx, D)).resolves.toMatchObject({ debt: units });
        await expect(
          tokenBalance({
            client,
            token: ctx.market.collateralParams[0]!.token,
            account: B,
          }),
        ).resolves.toBe(collateralBalanceBefore + collateralAssets);
      },
    );

    test.skipIf(getE2eAsset(chainId).requiresInstall)(
      `L1-T8: direct full repayment wraps native ETH and keeps unpulled WETH (${funding} native)`,
      { tags: ["nightly"] },
      async ({ client }) => {
        const ctx = await setUp({
          client,
          chainId,
          wallets: {
            A: { loanAssets: 2n * units },
            B: { loanAssets: 2n * units, collateralAssets },
          },
        });
        await openLoan(ctx);

        const marketData = await ctx.midnight.getMarketData(ctx.marketId);
        const borrowerPosition = await positionData(ctx, B);
        const output = ctx.midnight.repayWithdrawCollateral({
          accountAddress: B,
          marketData,
          positionData: borrowerPosition,
          collateralPrices: [],
          repay: {
            type: "full",
            maxBuyerAssets: borrowerPosition.debt + units / 5n,
          },
          collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
          deadline: deadline(),
          nativeAmount: nativeFor(borrowerPosition.debt + units / 5n),
        });
        const { pulled } = await executeNative(ctx, {
          account: B,
          output,
          nativeAmount: nativeFor(borrowerPosition.debt + units / 5n),
          maxPull: borrowerPosition.debt + units / 5n,
        });

        expect(pulled).toBeLessThan(borrowerPosition.debt + units / 5n);
        expect(pulled).toBe(borrowerPosition.debt);
        await expect(position(ctx, B)).resolves.toEqual({
          credit: 0n,
          debt: 0n,
          collateral: 0n,
        });
      },
    );

    test.skipIf(getE2eAsset(chainId).requiresInstall)(
      `L1-T8: supplyCollateralTakeBorrow wraps native ETH into WETH collateral on the fly (${funding} native)`,
      { tags: ["nightly"] },
      async ({ client }) => {
        const wallets: Parameters<typeof fundE2eMidnightWallets>[1]["wallets"] =
          { A: { loanAssets: 2n * units }, B: {} };
        await installE2eAsset(client, wethCollateralLoanToken);
        const oracle = await installE2eOracle(client);
        const { timestamp } = await client.getBlock();
        const day = 86_400n;
        const market = new MarketParams({
          chainId,
          midnight: getChainAddress(chainId, "midnight"),
          loanToken: wethCollateralLoanToken,
          collateralParams: [
            {
              token: getChainAddress(chainId, "wNative"),
              lltv: 770000000000000000n,
              liquidationCursor: 300000000000000000n,
              oracle,
            },
          ],
          maturity: ((timestamp + 365n * day) / day + 1n) * day + 15n * 3_600n,
          rcfThreshold: 0n,
          enterGate: zeroAddress,
          liquidatorGate: zeroAddress,
        });
        const initialMarketData = new Market({
          params: market,
          totalUnits: 0n,
          lossFactor: 0n,
          withdrawable: 0n,
          continuousFeeCredit: 0n,
          settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
          continuousFee: 0,
          tickSpacing: 1,
        });
        await fundE2eMidnightWallets(client, { wallets: { A: {}, B: {} } });
        for (const walletName of ["A", "B"] as const) {
          const loanAssets = wallets[walletName]?.loanAssets;
          if (loanAssets == null) continue;
          await client.deal({
            erc20: wethCollateralLoanToken,
            account: E2E_MIDNIGHT_WALLETS[walletName],
            amount: loanAssets,
          });
        }
        const ctx = {
          client,
          chainId,
          market,
          marketData: initialMarketData,
          marketId: MarketUtils.toId(market),
          midnight: client
            .extend(morphoViemExtension())
            .morpho.midnight(chainId),
        };
        await fundE2eMidnightWallets(client, { wallets: { C: {} } });
        await wrapE2eNative(client, {
          wNative: getChainAddress(chainId, "wNative"),
          amount: 1n,
          account: C,
        });
        await execute(ctx, {
          account: C,
          output: ctx.midnight.supplyCollateral({
            accountAddress: C,
            marketData: ctx.marketData,
            collateralAssets: 1n,
          }),
        });
        await client.writeContract({
          account: A,
          address: ctx.market.loanToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [ctx.market.midnight, maxUint256],
        });
        const tree = Tree.create([
          Offer.create({
            market: ctx.market,
            buy: true,
            maker: A,
            expiry: ctx.market.maturity,
            tick: 5_000n,
            ratifier: getChainAddress(chainId, "setterRatifier"),
            receiverIfMakerIsSeller: zeroAddress,
            maxUnits: units,
          }),
        ]);
        await postE2eSetterTree(client, { chainId, maker: A, tree });
        const marketData = await ctx.midnight.getMarketData(ctx.marketId);
        const output = ctx.midnight.supplyCollateralTakeBorrow({
          accountAddress: B,
          marketData,
          positionData: await positionData(ctx, B),
          collateralPrices: [oraclePrice],
          collateralSupplies: [
            { collateralIndex: 0n, assets: collateralAssets },
          ],
          target:
            funding === "full"
              ? { type: "units", units, minSellerAssets: 1n }
              : { type: "assets", assets: units / 2n, maxUnits: units },
          takeableOffers: getE2eTakeableOffers({ tree, units }),
          deadline: deadline(),
          nativeAmount: nativeFor(collateralAssets),
        });

        const aLoanBalanceBefore = await tokenBalance({
          client,
          token: ctx.market.loanToken,
          account: A,
        });
        const bLoanBalanceBefore = await tokenBalance({
          client,
          token: ctx.market.loanToken,
          account: B,
        });
        const midnightLoanBalanceBefore = await tokenBalance({
          client,
          token: ctx.market.loanToken,
          account: ctx.market.midnight,
        });
        const { pulled } = await executeNative(ctx, {
          account: B,
          output,
          nativeAmount: nativeFor(collateralAssets),
          maxPull: collateralAssets,
        });
        const aLoanBalanceAfter = await tokenBalance({
          client,
          token: ctx.market.loanToken,
          account: A,
        });
        const bLoanBalanceAfter = await tokenBalance({
          client,
          token: ctx.market.loanToken,
          account: B,
        });
        const midnightLoanBalanceAfter = await tokenBalance({
          client,
          token: ctx.market.loanToken,
          account: ctx.market.midnight,
        });
        const paid = aLoanBalanceBefore - aLoanBalanceAfter;
        expect(bLoanBalanceAfter - bLoanBalanceBefore).toBe(paid);
        expect(paid).toBeGreaterThanOrEqual(1n);
        expect(midnightLoanBalanceAfter).toBe(midnightLoanBalanceBefore);
        expect(pulled).toBe(collateralAssets);

        const borrower = await position(ctx, B);
        const lender = await position(ctx, A);
        expect(borrower.collateral).toBe(collateralAssets);
        expect(borrower.debt).toBe(lender.credit);
        if (funding === "full") expect(borrower.debt).toBe(units);
        else {
          expect(paid).toBe(units / 2n);
          expect(borrower.debt).toBeGreaterThan(0n);
          expect(borrower.debt).toBeLessThanOrEqual(units);
        }
      },
    );

    test.skipIf(getE2eAsset(chainId).requiresInstall)(
      `L1-T8: supplyCollateralMakeBorrow wraps native ETH into WETH collateral on the fly (${funding} native)`,
      { tags: ["nightly"] },
      async ({ client }) => {
        const wallets: Parameters<typeof fundE2eMidnightWallets>[1]["wallets"] =
          { A: {}, B: {} };
        await installE2eAsset(client, wethCollateralLoanToken);
        const oracle = await installE2eOracle(client);
        const { timestamp } = await client.getBlock();
        const day = 86_400n;
        const market = new MarketParams({
          chainId,
          midnight: getChainAddress(chainId, "midnight"),
          loanToken: wethCollateralLoanToken,
          collateralParams: [
            {
              token: getChainAddress(chainId, "wNative"),
              lltv: 770000000000000000n,
              liquidationCursor: 300000000000000000n,
              oracle,
            },
          ],
          maturity: ((timestamp + 365n * day) / day + 1n) * day + 15n * 3_600n,
          rcfThreshold: 0n,
          enterGate: zeroAddress,
          liquidatorGate: zeroAddress,
        });
        const initialMarketData = new Market({
          params: market,
          totalUnits: 0n,
          lossFactor: 0n,
          withdrawable: 0n,
          continuousFeeCredit: 0n,
          settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
          continuousFee: 0,
          tickSpacing: 1,
        });
        await fundE2eMidnightWallets(client, { wallets: { A: {}, B: {} } });
        for (const walletName of ["A", "B"] as const) {
          const loanAssets = wallets[walletName]?.loanAssets;
          if (loanAssets == null) continue;
          await client.deal({
            erc20: wethCollateralLoanToken,
            account: E2E_MIDNIGHT_WALLETS[walletName],
            amount: loanAssets,
          });
        }
        const ctx = {
          client,
          chainId,
          market,
          marketData: initialMarketData,
          marketId: MarketUtils.toId(market),
          midnight: client
            .extend(morphoViemExtension())
            .morpho.midnight(chainId),
        };
        const output = await ctx.midnight.supplyCollateralMakeBorrow({
          accountAddress: B,
          offers: Tree.create({
            type: "rateV1",
            entries: [
              {
                offer: Offer.create({
                  market: ctx.market,
                  buy: false,
                  maker: B,
                  expiry: ctx.market.maturity,
                  tick: 5_000n,
                  group: `0x${"b".repeat(64)}` as Hex,
                  ratifier: getChainAddress(
                    Number(ctx.market.chainId),
                    "rateRatifierV1",
                  ),
                  continuousFeeCap: 0n,
                  receiverIfMakerIsSeller: B,
                  maxUnits: units,
                  maxAssets: 0n,
                  callback: zeroAddress,
                  callbackData: "0x",
                }),
                rate: 1_000_000_000n,
              },
            ],
          }),
          collateral: {
            market: ctx.market,
            supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
          },
          deadline: deadline(),
          validation: false,
          nativeAmount: nativeFor(collateralAssets),
        });

        const { pulled } = await executeNative(ctx, {
          account: B,
          output,
          nativeAmount: nativeFor(collateralAssets),
          maxPull: collateralAssets,
        });
        expect(pulled).toBe(collateralAssets);

        await expect(position(ctx, B)).resolves.toMatchObject({
          collateral: collateralAssets,
        });
        await expect(
          ctx.client.readContract({
            address: getChainAddress(ctx.chainId, "rateRatifierV1"),
            abi: rateRatifierV1Abi,
            functionName: "isRootRatified",
            args: [B, output.root],
          }),
        ).resolves.toBe(true);
      },
    );
  }
});
describeE2e(blueScenario, (test, { chainId }) => {
  for (const funding of ["full", "partial"] as const) {
    for (const combined of [false, true]) {
      const nativeFor = (cap: bigint) => (funding === "full" ? cap : cap / 4n);
      test.skipIf(getE2eAsset(chainId).requiresInstall)(
        `L1-T8: supplyBlueMakeLend wraps native ETH into WETH parked on Blue (${funding} native, combined collateral: ${combined})`,
        { tags: ["nightly"] },
        async ({ client }) => {
          const { timestamp } = await client.getBlock();
          const day = 86_400n;
          const ctx = await setUp({
            client,
            chainId,
            maturity:
              ((timestamp + 365n * day) / day + 1n) * day + 15n * 3_600n,
            nativeCollateral: combined,
            wallets: { A: {}, B: {}, C: {} },
          });
          const blueMarket = await createE2eMarket(client, chainId);
          const blue = client
            .extend(morphoViemExtension())
            .morpho.blue(blueMarket, chainId);
          const seed = blue.supply({
            userAddress: C,
            assets: 2n * units,
            deadline: maxUint256,
          });
          await wrapE2eNative(client, {
            wNative: getChainAddress(chainId, "wNative"),
            amount: 2n * units,
            account: C,
          });
          await sendRequirements(client, {
            account: C,
            requirements: await seed.getRequirements(),
          });
          await send(client, {
            ...seed.buildTx(),
            account: C,
            gas: takeGas,
          } as Parameters<Client["sendTransaction"]>[0]);
          const assetsToPark = units;
          const maxPull = combined
            ? assetsToPark + collateralAssets
            : assetsToPark;
          const callbackSalt = `0x${"c".repeat(64)}` as Hex;
          const callback = getMidnightBlueBuyCallbackAddress({
            chainId,
            owner: A,
            salt: callbackSalt,
          });
          const blueOutput = await ctx.midnight.supplyBlueMakeLend({
            accountAddress: A,
            offers: Tree.create({
              type: "rateV1",
              entries: [
                {
                  offer: Offer.create({
                    market: ctx.market,
                    buy: true,
                    maker: A,
                    expiry: ctx.market.maturity,
                    tick: 5_000n,
                    group: `0x${"a".repeat(64)}` as Hex,
                    ratifier: getChainAddress(
                      Number(ctx.market.chainId),
                      "rateRatifierV1",
                    ),
                    continuousFeeCap: 0n,
                    receiverIfMakerIsSeller: zeroAddress,
                    maxUnits: 0n,
                    maxAssets: units,
                    callback,
                    callbackData: getMidnightBlueBuyCallbackData(blueMarket),
                  }),
                  rate: 1_000_000_000n,
                },
              ],
            }),
            blueMarket,
            assetsToPark,
            callbackSalt,
            deadline: deadline(),
            validation: false,
            nativeAmount: nativeFor(assetsToPark),
          });
          let output: Output = blueOutput;
          if (combined) {
            const decoded = decodeFunctionData({
              abi: midnightBundlesV2Abi,
              data: blueOutput.buildTx().data,
            });
            if (decoded.functionName !== "midnightBundlesV2CancelAndMake")
              expect.unreachable();
            const tx = midnightCancelAndMake({
              chainId,
              cancellations: [],
              deadline: deadline(),
              nativeAmount: nativeFor(maxPull),
              publication: {
                ratifier: getChainAddress(chainId, "rateRatifierV1"),
                root: blueOutput.root,
                groups: blueOutput.groups,
                payload: decoded.args[14],
                blueSupply: {
                  market: blueMarket,
                  assets: assetsToPark,
                  callbackSalt,
                },
                collateral: {
                  market: ctx.market,
                  supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
                },
              },
            });
            output = {
              buildTx: () => tx,
              getRequirements: async () => [
                ...(await blueOutput.getRequirements()),
                ...(await getMidnightApprovalRequirements({
                  viemClient: client,
                  chainId,
                  token: getChainAddress(chainId, "wNative"),
                  owner: A,
                  spender: getChainAddress(chainId, "midnightBundlesV2"),
                  amount: maxPull,
                })),
              ],
            };
          }
          const { pulled } = await executeNative(ctx, {
            account: A,
            output,
            nativeAmount: nativeFor(maxPull),
            maxPull,
          });
          expect(pulled).toBe(maxPull);
          if (combined)
            await expect(position(ctx, A)).resolves.toEqual({
              credit: 0n,
              debt: 0n,
              collateral: collateralAssets,
            });

          const callbackPosition = await blue.getPositionData(callback);
          expect(callbackPosition.supplyShares).toBeGreaterThan(0n);
          await expect(
            ctx.client.readContract({
              address: getChainAddress(ctx.chainId, "rateRatifierV1"),
              abi: rateRatifierV1Abi,
              functionName: "isRootRatified",
              args: [A, blueOutput.root],
            }),
          ).resolves.toBe(true);
        },
      );
    }
  }
});
