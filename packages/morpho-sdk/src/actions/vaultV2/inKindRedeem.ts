import type { InputMarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultExitBundlesV1Abi } from "../../abis.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  EmptyMarketParamsListError,
  type Metadata,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type Transaction,
  type VaultV2InKindRedeemAction,
} from "../../types/index.js";
import { getVaultExitBundlesV1Permit } from "../inKindRedeem.js";

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

/**
 * Prepares a Vault V2 in-kind redemption into Morpho Blue supply positions.
 *
 * `amount` includes the Vault V2 force-deallocation penalty. Without a signature this embeds the
 * empty-permit sentinel and requires a prior max-share approval to VaultExitBundlesV1.
 *
 * @param params - In-kind redemption parameters.
 * @param params.vault - Target Vault V2 address and chain.
 * @param params.args.adapter - Vault's sole MorphoMarketV1AdapterV2.
 * @param params.args.amount - Penalty-inclusive, asset-denominated amount to exit.
 * @param params.args.marketParamsList - Ordered markets consumed greedily by the contract.
 * @param params.args.userAddress - Sending account whose vault shares are burned.
 * @param params.args.deadline - Permit and bundle deadline.
 * @param params.args.requirementSignature - Optional max-value Vault V2 shares permit.
 * @param params.metadata - Optional analytics metadata.
 * @returns A deep-frozen VaultExitBundlesV1 transaction.
 * @throws {NonPositiveInputError} when `amount` or `deadline` is not positive.
 * @throws {EmptyMarketParamsListError} when no markets are supplied.
 * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
 * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
 * @throws {InKindRedeemPermitMismatchError} when the permit is not bound to this exit.
 * @example
 * ```ts
 * import { vaultV2InKindRedeem } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV2InKindRedeem({
 *   vault: { chainId: 1, address: vault },
 *   args: { adapter, amount: 1_000_000n, marketParamsList, userAddress, deadline },
 * });
 * ```
 */
export const vaultV2InKindRedeem = ({
  vault,
  args,
  metadata,
}: VaultV2InKindRedeemParams): Readonly<
  Transaction<VaultV2InKindRedeemAction>
> => {
  if (args.amount <= 0n) throw new NonPositiveInputError("amount", args.amount);
  if (args.deadline <= 0n)
    throw new NonPositiveInputError("deadline", args.deadline);
  if (args.marketParamsList.length === 0)
    throw new EmptyMarketParamsListError();

  const to = getChainAddress(vault.chainId, "bundles.vaultExitBundlesV1");
  const marketParamsList = args.marketParamsList.map((marketParams) => ({
    loanToken: marketParams.loanToken,
    collateralToken: marketParams.collateralToken,
    oracle: marketParams.oracle,
    irm: marketParams.irm,
    lltv: marketParams.lltv,
  }));
  const sharesPermit = getVaultExitBundlesV1Permit({
    vault: vault.address,
    userAddress: args.userAddress,
    spender: to,
    deadline: args.deadline,
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
  if (metadata) tx = addTransactionMetadata(tx, metadata);

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
