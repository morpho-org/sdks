import { type MarketId, MarketUtils } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { blueSupply } from "../../actions/blue/supply.js";
import { normalizeBundlesCommonParams } from "../../actions/bundles/common.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import type { ReferenceTimestampParams } from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import type { Funding, IntentParams } from "../intent.js";
import { getVaultPermit, validateTokenPermitRequest } from "../permit.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "../validation.js";
import { type BlueMarketSnapshot, prepareBlue } from "./prepare.js";

/**
 * Intent for supplying gross loan assets to a Blue market. The snapshot is validated but not stored.
 * @example
 * ```ts
 * import { MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
 * import { fetchMarket } from "@morpho-org/morpho-sdk/blue/fetch";
 * import {
 *   applySignatures, buildTransactions, getPendingSignatureRequests,
 *   prepareBlueSupply, type BlueSupplyPlanParams,
 * } from "@morpho-org/morpho-sdk";
 * import {
 *   createPublicClient, createWalletClient, custom, http, type EIP1193Provider,
 * } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * // Run in a browser with an injected wallet connected to Ethereum mainnet.
 * const { ethereum } = window as Window & { ethereum?: EIP1193Provider };
 * if (!ethereum) throw new Error("Install an Ethereum wallet to continue.");
 * const walletClient = createWalletClient({
 *   chain: mainnet, transport: custom(ethereum),
 * });
 * const [account] = await walletClient.requestAddresses();
 * if (!account) throw new Error("Connect a wallet before preparing supply.");
 * const publicClient = createPublicClient({
 *   chain: mainnet, transport: http(),
 * });
 * // cbBTC collateral / USDC loan market on Ethereum.
 * const marketParams = new MarketParams({
 *   loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
 *   collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
 *   oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
 *   irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
 *   lltv: 860_000_000_000_000_000n,
 * });
 * const block = await publicClient.getBlock();
 * const market = await fetchMarket(marketParams.id, publicClient, {
 *   blockNumber: block.number,
 * });
 * const params: BlueSupplyPlanParams = {
 *   chainId: mainnet.id,
 *   account,
 *   marketId: market.id,
 *   marketData: { chainId: mainnet.id, market },
 *   assets: 1_000_000n, // Supply 1 USDC, before any referral fee.
 *   funding: { type: "erc20" },
 *   supportSignature: true,
 *   now: block.timestamp,
 *   expiresAt: Number(block.timestamp + 1_200n),
 * };
 * const plan = await prepareBlueSupply(publicClient, params);
 * const signatures = await Promise.all(
 *   getPendingSignatureRequests(plan).map(async (request) => ({
 *     id: request.id,
 *     signature: await walletClient.signTypedData({
 *       ...request.typedData, account,
 *     }),
 *   })),
 * );
 * const signedPlan = applySignatures(plan, signatures);
 * const transactions = buildTransactions(signedPlan);
 * // transactions: readonly Readonly<Transaction>[].
 * // An optional ERC-20 approval precedes the BlueBundlesV1 supply transaction;
 * // an ERC-2612 permit is embedded in supply instead. No Permit2 is used.
 * // Simulate, then send each { to, data, value } in order from account on mainnet.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface BlueSupplyPlanParams
  extends IntentParams,
    ReferenceTimestampParams {
  readonly marketId: MarketId;
  readonly marketData: BlueMarketSnapshot;
  /** Positive gross loan-token amount, before referral fees. */
  readonly assets: bigint;
  /** Defaults to ERC-20; native funding requires wNative and stores `nativeAssets = assets`. */
  readonly funding?: Funding;
}

/** @internal Validates the stored supply recipe without requiring class instances. */
export function validateBlueSupplyPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      assets: "uint256 bigint",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
    },
  });
  if (inputs.nativeAssets !== undefined) {
    validatePlanField(inputs.nativeAssets, {
      path: `${path}.inputs.nativeAssets`,
      type: "uint256 bigint",
    });
    validateNativeAssets(inputs, `${path}.inputs.nativeAssets`);
  }
  const market = getPlanObject(
    inputs.marketParams,
    `${path}.inputs.marketParams`,
  );
  validatePlanFields(market, {
    path: `${path}.inputs.marketParams`,
    fields: {
      loanToken: "address",
      collateralToken: "address",
      oracle: "address",
      irm: "address",
      lltv: "uint256 bigint",
    },
  });
  getPlanObject(action.signatureRequestIds, `${path}.signatureRequestIds`);
}

/**
 * Prepares a static BlueBundlesV1 supply plan from a caller-fetched market snapshot.
 * Insufficient allowance produces an unlimited direct approval, or an exact ERC-2612 permit
 * when supported and requested. Native funding requires wNative and produces no token prerequisite.
 * No Permit2 or Morpho authorization is requested. Only signatures are added before building.
 * @param client - Viem client for the intent chain, used for prerequisite and deployment reads.
 * @param params - Account, chain, snapshot, gross assets and shared funding/fee/expiry intent.
 * @returns A frozen plan with funding prerequisites followed by the supply transaction.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt`, `assets` or the deadline is not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is at or before `now` (device clock when `now` is omitted).
 * @throws {NegativeInputError} when `referralFee.bps` is negative.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 1,000 or `assets` exceeds uint256.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient or a zero recipient.
 * @throws {MarketIdMismatchError} When the snapshot describes another market.
 * @throws {BlueSnapshotChainMismatchError} When the snapshot describes another chain.
 * @throws {NativeAmountOnNonWNativeAssetError} When native funding targets another token.
 * @throws {ChainIdMismatchError} When the client targets another chain.
 * @throws {MissingContractCodeError} When BlueBundlesV1 or Morpho is not deployed.
 * @example
 * ```ts
 * import { MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
 * import { fetchMarket } from "@morpho-org/morpho-sdk/blue/fetch";
 * import {
 *   applySignatures, buildTransactions, getPendingSignatureRequests,
 *   prepareBlueSupply, type BlueSupplyPlanParams,
 * } from "@morpho-org/morpho-sdk";
 * import {
 *   createPublicClient, createWalletClient, custom, http, type EIP1193Provider,
 * } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * // Run in a browser with an injected wallet connected to Ethereum mainnet.
 * const { ethereum } = window as Window & { ethereum?: EIP1193Provider };
 * if (!ethereum) throw new Error("Install an Ethereum wallet to continue.");
 * const walletClient = createWalletClient({
 *   chain: mainnet, transport: custom(ethereum),
 * });
 * const [account] = await walletClient.requestAddresses();
 * if (!account) throw new Error("Connect a wallet before preparing supply.");
 * const publicClient = createPublicClient({
 *   chain: mainnet, transport: http(),
 * });
 * // cbBTC collateral / USDC loan market on Ethereum.
 * const marketParams = new MarketParams({
 *   loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
 *   collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
 *   oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
 *   irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
 *   lltv: 860_000_000_000_000_000n,
 * });
 * const block = await publicClient.getBlock();
 * const market = await fetchMarket(marketParams.id, publicClient, {
 *   blockNumber: block.number,
 * });
 * const params: BlueSupplyPlanParams = {
 *   chainId: mainnet.id,
 *   account,
 *   marketId: market.id,
 *   marketData: { chainId: mainnet.id, market },
 *   assets: 1_000_000n, // Supply 1 USDC, before any referral fee.
 *   funding: { type: "erc20" },
 *   supportSignature: true,
 *   now: block.timestamp,
 *   expiresAt: Number(block.timestamp + 1_200n),
 * };
 * const plan = await prepareBlueSupply(publicClient, params);
 * const signatures = await Promise.all(
 *   getPendingSignatureRequests(plan).map(async (request) => ({
 *     id: request.id,
 *     signature: await walletClient.signTypedData({
 *       ...request.typedData, account,
 *     }),
 *   })),
 * );
 * const signedPlan = applySignatures(plan, signatures);
 * const transactions = buildTransactions(signedPlan);
 * // transactions: readonly Readonly<Transaction>[].
 * // An optional ERC-20 approval precedes the BlueBundlesV1 supply transaction;
 * // an ERC-2612 permit is embedded in supply instead. No Permit2 is used.
 * // Simulate, then send each { to, data, value } in order from account on mainnet.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareBlueSupply(
  client: Client,
  params: BlueSupplyPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account, assets } = params;
  const source = params.marketData.market.params;
  const marketParams = {
    loanToken: source.loanToken,
    collateralToken: source.collateralToken,
    oracle: source.oracle,
    irm: source.irm,
    lltv: source.lltv,
  };
  const nativeAmount = params.funding?.type === "native" ? assets : undefined;
  const prepared = await prepareBlue({ client, params }, (resolvedIntent) => {
    // Run the pure encoder's validation before any prerequisite reads.
    blueSupply({
      market: { chainId, marketParams: source },
      args: { userAddress: account, assets, nativeAmount, ...resolvedIntent },
    });
    return {
      id: "blueSupply",
      tokenPull:
        nativeAmount === undefined
          ? { token: source.loanToken, amount: assets }
          : undefined,
    };
  });
  await validateClientChainId(client, chainId);
  const { intent, steps, signatureRequests } = prepared;
  return deepFreeze(
    structuredClone({
      version: 2,
      chainId,
      account,
      expiresAt: intent.expiresAt,
      ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
      steps: [
        ...steps,
        {
          id: "blueSupply",
          label: "Supply to Blue",
          action: {
            type: "blueSupply",
            inputs: {
              chainId,
              account,
              marketParams,
              assets,
              ...(nativeAmount !== undefined && { nativeAssets: nativeAmount }),
              ...normalizeBundlesCommonParams(intent),
            },
            signatureRequestIds: signatureRequests.length
              ? { tokenPermit: "blueSupply:tokenPermit" }
              : {},
          },
        },
      ],
      signatureRequests,
    }),
  );
}

/** @internal Binds an exact token permit to this supply's pull. */
export function validateBlueSupplyPermitRequest(
  request: Extract<SignatureRequest, { kind: "permit" }>,
  action: Extract<Action, { type: "blueSupply" }>,
): void {
  validateTokenPermitRequest(request, {
    chainId: action.inputs.chainId,
    account: action.inputs.account,
    deadline: action.inputs.deadline,
    bundler: "bundles.blueBundlesV1",
    asset: action.inputs.marketParams.loanToken,
    amount:
      action.inputs.nativeAssets === undefined
        ? action.inputs.assets
        : undefined,
    exact: true,
  });
}

/** @internal Encodes supply from stored inputs and resolved signatures without a client. */
export function buildBlueSupply(
  action: Extract<Action, { type: "blueSupply" }>,
  requests: readonly SignatureRequest[],
) {
  const { chainId, account, marketParams, nativeAssets, ...args } =
    action.inputs;
  // Enforce native funding consistency even when parsing was skipped.
  validateNativeAssets(action.inputs, "action.inputs.nativeAssets");
  return blueSupply({
    market: {
      chainId,
      marketParams: {
        ...marketParams,
        id: MarketUtils.getMarketId(marketParams),
        liquidationIncentiveFactor:
          MarketUtils.getLiquidationIncentiveFactor(marketParams),
      },
    },
    args: {
      ...args,
      nativeAmount: nativeAssets,
      userAddress: account,
      requirementSignature: getVaultPermit(requests, {
        id: action.signatureRequestIds.tokenPermit,
        asset: marketParams.loanToken,
        owner: account,
      }),
    },
  });
}

function validateNativeAssets(
  {
    assets,
    nativeAssets,
  }: { readonly assets?: unknown; readonly nativeAssets?: unknown },
  path: string,
): void {
  if (nativeAssets !== undefined && nativeAssets !== assets) {
    throw new InvalidTransactionPlanError({
      path,
      reason: "nativeAssets must equal assets when present",
    });
  }
}
