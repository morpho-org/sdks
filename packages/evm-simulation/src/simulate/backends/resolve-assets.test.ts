import { MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi, midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { MarketParams as MidnightMarketParams } from "@morpho-org/morpho-sdk/midnight/entities";
import { MarketUtils as MidnightMarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  erc4626Abi,
  ethAddress,
  HttpRequestError,
  parseAbi,
  RpcRequestError,
  TimeoutError,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  RpcTransportError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import type { ParsedOperationLimit } from "../request/parse-request.js";
import { resolveAssets } from "./resolve-assets.js";

const vault = "0x0000000000000000000000000000000000000001";
const loan = "0x0000000000000000000000000000000000000002";
const collateral = "0x0000000000000000000000000000000000000003";
const marketId = new MarketParams({
  loanToken: loan,
  collateralToken: collateral,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
}).id;
const suppliedMidnightMarket = MidnightMarketUtils.toStruct(
  new MidnightMarketParams({
    chainId: mainnet.id,
    midnight: "0x0000000000000000000000000000000000000004",
    loanToken: loan,
    collateralParams: [
      {
        token: collateral,
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: zeroAddress,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  }),
);
const suppliedMidnightMarketId = MidnightMarketUtils.toId(
  suppliedMidnightMarket,
);
const limit: ParsedOperationLimit = {
  type: "vaultV2Deposit",
  vault,
  quote: { assetsPaid: 10n },
  slippageTolerance: 0n,
};

describe("resolveAssets", () => {
  test("input limits validate explicit assets and cache market parameters", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [loan, collateral, zeroAddress, zeroAddress, 0n],
    });
    const operations: ParsedOperationLimit[] = [
      {
        type: "blueSupply",
        marketId,
        inputs: { assets: 1n },
        assetPaid: loan,
        quote: { assetsPaid: 1n, sharesMinted: 1n },
        slippageTolerance: 0n,
      },
      {
        type: "blueBorrow",
        marketId,
        inputs: { assets: 1n },
        quote: { assetsReceived: 1n, sharesMinted: 1n },
        slippageTolerance: 0n,
      },
    ];
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations,
      blockNumber: 1n,
    });
    expect(result[0]?.assetsPaid).toBe(loan);
    expect(result[1]?.assetsReceived).toBe(loan);
    for (const resolved of result)
      expect(resolved.marketParams).toEqual({
        loanToken: loan,
        collateralToken: collateral,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      });
    expect(handle.request).toHaveBeenCalledTimes(1);
  });
  test.each(["assetsPaid", "assetsReceived"] as const)(
    "typed %s requires the canonical asset or a registered native alias",
    async (field) => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: vault,
        abi: erc4626Abi,
        functionName: "asset",
        result: loan,
      });
      for (const explicit of [
        undefined,
        loan,
        collateral,
        ethAddress,
      ] as const) {
        for (const wNative of [undefined, loan, collateral] as const) {
          const operation: ParsedOperationLimit = {
            type: field === "assetsPaid" ? "vaultV2Deposit" : "vaultV2Withdraw",
            vault,
            inputs: { assets: 10n },
            ...(field === "assetsPaid"
              ? { assetPaid: explicit }
              : { assetReceived: explicit }),
            quote: { [field]: 10n },
            slippageTolerance: 0n,
          };
          const resolve = (inputs: boolean) =>
            resolveAssets({
              client: handle.client,
              morpho: zeroAddress,
              wNative,
              operations: [
                inputs
                  ? operation
                  : {
                      type:
                        field === "assetsPaid"
                          ? "vaultV2Deposit"
                          : "vaultV2Withdraw",
                      vault,
                      assetPaid: field === "assetsPaid" ? explicit : undefined,
                      assetReceived:
                        field === "assetsReceived" ? explicit : undefined,
                      quote: { [field]: 10n },
                      slippageTolerance: 0n,
                    },
              ],
              blockNumber: 1n,
            });
          if (
            explicit === undefined ||
            explicit === loan ||
            (explicit === ethAddress && wNative === loan)
          )
            await expect(resolve(true)).resolves.toMatchObject([
              { [field]: loan },
            ]);
          else
            await expect(resolve(true)).rejects.toBeInstanceOf(
              SimulationValidationError,
            );
          await expect(resolve(false)).resolves.toMatchObject([
            { [field]: explicit ?? loan },
          ]);
        }
      }
    },
  );
  test("default: no limits cause no RPC reads", async () => {
    const handle = createMockClient(mainnet);
    expect(
      await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [],
        blockNumber: 1n,
      }),
    ).toEqual([]);
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("behavior: share-only and explicit-asset quotes cause no RPC reads", async () => {
    const handle = createMockClient(mainnet);
    const operations: ParsedOperationLimit[] = [
      { ...limit, quote: { sharesMinted: 1n } },
      { ...limit, assetPaid: loan },
    ];
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: zeroAddress,
      operations,
      blockNumber: 1n,
    });
    expect(result[0]).toEqual({ limit: operations[0] });
    expect(result[1]?.assetsPaid).toBe(loan);
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("behavior: Midnight Blue parking uses its loan token without metadata RPC reads", async () => {
    const handle = createMockClient(mainnet);
    const parking: ParsedOperationLimit = {
      type: "midnightSupplyBlueMakeLend",
      loanToken: loan,
      marketId,
      callbackSalt: marketId,
      quote: { assetsPaid: 10n, sharesMinted: 1n },
      slippageTolerance: 0n,
    };
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: zeroAddress,
      operations: [parking],
      blockNumber: 10n,
    });
    expect(result[0]?.assetsPaid).toBe(loan);
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("error: an unmeasurable repay-withdraw asset quote fails closed", async () => {
    const handle = createMockClient(mainnet);
    const invalidLimit: ParsedOperationLimit = {
      type: "midnightRepayWithdrawCollateral",
      marketId,
      quote: { assetsReceived: 1n },
      slippageTolerance: 0n,
    };
    const error = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: zeroAddress,
      operations: [invalidLimit],
      blockNumber: 1n,
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect(error).toHaveProperty(
      "message",
      expect.stringContaining(
        'Cannot resolve the asset source for "midnightRepayWithdrawCollateral" field "assetsReceived".',
      ),
    );
  });
  test("behavior: vault asset is pinned and deduplicated without factory or entity reads", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: vault,
      abi: erc4626Abi,
      functionName: "asset",
      result: loan,
    });
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: zeroAddress,
      operations: [limit, limit],
      blockNumber: 10n,
    });
    expect(result.map((r) => r.assetsPaid)).toEqual([loan, loan]);
    expect(handle.request).toHaveBeenCalledTimes(1);
    expect(handle.request.mock.calls[0]?.[0].params?.[1]).toBe("0xa");
  });
  test("behavior: combined actions choose collateral and loan tokens by direction", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [loan, collateral, zeroAddress, zeroAddress, 0n],
    });
    const operations: ParsedOperationLimit[] = [
      "blueSupplyCollateralBorrow",
      "blueRepayWithdrawCollateral",
    ].map((type) => ({
      type: type as
        | "blueSupplyCollateralBorrow"
        | "blueRepayWithdrawCollateral",
      marketId,
      quote: { assetsPaid: 1n, assetsReceived: 1n },
      slippageTolerance: 0n,
    }));
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: zeroAddress,
      operations,
      blockNumber: 1n,
    });
    expect(
      result.map(({ assetsPaid, assetsReceived }) => [
        assetsPaid,
        assetsReceived,
      ]),
    ).toEqual([
      [collateral, loan],
      [loan, collateral],
    ]);
    expect(handle.request).toHaveBeenCalledTimes(1);
  });
  test("behavior: combined Midnight supply maps collateral indices and loan proceeds", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: midnightAbi,
      functionName: "toMarket",
      result: {
        chainId: BigInt(mainnet.id),
        midnight: zeroAddress,
        loanToken: loan,
        collateralParams: [
          {
            token: collateral,
            lltv: 0n,
            liquidationCursor: 0n,
            oracle: zeroAddress,
          },
          {
            token: vault,
            lltv: 0n,
            liquidationCursor: 0n,
            oracle: zeroAddress,
          },
        ],
        maturity: 2_000_000_000n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      },
    });
    const operation: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId,
      quote: {
        collateralSupplies: [{ collateralIndex: 1n, assets: 10n }],
        unitsSold: 5n,
        assetsReceived: 5n,
      },
      slippageTolerance: 0n,
    };
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: zeroAddress,
      operations: [operation],
      blockNumber: 1n,
    });
    expect(result[0]?.assetsReceived).toBe(loan);
    expect(result[0]?.midnightCollateralTokens).toEqual([
      { collateralIndex: 1n, token: vault },
    ]);
  });
  test("behavior: an idle market resolves the loan token only", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [loan, zeroAddress, zeroAddress, zeroAddress, 0n],
    });
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: zeroAddress,
      operations: [
        {
          type: "blueSupply",
          marketId,
          quote: { assetsPaid: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    });
    expect(result[0]?.assetsPaid).toBe(loan);
  });
  test("error: a cached idle-market pair still rejects a zero token", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [loan, zeroAddress, zeroAddress, zeroAddress, 0n],
    });
    const request = resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: zeroAddress,
      operations: [
        {
          type: "blueRepayWithdrawCollateral",
          marketId,
          quote: { assetsPaid: 1n, assetsReceived: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    });
    await expect(request).rejects.toThrowError(
      expect.objectContaining({
        name: "SlippageCheckUnavailableError",
        message: expect.stringContaining("the resolved token address is zero"),
      }),
    );
    await expect(request).rejects.toBeInstanceOf(SlippageCheckUnavailableError);
    expect(
      handle.request.mock.calls.filter(
        (call) => (call[0] as { method: string }).method === "eth_call",
      ),
    ).toHaveLength(1);
  });
  test("error: reverted metadata read becomes missing evidence", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new ContractFunctionRevertedError({
        abi: erc4626Abi,
        functionName: "asset",
      }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(SlippageCheckUnavailableError);
  });
  test("error: a revert nested in an rpc error stays missing evidence", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new RpcRequestError({
        body: {},
        url: "https://rpc.example",
        error: {
          code: 3,
          message: "execution reverted",
          data: encodeErrorResult({
            abi: parseAbi(["error Error(string reason)"]),
            errorName: "Error",
            args: ["execution reverted"],
          }),
        },
      }),
    );
    const error = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: zeroAddress,
      operations: [limit],
      blockNumber: 1n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect(error).not.toHaveProperty("context");
    const chain = (error as SlippageCheckUnavailableError).cause;
    expect(chain).toBeInstanceOf(BaseError);
    const names: string[] = [];
    let node = chain as { constructor: { name: string }; cause?: unknown };
    while (node) {
      names.push(node.constructor.name);
      node = node.cause as typeof node;
    }
    expect(names).toContain("RpcRequestError");
    expect(names).toContain("ContractFunctionRevertedError");
  });
  test("error: a message-only -32000 revert becomes missing evidence", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new RpcRequestError({
        body: {},
        url: "https://rpc.example",
        error: { code: -32000, message: "execution reverted" },
      }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(SlippageCheckUnavailableError);
  });
  test("error: JSON-RPC error in an HTTP 200 wraps viem errors", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new RpcRequestError({
        body: {},
        url: "https://rpc.example",
        error: { code: -32005, message: "limit exceeded" },
      }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });
  test("error: HttpRequestError is wrapped with RpcTransportError", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new HttpRequestError({ body: {}, url: "https://rpc.example" }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });
  test("error: an unknown rpc failure wraps viem errors", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(new Error("unexpected failure"));
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });
  test("error: an aborted request wraps viem errors", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      Object.assign(new Error("request aborted"), { name: "AbortError" }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });
  test("error: empty asset() return data becomes missing evidence", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockResolvedValue("0x");
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(SlippageCheckUnavailableError);
  });
  test("error: short asset() return data becomes missing evidence", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockResolvedValue("0x1234");
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(SlippageCheckUnavailableError);
  });
  test("error: TimeoutError wraps viem errors", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new TimeoutError({ body: {}, url: "https://rpc.example" }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });
  test("error: zero market token metadata becomes missing evidence", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [zeroAddress, collateral, zeroAddress, zeroAddress, 0n],
    });
    const error = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: zeroAddress,
      operations: [
        {
          type: "blueBorrow",
          marketId,
          quote: { assetsReceived: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message).toContain(
      `market:${marketId.toLowerCase()}`,
    );
    expect(error).not.toHaveProperty("context");
  });
});

describe("resolveAssets — Midnight collateral", () => {
  const midnight = "0x0000000000000000000000000000000000000004";
  const secondCollateral = "0x0000000000000000000000000000000000000005";
  const midnightLimit: ParsedOperationLimit = {
    type: "midnightSupplyCollateral",
    marketId,
    collateralIndex: 1n,
    quote: { assetsPaid: 10n, collateralSupplied: 10n },
    slippageTolerance: 0n,
  };
  const mockToMarket = (handle: ReturnType<typeof createMockClient>) =>
    mockRead(handle, {
      address: midnight,
      abi: midnightAbi,
      functionName: "toMarket",
      result: {
        chainId: 1n,
        midnight,
        loanToken: loan,
        collateralParams: [
          {
            token: collateral,
            lltv: 0n,
            liquidationCursor: 0n,
            oracle: zeroAddress,
          },
          {
            token: secondCollateral,
            lltv: 0n,
            liquidationCursor: 0n,
            oracle: zeroAddress,
          },
        ],
        maturity: 0n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      },
    });

  test("behavior: the paid token is the market collateral at collateralIndex, read once per market", async () => {
    const handle = createMockClient(mainnet);
    mockToMarket(handle);
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight,
      operations: [midnightLimit, { ...midnightLimit, collateralIndex: 0n }],
      blockNumber: 1n,
    });
    expect(result.map((r) => r.assetsPaid)).toEqual([
      secondCollateral,
      collateral,
    ]);
    expect(handle.request).toHaveBeenCalledTimes(1);
  });
  test("behavior: a redeem resolves the loan token and carries the market struct for credit reads", async () => {
    const handle = createMockClient(mainnet);
    mockToMarket(handle);
    const redeemLimit: ParsedOperationLimit = {
      type: "midnightRedeem",
      marketId,
      quote: { assetsReceived: 10n, creditRedeemed: 10n },
      slippageTolerance: 0n,
    };
    const [explicit, derived] = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight,
      operations: [{ ...redeemLimit, assetReceived: collateral }, redeemLimit],
      blockNumber: 1n,
    });
    expect(explicit?.assetsReceived).toBe(collateral);
    expect(derived?.assetsReceived).toBe(loan);
    // An explicit payout token still needs the market for updatePositionView.
    expect(explicit?.midnightMarket?.loanToken).toBe(loan);
    expect(derived?.midnightMarket?.collateralParams).toHaveLength(2);
    expect(handle.request).toHaveBeenCalledTimes(1);
  });
  test("behavior: Midnight buy and sell quotes resolve market structs with explicit tokens", async () => {
    const handle = createMockClient(mainnet);
    mockToMarket(handle);
    const operations: ParsedOperationLimit[] = [
      {
        type: "midnightTakeLend",
        marketId,
        quote: { assetsPaid: 10n, unitsBought: 10n },
        slippageTolerance: 0n,
      },
      {
        type: "midnightTakeBorrow",
        marketId,
        quote: { unitsSold: 10n, assetsReceived: 10n },
        assetReceived: collateral,
        slippageTolerance: 0n,
      },
      {
        type: "midnightTakeWithdraw",
        marketId,
        quote: { creditRedeemed: 10n, assetsReceived: 10n },
        assetReceived: collateral,
        slippageTolerance: 0n,
      },
    ];
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight,
      operations,
      blockNumber: 1n,
    });
    expect(result.map((op) => op.assetsPaid)).toEqual([
      loan,
      undefined,
      undefined,
    ]);
    expect(result.slice(1).map((op) => op.assetsReceived)).toEqual([
      collateral,
      collateral,
    ]);
    expect(result.map((op) => op.midnightMarket?.loanToken)).toEqual([
      loan,
      loan,
      loan,
    ]);
    expect(handle.request).toHaveBeenCalledTimes(1);
  });
  test.each([
    "midnightRepayWithdrawCollateral",
    "midnightTakeRepayWithdrawCollateral",
  ] as const)(
    "behavior: %s resolves the market and only quoted collateral tokens",
    async (type) => {
      const handle = createMockClient(mainnet);
      mockToMarket(handle);
      const repayLimit: ParsedOperationLimit = {
        type,
        marketId,
        quote: { assetsPaid: 10n, debtRepaid: 10n },
        slippageTolerance: 0n,
      };
      const [withoutCollateral, withCollateral] = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [
          repayLimit,
          {
            ...repayLimit,
            quote: {
              ...repayLimit.quote,
              collateralWithdrawals: [{ collateralIndex: 1n, assets: 10n }],
            },
          },
        ],
        blockNumber: 1n,
      });
      expect(withoutCollateral?.assetsPaid).toBe(loan);
      expect(withoutCollateral?.midnightMarket?.loanToken).toBe(loan);
      expect(withoutCollateral?.midnightCollateralTokens).toBeUndefined();
      expect(withCollateral?.assetsPaid).toBe(loan);
      expect(withCollateral?.midnightCollateralTokens).toEqual([
        { collateralIndex: 1n, token: secondCollateral },
      ]);
      expect(handle.request).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    "midnightRepayWithdrawCollateral",
    "midnightTakeRepayWithdrawCollateral",
  ] as const)(
    "error: %s with an unconfigured withdrawal index fails closed",
    async (type) => {
      const handle = createMockClient(mainnet);
      mockToMarket(handle);
      await expect(
        resolveAssets({
          client: handle.client,
          morpho: zeroAddress,
          midnight,
          operations: [
            {
              type,
              marketId,
              quote: {
                assetsPaid: 10n,
                debtRepaid: 10n,
                collateralWithdrawals: [{ collateralIndex: 2n, assets: 10n }],
              },
              slippageTolerance: 0n,
            },
          ],
          blockNumber: 1n,
        }),
      ).rejects.toThrow(SlippageCheckUnavailableError);
    },
  );
  test("error: a redeem on a market that does not exist fails closed even with an explicit payout token", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: midnight,
      abi: midnightAbi,
      functionName: "toMarket",
      result: {
        chainId: 0n,
        midnight: zeroAddress,
        loanToken: zeroAddress,
        collateralParams: [],
        maturity: 0n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      },
    });
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [
          {
            type: "midnightRedeem",
            marketId,
            quote: { assetsReceived: 10n, creditRedeemed: 10n },
            slippageTolerance: 0n,
            assetReceived: collateral,
          },
        ],
        blockNumber: 1n,
      }),
    ).rejects.toThrow(SlippageCheckUnavailableError);
  });
  test("error: a take-borrow on a market that does not exist fails closed even with an explicit payout token", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: midnight,
      abi: midnightAbi,
      functionName: "toMarket",
      result: {
        chainId: 0n,
        midnight: zeroAddress,
        loanToken: zeroAddress,
        collateralParams: [],
        maturity: 0n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      },
    });
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [
          {
            type: "midnightTakeBorrow",
            marketId,
            quote: { unitsSold: 10n, assetsReceived: 10n },
            slippageTolerance: 0n,
            assetReceived: collateral,
          },
        ],
        blockNumber: 1n,
      }),
    ).rejects.toThrow(
      'If this bundle creates the market, pass the market struct via "market".',
    );
  });
  test("behavior: a supplied market resolves a new market's tokens and position struct without toMarket", async () => {
    const handle = createMockClient(mainnet);
    const operation: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId: suppliedMidnightMarketId,
      market: suppliedMidnightMarket,
      quote: {
        collateralSupplies: [{ collateralIndex: 0n, assets: 10n }],
        unitsSold: 5n,
        assetsReceived: 5n,
      },
      slippageTolerance: 0n,
    };
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: suppliedMidnightMarket.midnight,
      operations: [operation],
      blockNumber: 1n,
    });
    expect(result[0]).toMatchObject({
      assetsReceived: loan,
      midnightMarket: MidnightMarketUtils.toStruct(suppliedMidnightMarket),
      midnightCollateralTokens: [{ collateralIndex: 0n, token: collateral }],
    });
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("error: supplied market assetPaid must match the collateral token", async () => {
    const handle = createMockClient(mainnet);
    const operation: ParsedOperationLimit = {
      type: "midnightSupplyCollateral",
      marketId: suppliedMidnightMarketId,
      market: suppliedMidnightMarket,
      collateralIndex: 0n,
      assetPaid: loan,
      quote: { assetsPaid: 10n, collateralSupplied: 10n },
      slippageTolerance: 0n,
    };
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: suppliedMidnightMarket.midnight,
        operations: [operation],
        blockNumber: 1n,
      }),
    ).rejects.toThrow(
      "assetPaid must equal the supplied market's collateral token at collateralIndex; omit assetPaid when passing market.",
    );
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("behavior: supplied market assetPaid matching collateral token resolves", async () => {
    const handle = createMockClient(mainnet);
    const operation: ParsedOperationLimit = {
      type: "midnightSupplyCollateral",
      marketId: suppliedMidnightMarketId,
      market: suppliedMidnightMarket,
      collateralIndex: 0n,
      assetPaid: collateral,
      quote: { assetsPaid: 10n, collateralSupplied: 10n },
      slippageTolerance: 0n,
    };
    const [result] = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: suppliedMidnightMarket.midnight,
      operations: [operation],
      blockNumber: 1n,
    });
    expect(result?.assetsPaid).toBe(collateral);
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("error: supplied market assetPaid with an unconfigured collateral index fails without RPC", async () => {
    const handle = createMockClient(mainnet);
    const operation: ParsedOperationLimit = {
      type: "midnightSupplyCollateral",
      marketId: suppliedMidnightMarketId,
      market: suppliedMidnightMarket,
      collateralIndex: 1n,
      assetPaid: collateral,
      quote: { assetsPaid: 10n, collateralSupplied: 10n },
      slippageTolerance: 0n,
    };
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: suppliedMidnightMarket.midnight,
        operations: [operation],
        blockNumber: 1n,
      }),
    ).rejects.toThrow(SlippageCheckUnavailableError);
    expect(handle.request).not.toHaveBeenCalled();
  });
  test.each(["take-lend then redeem", "redeem then take-lend"] as const)(
    "behavior: a supplied market resolves take-lend and redeem in either order (%s)",
    async (order) => {
      const handle = createMockClient(mainnet);
      const takeLend: ParsedOperationLimit = {
        type: "midnightTakeLend",
        marketId: suppliedMidnightMarketId,
        market: suppliedMidnightMarket,
        quote: { assetsPaid: 10n, unitsBought: 5n },
        slippageTolerance: 0n,
      };
      const redeem: ParsedOperationLimit = {
        type: "midnightRedeem",
        marketId: suppliedMidnightMarketId,
        quote: { assetsReceived: 5n, creditRedeemed: 5n },
        slippageTolerance: 0n,
      };
      const operations =
        order === "take-lend then redeem"
          ? [takeLend, redeem]
          : [redeem, takeLend];
      const result = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: suppliedMidnightMarket.midnight,
        operations,
        blockNumber: 1n,
      });
      expect(
        result.map((operation) => operation.midnightMarket?.loanToken),
      ).toEqual([loan, loan]);
      expect(handle.request).not.toHaveBeenCalled();
    },
  );
  test("error: a supplied market from another Midnight address fails closed", async () => {
    const handle = createMockClient(mainnet);
    const operation: ParsedOperationLimit = {
      type: "midnightSupplyCollateral",
      marketId: suppliedMidnightMarketId,
      market: { ...suppliedMidnightMarket, midnight: zeroAddress },
      collateralIndex: 0n,
      quote: { assetsPaid: 10n, collateralSupplied: 10n },
      slippageTolerance: 0n,
    };
    let error: unknown;
    try {
      await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: suppliedMidnightMarket.midnight,
        operations: [operation],
        blockNumber: 1n,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message).toContain(
      "Pass this chain's Midnight market struct.",
    );
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("error: repayment on a market that does not exist fails closed", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: midnight,
      abi: midnightAbi,
      functionName: "toMarket",
      result: {
        chainId: 0n,
        midnight: zeroAddress,
        loanToken: zeroAddress,
        collateralParams: [],
        maturity: 0n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      },
    });
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [
          {
            type: "midnightRepayWithdrawCollateral",
            marketId,
            quote: { assetsPaid: 10n, debtRepaid: 10n },
            slippageTolerance: 0n,
          },
        ],
        blockNumber: 1n,
      }),
    ).rejects.toThrow(SlippageCheckUnavailableError);
  });
  test("error: an index the market does not configure fails closed", async () => {
    const handle = createMockClient(mainnet);
    mockToMarket(handle);
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [{ ...midnightLimit, collateralIndex: 2n }],
        blockNumber: 1n,
      }),
    ).rejects.toThrow(SlippageCheckUnavailableError);
  });
});
