import { getPlanObject, validatePlanFields } from "./validation.js";

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
      amount: "uint256 bigint",
    },
  });
}
