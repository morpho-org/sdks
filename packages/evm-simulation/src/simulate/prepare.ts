import { blueAbi, midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, erc20Abi, getAddress } from "viem";
import { SimulationValidationError } from "../errors.js";
import type { SimulationTransaction } from "../types.js";
import type { SimulationExecution } from "./backends/parse-response.js";
import {
  DEPOSIT_TOPIC,
  TRANSFER_TOPIC,
  WITHDRAWAL_TOPIC,
} from "./parsing/transfers.js";
import type { ParsedRequest } from "./request/parse-request.js";

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const approvalTx = (
  owner: Address,
  token: Address,
  spender: Address,
  amount: bigint,
): Readonly<SimulationTransaction & { readonly value: bigint }> => ({
  from: owner,
  to: token,
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  }),
  value: 0n,
});

/** One authorization's preparation calls, in execution order. @internal */
export interface PlannedPreparation {
  readonly authorizationIndex: number;
  readonly calls: readonly (SimulationTransaction & {
    readonly value: bigint;
  })[];
}

/**
 * Build the ordered preparation calls a preview execution runs before the
 * user transactions, so each pending wallet request is satisfied onchain.
 *
 * - `erc20Approval` → `approve(spender, amount)`; zero-reset entries produce
 *   their own `approve(0)` call in list order.
 * - Signature variants (`erc2612Permit`, `permit2SignatureTransfer`) grant
 *   owner→bundle allowance for the previewed pull — a permit2 transfer makes
 *   no change to the nonce bitmap.
 * - `blueAuthorization` / `blueAuthorizationSignature` →
 *   `setAuthorization(authorized, isAuthorized)`.
 * - `midnightAuthorizationSignature` → Midnight
 *   `setIsAuthorized(authorized, isAuthorized, sender)`.
 *
 * Final mode produces no preparations. Successful execution proves only the
 * simulated permissions, not the validity of a future signature.
 *
 * @internal
 */
export function prepareAuthorizations(params: {
  readonly authorizations: ParsedRequest["authorizations"];
  readonly owner: ParsedRequest["owner"];
  readonly morpho: Address;
  readonly midnight: Address;
}): readonly PlannedPreparation[] {
  const { authorizations, owner, morpho, midnight } = params;

  const preparations: PlannedPreparation[] = [];

  authorizations.forEach((auth, authorizationIndex) => {
    const calls: (SimulationTransaction & { readonly value: bigint })[] = [];

    switch (auth.type) {
      case "erc20Approval":
        calls.push(approvalTx(owner, auth.token, auth.spender, auth.amount));
        break;
      case "erc2612Permit": {
        const { message, domain } = auth.typedData;
        calls.push(
          approvalTx(
            owner,
            domain.verifyingContract,
            message.spender,
            message.value,
          ),
        );
        break;
      }
      case "permit2SignatureTransfer": {
        const { message } = auth.typedData;
        calls.push(
          approvalTx(
            owner,
            message.permitted.token,
            message.spender,
            message.permitted.amount,
          ),
        );
        break;
      }
      case "blueAuthorization":
      case "blueAuthorizationSignature": {
        const { authorized, isAuthorized } =
          auth.type === "blueAuthorization" ? auth : auth.typedData.message;
        calls.push({
          from: owner,
          to: getAddress(morpho),
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [authorized, isAuthorized],
          }),
          value: 0n,
        });
        break;
      }
      case "midnightAuthorizationSignature": {
        const { authorized, isAuthorized } = auth.typedData.message;
        calls.push({
          from: owner,
          to: getAddress(midnight),
          data: encodeFunctionData({
            abi: midnightAbi,
            functionName: "setIsAuthorized",
            args: [authorized, isAuthorized, owner],
          }),
          value: 0n,
        });
        break;
      }
      default: {
        const exhaustive: never = auth;
        void exhaustive;
      }
    }

    preparations.push({
      authorizationIndex,
      calls: deepFreeze(calls),
    });
  });

  return deepFreeze(preparations);
}

/**
 * Find preparation calls that emit asset-transfer events, in execution order.
 * @param calls - Normalized calls from the simulation execution.
 * @returns One failure per offending preparation call.
 * @internal
 */
export function findPreparationTransferFailures(
  calls: SimulationExecution["calls"],
): readonly SimulationValidationError[] {
  const failures: SimulationValidationError[] = [];
  for (const { planned, result } of calls) {
    if (planned.type !== "preparation") {
      continue;
    }
    if (
      result.logs.some((log) =>
        [TRANSFER_TOPIC, DEPOSIT_TOPIC, WITHDRAWAL_TOPIC].some(
          (topic) => topic === log.topics[0]?.toLowerCase(),
        ),
      )
    ) {
      failures.push(
        new SimulationValidationError(
          `Preview authorization "${planned.authorizationIndex}" preparation call "${planned.callIndex}" emitted asset transfers. Simulate the authorization as a transaction in final mode to check its asset flows.`,
        ),
      );
    }
  }

  return failures;
}
