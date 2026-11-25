import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { midnightEventsAbi } from "@morpho-org/morpho-sdk/midnight/abis";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  ethAddress,
  type Hex,
  isAddressEqual,
  maxUint128,
} from "viem";
import { SimulationEffectError } from "../errors.js";
import type { ApprovalLimit, SimulationEffect } from "../limits.js";
import type { RawCall, RawLog, SimulationTransaction } from "../types.js";
import type { ApprovalEventAddresses } from "./approvals.js";
import { parseTransfers } from "./parsing/transfers.js";

/** Permission pairs allowed only for the transaction bound by an effect. @internal */
export function effectApprovals(
  effects: readonly SimulationEffect[],
  {
    txIdx,
    transactionCount,
  }: { readonly txIdx: number; readonly transactionCount: number },
): readonly ApprovalLimit[] {
  return effects
    .filter((effect) => (effect.txIdx ?? transactionCount - 1) === txIdx)
    .flatMap((effect): ApprovalLimit[] => {
      switch (effect.type) {
        case "erc20Approval":
          if (effect.amount === 0n) {
            return [];
          }
          return [
            {
              type: "token",
              token: effect.token,
              owner: effect.owner,
              spender: effect.spender,
            },
          ];
        case "blueAuthorization":
          if (!effect.isAuthorized) {
            return [];
          }
          return [
            {
              type: "morphoAuthorization",
              authorizer: effect.authorizer,
              authorized: effect.authorized,
            },
          ];
        case "midnightAuthorization":
          if (!effect.isAuthorized) {
            return [];
          }
          return [
            {
              type: "midnightAuthorization",
              onBehalf: effect.onBehalf,
              authorized: effect.authorized,
            },
          ];
        case "midnightCancelOffers":
          return [];
      }
    });
}

type ExpectedEvent = {
  address: Address | undefined;
  topics: readonly (Hex | null | readonly Hex[])[];
  data: Hex;
};

function expectedEvents(
  effect: SimulationEffect,
  addresses: ApprovalEventAddresses,
): readonly ExpectedEvent[] {
  switch (effect.type) {
    case "erc20Approval":
      return [
        {
          address: effect.token,
          topics: encodeEventTopics({
            abi: erc20Abi,
            eventName: "Approval",
            args: { owner: effect.owner, spender: effect.spender },
          }),
          data: encodeAbiParameters([{ type: "uint256" }], [effect.amount]),
        },
      ];
    case "blueAuthorization":
      return [
        {
          address: addresses.morpho,
          topics: encodeEventTopics({
            abi: blueAbi,
            eventName: "SetAuthorization",
            args: {
              authorizer: effect.authorizer,
              authorized: effect.authorized,
            },
          }),
          data: encodeAbiParameters([{ type: "bool" }], [effect.isAuthorized]),
        },
      ];
    case "midnightAuthorization":
      return [
        {
          address: addresses.midnight,
          topics: encodeEventTopics({
            abi: midnightEventsAbi,
            eventName: "SetIsAuthorized",
            args: { onBehalf: effect.onBehalf, authorized: effect.authorized },
          }),
          data: encodeAbiParameters([{ type: "bool" }], [effect.isAuthorized]),
        },
      ];
    case "midnightCancelOffers":
      return effect.groups.map((group) => ({
        address: addresses.midnight,
        topics: encodeEventTopics({
          abi: midnightEventsAbi,
          eventName: "SetConsumed",
          args: { onBehalf: effect.onBehalf, group },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [maxUint128]),
      }));
  }
}

function matchesPair(log: RawLog, event: ExpectedEvent): boolean {
  return (
    event.address !== undefined &&
    isAddressEqual(log.address, event.address) &&
    log.topics.length === event.topics.length &&
    event.topics.every(
      (topic, index) =>
        topic === null ||
        (typeof topic === "string" &&
          topic.toLowerCase() === log.topics[index]?.toLowerCase()),
    )
  );
}

/** Verify exact events and fail closed on sender outflows, untraced native value or malformed transfer evidence. @internal */
export function verifyEffects(params: {
  readonly effects: readonly SimulationEffect[];
  readonly transactions: readonly Pick<
    SimulationTransaction,
    "from" | "to" | "value"
  >[];
  readonly calls: readonly RawCall[];
  readonly addresses: ApprovalEventAddresses;
  readonly transferOptions: Parameters<typeof parseTransfers>[1];
}): readonly SimulationEffectError[] {
  const failures: SimulationEffectError[] = [];
  for (const effect of params.effects) {
    const txIdx = effect.txIdx ?? params.transactions.length - 1;
    const call = params.calls[txIdx];
    const transaction = params.transactions[txIdx];
    if (
      call === undefined ||
      transaction === undefined ||
      !expectedEvents(effect, params.addresses).every((event) => {
        const last = call.logs.findLast((log) => matchesPair(log, event));
        return last?.data.toLowerCase() === event.data.toLowerCase();
      })
    ) {
      failures.push(
        new SimulationEffectError(txIdx, {
          effectType: effect.type,
          reason: "the exact expected event is missing or mismatched",
        }),
      );
      continue;
    }
    const sender = transaction.from;
    const evidence = parseTransfers([call], params.transferOptions);
    const sentValue = transaction.value ?? 0n;
    const tracedNativeOutgoing = evidence.transfers.reduce(
      (total, transfer) =>
        isAddressEqual(transfer.token, ethAddress) &&
        isAddressEqual(transfer.from, sender)
          ? total + transfer.amount
          : total,
      0n,
    );
    if (
      (sentValue > 0n && !isAddressEqual(transaction.to, sender)) ||
      tracedNativeOutgoing < sentValue ||
      evidence.warnings.some(
        (warning) => warning.code === "MALFORMED_TRANSFER_LOG",
      ) ||
      evidence.transfers.some(
        (transfer) =>
          transfer.amount > 0n &&
          isAddressEqual(transfer.from, sender) &&
          !isAddressEqual(transfer.to, sender),
      )
    ) {
      failures.push(
        new SimulationEffectError(txIdx, {
          effectType: effect.type,
          reason:
            "positive sender token/native outflow, missing native transfer evidence or malformed transfer evidence is present",
        }),
      );
    }
  }
  return failures;
}
