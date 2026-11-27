import {
  AccrualPosition,
  MAX_TICK,
  Market,
  midnightAbi,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { decodeFunctionData, maxUint128, zeroAddress } from "viem";
import { base } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightMarket,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  AccrualPositionUserMismatchError,
  buildTransaction,
  buildTransactions,
  ChainIdMismatchError,
  EmptyMidnightTakeableOffersError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  InvalidTransactionPlanError,
  MarketIdMismatchError,
  MidnightCalldataEncodingError,
  MidnightContractReceiverError,
  MidnightOfferSideMismatchError,
  MidnightTakeableOfferMarketMismatchError,
  MidnightTakeCreditInsufficientError,
  MidnightTakeDeadlineTooFarError,
  MidnightTakeTargetUnreachableError,
  MidnightZeroReceiverError,
  MissingContractCodeError,
  parseTransactionPlan,
  prepareMidnightTakeWithdraw,
  type Step,
  serializeTransactionPlan,
} from "../../index.js";

const chainId = base.id;
const account = midnightAddresses.taker;
const receiver = midnightAddresses.maker;
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const fill = midnightApiTake({ buy: true, tick: MAX_TICK });

function inputs({ credit = 100n, withdrawable = 20n, lossFactor = 0n } = {}) {
  const marketData = new Market({
    params: midnightMarket,
    totalUnits: 100n,
    lossFactor,
    withdrawable,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    tickSpacing: 1,
  });
  const positionData = new AccrualPosition(
    {
      user: account,
      debt: 0n,
      credit,
      pendingFee: 0n,
      lastAccrual: 1_000n,
      lastLossFactor: 0n,
      collateralBitmap: 0n,
      collateral: [0n],
    },
    marketData,
  );
  return {
    chainId,
    account,
    marketData,
    positionData,
    takeableOffers: [{ ...fill, units: 40n }],
    target: { type: "assets", assets: 50n, maxUnits: 60n } as const,
    now: 1_000n,
    expiresAt: 1_600,
  };
}

function clientWithAuthorization(authorized: boolean) {
  const handle = createMockClient(base);
  mockRead(handle, {
    address: midnightMarket.midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    result: authorized,
  });
  return handle;
}

test("stored format-2 midnightTakeWithdraw builds fixed transaction bytes", () => {
  const saved = `{
    "version": 2,
    "chainId": 8453,
    "account": "0x000000000000000000000000000000000000A000",
    "expiresAt": 1600,
    "steps": [
      {
        "id": "midnightAuthorization",
        "label": "Authorize Midnight bundle",
        "action": {
          "type": "midnightAuthorization",
          "inputs": {
            "chainId": 8453,
            "account": "0x000000000000000000000000000000000000A000"
          }
        }
      },
      {
        "id": "midnightTakeWithdraw",
        "label": "Withdraw Midnight credit",
        "action": {
          "type": "midnightTakeWithdraw",
          "inputs": {
            "chainId": 8453,
            "account": "0x000000000000000000000000000000000000A000",
            "market": {
              "chainId": { "$bigint": "8453" },
              "midnight": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
              "loanToken": "0x0000000000000000000000000000000000006000",
              "collateralParams": [
                {
                  "token": "0x0000000000000000000000000000000000007000",
                  "lltv": { "$bigint": "770000000000000000" },
                  "liquidationCursor": { "$bigint": "250000000000000000" },
                  "oracle": "0x0000000000000000000000000000000000008000"
                }
              ],
              "maturity": { "$bigint": "2000" },
              "rcfThreshold": { "$bigint": "0" },
              "enterGate": "0x0000000000000000000000000000000000000000",
              "liquidatorGate": "0x0000000000000000000000000000000000000000"
            },
            "target": {
              "type": "assets",
              "assets": { "$bigint": "50" },
              "maxUnits": { "$bigint": "60" }
            },
            "receiver": "0x000000000000000000000000000000000000A000",
            "takeableOffers": [
              {
                "units": { "$bigint": "100" },
                "offer": {
                  "market": {
                    "chainId": { "$bigint": "8453" },
                    "midnight": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
                    "loanToken": "0x0000000000000000000000000000000000006000",
                    "collateralParams": [
                      {
                        "token": "0x0000000000000000000000000000000000007000",
                        "lltv": { "$bigint": "770000000000000000" },
                        "liquidationCursor": { "$bigint": "250000000000000000" },
                        "oracle": "0x0000000000000000000000000000000000008000"
                      }
                    ],
                    "maturity": { "$bigint": "2000" },
                    "rcfThreshold": { "$bigint": "0" },
                    "enterGate": "0x0000000000000000000000000000000000000000",
                    "liquidatorGate": "0x0000000000000000000000000000000000000000"
                  },
                  "buy": true,
                  "maker": "0x0000000000000000000000000000000000009000",
                  "start": { "$bigint": "0" },
                  "expiry": { "$bigint": "2100" },
                  "tick": { "$bigint": "6744" },
                  "group": "0x2f5df906f5d6199308d9e9f3f4630c2150ce1790a89071d59a9bd9d84a822d7c",
                  "callback": "0x0000000000000000000000000000000000000000",
                  "callbackData": "0x",
                  "receiverIfMakerIsSeller": "0x0000000000000000000000000000000000000000",
                  "ratifier": "0xd6e70365C8E8DDa9a4ca662C07bbE663b017755E",
                  "reduceOnly": false,
                  "maxUnits": { "$bigint": "100" },
                  "maxAssets": { "$bigint": "0" },
                  "continuousFeeCap": { "$bigint": "0" }
                },
                "ratifierData": "0x1234"
              }
            ],
            "deadline": { "$bigint": "1600" },
            "referralFeePct": { "$bigint": "0" },
            "referralFeeRecipient": "0x0000000000000000000000000000000000000000"
          }
        }
      }
    ],
    "signatureRequests": []
  }`;
  const transactions = buildTransactions(parseTransactionPlan(saved));
  expect(
    transactions.map(({ to, data, value }) => ({ to, data, value })),
  ).toMatchInlineSnapshot(`
    [
      {
        "data": "0xb78212ab0000000000000000000000000bf30b530f816a619c3f28a3b9f44c441122555d0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000a000",
        "to": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
        "value": 0n,
      },
      {
        "data": "0xca7de09c00000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000032000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000001e000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000009000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008340000000000000000000000000000000000000000000000000000000000001a582f5df906f5d6199308d9e9f3f4630c2150ce1790a89071d59a9bd9d84a822d7c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d6e70365c8e8dda9a4ca662c07bbe663b017755e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d900000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000021234000000000000000000000000000000000000000000000000000000000000",
        "to": "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
        "value": 0n,
      },
    ]
  `);
});

describe("prepareMidnightTakeWithdraw", () => {
  test("default: restores an assets-target plan with standalone authorization", async () => {
    const { client, request } = clientWithAuthorization(false);
    const params = inputs();
    const preparing = prepareMidnightTakeWithdraw(client, params);
    params.takeableOffers[0] = { ...fill, units: 1n };
    const plan = await preparing;
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored.signatureRequests).toEqual([]);
    expect(restored.steps.map(({ action }) => action.type)).toEqual([
      "midnightAuthorization",
      "midnightTakeWithdraw",
    ]);
    expect(request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_call",
    ]);
    const snapshot = serializeTransactionPlan(restored);
    expect(snapshot).not.toMatch(
      /positionData|marketData|lastAccrual|validUntil/,
    );
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));
    const [authorization, withdrawal] = transactions;
    assert(authorization && withdrawal);
    expect(
      decodeFunctionData({ abi: midnightAbi, data: authorization.data }),
    ).toEqual({
      functionName: "setIsAuthorized",
      args: [bundle, true, account],
    });
    expect(withdrawal.to).toBe(bundle);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: withdrawal.data,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
    );
    expect(decoded.args.slice(1, 6)).toEqual([50n, 60n, true, account, []]);
    expect(decoded.args[6]).toEqual([
      { units: 40n, offer: fill.offer, ratifierData: fill.ratifierData },
    ]);
    expect(request.mock.calls).toHaveLength(4);
  });

  test("behavior: a rejected bid stays out of the restored calldata", async () => {
    const { client } = clientWithAuthorization(true);
    const rejected = {
      ...fill,
      units: 40n,
      offer: { ...fill.offer, tick: MAX_TICK + 1n },
    };
    const kept = { ...fill, units: 40n };
    const plan = await prepareMidnightTakeWithdraw(client, {
      ...inputs(),
      takeableOffers: [rejected, kept],
    });
    const [withdrawal] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(withdrawal);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: withdrawal.data,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
    );
    expect(decoded.args[6]).toEqual([
      { units: 40n, offer: kept.offer, ratifierData: kept.ratifierData },
    ]);
  });

  test("behavior: restores a units-target plan for an authorized account", async () => {
    const { client } = clientWithAuthorization(true);
    const plan = await prepareMidnightTakeWithdraw(client, {
      ...inputs(),
      receiver,
      target: { type: "units", units: 50n, minSellerAssets: 49n },
    });
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored.signatureRequests).toEqual([]);
    expect(restored.steps.map(({ action }) => action.type)).toEqual([
      "midnightTakeWithdraw",
    ]);
    const [withdrawal] = buildTransactions(restored);
    assert(withdrawal);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: withdrawal.data,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
    );
    expect(decoded.args.slice(1, 6)).toEqual([50n, 49n, true, receiver, []]);
    expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
    expect(() =>
      parseTransactionPlan(
        serializeTransactionPlan(plan).replace(
          '"units":{"$bigint":"50"}',
          '"units":50',
        ),
      ),
    ).toThrow(InvalidTransactionPlanError);
  });

  test("error: build rejects an unknown stored target type as restore does", async () => {
    const { client } = clientWithAuthorization(true);
    const plan = await prepareMidnightTakeWithdraw(client, {
      ...inputs(),
      target: { type: "units", units: 50n, minSellerAssets: 49n },
    });
    const [step] = plan.steps;
    assert(step?.action.type === "midnightTakeWithdraw");
    const editedStep = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          target: {
            ...step.action.inputs.target,
            type: "shares",
            assets: 50n,
            maxUnits: 60n,
          },
        },
      },
    } as unknown as Step;
    const edited = { ...plan, steps: [editedStep] };
    expect(() =>
      parseTransactionPlan(serializeTransactionPlan(edited)),
    ).toThrow(InvalidTransactionPlanError);
    expect(() => buildTransactions(edited)).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() => buildTransaction(edited, editedStep)).toThrow(
      InvalidTransactionPlanError,
    );
  });

  test.each([
    [inputs({ credit: 40n, withdrawable: 100n }), 40n],
    [
      {
        ...inputs({ credit: 40n }),
        target: { type: "units", units: 50n, minSellerAssets: 49n } as const,
      },
      40n,
    ],
    [inputs({ credit: 45n, withdrawable: 0n }), 45n],
    [inputs({ credit: 0n }), 0n],
  ] as const)(
    "error: MidnightTakeCreditInsufficientError when credit cannot reach the target (%#)",
    async (params, credit) => {
      const { client, request } = createMockClient(base);
      const result = prepareMidnightTakeWithdraw(client, params);
      await expect(result).rejects.toBeInstanceOf(
        MidnightTakeCreditInsufficientError,
      );
      await expect(result).rejects.toMatchObject({
        credit,
        requiredUnits: 50n,
      });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: MidnightTakeTargetUnreachableError when credit covers the target but fills do not", async () => {
    const { client, request } = createMockClient(base);
    const result = prepareMidnightTakeWithdraw(
      client,
      inputs({ withdrawable: 0n }),
    );
    await expect(result).rejects.toBeInstanceOf(
      MidnightTakeTargetUnreachableError,
    );
    await expect(result).rejects.toMatchObject({
      field: "takeableOffers",
      value: 40n,
      limit: 50n,
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: rejects a withdrawal that only raw credit can cover", async () => {
    const { client, request } = clientWithAuthorization(true);
    const params = inputs({ lossFactor: (maxUint128 * 3n) / 5n });
    expect(params.positionData.credit).toBe(100n);
    expect(params.positionData.accrueInterest(params.now).credit).toBe(40n);
    const result = prepareMidnightTakeWithdraw(client, params);
    await expect(result).rejects.toBeInstanceOf(
      MidnightTakeCreditInsufficientError,
    );
    await expect(result).rejects.toMatchObject({
      credit: 40n,
      requiredUnits: 50n,
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: accrues credit from the market snapshot that caps withdrawals", async () => {
    const { client, request } = clientWithAuthorization(true);
    const params = inputs({ lossFactor: (maxUint128 * 3n) / 5n });
    const stalePosition = new AccrualPosition(
      params.positionData,
      new Market({ ...params.marketData, lossFactor: 0n }),
    );
    expect(stalePosition.accrueInterest(params.now).credit).toBe(100n);
    await expect(
      prepareMidnightTakeWithdraw(client, {
        ...params,
        positionData: stalePosition,
      }),
    ).rejects.toBeInstanceOf(MidnightTakeCreditInsufficientError);
    expect(request).not.toHaveBeenCalled();
  });

  test.each([
    [{ receiver: zeroAddress }, MidnightZeroReceiverError],
    [{ receiver: midnightMarket.loanToken }, MidnightContractReceiverError],
    [{ account: receiver }, AccrualPositionUserMismatchError],
    [{ takeableOffers: [] }, EmptyMidnightTakeableOffersError],
    [
      {
        marketData: new Market({
          ...inputs().marketData,
          params: midnightOtherMarket,
        }),
        takeableOffers: [
          midnightApiTake({ buy: true, market: midnightOtherMarket }),
        ],
      },
      MarketIdMismatchError,
    ],
    [
      {
        takeableOffers: [
          midnightApiTake({ buy: true, market: midnightOtherMarket }),
        ],
      },
      MidnightTakeableOfferMarketMismatchError,
    ],
    [
      { takeableOffers: [midnightApiTake({ buy: false })] },
      MidnightOfferSideMismatchError,
    ],
    [{ expiresAt: 1_000 }, ExpiredDeadlineError],
    [{ expiresAt: 4_601 }, MidnightTakeDeadlineTooFarError],
    [
      { referralFee: { bps: 1_001, recipient: receiver } },
      InputExceedsMaxError,
    ],
    [
      {
        takeableOffers: [{ ...fill, offer: { ...fill.offer, group: "0x01" } }],
      },
      MidnightCalldataEncodingError,
    ],
  ] as const)(
    "error: invalid input %# does not read authorization",
    async (overrides, error) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightTakeWithdraw(client, { ...inputs(), ...overrides }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test.each([
    {
      field: "target.assets",
      target: { type: "assets", assets: 50, maxUnits: 60n },
    },
    {
      field: "target.maxUnits",
      target: { type: "assets", assets: 50n, maxUnits: 60 },
    },
    {
      field: "target.units",
      target: { type: "units", units: 50, minSellerAssets: 49n },
    },
    {
      field: "target.minSellerAssets",
      target: { type: "units", units: 50n, minSellerAssets: 49 },
    },
  ])(
    "error: rejects a numeric $field before RPC",
    async ({ field, target }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightTakeWithdraw(client, {
          ...inputs(),
          target,
        } as unknown as Parameters<typeof prepareMidnightTakeWithdraw>[1]),
      ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: rejects a numeric now before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightTakeWithdraw(client, {
        ...inputs(),
        now: 1_000,
      } as unknown as Parameters<typeof prepareMidnightTakeWithdraw>[1]),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: [INV-05] an RPC serving mainnet cannot read Base prerequisites", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) =>
      args.method === "eth_chainId" ? "0x1" : defaultRequest(args),
    );
    await expect(
      prepareMidnightTakeWithdraw(client, inputs()),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test.each([bundle, midnightMarket.midnight])(
    "error: missing code at %s precedes authorization",
    async (address) => {
      const { client, request } = createMockClient(base);
      request.mockImplementation(async (call) => {
        if (call.method === "eth_chainId") {
          return "0x2105";
        }
        assert(call.method === "eth_getCode");
        return call.params?.[0] === address ? "0x" : "0x01";
      });
      await expect(
        prepareMidnightTakeWithdraw(client, inputs()),
      ).rejects.toBeInstanceOf(MissingContractCodeError);
      expect(
        request.mock.calls.filter(([call]) => call.method === "eth_chainId"),
      ).toHaveLength(1);
    },
  );
});
