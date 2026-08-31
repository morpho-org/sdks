import { getChainAddresses } from "@morpho-org/blue-sdk";
import { erc2612Abi, permit2Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, isDefined } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Client,
  erc20Abi,
  isAddressEqual,
  maxUint256,
} from "viem";
import { readContract } from "viem/actions";
import { validateChainId } from "../../../helpers/index.js";
import {
  ApprovalAmountLessThanSpendAmountError,
  type BlueBundlesV1TokenSignatureRequirement,
  type ERC20ApprovalAction,
  InputExceedsMaxError,
  MissingPermit2TransferFromNonceError,
  NegativeInputError,
  NonPositiveInputError,
  Permit2TransferFromNonceAlreadyUsedError,
  type Transaction,
} from "../../../types/index.js";
import { encodeErc20Permit } from "../encode/encodeErc20Permit.js";
import { encodeErc20Permit2TransferFrom } from "../encode/encodeErc20Permit2TransferFrom.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";

/** Parameters for {@link getBlueBundlesV1TokenRequirements}. */
export interface GetBlueBundlesV1TokenRequirementsParams {
  /** ERC-20 token funded by the operation. */
  token: Address;
  /** Exact amount BlueBundlesV1 will pull. */
  amount: bigint;
  /** Classic approval amount; defaults to the exact pull amount. */
  approvalAmount?: bigint;
  /** Account funding the operation. */
  owner: Address;
  /** Target chain id. */
  chainId: number;
  /** Final-call and signature deadline. */
  deadline: bigint;
  /** Whether the caller can collect offchain token signatures. */
  supportSignature: boolean;
  /** Whether token metadata reads may use deployless aggregation. */
  supportDeployless?: boolean;
  /** Prefer ERC-2612 when the token exposes a compatible nonce. */
  useSimplePermit?: boolean;
  /** Explicit unused Permit2 SignatureTransfer unordered nonce. */
  permit2Nonce?: bigint;
}

/**
 * Resolves direct approval, ERC-2612, or Permit2 SignatureTransfer prerequisites for
 * BlueBundlesV1.
 *
 * Reads only the allowance and nonce state required by the selected path. Permit2 keeps the
 * ERC-20 allowance on canonical Permit2 while the one-time signed transfer names BlueBundlesV1
 * as spender. Permit2 SignatureTransfer requires an explicit unused unordered nonce so concurrent
 * requirements never silently sign the same owner-global nonce.
 *
 * @param viemClient - Connected viem client used for allowance and nonce reads.
 * @param params - Token requirement parameters.
 * @param params.token - ERC-20 token funded by the operation.
 * @param params.amount - Exact amount BlueBundlesV1 will pull; zero returns no requirements.
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
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered for the chain.
 * @throws {MissingPermit2TransferFromNonceError} when Permit2 is selected without a nonce.
 * @throws {Permit2TransferFromNonceAlreadyUsedError} when `permit2Nonce` is already consumed.
 * @throws {InputExceedsMaxError} when `permit2Nonce` exceeds uint256.
 * @throws {ApprovalAmountLessThanSpendAmountError} when `approvalAmount` is below `amount`.
 * @throws {viem.BaseError} when a required allowance, Permit2 nonce-bitmap, or ERC-2612 metadata
 *   read fails. A failed ERC-2612 nonce probe alone falls back to Permit2 or classic approval.
 * @example
 * ```ts
 * import { addressesRegistry } from "@morpho-org/blue-sdk";
 * import { createPublicClient, http, zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getBlueBundlesV1TokenRequirements } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirements = await getBlueBundlesV1TokenRequirements(client, {
 *   token: addressesRegistry[mainnet.id].usdc,
 *   amount: 1_000_000n,
 *   owner: zeroAddress,
 *   chainId: mainnet.id,
 *   deadline: 1_900_000_000n,
 *   supportSignature: true,
 *   permit2Nonce: 42n,
 * });
 * // requirements contains approvals and/or signable BlueBundlesV1 token requirements.
 * ```
 */
export const getBlueBundlesV1TokenRequirements = async (
  viemClient: Client,
  params: GetBlueBundlesV1TokenRequirementsParams,
): Promise<
  readonly (
    | Readonly<Transaction<ERC20ApprovalAction>>
    | BlueBundlesV1TokenSignatureRequirement
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

  const blueBundlesV1 = getChainAddress(
    params.chainId,
    "bundles.blueBundlesV1",
  );
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
            spender: blueBundlesV1,
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
        throw new MissingPermit2TransferFromNonceError();
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
      const bitPosition = params.permit2Nonce & 255n;
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

      if ((nonceBitmap & (1n << bitPosition)) !== 0n) {
        throw new Permit2TransferFromNonceAlreadyUsedError(
          params.owner,
          params.permit2Nonce,
        );
      }

      return [
        ...getRequirementsApproval({
          address: params.token,
          chainId: params.chainId,
          args: {
            spender: permit2,
            spendAmount: params.amount,
            approvalAmount: maxUint256,
          },
          allowances: allowance,
        }),
        encodeErc20Permit2TransferFrom({
          token: params.token,
          spender: blueBundlesV1,
          amount: params.amount,
          chainId: params.chainId,
          nonce: params.permit2Nonce,
          deadline: params.deadline,
        }),
      ];
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
    args: [params.owner, blueBundlesV1],
  });
  return getRequirementsApproval({
    address: params.token,
    chainId: params.chainId,
    args: {
      spender: blueBundlesV1,
      // The pull the operation actually performs is `amount`; `approvalAmount`
      // is only the allowance to set when one is needed. Comparing the existing
      // allowance against `amount` (not `approvalAmount`) avoids emitting a
      // redundant approval — and a zero-reset on approve-only-once tokens like
      // USDT — when the current allowance already covers the pull.
      spendAmount: params.amount,
      approvalAmount,
    },
    allowances: allowance,
  });
};
