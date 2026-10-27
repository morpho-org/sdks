import type { MarketId } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeEventLog,
  getAbiItem,
  isAddressEqual,
  toEventSelector,
} from "viem";
import { InvalidSimulationResponseError } from "../../errors.js";
import type { RawLog } from "../../types.js";

const BLUE_SUPPLY = toEventSelector(
  getAbiItem({ abi: blueAbi, name: "Supply" }),
);
const BLUE_WITHDRAW = toEventSelector(
  getAbiItem({ abi: blueAbi, name: "Withdraw" }),
);

/**
 * Count subject-market supplies before the account's first matching withdrawal.
 * Each supply can reduce a later assets-mode conversion by one share wei.
 * @param params - Simulated logs and the subject market/account.
 * @returns The number of earlier subject-market supplies, or zero when the
 *   matching withdrawal is not evidenced.
 * @throws {InvalidSimulationResponseError} When a matching Blue event cannot be decoded.
 * @internal
 */
export function countPrecedingBlueSupplies(params: {
  readonly logs: readonly (readonly RawLog[])[];
  readonly morpho: Address;
  readonly marketId: MarketId;
  readonly account: Address;
}): bigint {
  let supplies = 0n;
  for (const callLogs of params.logs) {
    for (const log of callLogs) {
      if (!isAddressEqual(log.address, params.morpho)) continue;
      const topic0 = log.topics[0]?.toLowerCase();
      const topics = [topic0, ...log.topics.slice(1)] as [
        `0x${string}`,
        ...`0x${string}`[],
      ];
      try {
        if (topic0 === BLUE_WITHDRAW) {
          const event = decodeEventLog({
            abi: blueAbi,
            eventName: "Withdraw",
            data: log.data,
            topics,
          });
          if (
            event.args.id.toLowerCase() === params.marketId.toLowerCase() &&
            isAddressEqual(event.args.onBehalf, params.account)
          )
            return supplies;
        } else if (topic0 === BLUE_SUPPLY) {
          const event = decodeEventLog({
            abi: blueAbi,
            eventName: "Supply",
            data: log.data,
            topics,
          });
          if (event.args.id.toLowerCase() === params.marketId.toLowerCase())
            supplies += 1n;
        }
      } catch (cause) {
        throw new InvalidSimulationResponseError(
          "Cannot decode Blue supply/withdraw logs for subject-share rounding.",
          { cause },
        );
      }
    }
  }
  return 0n;
}
