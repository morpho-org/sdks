import {
  type IMarketParams,
  MAX_TICK,
  Market,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { decodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { base, mainnet } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightMarket,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InvalidBigIntInputError,
  MidnightCalldataEncodingError,
  MidnightContinuousFeeAboveMaxError,
  MidnightTakeableOfferMarketMismatchError,
  MidnightTakeableOffersNotFillableError,
  MidnightTakeDeadlineTooFarError,
  MissingContractCodeError,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import {
  buildTransaction,
  buildTransactions,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  type MidnightTakeLendPlanParams,
  prepareMidnightTakeLend,
} from "./takeLend.js";

const chainId = base.id;
const account = midnightAddresses.taker;
const spender = getChainAddress(chainId, "midnightBundlesV2");
const wNative = getChainAddress(chainId, "wNative");
const now = 1_000n;
const lendMarketData = (
  marketParams: IMarketParams = midnightMarket,
  continuousFee = 0,
) =>
  new Market({
    params: marketParams,
    totalUnits: 0n,
    lossFactor: 0n,
    withdrawable: 0n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee,
    tickSpacing: 1,
  });
const params = {
  account,
  chainId,
  marketData: lendMarketData(),
  target: { type: "assets", assets: 100n, minUnits: 100n },
  takeableOffers: [midnightApiTake()],
  maxContinuousFee: 17n,
  now,
  expiresAt: 1_600,
} satisfies MidnightTakeLendPlanParams;

function clientWithState({
  token = midnightMarket.loanToken,
  allowance,
  authorized,
}: {
  token?: typeof midnightMarket.loanToken;
  allowance: bigint;
  authorized: boolean;
}) {
  const handle = createMockClient(base);
  mockRead(handle, {
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    result: allowance,
  });
  mockRead(handle, {
    address: midnightMarket.midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    result: authorized,
  });
  return handle.client;
}

const MIDNIGHT_ACTION_TYPES = [
  "midnightAuthorization",
  "midnightTakeLend",
  "midnightSupplyCollateral",
  "midnightRedeem",
  "midnightCancelOffers",
  "midnightTakeBorrow",
  "midnightTakeWithdraw",
  "midnightRepayWithdrawCollateral",
  "midnightMakeBorrow",
  "midnightMakeLend",
  "midnightMakeWithdraw",
  "midnightMakeRepay",
  "midnightSupplyCollateralMakeBorrow",
  "midnightSupplyBlueMakeLend",
  "midnightSupplyCollateralTakeBorrow",
  "midnightTakeRepayWithdrawCollateral",
  "midnightWithdrawCollateral",
  "midnightWithdrawCollateralBatch",
  "midnightSupplyCollateralWithNative",
  "midnightSupplyCollateralBatch",
] as const;

describe("prepareMidnightTakeLend", () => {
  test("default", async () => {
    const client = clientWithState({ allowance: 0n, authorized: false });
    const plan = await prepareMidnightTakeLend(client, {
      ...params,
      referralFee: { bps: 20, recipient: midnightAddresses.maker },
    });
    expect(getPendingSignatureRequests(plan)).toEqual([]);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "midnightAuthorization",
      "midnightTakeLend",
    ]);
    for (const { action } of plan.steps) {
      expect(action.inputs).toMatchObject({ account, chainId });
    }
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    const txs = buildTransactions(restored);
    expect(txs).toEqual(buildTransactions(plan));
    const [approval, authorization, lend] = txs;
    assert(approval && authorization && lend);
    expect(approval.to).toBe(midnightMarket.loanToken);
    expect(decodeFunctionData({ abi: erc20Abi, data: approval.data })).toEqual({
      functionName: "approve",
      args: [spender, maxUint256],
    });
    expect(authorization.to).toBe(midnightMarket.midnight);
    expect(
      decodeFunctionData({ abi: midnightAbi, data: authorization.data }),
    ).toEqual({
      functionName: "setIsAuthorized",
      args: [spender, true, account],
    });
    expect(lend.to).toBe(spender);
    expect(lend.value).toBe(0n);
    expect(
      decodeFunctionData({ abi: midnightBundlesV2Abi, data: lend.data }),
    ).toMatchObject({
      functionName: "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
      args: [
        expect.anything(),
        100n,
        100n,
        false,
        false,
        expect.anything(),
        [],
        expect.anything(),
        2_000_000_000_000_000n,
        midnightAddresses.maker,
        17n,
        1_600n,
        expect.anything(),
      ],
    });
  });

  test.each([99n, 100n])(
    "behavior: native input requires the full wNative allowance (allowance %s)",
    async (allowance) => {
      const market = { ...midnightMarket, loanToken: wNative };
      const plan = await prepareMidnightTakeLend(
        clientWithState({ token: wNative, allowance, authorized: true }),
        {
          ...params,
          marketData: lendMarketData(market),
          takeableOffers: [midnightApiTake({ market })],
          target: { type: "units", units: 100n, maxBuyerAssets: 100n },
          nativeAmount: 90n,
        },
      );
      expect(plan.steps.map(({ action }) => action.type)).toEqual(
        allowance === 99n
          ? ["erc20Approval", "midnightTakeLend"]
          : ["midnightTakeLend"],
      );
      expect(plan.signatureRequests).toEqual([]);
      const txs = buildTransactions(plan);
      if (allowance === 99n) {
        const [approval] = txs;
        assert(approval);
        expect(approval.to).toBe(wNative);
        expect(
          decodeFunctionData({ abi: erc20Abi, data: approval.data }),
        ).toEqual({
          functionName: "approve",
          args: [spender, maxUint256],
        });
      }
      const lend = txs.at(-1);
      assert(lend);
      expect(lend.value).toBe(90n);
      expect(
        decodeFunctionData({ abi: midnightBundlesV2Abi, data: lend.data })
          .functionName,
      ).toBe("midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral");
    },
  );

  test("behavior: restored assets-target plan keeps its committed calldata", async () => {
    const plan = await prepareMidnightTakeLend(
      clientWithState({ allowance: maxUint256, authorized: true }),
      params,
    );
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(buildTransactions(restored)).toMatchInlineSnapshot(`
      [
        {
          "action": {
            "args": {
              "deadline": 1600n,
              "market": "0x994ce88b951db7a30742bb05a4dedd42dd42ce6633884ea82d7d525b1a56ed1f",
              "maxContinuousFee": 17n,
              "referralFeePct": 0n,
              "referralFeeRecipient": "0x0000000000000000000000000000000000000000",
              "takeableOffers": 1,
              "target": {
                "assets": 100n,
                "minUnits": 100n,
                "type": "assets",
              },
            },
            "type": "midnightTakeLend",
          },
          "data": "0x934a8ebb00000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000034000000000000000000000000000000000000000000000000000000000000007c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d9000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000090000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000083400000000000000000000000000000000000000000000000000000000000013886fc1dd62218f9929f1af43ccb2e8c0803a9032a5e17e59c553c8d0c5eee2563f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003800000000000000000000000000000000000000000000000000000000000009000000000000000000000000000d6e70365c8e8dda9a4ca662c07bbe663b017755e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d9000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000212340000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          "to": "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
          "value": 0n,
        },
      ]
    `);
  });

  test("behavior: restored native units-target plan keeps its committed calldata", async () => {
    const market = { ...midnightMarket, loanToken: wNative };
    const plan = await prepareMidnightTakeLend(
      clientWithState({
        token: wNative,
        allowance: maxUint256,
        authorized: true,
      }),
      {
        ...params,
        marketData: lendMarketData(market),
        takeableOffers: [midnightApiTake({ market })],
        target: { type: "units", units: 100n, maxBuyerAssets: 100n },
        nativeAmount: 90n,
      },
    );
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(buildTransactions(restored)).toMatchInlineSnapshot(`
      [
        {
          "action": {
            "args": {
              "deadline": 1600n,
              "market": "0xbd0b9d9f796f796881fa0c733808b9d5d3508cf349bedfdb18a38267ba10ca13",
              "maxContinuousFee": 17n,
              "referralFeePct": 0n,
              "referralFeeRecipient": "0x0000000000000000000000000000000000000000",
              "takeableOffers": 1,
              "target": {
                "maxBuyerAssets": 100n,
                "type": "units",
                "units": 100n,
              },
            },
            "type": "midnightTakeLend",
          },
          "data": "0x8261dcb700000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000034000000000000000000000000000000000000000000000000000000000000007c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000064000000000000000000000000042000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000004200000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d9000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000001e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008340000000000000000000000000000000000000000000000000000000000001388ba1f04daaaac0bd2100d104bec7d11507c484b40c7295c0a7c9816ee506dd9b1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003800000000000000000000000000000000000000000000000000000000000009000000000000000000000000000d6e70365c8e8dda9a4ca662c07bbe663b017755e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000004200000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d9000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000212340000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          "to": "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
          "value": 90n,
        },
      ]
    `);
  });

  test("behavior: a native amount changed during a read does not reach the plan", async () => {
    const market = { ...midnightMarket, loanToken: wNative };
    const handle = createMockClient(base);
    mockRead(handle, {
      address: wNative,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    mockRead(handle, {
      address: midnightMarket.midnight,
      abi: midnightAbi,
      functionName: "isAuthorized",
      result: true,
    });
    const defaultRequest = handle.request.getMockImplementation();
    assert(defaultRequest);
    const { promise: chainIdHeld, resolve: releaseChainId } =
      Promise.withResolvers<void>();
    const { promise: chainIdRequested, resolve: markChainIdRequested } =
      Promise.withResolvers<void>();
    handle.request.mockImplementation(async (args) => {
      if (args.method === "eth_chainId") {
        markChainIdRequested();
        await chainIdHeld;
      }
      return defaultRequest(args);
    });
    const request: MidnightTakeLendPlanParams = {
      ...params,
      marketData: lendMarketData(market),
      takeableOffers: [midnightApiTake({ market })],
    };

    const preparation = prepareMidnightTakeLend(handle.client, request);
    await chainIdRequested;
    Object.assign(request, { nativeAmount: 90n });
    releaseChainId();
    const plan = await preparation;

    const step = plan.steps.at(-1);
    assert(step?.action.type === "midnightTakeLend");
    expect(step.action.inputs).not.toHaveProperty("nativeAssets");
    expect(buildTransactions(plan).at(-1)?.value).toBe(0n);
  });

  test.each(["midnightAuthorization", "midnightTakeLend"] as const)(
    "error: InvalidTransactionPlanError for a signature reference on a restored %s step",
    async (type) => {
      const plan = await prepareMidnightTakeLend(
        clientWithState({ allowance: maxUint256, authorized: false }),
        params,
      );
      const index = plan.steps.findIndex(({ action }) => action.type === type);
      const steps = plan.steps.map((step, stepIndex) =>
        stepIndex === index
          ? { ...step, action: { ...step.action, signatureRequestIds: {} } }
          : step,
      );
      expect(() =>
        parseTransactionPlan(serializeTransactionPlan({ ...plan, steps })),
      ).toThrow(
        expect.objectContaining({
          constructor: InvalidTransactionPlanError,
          path: `$.steps[${index}].action.signatureRequestIds`,
        }),
      );
    },
  );

  test.each(["midnightAuthorization", "midnightTakeLend"] as const)(
    "error: build and inspection throw InvalidTransactionPlanError for the signature reference restore rejects on a %s step",
    async (type) => {
      const plan = await prepareMidnightTakeLend(
        clientWithState({ allowance: maxUint256, authorized: false }),
        params,
      );
      const index = plan.steps.findIndex(({ action }) => action.type === type);
      const tampered = {
        ...plan.steps[index],
        action: { ...plan.steps[index]?.action, signatureRequestIds: {} },
      } as (typeof plan.steps)[number];
      const steps = plan.steps.map((step, stepIndex) =>
        stepIndex === index ? tampered : step,
      );
      const rejection = (stepIndex: number) =>
        expect.objectContaining({
          constructor: InvalidTransactionPlanError,
          path: `$.steps[${stepIndex}].action.signatureRequestIds`,
        });
      const tamperedPlan = { ...plan, steps };

      expect(() =>
        parseTransactionPlan(serializeTransactionPlan(tamperedPlan)),
      ).toThrow(rejection(index));
      expect(() => buildTransactions(tamperedPlan)).toThrow(rejection(index));
      expect(() => buildTransaction(tamperedPlan, tampered)).toThrow(
        rejection(index),
      );
      expect(() => getPendingSignatureRequests(tamperedPlan)).toThrow(
        rejection(index),
      );
      expect(() => buildTransaction(plan, tampered)).toThrow(
        rejection(plan.steps.length),
      );
    },
  );

  test.each(MIDNIGHT_ACTION_TYPES)(
    "error: build and inspection throw InvalidTransactionPlanError for a signature map on any %s step",
    async (type) => {
      const plan = await prepareMidnightTakeLend(
        clientWithState({ allowance: maxUint256, authorized: false }),
        params,
      );
      const index = plan.steps.findIndex(
        ({ action }) => action.type === "midnightTakeLend",
      );
      const swapped = {
        ...plan.steps[index]?.action,
        type,
        signatureRequestIds: {},
      };
      const tampered = {
        ...plan.steps[index],
        action: swapped,
      } as (typeof plan.steps)[number];
      const tamperedPlan = {
        ...plan,
        steps: plan.steps.map((step, stepIndex) =>
          stepIndex === index ? tampered : step,
        ),
      };
      const rejection = (stepIndex: number) =>
        expect.objectContaining({
          constructor: InvalidTransactionPlanError,
          path: `$.steps[${stepIndex}].action.signatureRequestIds`,
        });

      expect(() => buildTransactions(tamperedPlan)).toThrow(rejection(index));
      expect(() => getPendingSignatureRequests(tamperedPlan)).toThrow(
        rejection(index),
      );
      expect(() => buildTransaction(plan, tampered)).toThrow(
        rejection(plan.steps.length),
      );
    },
  );

  test.each([
    {
      name: "expired deadline",
      overrides: { expiresAt: Number(now) },
      error: ExpiredDeadlineError,
    },
    {
      name: "deadline too far",
      overrides: { expiresAt: Number(now + 3_601n) },
      error: MidnightTakeDeadlineTooFarError,
    },
    {
      name: "offer in another market",
      overrides: {
        takeableOffers: [midnightApiTake({ market: midnightOtherMarket })],
      },
      error: MidnightTakeableOfferMarketMismatchError,
    },
  ] as const)(
    "error: $error.name for $name before RPC",
    async ({ overrides, error }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightTakeLend(client, { ...params, ...overrides }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: [INV-05] ChainIdMismatchError for a client on another chain before prerequisites", async () => {
    const { client, request } = createMockClient(mainnet);
    await expect(
      prepareMidnightTakeLend(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: [INV-05] ChainIdMismatchError for a transport on another chain before prerequisite reads", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) =>
      args.method === "eth_chainId" ? "0x1" : defaultRequest(args),
    );
    await expect(
      prepareMidnightTakeLend(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("behavior: a fill's nested params resolve to the market the entity flow encodes", async () => {
    const fill = midnightApiTake({ market: midnightOtherMarket });
    const market = { ...fill.offer.market, params: midnightMarket };
    const plan = await prepareMidnightTakeLend(
      clientWithState({ allowance: maxUint256, authorized: true }),
      {
        ...params,
        takeableOffers: [{ ...fill, offer: { ...fill.offer, market } }],
      },
    );
    const [step] = plan.steps;
    assert(step?.action.type === "midnightTakeLend");
    expect(step.action.inputs.takeableOffers[0]?.offer.market).toEqual(
      MarketUtils.toStruct(midnightMarket),
    );
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
  });

  test("behavior: drops bundle-reverting offers and keeps dead offers like the entity flow", async () => {
    const live = midnightApiTake();
    const selfTake = midnightApiTake({ maker: account });
    const outOfRange = midnightApiTake({ tick: MAX_TICK + 1n });
    const plan = await prepareMidnightTakeLend(
      clientWithState({ allowance: maxUint256, authorized: true }),
      { ...params, takeableOffers: [live, selfTake, outOfRange] },
    );
    const step = plan.steps.at(-1);
    assert(step?.action.type === "midnightTakeLend");
    expect(
      step.action.inputs.takeableOffers.map(({ offer }) => offer.maker),
    ).toEqual([live.offer.maker, account]);
    expect(
      step.action.inputs.takeableOffers.map(({ offer }) => offer.tick),
    ).toEqual([live.offer.tick, selfTake.offer.tick]);
  });

  test.each([
    {
      name: "only self-made offers",
      overrides: { takeableOffers: [midnightApiTake({ maker: account })] },
      error: MidnightTakeableOffersNotFillableError,
    },
    {
      name: "a continuous fee cap below the market fee",
      overrides: { marketData: lendMarketData(midnightMarket, 18) },
      error: MidnightContinuousFeeAboveMaxError,
    },
  ] as const)(
    "error: $error.name for $name before RPC",
    async ({ overrides, error }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightTakeLend(client, { ...params, ...overrides }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: InvalidBigIntInputError for a numeric now before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightTakeLend(client, {
        ...params,
        now: 1_000 as unknown as bigint,
      }),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: InvalidTransactionPlanError for a mistyped units target before RPC", async () => {
    const { client, request } = createMockClient(base);
    const target = {
      type: "unit",
      units: 100n,
      maxBuyerAssets: 100n,
    } as unknown as MidnightTakeLendPlanParams["target"];
    await expect(
      prepareMidnightTakeLend(client, { ...params, target }),
    ).rejects.toMatchObject({
      constructor: InvalidTransactionPlanError,
      path: "$.target.type",
      reason: "expected assets or units",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: MidnightCalldataEncodingError for a malformed offer field before RPC", async () => {
    const { client, request } = createMockClient(base);
    const fill = midnightApiTake();
    await expect(
      prepareMidnightTakeLend(client, {
        ...params,
        takeableOffers: [{ ...fill, offer: { ...fill.offer, group: "0x01" } }],
      }),
    ).rejects.toMatchObject({
      constructor: MidnightCalldataEncodingError,
      input: "takeableOffers[0].offer.group",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: MissingContractCodeError for missing bundle code before reading prerequisites", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode" && args.params?.[0] === spender) {
        return "0x";
      }
      return defaultRequest(args);
    });
    const preparation = prepareMidnightTakeLend(client, params);
    await expect(preparation).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(preparation).rejects.toMatchObject({
      address: spender,
      role: "midnightBundlesV2",
    });
    const methods = request.mock.calls.map(([args]) => args.method);
    expect(methods).not.toContain("eth_call");
    expect(methods.filter((method) => method === "eth_chainId")).toHaveLength(
      1,
    );
  });

  test.each([
    {
      field: "maxContinuousFee",
      error: InvalidBigIntInputError,
      overrides: { maxContinuousFee: 17 },
    },
    {
      field: "target.assets",
      error: InvalidBigIntInputError,
      overrides: { target: { type: "assets", assets: 100, minUnits: 100n } },
    },
    {
      field: "target.minUnits",
      error: InvalidBigIntInputError,
      overrides: { target: { type: "assets", assets: 100n, minUnits: 100 } },
    },
    {
      field: "target.units",
      error: InvalidBigIntInputError,
      overrides: {
        target: { type: "units", units: 100, maxBuyerAssets: 100n },
      },
    },
    {
      field: "target.maxBuyerAssets",
      error: InvalidBigIntInputError,
      overrides: {
        target: { type: "units", units: 100n, maxBuyerAssets: 100 },
      },
    },
    {
      field: "takeableOffers[0].offer.maxUnits",
      error: MidnightCalldataEncodingError,
      overrides: {
        takeableOffers: [
          {
            ...midnightApiTake(),
            offer: { ...midnightApiTake().offer, maxUnits: 1_000 },
          },
        ],
      },
    },
  ])(
    "error: $error.name for a numeric $field before RPC",
    async ({ field, overrides, error }) => {
      const { client, request } = createMockClient(base);
      const preparation = prepareMidnightTakeLend(client, {
        ...params,
        ...overrides,
      } as unknown as MidnightTakeLendPlanParams);
      await expect(preparation).rejects.toMatchObject(
        error === InvalidBigIntInputError
          ? { constructor: error, field }
          : { constructor: error, input: field },
      );
      expect(request).not.toHaveBeenCalled();
    },
  );

  test.each([
    params.target,
    { type: "units", units: 100n, maxBuyerAssets: 100n },
  ] as const)(
    "behavior: the $type plan drops cyclic quote and target metadata without changing bytes",
    async (target) => {
      const client = clientWithState({
        allowance: maxUint256,
        authorized: true,
      });
      const metadata: { self?: unknown } = {};
      metadata.self = metadata;
      const { offer, ...fill } = midnightApiTake();
      const withMetadata = (market: typeof offer.market) => ({
        ...market,
        metadata,
        collateralParams: market.collateralParams.map((entry) => ({
          ...entry,
          metadata,
        })),
      });
      const clean = await prepareMidnightTakeLend(client, {
        ...params,
        target,
      });
      const enriched = {
        ...params,
        marketData: Object.assign(lendMarketData(), { metadata }),
        target: { ...target, metadata },
        takeableOffers: [
          {
            ...fill,
            offer: { ...offer, metadata, market: withMetadata(offer.market) },
          },
        ],
      };
      const plan = await prepareMidnightTakeLend(client, enriched);

      expect(plan).toEqual(clean);
      expect(serializeTransactionPlan(plan)).toBe(
        serializeTransactionPlan(clean),
      );
      expect(buildTransactions(plan)).toEqual(buildTransactions(clean));
    },
  );

  test("behavior: unknown stored fields cannot change built calldata", async () => {
    const plan = await prepareMidnightTakeLend(
      clientWithState({ allowance: maxUint256, authorized: true }),
      params,
    );
    const [step] = plan.steps;
    assert(step?.action.type === "midnightTakeLend");
    const { inputs } = step.action;
    const metadata = { timestamp: true };
    const shadowMarket = { ...inputs.market, loanToken: wNative };
    const tampered = {
      ...plan,
      steps: [
        {
          ...step,
          action: {
            ...step.action,
            inputs: {
              ...inputs,
              metadata,
              market: { ...inputs.market, params: shadowMarket },
              takeableOffers: inputs.takeableOffers.map((fill) => ({
                ...fill,
                offer: {
                  ...fill.offer,
                  market: { ...fill.offer.market, params: shadowMarket },
                },
              })),
            },
          },
        },
      ],
    };
    const restored = parseTransactionPlan(serializeTransactionPlan(tampered));
    expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
  });

  test.each(["maxUnits", "maxAssets"] as const)(
    "error: InvalidTransactionPlanError for a stored offer %s above uint128",
    async (field) => {
      const plan = await prepareMidnightTakeLend(
        clientWithState({ allowance: maxUint256, authorized: true }),
        params,
      );
      const serialized = serializeTransactionPlan(plan).replace(
        new RegExp(`"${field}":\\{"\\$bigint":"[0-9]+"\\}`),
        () => `"${field}":{"$bigint":"${2n ** 128n}"}`,
      );
      expect(() => parseTransactionPlan(serialized)).toThrow(
        expect.objectContaining({
          constructor: InvalidTransactionPlanError,
          path: `$.steps[0].action.inputs.takeableOffers[0].offer.${field}`,
        }),
      );
    },
  );

  test("error: InvalidTransactionPlanError for restoring malformed fill fields or mismatched prerequisite context", async () => {
    const plan = await prepareMidnightTakeLend(
      clientWithState({ allowance: 0n, authorized: false }),
      params,
    );
    const serialized = serializeTransactionPlan(plan);
    for (const tampered of [
      serialized.replace('"buy":false', '"buy":"false"'),
      serialized.replace('"ratifierData":"0x1234"', '"ratifierData":"0x123"'),
      serialized.replace('"type":"assets"', '"type":"shares"'),
      serialized.replace('"inputs":{"chainId":8453', '"inputs":{"chainId":1'),
      serialized.replace(
        '"account":"0x000000000000000000000000000000000000A000","market"',
        '"account":"0x0000000000000000000000000000000000009000","market"',
      ),
    ]) {
      expect(tampered).not.toBe(serialized);
      expect(() => parseTransactionPlan(tampered)).toThrow(
        InvalidTransactionPlanError,
      );
    }
  });

  test.each([1_599n, 1_601n, 2n ** 128n])(
    "error: restore throws InvalidTransactionPlanError for a stored deadline of %s that differs from expiresAt",
    async (deadline) => {
      const plan = await prepareMidnightTakeLend(
        clientWithState({ allowance: maxUint256, authorized: true }),
        params,
      );
      const [step] = plan.steps;
      assert(step?.action.type === "midnightTakeLend");
      const serialized = serializeTransactionPlan({
        ...plan,
        steps: [
          {
            ...step,
            action: {
              ...step.action,
              inputs: { ...step.action.inputs, deadline },
            },
          },
        ],
      });
      expect(() => parseTransactionPlan(serialized)).toThrow(
        expect.objectContaining({
          constructor: InvalidTransactionPlanError,
          path: "$.steps[0].action.inputs.deadline",
          reason:
            deadline < 1_600n
              ? "expected a deadline no earlier than expiresAt"
              : "expected the plan expiresAt",
        }),
      );
    },
  );

  test.each([1_599n, 1_601n, 2n ** 128n])(
    "error: build functions throw InvalidTransactionPlanError for a deadline of %s that differs from expiresAt",
    async (deadline) => {
      const plan = await prepareMidnightTakeLend(
        clientWithState({ allowance: maxUint256, authorized: true }),
        params,
      );
      const [step] = plan.steps;
      assert(step?.action.type === "midnightTakeLend");
      const tampered = {
        ...step,
        action: {
          ...step.action,
          inputs: { ...step.action.inputs, deadline },
        },
      };
      const error = expect.objectContaining({
        constructor: InvalidTransactionPlanError,
        path: "$.steps[0].action.inputs.deadline",
      });
      expect(() => buildTransactions({ ...plan, steps: [tampered] })).toThrow(
        error,
      );
      expect(() =>
        buildTransaction({ ...plan, steps: [tampered] }, tampered),
      ).toThrow(error);
      expect(() =>
        buildTransaction(plan, { ...tampered, id: "separate" }),
      ).toThrow(error);
    },
  );

  test("error: InvalidTransactionPlanError on a directly built step with an unknown target type", async () => {
    const plan = await prepareMidnightTakeLend(
      clientWithState({ allowance: maxUint256, authorized: true }),
      params,
    );
    const [step] = plan.steps;
    assert(step?.action.type === "midnightTakeLend");
    const edited = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          target: { type: "shares", units: 100n, maxBuyerAssets: 100n },
        },
      },
    } as unknown as typeof step;
    const editedPlan = { ...plan, steps: [edited] };
    expect(() =>
      parseTransactionPlan(serializeTransactionPlan(editedPlan)),
    ).toThrow(InvalidTransactionPlanError);
    const expected = expect.objectContaining({
      constructor: InvalidTransactionPlanError,
      path: "$.inputs.target.type",
    });
    expect(() => buildTransactions(editedPlan)).toThrow(expected);
    expect(() => buildTransaction(editedPlan, edited)).toThrow(expected);
  });

  test("error: InvalidTransactionPlanError for a different chain in either stored market tuple", async () => {
    const plan = await prepareMidnightTakeLend(
      clientWithState({ allowance: maxUint256, authorized: true }),
      params,
    );
    const [step] = plan.steps;
    assert(step?.action.type === "midnightTakeLend");
    const { inputs } = step.action;
    const otherChainId = BigInt(mainnet.id);
    for (const [path, overrides] of [
      ["market", { market: { ...inputs.market, chainId: otherChainId } }],
      [
        "takeableOffers[0].offer.market",
        {
          takeableOffers: inputs.takeableOffers.map((fill) => ({
            ...fill,
            offer: {
              ...fill.offer,
              market: { ...fill.offer.market, chainId: otherChainId },
            },
          })),
        },
      ],
    ] as const) {
      const serialized = serializeTransactionPlan({
        ...plan,
        steps: [
          {
            ...step,
            action: { ...step.action, inputs: { ...inputs, ...overrides } },
          },
        ],
      });
      expect(() => parseTransactionPlan(serialized)).toThrow(
        expect.objectContaining({
          constructor: InvalidTransactionPlanError,
          path: `$.steps[0].action.inputs.${path}.chainId`,
        }),
      );
    }
  });
});
