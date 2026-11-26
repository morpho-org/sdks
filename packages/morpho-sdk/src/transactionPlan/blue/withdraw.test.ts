import {
  AccrualPosition,
  addressesRegistry,
  Market,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { toHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { assert, expect, test } from "vitest";
import { blueWithdraw } from "../../actions/blue/withdraw.js";
import {
  InputExceedsMaxError,
  InvalidReallocationSourceTypeError,
  InvalidVaultV2BlueReallocationShapeError,
  MissingAccrualPositionError,
  MissingContractCodeError,
  NonPositiveInputError,
  type VaultV2BlueReallocation,
  WithdrawExceedsSupplyError,
  WithdrawSharesExceedSupplyError,
} from "../../types/index.js";
import {
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
import { prepareBlueWithdraw } from "./withdraw.js";

const owner = privateKeyToAccount(toHex(1n, { size: 32 }));
const market = new Market({
  params: MarketParams.idle(addressesRegistry[1].usdc),
  totalSupplyAssets: 100n,
  totalSupplyShares: 100_000_000n,
  totalBorrowAssets: 0n,
  totalBorrowShares: 0n,
  lastUpdate: 100n,
  fee: 0n,
});
const position = new AccrualPosition(
  {
    user: owner.address,
    supplyShares: 10_000_000n,
    borrowShares: 0n,
    collateral: 0n,
  },
  market,
);
const positionData = { chainId: 1, position };
const params = {
  chainId: 1,
  account: owner.address,
  marketId: market.id,
  marketData: { chainId: 1, market },
  positionData,
  now: 100n,
  expiresAt: 200,
};
function client(authorized = true) {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: addressesRegistry[1].blue,
    abi: blueAbi,
    functionName: "isAuthorized",
    result: authorized,
  });
  mockRead(handle, {
    address: addressesRegistry[1].blue,
    abi: blueAbi,
    functionName: "nonce",
    result: 0n,
  });
  return handle;
}

test.each([{ assets: 1n }, { shares: 1n }])(
  "behavior: position validates a supported withdrawal %o",
  async (amount) => {
    const plan = await prepareBlueWithdraw(client().client, {
      ...params,
      ...amount,
      positionData,
    });
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "blueWithdraw",
    ]);
  },
);

test("error: aggregate penalty exceeds shares-mode proceeds", async () => {
  const result = prepareBlueWithdraw(client().client, {
    ...params,
    shares: 1_500_000n,
    maxPenalty: 10n ** 18n,
    reallocations: [1n, 1n].map((assets) => ({
      vault: owner.address,
      from: { type: "idle" },
      to: { adapter: owner.address },
      assets,
      penalty: 10n ** 18n,
    })),
  });
  await expect(result).rejects.toBeInstanceOf(InputExceedsMaxError);
  await expect(result).rejects.toMatchObject({
    field: "reallocationPenaltyAssets",
    value: 2n,
    max: 1n,
  });
});

test("error: shares-mode penalty exceeds proceeds quoted by the position snapshot", async () => {
  const result = prepareBlueWithdraw(client().client, {
    ...params,
    marketData: {
      chainId: 1,
      market: new Market({ ...market, totalSupplyAssets: 1_000n }),
    },
    shares: 1_500_000n,
    maxPenalty: 10n ** 18n,
    reallocations: [
      {
        vault: owner.address,
        from: { type: "idle" },
        to: { adapter: owner.address },
        assets: 2n,
        penalty: 10n ** 18n,
      },
    ],
  });
  await expect(result).rejects.toBeInstanceOf(InputExceedsMaxError);
  await expect(result).rejects.toMatchObject({
    field: "reallocationPenaltyAssets",
    value: 2n,
    max: 1n,
  });
});

test.each([
  { initial: 0n, mutated: 1n },
  { initial: 1n, mutated: 0n },
])(
  "snapshots maxPenalty $initial before the first RPC await",
  async ({ initial, mutated }) => {
    const handle = client();
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    handle.request.mockImplementationOnce(async () => {
      started.resolve();
      await gate.promise;
      return toHex(mainnet.id);
    });
    const options = {
      ...params,
      assets: 1n,
      maxPenalty: initial,
      reallocations: [
        {
          vault: owner.address,
          from: { type: "idle" as const },
          to: { adapter: owner.address },
          assets: 1n,
          penalty: 1n,
        },
      ],
    };
    const pending = prepareBlueWithdraw(handle.client, options);
    await started.promise;
    expect(handle.request.mock.calls[0]?.[0].method).toBe("eth_chainId");
    options.maxPenalty = mutated;
    gate.resolve();
    if (initial === 0n) {
      await expect(pending).rejects.toBeInstanceOf(InputExceedsMaxError);
      await expect(pending).rejects.toMatchObject({
        field: "reallocation.penalty",
        value: 1n,
        max: initial,
      });
      return;
    }
    const plan = await pending;
    expect(plan.steps.at(-1)?.action.inputs).toHaveProperty(
      "maxPenalty",
      initial,
    );
    expect(buildTransactions(plan)).toHaveLength(1);
    expect(options.maxPenalty).toBe(mutated);
  },
);

test.each([
  [{ assets: position.supplyAssets + 1n }, WithdrawExceedsSupplyError],
  [{ shares: position.supplyShares + 1n }, WithdrawSharesExceedSupplyError],
] as const)(
  "error: over-withdrawal %o is rejected before authorization reads",
  async (amount, error) => {
    const handle = client(false);
    await expect(
      prepareBlueWithdraw(handle.client, {
        ...params,
        ...amount,
        positionData,
      }),
    ).rejects.toBeInstanceOf(error);
    expect(
      handle.request.mock.calls.some(([args]) => args.method === "eth_call"),
    ).toBe(false);
    await expect(
      prepareBlueWithdraw(client().client, {
        ...params,
        ...amount,
        positionData: undefined as unknown as typeof positionData,
      }),
    ).rejects.toBeInstanceOf(MissingAccrualPositionError);
  },
);

test.each([
  ["omitted", {}],
  ["null", { positionData: null }],
] as const)("error: rejects a %s position snapshot", async (_, overrides) => {
  const { positionData: _position, ...withoutPosition } = params;
  const inputs = {
    ...withoutPosition,
    ...overrides,
  } as unknown as typeof params;
  await expect(
    prepareBlueWithdraw(client().client, { ...inputs, assets: 1n }),
  ).rejects.toBeInstanceOf(MissingAccrualPositionError);
});

test.each(["bundles.blueBundlesV1", "blue"] as const)(
  "error: MissingContractCodeError for %s before authorization",
  async (role) => {
    const handle = client();
    const defaultImpl = handle.request.getMockImplementation();
    const address = getChainAddress(1, role);
    handle.request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode" && args.params?.[0] === address) {
        return "0x";
      }
      return defaultImpl?.(args);
    });
    await expect(
      prepareBlueWithdraw(handle.client, { ...params, assets: 10n }),
    ).rejects.toBeInstanceOf(MissingContractCodeError);
    expect(
      handle.request.mock.calls.some(([args]) => args.method === "eth_call"),
    ).toBe(false);
  },
);

test.each([{ assets: 10n }, { shares: 10n }])(
  "default: round trip and independent client %o",
  async (amount) => {
    const first = await prepareBlueWithdraw(client().client, {
      ...params,
      ...amount,
    });
    const second = await prepareBlueWithdraw(client().client, {
      ...params,
      ...amount,
    });
    expect(first.steps.map(({ action }) => action.type)).toEqual([
      "blueWithdraw",
    ]);
    expect(first.signatureRequests).toEqual([]);
    expect(
      buildTransactions(parseTransactionPlan(serializeTransactionPlan(first))),
    ).toEqual(buildTransactions(second));
  },
);

test.each([positionData])(
  "behavior: explicit undefined amount matches omission with position %o",
  async (snapshot) => {
    for (const amount of [{ assets: 10n }, { shares: 10n }] as const) {
      const omitted = await prepareBlueWithdraw(client().client, {
        ...params,
        ...amount,
        positionData: snapshot,
      });
      const explicit = await prepareBlueWithdraw(client().client, {
        ...params,
        assets: undefined,
        shares: undefined,
        ...amount,
        positionData: snapshot,
      });
      expect(buildTransactions(explicit).map(({ data }) => data)).toEqual(
        buildTransactions(omitted).map(({ data }) => data),
      );
    }
  },
);

test.each([
  { assets: position.supplyAssets },
  { shares: position.supplyShares },
  { shares: 1_500_001n },
])(
  "behavior: valid withdrawal %o matches the action encoder",
  async (amount) => {
    const handle = client();
    const plan = await prepareBlueWithdraw(handle.client, {
      ...params,
      ...amount,
    });
    const expected = blueWithdraw({
      market: { chainId: params.chainId, marketParams: market.params },
      args: {
        userAddress: owner.address,
        deadline: 200n,
        withdrawAssets: amount.assets ?? 0n,
        withdrawShares: amount.shares ?? 0n,
      },
    });
    expect(buildTransactions(plan)[0]?.data).toBe(expected.data);
  },
);

test("behavior: signed authorization has no token prerequisite", async () => {
  const plan = await prepareBlueWithdraw(client(false).client, {
    ...params,
    assets: 10n,
    supportSignature: true,
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual(["blueWithdraw"]);
  const [request] = getPendingSignatureRequests(plan);
  assert(request);
  expect(request.kind).toBe("morphoAuthorization");
  try {
    buildTransactions(plan);
    throw new Error("expected missing signature");
  } catch (error) {
    expect(error).toBeInstanceOf(IncompleteTransactionPlanError);
    expect(error).toMatchObject({ id: request.id });
  }
  const signed = applySignatures(plan, [
    { id: request.id, signature: await owner.signTypedData(request.typedData) },
  ]);
  expect(
    buildTransactions(parseTransactionPlan(serializeTransactionPlan(signed))),
  ).toEqual(buildTransactions(signed));
  expect(buildTransactions(signed)).toHaveLength(1);
  expect(() => buildTransactions({ ...plan, signatureRequests: [] })).toThrow(
    new IncompleteTransactionPlanError(request.id),
  );
});

test.each([
  ["nonce", { nonce: 1n }],
  ["deadline", { deadline: 201n }],
  ["authorizer", { authorizer: zeroAddress }],
] as const)(
  "error: stored inline authorization %s mismatch",
  async (_field, message) => {
    const plan = await prepareBlueWithdraw(client(false).client, {
      ...params,
      assets: 10n,
      supportSignature: true,
    });
    const [request] = plan.signatureRequests;
    assert(request);
    const malformed = {
      ...plan,
      signatureRequests: [
        {
          ...request,
          typedData: {
            ...request.typedData,
            message: { ...request.typedData.message, ...message },
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
  },
);

test("error: the stored authorization nonce must match the intact request", async () => {
  const plan = structuredClone(
    await prepareBlueWithdraw(client(false).client, {
      ...params,
      assets: 10n,
      supportSignature: true,
    }),
  );
  const action = plan.steps.at(-1)?.action;
  assert(action?.type === "blueWithdraw");
  assert(action.inputs.authorizationNonce !== undefined);
  Object.assign(action.inputs, {
    authorizationNonce: action.inputs.authorizationNonce + 1n,
  });
  expect(() => getPendingSignatureRequests(plan)).toThrow(
    TransactionPlanSignatureMismatchError,
  );
  expect(() => parseTransactionPlan(serializeTransactionPlan(plan))).toThrow(
    InvalidTransactionPlanError,
  );
});

test("error: inline authorization requires a stored nonce", async () => {
  const plan = await prepareBlueWithdraw(client(false).client, {
    ...params,
    assets: 10n,
    supportSignature: true,
  });
  const [step] = plan.steps;
  assert(step?.action.type === "blueWithdraw");
  const malformed = {
    ...plan,
    steps: [
      {
        ...step,
        action: {
          ...step.action,
          inputs: { ...step.action.inputs, authorizationNonce: undefined },
        },
      },
    ],
  };
  expect(() =>
    parseTransactionPlan(serializeTransactionPlan(malformed)),
  ).toThrow(InvalidTransactionPlanError);
});

test("behavior: direct authorization", async () => {
  const plan = await prepareBlueWithdraw(client(false).client, {
    ...params,
    assets: 10n,
    supportSignature: false,
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "morphoAuthorization",
    "blueWithdraw",
  ]);
  expect(plan.signatureRequests).toEqual([]);
});

test("error: empty withdrawal", async () => {
  await expect(
    prepareBlueWithdraw(client().client, { ...params, assets: 0n }),
  ).rejects.toBeInstanceOf(NonPositiveInputError);
});

test("error: aggregate penalty exceeds proceeds", async () => {
  await expect(
    prepareBlueWithdraw(client().client, {
      ...params,
      assets: 1n,
      reallocations: [
        {
          vault: owner.address,
          from: { type: "idle" },
          to: { adapter: owner.address },
          assets: 100n,
          penalty: 10n ** 18n,
        },
      ],
    }),
  ).rejects.toBeInstanceOf(InputExceedsMaxError);
});

test.each([
  [null, InvalidVaultV2BlueReallocationShapeError],
  [
    {
      vault: owner.address,
      to: { adapter: owner.address },
      assets: 1n,
      penalty: 0n,
    },
    InvalidReallocationSourceTypeError,
  ],
  [
    {
      vault: owner.address,
      to: { adapter: owner.address },
      from: { type: "market", adapter: owner.address },
      assets: 1n,
      penalty: 0n,
    },
    InvalidReallocationSourceTypeError,
  ],
] as const)("error: malformed allocation %o", async (entry, error) => {
  const handle = client(false);
  await expect(
    prepareBlueWithdraw(handle.client, {
      ...params,
      assets: 10n,
      reallocations: [entry] as unknown as readonly VaultV2BlueReallocation[],
    }),
  ).rejects.toBeInstanceOf(error);
  expect(
    handle.request.mock.calls.some(([args]) => args.method === "eth_call"),
  ).toBe(false);
});

test.each([
  {
    field: "marketParams",
    value: zeroAddress,
    path: "$.steps[0].action.inputs.marketParams",
  },
  {
    field: "reallocations",
    value: [null],
    path: "$.steps[0].action.inputs.reallocations[0]",
  },
] as const)(
  "error: malformed stored inputs $field",
  async ({ field, value, path }) => {
    const plan = await prepareBlueWithdraw(client().client, {
      ...params,
      assets: 10n,
    });
    const step = plan.steps[0];
    assert(step?.action.type === "blueWithdraw");
    const malformed = {
      ...plan,
      steps: [
        {
          ...step,
          action: {
            ...step.action,
            signatureRequestIds: {},
            inputs: {
              ...step.action.inputs,
              [field]: value,
            },
          },
        },
      ],
    };
    const parse = () =>
      parseTransactionPlan(serializeTransactionPlan(malformed));
    expect(parse).toThrow(InvalidTransactionPlanError);
    expect(parse).toThrow(expect.objectContaining({ path }));
  },
);
