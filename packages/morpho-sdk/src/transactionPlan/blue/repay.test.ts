import {
  AccrualPosition,
  addressesRegistry,
  Market,
  MarketParams,
  UnsupportedMarketIrmError,
} from "@morpho-org/blue-sdk";
import { erc2612Abi, erc5267Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  erc20Abi,
  getTypesForEIP712Domain,
  hashDomain,
  maxUint256,
  type TypedData,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { assert, describe, expect, expectTypeOf, test } from "vitest";
import { blueRepay } from "../../actions/blue/repay.js";
import {
  ChainIdMismatchError,
  InputExceedsMaxError,
  NativeAmountOnNonWNativeAssetError,
  NonPositiveInputError,
} from "../../types/index.js";
import {
  BlueSnapshotChainMismatchError,
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import type { Action } from "../types.js";
import { type BlueRepayPlanParams, prepareBlueRepay } from "./repay.js";

const account = privateKeyToAccount(toHex(1n, { size: 32 })).address;
const now = 100n;
const market = new Market({
  params: new MarketParams({
    loanToken: addressesRegistry[1].usdc,
    collateralToken: zeroAddress,
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 0n,
  }),
  totalSupplyAssets: 1000n,
  totalSupplyShares: 1_000_000_000n,
  totalBorrowAssets: 333n,
  totalBorrowShares: 100_000_000n,
  lastUpdate: now,
  fee: 0n,
});
const position = new AccrualPosition(
  {
    user: account,
    borrowShares: 33_333_333n,
    supplyShares: 0n,
    collateral: 1000n,
  },
  market,
);
const params: BlueRepayPlanParams = {
  chainId: 1,
  account,
  now,
  expiresAt: 200,
  marketId: market.id,
  marketData: { chainId: 1, market },
  positionData: { chainId: 1, position },
  mode: { type: "assets", amount: 10n },
};
const spender = getChainAddress(1, "bundles.blueBundlesV1");

function mockAllowance(amount = maxUint256) {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: market.params.loanToken,
    abi: erc20Abi,
    functionName: "allowance",
    result: amount,
  });
  return handle;
}

describe("prepareBlueRepay", () => {
  test("captures market parameters before RPC reads", async () => {
    const marketParams = new MarketParams(market.params);
    const marketSnapshot = new Market({ ...market, params: marketParams });
    const handle = mockAllowance();
    const dispatch = handle.request.getMockImplementation();
    assert(dispatch);
    handle.request.mockImplementation((call) => {
      if (call.method === "eth_getCode") {
        Object.assign(marketParams, { oracle: account });
      }
      return dispatch(call);
    });
    const plan = await prepareBlueRepay(handle.client, {
      ...params,
      marketData: { chainId: 1, market: marketSnapshot },
    });
    const action = plan.steps.at(-1)?.action;
    assert(action?.type === "blueRepay");
    expect(marketParams.oracle).toBe(account);
    expect(action.inputs.marketParams.oracle).toBe(zeroAddress);
  });

  test("behavior: validates position and preserves expiry from inherited getters", async () => {
    class RepayParams {
      get positionData() {
        return { ...params.positionData, chainId: 8453 };
      }
      get expiresAt() {
        return 200;
      }
    }
    const { expiresAt: _expiry, positionData: _position, ...intent } = params;
    const input = Object.assign(new RepayParams(), intent);
    const handle = mockAllowance();
    await expect(prepareBlueRepay(handle.client, input)).rejects.toBeInstanceOf(
      BlueSnapshotChainMismatchError,
    );
    expect(handle.request).not.toHaveBeenCalled();

    class ValidRepayParams extends RepayParams {
      override get positionData() {
        return params.positionData;
      }
    }
    const plan = await prepareBlueRepay(
      handle.client,
      Object.assign(new ValidRepayParams(), intent),
    );
    expect(plan.expiresAt).toBe(input.expiresAt);
  });

  test.each([
    { type: "assets", amount: 10n },
    { type: "shares", amount: 1n },
    { type: "full" },
  ] as const)(
    "behavior: $type repayment on an unsupported IRM",
    async (mode) => {
      const unknownIrm = new Market({
        ...market,
        params: new MarketParams({ ...market.params, irm: account }),
      });
      const mock = mockAllowance();
      const result = prepareBlueRepay(mock.client, {
        ...params,
        mode,
        marketId: unknownIrm.id,
        marketData: { chainId: 1, market: unknownIrm },
        positionData: {
          chainId: 1,
          position: new AccrualPosition(position, unknownIrm),
        },
      });
      if (mode.type === "assets") {
        const plan = await result;
        expect(plan.steps.at(-1)?.action.inputs).toMatchObject({
          maxRepayAssets: mode.amount,
        });
      } else {
        await expect(result).rejects.toBeInstanceOf(UnsupportedMarketIrmError);
        expect(mock.request).not.toHaveBeenCalled();
      }
    },
  );
  test("error: ChainIdMismatchError for native funding on a wrong-chain transport", async () => {
    const nativeMarket = new Market({
      ...market,
      params: new MarketParams({
        ...market.params,
        loanToken: getChainAddress(1, "wNative"),
      }),
    });
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") {
        return "0x2105";
      }
      if (method === "eth_getCode") {
        return "0x01";
      }
    });
    await expect(
      prepareBlueRepay(handle.client, {
        ...params,
        marketId: nativeMarket.id,
        marketData: { chainId: 1, market: nativeMarket },
        positionData: {
          chainId: 1,
          position: new AccrualPosition(position, nativeMarket),
        },
        funding: { type: "native" },
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });
  test("error: InputExceedsMaxError for a 100% referral fee before RPC", async () => {
    const handle = mockAllowance();
    await expect(
      prepareBlueRepay(handle.client, {
        ...params,
        referralFee: { bps: 10_000, recipient: account },
      }),
    ).rejects.toThrow(
      new InputExceedsMaxError({
        field: "referralFee.bps",
        value: 10_000n,
        max: 1_000n,
      }),
    );
    expect(handle.request).not.toHaveBeenCalled();
  });
  test.each([
    { type: "shares", amount: 20_000_001n },
    { type: "full" },
  ] as const)(
    "behavior: $type funding includes a positive referral fee",
    async (mode) => {
      const { client } = mockAllowance();
      const feeMarket = new Market({
        ...market,
        totalSupplyAssets: 1_000_000n,
        totalBorrowAssets: 333_000n,
        rateAtTarget: 1_000_000_000_000n,
      });
      const plan = await prepareBlueRepay(client, {
        ...params,
        marketData: { chainId: 1, market: feeMarket },
        positionData: {
          chainId: 1,
          position: new AccrualPosition(position, feeMarket),
        },
        mode,
        referralFee: { bps: 50, recipient: account },
      });
      const accrued = feeMarket.accrueInterest(200n);
      expect(accrued.totalBorrowAssets).toBeGreaterThan(
        feeMarket.totalBorrowAssets,
      );
      const shares = mode.type === "full" ? position.borrowShares : mode.amount;
      const numerator = shares * (accrued.totalBorrowAssets + 1n);
      const denominator = accrued.totalBorrowShares + 1_000_000n;
      const debt = (numerator + denominator - 1n) / denominator;
      const fee = (debt * 50n) / (10_000n - 50n);
      expect(fee).toBeGreaterThan(0n);
      const step = plan.steps[0];
      assert(step?.action.type === "blueRepay");
      expect(step.action.inputs.maxRepayAssets).toBe(debt + fee);
    },
  );

  test("behavior: stored repayment inputs require normalized referral fields", () => {
    type Inputs = Extract<Action, { type: "blueRepay" }>["inputs"];
    expectTypeOf<Inputs["referralFeePct"]>().toEqualTypeOf<bigint>();
    expectTypeOf<
      Inputs["referralFeeRecipient"]
    >().toEqualTypeOf<`0x${string}`>();
  });
  test("behavior: signed permit survives serialization and a fresh client builds identical calldata", async () => {
    const handle = mockAllowance(0n);
    const token = market.params.loanToken;
    mockRead(handle, {
      address: token,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 7n,
    });
    for (const [functionName, result] of [
      ["name", "USD Coin"],
      ["symbol", "USDC"],
      ["decimals", 6],
    ] as const) {
      mockRead(handle, { address: token, abi: erc20Abi, functionName, result });
    }
    const domain = {
      name: "USD Coin",
      version: "2",
      chainId: 1,
      verifyingContract: token,
    };
    mockRead(handle, {
      address: token,
      abi: erc5267Abi,
      functionName: "eip712Domain",
      result: ["0x0f", "USD Coin", "2", 1n, token, toHex(0n, { size: 32 }), []],
    });
    mockRead(handle, {
      address: token,
      abi: erc2612Abi,
      functionName: "DOMAIN_SEPARATOR",
      result: hashDomain<TypedData>({
        domain,
        types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
      }),
    });
    let plan = await prepareBlueRepay(handle.client, {
      ...params,
      supportSignature: true,
      deployless: false,
    });
    const [request] = getPendingSignatureRequests(plan);
    assert(request);
    expect(plan.steps.map(({ action }) => action.type)).toEqual(["blueRepay"]);
    expect(request.kind).toBe("permit");
    const repayStep = plan.steps[0];
    assert(repayStep?.action.type === "blueRepay");
    const wrongRolePlan = {
      ...plan,
      steps: [
        {
          ...repayStep,
          action: {
            ...repayStep.action,
            signatureRequestIds: { morphoAuthorization: request.id },
          },
        },
      ],
    } as unknown as typeof plan;
    expect(() => getPendingSignatureRequests(wrongRolePlan)).toThrow(
      TransactionPlanSignatureMismatchError,
    );
    expect(() =>
      parseTransactionPlan(serializeTransactionPlan(wrongRolePlan)),
    ).toThrow(InvalidTransactionPlanError);
    expect(() => buildTransactions(plan)).toThrow(
      IncompleteTransactionPlanError,
    );
    try {
      buildTransactions(plan);
    } catch (error) {
      assert(error instanceof IncompleteTransactionPlanError);
      expect(error.id).toBe(request.id);
    }
    const owner = privateKeyToAccount(toHex(1n, { size: 32 }));
    plan = applySignatures(plan, [
      {
        id: request.id,
        signature: await owner.signTypedData(request.typedData),
      },
    ]);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
    const second = mockAllowance();
    const fresh = await prepareBlueRepay(second.client, params);
    const freshStep = fresh.steps[0];
    const signedStep = restored.steps[0];
    assert(
      freshStep?.action.type === "blueRepay" &&
        signedStep?.action.type === "blueRepay",
    );
    expect(freshStep.action.inputs).toEqual(signedStep.action.inputs);
    expect(
      buildTransactions({
        ...restored,
        steps: [
          {
            ...freshStep,
            action: {
              ...freshStep.action,
              signatureRequestIds: signedStep.action.signatureRequestIds,
            },
          },
        ],
      }),
    ).toEqual(buildTransactions(plan));
  });
  test.each([
    { type: "assets", amount: 10n },
    { type: "shares", amount: 100_001n },
    { type: "full" },
  ] as const)(
    "default: $type matches the pure encoder and survives serialization across clients",
    async (mode) => {
      const first = mockAllowance();
      const plan = await prepareBlueRepay(first.client, { ...params, mode });
      expect(plan.steps.map(({ action }) => action.type)).toEqual([
        "blueRepay",
      ]);
      expect(plan.signatureRequests).toEqual([]);
      const restored = parseTransactionPlan(serializeTransactionPlan(plan));
      const [tx] = buildTransactions(restored);
      assert(tx);
      expect(buildTransactions(plan)).toEqual([tx]);
      const repayAssets = mode.type === "assets" ? mode.amount : 0n;
      const repayShares =
        mode.type === "assets"
          ? 0n
          : mode.type === "full"
            ? maxUint256
            : mode.amount;
      const expected = blueRepay({
        market: { chainId: 1, marketParams: market.params },
        args: {
          userAddress: account,
          repayAssets,
          repayShares,
          maxRepayAssets:
            mode.type === "assets"
              ? mode.amount
              : market.toBorrowAssets(
                  mode.type === "full" ? position.borrowShares : mode.amount,
                  "Up",
                ),
          deadline: 200n,
        },
      });
      expect(tx).toEqual(expected);
      if (mode.type === "full") {
        expect(tx.action.args).toMatchObject({
          repayShares: maxUint256,
          maxRepayAssets: market.toBorrowAssets(position.borrowShares, "Up"),
        });
      }
    },
  );

  test("behavior: insufficient allowance requests direct infinite approval, never Permit2", async () => {
    const { client } = mockAllowance(0n);
    const plan = await prepareBlueRepay(client, params);
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps[0]?.action).toEqual({
      type: "erc20Approval",
      inputs: {
        chainId: 1,
        account,
        token: market.params.loanToken,
        spender,
        assets: maxUint256,
      },
    });
    expect(buildTransactions(plan)).toHaveLength(2);
  });

  test("error: IncompleteTransactionPlanError names the missing permit", async () => {
    const { client } = mockAllowance();
    const plan = await prepareBlueRepay(client, params);
    const step = plan.steps[0];
    assert(step?.action.type === "blueRepay");
    const action = {
      ...step.action,
      signatureRequestIds: { tokenPermit: "repay:missing" },
    };
    const incomplete = { ...plan, steps: [{ ...step, action }] };
    expect(() => buildTransactions(incomplete)).toThrow(
      IncompleteTransactionPlanError,
    );
    try {
      buildTransactions(incomplete);
    } catch (error) {
      assert(error instanceof IncompleteTransactionPlanError);
      expect(error.id).toBe("repay:missing");
    }
  });

  test.each([0n, -1n])(
    "error: NonPositiveInputError for amount %s before RPC",
    async (amount) => {
      const handle = mockAllowance();
      await expect(
        prepareBlueRepay(handle.client, {
          ...params,
          mode: { type: "assets", amount },
        }),
      ).rejects.toBeInstanceOf(NonPositiveInputError);
      expect(handle.request).not.toHaveBeenCalled();
    },
  );

  test("error: empty full repay", async () => {
    const handle = mockAllowance();
    const empty = new AccrualPosition(
      { ...position, borrowShares: 0n },
      market,
    );
    await expect(
      prepareBlueRepay(handle.client, {
        ...params,
        positionData: { chainId: 1, position: empty },
        mode: { type: "full" },
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("error: InputExceedsMaxError for share quote beyond two hours", async () => {
    const handle = mockAllowance();
    await expect(
      prepareBlueRepay(handle.client, {
        ...params,
        expiresAt: Number(now + 7201n),
        mode: { type: "full" },
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("error: native funding rejects non-wNative before RPC", async () => {
    const handle = mockAllowance();
    await expect(
      prepareBlueRepay(handle.client, {
        ...params,
        funding: { type: "native" },
      }),
    ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeAssetError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test.each([
    "repayAssets",
    "repayShares",
    "maxRepayAssets",
    "deadline",
    "marketParams",
    "signatureRequestIds",
  ])(
    "error: InvalidTransactionPlanError rejects malformed %s",
    async (field) => {
      const { client } = mockAllowance();
      const plan = await prepareBlueRepay(client, params);
      const step = plan.steps[0];
      assert(step);
      const malformed =
        field === "signatureRequestIds"
          ? { ...step.action, signatureRequestIds: null }
          : {
              ...step.action,
              inputs: { ...step.action.inputs, [field]: "bad" },
            };
      expect(() =>
        parseTransactionPlan(
          serializeTransactionPlan({
            ...plan,
            steps: [{ ...step, action: malformed }],
          } as typeof plan),
        ),
      ).toThrow(InvalidTransactionPlanError);
    },
  );
});
