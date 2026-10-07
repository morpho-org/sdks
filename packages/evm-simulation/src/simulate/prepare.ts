import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, erc20Abi, getAddress } from "viem";
import type { SimulationAuthorization } from "../authorizations.js";
import type { SimulationTransaction } from "../types.js";

const approvalTx = (params: {
  readonly chainId: number;
  readonly owner: Address;
  readonly token: Address;
  readonly spender: Address;
  readonly amount: bigint;
}): Required<Readonly<SimulationTransaction>> => ({
  chainId: params.chainId,
  from: getAddress(params.owner),
  to: getAddress(params.token),
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [params.spender, params.amount],
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
 *   `setAuthorization(authorized, isAuthorized)`.
 *
 * Final mode produces no preparations. Successful execution proves only the
 * simulated permissions, not the validity of a future signature.
 *
 * @param params - Authorizations, target chain, owner and Morpho contract.
 * @returns Deep-frozen preparation calls carrying the target chain ID.
 * @internal
 */
export function prepareAuthorizations(params: {
  readonly chainId: number;
  readonly authorizations: readonly SimulationAuthorization[];
  readonly owner: Address;
  readonly morpho: Address;
}): readonly PlannedPreparation[] {
  const { chainId, authorizations, owner, morpho } = params;

  const preparations: PlannedPreparation[] = [];

  authorizations.forEach((auth, authorizationIndex) => {
    const calls: Required<Readonly<SimulationTransaction>>[] = [];

    switch (auth.type) {
      case "erc20Approval":
        calls.push(
          approvalTx({
            chainId,
            owner,
            token: auth.token,
            spender: auth.spender,
            amount: auth.amount,
          }),
        );
        break;
      case "erc2612Permit": {
        const { message, domain } = auth.typedData;
        calls.push(
          approvalTx({
            chainId,
            owner,
            token: domain.verifyingContract,
            spender: message.spender,
            amount: message.value,
          }),
        );
        break;
      }
      case "permit2SignatureTransfer": {
        const { message } = auth.typedData;
        calls.push(
          approvalTx({
            chainId,
            owner,
            token: message.permitted.token,
            spender: message.spender,
            amount: message.permitted.amount,
          }),
        );
        break;
      }
      case "blueAuthorization":
      case "blueAuthorizationSignature": {
        const { authorized, isAuthorized } =
          auth.type === "blueAuthorization" ? auth : auth.typedData.message;
        calls.push({
          chainId,
          from: getAddress(owner),
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
