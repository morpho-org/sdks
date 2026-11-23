import type {
  AccrualVault,
  InputMarketParams,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Client, maxUint256 } from "viem";
import { selectBundlesSharesPermitSignature } from "../../actions/bundles/common.js";
import { vaultV1InKindRedeem } from "../../actions/vaultV1/inKindRedeem.js";
import { getVaultV1InKindRedeemRequirements } from "../../entities/requirements/getVaultV1InKindRedeemRequirements.js";
import { computeVaultV1InKindRedeemQuote } from "../../entities/vaultV1/inKindRedeemQuote.js";
import { validateChainId } from "../../helpers/validate.js";
import {
  isRequirementApproval,
  type ReferenceTimestampParams,
  type Transaction,
  UnsupportedRequirementSignatureError,
  type VaultV1InKindRedeemAction,
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
 * Caller intent and snapshot for an asset-denominated Vault V1 in-kind exit.
 * @example
 * ```ts
 * import type { VaultV1InKindRedeemPlanParams } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVault } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vaultAddress = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB"; // Mainnet steakUSDC Vault V1.
 * const vault = await fetchAccrualVault(vaultAddress, client);
 * const marketParamsList = [...vault.allocations.values()]
 *   .filter(({ config, position }) => config.enabled && position.supplyShares > 0n)
 *   .map(({ position }) => position.market.params);
 * const params: VaultV1InKindRedeemPlanParams = {
 *   chainId: mainnet.id, account: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
 *   vault, assets: 1_000_000n, marketParamsList,
 * };
 * // params satisfies VaultV1InKindRedeemPlanParams
 * ```
 */
export interface VaultV1InKindRedeemPlanParams
  extends Omit<IntentParams, "referralFee" | "deployless">,
    ReferenceTimestampParams {
  readonly vault: AccrualVault;
  /** Exact exit assets in underlying-token base units, not shares. */
  readonly assets: bigint;
  /** Ordered enabled markets with enough vault supply to cover the exit. */
  readonly marketParamsList: readonly MarketParams[];
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares the stable Vault V1 in-kind exit through VaultExitBundlesV1.
 * All market inputs are copied during preparation; building requires no client or further reads.
 * Insufficient share allowance produces an unlimited direct approval or ERC-2612 permit, never Permit2.
 * The asset-denominated exit has no on-chain share-price or max-shares bound; a price drop before
 * inclusion can burn more shares than quoted.
 * @param params.vault - Caller-fetched AccrualVault snapshot; its address identifies the vault.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h`.
 * @param client - Viem client used for chain, code and requirement reads.
 * @param params - Account, asset amount, ordered markets and caller-fetched vault snapshot.
 * @returns A data-only plan with the exit and any share approval or signature request.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt`, `assets` or the computed required shares are not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is not in the future.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @throws {ChainIdMismatchError} when the client declares or its RPC serves another chain.
 * @throws {EmptyMarketParamsListError} when no markets are supplied.
 * @throws {UnsupportedChainIdError} when no address registry exists for `chainId`.
 * @throws {UnknownAddressError} when VaultExitBundlesV1 or Morpho Blue is not registered on the chain.
 * @throws {InKindRedeemCoverageError} when the ordered markets cannot cover `assets` without overusing an allocation.
 * @throws {MissingContractCodeError} when VaultExitBundlesV1 or Morpho Blue has no deployed code.
 * @throws {viem.BaseError} when a chain, code, allowance, nonce, balance or contract configuration read fails, or inputs cannot be ABI-encoded.
 * @throws {VaultMorphoMismatchError} when the vault's `MORPHO` differs from the registered Morpho Blue contract.
 * @throws {VaultIsBlueFeeRecipientError} when the vault is Morpho Blue's fee recipient, an unsupported configuration.
 * @throws {InsufficientBlueBalanceForInKindRedeemError} when Morpho Blue's asset balance is below `assets`.
 * @throws {UnsupportedPermitDomainExtensionsError} when a required share permit advertises unsupported EIP-5267 extensions.
 * @throws {InvalidPermitDomainChainIdError} when a required share permit domain targets another chain or omits `chainId`.
 * @throws {InvalidPermitDomainVerifyingContractError} when a required share permit domain targets another token or omits `verifyingContract`.
 * @throws {MissingPermitDomainNameError} when a required share permit has neither an EIP-5267 domain nor a token name.
 * @see computeVaultMaxShareAllowance for snapshot accrual and share-quote errors.
 * @see MorphoVaultV1.inKindRedeem for snapshot and onchain preflight validation.
 * @example
 * ```ts
 * import { prepareVaultV1InKindRedeem } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVault } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vaultAddress = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB"; // Mainnet steakUSDC Vault V1.
 * const vault = await fetchAccrualVault(vaultAddress, client);
 * const marketParamsList = [...vault.allocations.values()]
 *   .filter(({ config, position }) => config.enabled && position.supplyShares > 0n)
 *   .map(({ position }) => position.market.params);
 * const plan = await prepareVaultV1InKindRedeem(client, {
 *   chainId: mainnet.id, account: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
 *   vault, assets: 1_000_000n, marketParamsList,
 * });
 * // plan satisfies TransactionPlan: { version, chainId, account, expiresAt, steps, signatureRequests }
 * ```
 */
export async function prepareVaultV1InKindRedeem(
  client: Client,
  params: VaultV1InKindRedeemPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account, vault } = params;
  const now = params.now ?? Time.timestamp();
  const intent = resolveIntent(params, now);
  validateChainId(client.chain?.id, chainId);
  const quote = computeVaultV1InKindRedeemQuote({
    vaultData: vault,
    chainId,
    deadline: intent.deadline,
    now,
    amount: params.assets,
    marketParamsList: params.marketParamsList,
  });
  const inputs = vaultV1InKindRedeem({
    vault: { chainId, address: vault.address },
    args: {
      amount: params.assets,
      marketParamsList: quote.marketParamsListSnapshot,
      userAddress: account,
      deadline: quote.deadline,
    },
  }).action.args;
  const requirements = await getVaultV1InKindRedeemRequirements(client, {
    vaultData: vault,
    vault: vault.address,
    userAddress: account,
    chainId,
    deadline: quote.deadline,
    requiredShareAllowance: quote.requiredShareAllowance,
    supportSignature: intent.supportSignature,
    now,
    amount: params.assets,
  });
  const approvals: Step[] = [];
  const signatureRequests: SignatureRequest[] = [];
  const id = "vaultV1InKindRedeem:tokenPermit";
  for (const requirement of requirements) {
    if (isRequirementApproval(requirement)) {
      approvals.push(
        buildApprovalStep(requirement, {
          id: "vaultV1InKindRedeem:approval",
          chainId,
          account,
          denomination: "shares",
        }),
      );
    } else if (requirement.action.type === "permit") {
      signatureRequests.push(
        buildPermitSignatureRequest({ action: requirement.action }, id),
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
          id: "vaultV1InKindRedeem",
          label: "Redeem vault shares in kind",
          action: {
            type: "vaultV1InKindRedeem",
            inputs: {
              chainId,
              account,
              vault: vault.address,
              assets: inputs.amount,
              deadline: inputs.deadline,
              marketParamsList: inputs.marketParamsList,
            },
            signatureRequestIds: signatureRequests.length
              ? { tokenPermit: id }
              : {},
          },
        },
      ],
      signatureRequests,
    }),
  );
}

/** @internal Encodes the fixed in-kind exit with its referenced permit. */
export function buildVaultV1InKindRedeem(
  action: Extract<Action, { type: "vaultV1InKindRedeem" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV1InKindRedeemAction>> {
  const { chainId, account, vault, assets, ...args } = action.inputs;
  const signature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset: vault,
    owner: account,
  });
  const permit = selectBundlesSharesPermitSignature(
    signature ? [signature] : [],
    {
      spender: getChainAddress(chainId, "bundles.vaultExitBundlesV1"),
      amount: maxUint256,
      deadline: action.inputs.deadline,
    },
  );
  return vaultV1InKindRedeem({
    vault: { chainId, address: vault },
    args: {
      ...args,
      amount: assets,
      userAddress: account,
      requirementSignature: permit,
    },
  });
}

/** @internal Validates the stored in-kind action and ordered market structs. */
export function validateInKindRedeemPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      vault: "address",
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
