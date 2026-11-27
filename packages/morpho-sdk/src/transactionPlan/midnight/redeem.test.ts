import {
  AccrualPosition,
  type IAccrualPosition,
  InvalidMarketParameterError,
  Market,
  MarketUtils,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import {
  decodeFunctionData,
  maxUint128,
  numberToHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { base, mainnet } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import {
  AccrualPositionUserMismatchError,
  applySignatures,
  buildTransactions,
  ChainIdMismatchError,
  getPendingSignatureRequests,
  InputExceedsMaxError,
  InsufficientMidnightWithdrawableLiquidityError,
  InvalidBigIntInputError,
  InvalidTransactionPlanError,
  MidnightContractReceiverError,
  MidnightRedeemExceedsCreditError,
  MidnightZeroReceiverError,
  MissingContractCodeError,
  NoMidnightCreditToRedeemError,
  NonPositiveInputError,
  parseTransactionPlan,
  prepareMidnightRedeem,
  serializeTransactionPlan,
  type TransactionPlan,
} from "../../index.js";

const account = "0x0000000000000000000000000000000000001000";
const receiver = "0x0000000000000000000000000000000000001001";
const { client } = createMockClient(base);
const midnight = getChainAddress(base.id, "midnight");
const loanToken = getChainAddress(base.id, "usdc");

function position(
  overrides: Partial<IAccrualPosition> = {},
  withdrawable = 200n,
) {
  return new AccrualPosition(
    {
      user: account,
      credit: 250n,
      pendingFee: 50n,
      lastAccrual: 100n,
      lastLossFactor: 0n,
      debt: 0n,
      collateralBitmap: 0n,
      collateral: [],
      ...overrides,
    },
    new Market({
      params: {
        chainId: base.id,
        midnight,
        loanToken,
        collateralParams: [
          {
            token: getChainAddress(base.id, "wNative"),
            lltv: 770000000000000000n,
            liquidationCursor: 300000000000000000n,
            oracle: receiver,
          },
        ],
        maturity: 200n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      },
      totalUnits: 1_000n,
      lossFactor: 0n,
      withdrawable,
      continuousFeeCredit: 0n,
      settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
      continuousFee: 0,
      tickSpacing: 1,
    }),
  );
}

const intent = { chainId: base.id, account, now: 150n } as const;

describe("prepareMidnightRedeem", () => {
  test("default: stores fixed net credit and directs it to the owner", async () => {
    const positionData = position();
    const plan = await prepareMidnightRedeem(client, {
      ...intent,
      positionData,
    });
    expect(plan.signatureRequests).toEqual([]);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(getPendingSignatureRequests(restored)).toEqual([]);
    expect(applySignatures(restored, [])).toEqual(plan);
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));
    expect(transactions).toHaveLength(1);
    const [tx] = transactions;
    assert(tx);
    expect(tx).toMatchObject({ to: midnight, value: 0n });
    expect(decodeFunctionData({ abi: midnightAbi, data: tx.data })).toEqual({
      functionName: "withdraw",
      args: [
        MarketUtils.toStruct(positionData.market.params),
        200n,
        account,
        account,
      ],
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(positionData.market.params)).toBe(false);
  });

  test("error: rejects signature references on a stored redemption", async () => {
    const plan = await prepareMidnightRedeem(client, {
      ...intent,
      positionData: position(),
    });
    const [step] = plan.steps;
    assert(step?.action.type === "midnightRedeem");
    const action = { ...step.action, signatureRequestIds: {} };
    const stored = serializeTransactionPlan({
      ...plan,
      steps: [{ ...step, action }],
    });
    const parse = () => parseTransactionPlan(stored);
    expect(parse).toThrow(InvalidTransactionPlanError);
    expect(parse).toThrow(
      expect.objectContaining({
        path: "$.steps[0].action.signatureRequestIds",
      }),
    );
  });

  test("builds from the flat stored market even with extra market metadata", async () => {
    const plan = await prepareMidnightRedeem(client, {
      ...intent,
      positionData: position(),
    });
    const [step] = plan.steps;
    assert(step?.action.type === "midnightRedeem");
    const stored = {
      ...plan,
      steps: [
        {
          ...step,
          action: {
            ...step.action,
            inputs: {
              ...step.action.inputs,
              market: { ...step.action.inputs.market, params: {} },
            },
          },
        },
      ],
    };
    expect(
      buildTransactions(parseTransactionPlan(serializeTransactionPlan(stored))),
    ).toEqual(buildTransactions(plan));
  });

  test("error: a restored market without collaterals fails at build", async () => {
    const plan = await prepareMidnightRedeem(client, {
      ...intent,
      positionData: position(),
    });
    const [step] = plan.steps;
    assert(step?.action.type === "midnightRedeem");
    const restored = parseTransactionPlan(
      serializeTransactionPlan({
        ...plan,
        steps: [
          {
            ...step,
            action: {
              ...step.action,
              inputs: {
                ...step.action.inputs,
                market: { ...step.action.inputs.market, collateralParams: [] },
              },
            },
          },
        ],
      }),
    );
    expect(() => buildTransactions(restored)).toThrow(
      InvalidMarketParameterError,
    );
  });

  test("behavior: a spread referral fee cannot reject a redemption that never charges one", async () => {
    const plan = await prepareMidnightRedeem(client, {
      ...intent,
      positionData: position(),
      referralFee: { bps: 20_000, recipient: receiver },
    } as Parameters<typeof prepareMidnightRedeem>[1]);
    expect(plan.steps).toHaveLength(1);
  });

  test("behavior: stores specified units and receiver", async () => {
    const plan = await prepareMidnightRedeem(client, {
      ...intent,
      positionData: position(),
      units: 70n,
      receiver,
      calldataOrigin: "0x1234",
    });
    const [tx] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(tx);
    expect(tx.action).toMatchObject({
      type: "midnightRedeem",
      args: { units: 70n, receiver, onBehalf: account },
    });
    expect(tx.data.endsWith("1234")).toBe(true);
  });

  test("error: rejects an unbound owner, another owner, or a mismatched market like the entity flow", async () => {
    for (const user of [undefined, receiver] as const) {
      await expect(
        prepareMidnightRedeem(client, {
          ...intent,
          positionData: position({ user }),
        }),
      ).rejects.toBeInstanceOf(AccrualPositionUserMismatchError);
    }
    const positionData = position();
    Object.defineProperty(positionData, "marketId", { value: zeroHash });
    await expect(
      prepareMidnightRedeem(client, {
        ...intent,
        positionData,
      }),
    ).rejects.toBeInstanceOf(InvalidMarketParameterError);
  });

  test.each([
    { change: { units: 0n }, error: NonPositiveInputError },
    { change: { units: maxUint128 + 1n }, error: InputExceedsMaxError },
    { change: { units: 250n }, error: MidnightRedeemExceedsCreditError },
    {
      change: { units: 201n },
      error: InsufficientMidnightWithdrawableLiquidityError,
    },
    {
      change: { positionData: position({ credit: 50n }) },
      error: NoMidnightCreditToRedeemError,
    },
    { change: { receiver: zeroAddress }, error: MidnightZeroReceiverError },
    { change: { receiver: loanToken }, error: MidnightContractReceiverError },
    { change: { chainId: mainnet.id }, error: ChainIdMismatchError },
  ])("error: $error.name", async ({ change, error }) => {
    await expect(
      prepareMidnightRedeem(client, {
        ...intent,
        positionData: position(),
        ...change,
      }),
    ).rejects.toBeInstanceOf(error);
  });

  test.each([70, null, 1e40])(
    "error: rejects non-bigint units %s before RPC",
    async (units) => {
      const { client: unused, request } = createMockClient(base);
      await expect(
        prepareMidnightRedeem(unused, {
          ...intent,
          positionData: position(),
          units: units as unknown as bigint,
        }),
      ).rejects.toMatchObject({
        constructor: InvalidBigIntInputError,
        field: "units",
        value: units,
      });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: rejects a decimal-string now without expiresAt before RPC", async () => {
    const { client: unused, request } = createMockClient(base);
    await expect(
      prepareMidnightRedeem(unused, {
        ...intent,
        positionData: position(),
        now: "1800000000" as unknown as bigint,
      }),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
      value: "1800000000",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: [INV-05] rejects a client whose RPC reports another chain", async () => {
    const { client: wrongRpcClient, request } = createMockClient(base);
    request.mockResolvedValue(numberToHex(mainnet.id));
    await expect(
      prepareMidnightRedeem(wrongRpcClient, {
        ...intent,
        positionData: position(),
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([rpc]) => rpc.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("error: rejects missing Midnight core code", async () => {
    const { client: codeless, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode" && args.params?.[0] === midnight) {
        return "0x";
      }
      return defaultRequest(args);
    });
    const preparation = prepareMidnightRedeem(codeless, {
      ...intent,
      positionData: position(),
    });
    await expect(preparation).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(preparation).rejects.toMatchObject({
      address: midnight,
      role: "midnight",
    });
    expect(
      request.mock.calls.filter(([rpc]) => rpc.method === "eth_chainId"),
    ).toHaveLength(1);
  });

  test.each([
    { inputs: { units: "200" }, field: "units" },
    { inputs: { units: maxUint128 + 1n }, field: "units" },
    { inputs: { account: receiver }, field: "account" },
    { inputs: { receiver: "0x01" }, field: "receiver" },
    { market: { chainId: 1n }, field: "market.chainId" },
    {
      market: { collateralParams: [{ token: "broken" }] },
      field: "market.collateralParams[0].token",
    },
  ])("rejects malformed stored $field", async ({ inputs, market, field }) => {
    const plan = await prepareMidnightRedeem(client, {
      ...intent,
      positionData: position(),
    });
    const [step] = plan.steps;
    assert(step);
    if (step.action.type !== "midnightRedeem") {
      throw new Error("Expected a Midnight redemption");
    }
    const malformed = {
      ...plan,
      steps: [
        {
          ...step,
          action: {
            ...step.action,
            inputs: {
              ...step.action.inputs,
              ...inputs,
              market: { ...step.action.inputs.market, ...market },
            },
          },
        },
      ],
    } as TransactionPlan;
    const restore = () =>
      parseTransactionPlan(serializeTransactionPlan(malformed));
    expect(restore).toThrow(InvalidTransactionPlanError);
    expect(restore).toThrow(
      expect.objectContaining({
        path: `$.steps[0].action.inputs.${field}`,
      }),
    );
  });
});
