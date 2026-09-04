import { getChainAddresses } from "@morpho-org/blue-sdk";
import { erc2612Abi, permit2Abi } from "@morpho-org/blue-sdk-viem";
import { isDefined } from "@morpho-org/morpho-ts";
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
import { validateChainId } from "../../helpers/index.js";
import {
  ApprovalAmountLessThanSpendAmountError,
  type BundlesTokenSignatureRequirement,
  type ERC20ApprovalAction,
  InputExceedsMaxError,
  MissingPermit2SignatureTransferNonceError,
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
  /** Explicit unused Permit2 SignatureTransfer unordered nonce. */
  readonly permit2Nonce?: bigint;
}

/**
 * Resolves direct approval, ERC-2612, or Permit2 SignatureTransfer prerequisites for
 * a registered fixed bundles contract.
 *
 * Reads only the allowance and nonce state required by the selected path. Permit2 keeps the
 * ERC-20 allowance on canonical Permit2 while the one-time signed transfer names the bundles contract
 * as spender. Permit2 SignatureTransfer requires an explicit unused unordered nonce so concurrent
 * requirements never silently sign the same owner-global nonce.
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
 * @param params.supportSignature - Whether ERC-2612 or Permit2 signatures may be requested.
 * @param params.supportDeployless - Whether ERC-2612 metadata reads may use deployless calls.
 * @param params.useSimplePermit - Prefer ERC-2612 when its nonce probe succeeds.
 * @param params.permit2Nonce - Explicit unused uint256 nonce required when Permit2 is selected.
 * @returns Ordered deep-frozen approval transactions and/or signable token requirements.
 * @throws {ChainIdMismatchError} when the connected client targets another chain.
 * @throws {NegativeInputError} when `amount` or `permit2Nonce` is negative.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {MissingPermit2SignatureTransferNonceError} when Permit2 is selected without a nonce.
 * @throws {Permit2SignatureTransferNonceAlreadyUsedError} when `permit2Nonce` is already consumed.
 * @throws {InputExceedsMaxError} when `permit2Nonce` exceeds uint256.
 * @throws {ApprovalAmountLessThanSpendAmountError} when `approvalAmount` is below `amount`.
 * @throws {viem.BaseError} when a required allowance, Permit2 nonce-bitmap, or ERC-2612 metadata
 *   read fails. A failed ERC-2612 nonce probe alone falls back to Permit2 or classic approval.
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
 *   permit2Nonce: 42n,
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
  if (params.amount < 0n) {
    throw new NegativeInputError("amount", params.amount);
  }
  if (params.deadline <= 0n) {
    throw new NonPositiveInputError("deadline", params.deadline);
  }
  if (params.amount === 0n) return [];

  const { permit2, dai } = getChainAddresses(params.chainId);

  if (params.supportSignature) {
    const isDai = isDefined(dai) && isAddressEqual(params.token, dai);
    if (params.useSimplePermit && !isDai) {
      const nonce = await readContract(viemClient, {
        abi: erc2612Abi,
        address: params.token,
        functionName: "nonces",
        args: [params.owner],
      }).catch(() => undefined);

      if (isDefined(nonce)) {
        return [
          await encodeErc20Permit(viemClient, {
            token: params.token,
            spender: params.spender,
            amount: params.amount,
            chainId: params.chainId,
            nonce,
            deadline: params.deadline,
            supportDeployless: params.supportDeployless,
          }),
        ];
      }
    }

    if (permit2 != null) {
      if (params.permit2Nonce == null) {
        throw new MissingPermit2SignatureTransferNonceError();
      }
      if (params.permit2Nonce < 0n) {
        throw new NegativeInputError("permit2Nonce", params.permit2Nonce);
      }
      if (params.permit2Nonce > maxUint256) {
        throw new InputExceedsMaxError({
          field: "permit2Nonce",
          value: params.permit2Nonce,
          max: maxUint256,
        });
      }
      const wordPosition = params.permit2Nonce >> 8n;
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
        state: {
          type: "permit2SignatureTransfer",
          permit2,
          permit2Allowance: allowance,
          permit2Nonce: params.permit2Nonce,
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
    state: {
      type: "approval",
      allowance,
      approvalAmount,
    },
  });
};
