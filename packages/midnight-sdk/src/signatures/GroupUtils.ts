import { OfferUtils } from "../offers/index.js";

/**
 * Object-compatible helpers for validating Midnight offer groups.
 *
 * @example
 * ```ts
 * import { GroupUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof GroupUtils.validateOfferGroup);
 * ```
 */
export const GroupUtils = {
  validateOfferGroup: OfferUtils.validateOfferGroup,
  validateOfferGroupForApiPublication:
    OfferUtils.validateOfferGroupForApiPublication,
} as const;
