import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import type { Action } from "../../bundler/index.js";
import { validateNativeAsset } from "../../helpers/index.js";
import type { PermitRequirementSignature } from "../../types/index.js";
import { getTokenRequirementActions } from "../signatures/getTokenRequirementActions.js";

/** Parameters for {@link buildRepayFundingActions}. */
export interface BuildRepayFundingActionsParams {
  /** Chain the market lives on — resolves adapter addresses and validates wNative. */
  readonly chainId: number;
  /** Market params — the `loanToken` is wrapped and/or pulled into `GeneralAdapter1`. */
  readonly marketParams: MarketParams;
  /** ERC-20 loan tokens to pull from the payer (`0n` on a fully-native repay). */
  readonly erc20Amount: bigint;
  /** Native ETH to wrap into wNative before the pull (`0n` when not wrapping). */
  readonly nativeAmount: bigint;
  /** Optional pre-signed permit/permit2 approval for the ERC-20 pull. */
  readonly requirementSignature?: PermitRequirementSignature;
}

/**
 * Builds the shared repay funding actions — native wrapping followed by the ERC-20 pull — in the
 * order both repay builders (`blueRepay`, `blueRepayWithdrawCollateral`) require before
 * `morphoRepay`.
 *
 * Encode-only and synchronous: returns a fresh `Action[]` (never mutates its inputs, mirroring
 * `buildReallocationActions`) and reads no on-chain state. When `nativeAmount > 0n`, validates the
 * loan token is the chain's wNative and emits `nativeTransfer → wrapNative`. When `erc20Amount > 0n`,
 * pulls the ERC-20 via a signed permit/permit2 (`requirementSignature`) or a plain
 * `erc20TransferFrom`. A fully-native repay emits no ERC-20 action.
 *
 * Single source of truth for the native-wrap + ERC-20-pull composition both repay builders depend
 * on — a fix here applies to both paths instead of risking a silent divergence between two copies.
 *
 * @param params - See {@link BuildRepayFundingActionsParams}.
 * @returns The `nativeTransfer`/`wrapNative`/pull actions, in bundle order (empty when nothing is
 *   funded).
 * @throws {ChainWNativeMissingError} when `nativeAmount > 0n` but the chain has no configured wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the loan token is not the
 *   chain's wNative.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature` is
 *   provided and the signed asset differs from `marketParams.loanToken`.
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature` is
 *   provided and the signed amount differs from `erc20Amount`.
 * @throws {Permit2ExpirationMissingError} from `getTokenRequirementActions` when a Permit2 requirement
 *   signature is missing its expiration.
 * @internal
 */
export const buildRepayFundingActions = ({
  chainId,
  marketParams,
  erc20Amount,
  nativeAmount,
  requirementSignature,
}: BuildRepayFundingActionsParams): Action[] => {
  const {
    bundler3: { generalAdapter1, bundler3 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  // Wrap native into wNative before pulling the ERC-20 remainder.
  if (nativeAmount > 0n) {
    validateNativeAsset(chainId, marketParams.loanToken);

    actions.push(
      {
        type: "nativeTransfer",
        args: [bundler3, generalAdapter1, nativeAmount, false],
      },
      {
        type: "wrapNative",
        args: [nativeAmount, generalAdapter1, false],
      },
    );
  }

  // Pull the ERC-20 portion (0 on a fully native repay).
  if (erc20Amount > 0n) {
    if (requirementSignature) {
      actions.push(
        ...getTokenRequirementActions({
          asset: marketParams.loanToken,
          amount: erc20Amount,
          recipient: generalAdapter1,
          requirementSignature,
        }),
      );
    } else {
      actions.push({
        type: "erc20TransferFrom",
        args: [marketParams.loanToken, erc20Amount, generalAdapter1, false],
      });
    }
  }

  return actions;
};
