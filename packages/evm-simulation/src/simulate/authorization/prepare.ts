import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, erc20Abi, getAddress } from "viem";
import type { SimulationAuthorization } from "../../domain/authorizations.js";
import type { PermissionState } from "../../domain/evidence.js";
import type { PlannedPreparation } from "../../domain/stages.js";
import type { SimulationTransaction } from "../../types.js";

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const approvalTx = (
  owner: Address,
  token: Address,
  spender: Address,
  amount: bigint,
): Required<Readonly<SimulationTransaction>> => ({
  from: getAddress(owner),
  to: getAddress(token),
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  }),
  value: 0n,
});

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const blueAuthorizationTx = (
  owner: Address,
  morpho: Address,
  authorized: Address,
): Required<Readonly<SimulationTransaction>> => ({
  from: getAddress(owner),
  to: getAddress(morpho),
  data: encodeFunctionData({
    abi: blueAbi,
    functionName: "setAuthorization",
    args: [authorized, true],
  }),
  value: 0n,
});

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
 *   `setAuthorization(authorized, true)`.
 *
 * Each call is paired with the {@link PermissionState} the prepared-phase
 * probes must read back. Final mode produces no preparations.
 *
 * @internal
 */
export function preparePreviewAuthorizations(params: {
  readonly authorizations: readonly SimulationAuthorization[];
  readonly owner: Address;
  readonly morpho: Address;
}): readonly PlannedPreparation[] {
  const { authorizations, owner, morpho } = params;

  const preparations: PlannedPreparation[] = [];

  authorizations.forEach((auth, authorizationIndex) => {
    const calls: Required<Readonly<SimulationTransaction>>[] = [];
    const expectedStates: PermissionState[] = [];

    // biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
    const approve = (token: Address, spender: Address, amount: bigint) => {
      calls.push(approvalTx(owner, token, spender, amount));
      expectedStates.push({
        type: "erc20Allowance",
        token,
        owner,
        spender,
        amount,
      });
    };

    switch (auth.type) {
      case "erc20Approval":
        approve(auth.token, auth.spender, auth.amount);
        break;
      case "erc2612Permit": {
        const { message, domain } = auth.typedData;
        approve(domain.verifyingContract, message.spender, message.value);
        break;
      }
      case "permit2SignatureTransfer": {
        const { message } = auth.typedData;
        approve(
          message.permitted.token,
          message.spender,
          message.permitted.amount,
        );
        break;
      }
      case "blueAuthorization":
        calls.push(blueAuthorizationTx(owner, morpho, auth.authorized));
        expectedStates.push({
          type: "blueAuthorization",
          morpho,
          authorizer: owner,
          authorized: auth.authorized,
          isAuthorized: true,
        });
        break;
      case "blueAuthorizationSignature":
        calls.push(
          blueAuthorizationTx(owner, morpho, auth.typedData.message.authorized),
        );
        expectedStates.push({
          type: "blueAuthorization",
          morpho,
          authorizer: owner,
          authorized: auth.typedData.message.authorized,
          isAuthorized: true,
        });
        break;
    }

    if (calls.length > 0) {
      preparations.push({
        authorizationIndex,
        calls: deepFreeze(calls),
        expected: deepFreeze(expectedStates),
      });
    }
  });

  return deepFreeze(preparations);
}
