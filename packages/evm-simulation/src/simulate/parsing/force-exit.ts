import type { MarketId } from "@morpho-org/blue-sdk";
import { blueAbi, vaultV2Abi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeEventLog,
  getAbiItem,
  type Hex,
  isAddressEqual,
  toEventSelector,
} from "viem";
import {
  InvalidSimulationResponseError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import type { ForceExitDeallocationQuote } from "../../limits.js";
import type { RawLog } from "../../types.js";

// Topic-0 selectors for the events force-exit quotes read, derived from the
// pinned ABIs. Emitters are filtered separately (vault for ForceDeallocate and
// the ERC4626 Withdraw, Morpho for the Blue Withdraw).
const FORCE_DEALLOCATE = toEventSelector(
  getAbiItem({ abi: vaultV2Abi, name: "ForceDeallocate" }),
);
const BLUE_WITHDRAW = toEventSelector(
  getAbiItem({ abi: blueAbi, name: "Withdraw" }),
);
const VAULT_WITHDRAW = toEventSelector(
  getAbiItem({ abi: vaultV2Abi, name: "Withdraw" }),
);

/**
 * Find force-exit attribution failures and measure the quoted economics.
 * @param params - Per-call logs, contract addresses, account, operation, and whether deallocations are quoted.
 * @returns Attribution failures in check order, plus measured penalty and paired deallocations.
 * @throws {InvalidSimulationResponseError} When a matching event log cannot be decoded.
 * @internal
 */
export function findForceExitFailures(params: {
  readonly logs: readonly (readonly RawLog[])[];
  readonly vault: Address;
  readonly morpho: Address;
  readonly account: Address;
  readonly operationType: "vaultV2ForceWithdraw" | "vaultV2ForceRedeem";
  readonly operationIndex: number;
  readonly requireDeallocations: boolean;
}): {
  readonly failures: readonly SlippageCheckUnavailableError[];
  readonly checked: {
    readonly penalty: bigint;
    readonly deallocations: readonly ForceExitDeallocationQuote[];
  };
} {
  const { logs, vault, morpho, account, operationType } = params;
  let exitEvidenced = false;
  let penalty = 0n;
  const unpairedAdapters = new Set<string>();
  const penalizedAccounts = new Set<Address>();
  const deallocated = new Map<string, ForceExitDeallocationQuote>();
  // Within each user call, a `ForceDeallocate` pairs with the nearest
  // preceding not-yet-paired Morpho `Withdraw` of the same amount from
  // the same adapter — MorphoMarketV1AdapterV2 `deallocate` withdraws
  // exactly `ForceDeallocate.assets`, while the vault's penalty pull can
  // emit a same-adapter liquidity `Withdraw` of a different amount.
  // (morpho-org/vault-v2 `VaultV2.forceDeallocate`)
  for (const callLogs of logs) {
    const withdrawals: {
      index: number;
      onBehalf: Address;
      id: MarketId;
      assets: bigint;
      paired: boolean;
    }[] = [];
    const forces: {
      index: number;
      adapter: Address;
      onBehalf: Address;
      assets: bigint;
      penaltyAssets: bigint;
    }[] = [];
    for (const [index, log] of callLogs.entries()) {
      const topic0 = log.topics[0]?.toLowerCase();
      const topics = [topic0, ...log.topics.slice(1)] as [Hex, ...Hex[]];
      let eventName: "Withdraw" | "ForceDeallocate" = "Withdraw";
      try {
        if (isAddressEqual(log.address, vault)) {
          if (topic0 === VAULT_WITHDRAW) {
            eventName = "Withdraw";
            const event = decodeEventLog({
              abi: vaultV2Abi,
              eventName: "Withdraw",
              data: log.data,
              topics,
            });
            if (isAddressEqual(event.args.onBehalf, account)) {
              exitEvidenced = true;
            }
          } else if (topic0 === FORCE_DEALLOCATE) {
            eventName = "ForceDeallocate";
            const event = decodeEventLog({
              abi: vaultV2Abi,
              eventName: "ForceDeallocate",
              data: log.data,
              topics,
            });
            forces.push({
              index,
              adapter: event.args.adapter,
              onBehalf: event.args.onBehalf,
              assets: event.args.assets,
              penaltyAssets: event.args.penaltyAssets,
            });
          }
        } else if (
          isAddressEqual(log.address, morpho) &&
          topic0 === BLUE_WITHDRAW
        ) {
          eventName = "Withdraw";
          const event = decodeEventLog({
            abi: blueAbi,
            eventName: "Withdraw",
            data: log.data,
            topics,
          });
          withdrawals.push({
            index,
            onBehalf: event.args.onBehalf,
            id: event.args.id as MarketId,
            assets: event.args.assets,
            paired: false,
          });
        }
      } catch (cause) {
        throw new InvalidSimulationResponseError(
          `Cannot decode "${eventName}" logs for "${operationType}". Check the selected contract and RPC response.`,
          { cause },
        );
      }
    }
    for (const force of forces) {
      if (!isAddressEqual(force.onBehalf, account)) {
        if (force.penaltyAssets > 0n) {
          penalizedAccounts.add(force.onBehalf);
        }
        continue;
      }
      penalty += force.penaltyAssets;
      let withdrawal: (typeof withdrawals)[number] | undefined;
      for (let i = withdrawals.length - 1; i >= 0; i--) {
        const candidate = withdrawals[i];
        if (
          candidate !== undefined &&
          !candidate.paired &&
          candidate.index < force.index &&
          candidate.assets === force.assets &&
          isAddressEqual(candidate.onBehalf, force.adapter)
        ) {
          withdrawal = candidate;
          break;
        }
      }
      if (withdrawal === undefined) {
        unpairedAdapters.add(force.adapter);
        continue;
      }
      withdrawal.paired = true;
      const key = withdrawal.id.toLowerCase();
      deallocated.set(key, {
        marketId: withdrawal.id,
        assets: (deallocated.get(key)?.assets ?? 0n) + withdrawal.assets,
      });
    }
  }
  return {
    failures: findForceExitEvidenceFailures(params, {
      exitEvidenced,
      penalizedAccounts,
      unpairedAdapters,
    }),
    checked: { penalty, deallocations: [...deallocated.values()] },
  };
}

function findForceExitEvidenceFailures(
  {
    account,
    operationIndex,
    operationType,
    requireDeallocations,
  }: Pick<
    Parameters<typeof findForceExitFailures>[0],
    "account" | "operationIndex" | "operationType" | "requireDeallocations"
  >,
  {
    exitEvidenced,
    penalizedAccounts,
    unpairedAdapters,
  }: {
    exitEvidenced: boolean;
    penalizedAccounts: ReadonlySet<Address>;
    unpairedAdapters: ReadonlySet<string>;
  },
): SlippageCheckUnavailableError[] {
  const failures: SlippageCheckUnavailableError[] = [];
  if (penalizedAccounts.size > 0) {
    failures.push(
      new SlippageCheckUnavailableError(
        `Cannot attribute "penalty" for "${operationType}": ForceDeallocate charged ${[...penalizedAccounts].join(", ")} instead of ${account}. Retry the simulation or report the RPC response.`,
        {
          operationIndex,
          operationType,
          field: "penalty",
          reason: "accountMismatch",
        },
      ),
    );
  }
  // A quoted force exit must leave the vault's own ERC4626 `Withdraw`
  // log; without it "no ForceDeallocate" cannot be read as zero penalty.
  if (!exitEvidenced) {
    failures.push(
      new SlippageCheckUnavailableError(
        `Missing "Withdraw" evidence for "${operationType}": the vault's ERC4626 exit log is absent from the simulated calls. Retry the simulation or report the RPC response.`,
        {
          operationIndex,
          operationType,
          field: "penalty",
          reason: "missingEvent",
        },
      ),
    );
  }
  if (requireDeallocations && unpairedAdapters.size > 0) {
    failures.push(
      new SlippageCheckUnavailableError(
        `Cannot attribute "deallocations" for "${operationType}": adapter(s) ${[...unpairedAdapters].join(", ")} produced no Blue "Withdraw" evidence; they may not be Blue market adapters. Retry the simulation or report the RPC response.`,
        {
          operationIndex,
          operationType,
          field: "deallocations",
          reason: "unmatchedEvent",
        },
      ),
    );
  }
  return failures;
}

/**
 * Reject the first force-exit measurement failure.
 * @param params - Observations and limits to check.
 * @returns The checked values for the success path.
 * @throws {SlippageCheckUnavailableError} When required evidence is unavailable.
 * @throws {InvalidSimulationResponseError} When a matching event log cannot be decoded.
 * @internal
 */
export function measureForceExit(
  params: Parameters<typeof findForceExitFailures>[0],
): {
  readonly penalty: bigint;
  readonly deallocations: readonly ForceExitDeallocationQuote[];
} {
  const {
    failures: [failure],
    checked,
  } = findForceExitFailures(params);
  if (failure !== undefined) {
    throw failure;
  }
  return checked;
}
