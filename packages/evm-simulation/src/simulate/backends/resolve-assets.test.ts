import { MarketUtils } from "@morpho-org/blue-sdk";
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
import { toSimulationErrorResponse } from "../../error-response.js";
import {
  ApprovalCheckUnavailableError,
  RpcTransportError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import type { ParsedOperationLimit } from "../request/parse-request.js";
import { resolveAssets } from "./resolve-assets.js";

const vault = "0x0000000000000000000000000000000000000001";
const loan = "0x0000000000000000000000000000000000000002";
const collateral = "0x0000000000000000000000000000000000000003";
const blueMarketParams = {
  loanToken: loan,
  collateralToken: collateral,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
} as const;
const marketId = MarketUtils.getMarketId(blueMarketParams);
const idleMarketId = MarketUtils.getMarketId({
  ...blueMarketParams,
  collateralToken: zeroAddress,
});
const zeroLoanMarketId = MarketUtils.getMarketId({
  ...blueMarketParams,
  loanToken: zeroAddress,
});
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
  test("error: approval identity mismatch stays visible in the public error response", async () => {
    const handle = createMockClient(mainnet);
    const otherMarket = {
      ...suppliedMidnightMarket,
      loanToken: vault,
    } as const;
    mockRead(handle, {
      address: suppliedMidnightMarket.midnight,
      abi: midnightAbi,
      functionName: "toMarket",
      result: otherMarket,
    });
    const error = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: suppliedMidnightMarket.midnight,
      operations: [
        {
          type: "midnightSupplyCollateral",
          marketId: suppliedMidnightMarketId,
          collateralIndex: 0n,
          assetPaid: collateral,
          quote: { assetsPaid: 10n, collateralSupplied: 10n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApprovalCheckUnavailableError);
    const response = toSimulationErrorResponse(error);
    expect(response.message).toContain(suppliedMidnightMarketId);
    expect(response.message).toContain(MidnightMarketUtils.toId(otherMarket));
  });
  test.each([undefined, collateral] as const)(
    "error: all-zero Midnight metadata retains recovery advice (assetPaid=%s)",
    async (assetPaid) => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: suppliedMidnightMarket.midnight,
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
      const error = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: suppliedMidnightMarket.midnight,
        operations: [
          {
            type: "midnightSupplyCollateral",
            marketId: suppliedMidnightMarketId,
            collateralIndex: 0n,
            quote: { assetsPaid: 10n, collateralSupplied: 10n },
            slippageTolerance: 0n,
            ...(assetPaid === undefined ? {} : { assetPaid }),
          },
        ],
        blockNumber: 1n,
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(
        assetPaid === undefined
          ? SlippageCheckUnavailableError
          : ApprovalCheckUnavailableError,
      );
      if (assetPaid === undefined) {
        expect(error).toMatchObject({
          reason: "emptyData",
          field: "assetsPaid",
        });
      }
      expect(
        toSimulationErrorResponse(error).message.split(
          'pass the market struct via "market"',
        ),
      ).toHaveLength(2);
    },
  );
  test.each([undefined, vault] as const)(
    "error: reordered Midnight collateral fails closed (assetPaid=%s)",
    async (assetPaid) => {
      const market = {
        ...suppliedMidnightMarket,
        collateralParams: [
          ...suppliedMidnightMarket.collateralParams,
          { ...suppliedMidnightMarket.collateralParams[0]!, token: vault },
        ],
      } as const;
      const canonical = MidnightMarketUtils.toStruct(market);
      const id = MidnightMarketUtils.toId(canonical);
      expect(MidnightMarketUtils.toId(market)).toBe(id);
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: market.midnight,
        abi: midnightAbi,
        functionName: "toMarket",
        result: market,
      });
      await expect(
        resolveAssets({
          client: handle.client,
          morpho: zeroAddress,
          midnight: market.midnight,
          operations: [
            {
              type: "midnightSupplyCollateral",
              marketId: id,
              collateralIndex: 0n,
              quote: { assetsPaid: 10n, collateralSupplied: 10n },
              slippageTolerance: 0n,
              ...(assetPaid === undefined ? {} : { assetPaid }),
            },
          ],
          blockNumber: 1n,
        }),
      ).rejects.toBeInstanceOf(
        assetPaid === undefined
          ? SlippageCheckUnavailableError
          : ApprovalCheckUnavailableError,
      );
    },
  );
  test.each(
    ([undefined, vault] as const).flatMap((assetPaid) =>
      [
        { loanToken: vault },
        { collateralParams: [] },
        { chainId: 8453n },
        { midnight: vault },
        { maturity: suppliedMidnightMarket.maturity + 1n },
      ].map((mutation) => ({ assetPaid, mutation })),
    ),
  )(
    "error: mismatched Midnight metadata fails closed (assetPaid=$assetPaid, $mutation)",
    async ({ assetPaid, mutation }) => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: suppliedMidnightMarket.midnight,
        abi: midnightAbi,
        functionName: "toMarket",
        result: { ...suppliedMidnightMarket, ...mutation },
      });
      await expect(
        resolveAssets({
          client: handle.client,
          morpho: zeroAddress,
          midnight: suppliedMidnightMarket.midnight,
          operations: [
            {
              type: "midnightSupplyCollateral",
              marketId: suppliedMidnightMarketId,
              collateralIndex: 0n,
              quote: { assetsPaid: 10n, collateralSupplied: 10n },
              slippageTolerance: 0n,
              ...(assetPaid === undefined ? {} : { assetPaid }),
            },
          ],
          blockNumber: 1n,
        }),
      ).rejects.toBeInstanceOf(
        assetPaid === undefined
          ? SlippageCheckUnavailableError
          : ApprovalCheckUnavailableError,
      );
      expect(handle.request).toHaveBeenCalledTimes(1);
    },
  );
  test.each(
    (
      [
        "midnightSupplyCollateralBatch",
        "midnightWithdrawCollateralBatch",
      ] as const
    ).flatMap((type) =>
      (["missingRead", "emptyData"] as const).map((reason) => ({
        type,
        reason,
      })),
    ),
  )(
    "reports the collateral quote field for $type $reason",
    async ({ type, reason }) => {
      const handle = createMockClient(mainnet);
      if (reason === "missingRead")
        handle.request.mockRejectedValue(
          new ContractFunctionRevertedError({
            abi: midnightAbi,
            functionName: "toMarket",
          }),
        );
      else
        mockRead(handle, {
          address: suppliedMidnightMarket.midnight,
          abi: midnightAbi,
          functionName: "toMarket",
          result: { ...suppliedMidnightMarket, loanToken: zeroAddress },
        });
      const field =
        type === "midnightSupplyCollateralBatch"
          ? "collateralSupplies"
          : "collateralWithdrawals";
      const resolution = resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: suppliedMidnightMarket.midnight,
        operations: [
          {
            type,
            marketId: suppliedMidnightMarketId,
            quote: { [field]: [{ collateralIndex: 0n, assets: 10n }] },
            slippageTolerance: 0n,
          },
        ],
        blockNumber: 1n,
      });
      await expect(resolution).rejects.toBeInstanceOf(
        SlippageCheckUnavailableError,
      );
      await expect(resolution).rejects.toMatchObject({
        operationIndex: 0,
        operationType: type,
        field,
        reason,
      });
      if (
        type === "midnightWithdrawCollateralBatch" &&
        reason === "emptyData"
      ) {
        await expect(resolution).rejects.toHaveProperty(
          "message",
          expect.not.stringContaining('pass the market struct via "market"'),
        );
      }
    },
  );
  test.each([
    "midnightSupplyCollateralBatch",
    "midnightWithdrawCollateralBatch",
  ] as const)(
    "resolves every %s collateral and its approval tokens",
    async (type) => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: suppliedMidnightMarket.midnight,
        abi: midnightAbi,
        functionName: "toMarket",
        result: suppliedMidnightMarket,
      });
      const quote =
        type === "midnightSupplyCollateralBatch"
          ? { collateralSupplies: [{ collateralIndex: 0n, assets: 10n }] }
          : { collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }] };
      const resolved = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: suppliedMidnightMarket.midnight,
        operations: [
          {
            type,
            marketId: suppliedMidnightMarketId,
            quote,
            slippageTolerance: 0n,
          },
        ],
        blockNumber: 1n,
      });
      expect(resolved[0]?.midnightCollateralTokens).toEqual([
        { collateralIndex: 0n, token: collateral },
      ]);
      expect(resolved[0]?.midnightApprovalTokens).toEqual(
        type === "midnightSupplyCollateralBatch" ? [collateral] : undefined,
      );
    },
  );

  test.each([
    "midnightSupplyCollateralBatch",
    "midnightSupplyCollateralTakeBorrow",
    "midnightWithdrawCollateralBatch",
    "midnightRepayWithdrawCollateral",
    "midnightTakeRepayWithdrawCollateral",
  ] as const)(
    "fails closed for an unknown %s collateral index",
    async (type) => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: suppliedMidnightMarket.midnight,
        abi: midnightAbi,
        functionName: "toMarket",
        result: suppliedMidnightMarket,
      });
      const field =
        type === "midnightSupplyCollateralBatch" ||
        type === "midnightSupplyCollateralTakeBorrow"
          ? "collateralSupplies"
          : "collateralWithdrawals";
      const resolution = resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: suppliedMidnightMarket.midnight,
        operations: [
          {
            type,
            marketId: suppliedMidnightMarketId,
            quote: {
              [field]: [{ collateralIndex: 9n, assets: 10n }],
            },
            slippageTolerance: 0n,
          },
        ],
        blockNumber: 1n,
      });
      await expect(resolution).rejects.toThrow(SlippageCheckUnavailableError);
      await expect(resolution).rejects.toMatchObject({
        operationIndex: 0,
        operationType: type,
        field,
        reason: "emptyData",
      });
    },
  );
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
    expect(result[1]?.approvalToken).toBe(collateral);
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
  test("behavior: matching Blue market params resolve tokens", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [loan, collateral, zeroAddress, zeroAddress, 0n],
    });
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
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
    expect(result[0]?.marketParams).toEqual(blueMarketParams);
  });
  test("error: rejects Blue market params that hash to another market id", async () => {
    const handle = createMockClient(mainnet);
    const mismatchedMarketParams = {
      ...blueMarketParams,
      loanToken: vault,
    } as const;
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [
        mismatchedMarketParams.loanToken,
        mismatchedMarketParams.collateralToken,
        mismatchedMarketParams.oracle,
        mismatchedMarketParams.irm,
        mismatchedMarketParams.lltv,
      ],
    });
    const error = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations: [
        {
          type: "blueSupply",
          marketId,
          quote: { assetsPaid: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message).toContain("returned params for market");
    expect(handle.request).toHaveBeenCalledTimes(1);
  });
  test("error: approval reads reject Blue market params for another market id", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [
        vault,
        blueMarketParams.collateralToken,
        blueMarketParams.oracle,
        blueMarketParams.irm,
        blueMarketParams.lltv,
      ],
    });
    const error = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations: [
        {
          type: "blueSupply",
          marketId,
          assetPaid: loan,
          quote: { assetsPaid: 1n, sharesMinted: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApprovalCheckUnavailableError);
    expect((error as Error).message).toContain("returned params for market");
  });
  test("error: approval reads check partly zero Blue market params", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [
        zeroAddress,
        blueMarketParams.collateralToken,
        zeroAddress,
        zeroAddress,
        0n,
      ],
    });
    const error = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations: [
        {
          type: "blueSupplyCollateral",
          marketId,
          assetPaid: blueMarketParams.collateralToken,
          quote: { assetsPaid: 1n, collateralSupplied: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApprovalCheckUnavailableError);
    expect((error as Error).message).toContain("returned params for market");
  });
  test("error: all-zero Blue market params keep the zero-token error", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [zeroAddress, zeroAddress, zeroAddress, zeroAddress, 0n],
    });
    const error = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations: [
        {
          type: "blueSupply",
          marketId,
          quote: { assetsPaid: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message).toContain(
      `market:${marketId.toLowerCase()}`,
    );
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
  test("behavior: approval token resolution ignores quote token overrides", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: vault,
      abi: erc4626Abi,
      functionName: "asset",
      result: loan,
    });
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
    expect(result[0]).toEqual({
      limit: operations[0],
      approvalToken: loan,
    });
    expect(result[1]?.assetsPaid).toBe(loan);
    expect(result[1]?.approvalToken).toBe(loan);
    expect(handle.request).toHaveBeenCalledTimes(1);
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
    expect(result[0]?.midnightApprovalTokens).toEqual([loan]);
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("error: Midnight Blue parking rejects a zero caller-supplied loanToken", async () => {
    const handle = createMockClient(mainnet);
    const error = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations: [
        {
          type: "midnightSupplyBlueMakeLend",
          loanToken: zeroAddress,
          marketId,
          callbackSalt: marketId,
          quote: { assetsPaid: 10n, sharesMinted: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      message:
        'Cannot resolve the token approval required by "midnightSupplyBlueMakeLend" at the pinned block. If this bundle creates the market, pass the market struct via "market".',
      fieldErrors: [
        "limits.operations[0].loanToken: must not be the zero address",
      ],
    });
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
    const midnightMarket = {
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
    } as const;
    mockRead(handle, {
      address: zeroAddress,
      abi: midnightAbi,
      functionName: "toMarket",
      result: MidnightMarketUtils.toStruct(midnightMarket),
    });
    const operation: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId: MidnightMarketUtils.toId(midnightMarket),
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
      midnight: zeroAddress,
      operations: [operation],
      blockNumber: 1n,
    });
    expect(result[0]?.assetsReceived).toBe(loan);
    expect(result[0]?.midnightCollateralTokens).toEqual([
      { collateralIndex: 0n, token: vault },
    ]);
    expect(result[0]?.midnightApprovalTokens).toEqual([vault]);
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
          marketId: idleMarketId,
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
          marketId: idleMarketId,
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
  test("error: reverted approval-token read becomes unavailable", async () => {
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
        operations: [{ ...limit, assetPaid: loan }],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(ApprovalCheckUnavailableError);
  });
  test("error: approval-token read preserves the nested revert cause", async () => {
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
      operations: [{ ...limit, assetPaid: loan }],
      blockNumber: 1n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApprovalCheckUnavailableError);
    expect(error).not.toHaveProperty("context");
    const chain = (error as ApprovalCheckUnavailableError).cause;
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
  test("error: a message-only approval-token revert becomes unavailable", async () => {
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
        operations: [{ ...limit, assetPaid: loan }],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(ApprovalCheckUnavailableError);
  });
  test("error: approval-token RPC failure becomes transport failure", async () => {
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
        operations: [{ ...limit, assetPaid: loan }],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });
  test("error: HTTP approval-token failure becomes transport failure", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new HttpRequestError({ body: {}, url: "https://rpc.example" }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [{ ...limit, assetPaid: loan }],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });
  test("error: an unknown approval-token failure becomes transport failure", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(new Error("unexpected failure"));
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [{ ...limit, assetPaid: loan }],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });
  test("error: an aborted approval-token request becomes transport failure", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      Object.assign(new Error("request aborted"), { name: "AbortError" }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [{ ...limit, assetPaid: loan }],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });
  test("error: empty approval-token data becomes unavailable", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockResolvedValue("0x");
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [{ ...limit, assetPaid: loan }],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(ApprovalCheckUnavailableError);
  });
  test("error: short approval-token data becomes unavailable", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockResolvedValue("0x1234");
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [{ ...limit, assetPaid: loan }],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(ApprovalCheckUnavailableError);
  });
  test("error: timed-out approval-token read becomes transport failure", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new TimeoutError({ body: {}, url: "https://rpc.example" }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: zeroAddress,
        operations: [{ ...limit, assetPaid: loan }],
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
          marketId: zeroLoanMarketId,
          quote: { assetsReceived: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message).toContain(
      `market:${zeroLoanMarketId.toLowerCase()}`,
    );
    expect(error).not.toHaveProperty("context");
  });

  test.each(["0x", "0x1234"] as const)(
    "error: quoted metadata with %s return data is unavailable",
    async (returnData) => {
      const handle = createMockClient(mainnet);
      handle.request.mockResolvedValue(returnData);
      await expect(
        resolveAssets({
          client: handle.client,
          morpho: zeroAddress,
          operations: [limit],
          blockNumber: 1n,
        }),
      ).rejects.toBeInstanceOf(SlippageCheckUnavailableError);
    },
  );

  test("error: quoted metadata revert is unavailable", async () => {
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
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(SlippageCheckUnavailableError);
  });

  test("error: quoted metadata transport failure is an RPC transport error", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new HttpRequestError({ body: {}, url: "https://rpc.example" }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });

  test("error: quoted metadata nested revert remains unavailable", async () => {
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
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(SlippageCheckUnavailableError);
  });

  test.each(
    (
      [
        [
          "blueSupply",
          {
            type: "blueSupply",
            marketId,
            quote: { assetsPaid: 1n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
          loan,
        ],
        [
          "blueRepay",
          {
            type: "blueRepay",
            marketId,
            quote: { assetsPaid: 1n, sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          loan,
        ],
        [
          "blueSupplyCollateral",
          {
            type: "blueSupplyCollateral",
            marketId,
            quote: { assetsPaid: 1n, collateralSupplied: 1n },
            slippageTolerance: 0n,
          },
          collateral,
        ],
        [
          "blueSupplyCollateralBorrow",
          {
            type: "blueSupplyCollateralBorrow",
            marketId,
            quote: {
              assetsPaid: 1n,
              collateralSupplied: 1n,
              assetsReceived: 1n,
              sharesMinted: 1n,
            },
            slippageTolerance: 0n,
          },
          collateral,
        ],
        [
          "blueRepayWithdrawCollateral",
          {
            type: "blueRepayWithdrawCollateral",
            marketId,
            quote: {
              assetsPaid: 1n,
              sharesBurned: 1n,
              assetsReceived: 1n,
              collateralWithdrawn: 1n,
            },
            slippageTolerance: 0n,
          },
          loan,
        ],
        [
          "blueBorrow",
          {
            type: "blueBorrow",
            marketId,
            quote: { assetsReceived: 1n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
          collateral,
        ],
        [
          "blueWithdraw",
          {
            type: "blueWithdraw",
            marketId,
            quote: { assetsReceived: 1n, sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          undefined,
        ],
        [
          "blueWithdrawCollateral",
          {
            type: "blueWithdrawCollateral",
            marketId,
            quote: { assetsReceived: 1n, collateralWithdrawn: 1n },
            slippageTolerance: 0n,
          },
          loan,
        ],
        [
          "blueRefinance",
          {
            type: "blueRefinance",
            sourceMarketId: marketId,
            targetMarketId: marketId,
            quote: { sharesBurned: 1n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
          undefined,
        ],
        [
          "vaultV1Withdraw",
          {
            type: "vaultV1Withdraw",
            vault,
            quote: { sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          vault,
        ],
        [
          "vaultV1Redeem",
          {
            type: "vaultV1Redeem",
            vault,
            quote: { sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          vault,
        ],
        [
          "vaultV1InKindRedeem",
          {
            type: "vaultV1InKindRedeem",
            vault,
            quote: { sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          vault,
        ],
        [
          "vaultV2Withdraw",
          {
            type: "vaultV2Withdraw",
            vault,
            quote: { sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          vault,
        ],
        [
          "vaultV2Redeem",
          {
            type: "vaultV2Redeem",
            vault,
            quote: { sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          vault,
        ],
        [
          "vaultV2InKindRedeem",
          {
            type: "vaultV2InKindRedeem",
            vault,
            quote: { sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          vault,
        ],
        [
          "vaultV2ForceWithdraw",
          {
            type: "vaultV2ForceWithdraw",
            vault,
            quote: { sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          vault,
        ],
        [
          "vaultV2ForceRedeem",
          {
            type: "vaultV2ForceRedeem",
            vault,
            quote: { sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          undefined,
        ],
        [
          "vaultV1MigrateToV2",
          {
            type: "vaultV1MigrateToV2",
            sourceVault: vault,
            targetVault: loan,
            quote: { sharesBurned: 1n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
          vault,
        ],
      ] as const
    ).map(([type, operation, expected]) => ({
      type,
      operation,
      expected,
    })),
  )(
    "$type resolves the expected approval token",
    async ({ operation, expected }) => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: zeroAddress,
        abi: blueAbi,
        functionName: "idToMarketParams",
        result: [loan, collateral, zeroAddress, zeroAddress, 0n],
      });
      const result = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        operations: [operation as ParsedOperationLimit],
        blockNumber: 1n,
      });
      expect(result[0]?.approvalToken).toBe(expected);
    },
  );
  test("collateral withdrawal approval tokens ignore quote overrides and use the pinned block", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [loan, collateral, zeroAddress, zeroAddress, 0n],
    });
    const [result] = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations: [
        {
          type: "blueWithdrawCollateral",
          marketId,
          assetReceived: vault,
          quote: { assetsReceived: 1n, collateralWithdrawn: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 42n,
    });
    expect(result?.approvalToken).toBe(loan);
    expect(handle.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "eth_call",
        params: [expect.anything(), "0x2a"],
      }),
      undefined,
    );
  });

  test("error: collateral withdrawal rejects a zero loan token in matching market params", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [zeroAddress, collateral, zeroAddress, zeroAddress, 0n],
    });
    const request = resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations: [
        {
          type: "blueWithdrawCollateral",
          marketId: zeroLoanMarketId,
          assetReceived: collateral,
          quote: { assetsReceived: 1n, collateralWithdrawn: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    });
    await expect(request).rejects.toThrow("the market token address is zero");
    await expect(request).rejects.toBeInstanceOf(ApprovalCheckUnavailableError);
  });

  test("error: zero onchain approval tokens fail closed", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: vault,
      abi: erc4626Abi,
      functionName: "asset",
      result: zeroAddress,
    });
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [loan, zeroAddress, zeroAddress, zeroAddress, 0n],
    });
    const operations: ParsedOperationLimit[] = [
      { ...limit, quote: { sharesMinted: 1n } },
      {
        type: "blueSupplyCollateral",
        marketId,
        assetPaid: collateral,
        quote: { assetsPaid: 1n, collateralSupplied: 1n },
        slippageTolerance: 0n,
      },
    ];
    for (const operation of operations)
      await expect(
        resolveAssets({
          client: handle.client,
          morpho: zeroAddress,
          operations: [operation],
          blockNumber: 1n,
        }),
      ).rejects.toBeInstanceOf(ApprovalCheckUnavailableError);
  });
  test.each(
    (
      [
        "vaultV1Withdraw",
        "vaultV1Redeem",
        "vaultV1InKindRedeem",
        "vaultV2Withdraw",
        "vaultV2Redeem",
        "vaultV2InKindRedeem",
        "vaultV2ForceWithdraw",
        "vaultV1MigrateToV2",
      ] as const
    ).flatMap((type) =>
      [false, true].map((fullQuote) => ({ type, fullQuote })),
    ),
  )(
    "error: a zero vault subject is invalid input ($type, fullQuote=$fullQuote)",
    async ({ type, fullQuote }) => {
      const handle = createMockClient(mainnet);
      handle.request.mockRejectedValue(
        new ContractFunctionRevertedError({
          abi: erc4626Abi,
          functionName: "asset",
        }),
      );
      const operation: ParsedOperationLimit =
        type === "vaultV1MigrateToV2"
          ? {
              type,
              sourceVault: zeroAddress,
              targetVault: vault,
              quote: {
                sharesBurned: 1n,
                sharesMinted: 1n,
                ...(fullQuote ? { assetsReceived: 1n } : {}),
              },
              slippageTolerance: 0n,
            }
          : {
              type,
              vault: zeroAddress,
              quote: {
                sharesBurned: 1n,
                ...(fullQuote ? { assetsReceived: 1n } : {}),
              },
              slippageTolerance: 0n,
            };
      const error = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        operations: [
          {
            type: "blueWithdraw",
            marketId,
            assetReceived: loan,
            quote: { assetsReceived: 1n, sharesBurned: 1n },
            slippageTolerance: 0n,
          },
          operation,
        ],
        blockNumber: 1n,
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(error).toMatchObject({
        code: "VALIDATION_ERROR",
        message: `Cannot resolve the token required by "${type}": the subject token address is zero.`,
        fieldErrors: [
          `limits.operations[1].${type === "vaultV1MigrateToV2" ? "sourceVault" : "vault"}: must not be the zero address`,
        ],
      });
      expect(handle.request).not.toHaveBeenCalled();
    },
  );
  test("behavior: an approval market read keeps market params for a later operation", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [loan, collateral, zeroAddress, zeroAddress, 0n],
    });
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations: [
        {
          type: "blueSupplyCollateral",
          marketId,
          assetPaid: collateral,
          quote: { assetsPaid: 1n, collateralSupplied: 1n },
          slippageTolerance: 0n,
        },
        {
          type: "blueBorrow",
          marketId,
          quote: { assetsReceived: 1n, sharesMinted: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    });
    expect(result[0]?.approvalToken).toBe(collateral);
    expect(result[1]?.approvalToken).toBe(collateral);
    expect(result[1]?.marketParams).toEqual({
      loanToken: loan,
      collateralToken: collateral,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    });
  });
});

describe("resolveAssets — Midnight collateral", () => {
  const midnight = "0x0000000000000000000000000000000000000004";
  const secondCollateral = "0x0000000000000000000000000000000000000005";
  const midnightMarket = {
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
  } as const;
  const midnightMarketId = MidnightMarketUtils.toId(midnightMarket);
  const midnightLimit = {
    type: "midnightSupplyCollateral",
    marketId: midnightMarketId,
    collateralIndex: 1n,
    quote: { assetsPaid: 10n, collateralSupplied: 10n },
    slippageTolerance: 0n,
  } satisfies ParsedOperationLimit;
  const midnightLimitForType = (
    type: "midnightSupplyCollateral" | "midnightSupplyCollateralMakeBorrow",
  ) =>
    type === "midnightSupplyCollateral"
      ? ({
          ...midnightLimit,
          type: "midnightSupplyCollateral",
        } satisfies ParsedOperationLimit)
      : ({
          ...midnightLimit,
          type: "midnightSupplyCollateralMakeBorrow",
        } satisfies ParsedOperationLimit);
  const mockToMarket = (handle: ReturnType<typeof createMockClient>) =>
    mockRead(handle, {
      address: midnight,
      abi: midnightAbi,
      functionName: "toMarket",
      result: midnightMarket,
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
  test("behavior: Midnight approval tokens come from the pinned market, not quote overrides", async () => {
    const handle = createMockClient(mainnet);
    mockToMarket(handle);
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight,
      operations: [midnightLimit, { ...midnightLimit, assetPaid: vault }],
      blockNumber: 1n,
    });
    expect(result[0]?.midnightApprovalTokens).toEqual([secondCollateral]);
    expect(result[1]?.assetsPaid).toBe(vault);
    expect(result[1]?.midnightApprovalTokens).toEqual([secondCollateral]);
  });
  test("behavior: a lone supply with explicit assetPaid still reads its approval token from the market", async () => {
    const handle = createMockClient(mainnet);
    mockToMarket(handle);
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight,
      operations: [{ ...midnightLimit, assetPaid: vault }],
      blockNumber: 1n,
    });
    expect(result[0]?.assetsPaid).toBe(vault);
    expect(result[0]?.midnightApprovalTokens).toEqual([secondCollateral]);
    expect(handle.request).toHaveBeenCalledTimes(1);
  });
  test.each([
    "midnightSupplyCollateral",
    "midnightSupplyCollateralMakeBorrow",
  ] as const)(
    "behavior: a first supply into a market the bundle creates approves its explicit assetPaid (%s)",
    async (type) => {
      const handle = createMockClient(mainnet);
      handle.request.mockRejectedValue(
        new ContractFunctionRevertedError({
          abi: midnightAbi,
          functionName: "toMarket",
          data: encodeErrorResult({
            abi: midnightAbi,
            errorName: "MarketNotCreated",
          }),
        }),
      );
      const result = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [{ ...midnightLimitForType(type), assetPaid: collateral }],
        blockNumber: 1n,
      });
      expect(result[0]?.midnightApprovalTokens).toEqual([collateral]);
    },
  );
  test("error: a transport failure on the approval-token market read is a transport error", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new HttpRequestError({ body: {}, url: "https://rpc.example" }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [{ ...midnightLimit, assetPaid: collateral }],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
  });
  test.each([
    "midnightSupplyCollateral",
    "midnightSupplyCollateralMakeBorrow",
  ] as const)(
    "error: a reverted approval-token market read fails closed instead of using assetPaid (%s)",
    async (type) => {
      const handle = createMockClient(mainnet);
      const revert = new ContractFunctionRevertedError({
        abi: midnightAbi,
        functionName: "toMarket",
      });
      handle.request.mockRejectedValue(revert);
      const error = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [{ ...midnightLimitForType(type), assetPaid: collateral }],
        blockNumber: 1n,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApprovalCheckUnavailableError);
      expect((error as Error).cause).toBeDefined();
    },
  );
  test.each(
    (
      [
        "midnightSupplyCollateral",
        "midnightSupplyCollateralMakeBorrow",
      ] as const
    ).flatMap((type) =>
      ([undefined, collateral] as const).map((assetPaid) => ({
        type,
        assetPaid,
      })),
    ),
  )(
    "error: an absent collateralIndex is invalid input ($type, assetPaid=$assetPaid)",
    async ({ type, assetPaid }) => {
      const handle = createMockClient(mainnet);
      mockToMarket(handle);
      const error = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [
          {
            ...midnightLimitForType(type),
            collateralIndex: 5n,
            ...(assetPaid === undefined ? {} : { assetPaid }),
          },
        ],
        blockNumber: 1n,
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(error).toMatchObject({
        code: "VALIDATION_ERROR",
        message:
          assetPaid === undefined
            ? `Cannot resolve the token for "${type}" asset source "midnight:${midnightMarketId}": the market has no collateral at the quoted index. Check collateralIndex. If the market does not exist yet at the state block, set assetPaid to exactly collateralParams[collateralIndex].token; it is not checked.`
            : `Cannot resolve the token approval required by "${type}" at the pinned block. If this bundle creates the market, pass the market struct via "market".`,
        fieldErrors: [
          "limits.operations[0].collateralIndex: the market has no collateral at this index",
        ],
      });
      expect(handle.request).toHaveBeenCalledTimes(1);
    },
  );
  test.each([
    ["midnightSupplyCollateral", undefined],
    ["midnightSupplyCollateralMakeBorrow", undefined],
    ["midnightSupplyCollateral", zeroAddress],
    ["midnightSupplyCollateralMakeBorrow", zeroAddress],
  ] as const)(
    "error: a first-market supply needs a usable assetPaid (%s, %s)",
    async (type, assetPaid) => {
      const handle = createMockClient(mainnet);
      handle.request.mockRejectedValue(
        new ContractFunctionRevertedError({
          abi: midnightAbi,
          functionName: "toMarket",
          data: encodeErrorResult({
            abi: midnightAbi,
            errorName: "MarketNotCreated",
          }),
        }),
      );
      const error = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [
          {
            ...midnightLimitForType(type),
            quote: midnightLimit.quote,
            ...(assetPaid === undefined ? {} : { assetPaid }),
          },
        ],
        blockNumber: 1n,
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(error).toMatchObject({
        code: "VALIDATION_ERROR",
        message:
          assetPaid === undefined
            ? `Cannot resolve the token for "${type}" asset source "midnight:${midnightMarketId}". If this bundle creates the market, pass the market struct via "market". If the market does not exist yet at the state block, set assetPaid to exactly collateralParams[collateralIndex].token; it is not checked.`
            : `Cannot resolve the token approval required by "${type}" at the pinned block. If this bundle creates the market, pass the market struct via "market".`,
        fieldErrors: [
          "limits.operations[0].assetPaid: required for a market the bundle creates",
        ],
      });
      if (assetPaid === undefined)
        expect(error).toHaveProperty("cause", expect.any(BaseError));
      expect(handle.request).toHaveBeenCalled();
    },
  );
  test.each(
    (
      [
        "midnightSupplyCollateral",
        "midnightSupplyCollateralMakeBorrow",
      ] as const
    ).flatMap((type) =>
      (["transport", "unknownRevert", "emptyMetadata"] as const).map(
        (failure) => ({ type, failure }),
      ),
    ),
  )(
    "error: a full $type quote keeps $failure as an evidence error",
    async ({ type, failure }) => {
      const handle = createMockClient(mainnet);
      if (failure === "emptyMetadata")
        mockRead(handle, {
          address: midnight,
          abi: midnightAbi,
          functionName: "toMarket",
          result: {
            ...suppliedMidnightMarket,
            loanToken: zeroAddress,
          },
        });
      else
        handle.request.mockRejectedValue(
          failure === "transport"
            ? new HttpRequestError({ body: {}, url: "https://rpc.example" })
            : new ContractFunctionRevertedError({
                abi: midnightAbi,
                functionName: "toMarket",
              }),
        );
      const error = await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight,
        operations: [midnightLimitForType(type)],
        blockNumber: 1n,
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(
        failure === "transport"
          ? RpcTransportError
          : SlippageCheckUnavailableError,
      );
      if (failure !== "transport")
        expect(error).toMatchObject({
          operationIndex: 0,
          operationType: type,
          field: "assetsPaid",
          reason: failure === "emptyMetadata" ? "emptyData" : "missingRead",
        });
    },
  );
  test("behavior: a supplied market struct provides the approval token without RPC reads", async () => {
    const handle = createMockClient(mainnet);
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: suppliedMidnightMarket.midnight,
      operations: [
        {
          ...midnightLimit,
          marketId: suppliedMidnightMarketId,
          collateralIndex: 0n,
          market: suppliedMidnightMarket,
        },
      ],
      blockNumber: 1n,
    });
    expect(result[0]?.midnightApprovalTokens).toEqual([collateral]);
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("behavior: a redeem resolves the loan token and carries the market struct for credit reads", async () => {
    const handle = createMockClient(mainnet);
    mockToMarket(handle);
    const redeemLimit: ParsedOperationLimit = {
      type: "midnightRedeem",
      marketId: midnightMarketId,
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
    expect(explicit?.midnightApprovalTokens).toBeUndefined();
    expect(derived?.midnightApprovalTokens).toBeUndefined();
    expect(handle.request).toHaveBeenCalledTimes(1);
  });
  test("behavior: Midnight buy and sell quotes resolve market structs with explicit tokens", async () => {
    const handle = createMockClient(mainnet);
    mockToMarket(handle);
    const operations: ParsedOperationLimit[] = [
      {
        type: "midnightTakeLend",
        marketId: midnightMarketId,
        quote: { assetsPaid: 10n, unitsBought: 10n },
        slippageTolerance: 0n,
      },
      {
        type: "midnightTakeBorrow",
        marketId: midnightMarketId,
        quote: { unitsSold: 10n, assetsReceived: 10n },
        assetReceived: collateral,
        slippageTolerance: 0n,
      },
      {
        type: "midnightTakeWithdraw",
        marketId: midnightMarketId,
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
    expect(result.map((op) => op.midnightApprovalTokens)).toEqual([
      [loan],
      undefined,
      undefined,
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
        marketId: midnightMarketId,
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
      expect(withoutCollateral?.midnightApprovalTokens).toEqual([loan]);
      expect(withCollateral?.midnightApprovalTokens).toEqual([loan]);
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
              marketId: midnightMarketId,
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
            marketId: midnightMarketId,
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
            marketId: midnightMarketId,
            quote: { unitsSold: 10n, assetsReceived: 10n },
            slippageTolerance: 0n,
            assetReceived: collateral,
          },
        ],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(SlippageCheckUnavailableError);
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
  test.each([
    "midnightSupplyCollateral",
    "midnightSupplyCollateralMakeBorrow",
  ] as const)(
    "error: supplied market assetPaid must match the collateral token (%s)",
    async (type) => {
      const handle = createMockClient(mainnet);
      const operation =
        type === "midnightSupplyCollateral"
          ? ({
              type: "midnightSupplyCollateral",
              marketId: suppliedMidnightMarketId,
              market: suppliedMidnightMarket,
              collateralIndex: 0n,
              assetPaid: loan,
              quote: { assetsPaid: 10n, collateralSupplied: 10n },
              slippageTolerance: 0n,
            } satisfies ParsedOperationLimit)
          : ({
              type: "midnightSupplyCollateralMakeBorrow",
              marketId: suppliedMidnightMarketId,
              market: suppliedMidnightMarket,
              collateralIndex: 0n,
              assetPaid: loan,
              quote: { assetsPaid: 10n, collateralSupplied: 10n },
              slippageTolerance: 0n,
            } satisfies ParsedOperationLimit);
      const resolution = resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        midnight: suppliedMidnightMarket.midnight,
        operations: [operation],
        blockNumber: 1n,
      });
      await expect(resolution).rejects.toThrow(SimulationValidationError);
      await expect(resolution).rejects.toThrow(
        "assetPaid must equal the supplied market's collateral token at collateralIndex; omit assetPaid when passing market.",
      );
      await expect(resolution).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        fieldErrors: [
          expect.stringContaining("limits.operations[0].assetPaid:"),
        ],
      });
      expect(handle.request).not.toHaveBeenCalled();
    },
  );
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
    const resolution = resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      midnight: suppliedMidnightMarket.midnight,
      operations: [operation],
      blockNumber: 1n,
    });
    await expect(resolution).rejects.toThrow(SimulationValidationError);
    await expect(resolution).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: [expect.stringContaining("limits.operations[0].assetPaid:")],
    });
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
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect((error as Error).message).toContain(
      "Pass this chain's Midnight market struct.",
    );
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: [expect.stringContaining("limits.operations[0].market:")],
    });
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
            marketId: midnightMarketId,
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
    ).rejects.toThrow(SimulationValidationError);
  });
});
