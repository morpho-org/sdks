import {
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { _try } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, zeroAddress } from "viem";
import { ApprovalCheckUnavailableError } from "../errors.js";
import type { ApprovalLimit } from "../limits.js";
import type { ApprovalEventAddresses } from "./approvals.js";
import type { ResolvedApprovalOperation } from "./backends/resolve-assets.js";

/** Resolved caller approvals and registry addresses used by the log checker. @internal */
export interface ResolvedApprovalLimits {
  readonly approvals: readonly ApprovalLimit[];
  readonly eventAddresses: ApprovalEventAddresses;
}

const requiredAddress = (
  address: Address | null | undefined,
  name: string,
): Address => {
  if (address == null || isAddressEqual(address, zeroAddress))
    throw new ApprovalCheckUnavailableError(
      `The chain registry does not provide a usable "${name}" address; approval checks cannot continue.`,
    );
  return address;
};

const optionalAddress = (
  address: Address | null | undefined,
): Address | undefined =>
  address == null || isAddressEqual(address, zeroAddress) ? undefined : address;

const operationToken = (operation: ResolvedApprovalOperation): Address => {
  const token = operation.approvalToken;
  if (token === undefined)
    throw new ApprovalCheckUnavailableError(
      `Cannot resolve the token required by "${operation.limit.type}" at the pinned block.`,
    );
  return token;
};

/**
 * Build the operation-derived allowlist and union it with caller-supplied entries.
 * Collateral withdrawals allow the loan-token approval emitted by a zero repay pull to BlueBundlesV1.
 * @param params - Chain, sender, resolved operation tokens, and explicit limits.
 * @internal
 */
export function resolveApprovalLimits(params: {
  readonly chainId: number;
  readonly owner: Address;
  readonly operations: readonly ResolvedApprovalOperation[];
  readonly explicit?: readonly ApprovalLimit[];
}): ResolvedApprovalLimits {
  const { chainId, owner, operations, explicit = [] } = params;
  const registry = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (registry === undefined)
    throw new ApprovalCheckUnavailableError(
      `The chain registry has no approval-check addresses for chain "${chainId}".`,
    );

  const morpho = requiredAddress(registry.blue, "blue");
  const permit2 = optionalAddress(registry.permit2);
  const vaultBundles = optionalAddress(registry.bundles?.vaultBundlesV1);
  const vaultExitBundles = optionalAddress(
    registry.bundles?.vaultExitBundlesV1,
  );
  const blueBundles = optionalAddress(registry.bundles?.blueBundlesV1);
  const approvals: ApprovalLimit[] = [...explicit];

  for (const operation of operations) {
    const { limit } = operation;
    const addToken = (token: Address, spender: Address) => {
      approvals.push({ type: "token", token, owner, spender });
    };
    const addMidnightAuthorization = (authorized: Address) => {
      // Throws: without the Midnight emitter, its grants cannot be checked.
      requiredAddress(registry.midnight, "midnight");
      approvals.push({
        type: "midnightAuthorization",
        onBehalf: owner,
        authorized,
      });
    };

    switch (limit.type) {
      case "vaultV1Deposit":
      case "vaultV2Deposit":
        addToken(operationToken(operation), limit.vault);
        if (vaultBundles !== undefined)
          addToken(operationToken(operation), vaultBundles);
        if (permit2 !== undefined) addToken(operationToken(operation), permit2);
        break;
      case "vaultV1Withdraw":
      case "vaultV1Redeem":
      case "vaultV2Withdraw":
      case "vaultV2Redeem":
        if (vaultBundles !== undefined) addToken(limit.vault, vaultBundles);
        break;
      case "vaultV1InKindRedeem":
      case "vaultV2InKindRedeem":
      case "vaultV2ForceWithdraw":
        if (vaultExitBundles !== undefined)
          addToken(limit.vault, vaultExitBundles);
        break;
      case "vaultV2ForceRedeem":
        break;
      case "vaultV1MigrateToV2":
        if (vaultBundles !== undefined)
          addToken(limit.sourceVault, vaultBundles);
        break;
      case "blueSupply":
      case "blueRepay":
      case "blueRepayWithdrawCollateral":
      case "blueSupplyCollateral":
      case "blueSupplyCollateralBorrow":
        if (blueBundles !== undefined)
          addToken(operationToken(operation), blueBundles);
        if (permit2 !== undefined) addToken(operationToken(operation), permit2);
        addToken(operationToken(operation), morpho);
        if (
          blueBundles !== undefined &&
          (limit.type === "blueRepayWithdrawCollateral" ||
            limit.type === "blueSupplyCollateralBorrow")
        )
          approvals.push({
            type: "morphoAuthorization",
            authorizer: owner,
            authorized: blueBundles,
          });
        break;
      case "blueBorrow":
      case "blueWithdraw":
      case "blueWithdrawCollateral":
      case "blueRefinance":
        if (blueBundles !== undefined) {
          if (
            limit.type === "blueBorrow" ||
            limit.type === "blueWithdrawCollateral"
          ) {
            // BlueBundlesV1's zero-amount transferFrom can re-emit Approval.
            addToken(operationToken(operation), blueBundles);
          }
          approvals.push({
            type: "morphoAuthorization",
            authorizer: owner,
            authorized: blueBundles,
          });
        }
        break;
      case "midnightSupplyCollateralBatch":
        for (const token of new Set(
          (operation.midnightApprovalTokens ?? []).map(
            (approvalToken) => approvalToken.toLowerCase() as Address,
          ),
        )) {
          addToken(token, requiredAddress(registry.midnight, "midnight"));
        }
        break;
      case "midnightWithdrawCollateralBatch":
        break;
      case "midnightRedeem":
      case "midnightTakeLend":
      case "midnightTakeBorrow":
      case "midnightTakeWithdraw":
      case "midnightRepayWithdrawCollateral":
      case "midnightTakeRepayWithdrawCollateral":
      case "midnightSupplyCollateralTakeBorrow":
      case "midnightSupplyCollateral":
      case "midnightSupplyCollateralMakeBorrow":
      case "midnightSupplyBlueMakeLend":
        addMidnightAuthorization(
          requiredAddress(registry.midnightBundlesV2, "midnightBundlesV2"),
        );
        // Maker bundles with a borrow offer or Blue lend publish through a ratifier.
        if (
          limit.type === "midnightSupplyCollateralMakeBorrow" ||
          limit.type === "midnightSupplyBlueMakeLend"
        ) {
          addMidnightAuthorization(
            requiredAddress(registry.priceRatifierV1, "priceRatifierV1"),
          );
          addMidnightAuthorization(
            requiredAddress(registry.rateRatifierV1, "rateRatifierV1"),
          );
        }
        // Midnight pay-ins approve the paid token to Midnight or MidnightBundlesV2.
        for (const token of operation.midnightApprovalTokens ?? []) {
          addToken(token, requiredAddress(registry.midnight, "midnight"));
          addToken(
            token,
            requiredAddress(registry.midnightBundlesV2, "midnightBundlesV2"),
          );
        }
        break;
      default: {
        const _exhaustive: never = limit;
        void _exhaustive;
        throw new ApprovalCheckUnavailableError(
          `Unsupported operation limit "${(limit as { type: string }).type}"; approval checks cannot run.`,
        );
      }
    }
  }

  return {
    approvals,
    eventAddresses: {
      morpho,
      ...(permit2 === undefined ? {} : { permit2 }),
      ...(registry.midnight === undefined
        ? {}
        : { midnight: registry.midnight }),
      ...(registry.ecrecoverAuthorizer === undefined
        ? {}
        : { ecrecoverAuthorizer: registry.ecrecoverAuthorizer }),
    },
  };
}
