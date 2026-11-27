import { grossFromNetAssets } from "../../helpers/referralFee.js";
import {
  type MidnightTakeFeasibilityParams,
  validateMidnightTakeFeasibility,
} from "../../helpers/validateMidnightTakeFeasibility.js";
import {
  MidnightTakeableOffersNotFillableError,
  MidnightTakeTargetUnreachableError,
} from "../../types/error.js";
import { MidnightTakeCreditInsufficientError } from "../error.js";

type ReduceOnlySellFeasibilityParams<
  T extends MidnightTakeFeasibilityParams["takeableOffers"][number],
> = Extract<MidnightTakeFeasibilityParams<T>, { side: "sell" }> & {
  readonly increasesDebt: false;
  readonly credit: bigint;
};

/**
 * Runs {@link validateMidnightTakeFeasibility} for a reduce-only sell, then rejects a target that
 * needs more units than the taker's `credit`: offers and the fallback withdrawal together can
 * only sell credit the taker holds.
 *
 * @param params - Feasibility inputs of a reduce-only sell with the accrued taker credit.
 * @returns `params.takeableOffers` itself, or a copy without the removed offers.
 * @throws {ExpiredDeadlineError} when `deadline` is not after `now`.
 * @throws {MidnightTakeableOffersNotFillableError} when the credit covers the target but every
 *   offer is dead and the flow has no fallback, or every offer would abort the bundle.
 * @throws {MidnightTakeCreditInsufficientError} when `credit` is below the target's units, unless
 *   no offer is supplied and the fallback alone can fill the target.
 * @throws {MidnightTakeTargetUnreachableError} with field `takeableOffers` when the credit covers
 *   the target but the live offers plus the fallback cannot hold its units.
 * @internal
 */
export const validateMidnightReduceOnlySellFeasibility = <
  T extends MidnightTakeFeasibilityParams["takeableOffers"][number],
>(
  params: ReduceOnlySellFeasibilityParams<T>,
): readonly T[] => {
  const { target, referralFeePct, credit } = params;
  const requiredUnits =
    target.type === "units"
      ? target.units
      : grossFromNetAssets({ netAssets: target.assets, referralFeePct });
  let takeableOffers: readonly T[];
  try {
    takeableOffers = validateMidnightTakeFeasibility(params);
  } catch (error) {
    const offerShortfall =
      error instanceof MidnightTakeableOffersNotFillableError ||
      (error instanceof MidnightTakeTargetUnreachableError &&
        error.field === "takeableOffers");
    if (offerShortfall && credit < requiredUnits) {
      throw new MidnightTakeCreditInsufficientError({
        credit,
        requiredUnits,
        cause: error,
      });
    }
    throw error;
  }
  if (params.takeableOffers.length > 0 && credit < requiredUnits) {
    throw new MidnightTakeCreditInsufficientError({ credit, requiredUnits });
  }
  return takeableOffers;
};
