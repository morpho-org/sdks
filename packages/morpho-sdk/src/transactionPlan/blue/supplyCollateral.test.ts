import { addressesRegistry, Market, MarketParams } from "@morpho-org/blue-sdk";
import { erc2612Abi, erc5267Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  erc20Abi,
  getTypesForEIP712Domain,
  hashDomain,
  type TypedData,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { assert, expect, test } from "vitest";
import { blueSupplyCollateral } from "../../actions/blue/supplyCollateral.js";
import { ChainIdMismatchError } from "../../types/index.js";
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
import { prepareBlueSupplyCollateral } from "./supplyCollateral.js";

const { usdc, wNative } = addressesRegistry[mainnet.id];
const account = privateKeyToAccount(toHex(1n, { size: 32 }));
const marketParams = new MarketParams({
  loanToken: wNative,
  collateralToken: usdc,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
});
const market = new Market({
  params: marketParams,
  totalSupplyAssets: 0n,
  totalSupplyShares: 0n,
  totalBorrowAssets: 0n,
  totalBorrowShares: 0n,
  lastUpdate: 100n,
  fee: 0n,
});
const params = {
  chainId: mainnet.id,
  account: account.address,
  now: 100n,
  expiresAt: 200,
  marketId: market.id,
  marketData: { chainId: mainnet.id, market },
  collateralAssets: 1_000_000n,
  supportSignature: true,
  deployless: false,
};

async function prepareWithPermit() {
  const handle = createMockClient(mainnet);
  const metadata = {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
    allowance: 0n,
  } as const;
  for (const functionName of [
    "name",
    "symbol",
    "decimals",
    "allowance",
  ] as const) {
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName,
      result: metadata[functionName],
    });
  }
  mockRead(handle, {
    address: usdc,
    abi: erc2612Abi,
    functionName: "nonces",
    result: 7n,
  });
  mockRead(handle, {
    address: usdc,
    abi: erc5267Abi,
    functionName: "eip712Domain",
    result: ["0x0f", "USD Coin", "2", 1n, usdc, toHex(0n, { size: 32 }), []],
  });
  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: mainnet.id,
    verifyingContract: usdc,
  };
  mockRead(handle, {
    address: usdc,
    abi: erc2612Abi,
    functionName: "DOMAIN_SEPARATOR",
    result: hashDomain<TypedData>({
      domain,
      types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
    }),
  });
  return prepareBlueSupplyCollateral(handle.client, params);
}

test("builds a signed plan after serialization without the preparing client", async () => {
  const plan = await prepareWithPermit();
  const [request] = getPendingSignatureRequests(plan);
  assert(request?.kind === "permit");
  const signature = await account.signTypedData(request.typedData);
  const signed = applySignatures(plan, [{ id: request.id, signature }]);
  const stored = serializeTransactionPlan(signed);
  expect(stored).not.toContain("liquidationIncentiveFactor");
  const restored = parseTransactionPlan(stored);
  const built = buildTransactions(restored);
  expect(built).toEqual(buildTransactions(signed));

  const expected = blueSupplyCollateral({
    market: { chainId: params.chainId, marketParams },
    args: {
      userAddress: params.account,
      collateralAssets: params.collateralAssets,
      deadline: BigInt(params.expiresAt),
      requirementSignature: {
        action: {
          type: request.kind,
          args: request.args,
          typedData: request.typedData,
        },
        args: {
          asset: usdc,
          owner: params.account,
          amount: params.collateralAssets,
          nonce: 7n,
          deadline: BigInt(params.expiresAt),
          signature,
        },
      },
    },
  });
  expect(built).toEqual([expected]);
});

function nativeCollateralParams() {
  const nativeMarket = new Market({
    ...market,
    params: new MarketParams({
      ...marketParams,
      loanToken: usdc,
      collateralToken: wNative,
    }),
  });
  return {
    ...params,
    marketId: nativeMarket.id,
    marketData: { chainId: mainnet.id, market: nativeMarket },
    funding: { type: "native" },
  } as const;
}

test("rejects a wrong-chain RPC for native collateral even when targets have bytecode", async () => {
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
    prepareBlueSupplyCollateral(handle.client, nativeCollateralParams()),
  ).rejects.toBeInstanceOf(ChainIdMismatchError);
  expect(
    handle.request.mock.calls.filter(([call]) => call.method === "eth_getCode"),
  ).toHaveLength(2);
});

test("stores native funding as nativeAssets and rebuilds it offline", async () => {
  const { client } = createMockClient(mainnet);
  const nativeParams = nativeCollateralParams();
  const nativeMarket = nativeParams.marketData.market;
  const plan = await prepareBlueSupplyCollateral(client, nativeParams);
  const stored = serializeTransactionPlan(plan);
  const { inputs } = JSON.parse(stored).steps[0].action;
  expect(inputs).toHaveProperty("nativeAssets", {
    $bigint: params.collateralAssets.toString(),
  });
  expect(inputs).not.toHaveProperty("nativeAmount");
  expect(buildTransactions(parseTransactionPlan(stored))).toEqual([
    blueSupplyCollateral({
      market: { chainId: params.chainId, marketParams: nativeMarket.params },
      args: {
        userAddress: params.account,
        collateralAssets: params.collateralAssets,
        nativeAmount: params.collateralAssets,
        deadline: BigInt(params.expiresAt),
      },
    }),
  ]);
});

test("rejects zero native funding both when building and restoring", async () => {
  const { client } = createMockClient(mainnet);
  const plan = structuredClone(
    await prepareBlueSupplyCollateral(client, nativeCollateralParams()),
  );
  const step = plan.steps[0];
  assert(step?.action.type === "blueSupplyCollateral");
  const invalidPlan = {
    ...plan,
    steps: [
      {
        ...step,
        action: {
          ...step.action,
          inputs: { ...step.action.inputs, nativeAssets: 0n },
        },
      },
    ],
  };
  expect(() => buildTransactions(invalidPlan)).toThrow(
    InvalidTransactionPlanError,
  );
  expect(() =>
    parseTransactionPlan(serializeTransactionPlan(invalidPlan)),
  ).toThrow(InvalidTransactionPlanError);
});

test("reports the ID of a referenced permit that has no signature", async () => {
  const plan = await prepareWithPermit();
  expect(() => buildTransactions(plan)).toThrow(
    new IncompleteTransactionPlanError("blueSupplyCollateral:tokenPermit"),
  );
  expect(() => buildTransactions({ ...plan, signatureRequests: [] })).toThrow(
    new IncompleteTransactionPlanError("blueSupplyCollateral:tokenPermit"),
  );
});

test("rejects a token permit for another spender before signing, building, or parsing", async () => {
  const plan = await prepareWithPermit();
  const [permit] = plan.signatureRequests;
  assert(permit?.kind === "permit");
  const modified = {
    ...plan,
    signatureRequests: [
      {
        ...permit,
        args: {
          ...permit.args,
          spender: getChainAddress(mainnet.id, "permit2"),
        },
      },
    ],
  };
  expect(() => getPendingSignatureRequests(modified)).toThrow(
    TransactionPlanSignatureMismatchError,
  );
  expect(() => buildTransactions(modified)).toThrow(
    TransactionPlanSignatureMismatchError,
  );
  expect(() =>
    parseTransactionPlan(serializeTransactionPlan(modified)),
  ).toThrow(InvalidTransactionPlanError);
});

test.each([
  ["inputs", "collateralAssets"],
  ["inputs", "nativeAssets"],
  ["inputs", "marketParams", "collateralToken"],
  ["signatureRequestIds", "tokenPermit"],
  ["signatureRequestIds", "morphoAuthorization"],
])("rejects malformed stored action field %j", async (...path) => {
  const stored = JSON.parse(
    serializeTransactionPlan(await prepareWithPermit()),
  );
  let parent = stored.steps[0].action;
  for (const key of path.slice(0, -1)) {
    parent = parent[key];
  }
  parent[path.at(-1)!] = null;
  expect(() => parseTransactionPlan(JSON.stringify(stored))).toThrow(
    InvalidTransactionPlanError,
  );
});
