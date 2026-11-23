import { MarketUtils } from "@morpho-org/blue-sdk";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import { vaultV2ForceRedeem } from "../../actions/vaultV2/forceRedeem.js";
import type {
  ReferenceTimestampParams,
  Transaction,
  VaultV2ForceRedeemAction,
} from "../../types/index.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import type { Action, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";

/** @internal Validates the stored force-redeem action's plain input shape. */
export function validateForceRedeemPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputPath);
  validatePlanFields(inputs, {
    path: inputPath,
    fields: { vault: "address", deallocations: "array" },
  });
  validatePlanFields(getPlanObject(inputs.redeem, `${inputPath}.redeem`), {
    path: `${inputPath}.redeem`,
    fields: { shares: "uint256 bigint" },
  });
  for (const [index, value] of (inputs.deallocations as unknown[]).entries()) {
    const entryPath = `${inputPath}.deallocations[${index}]`;
    const entry = getPlanObject(value, entryPath);
    validatePlanFields(entry, {
      path: entryPath,
      fields: { adapter: "address", assets: "uint256 bigint" },
    });
    if (entry.marketParams !== undefined) {
      validatePlanFields(
        getPlanObject(entry.marketParams, `${entryPath}.marketParams`),
        {
          path: `${entryPath}.marketParams`,
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
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Caller-supplied shares and deallocations for the vault's native force-redeem multicall.
 * No approval or signature is needed.
 * @example
 * ```ts
 * const params: VaultV2ForceRedeemPlanParams = {
 *   vaultAddress, chainId: 1, account, shares: 100n,
 *   deallocations: [{ adapter, assets: 100n }],
 * };
 * ```
 */
export interface VaultV2ForceRedeemPlanParams
  extends Pick<
      IntentParams,
      "chainId" | "account" | "expiresAt" | "calldataOrigin"
    >,
    ReferenceTimestampParams {
  readonly vaultAddress: Address;
  readonly shares: bigint;
  /** Fixed, ordered asset deallocations executed before redeeming. Include any required penalty buffer. */
  readonly deallocations: Extract<
    Action,
    { type: "vaultV2ForceRedeem" }
  >["inputs"]["deallocations"];
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares one vault multicall, fixing the supplied deallocations and shares in the plan.
 * Shares and deallocation penalties are burned from `account`; redeemed assets go to `account`.
 * No permissions are requested, and expiry is plan metadata, not an onchain deadline.
 * @param client - Client used to validate the chain, not retained by the plan.
 * @param params.vaultAddress - Vault V2 whose shares are redeemed.
 * @param params.chainId - Chain containing the vault.
 * @param params.account - Share owner submitting the multicall and receiving the redeemed assets.
 * @param params.shares - Positive shares to redeem, in vault share base units.
 * @param params.deallocations - Non-empty, ordered deallocations with positive `assets` in asset base units, including any penalty buffer.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h` and is plan metadata only.
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to each built transaction's calldata.
 * @returns A deep-frozen `TransactionPlan` containing one `vaultV2ForceRedeem` step and no signature requests.
 * @throws {ChainIdMismatchError} If the client targets another chain.
 * @throws {EmptyDeallocationsError} If `deallocations` is empty.
 * @throws {NonPositiveInputError} If expiry, shares or any deallocation assets are non-positive.
 * @throws {ZeroAccountError} If `account` is the zero address.
 * @throws {NonIntegerInputError} If `expiresAt` is not a safe integer.
 * @throws {ExpiredDeadlineError} If `expiresAt` is not in the future.
 * @throws {InvalidCalldataOriginError} If `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @example
 * ```ts
 * import { prepareVaultV2ForceRedeem, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * // Fixture addresses for preparation only; use your vault, adapter and share owner before execution.
 * const IN_KIND_VAULT = "0x0000000000000000000000000000000000001001";
 * const IN_KIND_ADAPTER = "0x0000000000000000000000000000000000001002";
 * const IN_KIND_USER = "0x0000000000000000000000000000000000001004";
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const plan: TransactionPlan = await prepareVaultV2ForceRedeem(client, {
 *   vaultAddress: IN_KIND_VAULT, chainId: mainnet.id, account: IN_KIND_USER,
 *   shares: 100n,
 *   now: (await client.getBlock()).timestamp,
 *   deallocations: [{ adapter: IN_KIND_ADAPTER, assets: 100n }],
 * });
 * // plan.steps contains one step with action.type === "vaultV2ForceRedeem".
 * // plan.signatureRequests is []; the caller signs and submits the built transaction.
 * ```
 */
export async function prepareVaultV2ForceRedeem(
  client: Client,
  params: VaultV2ForceRedeemPlanParams,
): Promise<TransactionPlan> {
  const now = params.now ?? Time.timestamp();
  const intent = resolveIntent(params, now);
  const plan = structuredClone({
    version: 2,
    account: params.account,
    chainId: params.chainId,
    expiresAt: intent.expiresAt,
    ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
    steps: [
      {
        id: "vaultV2ForceRedeem",
        label: "Force redeem from vault",
        action: {
          type: "vaultV2ForceRedeem",
          inputs: {
            chainId: params.chainId,
            account: params.account,
            vault: params.vaultAddress,
            redeem: { shares: params.shares },
            deallocations: params.deallocations.map(
              ({ adapter, assets, marketParams }) => ({
                adapter,
                assets,
                ...(marketParams && {
                  marketParams: {
                    loanToken: marketParams.loanToken,
                    collateralToken: marketParams.collateralToken,
                    oracle: marketParams.oracle,
                    irm: marketParams.irm,
                    lltv: marketParams.lltv,
                  },
                }),
              }),
            ),
          },
        },
      },
    ] as const,
    signatureRequests: [],
  } satisfies TransactionPlan);
  // Validate the cloned inputs with the action encoder before returning a plan.
  buildVaultV2ForceRedeem(plan.steps[0].action);
  await validateClientChainId(client, params.chainId);
  return deepFreeze(plan);
}

/** @internal Encodes the fixed multicall through the same action as the forceRedeem handle. */
export function buildVaultV2ForceRedeem(
  action: Extract<Action, { type: "vaultV2ForceRedeem" }>,
): Readonly<Transaction<VaultV2ForceRedeemAction>> {
  return vaultV2ForceRedeem({
    vault: { address: action.inputs.vault },
    args: {
      deallocations: action.inputs.deallocations.map(
        ({ adapter, assets, marketParams }) => ({
          adapter,
          amount: assets,
          ...(marketParams && {
            marketParams: {
              ...marketParams,
              id: MarketUtils.getMarketId(marketParams),
              liquidationIncentiveFactor:
                MarketUtils.getLiquidationIncentiveFactor(marketParams),
            },
          }),
        }),
      ),
      redeem: {
        shares: action.inputs.redeem.shares,
        recipient: action.inputs.account,
      },
      onBehalf: action.inputs.account,
    },
  });
}
