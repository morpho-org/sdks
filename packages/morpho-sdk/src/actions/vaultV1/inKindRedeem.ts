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
  type VaultV1InKindRedeemAction,
} from "../../types/index.js";
import { getVaultExitBundlesV1PermitStruct } from "../signatures/getVaultExitBundlesV1PermitStruct.js";

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

/**
 * Prepares a Vault V1 in-kind redemption into Morpho Blue supply positions.
 *
 * The transaction calls VaultExitBundlesV1 directly. Without a signature it embeds the contract's
 * empty-permit sentinel; the user must first approve VaultExitBundlesV1 for `maxUint256` shares.
 *
 * @param params - In-kind redemption parameters.
 * @param params.vault - Target Vault V1 address and chain.
 * @param params.args.amount - Asset-denominated amount to exit.
 * @param params.args.marketParamsList - Ordered markets consumed greedily by the contract.
 * @param params.args.userAddress - Sending account whose vault shares are burned.
 * @param params.args.deadline - Permit and bundle deadline.
 * @param params.args.requirementSignature - Optional max-value Vault V1 shares permit.
 * @param params.metadata - Optional analytics metadata.
 * @returns A deep-frozen VaultExitBundlesV1 transaction.
 * @throws {NonPositiveInputError} when `amount` or `deadline` is not positive.
 * @throws {EmptyMarketParamsListError} when no markets are supplied.
 * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
 * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
 * @throws {InKindRedeemPermitMismatchError} when the requirement has the wrong permit kind, asset, amount, or signature encoding.
 * @example
 * ```ts
 * import { vaultV1InKindRedeem } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV1InKindRedeem({
 *   vault: { chainId: 1, address: vault },
 *   args: { amount: 1_000_000n, marketParamsList, userAddress, deadline },
 * });
 * ```
 */
export const vaultV1InKindRedeem = ({
  vault,
  args,
  metadata,
}: VaultV1InKindRedeemParams): Readonly<
  Transaction<VaultV1InKindRedeemAction>
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
  const sharesPermit = getVaultExitBundlesV1PermitStruct({
    vault: vault.address,
    deadline: args.deadline,
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
  if (metadata) tx = addTransactionMetadata(tx, metadata);

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
