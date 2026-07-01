import { type Address, getChainAddresses } from "@morpho-org/blue-sdk";
import { fetchHolding } from "@morpho-org/blue-sdk-viem";
import { isDefined } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import {
  type Bundler3TokenSignatureRequirement,
  ChainIdMismatchError,
  type ERC20ApprovalAction,
  type Transaction,
} from "../../../types/index.js";
import { getBundler3RequirementsPermit } from "../bundler3/getBundler3RequirementsPermit.js";
import { getBundler3RequirementsPermit2 } from "../bundler3/getBundler3RequirementsPermit2.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";

type GetBlueRequirementsBaseParams = {
  address: Address;
  chainId: number;
  supportDeployless?: boolean;
  args: { amount: bigint; from: Address };
};

type GetBlueRequirementsParams =
  | (GetBlueRequirementsBaseParams & {
      /** Signature-based approvals are not supported. Classic approval (transaction) will be used. */
      supportSignature: false;
    })
  | (GetBlueRequirementsBaseParams & {
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
 * Resolves the approval requirements an integrator must satisfy before a Blue bundle pulls
 * tokens through `GeneralAdapter1`.
 *
 * Reads the user's current `holding` (allowances + nonces) from the chain, then picks one of
 * three flows:
 *
 * 1. **`supportSignature: false`** — classic ERC-20 `approve` transaction (or no-op when the
 *    allowance is already large enough).
 * 2. **`supportSignature: true` + EIP-2612 nonce detected + `useSimplePermit`** — single permit
 *    signature against the token itself. DAI is excluded from this branch (its non-standard
 *    permit signature is incompatible) and falls through to Permit2 even with
 *    `useSimplePermit: true`.
 * 3. **`supportSignature: true`, default** — Permit2 flow: classic approval to the Permit2
 *    contract (if needed), followed by a Permit2 signature against `GeneralAdapter1`.
 *
 * The simple-permit compatibility check is intentionally shallow: it reuses the fetched
 * ERC-2612 nonce, which is based on whether the token exposes a readable `nonces(owner)`.
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
 * @param params.supportDeployless - Whether to fetch holdings via deployless multicall.
 * @param params.useSimplePermit - When `supportSignature` is `true`, prefer EIP-2612 permit if
 *   the nonce probe detects support. Leave unset or pass `false` to force the Permit2 fallback
 *   for tokens known to be incompatible despite passing that probe.
 * @returns Promise resolving to an array of either deep-frozen approval transactions or
 *   `Requirement` objects (signature requirements with a `sign()` method). Empty when the
 *   existing allowance already covers `amount`.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`. No other typed
 *   error is reachable through this entry point: the values passed into
 *   `getRequirementsApproval` always satisfy `approvalAmount >= spendAmount` (direct path uses
 *   `approvalAmount === spendAmount === amount`; Permit2 path uses `MAX_UINT_160`), so
 *   `ApprovalAmountLessThanSpendAmountError` cannot fire from here.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getBlueRequirements } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirements = await getBlueRequirements(client, {
 *   address: USDC,
 *   chainId: 1,
 *   supportSignature: true,
 *   args: { amount: 1_000_000n, from: user },
 * });
 * // requirements satisfies (Readonly<Transaction<ERC20ApprovalAction>> | Bundler3TokenSignatureRequirement)[]
 * ```
 */
export const getBlueRequirements = async (
  viemClient: Client,
  params: GetBlueRequirementsParams,
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
  const { erc20Allowances, erc2612Nonce, permit2BundlerAllowance } =
    await fetchHolding(from, address, viemClient, {
      deployless: params.supportDeployless,
    });

  if (supportSignature) {
    const { useSimplePermit } = params;
    const supportSimplePermit = isDefined(erc2612Nonce) && address !== dai;

    if (supportSimplePermit && useSimplePermit) {
      return await getBundler3RequirementsPermit(viemClient, {
        token: address,
        chainId,
        args: { amount },
        allowancesGeneralAdapter: erc20Allowances["bundler3.generalAdapter1"],
        nonce: erc2612Nonce,
        supportDeployless: params.supportDeployless,
      });
    }

    if (permit2) {
      return getBundler3RequirementsPermit2({
        address,
        chainId,
        permit2,
        args: { amount },
        allowancesGeneralAdapter: erc20Allowances["bundler3.generalAdapter1"],
        allowancesPermit2: erc20Allowances.permit2,
        allowanceGeneralAdapterPermit2: permit2BundlerAllowance.amount,
        allowanceGeneralAdapterExpiration: permit2BundlerAllowance.expiration,
        nonce: permit2BundlerAllowance.nonce,
      });
    }
  }

  return getRequirementsApproval({
    address,
    chainId,
    args: {
      spendAmount: amount,
      approvalAmount: amount,
      spender: generalAdapter1,
    },
    allowances: erc20Allowances["bundler3.generalAdapter1"],
  });
};
