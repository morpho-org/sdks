import {
  AccrualPosition,
  Market,
  MarketParams,
  ORACLE_PRICE_SCALE,
  Token,
} from "@morpho-org/blue-sdk";
import { blueAbi, getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { assert, expect, test } from "vitest";
import { CbbtcUsdcBlue, WstethWethBlue } from "../../../test/fixtures/blue.js";
import { blueRepayWithdrawCollateral } from "../../actions/blue/repayWithdrawCollateral.js";
import { DEFAULT_LLTV_BUFFER } from "../../helpers/constant.js";
import {
  ChainIdMismatchError,
  MissingContractCodeError,
  MutuallyExclusiveRepayAmountsError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
  WithdrawMakesPositionUnhealthyError,
} from "../../types/index.js";
import {
  BlueSnapshotStateMismatchError,
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import {
  applySignatures,
  buildTransaction,
  buildTransactions,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  type BlueRepayWithdrawCollateralPlanParams,
  prepareBlueRepayWithdrawCollateral,
} from "./repayWithdrawCollateral.js";

const owner = privateKeyToAccount(toHex(1n, { size: 32 }));
const now = 1_900_000_000n;
const market = new Market({
  params: CbbtcUsdcBlue,
  totalSupplyAssets: 1_000_000n,
  totalSupplyShares: 1_000_000n,
  totalBorrowAssets: 100_000n,
  totalBorrowShares: 100_000n,
  lastUpdate: now,
  fee: 0n,
  rateAtTarget: 0n,
  price: ORACLE_PRICE_SCALE,
});
const position = new AccrualPosition(
  {
    user: owner.address,
    supplyShares: 0n,
    borrowShares: 1000n,
    collateral: 100_000n,
  },
  market,
);
const params = {
  chainId: 1,
  account: owner.address,
  now,
  expiresAt: Number(now + 3600n),
  marketId: market.id,
  marketData: { chainId: 1, market },
  positionData: { chainId: 1, position },
  repayAssets: 10n,
  collateralAssets: 1n,
} as const;

const nativeMarket = new Market({ ...market, params: WstethWethBlue });
const nativeParams = {
  ...params,
  collateralAssets: 0n,
  funding: { type: "native" as const },
  marketId: nativeMarket.id,
  marketData: { chainId: 1, market: nativeMarket },
  positionData: {
    chainId: 1,
    position: new AccrualPosition(position, nativeMarket),
  },
};

test("behavior: exact repayment without withdrawal does not project an unsupported IRM", async () => {
  const unsupportedMarket = new Market({
    ...nativeMarket,
    params: new MarketParams({ ...nativeMarket.params, irm: owner.address }),
    rateAtTarget: undefined,
  });
  const plan = await prepareBlueRepayWithdrawCollateral(
    createMockClient(mainnet).client,
    {
      ...nativeParams,
      marketId: unsupportedMarket.id,
      marketData: { chainId: 1, market: unsupportedMarket },
      positionData: {
        chainId: 1,
        position: new AccrualPosition(position, unsupportedMarket),
      },
    },
  );
  expect(buildTransactions(plan)).toMatchObject([
    { value: params.repayAssets },
  ]);
});

test("behavior: native funding without prerequisites still checks both write targets", async () => {
  const handle = createMockClient(mainnet);
  const plan = await prepareBlueRepayWithdrawCollateral(
    handle.client,
    nativeParams,
  );
  expect(plan.steps).toHaveLength(1);
  expect(plan.signatureRequests).toEqual([]);
  expect(handle.request.mock.calls.map(([call]) => call)).toEqual([
    {
      method: "eth_getCode",
      params: [getChainAddress(1, "bundles.blueBundlesV1"), "latest"],
    },
    { method: "eth_getCode", params: [getChainAddress(1, "blue"), "latest"] },
    { method: "eth_chainId" },
  ]);
});

test("error: ChainIdMismatchError with deployed targets and native-only funding", async () => {
  const handle = createMockClient(mainnet);
  const dispatch = handle.request.getMockImplementation();
  assert(dispatch);
  handle.request.mockImplementation(async (call) => {
    if (call.method === "eth_chainId") {
      return "0x2105";
    }
    return dispatch(call);
  });
  await expect(
    prepareBlueRepayWithdrawCollateral(handle.client, nativeParams),
  ).rejects.toBeInstanceOf(ChainIdMismatchError);
  expect(
    handle.request.mock.calls.filter(([call]) => call.method === "eth_getCode"),
  ).toHaveLength(2);
});

test("behavior: native funding derives the share repayment cap and referral fee", async () => {
  const plan = await prepareBlueRepayWithdrawCollateral(
    createMockClient(mainnet).client,
    {
      ...nativeParams,
      repayAssets: undefined,
      repayShares: maxUint256,
      referralFee: { bps: 1000, recipient: owner.address },
    },
  );
  const action = plan.steps[0]?.action;
  assert(action?.type === "blueRepayWithdrawCollateral");
  expect(action.inputs.maxRepayAssets).toBeGreaterThan(position.borrowAssets);
  expect(action.inputs.nativeAssets).toBe(action.inputs.maxRepayAssets);
  expect(action.inputs).not.toHaveProperty("nativeAmount");
  expect(buildTransactions(plan)[0]?.value).toBe(action.inputs.maxRepayAssets);
  expect(plan.signatureRequests).toEqual([]);
});

test("error: NativeAmountOnNonWNativeAssetError for native funding of a non-wNative loan", async () => {
  await expect(
    prepareBlueRepayWithdrawCollateral(createMockClient(mainnet).client, {
      ...params,
      funding: { type: "native" },
    }),
  ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeAssetError);
});

test.each(["bundles.blueBundlesV1", "blue"] as const)(
  "error: MissingContractCodeError for undeployed %s with native funding",
  async (role) => {
    const handle = createMockClient(mainnet);
    const dispatch = handle.request.getMockImplementation();
    assert(dispatch);
    const address = getChainAddress(1, role);
    handle.request.mockImplementation(async (call) => {
      if (call.method === "eth_getCode" && call.params?.[0] === address) {
        return "0x";
      }
      return dispatch(call);
    });
    await expect(
      prepareBlueRepayWithdrawCollateral(handle.client, nativeParams),
    ).rejects.toEqual(new MissingContractCodeError(address, 1, role));
  },
);

function client(authorized = true, allowance = maxUint256) {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: CbbtcUsdcBlue.loanToken,
    abi: erc20Abi,
    functionName: "allowance",
    result: allowance,
  });
  mockRead(handle, {
    address: getChainAddress(1, "blue"),
    abi: blueAbi,
    functionName: "isAuthorized",
    result: authorized,
  });
  mockRead(handle, {
    address: getChainAddress(1, "blue"),
    abi: blueAbi,
    functionName: "nonce",
    result: 0n,
  });
  return handle.client;
}

test("behavior: differently-cased market ID permits a collateral withdrawal", async () => {
  const marketId = `0x${market.id.slice(2).toUpperCase()}` as typeof market.id;
  expect(marketId).not.toBe(market.id);
  const plan = await prepareBlueRepayWithdrawCollateral(client(), {
    ...params,
    marketId,
  });
  const canonical = await prepareBlueRepayWithdrawCollateral(client(), params);
  expect(buildTransactions(plan)).toEqual(buildTransactions(canonical));
});

test("[INV-03] rejects a post-repay raw-LLTV-safe withdrawal above the buffered limit", async () => {
  const indebtedMarket = new Market({
    ...market,
    totalBorrowAssets: 100n,
    totalBorrowShares: 100_000_000n,
  });
  const indebted = new AccrualPosition(
    { ...position, collateral: 101n, borrowShares: 87_000_000n },
    indebtedMarket,
  );
  expect(indebted.borrowAssets).toBe(87n);
  expect((100n * market.params.lltv) / 10n ** 18n).toBe(86n);
  expect((100n * (market.params.lltv - DEFAULT_LLTV_BUFFER)) / 10n ** 18n).toBe(
    85n,
  );
  await expect(
    prepareBlueRepayWithdrawCollateral(client(), {
      ...params,
      repayAssets: 1n,
      collateralAssets: 1n,
      marketData: { chainId: 1, market: indebtedMarket },
      positionData: { chainId: 1, position: indebted },
    }),
  ).rejects.toBeInstanceOf(WithdrawMakesPositionUnhealthyError);
});

test("[INV-03] repays debt before checking collateral withdrawal health", async () => {
  const indebtedMarket = new Market({
    ...market,
    totalBorrowAssets: 100n,
    totalBorrowShares: 100_000_000n,
  });
  const indebted = new AccrualPosition(
    { ...position, collateral: 101n, borrowShares: 87_000_000n },
    indebtedMarket,
  );
  const withdrawal = {
    ...params,
    collateralAssets: 1n,
    marketData: { chainId: 1, market: indebtedMarket },
    positionData: { chainId: 1, position: indebted },
  };
  const plan = await prepareBlueRepayWithdrawCollateral(client(), {
    ...withdrawal,
    repayAssets: 2n,
  });
  const action = plan.steps[0]?.action;
  assert(action?.type === "blueRepayWithdrawCollateral");
  expect(action.inputs.repayAssets).toBe(2n);
  expect(action.inputs.collateralAssets).toBe(1n);
  await expect(
    prepareBlueRepayWithdrawCollateral(client(), {
      ...withdrawal,
      repayAssets: 0n,
    }),
  ).rejects.toBeInstanceOf(WithdrawMakesPositionUnhealthyError);
});

test("default: cross-client preparation and stored round trip match the pure encoder", async () => {
  const plan = await prepareBlueRepayWithdrawCollateral(client(), params);
  expect(plan.signatureRequests).toEqual([]);
  expect(plan.steps).toHaveLength(1);
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  const expected = blueRepayWithdrawCollateral({
    market: { chainId: 1, marketParams: CbbtcUsdcBlue },
    args: {
      userAddress: owner.address,
      repayAssets: params.repayAssets,
      repayShares: 0n,
      maxRepayAssets: params.repayAssets,
      collateralAssets: params.collateralAssets,
      maxLtv: CbbtcUsdcBlue.lltv - DEFAULT_LLTV_BUFFER,
      deadline: BigInt(plan.expiresAt),
    },
  });
  expect(buildTransactions(restored)).toEqual([expected]);
  expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
});

test("behavior: accepts an uppercase market ID when withdrawing collateral", async () => {
  const marketId =
    `0x${params.marketId.slice(2).toUpperCase()}` as typeof params.marketId;
  const plan = await prepareBlueRepayWithdrawCollateral(client(), {
    ...params,
    marketId,
  });
  expect(plan).toEqual(
    await prepareBlueRepayWithdrawCollateral(client(), params),
  );
});

test("behavior: direct approval and authorization are independent prerequisites", async () => {
  const plan = await prepareBlueRepayWithdrawCollateral(
    client(false, 0n),
    params,
  );
  expect(plan.steps.map((step) => step.action.type)).toEqual([
    "erc20Approval",
    "morphoAuthorization",
    "blueRepayWithdrawCollateral",
  ]);
  expect(plan.signatureRequests).toEqual([]);
  expect(
    buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan))),
  ).toHaveLength(3);
});

test("behavior: a separately read market snapshot with the same state quotes like the entity", async () => {
  const { repayAssets: _repayAssets, ...shareParams } = params;
  const plan = await prepareBlueRepayWithdrawCollateral(client(), {
    ...shareParams,
    repayShares: 100n,
    marketData: { chainId: 1, market: new Market({ ...market }) },
  });
  expect(buildTransactions(plan)).toEqual([
    blueRepayWithdrawCollateral({
      market: { chainId: 1, marketParams: CbbtcUsdcBlue },
      args: {
        userAddress: owner.address,
        repayAssets: 0n,
        repayShares: 100n,
        maxRepayAssets: market
          .accrueInterest(BigInt(plan.expiresAt))
          .toBorrowAssets(100n, "Up"),
        collateralAssets: params.collateralAssets,
        maxLtv: CbbtcUsdcBlue.lltv - DEFAULT_LLTV_BUFFER,
        deadline: BigInt(plan.expiresAt),
      },
    }),
  ]);
});

test.each([
  { field: "totalSupplyAssets", value: 2_000_000n },
  { field: "totalSupplyShares", value: 2_000_000n },
  { field: "totalBorrowAssets", value: 200_000n },
  { field: "totalBorrowShares", value: 200_000n },
  { field: "lastUpdate", value: now - 12n },
  { field: "fee", value: 1n },
  { field: "price", value: ORACLE_PRICE_SCALE / 2n },
  { field: "rateAtTarget", value: 1n },
] as const)(
  "error: BlueSnapshotStateMismatchError when the market snapshot has a different $field",
  async ({ field, value }) => {
    const staleMarket = new Market({ ...market, [field]: value });
    const error = await prepareBlueRepayWithdrawCollateral(client(), {
      ...params,
      marketData: { chainId: 1, market: staleMarket },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BlueSnapshotStateMismatchError);
    expect(error).toMatchObject({
      field,
      positionValue: market[field],
      marketValue: value,
    });
  },
);

test("error: IncompleteTransactionPlanError names a missing authorization signature", async () => {
  const plan = await prepareBlueRepayWithdrawCollateral(client(false), {
    ...params,
    supportSignature: true,
  });
  expect(plan.steps).toHaveLength(1);
  const [request] = getPendingSignatureRequests(plan);
  assert(request);
  expect(request.id).toBe("blueRepayWithdrawCollateral:morphoAuthorization");
  for (const requests of [plan.signatureRequests, []]) {
    expect(() =>
      buildTransactions({ ...plan, signatureRequests: requests }),
    ).toThrow(new IncompleteTransactionPlanError(request.id));
  }
  const signed = applySignatures(plan, [
    { id: request.id, signature: await owner.signTypedData(request.typedData) },
  ]);
  expect(
    buildTransactions(parseTransactionPlan(serializeTransactionPlan(signed))),
  ).toEqual(buildTransactions(signed));
});

test("builds an ERC-20 step restored from JSON against its original signed plan", async () => {
  const plan = await prepareBlueRepayWithdrawCollateral(client(false), {
    ...params,
    supportSignature: true,
  });
  const [request] = getPendingSignatureRequests(plan);
  assert(request);
  const signed = applySignatures(plan, [
    { id: request.id, signature: await owner.signTypedData(request.typedData) },
  ]);
  const [original] = signed.steps;
  const [restored] = parseTransactionPlan(
    serializeTransactionPlan(signed),
  ).steps;
  assert(
    original &&
      restored &&
      original.action.type === "blueRepayWithdrawCollateral",
  );
  expect(original.action.inputs).not.toHaveProperty("nativeAssets");
  expect(buildTransaction(signed, restored)).toEqual(
    buildTransaction(signed, original),
  );
});

test.each([
  {
    repayAssets: 10n,
    collateralAssets: 1n,
    label: "Repay and withdraw collateral",
  },
  { repayAssets: 10n, collateralAssets: 0n, label: "Repay Blue debt" },
  { repayAssets: 0n, collateralAssets: 1n, label: "Withdraw Blue collateral" },
])(
  "behavior: labels the plan $label",
  async ({ repayAssets, collateralAssets, label }) => {
    const plan = await prepareBlueRepayWithdrawCollateral(client(), {
      ...params,
      repayAssets,
      collateralAssets,
    });
    expect(plan.steps.at(-1)?.label).toBe(label);
  },
);

test("error: no authorization prompt without a withdrawal leg", async () => {
  const plan = await prepareBlueRepayWithdrawCollateral(client(false), {
    ...params,
    supportSignature: true,
  });
  const unused = structuredClone(plan);
  Object.assign(unused.steps.at(-1)?.action.inputs ?? {}, {
    collateralAssets: 0n,
  });
  expect(() => getPendingSignatureRequests(unused)).toThrow(
    TransactionPlanSignatureMismatchError,
  );
});

test("error: no permit prompt for a native repayment", async () => {
  const plan = await prepareBlueRepayWithdrawCollateral(client(), nativeParams);
  const action = plan.steps.at(-1)?.action;
  assert(action?.type === "blueRepayWithdrawCollateral");
  const id = "blueRepayWithdrawCollateral:tokenPermit";
  const args = {
    spender: getChainAddress(1, "bundles.blueBundlesV1"),
    amount: action.inputs.maxRepayAssets,
    deadline: action.inputs.deadline,
    nonce: 0n,
  };
  const withPermit = structuredClone(plan);
  Object.assign(withPermit.steps.at(-1)?.action ?? {}, {
    signatureRequestIds: { tokenPermit: id },
  });
  const request = {
    id,
    kind: "permit" as const,
    args,
    typedData: getPermitTypedData(
      {
        erc20: new Token({
          address: nativeMarket.params.loanToken,
          name: "WETH",
        }),
        owner: plan.account,
        allowance: args.amount,
        ...args,
      },
      1,
    ),
  };
  expect(() =>
    getPendingSignatureRequests({
      ...withPermit,
      signatureRequests: [request],
    }),
  ).toThrow(TransactionPlanSignatureMismatchError);
});

test("error: explicit native funding without repayment is rejected before RPC", async () => {
  const mock = createMockClient(mainnet);
  await expect(
    prepareBlueRepayWithdrawCollateral(mock.client, {
      ...params,
      repayAssets: 0n,
      funding: { type: "native" },
    }),
  ).rejects.toBeInstanceOf(NonPositiveInputError);
  expect(mock.request).not.toHaveBeenCalled();
});

test("error: changed authorization nonce disagrees with the prepared operation", async () => {
  const plan = await prepareBlueRepayWithdrawCollateral(client(false), {
    ...params,
    supportSignature: true,
  });
  const [request] = plan.signatureRequests;
  assert(request?.kind === "morphoAuthorization");
  const action = plan.steps[0]?.action;
  assert(action?.type === "blueRepayWithdrawCollateral");
  expect(action.inputs.authorizationNonce).toBe(request.args.nonce);
  const nonce = request.args.nonce + 1n;
  const malformed = {
    ...plan,
    signatureRequests: [
      {
        ...request,
        args: { ...request.args, nonce },
        typedData: {
          ...request.typedData,
          message: { ...request.typedData.message, nonce },
        },
      },
    ],
  };
  expect(() => getPendingSignatureRequests(malformed)).toThrow(
    TransactionPlanSignatureMismatchError,
  );
  expect(() =>
    parseTransactionPlan(serializeTransactionPlan(malformed)),
  ).toThrow(InvalidTransactionPlanError);
});

test.each([undefined, "bad", -1n, maxUint256 + 1n])(
  "error: InvalidTransactionPlanError for stored authorization nonce %o",
  async (authorizationNonce) => {
    const plan = await prepareBlueRepayWithdrawCollateral(client(false), {
      ...params,
      supportSignature: true,
    });
    const malformed = {
      ...plan,
      steps: plan.steps.map((step) => ({
        ...step,
        action: {
          ...step.action,
          inputs: { ...step.action.inputs, authorizationNonce },
        },
      })),
    };
    expect(() =>
      parseTransactionPlan(serializeTransactionPlan(malformed as typeof plan)),
    ).toThrow(InvalidTransactionPlanError);
  },
);

test.each([
  "repayAssets",
  "repayShares",
  "maxRepayAssets",
  "collateralAssets",
  "maxLtv",
  "deadline",
])("error: InvalidTransactionPlanError for malformed %s", async (field) => {
  const plan = await prepareBlueRepayWithdrawCollateral(client(), params);
  const malformed = {
    ...plan,
    steps: plan.steps.map((step) => ({
      ...step,
      action: {
        ...step.action,
        inputs: { ...step.action.inputs, [field]: "bad" },
      },
    })),
  };
  expect(() =>
    parseTransactionPlan(serializeTransactionPlan(malformed as typeof plan)),
  ).toThrow(InvalidTransactionPlanError);
});

test("error: empty operation is rejected before prerequisite reads", async () => {
  const handle = createMockClient(mainnet);
  await expect(
    prepareBlueRepayWithdrawCollateral(handle.client, {
      ...params,
      repayAssets: 0n,
      collateralAssets: 0n,
    }),
  ).rejects.toThrow();
  expect(handle.request).not.toHaveBeenCalled();
});

test("error: MutuallyExclusiveRepayAmountsError before prerequisite reads", async () => {
  const handle = createMockClient(mainnet);
  await expect(
    prepareBlueRepayWithdrawCollateral(handle.client, {
      ...params,
      repayShares: 1n,
    } as unknown as BlueRepayWithdrawCollateralPlanParams),
  ).rejects.toThrow(MutuallyExclusiveRepayAmountsError);
  expect(handle.request).not.toHaveBeenCalled();
});

test("behavior: zero repayment shares preserve a positive asset repayment", async () => {
  const expected = await prepareBlueRepayWithdrawCollateral(client(), params);
  const plan = await prepareBlueRepayWithdrawCollateral(client(), {
    ...params,
    repayShares: 0n,
  } as unknown as BlueRepayWithdrawCollateralPlanParams);
  expect(plan).toEqual(expected);
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  expect(restored).toEqual(plan);
  expect(buildTransactions(plan)).toEqual(buildTransactions(expected));
  expect(buildTransactions(restored)).toEqual(buildTransactions(expected));
});

test.each([
  { repayAssets: undefined, repayShares: -1n },
  { repayAssets: -1n, repayShares: undefined },
  { repayAssets: -1n, repayShares: 0n },
  { repayAssets: -1n, repayShares: 5n },
  { repayAssets: 5n, repayShares: -1n },
])("error: NegativeInputError for repayment amounts %o", async (amounts) => {
  const handle = createMockClient(mainnet);
  await expect(
    prepareBlueRepayWithdrawCollateral(handle.client, {
      ...params,
      ...amounts,
    } as BlueRepayWithdrawCollateralPlanParams),
  ).rejects.toThrow(NegativeInputError);
  expect(handle.request).not.toHaveBeenCalled();
});

test("error: stored mixed repayment amounts are rejected by parsing and building", async () => {
  const plan = structuredClone(
    await prepareBlueRepayWithdrawCollateral(client(), params),
  );
  const action = plan.steps[0]?.action;
  assert(action?.type === "blueRepayWithdrawCollateral");
  const mixed = {
    ...plan,
    steps: [
      {
        ...plan.steps[0],
        id: "mixed",
        label: "Mixed",
        action: {
          ...action,
          inputs: { ...action.inputs, repayShares: 1n },
        },
      },
    ],
  };
  expect(() => parseTransactionPlan(serializeTransactionPlan(mixed))).toThrow(
    InvalidTransactionPlanError,
  );
  expect(() => buildTransactions(mixed)).toThrow(
    MutuallyExclusiveRepayAmountsError,
  );
});
