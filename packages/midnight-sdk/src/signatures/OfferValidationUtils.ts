import type { Hex } from "viem";

import { PayloadValidationFailedError } from "../errors.js";
import { normalizeHex } from "../internal.js";

/**
 * Parameters for {@link OfferValidationUtils.validateOfferPayload}.
 *
 * @example
 * ```ts
 * import type { ValidateOfferPayloadParams } from "@morpho-org/midnight-sdk";
 *
 * const params: ValidateOfferPayloadParams = {
 *   payload: "0x",
 *   validate: () => true,
 * };
 * console.log(params.payload);
 * ```
 */
export interface ValidateOfferPayloadParams {
  /** Router or app payload to validate. */
  readonly payload: Hex;
  /** Injected validator, usually backed by a router API/client. */
  readonly validate: (payload: Hex) => boolean | Promise<boolean>;
}

/**
 * Helpers for injected Midnight offer-payload validation.
 *
 * @example
 * ```ts
 * import { OfferValidationUtils } from "@morpho-org/midnight-sdk";
 *
 * await OfferValidationUtils.validateOfferPayload({
 *   payload: "0x",
 *   validate: () => true,
 * });
 * ```
 */
export namespace OfferValidationUtils {
  /**
   * Validates an offer payload through an injected validator.
   *
   * @param params - Validation parameters.
   * @returns `true` when the payload is valid.
   * @throws PayloadValidationFailedError when validation rejects the payload or throws.
   * @example
   * ```ts
   * import { OfferValidationUtils } from "@morpho-org/midnight-sdk";
   *
   * const valid = await OfferValidationUtils.validateOfferPayload({
   *   payload: "0x",
   *   validate: () => true,
   * });
   * console.log(valid);
   * ```
   */
  export async function validateOfferPayload(
    params: ValidateOfferPayloadParams,
  ) {
    const payload = normalizeHex(params.payload, "payload");
    try {
      const valid = await params.validate(payload);
      if (!valid) {
        throw new PayloadValidationFailedError(
          "Offer payload validation failed.",
        );
      }

      return true;
    } catch (error) {
      if (error instanceof PayloadValidationFailedError) throw error;
      throw new PayloadValidationFailedError(
        "Offer payload validation failed.",
        {
          cause: error,
        },
      );
    }
  }
}
