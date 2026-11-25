import type { TransactionAction } from "@morpho-org/morpho-sdk";
import type { Address } from "viem";
import { SimulationValidationError } from "../errors.js";
import type { SimulationEffect } from "../limits.js";

/** Derive exact control-call effects without reading calldata or chain state. @internal */
export function deriveControlEffect(
  action: TransactionAction,
  options: {
    readonly owner: Address;
    readonly token?: Address;
    readonly txIdx?: number;
  },
): SimulationEffect | undefined {
  const binding = options.txIdx === undefined ? {} : { txIdx: options.txIdx };
  switch (action.type) {
    case "erc20Approval":
      if (options.token === undefined) {
        throw new SimulationValidationError(
          "erc20Approval limits require options.token. Pass the approval transaction's to address as token.",
        );
      }
      return {
        ...binding,
        type: action.type,
        token: options.token,
        owner: options.owner,
        spender: action.args.spender,
        amount: action.args.amount,
      };
    case "blueAuthorization":
      return {
        ...binding,
        type: action.type,
        authorizer: options.owner,
        authorized: action.args.authorized,
        isAuthorized: action.args.isAuthorized,
      };
    case "midnightAuthorization":
      return {
        ...binding,
        type: action.type,
        onBehalf: action.args.onBehalf,
        authorized: action.args.authorized,
        isAuthorized: action.args.isAuthorized,
      };
    case "midnightCancelOffers":
      return {
        ...binding,
        type: action.type,
        onBehalf: action.args.onBehalf,
        groups: [...action.args.groups],
      };
    default:
      return undefined;
  }
}
