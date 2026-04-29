import { zeroAddress } from "viem";

import type { SimulationAuthorization } from "../../types.js";

/**
 * Validate all signature authorizations have non-zero token and spender.
 * Returns an array of error strings (empty if valid).
 */
export function validateAuthorizations(
  authorizations: SimulationAuthorization[],
): string[] {
  const errors: string[] = [];

  for (let i = 0; i < authorizations.length; i++) {
    const auth = authorizations[i]!;
    if (auth.type === "signature") {
      if (!auth.token || auth.token === zeroAddress) {
        errors.push(
          `authorizations[${i}]: signature authorization has zero-address token`,
        );
      }
      if (!auth.spender || auth.spender === zeroAddress) {
        errors.push(
          `authorizations[${i}]: signature authorization has zero-address spender`,
        );
      }
    }
  }

  return errors;
}
