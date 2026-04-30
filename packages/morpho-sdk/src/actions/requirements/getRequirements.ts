import { type Address, getChainAddresses } from "@morpho-org/blue-sdk";
import { fetchHolding } from "@morpho-org/blue-sdk-viem";
import { isDefined } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import {
  ChainIdMismatchError,
  type ERC20ApprovalAction,
  type Requirement,
  type Transaction,
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
 * Get token "requirement" for approval/permit before interacting with protocol.
 *
 * Three flows:
 * 1. If signature not supported, use classic approval (transaction).
 * 2. If signature supported, try simple permit (EIP-2612), else fallback to permit2.
 *
 * @param viemClient - The connected viem Client instance, with the correct chain and account.
 * @param params - Destructured object with:
 * @param params.address - ERC20 token address.
 * @param params.chainId - Chain/network id.
 * @param params.args - Object with:
 * @param params.args.amount - Required token amount.
 * @param params.args.from - The account that will grant approval.
 * @param params.supportSignature - Whether signature-based approvals are supported. If true, will try to use permit or permit2.
 * @param params.supportDeployless - Whether to use deployless mode.
 * @param params.useSimplePermit - use simple permit if EIP-2612 is supported. Only available when `supportSignature` is `true`.
 * @returns Promise of array of approval transaction or requirement objects.
 */
export const getRequirements = async (
  viemClient: Client,
  params: GetRequirementsParams,
): Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]> => {
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
