import type {
  AccrualVaultV2,
  InputMarketParams,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, type Client, maxUint256 } from "viem";
import { selectBundlesSharesPermitSignature } from "../../actions/bundles/common.js";
import { vaultV2InKindRedeem } from "../../actions/vaultV2/inKindRedeem.js";
import { getVaultV2InKindRedeemRequirements } from "../../entities/requirements/getVaultV2InKindRedeemRequirements.js";
import { computeVaultV2InKindRedeemQuote } from "../../entities/vaultV2/inKindRedeemQuote.js";
import { validateChainId } from "../../helpers/validate.js";
import {
  isRequirementApproval,
  type ReferenceTimestampParams,
  type Transaction,
  UnsupportedRequirementSignatureError,
  type VaultV2InKindRedeemAction,
} from "../../types/index.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import { getVaultPermit } from "../permit.js";
import {
  buildApprovalStep,
  buildPermitSignatureRequest,
} from "../requirements.js";
import type {
  Action,
  SignatureRequest,
  Step,
  TransactionPlan,
} from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Caller intent for a penalty-inclusive Vault V2 in-kind exit. The ordered markets and adapter
 * snapshot are validated during preparation; only plain encoding inputs are saved in the plan.
 * @example
 * ```ts
 * import {
 *   buildTransactions, parseTransactionPlan, prepareVaultV2InKindRedeem,
 *   serializeTransactionPlan, type VaultV2InKindRedeemPlanParams,
 * } from "@morpho-org/morpho-sdk";
 * import { AccrualVaultV2MorphoMarketV1AdapterV2 } from "@morpho-org/morpho-sdk/blue/entities";
 * import { fetchAccrualVaultV2 } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const vaultAddress = "0x4C7b69b4a82e9E5D8ec60E96516f7A0E17CBC55C";
 * const account = "0x0000000000000000000000000000000000000001";
 * const vault = await fetchAccrualVaultV2(vaultAddress, client);
 * const marketParamsList = vault.accrualAdapters.flatMap((adapter) =>
 *   adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2
 *     ? adapter.markets.map(({ params }) => params) : [],
 * );
 * const params: VaultV2InKindRedeemPlanParams = {
 *   vault, marketParamsList, chainId: base.id, account, assets: 1_000_000n,
 * };
 * const plan = await prepareVaultV2InKindRedeem(client, params);
 * const restored = parseTransactionPlan(serializeTransactionPlan(plan));
 * const transactions = buildTransactions(restored);
 * ```
 */
export interface VaultV2InKindRedeemPlanParams
  extends Omit<IntentParams, "referralFee" | "deployless">,
    ReferenceTimestampParams {
  readonly vault: AccrualVaultV2;
  /** Penalty-inclusive asset amount, not a number of vault shares. */
  readonly assets: bigint;
  /** Ordered markets consumed greedily after the vault's idle assets. */
  readonly marketParamsList: readonly MarketParams[];
  /** Defaults to the snapshot's sole MorphoMarketV1AdapterV2. */
  readonly adapter?: Address;
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares the existing Vault V2 in-kind exit through VaultExitBundlesV1. Preparation validates
 * the snapshot, fixes adapter/market routing, and reads share allowance, nonce and Blue liquidity.
 * No deferred fetch is needed. Sufficient allowance needs no request; otherwise preparation
 * selects an unlimited direct approval or, with signature support, an unlimited ERC-2612 permit.
 * Permit2 is never used. Building the saved plan performs no RPC or signing.
 * The asset-denominated exit has no on-chain share-price or max-shares bound; a price drop before
 * inclusion can burn more shares than quoted.
 * @param client - Client used only during preparation.
 * @param params - Account, snapshot, ordered markets and penalty-inclusive exit amount.
 * @param params.vault - Caller-fetched AccrualVaultV2 snapshot; its address identifies the vault.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h`.
 * @returns A static, serializable plan with optional share authorization prerequisites.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt` or `assets` is not positive.
 * @throws {ExpiredDeadlineError} when the deadline has elapsed before preparation or permit creation finishes.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @throws {ChainIdMismatchError} when the client declares or its endpoint serves another chain.
 * @throws {VaultV2SingleAdapterRequiredError} when the snapshot does not contain exactly one adapter.
 * @throws {AdapterNotPartOfVaultError} when `adapter` differs from the snapshot's sole adapter.
 * @throws {VaultV2UnsupportedExitAdapterError} when the sole adapter is not a MorphoMarketV1AdapterV2.
 * @throws {InKindRedeemZeroDeallocationError} when the exit yields neither idle assets nor a nonzero deallocation after penalties.
 * @throws {EmptyMarketParamsListError} when deallocation is needed but no markets are supplied.
 * @throws {InKindRedeemCoverageError} when the supplied markets cannot cover the non-idle exit amount.
 * @throws {UnsupportedMarketIrmError} when snapshot accrual needs to project an unsupported nonzero market IRM.
 * @throws {UnsupportedChainIdError} when no address registry exists for `chainId`.
 * @throws {UnknownAddressError} when VaultExitBundlesV1 or Blue is not registered on the chain.
 * @throws {MissingContractCodeError} when a registered VaultExitBundlesV1 or Blue target has no deployed bytecode.
 * @throws {InsufficientBlueBalanceForInKindRedeemError} when Blue's asset balance cannot fund the largest market leg.
 * @throws {UnsupportedRequirementSignatureError} when the wrapped flow returns a signature requirement other than an ERC-2612 permit.
 * @throws {UnexpectedRequirementSignatureError} when a returned permit requirement omits its nonce.
 * @throws {viem.BaseError} when an RPC read fails or the amount or market inputs cannot be ABI-encoded.
 * @example
 * ```ts
 * import {
 *   buildTransactions, parseTransactionPlan, prepareVaultV2InKindRedeem,
 *   serializeTransactionPlan,
 * } from "@morpho-org/morpho-sdk";
 * import { AccrualVaultV2MorphoMarketV1AdapterV2 } from "@morpho-org/morpho-sdk/blue/entities";
 * import { fetchAccrualVaultV2 } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const vaultAddress = "0x4C7b69b4a82e9E5D8ec60E96516f7A0E17CBC55C";
 * const account = "0x0000000000000000000000000000000000000001";
 * const vault = await fetchAccrualVaultV2(vaultAddress, client);
 * const marketParamsList = vault.accrualAdapters.flatMap((adapter) =>
 *   adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2
 *     ? adapter.markets.map(({ params }) => params) : [],
 * );
 * const plan = await prepareVaultV2InKindRedeem(client, {
 *   vault, marketParamsList, chainId: base.id, account, assets: 1_000_000n,
 * });
 * const restored = parseTransactionPlan(serializeTransactionPlan(plan));
 * const transactions = buildTransactions(restored);
 * ```
 */
export async function prepareVaultV2InKindRedeem(
  client: Client,
  params: VaultV2InKindRedeemPlanParams,
): Promise<TransactionPlan> {
  const { vault, chainId, account } = params;
  const now = params.now ?? Time.timestamp();
  const intent = resolveIntent(params, now);
  validateChainId(client.chain?.id, chainId);
  const quote = computeVaultV2InKindRedeemQuote({
    vaultData: vault,
    vault: vault.address,
    deadline: intent.deadline,
    now,
    amount: params.assets,
    marketParamsList: params.marketParamsList,
    adapter: params.adapter,
  });
  const {
    onBehalf: _onBehalf,
    amount: assets,
    ...inputs
  } = vaultV2InKindRedeem({
    vault: { chainId, address: vault.address },
    args: {
      amount: params.assets,
      marketParamsList: quote.marketParamsListSnapshot,
      userAddress: account,
      deadline: quote.deadline,
      adapter: quote.adapter,
    },
  }).action.args;
  const requirements = await getVaultV2InKindRedeemRequirements(client, {
    vaultData: vault,
    vault: vault.address,
    userAddress: account,
    chainId,
    deadline: quote.deadline,
    requiredShareAllowance: quote.requiredShareAllowance,
    supportSignature: intent.supportSignature,
    peak: quote.peak,
    now,
  });
  const approvals: Step[] = [];
  const signatureRequests: SignatureRequest[] = [];
  const tokenPermit = "vaultV2InKindRedeem:tokenPermit";
  for (const requirement of requirements) {
    if (isRequirementApproval(requirement)) {
      approvals.push(
        buildApprovalStep(requirement, {
          id: "vaultV2InKindRedeem:approval",
          chainId,
          account,
          denomination: "shares",
        }),
      );
    } else if (requirement.action.type === "permit") {
      signatureRequests.push(
        buildPermitSignatureRequest(
          { action: requirement.action },
          tokenPermit,
        ),
      );
    } else {
      throw new UnsupportedRequirementSignatureError(requirement.action.type);
    }
  }
  return deepFreeze(
    structuredClone({
      version: 2,
      chainId,
      account,
      expiresAt: intent.expiresAt,
      ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
      steps: [
        ...approvals,
        {
          id: "vaultV2InKindRedeem",
          label: "Redeem vault in kind",
          action: {
            type: "vaultV2InKindRedeem",
            inputs: { ...inputs, assets, chainId, account },
            signatureRequestIds: signatureRequests.length
              ? { tokenPermit }
              : {},
          },
        },
      ],
      signatureRequests,
    }),
  );
}

/** @internal Encodes only the saved inputs and referenced unlimited share permit. */
export function buildVaultV2InKindRedeem(
  action: Extract<Action, { type: "vaultV2InKindRedeem" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV2InKindRedeemAction>> {
  const { chainId, account, assets, ...args } = action.inputs;
  const signature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset: args.vault,
    owner: account,
  });
  const permit = selectBundlesSharesPermitSignature(
    signature ? [signature] : [],
    {
      spender: getChainAddress(chainId, "bundles.vaultExitBundlesV1"),
      amount: maxUint256,
      deadline: args.deadline,
    },
  );
  return vaultV2InKindRedeem({
    vault: { chainId, address: args.vault },
    args: {
      ...args,
      amount: assets,
      userAddress: account,
      requirementSignature: permit,
    },
  });
}

/** @internal Validates the stored in-kind exit's plain encoding inputs. */
export function validateInKindRedeemPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      vault: "address",
      adapter: "address",
      assets: "uint256 bigint",
      deadline: "uint256 bigint",
      marketParamsList: "array",
    },
  });
  getPlanObject(action.signatureRequestIds, `${path}.signatureRequestIds`);
  for (const [index, value] of (
    inputs.marketParamsList as readonly InputMarketParams[]
  ).entries()) {
    const marketPath = `${path}.inputs.marketParamsList[${index}]`;
    validatePlanFields(getPlanObject(value, marketPath), {
      path: marketPath,
      fields: {
        loanToken: "address",
        collateralToken: "address",
        oracle: "address",
        irm: "address",
        lltv: "uint256 bigint",
      },
    });
  }
}
