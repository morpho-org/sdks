import { type Market, type MarketId, MarketUtils } from "@morpho-org/blue-sdk";
import {
  deepFreeze,
  getChainAddress,
  isHexEqual,
  Time,
} from "@morpho-org/morpho-ts";
import { type Address, type Client, isAddressEqual } from "viem";
import { getBytecode, readContract } from "viem/actions";
import {
  blueAbi,
  midnightBlueBuyCallbackAbi,
  midnightBlueBuyCallbackFactoryAbi,
} from "../../abis.js";
import { parseBlueWithdrawBuyCallback } from "../../actions/blue/withdrawBuyCallback.internal.js";
import { blueWithdrawBuyCallback } from "../../actions/blue/withdrawBuyCallback.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import { validateChainId } from "../../helpers/index.js";
import { validateMarketParamsId } from "../../helpers/validate.js";
import {
  AccrualPositionUserMismatchError,
  BlueBuyCallbackOwnerMismatchError,
  BlueBuyCallbackUnauthorizedError,
  type BlueWithdrawBuyCallbackAction,
  EmptyBlueSupplyPositionError,
  InsufficientBlueLiquidityError,
  MarketIdMismatchError,
  MissingAccrualPositionError,
  MissingContractCodeError,
  NotBlueBuyCallbackError,
  type ReferenceTimestampParams,
  type Transaction,
} from "../../types/index.js";
import {
  BlueSnapshotChainMismatchError,
  BlueSnapshotStateMismatchError,
} from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import type { Action, TransactionPlan } from "../types.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "../validation.js";
import {
  type BlueMarketSnapshot,
  type BluePositionSnapshot,
  validateBlueMarketSnapshot,
} from "./prepare.js";

const MARKET_STATE_FIELDS = [
  "totalSupplyAssets",
  "totalSupplyShares",
  "totalBorrowAssets",
  "totalBorrowShares",
  "lastUpdate",
  "fee",
  "price",
  "rateAtTarget",
] as const satisfies readonly (keyof Market)[];

/**
 * Caller intent and caller-fetched snapshots for withdrawing a BlueBuyCallback's whole supply
 * position to its owner. The position belongs to `callbackAddress`, not to `account`.
 * @example
 * ```ts
 * import type { BlueWithdrawBuyCallbackPlanParams } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 * declare const callbackAddress: Address;
 * const withdrawal = { callbackAddress, expiresAt: 1_900_000_000 } satisfies Pick<
 *   BlueWithdrawBuyCallbackPlanParams,
 *   "callbackAddress" | "expiresAt"
 * >;
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface BlueWithdrawBuyCallbackPlanParams
  extends Pick<
      IntentParams,
      "chainId" | "account" | "expiresAt" | "calldataOrigin"
    >,
    ReferenceTimestampParams {
  readonly marketId: MarketId;
  readonly marketData: BlueMarketSnapshot;
  /** BlueBuyCallback whose supply position is withdrawn; `account` must be its owner. */
  readonly callbackAddress: Address;
  /** Caller-fetched position of `callbackAddress`; every supply share in it is withdrawn. */
  readonly positionData: BluePositionSnapshot;
}

/**
 * Prepares a direct Morpho Blue withdrawal of a BlueBuyCallback's whole supply position to its owner.
 * The call is `withdraw(marketParams, 0, shares, callbackAddress, account)` on Morpho Blue, not
 * BlueBundlesV1: the callback authorizes its owner on Blue at construction, so the plan has no
 * approval, authorization step or signature request. Preparation reads the chain and rejects a
 * callback the registered factory did not create, another owner, or a revoked Blue authorization.
 * The plan carries no referral fee, and `expiresAt` is plan metadata, not an onchain deadline.
 * @param client - Viem client on the requested chain.
 * @param params.chainId - Chain containing Morpho Blue and the registered `midnightBlueBuyCallbackFactory`.
 * @param params.account - Non-zero callback owner that sends the transaction and receives the loan assets.
 * @param params.marketId - Market ID matching both snapshots and the market tuple.
 * @param params.marketData.chainId - Chain on which the market snapshot was fetched; must equal `chainId`.
 * @param params.marketData.market - Caller-fetched `Market` snapshot used to fix the market tuple; its state must equal the position snapshot's market. Never stored in the plan.
 * @param params.callbackAddress - BlueBuyCallback whose supply position is withdrawn.
 * @param params.positionData.chainId - Position snapshot's chain; must equal `chainId`.
 * @param params.positionData.position - Caller-fetched `AccrualPosition` of `callbackAddress` on `marketId`; all its supply shares are withdrawn and their assets must not exceed that market's liquidity.
 * @param params.now - Optional reference timestamp in seconds, normally the latest block timestamp; defaults to the device clock.
 * @param params.expiresAt - Optional Unix expiry in safe-integer seconds, later than `now`; defaults to `now + 2h`. Plan metadata only.
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to the withdrawal calldata; omitted by default.
 * @returns A deep-frozen, data-only `{ version, chainId, account, expiresAt, steps, signatureRequests, calldataOrigin? }` plan with one `blueWithdrawBuyCallback` step and no signature requests.
 * @throws {BlueSnapshotChainMismatchError} when a market or position snapshot's chain differs from `chainId`.
 * @throws {MarketIdMismatchError} when a snapshot's ID differs from `marketId` or does not hash from its market tuple.
 * @throws {BlueSnapshotStateMismatchError} when the market snapshot's state differs from the position snapshot's market.
 * @throws {MissingAccrualPositionError} when no position snapshot is provided.
 * @throws {AccrualPositionUserMismatchError} when the position belongs to another address than `callbackAddress`.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {InvalidTransactionPlanError} when `account` or `callbackAddress` is not a checksum-valid address, or `calldataOrigin` exceeds 1 MiB.
 * @throws {NonIntegerInputError} when `expiresAt` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt` is not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is at or before `now`.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {EmptyBlueSupplyPositionError} when the callback holds no supply shares.
 * @throws {InsufficientBlueLiquidityError} when the position's supply assets exceed the snapshot market's liquidity.
 * @throws {InputExceedsMaxError} when the supply shares exceed `uint256`.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the registry.
 * @throws {UnknownAddressError} when Morpho Blue or `midnightBlueBuyCallbackFactory` is not registered on `chainId`.
 * @throws {ChainIdMismatchError} when the client declares another chain (checked before any snapshot) or its transport serves one.
 * @throws {MissingContractCodeError} when Morpho Blue or the factory has no deployed code.
 * @throws {NotBlueBuyCallbackError} when the factory did not create `callbackAddress`.
 * @throws {BlueBuyCallbackOwnerMismatchError} when the callback's `OWNER()` is not `account`.
 * @throws {BlueBuyCallbackUnauthorizedError} when Morpho Blue does not authorize `account` for the callback.
 * @throws {viem.BaseError} when a chain, bytecode, factory, owner or authorization read fails.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { buildTransactions, prepareBlueWithdrawBuyCallback } from "@morpho-org/morpho-sdk";
 * import { fetchBlueAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, type Address, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * declare const account: Address; // Owner of the BlueBuyCallback.
 * declare const callbackAddress: Address; // BlueBuyCallback created by the registered factory.
 * const position = await fetchBlueAccrualPosition(callbackAddress, markets[mainnet.id].usdc_wbtc.id, client);
 * const plan = await prepareBlueWithdrawBuyCallback(client, {
 *   chainId: mainnet.id, account, callbackAddress, marketId: position.market.id,
 *   marketData: { chainId: mainnet.id, market: position.market },
 *   positionData: { chainId: mainnet.id, position },
 *   now: (await client.getBlock()).timestamp,
 * });
 * const [transaction] = buildTransactions(plan);
 * // Submit transaction from account; it calls Morpho Blue directly.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareBlueWithdrawBuyCallback(
  client: Client,
  params: BlueWithdrawBuyCallbackPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account, callbackAddress, marketId, marketData } = params;
  const snapshot = params.positionData;
  // Reject a client declaring another chain first, as the entity does.
  validateChainId(client.chain?.id, chainId);
  validatePlanField(callbackAddress, {
    path: "$.callbackAddress",
    type: "address",
  });
  // Reject mismatched snapshots before deriving the withdrawal or reading chain state.
  validateBlueMarketSnapshot(marketData, { chainId, marketId });
  if (snapshot == null) {
    throw new MissingAccrualPositionError(marketId);
  }
  if (snapshot.chainId !== chainId) {
    throw new BlueSnapshotChainMismatchError(snapshot.chainId, chainId);
  }
  const { position } = snapshot;
  if (!isHexEqual(position.marketId, marketId)) {
    throw new MarketIdMismatchError(position.marketId, marketId);
  }
  if (!isHexEqual(position.market.id, marketId)) {
    throw new MarketIdMismatchError(position.market.id, marketId);
  }
  validateMarketParamsId(position.market.params);
  if (!isAddressEqual(position.user, callbackAddress)) {
    throw new AccrualPositionUserMismatchError(position.user, callbackAddress);
  }
  // Bind the withdrawal to one market state: the position's market bounds the liquidity check.
  for (const field of MARKET_STATE_FIELDS) {
    if (position.market[field] !== marketData.market[field]) {
      throw new BlueSnapshotStateMismatchError({
        field,
        positionValue: position.market[field],
        marketValue: marketData.market[field],
      });
    }
  }
  const intent = resolveIntent(params, params.now ?? Time.timestamp());
  const market = marketData.market.id;
  const shares = position.supplyShares;
  if (shares === 0n) {
    throw new EmptyBlueSupplyPositionError({ market, user: callbackAddress });
  }
  const assets = position.supplyAssets;
  const liquidity = position.market.liquidity;
  if (assets > liquidity) {
    throw new InsufficientBlueLiquidityError({ market, assets, liquidity });
  }
  const { loanToken, collateralToken, oracle, irm, lltv } =
    marketData.market.params;
  // Validate shares, the market tuple and the Blue registration before any RPC read.
  parseBlueWithdrawBuyCallback({
    market: { chainId, marketParams: marketData.market.params },
    args: { callbackAddress, userAddress: account, shares },
  });
  const blue = getChainAddress(chainId, "blue");
  const factory = getChainAddress(chainId, "midnightBlueBuyCallbackFactory");
  await validateClientChainId(client, chainId);
  const targets = [
    { role: "blue", address: blue },
    { role: "midnightBlueBuyCallbackFactory", address: factory },
  ] as const;
  // Start every read, then consume them in target order so a stalled or failed
  // later read cannot hide Blue's missing code, as `assertRegistryTargetsHaveCode` does.
  const reads = targets.map(({ address }) => {
    const read = getBytecode(client, { address });
    read.catch(() => undefined);
    return read;
  });
  for (const [index, { role, address }] of targets.entries()) {
    const bytecode = await reads[index];
    if (bytecode === undefined || bytecode === "0x") {
      throw new MissingContractCodeError(address, chainId, role);
    }
  }
  // Check the factory first: OWNER() on an arbitrary address can revert or lie.
  const isBlueBuyCallback = await readContract(client, {
    address: factory,
    abi: midnightBlueBuyCallbackFactoryAbi,
    functionName: "isBlueBuyCallback",
    args: [callbackAddress],
  });
  if (!isBlueBuyCallback) {
    throw new NotBlueBuyCallbackError(callbackAddress);
  }
  const [owner, isAuthorized] = await Promise.all([
    readContract(client, {
      address: callbackAddress,
      abi: midnightBlueBuyCallbackAbi,
      functionName: "OWNER",
    }),
    readContract(client, {
      address: blue,
      abi: blueAbi,
      functionName: "isAuthorized",
      args: [callbackAddress, account],
    }),
  ]);
  if (!isAddressEqual(owner, account)) {
    throw new BlueBuyCallbackOwnerMismatchError({
      callback: callbackAddress,
      owner,
      userAddress: account,
    });
  }
  if (!isAuthorized) {
    throw new BlueBuyCallbackUnauthorizedError({
      callback: callbackAddress,
      userAddress: account,
    });
  }
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt: intent.expiresAt,
    ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
    steps: [
      {
        id: "blueWithdrawBuyCallback",
        label: "Withdraw BlueBuyCallback supply from Blue",
        action: {
          type: "blueWithdrawBuyCallback",
          inputs: {
            chainId,
            account,
            marketParams: { loanToken, collateralToken, oracle, irm, lltv },
            callbackAddress,
            shares,
          },
        },
      },
    ],
    signatureRequests: [],
  });
}

/** @internal Encodes the stored callback withdrawal through the same action as the entity handle. */
export function buildBlueWithdrawBuyCallback(
  action: Extract<Action, { type: "blueWithdrawBuyCallback" }>,
): Readonly<Transaction<BlueWithdrawBuyCallbackAction>> {
  const { chainId, account, marketParams, callbackAddress, shares } =
    action.inputs;
  return blueWithdrawBuyCallback({
    market: {
      chainId,
      marketParams: {
        ...marketParams,
        id: MarketUtils.getMarketId(marketParams),
        liquidationIncentiveFactor:
          MarketUtils.getLiquidationIncentiveFactor(marketParams),
      },
    },
    args: { callbackAddress, userAddress: account, shares },
  });
}

/** @internal Validates the stored callback withdrawal's structural inputs. */
export function validateBlueWithdrawBuyCallbackPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: { callbackAddress: "address", shares: "uint256 bigint" },
  });
  validatePlanFields(
    getPlanObject(inputs.marketParams, `${path}.inputs.marketParams`),
    {
      path: `${path}.inputs.marketParams`,
      fields: {
        loanToken: "address",
        collateralToken: "address",
        oracle: "address",
        irm: "address",
        lltv: "uint256 bigint",
      },
    },
  );
}
