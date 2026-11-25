import {
  AccrualPosition,
  getChainAddresses,
  Market,
  type MarketId,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  BaseError,
  decodeFunctionData,
  maxUint256,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";
import { assert, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import { blueRefinance } from "../../actions/blue/refinance.js";
import { DEFAULT_LLTV_BUFFER } from "../../constants.js";
import {
  AccrualPositionUserMismatchError,
  BorrowExceedsSafeLtvError,
  InvalidReallocationAddressError,
  InvalidReallocationSourceTypeError,
  InvalidVaultV2BlueReallocationShapeError,
  MarketIdMismatchError,
  MissingContractCodeError,
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
import {
  type BlueRefinancePlanParams,
  prepareBlueRefinance,
} from "./refinance.js";

const chainId = mainnet.id;
const { blue, usdc, wNative } = getChainAddresses(chainId);
const owner = privateKeyToAccount(toHex(1n, { size: 32 }));
const now = 100n;
const nonce = 7n;

function snapshot(
  lltv: bigint,
  { borrowShares, collateral } = { borrowShares: 0n, collateral: 0n },
) {
  assert(usdc && wNative);
  const market = new Market({
    params: new MarketParams({
      loanToken: usdc,
      collateralToken: wNative,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv,
    }),
    price: 10n ** 36n,
    totalSupplyAssets: 1_000n,
    totalSupplyShares: 1_000_000_000n,
    totalBorrowAssets: borrowShares / 1_000_000n,
    totalBorrowShares: borrowShares,
    lastUpdate: now,
    fee: 0n,
  });
  const position = new AccrualPosition(
    { user: owner.address, supplyShares: 0n, borrowShares, collateral },
    market,
  );
  return {
    marketId: market.id,
    marketData: { chainId, market },
    positionData: { chainId, position },
  };
}

function fixture() {
  const mock = createMockClient(mainnet);
  mockRead(mock, {
    address: blue,
    abi: blueAbi,
    functionName: "isAuthorized",
    result: false,
  });
  mockRead(mock, {
    address: blue,
    abi: blueAbi,
    functionName: "nonce",
    result: nonce,
  });
  const params = {
    chainId,
    account: owner.address,
    source: snapshot(945_000000000000000n, {
      borrowShares: 100_000_000n,
      collateral: 1_000n,
    }),
    destination: snapshot(860_000000000000000n),
    supportSignature: true,
    now,
    expiresAt: 200,
  } satisfies BlueRefinancePlanParams;
  return { ...mock, params };
}

test.each(["source", "destination"] as const)(
  "ignores unrelated fields on the %s snapshot",
  async (side) => {
    const { client, params } = fixture();
    const expected = await prepareBlueRefinance(client, params);
    const snapshotWithExtras = {
      ...params[side],
      chainId: base.id,
      account: zeroAddress,
      referralFee: { bps: 1, recipient: owner.address },
    };
    const actual = await prepareBlueRefinance(client, {
      ...params,
      [side]: snapshotWithExtras,
    });
    expect(actual).toEqual(expected);
  },
);

test.each(["source", "destination"] as const)(
  "rejects a malformed %s market address before RPC reads even when its ID matches",
  async (side) => {
    const { client, params, request } = fixture();
    const sideSnapshot = params[side];
    const market = new Market({
      ...sideSnapshot.marketData.market,
      params: new MarketParams({
        ...sideSnapshot.marketData.market.params,
        oracle: "0x0",
      }),
    });
    expect(market.id).toBe(sideSnapshot.marketId);
    await expect(
      prepareBlueRefinance(client, {
        ...params,
        [side]: { ...sideSnapshot, marketData: { chainId, market } },
      }),
    ).rejects.toBeInstanceOf(InvalidTransactionPlanError);
    expect(request).not.toHaveBeenCalled();
  },
);

test.each(
  (
    [
      ["vault address", { vault: "invalid" }, InvalidReallocationAddressError],
      [
        "adapter address",
        { to: { adapter: "invalid" } },
        InvalidReallocationAddressError,
      ],
      [
        "source type",
        { from: { type: "unknown" } },
        InvalidReallocationSourceTypeError,
      ],
      [
        "Vault V1 shape",
        { withdrawals: [] },
        InvalidVaultV2BlueReallocationShapeError,
      ],
    ] as const
  ).map(([name, invalid, error]) => ({ name, invalid, error })),
)(
  "preserves the shared reallocation error for $name",
  async ({ invalid, error }) => {
    const { client, params, request } = fixture();
    const reallocation = {
      vault: owner.address,
      from: { type: "idle" as const },
      to: { adapter: owner.address },
      assets: 1n,
      penalty: 0n,
      ...invalid,
    };
    await expect(
      prepareBlueRefinance(client, {
        ...params,
        reallocations: [
          reallocation,
        ] as BlueRefinancePlanParams["reallocations"],
      }),
    ).rejects.toBeInstanceOf(error);
    expect(request).not.toHaveBeenCalled();
  },
);

test("rejects a malformed zero-fee recipient before any RPC read", async () => {
  const { client, params, request } = fixture();
  await expect(
    prepareBlueRefinance(client, {
      ...params,
      referralFee: { bps: 0, recipient: "0x1234" },
    }),
  ).rejects.toBeInstanceOf(InvalidTransactionPlanError);
  expect(request).not.toHaveBeenCalled();
});

test("a valid zero-fee recipient survives restoration", async () => {
  const { client, params } = fixture();
  const plan = await prepareBlueRefinance(client, {
    ...params,
    referralFee: { bps: 0, recipient: owner.address },
  });
  expect(parseTransactionPlan(serializeTransactionPlan(plan))).toEqual(plan);
});

test("rejects reallocation market parameters that cannot be restored before RPC reads", async () => {
  const { client, params, request } = fixture();
  const marketParams = snapshot(800_000000000000000n).marketData.market.params;
  const { loanToken, collateralToken, oracle, irm, lltv } = marketParams;
  await expect(
    prepareBlueRefinance(client, {
      ...params,
      reallocations: [
        {
          vault: owner.address,
          from: {
            type: "market",
            adapter: owner.address,
            marketParams: {
              loanToken,
              collateralToken,
              oracle,
              irm,
              lltv,
            } as MarketParams,
          },
          to: { adapter: owner.address },
          assets: 1n,
          penalty: 0n,
        },
      ],
    }),
  ).rejects.toBeInstanceOf(MarketIdMismatchError);
  expect(request).not.toHaveBeenCalled();
});

test.each([
  { field: "penalty", value: -1n, name: "NegativeInputError" },
  { field: "penalty", value: maxUint256 + 1n, name: "InputExceedsMaxError" },
  { field: "assets", value: -1n, name: "NonPositiveInputError" },
  { field: "assets", value: 0n, name: "NonPositiveInputError" },
  { field: "assets", value: maxUint256 + 1n, name: "InputExceedsMaxError" },
] as const)(
  "preserves the typed error for reallocation $field = $value before RPC",
  async ({ field, value, name }) => {
    const { client, params, request } = fixture();
    await expect(
      prepareBlueRefinance(client, {
        ...params,
        reallocations: [
          {
            vault: owner.address,
            from: { type: "idle" },
            to: { adapter: owner.address },
            assets: 1n,
            penalty: 0n,
            [field]: value,
          },
        ],
      }),
    ).rejects.toMatchObject({ name, field: `reallocation.${field}` });
    expect(request).not.toHaveBeenCalled();
  },
);

test("a restored plan encodes the nonzero referral fee and recipient", async () => {
  const { client, params } = fixture();
  const plan = await prepareBlueRefinance(client, {
    ...params,
    supportSignature: false,
    referralFee: { bps: 125, recipient: owner.address },
  });
  const [tx] = buildTransactions(
    parseTransactionPlan(serializeTransactionPlan(plan)),
  ).slice(-1);
  assert(tx);
  const decoded = decodeFunctionData({ abi: blueBundlesV1Abi, data: tx.data });
  assert(decoded.functionName === "blueBundlesV1MigrateBorrowPosition");
  expect(decoded.args[5]).toBe(12_500_000_000_000_000n);
  expect(decoded.args[6]).toBe(owner.address);
});

test("the referral fee can push the migration above buffered LLTV", async () => {
  const { client, params } = fixture();
  const nearLimit = {
    ...params,
    source: snapshot(945_000000000000000n, {
      borrowShares: 850_000_000n,
      collateral: 1_000n,
    }),
  };
  await expect(prepareBlueRefinance(client, nearLimit)).resolves.toBeDefined();
  await expect(
    prepareBlueRefinance(client, {
      ...nearLimit,
      referralFee: { bps: 125, recipient: owner.address },
    }),
  ).rejects.toBeInstanceOf(BorrowExceedsSafeLtvError);
});

test("rejects a destination snapshot from another chain before any RPC read", async () => {
  const { client, params, request } = fixture();
  await expect(
    prepareBlueRefinance(client, {
      ...params,
      destination: {
        ...params.destination,
        positionData: { ...params.destination.positionData, chainId: base.id },
      },
    }),
  ).rejects.toBeInstanceOf(BlueSnapshotChainMismatchError);
  expect(request).not.toHaveBeenCalled();
});

test("rejects a mismatched destination position market before any RPC read", async () => {
  const { client, params, request } = fixture();
  await expect(
    prepareBlueRefinance(client, {
      ...params,
      destination: {
        ...params.destination,
        positionData: params.source.positionData,
      },
    }),
  ).rejects.toBeInstanceOf(MarketIdMismatchError);
  expect(request).not.toHaveBeenCalled();
});

test("accepts the same destination market ID in uppercase hex", async () => {
  const { client, params } = fixture();
  const { destination } = params;
  const marketId =
    `0x${destination.marketId.slice(2).toUpperCase()}` as MarketId;
  await expect(
    prepareBlueRefinance(client, {
      ...params,
      destination: { ...destination, marketId },
    }),
  ).resolves.toEqual(await prepareBlueRefinance(client, params));
});

test("rejects a destination position for another account before any RPC read", async () => {
  const { client, params, request } = fixture();
  const { destination } = params;
  const { position } = destination.positionData;
  await expect(
    prepareBlueRefinance(client, {
      ...params,
      destination: {
        ...destination,
        positionData: {
          chainId,
          position: new AccrualPosition(
            { ...position, user: zeroAddress },
            position.market,
          ),
        },
      },
    }),
  ).rejects.toBeInstanceOf(AccrualPositionUserMismatchError);
  expect(request).not.toHaveBeenCalled();
});

test("rejects a missing BlueBundlesV1 deployment before reading authorization", async () => {
  const { client, params, request } = fixture();
  const role = "bundles.blueBundlesV1";
  const address = getChainAddress(chainId, role);
  const respond = request.getMockImplementation();
  assert(respond);
  request.mockImplementation(async (args) =>
    args.method === "eth_getCode" && args.params?.[0] === address
      ? "0x"
      : respond(args),
  );

  const failure = await prepareBlueRefinance(client, params).catch(
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(MissingContractCodeError);
  expect(failure).toMatchObject({ address, chainId, role });
  expect(request).not.toHaveBeenCalledWith(
    expect.objectContaining({ method: "eth_call" }),
  );
});

test("propagates bytecode RPC errors without reading authorization", async () => {
  const { client, params, request } = fixture();
  const respond = request.getMockImplementation();
  assert(respond);
  request.mockImplementation(async (args) => {
    if (args.method === "eth_getCode") {
      throw new BaseError("RPC unavailable");
    }
    return respond(args);
  });

  const failure = await prepareBlueRefinance(client, params).catch(
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(BaseError);
  expect(failure).toMatchObject({
    message: expect.stringContaining("RPC unavailable"),
  });
  expect(request).not.toHaveBeenCalledWith(
    expect.objectContaining({ method: "eth_call" }),
  );
});

test("a missing inline authorization reports the referenced request ID", async () => {
  const { client, params } = fixture();
  const plan = await prepareBlueRefinance(client, params);
  const [request] = getPendingSignatureRequests(plan);
  assert(request?.kind === "morphoAuthorization");
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "blueRefinance",
  ]);
  for (const candidate of [plan, { ...plan, signatureRequests: [] }]) {
    expect(() => buildTransactions(candidate)).toThrow(
      IncompleteTransactionPlanError,
    );
    expect(() => buildTransactions(candidate)).toThrow(
      expect.objectContaining({ id: request.id }),
    );
  }
});

test("a signed plan resumes byte-identically and matches the pure action encoder", async () => {
  const { client, params } = fixture();
  const plan = await prepareBlueRefinance(client, params);
  const [request] = getPendingSignatureRequests(plan);
  assert(request?.kind === "morphoAuthorization");
  const signature = await owner.signTypedData(request.typedData);
  const signed = applySignatures(plan, [{ id: request.id, signature }]);
  const parsed = parseTransactionPlan(serializeTransactionPlan(signed));
  const [tx] = buildTransactions(parsed);
  assert(tx);
  expect(buildTransactions(parsed)).toEqual(buildTransactions(signed));

  const sourceMarketParams = params.source.marketData.market.params;
  const destinationMarketParams = params.destination.marketData.market.params;
  const { authorized, deadline } = request.args;
  expect(tx).toEqual(
    blueRefinance({
      market: { chainId, sourceMarketParams, destinationMarketParams },
      args: {
        userAddress: params.account,
        maxLtv: destinationMarketParams.lltv - DEFAULT_LLTV_BUFFER,
        deadline: BigInt(params.expiresAt),
        authorizationSignature: {
          args: { ...request.args, isAuthorized: true, signature },
          action: {
            type: "authorization",
            args: { authorized, isAuthorized: true, deadline },
          },
        },
      },
    }),
  );
});

test("malformed stored market inputs, reallocations and authorization are rejected", async () => {
  const { client, params } = fixture();
  const plan = await prepareBlueRefinance(client, params);
  const [step] = plan.steps;
  assert(step?.action.type === "blueRefinance");
  const { action } = step;
  for (const patch of [
    { inputs: { ...action.inputs, maxLtv: "bad" } },
    {
      inputs: {
        ...action.inputs,
        sourceMarketParams: { ...action.inputs.sourceMarketParams, irm: "bad" },
      },
    },
    {
      inputs: {
        ...action.inputs,
        reallocations: [
          {
            vault: owner.address,
            from: { type: "wrong" },
            to: { adapter: owner.address },
            assets: 1n,
            penalty: 0n,
          },
        ],
      },
    },
    { inputs: { ...action.inputs, authorizationNonce: "bad" } },
    {
      signatureRequestIds: {
        ...action.signatureRequestIds,
        tokenPermit: "not-a-permit",
      },
    },
  ]) {
    const malformed = {
      ...plan,
      steps: [{ ...step, action: { ...action, ...patch } }],
    };
    expect(() =>
      parseTransactionPlan(
        serializeTransactionPlan(malformed as unknown as typeof plan),
      ),
    ).toThrow(InvalidTransactionPlanError);
  }
});

test("the stored migration binds the inline authorization nonce", async () => {
  const { client, params } = fixture();
  const plan = await prepareBlueRefinance(client, params);
  const [step] = plan.steps;
  assert(step?.action.type === "blueRefinance");
  const modified = {
    ...plan,
    steps: [
      {
        ...step,
        action: {
          ...step.action,
          inputs: { ...step.action.inputs, authorizationNonce: nonce + 1n },
        },
      },
    ],
  };
  expect(() => getPendingSignatureRequests(modified)).toThrow(
    TransactionPlanSignatureMismatchError,
  );
  expect(() =>
    parseTransactionPlan(serializeTransactionPlan(modified)),
  ).toThrow(InvalidTransactionPlanError);
});

test("stored format-2 refinance with direct authorization builds unchanged", () => {
  const storedPlan =
    '{"version":2,"account":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","chainId":1,"expiresAt":2000000000,"steps":[{"id":"blueRefinance:morphoAuthorization","label":"Authorize BlueBundlesV1 on Morpho","action":{"type":"morphoAuthorization","inputs":{"chainId":1,"account":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"}}},{"id":"blueRefinance","label":"Refinance Blue borrow position","action":{"type":"blueRefinance","inputs":{"chainId":1,"account":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","sourceMarketParams":{"collateralToken":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2","loanToken":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","oracle":"0x0000000000000000000000000000000000000000","irm":"0x0000000000000000000000000000000000000000","lltv":{"$bigint":"945000000000000000"},"id":"0xe0dead308779aa590d1c7d3c9ed1205581b90d0e6c606213b05cc651036fadc8","liquidationIncentiveFactor":{"$bigint":"1016776817488561260"}},"destinationMarketParams":{"collateralToken":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2","loanToken":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","oracle":"0x0000000000000000000000000000000000000000","irm":"0x0000000000000000000000000000000000000000","lltv":{"$bigint":"860000000000000000"},"id":"0xacf74c3bdb967249dca135a6ca9041cabd1b6638b763a4bd5ca22368a14887ec","liquidationIncentiveFactor":{"$bigint":"1043841336116910229"}},"maxLtv":{"$bigint":"855000000000000000"},"deadline":{"$bigint":"2000000000"},"referralFeePct":{"$bigint":"0"},"referralFeeRecipient":"0x0000000000000000000000000000000000000000","reallocations":[]},"signatureRequestIds":{}}}],"signatureRequests":[]}';
  expect(
    buildTransactions(parseTransactionPlan(storedPlan)).map(
      ({ to, data, value }) => ({ to, data, value }),
    ),
  ).toEqual([
    {
      to: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      data: "0xeecea00000000000000000000000000038b0c12ab81976e9417d4ebfe2a34db6df22e6ad0000000000000000000000000000000000000000000000000000000000000001",
      value: 0n,
    },
    {
      to: "0x38B0C12AB81976e9417D4ebfe2A34DB6DF22e6AD",
      data: "0x9834e387000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d1d507e40be8000000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000bef55718ad600000000000000000000000000000000000000000000000000000bdd91f852f580000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000773594000000000000000000000000000000000000000000000000000000000000000000",
      value: 0n,
    },
  ]);
});

test("stored format-2 refinance with inline authorization builds unchanged", () => {
  const storedPlan =
    '{"version":2,"account":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","chainId":1,"expiresAt":2000000000,"steps":[{"id":"blueRefinance","label":"Refinance Blue borrow position","action":{"type":"blueRefinance","inputs":{"chainId":1,"account":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","sourceMarketParams":{"collateralToken":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2","loanToken":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","oracle":"0x0000000000000000000000000000000000000000","irm":"0x0000000000000000000000000000000000000000","lltv":{"$bigint":"945000000000000000"},"id":"0xe0dead308779aa590d1c7d3c9ed1205581b90d0e6c606213b05cc651036fadc8","liquidationIncentiveFactor":{"$bigint":"1016776817488561260"}},"destinationMarketParams":{"collateralToken":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2","loanToken":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","oracle":"0x0000000000000000000000000000000000000000","irm":"0x0000000000000000000000000000000000000000","lltv":{"$bigint":"860000000000000000"},"id":"0xacf74c3bdb967249dca135a6ca9041cabd1b6638b763a4bd5ca22368a14887ec","liquidationIncentiveFactor":{"$bigint":"1043841336116910229"}},"maxLtv":{"$bigint":"855000000000000000"},"deadline":{"$bigint":"2000000000"},"referralFeePct":{"$bigint":"0"},"referralFeeRecipient":"0x0000000000000000000000000000000000000000","reallocations":[],"authorizationNonce":{"$bigint":"7"}},"signatureRequestIds":{"morphoAuthorization":"blueRefinance:morphoAuthorization"}}}],"signatureRequests":[{"id":"blueRefinance:morphoAuthorization","kind":"morphoAuthorization","args":{"authorized":"0x38B0C12AB81976e9417D4ebfe2A34DB6DF22e6AD","owner":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","nonce":{"$bigint":"7"},"deadline":{"$bigint":"2000000000"}},"typedData":{"domain":{"chainId":1,"verifyingContract":"0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"},"types":{"Authorization":[{"name":"authorizer","type":"address"},{"name":"authorized","type":"address"},{"name":"isAuthorized","type":"bool"},{"name":"nonce","type":"uint256"},{"name":"deadline","type":"uint256"}]},"message":{"authorizer":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","authorized":"0x38B0C12AB81976e9417D4ebfe2A34DB6DF22e6AD","isAuthorized":true,"nonce":{"$bigint":"7"},"deadline":{"$bigint":"2000000000"}},"primaryType":"Authorization"},"signature":"0xb1ee532cb19370d21e96c17da63fc5f53ed3335c58287d54b83f10f4ff982ecf4092c8860d86bc0f709a127e6bbcd8acd142c236cf39594b9329a54a078d1c541b"}]}';
  expect(
    buildTransactions(parseTransactionPlan(storedPlan)).map(
      ({ to, data, value }) => ({ to, data, value }),
    ),
  ).toEqual([
    {
      to: "0x38B0C12AB81976e9417D4ebfe2A34DB6DF22e6AD",
      data: "0x9834e387000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d1d507e40be8000000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000bef55718ad600000000000000000000000000000000000000000000000000000bdd91f852f58000000000000000000000000000000000000000000000000000000000000000001bb1ee532cb19370d21e96c17da63fc5f53ed3335c58287d54b83f10f4ff982ecf4092c8860d86bc0f709a127e6bbcd8acd142c236cf39594b9329a54a078d1c540000000000000000000000000000000000000000000000000000000000000007000000000000000000000000000000000000000000000000000000007735940000000000000000000000000000000000000000000000000000000000000002800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000773594000000000000000000000000000000000000000000000000000000000000000000",
      value: 0n,
    },
  ]);
});
