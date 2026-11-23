import { InvalidTransactionPlanError } from "./error.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "./validation.js";

/** @internal Validates the stored ERC-20 approval action's input shape. */
export function validateApprovalPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      token: "address",
      spender: "address",
    },
  });
  if ((inputs.assets === undefined) === (inputs.shares === undefined)) {
    throw new InvalidTransactionPlanError({
      path: `${path}.inputs`,
      reason: "expected exactly one of assets or shares",
    });
  }
  const field = inputs.assets === undefined ? "shares" : "assets";
  validatePlanField(inputs[field], {
    path: `${path}.inputs.${field}`,
    type: "uint256 bigint",
  });
}
