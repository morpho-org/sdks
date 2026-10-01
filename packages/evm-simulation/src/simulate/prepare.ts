import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, erc20Abi, getAddress } from "viem";
import type { SimulationAuthorization } from "../authorizations.js";
import type { SimulationTransaction } from "../types.js";

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

/** One authorization's preparation calls, in execution order. @internal */
export interface PlannedPreparation {
  readonly authorizationIndex: number;
  readonly calls: readonly Required<Readonly<SimulationTransaction>>[];
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
 *   `setAuthorization(authorized, true)`.
 *
 * Authorizations carrying a `stateOverride` produce no calls — the override
 * is injected at the `eth_simulateV1` boundary instead. Final mode produces
 * no preparations.
 *
 * @internal
 */
export function prepareAuthorizations(params: {
  readonly authorizations: readonly SimulationAuthorization[];
  readonly owner: Address;
  readonly morpho: Address;
}): readonly PlannedPreparation[] {
  const { authorizations, owner, morpho } = params;

  const preparations: PlannedPreparation[] = [];

  authorizations.forEach((auth, authorizationIndex) => {
    const calls: Required<Readonly<SimulationTransaction>>[] = [];

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
        calls.push(blueAuthorizationTx(owner, morpho, auth.authorized));
        break;
      case "blueAuthorizationSignature":
        calls.push(
          blueAuthorizationTx(owner, morpho, auth.typedData.message.authorized),
        );
        break;
    }

    if (calls.length > 0) {
      preparations.push({
        authorizationIndex,
        calls: deepFreeze(calls),
      });
    }
  });

  return deepFreeze(preparations);
}
