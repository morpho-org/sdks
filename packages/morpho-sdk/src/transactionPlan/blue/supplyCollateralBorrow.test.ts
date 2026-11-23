import {
  AccrualPosition,
  Market,
  MarketParams,
  Token,
} from "@morpho-org/blue-sdk";
import { blueAbi, getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  decodeFunctionData,
  erc20Abi,
  maxUint256,
  serializeSignature,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  ChainIdMismatchError,
  MissingContractCodeError,
  NativeAmountOnNonWNativeAssetError,
  NonPositiveInputError,
} from "../../types/index.js";
import {
  BlueSnapshotChainMismatchError,
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import { applySignatures, buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import type { TransactionPlan } from "../types.js";
import {
  buildBlueSupplyCollateralBorrow,
  prepareBlueSupplyCollateralBorrow,
} from "./supplyCollateralBorrow.js";

const market = new Market({
  params: new MarketParams({
    loanToken: zeroAddress,
    collateralToken: getChainAddress(1, "wNative"),
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 0n,
  }),
  totalSupplyAssets: 0n,
  totalSupplyShares: 0n,
  totalBorrowAssets: 0n,
  totalBorrowShares: 0n,
  lastUpdate: 100n,
  fee: 0n,
});
const params = {
  chainId: 1,
  account: "0x0000000000000000000000000000000000000001",
  marketId: market.id,
  marketData: { chainId: 1, market },
  now: 100n,
  expiresAt: 200,
  collateralAssets: 100n,
  borrowAssets: 0n,
} as const;

test("validates an inherited position snapshot before RPC reads", async () => {
  class SupplyBorrowOptions {
    get positionData() {
      const position = new AccrualPosition(
        {
          user: params.account,
          collateral: 0n,
          borrowShares: 0n,
          supplyShares: 0n,
        },
        market,
      );
      return { chainId: base.id, position };
    }
  }
  const handle = createMockClient(mainnet);
  await expect(
    prepareBlueSupplyCollateralBorrow(
      handle.client,
      Object.assign(new SupplyBorrowOptions(), params),
    ),
  ).rejects.toBeInstanceOf(BlueSnapshotChainMismatchError);
  expect(handle.request).not.toHaveBeenCalled();
});

test("preserves an inherited expiry", async () => {
  class SupplyBorrowOptions {
    get expiresAt() {
      return 300;
    }
  }
  const { expiresAt: _expiresAt, ...intent } = params;
  const handle = createMockClient(mainnet);
  const input = Object.assign(new SupplyBorrowOptions(), intent, {
    funding: { type: "native" } as const,
  });
  const plan = await prepareBlueSupplyCollateralBorrow(handle.client, input);
  expect(plan.expiresAt).toBe(input.expiresAt);
});

function aliasedSignaturePlan(): TransactionPlan {
  const permitArgs = {
    spender: getChainAddress(1, "bundles.blueBundlesV1"),
    amount: params.collateralAssets,
    nonce: 7n,
    deadline: 200n,
  };
  return {
    version: 2,
    chainId: 1,
    account: params.account,
    expiresAt: 200,
    steps: [
      {
        id: "operation",
        label: "Supply collateral and borrow",
        action: {
          type: "blueSupplyCollateralBorrow",
          inputs: {
            chainId: 1,
            account: params.account,
            marketParams: market.params,
            collateralAssets: params.collateralAssets,
            borrowAssets: 1n,
            maxLtv: maxUint256,
            reallocations: [],
            deadline: 200n,
            authorizationNonce: 7n,
          },
          signatureRequestIds: {
            tokenPermit: "permit",
            morphoAuthorization: "permit",
          },
        },
      },
    ],
    signatureRequests: [
      {
        id: "permit",
        kind: "permit",
        args: permitArgs,
        typedData: getPermitTypedData(
          {
            erc20: new Token({
              address: market.params.collateralToken,
              name: "Collateral",
            }),
            owner: params.account,
            allowance: permitArgs.amount,
            ...permitArgs,
          },
          1,
        ),
        signature: serializeSignature({
          r: toHex(1n, { size: 32 }),
          s: toHex(2n, { size: 32 }),
          yParity: 0,
        }),
      },
    ],
  };
}

describe("prepareBlueSupplyCollateralBorrow", () => {
  test("error: InvalidTransactionPlanError rejects aliased signature roles", () => {
    const plan = aliasedSignaturePlan();
    expect(() => parseTransactionPlan(serializeTransactionPlan(plan))).toThrow(
      InvalidTransactionPlanError,
    );
  });

  test("error: TransactionPlanSignatureMismatchError rejects a permit as Morpho authorization during build", () => {
    const plan = aliasedSignaturePlan();
    const action = plan.steps[0]!.action;
    assert(action.type === "blueSupplyCollateralBorrow");
    const build = () =>
      buildBlueSupplyCollateralBorrow(action, plan.signatureRequests);
    expect(build).toThrow(TransactionPlanSignatureMismatchError);
    expect(build).toThrow(
      expect.objectContaining({ id: "permit", field: "reference" }),
    );
  });

  test.each([false, true])(
    "behavior: authorization signature support = %s",
    async (supportSignature) => {
      const handle = createMockClient(mainnet);
      const owner = privateKeyToAccount(toHex(1n, { size: 32 }));
      const blue = getChainAddress(1, "blue");
      const spender = getChainAddress(1, "bundles.blueBundlesV1");
      mockRead(handle, {
        address: blue,
        abi: blueAbi,
        functionName: "isAuthorized",
        result: false,
      });
      mockRead(handle, {
        address: blue,
        abi: blueAbi,
        functionName: "nonce",
        result: 7n,
      });
      const borrowMarket = new Market({
        ...market,
        params: new MarketParams({
          ...market.params,
          lltv: 800000000000000000n,
        }),
        price: 10n ** 36n,
      });
      const position = new AccrualPosition(
        {
          user: owner.address,
          collateral: 0n,
          borrowShares: 0n,
          supplyShares: 0n,
        },
        borrowMarket,
      );
      let plan = await prepareBlueSupplyCollateralBorrow(handle.client, {
        ...params,
        account: owner.address,
        marketId: borrowMarket.id,
        marketData: { chainId: 1, market: borrowMarket },
        positionData: { chainId: 1, position },
        borrowAssets: 1n,
        funding: { type: "native" },
        supportSignature,
      });
      const operation = plan.steps.at(-1)!;
      assert(operation.action.type === "blueSupplyCollateralBorrow");
      expect(operation.label).toBe("Supply collateral and borrow on Blue");
      if (supportSignature) {
        expect(plan.steps.map((step) => step.action.type)).toEqual([
          "blueSupplyCollateralBorrow",
        ]);
        const [request] = plan.signatureRequests;
        assert(request?.kind === "morphoAuthorization");
        expect(operation.action.signatureRequestIds).toEqual({
          morphoAuthorization: request.id,
        });
        expect(() => buildTransactions(plan)).toThrow(
          expect.objectContaining({ id: request.id }),
        );
        plan = applySignatures(plan, [
          {
            id: request.id,
            signature: await owner.signTypedData(request.typedData),
          },
        ]);
      } else {
        expect(plan.steps.map((step) => step.action.type)).toEqual([
          "morphoAuthorization",
          "blueSupplyCollateralBorrow",
        ]);
        expect(plan.signatureRequests).toEqual([]);
        expect(operation.action.signatureRequestIds).toEqual({});
        expect(plan.steps[0]?.action).not.toHaveProperty("signatureRequestIds");
      }
      const transactions = buildTransactions(
        parseTransactionPlan(serializeTransactionPlan(plan)),
      );
      if (!supportSignature) {
        expect(transactions[0]?.to).toBe(blue);
        expect(
          decodeFunctionData({ abi: blueAbi, data: transactions[0]!.data }),
        ).toEqual({ functionName: "setAuthorization", args: [spender, true] });
      }
      const transaction = transactions.at(-1)!;
      expect(transaction.to).toBe(spender);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transaction.data,
      });
      assert(decoded.functionName === "blueBundlesV1SupplyCollateralAndBorrow");
      expect(decoded.args[5]).toMatchObject({
        nonce: supportSignature ? 7n : 0n,
        deadline: supportSignature ? 200n : 0n,
      });
      expect(decoded.args[5].signature.v === 0).toBe(!supportSignature);
    },
  );

  test("error: BlueSnapshotChainMismatchError before target checks", async () => {
    const handle = createMockClient(mainnet);
    await expect(
      prepareBlueSupplyCollateralBorrow(handle.client, {
        ...params,
        marketData: { chainId: 8453, market },
      }),
    ).rejects.toBeInstanceOf(BlueSnapshotChainMismatchError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("error: MissingContractCodeError before reading authorization on a code-less Blue", async () => {
    const handle = createMockClient(mainnet);
    const blue = getChainAddress(1, "blue");
    const defaultImpl = handle.request.getMockImplementation();
    handle.request.mockImplementation(async ({ method, params: rpcParams }) => {
      if (method === "eth_getCode" && rpcParams?.[0] === blue) {
        return "0x";
      }
      if (method === "eth_call") {
        return "0x";
      }
      return defaultImpl?.({ method, params: rpcParams });
    });
    const borrowMarket = new Market({
      ...market,
      params: new MarketParams({ ...market.params, lltv: 800000000000000000n }),
      price: 10n ** 36n,
    });
    const position = new AccrualPosition(
      {
        user: params.account,
        collateral: 0n,
        borrowShares: 0n,
        supplyShares: 0n,
      },
      borrowMarket,
    );
    await expect(
      prepareBlueSupplyCollateralBorrow(handle.client, {
        ...params,
        marketId: borrowMarket.id,
        marketData: { chainId: 1, market: borrowMarket },
        positionData: { chainId: 1, position },
        borrowAssets: 1n,
        funding: { type: "native" },
      }),
    ).rejects.toBeInstanceOf(MissingContractCodeError);
    expect(
      handle.request.mock.calls.some(([call]) => call.method === "eth_call"),
    ).toBe(false);
  });

  test("default: sufficient allowance, round trip and cross-client builds", async () => {
    const first = createMockClient(mainnet);
    mockRead(first, {
      address: market.params.collateralToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    const plan = await prepareBlueSupplyCollateralBorrow(first.client, params);
    expect(plan.steps.at(-1)?.label).toBe("Supply collateral on Blue");
    expect(plan.steps.map((step) => step.action.type)).toEqual([
      "blueSupplyCollateralBorrow",
    ]);
    expect(plan.signatureRequests).toEqual([]);
    const transactions = buildTransactions(plan);
    const reads = first.request.mock.calls.length;
    expect(
      buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan))),
    ).toEqual(transactions);
    expect(first.request).toHaveBeenCalledTimes(reads);
    expect(transactions[0]?.value).toBe(0n);
  });

  test("error: ChainIdMismatchError for native-only funding with deployed targets on another chain", async () => {
    const handle = createMockClient(base);
    await expect(
      prepareBlueSupplyCollateralBorrow(handle.client, {
        ...params,
        borrowAssets: 0n,
        funding: { type: "native" },
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_getCode",
      "eth_getCode",
    ]);
  });

  test("behavior: native funding needs no token prerequisite", async () => {
    const plan = await prepareBlueSupplyCollateralBorrow(
      createMockClient(mainnet).client,
      { ...params, funding: { type: "native" } },
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps[0]?.action.inputs).toHaveProperty("nativeAssets", 100n);
    expect(plan.steps[0]?.action.inputs).not.toHaveProperty("nativeAmount");
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
    expect(buildTransactions(plan)[0]?.value).toBe(100n);
  });

  test("behavior: borrow-only labels the borrow leg", async () => {
    const mock = createMockClient(mainnet);
    mockRead(mock, {
      address: getChainAddress(1, "blue"),
      abi: blueAbi,
      functionName: "isAuthorized",
      result: true,
    });
    const borrowMarket = new Market({
      ...market,
      params: new MarketParams({ ...market.params, lltv: 800000000000000000n }),
      price: 10n ** 36n,
    });
    const position = new AccrualPosition(
      {
        user: params.account,
        collateral: 100n,
        borrowShares: 0n,
        supplyShares: 0n,
      },
      borrowMarket,
    );
    const plan = await prepareBlueSupplyCollateralBorrow(mock.client, {
      ...params,
      marketId: borrowMarket.id,
      marketData: { chainId: 1, market: borrowMarket },
      positionData: { chainId: 1, position },
      collateralAssets: 0n,
      borrowAssets: 1n,
    });
    expect(plan.steps.at(-1)?.label).toBe("Borrow on Blue");
  });

  test("error: IncompleteTransactionPlanError identifies a missing referenced signature", async () => {
    const plan = await prepareBlueSupplyCollateralBorrow(
      createMockClient(mainnet).client,
      { ...params, funding: { type: "native" } },
    );
    const step = plan.steps[0]!;
    assert(step.action.type === "blueSupplyCollateralBorrow");
    const changed = {
      ...plan,
      steps: [
        {
          ...step,
          action: {
            ...step.action,
            signatureRequestIds: { tokenPermit: "missing-permit" },
          },
        },
      ],
    };
    expect(() => buildTransactions(changed)).toThrow(
      IncompleteTransactionPlanError,
    );
    expect(() => buildTransactions(changed)).toThrow(
      expect.objectContaining({ id: "missing-permit" }),
    );
  });

  test.each([
    { collateralAssets: "100" },
    { borrowAssets: -1n },
    { maxLtv: undefined },
    { marketParams: null },
    { reallocations: [null] },
    {
      reallocations: [
        {
          vault: zeroAddress,
          assets: 1n,
          penalty: 0n,
          to: { adapter: zeroAddress },
          from: { type: "unknown" },
        },
      ],
    },
    { authorizationNonce: toHex(1n) },
  ])(
    "error: InvalidTransactionPlanError rejects malformed input %#",
    async (patch) => {
      const plan = await prepareBlueSupplyCollateralBorrow(
        createMockClient(mainnet).client,
        { ...params, funding: { type: "native" } },
      );
      const step = plan.steps[0]!;
      const malformed = {
        ...plan,
        steps: [
          {
            ...step,
            action: {
              ...step.action,
              inputs: { ...step.action.inputs, ...patch },
            },
          },
        ],
      };
      expect(() =>
        parseTransactionPlan(
          serializeTransactionPlan(malformed as typeof plan),
        ),
      ).toThrow(InvalidTransactionPlanError);
    },
  );

  test("error: NonPositiveInputError for empty operation before RPC", async () => {
    const handle = createMockClient(mainnet);
    await expect(
      prepareBlueSupplyCollateralBorrow(handle.client, {
        ...params,
        collateralAssets: 0n,
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("error: NativeAmountOnNonWNativeAssetError before RPC", async () => {
    const handle = createMockClient(mainnet);
    const otherMarket = new Market({
      ...market,
      params: new MarketParams({
        ...market.params,
        collateralToken: zeroAddress,
      }),
    });
    await expect(
      prepareBlueSupplyCollateralBorrow(handle.client, {
        ...params,
        marketId: otherMarket.id,
        marketData: { chainId: 1, market: otherMarket },
        funding: { type: "native" },
      }),
    ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeAssetError);
    expect(handle.request).not.toHaveBeenCalled();
  });
});
