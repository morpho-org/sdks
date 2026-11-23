import { AccrualPosition, Market, MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { toHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { assert, expect, test } from "vitest";
import { DEFAULT_LLTV_BUFFER } from "../../helpers/constant.js";
import {
  NonPositiveInputError,
  WithdrawMakesPositionUnhealthyError,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import { applySignatures, buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  buildBlueWithdrawCollateral,
  prepareBlueWithdrawCollateral,
} from "./withdrawCollateral.js";

const owner = privateKeyToAccount(toHex(1n, { size: 32 }));
const market = new Market({
  params: new MarketParams({
    loanToken: zeroAddress,
    collateralToken: zeroAddress,
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 800000000000000000n,
  }),
  totalSupplyAssets: 100n,
  totalSupplyShares: 100n,
  totalBorrowAssets: 50n,
  totalBorrowShares: 50n,
  lastUpdate: 100n,
  fee: 0n,
  price: 10n ** 36n,
});
const position = new AccrualPosition(
  { user: owner.address, supplyShares: 0n, borrowShares: 0n, collateral: 100n },
  market,
);
const params = {
  chainId: 1,
  account: owner.address,
  now: 100n,
  expiresAt: 200,
  marketId: market.id,
  marketData: { chainId: 1, market },
  positionData: { chainId: 1, position },
  collateralAssets: 10n,
};

function client(authorized: boolean) {
  const handle = createMockClient(mainnet);
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

test("default: already authorized withdrawal has no token prerequisites and round trips", async () => {
  const plan = await prepareBlueWithdrawCollateral(client(true), params);
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "blueWithdrawCollateral",
  ]);
  expect(plan.signatureRequests).toEqual([]);
  const withdrawal = plan.steps[0]?.action;
  assert(withdrawal?.type === "blueWithdrawCollateral");
  expect(withdrawal.inputs.maxLtv).toBe(
    market.params.lltv - DEFAULT_LLTV_BUFFER,
  );
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
  const other = await prepareBlueWithdrawCollateral(client(true), params);
  expect(buildTransactions(restored)).toEqual(buildTransactions(other));
});

test("restored withdrawal ignores an authorization outside requests", async () => {
  const plan = await prepareBlueWithdrawCollateral(client(true), params);
  const extra = structuredClone(plan);
  Object.assign(extra.steps[0]?.action.inputs ?? {}, {
    authorizationSignature: {},
  });
  expect(
    buildTransactions(parseTransactionPlan(serializeTransactionPlan(extra))),
  ).toEqual(buildTransactions(plan));
});

test("uses the validated inputs when options change during preparation", async () => {
  const mutableParams = { ...params };
  const pending = prepareBlueWithdrawCollateral(client(true), mutableParams);
  mutableParams.chainId = 8453;
  mutableParams.account = zeroAddress;
  mutableParams.collateralAssets = 101n;
  await expect(pending).resolves.toEqual(
    await prepareBlueWithdrawCollateral(client(true), params),
  );
});

test("behavior: accepts an uppercase market ID with lowercase snapshots", async () => {
  const marketId =
    `0x${params.marketId.slice(2).toUpperCase()}` as typeof params.marketId;
  const plan = await prepareBlueWithdrawCollateral(client(true), {
    ...params,
    marketId,
  });
  expect(plan).toEqual(
    await prepareBlueWithdrawCollateral(client(true), params),
  );
});

test("behavior: authorization signature survives serialization and a fresh client", async () => {
  const plan = await prepareBlueWithdrawCollateral(client(false), {
    ...params,
    supportSignature: true,
  });
  const [request] = plan.signatureRequests;
  assert(request);
  expect(request.kind).toBe("morphoAuthorization");
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "blueWithdrawCollateral",
  ]);
  expect(() => buildTransactions(plan)).toThrow(
    new IncompleteTransactionPlanError(request.id),
  );
  expect(() => buildTransactions({ ...plan, signatureRequests: [] })).toThrow(
    new IncompleteTransactionPlanError(request.id),
  );
  const signature = await owner.signTypedData(request.typedData);
  const signed = applySignatures(plan, [{ id: request.id, signature }]);
  const restored = parseTransactionPlan(serializeTransactionPlan(signed));
  const fresh = await prepareBlueWithdrawCollateral(client(false), {
    ...params,
    supportSignature: true,
  });
  expect(buildTransactions(restored)).toEqual(
    buildTransactions(applySignatures(fresh, [{ id: request.id, signature }])),
  );
});

test("error: inline authorization nonce is bound to its action", async () => {
  const plan = await prepareBlueWithdrawCollateral(client(false), {
    ...params,
    supportSignature: true,
  });
  const [request] = plan.signatureRequests;
  assert(request?.kind === "morphoAuthorization");
  const changed = {
    ...plan,
    signatureRequests: [
      { ...request, args: { ...request.args, nonce: request.args.nonce + 1n } },
    ],
  };
  expect(() => applySignatures(changed, [])).toThrow(
    TransactionPlanSignatureMismatchError,
  );
  const malformed = {
    ...plan,
    steps: plan.steps.map((step) =>
      step.action.type !== "blueWithdrawCollateral"
        ? step
        : {
            ...step,
            action: {
              ...step.action,
              inputs: { ...step.action.inputs, authorizationNonce: undefined },
            },
          },
    ),
  };
  expect(() =>
    parseTransactionPlan(serializeTransactionPlan(malformed)),
  ).toThrow(InvalidTransactionPlanError);
});

test("error: inline authorization reference requires a stored nonce", async () => {
  const plan = await prepareBlueWithdrawCollateral(client(false), {
    ...params,
    supportSignature: true,
  });
  const [request] = plan.signatureRequests;
  assert(request?.kind === "morphoAuthorization");
  expect(request.args.nonce).toBe(0n);
  const signature = await owner.signTypedData(request.typedData);
  const signed = applySignatures(plan, [{ id: request.id, signature }]);
  const malformed = {
    ...signed,
    steps: signed.steps.map((step) =>
      step.action.type !== "blueWithdrawCollateral"
        ? step
        : {
            ...step,
            action: {
              ...step.action,
              inputs: { ...step.action.inputs, authorizationNonce: undefined },
            },
          },
    ),
  };
  const action = malformed.steps[0]?.action;
  assert(action?.type === "blueWithdrawCollateral");
  const error = new TransactionPlanSignatureMismatchError(
    request.id,
    "reference",
  );
  expect(() => applySignatures(malformed, [])).toThrow(error);
  expect(() => buildTransactions(malformed)).toThrow(error);
  expect(() =>
    buildBlueWithdrawCollateral(action, malformed.signatureRequests),
  ).toThrow(error);
});

test.each([0n, -1n])(
  "error: NonPositiveInputError for %s",
  async (collateralAssets) => {
    const handle = createMockClient(mainnet);
    await expect(
      prepareBlueWithdrawCollateral(handle.client, {
        ...params,
        collateralAssets,
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);
    expect(handle.request).not.toHaveBeenCalled();
  },
);

test("allows debt-free collateral withdrawal without projecting an unsupported IRM", async () => {
  const unsupportedMarket = new Market({
    ...market,
    params: new MarketParams({ ...market.params, irm: owner.address }),
  });
  const debtFree = new AccrualPosition(position, unsupportedMarket);
  const plan = await prepareBlueWithdrawCollateral(client(true), {
    ...params,
    marketId: unsupportedMarket.id,
    marketData: { chainId: 1, market: unsupportedMarket },
    positionData: { chainId: 1, position: debtFree },
  });
  expect(buildTransactions(plan)).toHaveLength(1);
});

test("[INV-03] rejects a raw-LLTV-safe withdrawal above the buffered limit", async () => {
  const indebtedMarket = new Market({
    ...market,
    totalBorrowAssets: 100n,
    totalBorrowShares: 100_000_000n,
  });
  const indebted = new AccrualPosition(
    { ...position, collateral: 101n, borrowShares: 80_000_000n },
    indebtedMarket,
  );
  expect(indebted.borrowAssets).toBe(80n);
  expect((100n * market.params.lltv) / 10n ** 18n).toBe(80n);
  expect((100n * (market.params.lltv - DEFAULT_LLTV_BUFFER)) / 10n ** 18n).toBe(
    79n,
  );
  await expect(
    prepareBlueWithdrawCollateral(client(true), {
      ...params,
      collateralAssets: 1n,
      marketData: { chainId: 1, market: indebtedMarket },
      positionData: { chainId: 1, position: indebted },
    }),
  ).rejects.toBeInstanceOf(WithdrawMakesPositionUnhealthyError);
});

test.each([
  "collateralAssets",
  "maxLtv",
  "deadline",
  "referralFeePct",
  "referralFeeRecipient",
  "marketParams",
])("error: InvalidTransactionPlanError for malformed %s", async (field) => {
  const plan = await prepareBlueWithdrawCollateral(client(true), params);
  const malformed = {
    ...plan,
    steps: plan.steps.map((step) => ({
      ...step,
      action: {
        ...step.action,
        inputs: { ...step.action.inputs, [field]: null },
      },
    })),
  };
  expect(() =>
    parseTransactionPlan(
      JSON.stringify(malformed, (_key, value) =>
        typeof value === "bigint" ? { $bigint: String(value) } : value,
      ),
    ),
  ).toThrow(InvalidTransactionPlanError);
});
