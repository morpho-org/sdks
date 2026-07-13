import { type Address, getChainAddresses } from "@morpho-org/blue-sdk";
import { erc2612Abi, permit2Abi } from "@morpho-org/blue-sdk-viem";
import { isDefined } from "@morpho-org/morpho-ts";
import { type Client, erc20Abi, isAddressEqual } from "viem";
import { readContract } from "viem/actions";
import type {
  Bundler3TokenSignatureRequirement,
  ERC20ApprovalAction,
  Transaction,
} from "../../../types/index.js";
import { ChainIdMismatchError } from "../../../types/index.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";
import { getGeneralAdapterRequirementsPermit } from "./getGeneralAdapterRequirementsPermit.js";
import { getGeneralAdapterRequirementsPermit2 } from "./getGeneralAdapterRequirementsPermit2.js";

/** Shared parameters for GeneralAdapter1 token requirement resolution. */
export type GetGeneralAdapterRequirementsBaseParams = {
  address: Address;
  chainId: number;
  supportDeployless?: boolean;
  args: { amount: bigint; from: Address };
};

/** Parameters for {@link getGeneralAdapterRequirements}. */
export type GetGeneralAdapterRequirementsParams =
  | (GetGeneralAdapterRequirementsBaseParams & {
      /** Signature-based approvals are not supported. Classic approval (transaction) will be used. */
      supportSignature: false;
    })
  | (GetGeneralAdapterRequirementsBaseParams & {
      /** Signature-based approvals are supported. Will try permit (EIP-2612), else fallback to permit2. */
      supportSignature: true;
      /**
       * Prefer the ERC-2612 simple-permit path when the SDK detects support.
       * Leave unset or set to `false` to force the Permit2 fallback when a token is known to be
       * incompatible despite passing the SDK's shallow nonce probe.
       */
      useSimplePermit?: boolean;
    });

/**
 * Resolves the approval requirements an integrator must satisfy before a bundled action pulls
 * tokens through `GeneralAdapter1`.
 *
 * Reads the minimum token allowance / nonce state needed from the chain, then picks one of three
 * flows:
 *
 * 1. **`supportSignature: false`** — classic ERC-20 `approve` transaction (or no-op when the
 *    direct allowance is already large enough).
 * 2. **`supportSignature: true` + EIP-2612 nonce detected + `useSimplePermit`** — single permit
 *    signature against the token itself. DAI is excluded from this branch (its non-standard
 *    permit signature is incompatible) and falls through to Permit2 even with
 *    `useSimplePermit: true`.
 * 3. **`supportSignature: true`, default** — Permit2 flow: classic approval to the Permit2
 *    contract (if needed), followed by a Permit2 signature against `GeneralAdapter1`.
 *
 * The simple-permit compatibility check is intentionally shallow: when requested, it probes
 * whether the token exposes a readable ERC-2612 `nonces(owner)` value.
 * Leaving `useSimplePermit` unset, or passing `false`, is the caller escape hatch for tokens
 * that expose `nonces` but are still incompatible with the SDK's ERC-2612 encoder. This opt-out
 * has proven useful in the past, but the SDK does not encode a token-specific example here.
 * DAI is handled as a built-in version of that incompatibility: it exposes `nonces(owner)` but is
 * always routed to Permit2/classic approval instead of DAI-specific permit signing.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params - Requirement resolution parameters.
 * @param params.address - ERC-20 token address.
 * @param params.chainId - Chain id; must match `viemClient.chain.id`.
 * @param params.args.amount - Required token amount. Returns `[]` when zero.
 * @param params.args.from - Account that will grant the approval.
 * @param params.supportSignature - Whether the integrator can collect a signature; controls
 *   permit / permit2 vs. classic approval.
 * @param params.supportDeployless - Whether ERC-2612 permit metadata reads may use deployless multicall.
 * @param params.useSimplePermit - When `supportSignature` is `true`, prefer EIP-2612 permit if
 *   the nonce probe detects support. Leave unset or pass `false` to force the Permit2 fallback
 *   for tokens known to be incompatible despite passing that probe.
 * @returns Promise resolving to an array of either deep-frozen approval transactions or
 *   `Requirement` objects (signature requirements with a `sign()` method). Empty when `amount`
 *   is zero or when the classic-approval path can reuse sufficient direct allowance.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`. No other typed
 *   error is reachable through this entry point: the values passed into
 *   `getRequirementsApproval` always satisfy `approvalAmount >= spendAmount` (direct path uses
 *   `approvalAmount === spendAmount === amount`; Permit2 path uses `MAX_UINT_160`), so
 *   `ApprovalAmountLessThanSpendAmountError` cannot fire from here.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getGeneralAdapterRequirements } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirements = await getGeneralAdapterRequirements(client, {
 *   address: USDC,
 *   chainId: 1,
 *   supportSignature: true,
 *   args: { amount: 1_000_000n, from: user },
 * });
 * // requirements satisfies (Readonly<Transaction<ERC20ApprovalAction>> | Bundler3TokenSignatureRequirement)[]
 * ```
 */
export const getGeneralAdapterRequirements = async (
  viemClient: Client,
  params: GetGeneralAdapterRequirementsParams,
): Promise<
  (
    | Readonly<Transaction<ERC20ApprovalAction>>
    | Bundler3TokenSignatureRequirement
  )[]
> => {
  const {
    address,
    chainId,
    supportSignature,
    args: { amount, from },
  } = params;
  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  if (amount === 0n) {
    return [];
  }

  const {
    permit2,
    dai,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);
  if (supportSignature) {
    const { useSimplePermit } = params;
    const isDai = isDefined(dai) && isAddressEqual(address, dai);

    if (useSimplePermit && !isDai) {
      const erc2612Nonce = await readContract(viemClient, {
        abi: erc2612Abi,
        address,
        functionName: "nonces",
        args: [from],
      }).catch(() => undefined);

      if (isDefined(erc2612Nonce)) {
        // Do not skip this exact permit because a previous ERC-20 allowance is already enough.
        // ERC-2612 overwrites the allowance, and the bundle spends exactly `amount`, so signing
        // the pulled amount leaves no residual direct allowance after inclusion.
        return getGeneralAdapterRequirementsPermit(viemClient, {
          token: address,
          chainId,
          args: { amount },
          nonce: erc2612Nonce,
          supportDeployless: params.supportDeployless,
        });
      }
    }

    if (permit2) {
      // Do not check the existing Permit2-managed amount/expiration. Permit2 allowance signatures
      // overwrite the tuple, and the bundle spends exactly `amount`, so a fresh exact signature
      // leaves no residual Permit2 allowance. The tuple is still read because Permit2 requires
      // its nonce in the signed allowance payload.
      const [permit2Erc20Allowance, [, , permit2Nonce]] = await Promise.all([
        readContract(viemClient, {
          abi: erc20Abi,
          address,
          functionName: "allowance",
          args: [from, permit2],
        }),
        readContract(viemClient, {
          abi: permit2Abi,
          address: permit2,
          functionName: "allowance",
          args: [from, address, generalAdapter1],
        }),
      ]);

      return getGeneralAdapterRequirementsPermit2({
        address,
        chainId,
        permit2,
        args: { amount },
        erc20Allowances: { permit2: permit2Erc20Allowance },
        permit2Nonce: BigInt(permit2Nonce),
      });
    }
  }

  const generalAdapterAllowance = await readContract(viemClient, {
    abi: erc20Abi,
    address,
    functionName: "allowance",
    args: [from, generalAdapter1],
  });

  return getRequirementsApproval({
    address,
    chainId,
    args: {
      spendAmount: amount,
      approvalAmount: amount,
      spender: generalAdapter1,
    },
    allowances: generalAdapterAllowance,
  });
};
