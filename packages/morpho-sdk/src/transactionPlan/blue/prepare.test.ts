import {
  AccrualPosition,
  addressesRegistry,
  Market,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { blueAbi, erc2612Abi, erc5267Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  getTypesForEIP712Domain,
  hashDomain,
  maxUint256,
  type TypedData,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";
import { assert, expect, test } from "vitest";
import {
  AccrualPositionUserMismatchError,
  ChainIdMismatchError,
  InvalidSignatureError,
  MarketIdMismatchError,
  MissingContractCodeError,
} from "../../types/index.js";
import {
  BlueSnapshotChainMismatchError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import { buildTransactions, verifyPlanSignature } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  validateMorphoAuthorizationPlanRequest,
  validateMorphoAuthorizationRequest,
} from "./authorization.js";
import { prepareBlue, validateBlueMarketSnapshot } from "./prepare.js";

const { blue, usdc } = addressesRegistry[mainnet.id];
const spender = getChainAddress(mainnet.id, "bundles.blueBundlesV1");
const owner = privateKeyToAccount(toHex(1n, { size: 32 }));
const other = privateKeyToAccount(toHex(2n, { size: 32 }));
const account = owner.address;
const now = 100n;
const deadline = 200n;
const nonce = 7n;
const id = "blue:morphoAuthorization";
const binding = { chainId: mainnet.id, account, nonce, deadline };

const market = new Market({
  params: new MarketParams({
    loanToken: usdc,
    collateralToken: zeroAddress,
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 0n,
  }),
  totalSupplyAssets: 0n,
  totalSupplyShares: 0n,
  totalBorrowAssets: 0n,
  totalBorrowShares: 0n,
  lastUpdate: now,
  fee: 0n,
});
const position = new AccrualPosition(
  {
    user: account,
    supplyShares: 0n,
    borrowShares: 0n,
    collateral: 0n,
  },
  market,
);
const params = {
  chainId: mainnet.id,
  account,
  now,
  expiresAt: Number(deadline),
  marketId: market.id,
  marketData: { chainId: mainnet.id, market },
  positionData: { chainId: mainnet.id, position },
};
const authOnly = () => ({ id: "blue", needsAuthorization: true });
const fundingOnly = () => ({
  id: "blue",
  tokenPull: { token: usdc, amount: 100n },
});

test.each([
  [
    { marketData: { ...params.marketData, chainId: base.id } },
    BlueSnapshotChainMismatchError,
  ],
  [{ marketId: MarketParams.idle(zeroAddress).id }, MarketIdMismatchError],
  [
    { positionData: { ...params.positionData, chainId: base.id } },
    BlueSnapshotChainMismatchError,
  ],
  [
    {
      positionData: {
        ...params.positionData,
        position: {
          ...position,
          marketId: MarketParams.idle(zeroAddress).id,
        } as AccrualPosition,
      },
    },
    MarketIdMismatchError,
  ],
  [{ account: other.address }, AccrualPositionUserMismatchError],
] as const)(
  "rejects mismatched snapshots before RPC (%#)",
  async (patch, error) => {
    const handle = createMockClient(mainnet);
    await expect(
      prepareBlue(
        { client: handle.client, params: { ...params, ...patch } },
        authOnly,
      ),
    ).rejects.toBeInstanceOf(error);
    expect(handle.request).not.toHaveBeenCalled();
  },
);

test("accepts a differently cased market ID with market and position snapshots", async () => {
  const marketId = `0x${market.id.slice(2).toUpperCase()}` as typeof market.id;
  expect(marketId).not.toBe(market.id);
  expect(() =>
    validateBlueMarketSnapshot(params.marketData, {
      chainId: params.chainId,
      marketId,
    }),
  ).not.toThrow();

  const { client } = createMockClient(mainnet);
  await expect(
    prepareBlue({ client, params: { ...params, marketId } }, () => ({
      id: "blue",
    })),
  ).resolves.toMatchObject({ steps: [], signatureRequests: [] });
});

test.each(["bundles.blueBundlesV1", "blue"] as const)(
  "checks %s bytecode before allowance or authorization reads",
  async (role) => {
    const handle = createMockClient(mainnet);
    const request = handle.request.getMockImplementation();
    assert(request);
    const address = getChainAddress(mainnet.id, role);
    handle.request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode" && args.params?.[0] === address) {
        return "0x";
      }
      return request(args);
    });
    const preparation = prepareBlue({ client: handle.client, params }, () => ({
      ...fundingOnly(),
      needsAuthorization: true,
    }));
    await expect(preparation).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(preparation).rejects.toMatchObject({ address, role });
    expect(
      handle.request.mock.calls.map(([args]) => args.method),
    ).not.toContain("eth_call");
  },
);

test("checks both Blue targets even without funding or authorization requirements", async () => {
  const handle = createMockClient(mainnet);
  await prepareBlue({ client: handle.client, params }, () => ({ id: "blue" }));
  expect(
    handle.request.mock.calls.map(([args]) => [args.method, args.params?.[0]]),
  ).toEqual([
    ["eth_getCode", spender],
    ["eth_getCode", blue],
  ]);
});

test("reports a wrong-chain endpoint instead of missing contract code", async () => {
  const handle = createMockClient(mainnet);
  handle.request.mockImplementation(async ({ method }) =>
    method === "eth_chainId" ? toHex(base.id) : "0x",
  );
  await expect(
    prepareBlue({ client: handle.client, params }, () => ({ id: "blue" })),
  ).rejects.toBeInstanceOf(ChainIdMismatchError);
  expect(handle.request.mock.calls.map(([args]) => args.method)).toEqual([
    "eth_getCode",
    "eth_getCode",
    "eth_chainId",
  ]);
});

test.each([false, true])(
  "authorization transaction when already authorized = %s",
  async (authorized) => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: authorized,
    });
    const { steps, signatureRequests, morphoAuthorizationRequestId } =
      await prepareBlue({ client: handle.client, params }, authOnly);
    expect(signatureRequests).toEqual([]);
    expect(morphoAuthorizationRequestId).toBeUndefined();
    const plan = {
      version: 2,
      chainId: mainnet.id,
      account,
      expiresAt: Number(deadline),
      steps,
      signatureRequests,
    } as const;
    const saved = serializeTransactionPlan(plan);
    const restored = parseTransactionPlan(saved);
    expect(serializeTransactionPlan(restored)).toBe(saved);
    const built = buildTransactions(restored);
    expect(built).toEqual(buildTransactions(plan));
    if (authorized) {
      expect(built).toEqual([]);
    } else {
      const [tx] = built;
      assert(tx);
      expect(tx.to).toBe(blue);
      expect(decodeFunctionData({ abi: blueAbi, data: tx.data })).toEqual({
        functionName: "setAuthorization",
        args: [spender, true],
      });
      expect(() =>
        parseTransactionPlan(
          JSON.stringify({ ...plan, steps: [{ id, label: "Authorize" }] }),
        ),
      ).toThrow(InvalidTransactionPlanError);
      const [step] = steps;
      assert(step);
      expect(() =>
        parseTransactionPlan(
          JSON.stringify({
            ...plan,
            steps: [
              {
                ...step,
                action: {
                  ...step.action,
                  signatureRequestIds: { morphoAuthorization: id },
                },
              },
            ],
          }),
        ),
      ).toThrow(InvalidTransactionPlanError);
    }
  },
);

async function prepareSignedAuthorization() {
  const handle = createMockClient(mainnet);
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
    result: nonce,
  });
  return prepareBlue(
    { client: handle.client, params: { ...params, supportSignature: true } },
    authOnly,
  );
}

test("does not read the nonce when BlueBundlesV1 is already authorized", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: blue,
    abi: blueAbi,
    functionName: "isAuthorized",
    result: true,
  });
  const { steps, signatureRequests, morphoAuthorizationRequestId } =
    await prepareBlue(
      { client: handle.client, params: { ...params, supportSignature: true } },
      authOnly,
    );
  expect(steps).toEqual([]);
  expect(signatureRequests).toEqual([]);
  expect(morphoAuthorizationRequestId).toBeUndefined();
});

async function getAuthorizationRequest() {
  const { signatureRequests } = await prepareSignedAuthorization();
  const [request] = signatureRequests;
  assert(request?.kind === "morphoAuthorization");
  return request;
}

test("prepares an authorization request for the operation with no standalone step", async () => {
  const { steps, signatureRequests, morphoAuthorizationRequestId } =
    await prepareSignedAuthorization();
  expect(steps).toEqual([]);
  expect(signatureRequests).toHaveLength(1);
  expect(signatureRequests[0]).toMatchObject({
    id,
    kind: "morphoAuthorization",
  });
  expect(morphoAuthorizationRequestId).toBe(id);
});

test("recovers a Morpho authorization signature offline", async () => {
  const request = await getAuthorizationRequest();
  const wrongSignature = await other.signTypedData(request.typedData);
  expect(() => verifyPlanSignature(request, wrongSignature)).toThrow(
    InvalidSignatureError,
  );
  const signature = await owner.signTypedData(request.typedData);
  expect(verifyPlanSignature(request, signature)).toBe(signature);
});

test.each([
  ["message.authorized", { authorized: other.address }],
  ["message.authorized", { authorized: "not an address" }],
  ["message.authorizer", { authorizer: other.address }],
  ["message.nonce", { nonce: nonce + 1n }],
  ["message.deadline", { deadline: deadline + 1n }],
  ["message.isAuthorized", { isAuthorized: false }],
] as const)("rejects a mismatched authorization %s", async (field, patch) => {
  const request = await getAuthorizationRequest();
  const bad = {
    ...request,
    typedData: {
      ...request.typedData,
      message: { ...request.typedData.message, ...patch },
    },
  };
  expect(() => validateMorphoAuthorizationRequest(bad, binding)).toThrow(
    new TransactionPlanSignatureMismatchError(id, field),
  );
});

test.each([
  ["args.owner", { args: { owner: other.address } }],
  ["args.authorized", { args: { authorized: other.address } }],
  ["args.nonce", { args: { nonce: nonce + 1n } }],
  ["args.deadline", { args: { deadline: deadline + 1n } }],
  ["domain.chainId", { domain: { chainId: base.id } }],
  [
    "domain.verifyingContract",
    { domain: { verifyingContract: other.address } },
  ],
] as const)(
  "binds signed authorization arguments and domain: %s",
  async (field, patch) => {
    const request = await getAuthorizationRequest();
    const bad = {
      ...request,
      signature: "0x01" as const,
      args: {
        ...request.args,
        ...("args" in patch ? patch.args : undefined),
      },
      typedData: {
        ...request.typedData,
        domain: {
          ...request.typedData.domain,
          ...("domain" in patch ? patch.domain : undefined),
        },
      },
    };
    expect(() => validateMorphoAuthorizationRequest(bad, binding)).toThrow(
      new TransactionPlanSignatureMismatchError(id, field),
    );
  },
);

test("validates the shape of a stored authorization request", async () => {
  const request = await getAuthorizationRequest();
  expect(() =>
    validateMorphoAuthorizationPlanRequest(request, "$"),
  ).not.toThrow();
  expect(() =>
    validateMorphoAuthorizationPlanRequest(
      { ...request, args: { ...request.args, owner: null } },
      "$",
    ),
  ).toThrow(InvalidTransactionPlanError);
  expect(() =>
    validateMorphoAuthorizationPlanRequest(
      { ...request, typedData: { ...request.typedData, primaryType: null } },
      "$",
    ),
  ).toThrow(InvalidTransactionPlanError);
});

test.each([0n, maxUint256])(
  "only resolves direct BlueBundlesV1 allowance, with allowance already %s",
  async (allowance) => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: allowance,
    });
    const { steps, signatureRequests } = await prepareBlue(
      { client: handle.client, params },
      fundingOnly,
    );
    expect(
      handle.request.mock.calls.map(([request]) => request),
    ).toContainEqual(
      expect.objectContaining({
        method: "eth_call",
        params: expect.arrayContaining([
          expect.objectContaining({
            to: usdc,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "allowance",
              args: [account, spender],
            }),
          }),
        ]),
      }),
    );
    expect(signatureRequests).toEqual([]);
    if (allowance === 0n) {
      expect(steps.map(({ action }) => action)).toEqual([
        {
          type: "erc20Approval",
          inputs: {
            chainId: mainnet.id,
            account,
            token: usdc,
            spender,
            assets: maxUint256,
          },
        },
      ]);
    } else {
      expect(steps).toEqual([]);
    }
  },
);

test("only resolves an ERC-2612 permit for BlueBundlesV1 with signature support", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  mockRead(handle, {
    address: usdc,
    abi: erc2612Abi,
    functionName: "nonces",
    result: nonce,
  });
  mockRead(handle, {
    address: usdc,
    abi: erc20Abi,
    functionName: "name",
    result: "USD Coin",
  });
  mockRead(handle, {
    address: usdc,
    abi: erc20Abi,
    functionName: "decimals",
    result: 6,
  });
  mockRead(handle, {
    address: usdc,
    abi: erc20Abi,
    functionName: "symbol",
    result: "USDC",
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
  const { steps, signatureRequests } = await prepareBlue(
    {
      client: handle.client,
      params: { ...params, supportSignature: true, deployless: false },
    },
    fundingOnly,
  );
  expect(steps).toEqual([]);
  expect(signatureRequests).toEqual([
    expect.objectContaining({
      kind: "permit",
      id: "blue:tokenPermit",
      args: { spender, amount: 100n, deadline, nonce },
    }),
  ]);
});
