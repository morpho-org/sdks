import { type Address, getChainAddresses } from "@morpho-org/blue-sdk";
import { fetchHolding } from "@morpho-org/blue-sdk-viem";
import { isDefined } from "@morpho-org/morpho-ts";
import { validateChainId } from "../../helpers/index.js";
import type {
  ERC20ApprovalAction,
  PublicClient,
  Requirement,
  Transaction,
} from "../../types/index.js";
import { getRequirementsApproval } from "./getRequirementsApproval.js";
import { getRequirementsPermit } from "./getRequirementsPermit.js";
import { getRequirementsPermit2 } from "./getRequirementsPermit2.js";

type GetRequirementsBaseParams = {
  address: Address;
  chainId: number;
  supportDeployless?: boolean;
  args: { amount: bigint; from: Address };
};

type GetRequirementsParams =
  | (GetRequirementsBaseParams & {
      /** Signature-based approvals are not supported. Classic approval (transaction) will be used. */
      supportSignature: false;
    })
  | (GetRequirementsBaseParams & {
      /** Signature-based approvals are supported. Will try permit (EIP-2612), else fallback to permit2. */
      supportSignature: true;
      /** Allow simple permit if EIP-2612 is supported. Only applicable when `supportSignature` is `true`. */
      useSimplePermit?: boolean;
    });

/**
 * Resolves the approval requirements an integrator must satisfy before a Morpho bundle pulls
 * tokens through `GeneralAdapter1`.
 *
 * Reads the user's current `holding` (allowances + nonces) from the chain, then picks one of
 * three flows:
 *
 * 1. **`supportSignature: false`** — classic ERC-20 `approve` transaction (or no-op when the
 *    allowance is already large enough).
 * 2. **`supportSignature: true` + EIP-2612 supported + `useSimplePermit`** — single permit
 *    signature against the token itself. DAI is excluded from this branch (its non-standard
 *    permit signature is incompatible) and falls through to Permit2 even with
 *    `useSimplePermit: true`.
 * 3. **`supportSignature: true`, default** — Permit2 flow: classic approval to the Permit2
 *    contract (if needed), followed by a Permit2 signature against `GeneralAdapter1`.
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
 *   the token supports it.
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
 * import { getRequirements } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirements = await getRequirements(client, {
 *   address: USDC,
 *   chainId: 1,
 *   supportSignature: true,
 *   args: { amount: 1_000_000n, from: user },
 * });
 * // requirements satisfies (Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]
 * ```
 */
export const getRequirements = async (
  viemClient: PublicClient,
  params: GetRequirementsParams,
): Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]> => {
  const {
    address,
    chainId,
    supportSignature,
    args: { amount, from },
  } = params;
  validateChainId(viemClient.chain.id, chainId);

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
      return await getRequirementsPermit(viemClient, {
        token: address,
        chainId,
        args: { amount },
        allowancesGeneralAdapter: erc20Allowances["bundler3.generalAdapter1"],
        nonce: erc2612Nonce,
        supportDeployless: params.supportDeployless,
      });
    }

    if (permit2) {
      return getRequirementsPermit2({
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
