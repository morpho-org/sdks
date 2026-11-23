import {
  AccrualPosition,
  addressesRegistry,
  Market,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { toHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { assert, expect, test } from "vitest";
import {
  AccrualPositionUserMismatchError,
  BorrowExceedsSafeLtvError,
  MissingContractCodeError,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import { buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import { prepareBlueBorrow } from "./borrow.js";

const account = privateKeyToAccount(toHex(1n, { size: 32 })).address;
const market = new Market({
  params: new MarketParams({
    loanToken: addressesRegistry[1].usdc,
    collateralToken: zeroAddress,
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 800000000000000000n,
  }),
  totalSupplyAssets: 100000n,
  totalSupplyShares: 100000000000n,
  totalBorrowAssets: 0n,
  totalBorrowShares: 0n,
  lastUpdate: 100n,
  fee: 0n,
  price: 10n ** 36n,
});
const position = new AccrualPosition(
  { user: account, supplyShares: 0n, borrowShares: 0n, collateral: 10000n },
  market,
);
const params = {
  chainId: 1,
  account,
  marketId: market.id,
  marketData: { chainId: 1, market },
  positionData: { chainId: 1, position },
  now: 100n,
  expiresAt: 10000,
  borrowAssets: 100n,
};
function client(authorized: boolean) {
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

test("rejects an inherited position snapshot for another account before RPC reads", async () => {
  class BorrowOptions {
    get positionData() {
      return {
        chainId: 1,
        position: new AccrualPosition(
          { ...position, user: zeroAddress },
          market,
        ),
      };
    }
  }
  const { positionData: _position, ...intent } = params;
  const handle = client(true);
  await expect(
    prepareBlueBorrow(
      handle.client,
      Object.assign(new BorrowOptions(), intent),
    ),
  ).rejects.toBeInstanceOf(AccrualPositionUserMismatchError);
  expect(handle.request).not.toHaveBeenCalled();
});

test.each([true, false])(
  "default: authorization=%s, no token requirements, cross-instance round trip",
  async (authorized) => {
    const first = await prepareBlueBorrow(client(authorized).client, params);
    const second = await prepareBlueBorrow(client(authorized).client, params);
    expect(first.signatureRequests).toEqual([]);
    expect(first.steps.map(({ action }) => action.type)).toEqual(
      authorized ? ["blueBorrow"] : ["morphoAuthorization", "blueBorrow"],
    );
    expect(
      buildTransactions(parseTransactionPlan(serializeTransactionPlan(first))),
    ).toEqual(buildTransactions(second));
  },
);

test("error: missing authorization signature identifies the request", async () => {
  const plan = await prepareBlueBorrow(client(false).client, {
    ...params,
    supportSignature: true,
  });
  expect(plan.signatureRequests.map(({ kind }) => kind)).toEqual([
    "morphoAuthorization",
  ]);
  expect(() => buildTransactions(plan)).toThrow(IncompleteTransactionPlanError);
  expect(() => buildTransactions({ ...plan, signatureRequests: [] })).toThrow(
    IncompleteTransactionPlanError,
  );
  try {
    buildTransactions(plan);
  } catch (error) {
    expect(error).toMatchObject({ id: "blueBorrow:morphoAuthorization" });
  }
});

test("use the captured account and chain for the borrow plan header", async () => {
  const mutableParams = { ...params };
  const pending = prepareBlueBorrow(client(false).client, mutableParams);
  mutableParams.account = zeroAddress;
  mutableParams.chainId = 8453;
  const plan = await pending;
  expect(plan).toEqual(await prepareBlueBorrow(client(false).client, params));
  expect(() => buildTransactions(plan)).not.toThrow();
});

test("stored format-2 borrow builds fixed transaction bytes", () => {
  const saved = `{
    "version": 2,
    "chainId": 1,
    "account": "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
    "expiresAt": 10000,
    "steps": [{
      "id": "blueBorrow",
      "label": "Borrow from Blue",
      "action": {
        "type": "blueBorrow",
        "inputs": {
          "chainId": 1,
          "account": "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
          "marketParams": {
            "id": "0x55a0285c8f0f1bc82f31bf0eae64d70c94ce4768ae813ca44ccfe7210cd1014f",
            "loanToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            "collateralToken": "0x0000000000000000000000000000000000000000",
            "oracle": "0x0000000000000000000000000000000000000000",
            "irm": "0x0000000000000000000000000000000000000000",
            "lltv": { "$bigint": "800000000000000000" }
          },
          "borrowAssets": { "$bigint": "100" },
          "authorizationNonce": { "$bigint": "0" },
          "maxLtv": { "$bigint": "795000000000000000" },
          "reallocations": [],
          "deadline": { "$bigint": "10000" },
          "referralFeePct": { "$bigint": "0" },
          "referralFeeRecipient": "0x0000000000000000000000000000000000000000"
        },
        "signatureRequestIds": {}
      }
    }],
    "signatureRequests": []
  }`;
  const transactions = buildTransactions(parseTransactionPlan(saved));
  expect(
    transactions.map(({ to, data, value }) => ({ to, data, value })),
  ).toMatchInlineSnapshot(`
    [
      {
        "data": "0xb1268765000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b1a2bc2ec500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000b086849b46f800000000000000000000000000000000000000000000000000000000000000002400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000027100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "to": "0x38B0C12AB81976e9417D4ebfe2A34DB6DF22e6AD",
        "value": 0n,
      },
    ]
  `);
});

test("stored borrow ignores undeclared encoder inputs", async () => {
  const plan = await prepareBlueBorrow(client(true).client, params);
  const extra = structuredClone(plan);
  Object.assign(extra.steps[0]?.action.inputs ?? {}, { nativeAmount: 1n });
  expect(
    buildTransactions(parseTransactionPlan(serializeTransactionPlan(extra))),
  ).toEqual(buildTransactions(plan));
});

test("error: mismatched stored Morpho authorization nonce", async () => {
  const plan = await prepareBlueBorrow(client(false).client, {
    ...params,
    supportSignature: true,
  });
  const invalid = structuredClone(plan);
  Object.assign(invalid.steps.at(-1)?.action.inputs ?? {}, {
    authorizationNonce: 1n,
  });
  expect(() => buildTransactions(invalid)).toThrow(
    TransactionPlanSignatureMismatchError,
  );
  expect(() => parseTransactionPlan(serializeTransactionPlan(invalid))).toThrow(
    InvalidTransactionPlanError,
  );
});

test("error: BorrowExceedsSafeLtvError before RPC", async () => {
  const handle = client(true);
  await expect(
    prepareBlueBorrow(handle.client, { ...params, borrowAssets: 7975n }),
  ).rejects.toBeInstanceOf(BorrowExceedsSafeLtvError);
  expect(handle.request).not.toHaveBeenCalled();
});

test.each(["bundles.blueBundlesV1", "blue"] as const)(
  "error: MissingContractCodeError for %s",
  async (role) => {
    const handle = client(true);
    const request = handle.request.getMockImplementation()!;
    const address =
      role === "blue"
        ? addressesRegistry[1].blue
        : addressesRegistry[1].bundles.blueBundlesV1;
    handle.request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode" && args.params?.[0] === address) {
        return "0x";
      }
      if (args.method === "eth_call") {
        return "0x";
      }
      return request(args);
    });
    await expect(
      prepareBlueBorrow(handle.client, params),
    ).rejects.toBeInstanceOf(MissingContractCodeError);
    expect(
      handle.request.mock.calls.map(([args]) => args.method),
    ).not.toContain("eth_call");
  },
);

test.each(["borrowAssets", "marketParams", "reallocations"])(
  "error: malformed %s",
  async (field) => {
    const plan = await prepareBlueBorrow(client(true).client, params);
    const invalid = structuredClone(plan);
    Object.assign(invalid.steps[0]?.action.inputs ?? {}, { [field]: null });
    expect(() =>
      parseTransactionPlan(serializeTransactionPlan(invalid)),
    ).toThrow(InvalidTransactionPlanError);
  },
);

test.each(["target", "reallocation source"])(
  "error: truncated %s market ID is rejected during parsing",
  async (location) => {
    const plan = structuredClone(
      await prepareBlueBorrow(client(true).client, params),
    );
    const action = plan.steps[0]?.action;
    assert(action?.type === "blueBorrow");
    const marketParams = { ...action.inputs.marketParams, id: "0x1234" };
    if (location === "target") {
      Object.assign(action.inputs, { marketParams });
    } else {
      const adapter = params.account;
      Object.assign(action.inputs, {
        reallocations: [
          {
            vault: params.account,
            assets: 1n,
            penalty: 0n,
            from: { type: "market", adapter, marketParams },
            to: { adapter },
          },
        ],
      });
    }
    expect(() => parseTransactionPlan(serializeTransactionPlan(plan))).toThrow(
      InvalidTransactionPlanError,
    );
  },
);
