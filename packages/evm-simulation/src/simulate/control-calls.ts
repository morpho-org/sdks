import { blueAbi, midnightAbi } from "@morpho-org/morpho-sdk/abis";
import {
  BaseError,
  type DecodeFunctionDataReturnType,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  isAddressEqual,
  maxUint128,
} from "viem";
import { SimulationEffectError } from "../errors.js";
import type { SimulationEffect } from "../limits.js";
import type { SimulationTransaction } from "../types.js";
import type { ApprovalEventAddresses } from "./approvals.js";

function matchesMidnightControl(
  call: DecodeFunctionDataReturnType<typeof midnightAbi>,
  effect: SimulationEffect,
): boolean {
  if (
    effect.type === "midnightAuthorization" &&
    call.functionName === "setIsAuthorized"
  ) {
    return (
      isAddressEqual(call.args[0], effect.authorized) &&
      call.args[1] === effect.isAuthorized &&
      isAddressEqual(call.args[2], effect.onBehalf)
    );
  }
  if (
    effect.type === "midnightCancelOffers" &&
    call.functionName === "setConsumed"
  ) {
    return (
      effect.groups.some(
        (group) => group.toLowerCase() === call.args[0].toLowerCase(),
      ) &&
      call.args[1] === maxUint128 &&
      isAddressEqual(call.args[2], effect.onBehalf)
    );
  }
  return false;
}

function onlyDeclaredControlCalls({
  transaction,
  effects,
  addresses,
}: {
  readonly transaction: SimulationTransaction;
  readonly effects: readonly SimulationEffect[];
  readonly addresses: ApprovalEventAddresses;
}): boolean {
  if ((transaction.value ?? 0n) !== 0n) {
    return false;
  }
  try {
    if (
      addresses.midnight !== undefined &&
      isAddressEqual(transaction.to, addresses.midnight) &&
      effects.some(
        (effect) =>
          effect.type === "midnightAuthorization" ||
          effect.type === "midnightCancelOffers",
      )
    ) {
      const decoded = decodeFunctionData({
        abi: midnightAbi,
        data: transaction.data.toLowerCase() as Hex,
      });
      const calls =
        decoded.functionName === "multicall"
          ? decoded.args[0].map((data) =>
              decodeFunctionData({
                abi: midnightAbi,
                data: data.toLowerCase() as Hex,
              }),
            )
          : [decoded];
      return (
        calls.length > 0 &&
        calls.every((call) =>
          effects.some((effect) => matchesMidnightControl(call, effect)),
        )
      );
    }
    return effects.some((effect) => {
      if (
        effect.type === "erc20Approval" &&
        isAddressEqual(transaction.to, effect.token)
      ) {
        const call = decodeFunctionData({
          abi: erc20Abi,
          data: transaction.data.toLowerCase() as Hex,
        });
        return (
          call.functionName === "approve" &&
          isAddressEqual(transaction.from, effect.owner) &&
          isAddressEqual(call.args[0], effect.spender) &&
          call.args[1] === effect.amount
        );
      }
      if (
        effect.type === "blueAuthorization" &&
        isAddressEqual(transaction.to, addresses.morpho)
      ) {
        const call = decodeFunctionData({
          abi: blueAbi,
          data: transaction.data.toLowerCase() as Hex,
        });
        if (call.functionName === "setAuthorization") {
          return (
            isAddressEqual(transaction.from, effect.authorizer) &&
            isAddressEqual(call.args[0], effect.authorized) &&
            call.args[1] === effect.isAuthorized
          );
        }
        if (call.functionName === "setAuthorizationWithSig") {
          const [authorization] = call.args;
          return (
            isAddressEqual(authorization.authorizer, effect.authorizer) &&
            isAddressEqual(authorization.authorized, effect.authorized) &&
            authorization.isAuthorized === effect.isAuthorized
          );
        }
      }
      return false;
    });
  } catch (error) {
    if (!(error instanceof BaseError)) {
      throw error;
    }
    return false;
  }
}

/** Require an effect for every caller transaction, then restrict effects-only requests to declared control calls, ignoring hex casing. Preparations are excluded; never derive permissions from calldata. @internal */
export function verifyControlCalls(params: {
  readonly effects: readonly SimulationEffect[];
  readonly transactions: readonly SimulationTransaction[];
  readonly addresses: ApprovalEventAddresses;
}): readonly SimulationEffectError[] {
  const unboundTransactions = params.transactions.flatMap((_, txIdx) =>
    params.effects.some(
      (effect) => (effect.txIdx ?? params.transactions.length - 1) === txIdx,
    )
      ? []
      : [
          new SimulationEffectError(txIdx, {
            effectType: "unboundTransaction",
            reason:
              "every caller transaction in an effects-only request requires a declared effect; add an effect with this txIdx or simulate the transaction separately",
          }),
        ],
  );
  return [
    ...unboundTransactions,
    ...params.effects.flatMap((effect) => {
      const txIdx = effect.txIdx ?? params.transactions.length - 1;
      const transaction = params.transactions[txIdx];
      const effects = params.effects.filter(
        (candidate) =>
          (candidate.txIdx ?? params.transactions.length - 1) === txIdx,
      );
      return transaction !== undefined &&
        onlyDeclaredControlCalls({
          transaction,
          effects,
          addresses: params.addresses,
        })
        ? []
        : [
            new SimulationEffectError(txIdx, {
              effectType: effect.type,
              reason:
                "effects-only transactions must target the declared control contract and contain only declared control calls",
            }),
          ];
    }),
  ];
}
