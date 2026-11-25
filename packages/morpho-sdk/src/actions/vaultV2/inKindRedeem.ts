import type { InputMarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultExitBundlesV1Abi } from "../../abis.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import { parseDeadline } from "../../helpers/parse.js";
import {
  type Metadata,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type Transaction,
  type VaultV2InKindRedeemAction,
} from "../../types/index.js";
import { getParsedBundlesSharesPermit } from "../bundles/common.js";

/** Parameters for {@link vaultV2InKindRedeem}. */
export interface VaultV2InKindRedeemParams {
  readonly vault: { readonly chainId: number; readonly address: Address };
  readonly args: {
    readonly adapter: Address;
    readonly amount: bigint;
    readonly marketParamsList: readonly InputMarketParams[];
    readonly userAddress: Address;
    readonly deadline: bigint;
    readonly requirementSignature?: PermitRequirementSignature;
  };
  readonly metadata?: Metadata;
}

declare const vaultV2InKindRedeemInput: unique symbol;
/** Checked static in-kind fields; signatures and snapshots remain untrusted. @internal */
export type VaultV2InKindRedeemInput = {
  readonly vault: Readonly<VaultV2InKindRedeemParams["vault"]>;
  readonly args: Omit<
    VaultV2InKindRedeemParams["args"],
    "requirementSignature" | "amount" | "deadline"
  > & { readonly amount: bigint; readonly deadline: bigint };
  readonly metadata?: Metadata;
  readonly requirementSignature?: VaultV2InKindRedeemParams["args"]["requirementSignature"];
  readonly [vaultV2InKindRedeemInput]: true;
};

/**
 * Prepares a Vault V2 in-kind redemption into idle assets and Morpho Blue supply positions.
 *
 * `amount` includes the Vault V2 force-deallocation penalty. Without a signature this embeds the
 * empty-permit sentinel and requires a sufficient share approval to VaultExitBundlesV1.
 *
 * @param params - In-kind redemption parameters.
 * @param params.vault.chainId - Chain containing the target Vault V2 and VaultExitBundlesV1.
 * @param params.vault.address - Target Vault V2 address.
 * @param params.args.adapter - Vault's sole MorphoMarketV1AdapterV2.
 * @param params.args.amount - Penalty-inclusive, asset-denominated amount to exit.
 * @param params.args.marketParamsList - Ordered markets consumed greedily after idle assets. May be
 *   empty when the vault's idle balance covers `amount`.
 * @param params.args.userAddress - Redeeming account, recorded in action metadata and validated as
 *   the expected owner of an optional `requirementSignature` permit. VaultExitBundlesV1 burns
 *   `msg.sender`'s vault shares, so the submitting account must equal this address.
 * @param params.args.deadline - Permit and bundle deadline.
 * @param params.args.requirementSignature - Optional unlimited Vault V2 shares permit.
 * @param params.metadata - Optional analytics metadata.
 * @returns A deep-frozen `Readonly<Transaction<VaultV2InKindRedeemAction>>` with `to`, `value`,
 *   `data`, and the typed action discriminator.
 * @throws {NonPositiveInputError} when `amount` or `deadline` is not positive.
 * @throws {InputExceedsMaxError} when the bundle or permit deadline exceeds `uint256`.
 * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
 * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
 * @throws {BundlesPermitMismatchError} when the requirement has the wrong permit kind, asset, owner,
 *   spender, or signature encoding, or when its signed and action amounts, deadlines, or a supplied
 *   action nonce disagree.
 * @example
 * ```ts
 * import { vaultV2InKindRedeem } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV2InKindRedeem({
 *   vault: { chainId: 1, address: vault },
 *   args: { adapter, amount: 1_000_000n, marketParamsList, userAddress, deadline },
 * });
 * // tx satisfies Readonly<Transaction<VaultV2InKindRedeemAction>>
 * ```
 */
export const vaultV2InKindRedeem = (
  params: VaultV2InKindRedeemParams,
): Readonly<Transaction<VaultV2InKindRedeemAction>> =>
  buildVaultV2InKindRedeem(parseVaultV2InKindRedeem(params));

/** Constructs a complete in-kind operation, owning the ordered market tuples. @internal */
export const parseVaultV2InKindRedeem = (
  params: VaultV2InKindRedeemParams,
): VaultV2InKindRedeemInput => {
  const amount = params.args.amount;
  if (amount <= 0n) {
    throw new NonPositiveInputError("amount", amount);
  }
  const deadline = parseDeadline(params.args.deadline);
  const marketParamsList = params.args.marketParamsList.map(
    ({ loanToken, collateralToken, oracle, irm, lltv }) =>
      Object.freeze({ loanToken, collateralToken, oracle, irm, lltv }),
  );
  return {
    vault: { chainId: params.vault.chainId, address: params.vault.address },
    args: {
      adapter: params.args.adapter,
      userAddress: params.args.userAddress,
      amount,
      deadline,
      marketParamsList: Object.freeze(marketParamsList),
    },
    metadata: params.metadata,
    requirementSignature: params.args.requirementSignature,
  } as VaultV2InKindRedeemInput;
};

/** Encodes parsed fields and independently binds a fresh share permit. @internal */
export const buildVaultV2InKindRedeem = (
  parsed: VaultV2InKindRedeemInput,
  signatures: Pick<
    VaultV2InKindRedeemParams["args"],
    "requirementSignature"
  > = parsed,
): Readonly<Transaction<VaultV2InKindRedeemAction>> => {
  const { vault, metadata } = parsed;
  const args = {
    ...parsed.args,
    requirementSignature: signatures.requirementSignature,
  };
  const to = getChainAddress(vault.chainId, "bundles.vaultExitBundlesV1");
  const marketParamsList = args.marketParamsList;
  const sharesPermit = getParsedBundlesSharesPermit({
    vault: vault.address,
    deadline: args.deadline,
    owner: args.userAddress,
    spender: to,
    requirementSignature: args.requirementSignature,
  });
  let tx = {
    to,
    value: 0n,
    data: encodeFunctionData({
      abi: vaultExitBundlesV1Abi,
      functionName: "vaultExitBundlesV1InKindRedemptionVaultV2",
      args: [
        vault.address,
        args.adapter,
        marketParamsList,
        args.amount,
        sharesPermit,
        args.deadline,
      ],
    }),
  };
  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "vaultV2InKindRedeem",
      args: {
        vault: vault.address,
        adapter: args.adapter,
        amount: args.amount,
        marketParamsList,
        onBehalf: args.userAddress,
        deadline: args.deadline,
      },
    },
  });
};
