import { getChainAddresses } from "@morpho-org/blue-sdk";
import {
  erc2612Abi,
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  isContractRevertError,
  isTransportError,
  isUndecodableResultError,
  MissingPermitDomainNameError,
  UnsupportedPermitDomainExtensionsError,
} from "@morpho-org/blue-sdk-viem";
import { _try, isDefined, Time } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Client,
  erc20Abi,
  getTypesForEIP712Domain,
  hashDomain,
  isAddressEqual,
  maxUint256,
  type TypedData,
} from "viem";
import { readContract } from "viem/actions";
import { resolveBundlesTokenRequirements } from "../../actions/bundles/index.js";
import { encodeErc20Permit } from "../../actions/requirements/encode/encodeErc20Permit.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import {
  validateChainId,
  validateRequirementSpender,
} from "../../helpers/index.js";
import {
  type BundlesTokenSignatureRequirement,
  type ERC20ApprovalAction,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for {@link getBundlesTokenRequirements}. */
export interface GetBundlesTokenRequirementsParams {
  /** ERC-20 token funded by the operation. */
  readonly token: Address;
  /** Registered fixed bundles contract that pulls the token. */
  readonly spender: Address;
  /** Exact amount the bundles contract will pull. */
  readonly amount: bigint;
  /** Account funding the operation. */
  readonly owner: Address;
  /** Target chain id. */
  readonly chainId: number;
  /** Final-call and signature deadline. */
  readonly deadline: bigint;
  /** Whether the caller can collect offchain token signatures. */
  readonly supportSignature: boolean;
  /** Whether token metadata reads may use deployless aggregation. */
  readonly supportDeployless?: boolean;
  /** Prefer ERC-2612 when the token exposes a compatible nonce; defaults to true when signatures are supported. */
  readonly useSimplePermit?: boolean;
  /** @deprecated Ignored. The SDK no longer requests Permit2 funding; use ERC-2612 permits or ERC-20 approvals. */
  readonly permit2Nonce?: bigint;
  /** Timestamp the deadline is validated against; defaults to the current time. */
  readonly now?: bigint;
}

/**
 * Resolves direct approval or ERC-2612 prerequisites for a registered fixed bundles contract.
 *
 * Reads the direct allowance first for nonzero amounts. Only when it is insufficient does
 * the selected signature path try ERC-2612 nonce and metadata reads. A permit is returned only
 * when the token's DOMAIN_SEPARATOR matches the domain to be signed; otherwise use approval.
 *
 * @param viemClient - Connected viem client used for allowance and nonce reads.
 * @param params - Token requirement parameters.
 * @param params.token - ERC-20 token funded by the operation.
 * @param params.spender - Registered fixed bundles contract that pulls the token.
 * @param params.amount - Exact amount the contract will pull; zero returns no requirements.
 * @param params.owner - Account funding the operation.
 * @param params.chainId - Target chain id; must match the client chain.
 * @param params.deadline - Final-call and signature deadline.
 * @param params.now - Timestamp the deadline is validated against; defaults to the current time.
 * @param params.supportSignature - Whether ERC-2612 signatures may be requested.
 * @param params.supportDeployless - Whether ERC-2612 metadata reads may use deployless calls.
 * @param params.useSimplePermit - Defaults to true when signatures are supported. Prefer ERC-2612 when `nonces()` succeeds and the token's
 *   DOMAIN_SEPARATOR matches the signing domain. Missing, mismatched, or unsupported domains,
 *   or recognized nonce/separator reverts or undecodable results, fall back to classic approval. A malformed
 *   `eip712Domain()` result rejects with `MalformedTokenMetadataError`.
 * @param params.permit2Nonce - Deprecated and ignored.
 * @returns Ordered deep-frozen approval transactions and/or signable token requirements;
 *   empty when the direct allowance already covers the amount, without probing permit support.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`,
 *   another chain than `params.chainId`.
 * @throws {NegativeInputError} when `amount` is negative.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {ExpiredDeadlineError} when `deadline` is positive but not in the future.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not the chain's registered
 *   BlueBundlesV1 or VaultBundlesV1 deployment, including for a zero-amount request.
 * @throws {InputExceedsMaxError} when `amount` or `deadline` exceeds uint256.
 * @throws {UnknownTokenError} when the token's `decimals()` reverts, has no code, returns
 *   undecodable data, or is out of range.
 * @throws {MalformedTokenMetadataError} when the token's `eip712Domain()` or
 *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
 *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
 * @throws {viem.BaseError} when a required allowance, ERC-2612 metadata, DOMAIN_SEPARATOR,
 *   or `eth_chainId` read fails. Nonce and separator probes fall back to classic approval
 *   only when the token reverts or returns undecodable data; other read failures propagate.
 *   `MissingPermitDomainNameError`, `InvalidPermitDomainChainIdError`,
 *   `InvalidPermitDomainVerifyingContractError`, and `UnsupportedPermitDomainExtensionsError`
 *   are handled internally and fall back to approval.
 * @example
 * ```ts
 * import { addressesRegistry } from "@morpho-org/blue-sdk";
 * import { getChainAddress } from "@morpho-org/morpho-ts";
 * import { createPublicClient, http, zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getBundlesTokenRequirements } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vaultBundlesV1 = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
 * const requirements = await getBundlesTokenRequirements(client, {
 *   token: addressesRegistry[mainnet.id].usdc,
 *   spender: vaultBundlesV1,
 *   amount: 1_000_000n,
 *   owner: zeroAddress,
 *   chainId: mainnet.id,
 *   deadline: 1_900_000_000n,
 *   supportSignature: true,
 * });
 * // requirements contains approvals and/or signable bundles token requirements.
 * ```
 */
export const getBundlesTokenRequirements = async (
  viemClient: Client,
  params: GetBundlesTokenRequirementsParams,
): Promise<
  readonly (
    | Readonly<Transaction<ERC20ApprovalAction>>
    | BundlesTokenSignatureRequirement
  )[]
> => {
  validateChainId(viemClient.chain?.id, params.chainId);
  validateRequirementSpender({
    chainId: params.chainId,
    spender: params.spender,
    allowed: ["blueBundlesV1", "vaultBundlesV1"],
  });
  if (params.amount < 0n) {
    throw new NegativeInputError("amount", params.amount);
  }
  // Reject oversized inputs before any RPC read so this resolver never asks the user to sign or
  // submit an approval/permit that the eventual BlueBundlesV1 call (uint256 ABI) would reject.
  if (params.amount > maxUint256) {
    throw new InputExceedsMaxError({
      field: "amount",
      value: params.amount,
      max: maxUint256,
    });
  }
  if (params.deadline <= 0n) {
    throw new NonPositiveInputError("deadline", params.deadline);
  }
  if (params.deadline > maxUint256) {
    throw new InputExceedsMaxError({
      field: "deadline",
      value: params.deadline,
      max: maxUint256,
    });
  }
  // Reject an already-expired deadline before the RPC reads so a direct caller of this resolver
  // never signs a permit for a supply the BlueBundlesV1 call would revert. The entity validates
  // this too, but the exported resolver must guard its own callers.
  const timestamp = params.now ?? Time.timestamp();
  if (params.deadline <= timestamp) {
    throw new ExpiredDeadlineError(params.deadline, timestamp);
  }
  if (params.amount === 0n) return [];
  await validateClientChainId(viemClient, params.chainId);

  const allowance = await readContract(viemClient, {
    abi: erc20Abi,
    address: params.token,
    functionName: "allowance",
    args: [params.owner, params.spender],
  });
  if (allowance >= params.amount) return [];

  const { dai } = getChainAddresses(params.chainId);

  if (params.supportSignature) {
    const isDai = isDefined(dai) && isAddressEqual(params.token, dai);
    if ((params.useSimplePermit ?? true) && !isDai) {
      const nonce = await readContract(viemClient, {
        abi: erc2612Abi,
        address: params.token,
        functionName: "nonces",
        args: [params.owner],
      }).catch((error: unknown) => {
        if (isTransportError(error)) throw error;
        if (isContractRevertError(error) || isUndecodableResultError(error))
          return undefined;
        throw error;
      });

      if (isDefined(nonce)) {
        const permit = await _try(
          () =>
            encodeErc20Permit(viemClient, {
              token: params.token,
              owner: params.owner,
              spender: params.spender,
              amount: params.amount,
              chainId: params.chainId,
              nonce,
              deadline: params.deadline,
              now: timestamp,
              supportDeployless: params.supportDeployless,
            }),
          MissingPermitDomainNameError,
          InvalidPermitDomainChainIdError,
          InvalidPermitDomainVerifyingContractError,
          UnsupportedPermitDomainExtensionsError,
        );
        if (isDefined(permit)) {
          const separator = await readContract(viemClient, {
            abi: erc2612Abi,
            address: params.token,
            functionName: "DOMAIN_SEPARATOR",
          }).catch((error: unknown) => {
            if (isTransportError(error)) throw error;
            if (isContractRevertError(error) || isUndecodableResultError(error))
              return undefined;
            throw error;
          });
          const domain = permit.action.typedData.domain ?? {};
          if (
            separator?.toLowerCase() ===
            hashDomain<TypedData>({
              domain,
              types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
            }).toLowerCase()
          )
            return [permit];
        }
      }
    }
  }

  return resolveBundlesTokenRequirements({
    token: params.token,
    spender: params.spender,
    owner: params.owner,
    chainId: params.chainId,
    amount: params.amount,
    deadline: params.deadline,
    now: timestamp,
    state: {
      type: "approval",
      allowance,
    },
  });
};
