import type { MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi, midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { MarketUtils as MidnightMarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import {
  type Address,
  BaseError,
  type Client,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  erc4626Abi,
  ethAddress,
  HttpRequestError,
  isAddressEqual,
  RpcError,
  RpcRequestError,
  TimeoutError,
  zeroAddress,
} from "viem";
import { readContract } from "viem/actions";
import {
  RpcTransportError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import {
  MIDNIGHT_MARKET_INPUT_OPERATION_TYPES,
  type MidnightMarketStruct,
} from "../../limits.js";
import { operationMeasurementPlan } from "../measurement-plan.js";
import type { ParsedOperationLimit } from "../request/parse-request.js";

/** Caller-selected operation with only the quoted wallet assets resolved. @internal */
export interface ResolvedSlippageOperation {
  readonly limit: ParsedOperationLimit;
  readonly assetsPaid?: Address;
  readonly assetsReceived?: Address;
  readonly marketParams?: Pick<
    MarketParams,
    "loanToken" | "collateralToken" | "oracle" | "irm" | "lltv"
  >;
  /** Midnight market struct passed to accrued-credit reads. */
  readonly midnightMarket?: MidnightMarket;
  /** BlueBuyCallback whose Blue position is measured for parking. */
  readonly blueBuyCallback?: Address;
  readonly midnightCollateralTokens?: readonly {
    readonly collateralIndex: bigint;
    readonly token: Address;
  }[];
}

/** Midnight market struct as returned by `toMarket`. @internal */
type MidnightMarket = MidnightMarketStruct;

/**
 * Resolve underlying tokens for typed inputs and quotes without explicit tokens.
 * Input overrides must match the subject token; native aliases require wNative
 * and are measured together with that token's net wallet change.
 * Share-only quotes need no RPC reads; vault versions and factories are not discovered.
 * Midnight collateral tokens come from `Midnight.toMarket(marketId)` at the
 * quoted `collateralIndex`, unless an operation limit supplies the matching
 * market struct. First takes and first collateral supplies into a market
 * created by the bundle need that struct; a first supply may instead use
 * explicit `assetPaid`. `midnightRedeem`, Midnight repay/withdraw, and sells
 * use a matching supplied struct when available because their credit reads
 * need it.
 * @param params - Caller operations, Morpho Blue and Midnight addresses, client, and pinned state block.
 * @returns Operations with the token addresses required by their asset quotes.
 * @throws {RpcTransportError} For transport failures during a required metadata read.
 * @throws {SimulationValidationError} For a typed-input asset override that is
 *   neither the canonical token nor its registered native alias.
 * @throws {SlippageCheckUnavailableError} For reverted, malformed, or empty
 *   metadata; a supplied market struct for another Midnight deployment; an
 *   explicit `assetPaid` that does not match its collateral token; or a
 *   collateral index the Midnight market does not configure.
 * @internal
 */
export async function resolveAssets(params: {
  readonly client: Client;
  readonly morpho: Address;
  readonly midnight?: Address;
  readonly wNative?: Address;
  readonly operations: readonly ParsedOperationLimit[];
  readonly blockNumber: bigint;
}): Promise<readonly ResolvedSlippageOperation[]> {
  const {
    client,
    morpho,
    midnight = zeroAddress,
    operations,
    blockNumber,
  } = params;
  // Blue: [loan, collateral]; vault: [asset]; Midnight: [loan, ...collaterals].
  const tokens = new Map<string, readonly Address[]>();
  const markets = new Map<string, MidnightMarket>();
  const blueMarkets = new Map<
    string,
    NonNullable<ResolvedSlippageOperation["marketParams"]>
  >();
  const resolved: ResolvedSlippageOperation[] = [];
  for (const limit of operations) {
    const acceptsMarket = MIDNIGHT_MARKET_INPUT_OPERATION_TYPES.some(
      (acceptedType) => acceptedType === limit.type,
    );
    if (!acceptsMarket || !("market" in limit) || limit.market === undefined) {
      continue;
    }
    const suppliedMarket = MidnightMarketUtils.toStruct(limit.market);
    if (!isAddressEqual(suppliedMarket.midnight, midnight)) {
      throw new SlippageCheckUnavailableError(
        `The supplied Midnight market struct for "${limit.type}" uses a different Midnight address. Pass this chain's Midnight market struct.`,
      );
    }
    if (limit.type === "midnightSupplyCollateral") {
      const collateralToken =
        suppliedMarket.collateralParams[Number(limit.collateralIndex)]?.token;
      if (
        limit.assetPaid !== undefined &&
        (collateralToken === undefined ||
          !isAddressEqual(limit.assetPaid, collateralToken))
      ) {
        throw new SlippageCheckUnavailableError(
          "assetPaid must equal the supplied market's collateral token at collateralIndex; omit assetPaid when passing market.",
        );
      }
    }
    const key = `midnight:${limit.marketId.toLowerCase()}`;
    markets.set(key, suppliedMarket);
    tokens.set(key, [
      suppliedMarket.loanToken,
      ...suppliedMarket.collateralParams.map((entry) => entry.token),
    ]);
  }
  for (const [index, limit] of operations.entries()) {
    const acceptsMarket = MIDNIGHT_MARKET_INPUT_OPERATION_TYPES.some(
      (acceptedType) => acceptedType === limit.type,
    );
    const plan = operationMeasurementPlan(limit);
    const result: {
      limit: ParsedOperationLimit;
      assetsPaid?: Address;
      assetsReceived?: Address;
      marketParams?: ResolvedSlippageOperation["marketParams"];
      midnightMarket?: MidnightMarket;
      midnightCollateralTokens?: {
        collateralIndex: bigint;
        token: Address;
      }[];
    } = { limit };
    for (const field of [
      "assetsPaid",
      "assetsReceived",
      "creditRedeemed",
      "unitsSold",
      "unitsBought",
    ] as const) {
      // This pass loads the Midnight market and collateral tokens without quoting creditRedeemed.
      // For repay-withdraw, this creditRedeemed iteration is the market load even though that field is never quoted.
      const needsMidnightMarket =
        (field === "creditRedeemed" &&
          (limit.type === "midnightRepayWithdrawCollateral" ||
            limit.type === "midnightTakeRepayWithdrawCollateral")) ||
        (field === "creditRedeemed" &&
          (limit.type === "midnightRedeem" ||
            limit.type === "midnightTakeWithdraw")) ||
        (field === "unitsSold" &&
          (limit.type === "midnightTakeBorrow" ||
            limit.type === "midnightSupplyCollateralTakeBorrow")) ||
        (field === "unitsBought" && limit.type === "midnightTakeLend");
      if (limit.quote[field] === undefined && !needsMidnightMarket) continue;
      const explicit =
        field === "assetsPaid"
          ? limit.assetPaid
          : field === "assetsReceived"
            ? limit.assetReceived
            : undefined;
      if (
        explicit !== undefined &&
        limit.inputs === undefined &&
        field !== "creditRedeemed" &&
        field !== "unitsSold" &&
        field !== "unitsBought" &&
        limit.type !== "midnightSupplyCollateralTakeBorrow"
      ) {
        result[field] = explicit;
        continue;
      }
      const source =
        field === "creditRedeemed" &&
        (limit.type === "midnightRepayWithdrawCollateral" ||
          limit.type === "midnightTakeRepayWithdrawCollateral")
          ? { type: "midnightLoan" as const, marketId: limit.marketId }
          : field === "unitsBought" && limit.type === "midnightTakeLend"
            ? { type: "midnightLoan" as const, marketId: limit.marketId }
            : field === "creditRedeemed" ||
                field === "unitsSold" ||
                field === "unitsBought"
              ? plan.assetsReceived
              : plan[field];
      if (source === undefined)
        throw new SlippageCheckUnavailableError(
          `Cannot resolve the asset source for "${limit.type}" field "${field}".`,
        );
      if (source.type === "token") {
        if (field === "assetsPaid" || field === "assetsReceived") {
          result[field] = source.token;
          continue;
        }
        throw new SlippageCheckUnavailableError(
          `Cannot resolve the asset source for "${limit.type}" field "${field}".`,
        );
      }
      if (
        (field === "creditRedeemed" ||
          field === "unitsSold" ||
          field === "unitsBought") &&
        source.type !== "midnightLoan"
      ) {
        throw new SlippageCheckUnavailableError(
          `Cannot resolve the Midnight market for "${limit.type}" asset source.`,
        );
      }
      const key =
        source.type === "market"
          ? `market:${source.marketId.toLowerCase()}`
          : source.type === "vault"
            ? `vault:${source.vault.toLowerCase()}`
            : `midnight:${source.marketId.toLowerCase()}`;
      let pair = tokens.get(key);
      if (pair === undefined) {
        try {
          if (source.type === "market") {
            const values = await readContract(client, {
              address: morpho,
              abi: blueAbi,
              functionName: "idToMarketParams",
              args: [source.marketId],
              blockNumber,
            });
            pair = [values[0], values[1]];
            blueMarkets.set(key, {
              loanToken: values[0],
              collateralToken: values[1],
              oracle: values[2],
              irm: values[3],
              lltv: values[4],
            });
          } else if (
            source.type === "midnightCollateral" ||
            source.type === "midnightLoan"
          ) {
            const market = await readContract(client, {
              address: midnight,
              abi: midnightAbi,
              functionName: "toMarket",
              args: [source.marketId],
              blockNumber,
            });
            markets.set(key, market);
            pair = [
              market.loanToken,
              ...market.collateralParams.map((entry) => entry.token),
            ];
          } else {
            const asset = await readContract(client, {
              address: source.vault,
              abi: erc4626Abi,
              functionName: "asset",
              blockNumber,
            });
            pair = [asset, asset];
          }
        } catch (cause) {
          const reverted =
            cause instanceof BaseError &&
            cause.walk(
              (error) =>
                error instanceof ContractFunctionRevertedError ||
                error instanceof ExecutionRevertedError,
            ) !== null;
          // Revert-shaped chains (code 3, or -32000 "execution reverted")
          // can nest an RpcRequestError, so a revert must win over the
          // transport match.
          if (
            !reverted &&
            ((cause instanceof BaseError &&
              cause.walk(
                (error) =>
                  error instanceof HttpRequestError ||
                  error instanceof TimeoutError ||
                  error instanceof RpcRequestError ||
                  error instanceof RpcError ||
                  (error instanceof Error && error.name === "AbortError"),
              ) !== null) ||
              (cause instanceof Error && cause.name === "AbortError"))
          ) {
            throw new RpcTransportError(
              "RPC request failed. Check the endpoint and try again.",
              { cause },
            );
          }
          throw new SlippageCheckUnavailableError(
            `Cannot resolve the token for "${limit.type}" asset source "${key}".` +
              (acceptsMarket &&
              (source.type === "midnightCollateral" ||
                source.type === "midnightLoan")
                ? ' If this bundle creates the market, pass the market struct via "market".'
                : "") +
              (source.type === "midnightCollateral"
                ? " If the market does not exist yet at the state block, set assetPaid to exactly collateralParams[collateralIndex].token; it is not checked."
                : ""),
            {
              cause,
            },
          );
        }
        tokens.set(key, pair);
      }
      if (
        field === "creditRedeemed" ||
        field === "unitsSold" ||
        field === "unitsBought"
      ) {
        const market = markets.get(key);
        if (
          market === undefined ||
          isAddressEqual(market.loanToken, zeroAddress)
        ) {
          throw new SlippageCheckUnavailableError(
            `Cannot resolve the Midnight market for "${limit.type}" asset source "${key}": the market does not exist at the state block.${acceptsMarket ? ' If this bundle creates the market, pass the market struct via "market".' : ""}`,
          );
        }
        result.midnightMarket = market;
        if (
          limit.type === "midnightRepayWithdrawCollateral" ||
          limit.type === "midnightTakeRepayWithdrawCollateral" ||
          limit.type === "midnightSupplyCollateralTakeBorrow"
        ) {
          const quoted =
            limit.type === "midnightSupplyCollateralTakeBorrow"
              ? (limit.quote.collateralSupplies ?? [])
              : (limit.quote.collateralWithdrawals ?? []);
          if (quoted.length > 0)
            result.midnightCollateralTokens = quoted.map(
              ({ collateralIndex }) => {
                const token =
                  market.collateralParams[Number(collateralIndex)]?.token;
                if (token === undefined)
                  throw new SlippageCheckUnavailableError(
                    `Cannot resolve collateral index "${collateralIndex}" for "${limit.type}": the Midnight market has no collateral at that index.`,
                  );
                return { collateralIndex, token };
              },
            );
        }
        continue;
      }
      const token =
        source.type === "market"
          ? pair[source.asset === "loan" ? 0 : 1]
          : source.type === "vault" || source.type === "midnightLoan"
            ? pair[0]
            : pair[1 + Number(source.collateralIndex)];
      if (token === undefined) {
        throw new SlippageCheckUnavailableError(
          `Cannot resolve the token for "${limit.type}" asset source "${key}": the market has no collateral at the quoted index. ` +
            "Check collateralIndex. If the market does not exist yet at the state block, " +
            "set assetPaid to exactly collateralParams[collateralIndex].token; it is not checked.",
        );
      }
      if (isAddressEqual(token, zeroAddress)) {
        throw new SlippageCheckUnavailableError(
          `Cannot resolve the token for "${limit.type}" asset source "${key}": the resolved token address is zero.`,
        );
      }
      if (
        limit.inputs !== undefined &&
        explicit !== undefined &&
        !isAddressEqual(explicit, token) &&
        !(
          isAddressEqual(explicit, ethAddress) &&
          params.wNative !== undefined &&
          isAddressEqual(token, params.wNative)
        )
      ) {
        const path = field === "assetsPaid" ? "assetPaid" : "assetReceived";
        throw new SimulationValidationError(
          "Input-based asset overrides must match the subject token.",
          [
            `limits.operations[${index}].${path}: expected "${token}", got "${explicit}". Omit the override or use the canonical token; native aliases require this chain's wrapped native token.`,
          ],
        );
      }
      const asset = limit.inputs === undefined ? (explicit ?? token) : token;
      if (field === "assetsPaid") result.assetsPaid = asset;
      else if (field === "assetsReceived") result.assetsReceived = asset;
      if (source.type === "market") result.marketParams = blueMarkets.get(key);
    }
    resolved.push(result);
  }
  return resolved;
}
