import { getChainAddresses } from "@morpho-org/blue-sdk";
import {
  erc2612Abi,
  isContractRevertError,
  isTransportError,
  isUndecodableResultError,
  MissingPermitDomainNameError,
  permit2Abi,
} from "@morpho-org/blue-sdk-viem";
import { _try, isDefined, Time } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Client,
  erc20Abi,
  isAddressEqual,
  maxUint256,
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
  ApprovalAmountLessThanSpendAmountError,
  type BundlesTokenSignatureRequirement,
  type ERC20ApprovalAction,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import { getUnusedPermit2Nonce } from "./getUnusedPermit2Nonce.js";

/** Parameters for {@link getBundlesTokenRequirements}. */
export interface GetBundlesTokenRequirementsParams {
  /** ERC-20 token funded by the operation. */
  readonly token: Address;
  /** Registered fixed bundles contract that pulls the token. */
  readonly spender: Address;
  /** Exact amount the bundles contract will pull. */
  readonly amount: bigint;
  /** Classic approval amount; defaults to the exact pull amount. */
  readonly approvalAmount?: bigint;
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
  /** Prefer ERC-2612 when the token exposes a compatible nonce. */
  readonly useSimplePermit?: boolean;
  /** Explicit unused uint256 nonce; defaults to the lowest unused nonce found via getUnusedPermit2Nonce. */
  readonly permit2Nonce?: bigint;
  /** Timestamp the deadline is validated against; defaults to the current time. */
  readonly now?: bigint;
}

/**
 * Resolves direct approval, ERC-2612, or Permit2 SignatureTransfer prerequisites for
 * a registered fixed bundles contract.
 *
 * Reads only the allowance and nonce state required by the selected path. Permit2 keeps the
 * ERC-20 allowance on canonical Permit2 while the one-time signed transfer names the bundles contract
 * as spender. The resolver picks the lowest unused unordered nonce by default; concurrent flows for
 * the same owner should pass explicit nonces.
 *
 * @param viemClient - Connected viem client used for allowance and nonce reads.
 * @param params - Token requirement parameters.
 * @param params.token - ERC-20 token funded by the operation.
 * @param params.spender - Registered fixed bundles contract that pulls the token.
 * @param params.amount - Exact amount the contract will pull; zero returns no requirements.
 * @param params.approvalAmount - Classic approval amount; defaults to `amount` and is ignored by signature paths.
 * @param params.owner - Account funding the operation.
 * @param params.chainId - Target chain id; must match the client chain.
 * @param params.deadline - Final-call and signature deadline.
 * @param params.now - Timestamp the deadline is validated against; defaults to the current time.
 * @param params.supportSignature - Whether ERC-2612 or Permit2 signatures may be requested.
 * @param params.supportDeployless - Whether ERC-2612 metadata reads may use deployless calls.
 * @param params.useSimplePermit - Prefer ERC-2612 when `nonces()` succeeds and the token's permit
 *   domain is known; a recognized `nonces()` revert or undecodable result, or a missing domain
 *   (no `name()` and no EIP-5267 domain), falls back to Permit2 or classic approval. A malformed
 *   `eip712Domain()` result rejects with `MalformedTokenMetadataError`.
 * @param params.permit2Nonce - Explicit unused uint256 nonce; defaults to the lowest unused nonce
 *   found via {@link getUnusedPermit2Nonce}.
 * @returns Ordered deep-frozen approval transactions and/or signable token requirements.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`,
 *   another chain than `params.chainId`.
 * @throws {NegativeInputError} when `amount` or `permit2Nonce` is negative.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {ExpiredDeadlineError} when `deadline` is positive but not in the future.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not the chain's registered
 *   BlueBundlesV1 or VaultBundlesV1 deployment, including for a zero-amount request.
 * @throws {NoUnusedPermit2NonceError} when every Permit2 nonce for the owner is consumed and none
 *   was passed explicitly.
 * @throws {Permit2SignatureTransferNonceAlreadyUsedError} when `permit2Nonce` is already consumed.
 * @throws {InputExceedsMaxError} when `amount`, `deadline`, or `permit2Nonce` exceeds uint256.
 * @throws {ApprovalAmountLessThanSpendAmountError} when `approvalAmount` is below `amount`.
 * @throws {UnknownTokenError} when the token's `decimals()` reverts, has no code, returns
 *   undecodable data, or is out of range.
 * @throws {MalformedTokenMetadataError} when the token's `eip712Domain()` or
 *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
 *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
 * @throws {viem.BaseError} when a required allowance, Permit2 nonce-bitmap, ERC-2612 metadata,
 *   or `eth_chainId` read fails. An ERC-2612 nonce probe falls back to Permit2 or classic approval
 *   only when the token reverts or returns undecodable data; other read failures propagate. A
 *   missing permit domain is handled internally and also falls back; this function does not
 *   surface `MissingPermitDomainNameError`.
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

  const { permit2, dai } = getChainAddresses(params.chainId);

  if (params.supportSignature) {
    const isDai = isDefined(dai) && isAddressEqual(params.token, dai);
    if (params.useSimplePermit && !isDai) {
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
        );
        if (isDefined(permit)) return [permit];
        // A token that exposes nonces() but has neither name() nor
        // eip712Domain() cannot be permitted over a known domain: fall
        // through to the Permit2/classic-approval path.
      }
    }

    if (permit2 != null) {
      const permit2Nonce =
        params.permit2Nonce ??
        (await getUnusedPermit2Nonce(viemClient, {
          owner: params.owner,
          chainId: params.chainId,
        }));
      if (permit2Nonce < 0n) {
        throw new NegativeInputError("permit2Nonce", permit2Nonce);
      }
      if (permit2Nonce > maxUint256) {
        throw new InputExceedsMaxError({
          field: "permit2Nonce",
          value: permit2Nonce,
          max: maxUint256,
        });
      }
      const wordPosition = permit2Nonce >> 8n;
      const [allowance, nonceBitmap] = await Promise.all([
        readContract(viemClient, {
          abi: erc20Abi,
          address: params.token,
          functionName: "allowance",
          args: [params.owner, permit2],
        }),
        readContract(viemClient, {
          abi: permit2Abi,
          address: permit2,
          functionName: "nonceBitmap",
          args: [params.owner, wordPosition],
        }),
      ]);

      return resolveBundlesTokenRequirements({
        token: params.token,
        spender: params.spender,
        owner: params.owner,
        chainId: params.chainId,
        amount: params.amount,
        deadline: params.deadline,
        now: timestamp,
        state: {
          type: "permit2SignatureTransfer",
          permit2Allowance: allowance,
          permit2Nonce,
          nonceBitmap,
        },
      });
    }
  }

  const approvalAmount = params.approvalAmount ?? params.amount;
  if (approvalAmount < params.amount) {
    throw new ApprovalAmountLessThanSpendAmountError();
  }
  const allowance = await readContract(viemClient, {
    abi: erc20Abi,
    address: params.token,
    functionName: "allowance",
    args: [params.owner, params.spender],
  });
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
      approvalAmount,
    },
  });
};
