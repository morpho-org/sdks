import type { InputMarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultExitBundlesV1Abi } from "../../abis.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import { parseDeadline } from "../../helpers/parse.js";
import {
  EmptyMarketParamsListError,
  type Metadata,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type Transaction,
  type VaultV1InKindRedeemAction,
} from "../../types/index.js";
import { getParsedBundlesSharesPermit } from "../bundles/common.js";

/** Parameters for {@link vaultV1InKindRedeem}. */
export interface VaultV1InKindRedeemParams {
  readonly vault: { readonly chainId: number; readonly address: Address };
  readonly args: {
    readonly amount: bigint;
    readonly marketParamsList: readonly InputMarketParams[];
    readonly userAddress: Address;
    readonly deadline: bigint;
    readonly requirementSignature?: PermitRequirementSignature;
  };
  readonly metadata?: Metadata;
}

declare const vaultV1InKindRedeemInput: unique symbol;
/** Checked static in-kind fields; signatures and snapshots remain untrusted. @internal */
export type VaultV1InKindRedeemInput = {
  readonly vault: Readonly<VaultV1InKindRedeemParams["vault"]>;
  readonly args: Omit<
    VaultV1InKindRedeemParams["args"],
    "requirementSignature" | "amount" | "deadline"
  > & { readonly amount: bigint; readonly deadline: bigint };
  readonly metadata?: Metadata;
  readonly requirementSignature?: VaultV1InKindRedeemParams["args"]["requirementSignature"];
  readonly [vaultV1InKindRedeemInput]: true;
};

/**
 * Prepares a Vault V1 in-kind redemption into Morpho Blue supply positions.
 *
 * The transaction calls VaultExitBundlesV1 directly. Without a signature it embeds the contract's
 * empty-permit sentinel; the user must first approve enough shares for the exit.
 *
 * @param params - In-kind redemption parameters.
 * @param params.vault.chainId - Chain containing the target Vault V1 and VaultExitBundlesV1.
 * @param params.vault.address - Target Vault V1 address.
 * @param params.args.amount - Asset-denominated amount to exit.
 * @param params.args.marketParamsList - Ordered markets consumed greedily by the contract.
 * @param params.args.userAddress - Redeeming account, recorded in action metadata and validated as
 *   the expected owner of an optional `requirementSignature` permit. VaultExitBundlesV1 burns
 *   `msg.sender`'s vault shares, so the submitting account must equal this address.
 * @param params.args.deadline - Permit and bundle deadline.
 * @param params.args.requirementSignature - Optional unlimited Vault V1 shares permit.
 * @param params.metadata - Optional analytics metadata.
 * @returns A deep-frozen `Readonly<Transaction<VaultV1InKindRedeemAction>>` with `to`, `value`,
 *   `data`, and the typed action discriminator.
 * @throws {NonPositiveInputError} when `amount` or `deadline` is not positive.
 * @throws {InputExceedsMaxError} when the bundle or permit deadline exceeds `uint256`.
 * @throws {EmptyMarketParamsListError} when no markets are supplied.
 * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
 * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
 * @throws {BundlesPermitMismatchError} when the requirement has the wrong permit kind, asset, owner,
 *   spender, or signature encoding, or when its signed and action amounts, deadlines, or a supplied
 *   action nonce disagree.
 * @example
 * ```ts
 * import { vaultV1InKindRedeem } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV1InKindRedeem({
 *   vault: { chainId: 1, address: vault },
 *   args: { amount: 1_000_000n, marketParamsList, userAddress, deadline },
 * });
 * // tx satisfies Readonly<Transaction<VaultV1InKindRedeemAction>>
 * ```
 */
export const vaultV1InKindRedeem = (
  params: VaultV1InKindRedeemParams,
): Readonly<Transaction<VaultV1InKindRedeemAction>> =>
  buildVaultV1InKindRedeem(parseVaultV1InKindRedeem(params));

/** Constructs a complete positive in-kind operation and owns its nonempty market list. @internal */
export const parseVaultV1InKindRedeem = (
  params: VaultV1InKindRedeemParams,
): VaultV1InKindRedeemInput => {
  const amount = params.args.amount;
  if (amount <= 0n) {
    throw new NonPositiveInputError("amount", amount);
  }
  const deadline = parseDeadline(params.args.deadline);
  if (params.args.marketParamsList.length === 0) {
    throw new EmptyMarketParamsListError();
  }
  const marketParamsList = Object.freeze(
    params.args.marketParamsList.map(
      ({ loanToken, collateralToken, oracle, irm, lltv }) =>
        Object.freeze({ loanToken, collateralToken, oracle, irm, lltv }),
    ),
  );
  const input: Omit<VaultV1InKindRedeemInput, typeof vaultV1InKindRedeemInput> =
    {
      vault: { chainId: params.vault.chainId, address: params.vault.address },
      args: {
        userAddress: params.args.userAddress,
        amount,
        deadline,
        marketParamsList: Object.freeze(marketParamsList),
      },
      metadata: params.metadata,
      requirementSignature: params.args.requirementSignature,
    };
  return input as VaultV1InKindRedeemInput;
};

/** Encodes parsed fields and independently binds a fresh share permit. @internal */
export const buildVaultV1InKindRedeem = (
  parsed: VaultV1InKindRedeemInput,
  signatures: Pick<
    VaultV1InKindRedeemParams["args"],
    "requirementSignature"
  > = parsed,
): Readonly<Transaction<VaultV1InKindRedeemAction>> => {
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
      functionName: "vaultExitBundlesV1InKindRedemptionVaultV1",
      args: [
        vault.address,
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
      type: "vaultV1InKindRedeem",
      args: {
        vault: vault.address,
        amount: args.amount,
        marketParamsList,
        onBehalf: args.userAddress,
        deadline: args.deadline,
      },
    },
  });
};
