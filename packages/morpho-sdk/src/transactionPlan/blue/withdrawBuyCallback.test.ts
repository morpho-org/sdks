import {
  AccrualPosition,
  Market,
  type MarketId,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import {
  getChainAddress,
  UnsupportedChainIdError,
} from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  type Chain,
  concatHex,
  defineChain,
  zeroAddress,
} from "viem";
import { base, mainnet } from "viem/chains";
import { expect, test } from "vitest";
import {
  blueAbi,
  midnightBlueBuyCallbackAbi,
  midnightBlueBuyCallbackFactoryAbi,
} from "../../abis.js";
import { blueWithdrawBuyCallback } from "../../actions/blue/withdrawBuyCallback.js";
import {
  AccrualPositionUserMismatchError,
  BlueBuyCallbackOwnerMismatchError,
  BlueBuyCallbackUnauthorizedError,
  ChainIdMismatchError,
  EmptyBlueSupplyPositionError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InsufficientBlueLiquidityError,
  MarketIdMismatchError,
  MissingAccrualPositionError,
  MissingContractCodeError,
  NotBlueBuyCallbackError,
} from "../../types/index.js";
import {
  BlueSnapshotChainMismatchError,
  BlueSnapshotStateMismatchError,
  InvalidCalldataOriginError,
  InvalidTransactionPlanError,
  NonIntegerInputError,
  ZeroAccountError,
} from "../error.js";
import { buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import { prepareBlueWithdrawBuyCallback } from "./withdrawBuyCallback.js";

const account: Address = "0x00000000000000000000000000000000000000A1";
const otherAddress: Address = "0x00000000000000000000000000000000000000A2";
const callbackAddress: Address = "0x00000000000000000000000000000000000000C1";
const marketParams = new MarketParams({
  loanToken: "0x0000000000000000000000000000000000000011",
  collateralToken: "0x0000000000000000000000000000000000000012",
  oracle: "0x0000000000000000000000000000000000000013",
  irm: "0x0000000000000000000000000000000000000014",
  lltv: 860000000000000000n,
});
const otherMarketParams = new MarketParams({
  ...marketParams,
  lltv: 945000000000000000n,
});
const unhashedParams: MarketParams = Object.assign(
  Object.create(MarketParams.prototype),
  { ...marketParams, lltv: 945000000000000000n },
);
// Built at runtime: the address lint checksums every hex address literal.
const badChecksum = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed".replace(
  "F3E9",
  "f3E9",
) as Address;
const unregisteredChain = defineChain({ ...mainnet, id: 999_999 });
const blue = getChainAddress(mainnet.id, "blue");
const factory = getChainAddress(mainnet.id, "midnightBlueBuyCallbackFactory");

const positionOf = ({
  supplyShares = 10n ** 18n,
  totalSupplyAssets = 10n ** 24n,
  totalSupplyShares = 10n ** 24n,
  totalBorrowAssets = 10n ** 24n / 2n,
  user = callbackAddress,
  params = marketParams,
}: {
  supplyShares?: bigint;
  totalSupplyAssets?: bigint;
  totalSupplyShares?: bigint;
  totalBorrowAssets?: bigint;
  user?: Address;
  params?: MarketParams;
} = {}) =>
  new AccrualPosition(
    { user, supplyShares, borrowShares: 0n, collateral: 0n },
    new Market({
      params,
      totalSupplyAssets,
      totalBorrowAssets,
      totalSupplyShares,
      totalBorrowShares: totalBorrowAssets,
      lastUpdate: 1_700_000_000n,
      fee: 0n,
      price: ORACLE_PRICE_SCALE,
      rateAtTarget: 0n,
    }),
  );

const withMarketId = (position: AccrualPosition, marketId: MarketId) =>
  Object.defineProperty(position, "marketId", { value: marketId });

const paramsOf = (position = positionOf()) => ({
  chainId: mainnet.id,
  account,
  callbackAddress,
  now: 1_700_000_000n,
  expiresAt: 1_700_003_600,
  marketId: marketParams.id,
  marketData: { chainId: mainnet.id, market: position.market },
  positionData: { chainId: mainnet.id, position },
});

const callbackClient = ({
  isBlueBuyCallback = true,
  owner = account,
  isAuthorized = true,
}: {
  isBlueBuyCallback?: boolean;
  owner?: Address;
  isAuthorized?: boolean;
} = {}) => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: factory,
    abi: midnightBlueBuyCallbackFactoryAbi,
    functionName: "isBlueBuyCallback",
    result: isBlueBuyCallback,
  });
  mockRead(handle, {
    address: callbackAddress,
    abi: midnightBlueBuyCallbackAbi,
    functionName: "OWNER",
    result: owner,
  });
  mockRead(handle, {
    address: blue,
    abi: blueAbi,
    functionName: "isAuthorized",
    result: isAuthorized,
  });
  return handle;
};

test("default: one direct Blue withdrawal of every callback share, with no prerequisites", async () => {
  const position = positionOf();
  const plan = await prepareBlueWithdrawBuyCallback(
    callbackClient().client,
    paramsOf(position),
  );
  expect(plan.signatureRequests).toEqual([]);
  expect(plan.steps).toEqual([
    {
      id: "blueWithdrawBuyCallback",
      label: "Withdraw BlueBuyCallback supply from Blue",
      action: {
        type: "blueWithdrawBuyCallback",
        inputs: {
          chainId: mainnet.id,
          account,
          marketParams: {
            loanToken: marketParams.loanToken,
            collateralToken: marketParams.collateralToken,
            oracle: marketParams.oracle,
            irm: marketParams.irm,
            lltv: marketParams.lltv,
          },
          callbackAddress,
          shares: position.supplyShares,
        },
      },
    },
  ]);
  expect(Object.isFrozen(plan.steps[0]?.action.inputs)).toBe(true);
  expect(buildTransactions(plan)).toEqual([
    blueWithdrawBuyCallback({
      market: { chainId: mainnet.id, marketParams },
      args: { callbackAddress, userAddress: account, shares: 10n ** 18n },
    }),
  ]);
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
});

test("behavior: appends the calldata origin to the withdrawal", async () => {
  const plan = await prepareBlueWithdrawBuyCallback(callbackClient().client, {
    ...paramsOf(),
    calldataOrigin: "0xcafe",
  });
  const [transaction] = buildTransactions(plan);
  const [plain] = buildTransactions(
    await prepareBlueWithdrawBuyCallback(callbackClient().client, paramsOf()),
  );
  expect(transaction?.data).toBe(concatHex([plain?.data ?? "0x", "0xcafe"]));
});

test("behavior: uses the validated inputs when options change during preparation", async () => {
  const params = paramsOf();
  const mutable = { ...params };
  const pending = prepareBlueWithdrawBuyCallback(
    callbackClient().client,
    mutable,
  );
  mutable.callbackAddress = otherAddress;
  mutable.account = otherAddress;
  await expect(pending).resolves.toEqual(
    await prepareBlueWithdrawBuyCallback(callbackClient().client, params),
  );
});

test.each([
  {
    name: "a missing position snapshot",
    params: { ...paramsOf(), positionData: undefined },
    error: MissingAccrualPositionError,
  },
  {
    name: "a snapshot of another account's position",
    params: paramsOf(positionOf({ user: account })),
    error: AccrualPositionUserMismatchError,
  },
  {
    name: "an empty callback position",
    params: paramsOf(positionOf({ supplyShares: 0n })),
    error: EmptyBlueSupplyPositionError,
  },
  {
    name: "a position larger than market liquidity",
    params: paramsOf(positionOf({ totalBorrowAssets: 10n ** 24n })),
    error: InsufficientBlueLiquidityError,
  },
  {
    name: "a position snapshot from another chain",
    params: {
      ...paramsOf(),
      positionData: { chainId: base.id, position: positionOf() },
    },
    error: BlueSnapshotChainMismatchError,
  },
  {
    name: "a market snapshot from another chain",
    params: {
      ...paramsOf(),
      marketData: { chainId: base.id, market: positionOf().market },
    },
    error: BlueSnapshotChainMismatchError,
  },
  {
    name: "a position snapshot from another market",
    params: {
      ...paramsOf(),
      positionData: {
        chainId: mainnet.id,
        position: positionOf({
          params: new MarketParams({
            ...marketParams,
            lltv: 945000000000000000n,
          }),
        }),
      },
    },
    error: MarketIdMismatchError,
  },
  {
    name: "a callback address that is not an address",
    params: { ...paramsOf(), callbackAddress: "0x1234" as Address },
    error: InvalidTransactionPlanError,
  },
  {
    name: "a callback address with a bad checksum",
    params: {
      ...paramsOf(positionOf({ user: badChecksum })),
      callbackAddress: badChecksum,
    },
    error: InvalidTransactionPlanError,
  },
  {
    name: "a chain without a registered Morpho Blue",
    chain: unregisteredChain,
    params: {
      ...paramsOf(),
      chainId: unregisteredChain.id,
      marketData: {
        chainId: unregisteredChain.id,
        market: positionOf().market,
      },
      positionData: { chainId: unregisteredChain.id, position: positionOf() },
    },
    error: UnsupportedChainIdError,
  },
  {
    name: "a client on another chain, even with an empty position",
    chain: base,
    params: paramsOf(positionOf({ supplyShares: 0n })),
    error: ChainIdMismatchError,
  },
  {
    name: "a position whose market tuple does not hash to its id",
    params: {
      ...paramsOf(),
      positionData: {
        chainId: mainnet.id,
        position: positionOf({ params: unhashedParams }),
      },
    },
    error: MarketIdMismatchError,
  },
  {
    name: "a position whose marketId names another market",
    params: {
      ...paramsOf(),
      positionData: {
        chainId: mainnet.id,
        position: withMarketId(positionOf(), otherMarketParams.id),
      },
    },
    error: MarketIdMismatchError,
  },
  {
    name: "a position whose market is another market than its marketId",
    params: {
      ...paramsOf(),
      positionData: {
        chainId: mainnet.id,
        position: withMarketId(
          positionOf({ params: otherMarketParams }),
          marketParams.id,
        ),
      },
    },
    error: MarketIdMismatchError,
  },
  {
    name: "a market snapshot whose state differs from the position's market",
    params: {
      ...paramsOf(),
      marketData: {
        chainId: mainnet.id,
        market: positionOf({ totalBorrowAssets: 10n ** 24n }).market,
      },
    },
    error: BlueSnapshotStateMismatchError,
  },
  {
    name: "supply shares above uint256",
    params: paramsOf(
      positionOf({
        supplyShares: 2n ** 256n,
        totalSupplyAssets: 2n ** 256n,
        totalSupplyShares: 2n ** 256n,
        totalBorrowAssets: 0n,
      }),
    ),
    error: InputExceedsMaxError,
  },
] satisfies readonly {
  readonly name: string;
  readonly params: object;
  readonly error: abstract new (...args: never[]) => Error;
  readonly chain?: Chain;
}[])(
  "error: rejects $name before any read",
  async ({ params, error, ...row }) => {
    const chain: Chain | undefined = "chain" in row ? row.chain : undefined;
    const handle = chain ? createMockClient(chain) : callbackClient();
    await expect(
      prepareBlueWithdrawBuyCallback(
        handle.client,
        params as ReturnType<typeof paramsOf>,
      ),
    ).rejects.toThrow(error);
    expect(handle.request).not.toHaveBeenCalled();
  },
);

test.each([
  {
    name: "ZeroAccountError for the zero account",
    intent: { account: zeroAddress },
    error: ZeroAccountError,
  },
  {
    name: "NonIntegerInputError for a fractional expiresAt",
    intent: { expiresAt: 1.5 },
    error: NonIntegerInputError,
  },
  {
    name: "ExpiredDeadlineError for expiresAt at the reference time",
    intent: { expiresAt: Number(paramsOf().now) },
    error: ExpiredDeadlineError,
  },
  ...(["0x", "0xabc", "0xzz"] as const).map((calldataOrigin) => ({
    name: `InvalidCalldataOriginError for calldataOrigin "${calldataOrigin}"`,
    intent: { calldataOrigin },
    error: InvalidCalldataOriginError,
  })),
  {
    name: "InvalidTransactionPlanError for a calldataOrigin over 1 MiB",
    intent: {
      calldataOrigin: `0x${"ab".repeat(1024 * 1024 + 1)}` as const,
    },
    error: InvalidTransactionPlanError,
  },
])("error: rejects $name before any read", async ({ intent, error }) => {
  const handle = callbackClient();
  await expect(
    prepareBlueWithdrawBuyCallback(handle.client, {
      ...paramsOf(),
      ...intent,
    }),
  ).rejects.toBeInstanceOf(error);
  expect(handle.request).not.toHaveBeenCalled();
});

test("behavior: accepts supply assets equal to the market's liquidity", async () => {
  const { supplyAssets } = positionOf();
  const position = positionOf({ totalBorrowAssets: 10n ** 24n - supplyAssets });
  expect(position.market.liquidity).toBe(supplyAssets);
  const plan = await prepareBlueWithdrawBuyCallback(
    callbackClient().client,
    paramsOf(position),
  );
  expect(plan.steps[0]?.action.inputs).toMatchObject({
    shares: position.supplyShares,
  });
});

test("behavior: building the plan leaves the MarketParams registry entry untouched", async () => {
  const cached = MarketParams.get(marketParams.id);
  const plan = await prepareBlueWithdrawBuyCallback(
    callbackClient().client,
    paramsOf(),
  );
  buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan)));
  expect(MarketParams.get(marketParams.id)).toBe(cached);
});

test.each([
  {
    name: "an address the factory did not create",
    reads: { isBlueBuyCallback: false },
    error: NotBlueBuyCallbackError,
  },
  {
    name: "an account that is not the callback owner",
    reads: { owner: otherAddress },
    error: BlueBuyCallbackOwnerMismatchError,
  },
  {
    name: "an owner that Blue no longer authorizes for the callback",
    reads: { isAuthorized: false },
    error: BlueBuyCallbackUnauthorizedError,
  },
])("error: rejects $name", async ({ reads, error }) => {
  await expect(
    prepareBlueWithdrawBuyCallback(callbackClient(reads).client, paramsOf()),
  ).rejects.toThrow(error);
});

test("error: rejects a factory without code", async () => {
  const handle = callbackClient();
  const serve = handle.request.getMockImplementation();
  handle.request.mockImplementation(async (call) => {
    const [address] = (call.params ?? []) as [Address];
    return call.method === "eth_getCode" &&
      address.toLowerCase() === factory.toLowerCase()
      ? "0x"
      : serve?.(call);
  });
  await expect(
    prepareBlueWithdrawBuyCallback(handle.client, paramsOf()),
  ).rejects.toThrow(MissingContractCodeError);
});

test.each([
  { name: "never settles", read: () => new Promise<never>(() => undefined) },
  {
    name: "fails",
    read: () => Promise.reject(new Error("factory eth_getCode failed")),
  },
])(
  "error: reports Blue's missing code when the factory code read $name",
  async ({ read }) => {
    const handle = callbackClient();
    const serve = handle.request.getMockImplementation();
    handle.request.mockImplementation(async (call) => {
      const [address] = (call.params ?? []) as [Address];
      if (call.method !== "eth_getCode") {
        return serve?.(call);
      }
      if (address.toLowerCase() === blue.toLowerCase()) {
        return "0x";
      }
      return address.toLowerCase() === factory.toLowerCase()
        ? read()
        : serve?.(call);
    });
    await expect(
      prepareBlueWithdrawBuyCallback(handle.client, paramsOf()),
    ).rejects.toEqual(new MissingContractCodeError(blue, mainnet.id, "blue"));
  },
);

test("error: rejects an RPC that serves another chain before any ownership read", async () => {
  const handle = callbackClient();
  const serve = handle.request.getMockImplementation();
  handle.request.mockImplementation(async (call) =>
    call.method === "eth_chainId" ? "0x2105" : serve?.(call),
  );
  await expect(
    prepareBlueWithdrawBuyCallback(handle.client, paramsOf()),
  ).rejects.toThrow(ChainIdMismatchError);
  expect(
    handle.request.mock.calls.filter(([call]) => call.method === "eth_call"),
  ).toHaveLength(0);
});

test.each([
  { field: "callbackAddress", value: "0x1234" },
  { field: "shares", value: -1n },
  { field: "marketParams", value: null },
])(
  "error: parse rejects a stored $field that is not well formed",
  async ({ field, value }) => {
    const path = `$.steps[0].action.inputs.${field}`;
    const plan = structuredClone(
      await prepareBlueWithdrawBuyCallback(callbackClient().client, paramsOf()),
    );
    Object.assign(plan.steps[0]?.action.inputs ?? {}, { [field]: value });
    expect(() => parseTransactionPlan(serializeTransactionPlan(plan))).toThrow(
      expect.objectContaining({ path }) as InvalidTransactionPlanError,
    );
  },
);

test.each([
  { field: "loanToken", value: "0x1234" },
  { field: "lltv", value: -1n },
])(
  "error: parse rejects a stored market tuple whose $field is not well formed",
  async ({ field, value }) => {
    const path = `$.steps[0].action.inputs.marketParams.${field}`;
    const plan = structuredClone(
      await prepareBlueWithdrawBuyCallback(callbackClient().client, paramsOf()),
    );
    const inputs = plan.steps[0]?.action.inputs as {
      marketParams: Record<string, unknown>;
    };
    Object.assign(inputs.marketParams, { [field]: value });
    expect(() => parseTransactionPlan(serializeTransactionPlan(plan))).toThrow(
      expect.objectContaining({ path }) as InvalidTransactionPlanError,
    );
  },
);
