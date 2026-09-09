import {
  type Address,
  getAddress,
  type Hex,
  isAddressEqual,
  zeroAddress,
  zeroHash,
} from "viem";

import type {
  RawCall,
  RawLog,
  SimulationLogger,
  Transfer,
} from "../../types.js";
import { normalizeAssetToken } from "../asset-changes.js";

// keccak256("Transfer(address,address,uint256)") — ERC-20 transfer event
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// keccak256("Withdrawal(address,uint256)") — WETH9 unwrap event
export const WITHDRAWAL_TOPIC =
  "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";
// keccak256("Deposit(address,uint256)") — WETH9 wrap event
export const DEPOSIT_TOPIC =
  "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";

const TOPIC_HEX_LENGTH = 66; // "0x" + 32 bytes
const UINT256_HEX_LENGTH = 66; // "0x" + 32 bytes

/**
 * Parse raw EVM logs into individual Transfer events.
 *
 * Iterates over per-tx `calls` and stamps each emitted `Transfer.txIdx`
 * with the index of the originating call.
 *
 * **Supported event types:** ERC20 `Transfer(from, to, amount)` and WETH9
 * `Deposit(to, amount)` / `Withdrawal(from, amount)` from the registered
 * wrapped-native token. Known chains without a wrapped-native token ignore
 * WETH9 events and skip wrapped-native deduplication; chains without registry
 * metadata retain legacy signature-based parsing. On enabled paths, paired
 * mint/burn Transfer events are deduplicated. ERC721 and ERC1155 transfer
 * events are **not** parsed — consumers with NFT flows will see an incomplete
 * transfer list.
 *
 * **Native ETH (`eth_simulateV1` + `traceTransfers`).** When the backend runs
 * `eth_simulateV1` with `traceTransfers` enabled, native-ETH moves — including
 * those made through internal calls (e.g. a `WETH.withdraw` refund) — are
 * synthesized as `Transfer` events emitted from the native sentinel
 * `0xeee…eee`. These are parsed like any ERC20 transfer, with `token`
 * collapsed to viem's `ethAddress` so native deltas key consistently across
 * backends. Tenderly does not emit these synthetic logs (it derives native ETH
 * separately), so this path is inert there.
 *
 * **WETH9 dedup assumption — canonical atomic emission.** Dedup for the
 * registered wrapped-native token is scoped to the same tx: a zero-address
 * `Transfer` is suppressed only if its paired `Deposit`/`Withdrawal` appears
 * in the same `calls[txIdx].logs` slice. Pairing is one-to-one (each
 * `Deposit`/`Withdrawal` absolves at most one `Transfer`) and compares
 * `address`/`topics`/`data` case-insensitively. This is correct for canonical WETH9,
 * which always emits the `Deposit`/
 * `Withdrawal` and the matching `Transfer(0x0, …)` / `Transfer(…, 0x0)`
 * atomically inside a single call frame. A **non-canonical wrapped-native**
 * that splits these emissions across two txs in the same bundle would leave
 * a phantom zero-address `Transfer` in the parsed output, which can be summed
 * by `assertNoBundlerRetention` and produce a false `BlacklistViolationError`.
 * When its zero-address `Transfer` misses same-tx dedup, the parser emits a
 * `warn` so the assumption break is observable before it reaches retention.
 * None of `morpho-sdk`'s currently supported chains require cross-tx dedup;
 * the assumption is rechecked when onboarding a new chain (see
 * `evm-simulation/CLAUDE.md`).
 *
 * **Failure mode:** on a per-log parse failure (malformed topic length,
 * non-hex data), the log is skipped and a `warn` is emitted via the logger.
 *
 * Output is sorted canonically by token, from, to, amount for determinism.
 * `txIdx` is attached but does not influence sort order.
 *
 * @param calls - Per-transaction call results to parse.
 * @param options - Wrapped-native metadata and optional logger. Pass `null` for
 *   a known chain without a wrapped-native token; omit it for legacy parsing on
 *   an unknown chain.
 * @returns Canonically sorted transfers with their originating transaction index.
 * @internal
 */
export function parseTransfers(
  calls: readonly RawCall[],
  options: {
    readonly wNative?: Address | null;
    readonly logger?: SimulationLogger;
  } = {},
): Transfer[] {
  const transfers: Transfer[] = [];
  const { logger, wNative } = options;
  const wnativeShapedTokens = collectWnativeShapedTokens(calls);
  const acceptsWnativeEvent = (address: Address): boolean =>
    wNative === undefined ||
    (wNative !== null && isAddressEqual(address, wNative));

  for (let txIdx = 0; txIdx < calls.length; txIdx++) {
    const logs = calls[txIdx]!.logs;
    const unpairedWnativeEvents = countWnativeEvents(logs);
    for (const log of logs) {
      try {
        const topic0 = log.topics[0]?.toLowerCase();
        if (topic0 === undefined) continue;

        switch (topic0) {
          case WITHDRAWAL_TOPIC: {
            if (!acceptsWnativeEvent(log.address)) continue;
            const fromTopic = log.topics[1];
            if (!isTopicHex(fromTopic) || !isUint256Hex(log.data)) {
              warnMalformed(
                logger,
                log,
                "WETH9 Withdrawal: bad topic[1] or data length",
              );
              continue;
            }
            transfers.push({
              token: getAddress(log.address),
              from: getAddress(`0x${fromTopic.slice(26)}`),
              to: zeroAddress,
              amount: BigInt(log.data),
              txIdx,
            });
            continue;
          }

          case DEPOSIT_TOPIC: {
            if (!acceptsWnativeEvent(log.address)) continue;
            const toTopic = log.topics[1];
            if (!isTopicHex(toTopic) || !isUint256Hex(log.data)) {
              warnMalformed(
                logger,
                log,
                "WETH9 Deposit: bad topic[1] or data length",
              );
              continue;
            }
            transfers.push({
              token: getAddress(log.address),
              from: zeroAddress,
              to: getAddress(`0x${toTopic.slice(26)}`),
              amount: BigInt(log.data),
              txIdx,
            });
            continue;
          }

          case TRANSFER_TOPIC: {
            // ERC-20 Transfer has 3 topics; ERC-721 Transfer has 4 (tokenId indexed).
            // ERC-721 flows are out of scope.
            if (log.topics.length !== 3) continue;

            const fromTopic = log.topics[1]!;
            const toTopic = log.topics[2]!;

            if (
              !isTopicHex(fromTopic) ||
              !isTopicHex(toTopic) ||
              !isUint256Hex(log.data)
            ) {
              warnMalformed(
                logger,
                log,
                "ERC20 Transfer: bad topic/data length",
              );
              continue;
            }

            // WETH9 unwrap dedup: Transfer to zero paired with a Withdrawal of
            // equal amount in the SAME tx.
            if (
              toTopic.toLowerCase() === zeroHash &&
              acceptsWnativeEvent(log.address)
            ) {
              if (
                consumeWnativeEvent(
                  unpairedWnativeEvents,
                  wnativeEventKey(
                    WITHDRAWAL_TOPIC,
                    log.address,
                    fromTopic,
                    log.data,
                  ),
                )
              )
                continue;
              if (
                wNative !== undefined ||
                wnativeShapedTokens.has(log.address.toLowerCase())
              ) {
                warnNonCanonicalWnative(logger, log, "burn", txIdx);
              }
            }

            // WETH9 wrap dedup: Transfer from zero paired with a Deposit of
            // equal amount in the SAME tx.
            if (
              fromTopic.toLowerCase() === zeroHash &&
              acceptsWnativeEvent(log.address)
            ) {
              if (
                consumeWnativeEvent(
                  unpairedWnativeEvents,
                  wnativeEventKey(
                    DEPOSIT_TOPIC,
                    log.address,
                    toTopic,
                    log.data,
                  ),
                )
              )
                continue;
              if (
                wNative !== undefined ||
                wnativeShapedTokens.has(log.address.toLowerCase())
              ) {
                warnNonCanonicalWnative(logger, log, "mint", txIdx);
              }
            }

            transfers.push({
              token: normalizeAssetToken(log.address),
              from: getAddress(`0x${fromTopic.slice(26)}`),
              to: getAddress(`0x${toTopic.slice(26)}`),
              amount: BigInt(log.data),
              txIdx,
            });
            continue;
          }
        }
      } catch (error) {
        // Safety net for anything that slips past the length checks above
        // (e.g., viem checksum throws on non-hex input). Loud enough to diagnose.
        warnMalformed(
          logger,
          log,
          /* v8 ignore next: parser paths throw Error instances for valid RawLog shapes. */
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  return sortTransfers(transfers);
}

function isTopicHex(value: Hex | undefined): value is Hex {
  return typeof value === "string" && value.length === TOPIC_HEX_LENGTH;
}

function isUint256Hex(value: Hex | undefined): value is Hex {
  return typeof value === "string" && value.length === UINT256_HEX_LENGTH;
}

// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
function warnMalformed(
  logger: SimulationLogger | undefined,
  log: RawLog,
  reason: string,
): void {
  logger?.warn("Skipping malformed log during transfer parsing", {
    address: log.address,
    topics: log.topics,
    reason,
  });
}

/** Case-insensitive identity of a WETH9 `Deposit`/`Withdrawal` log. */
// biome-ignore lint/complexity/useMaxParams: flat key over the four pairing fields
function wnativeEventKey(
  topic0: Hex,
  address: Address,
  account: Hex,
  data: Hex,
): string {
  return `${topic0}:${address.toLowerCase()}:${account.toLowerCase()}:${data.toLowerCase()}`;
}

/** Count WETH9 `Deposit`/`Withdrawal` logs of one tx, keyed by {@link wnativeEventKey}. */
function countWnativeEvents(logs: readonly RawLog[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const log of logs) {
    const topic0 = log.topics[0]?.toLowerCase();
    const account = log.topics[1];
    if (
      (topic0 !== WITHDRAWAL_TOPIC && topic0 !== DEPOSIT_TOPIC) ||
      log.topics.length !== 2 ||
      !isTopicHex(account) ||
      !isUint256Hex(log.data)
    )
      continue;
    const key = wnativeEventKey(topic0, log.address, account, log.data);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Consume one unpaired WETH9 event for `key`; returns whether one was available. */
function consumeWnativeEvent(
  counts: Map<string, number>,
  key: string,
): boolean {
  const remaining = counts.get(key);
  if (remaining === undefined) return false;
  if (remaining === 1) counts.delete(key);
  else counts.set(key, remaining - 1);
  return true;
}

/** Collect contracts that emit WETH9-shaped events anywhere in the bundle. */
function collectWnativeShapedTokens(calls: readonly RawCall[]): Set<string> {
  const tokens = new Set<string>();
  for (const call of calls) {
    for (const log of call.logs) {
      const topic0 = log.topics[0]?.toLowerCase();
      if (topic0 === WITHDRAWAL_TOPIC || topic0 === DEPOSIT_TOPIC) {
        tokens.add(log.address.toLowerCase());
      }
    }
  }
  return tokens;
}

// biome-ignore lint/complexity/useMaxParams: structured warn with full context
function warnNonCanonicalWnative(
  logger: SimulationLogger | undefined,
  log: RawLog,
  kind: "mint" | "burn",
  txIdx: number,
): void {
  logger?.warn(
    "WETH9 dedup miss: zero-address Transfer on wnative-shaped token without paired same-tx Deposit/Withdrawal — possible non-canonical wrapped-native, may cause bundler retention false positive",
    {
      token: log.address,
      kind,
      txIdx,
      data: log.data,
    },
  );
}

/**
 * Canonical sort: by lowercased token, from, to, then amount. Addresses are
 * pre-lowercased once to avoid redundant `.toLowerCase()` calls per comparison.
 */
function sortTransfers(transfers: Transfer[]): Transfer[] {
  const decorated = transfers.map((t) => ({
    t,
    tokenLc: t.token.toLowerCase(),
    fromLc: t.from.toLowerCase(),
    toLc: t.to.toLowerCase(),
  }));
  decorated.sort((a, b) => {
    if (a.tokenLc !== b.tokenLc) return a.tokenLc < b.tokenLc ? -1 : 1;
    if (a.fromLc !== b.fromLc) return a.fromLc < b.fromLc ? -1 : 1;
    if (a.toLc !== b.toLc) return a.toLc < b.toLc ? -1 : 1;
    return a.t.amount < b.t.amount ? -1 : a.t.amount > b.t.amount ? 1 : 0;
  });
  return decorated.map((d) => d.t);
}
