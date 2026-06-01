import { getAddress, type Hex, zeroAddress, zeroHash } from "viem";

import type {
  RawCall,
  RawLog,
  SimulationLogger,
  Transfer,
} from "../../types.js";

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
 * `Deposit(to, amount)` / `Withdrawal(from, amount)`. WETH9 mint/burn Transfer
 * events paired with their Deposit/Withdrawal are deduplicated. ERC721 and
 * ERC1155 transfer events are **not** parsed — consumers with NFT flows will
 * see an incomplete transfer list.
 *
 * **WETH9 dedup assumption — canonical atomic emission.** Dedup is scoped to
 * the same tx: a zero-address `Transfer` is suppressed only if its paired
 * `Deposit`/`Withdrawal` appears in the same `calls[txIdx].logs` slice. This
 * is correct for canonical WETH9, which always emits the `Deposit`/
 * `Withdrawal` and the matching `Transfer(0x0, …)` / `Transfer(…, 0x0)`
 * atomically inside a single call frame. A **non-canonical wrapped-native**
 * that splits these emissions across two txs in the same bundle would leave
 * a phantom zero-address `Transfer` in the parsed output, which can be summed
 * by `assertNoBundlerRetention` and produce a false `BlacklistViolationError`.
 * When a zero-address `Transfer` misses same-tx dedup *and* its token has
 * emitted a `Deposit`/`Withdrawal` somewhere else in the bundle (i.e. it
 * looks wnative-shaped), the parser emits a `warn` so the assumption break
 * is observable before it reaches retention. None of `morpho-sdk`'s currently
 * supported chains require cross-tx dedup; the assumption is rechecked when
 * onboarding a new chain (see `evm-simulation/CLAUDE.md`).
 *
 * **Failure mode:** on a per-log parse failure (malformed topic length,
 * non-hex data), the log is skipped and a `warn` is emitted via the logger.
 *
 * Output is sorted canonically by token, from, to, amount for determinism.
 * `txIdx` is attached but does not influence sort order.
 */
export function parseTransfers(
  calls: readonly RawCall[],
  logger?: SimulationLogger,
): Transfer[] {
  const transfers: Transfer[] = [];

  // Tokens that emit `Deposit` or `Withdrawal` somewhere in the bundle look
  // wnative-shaped. If a zero-address `Transfer` for one of these tokens
  // misses same-tx dedup, the contract is likely emitting non-canonically
  // (split across txs) and a phantom transfer would leak into retention.
  const wnativeShapedTokens = collectWnativeShapedTokens(calls);

  for (let txIdx = 0; txIdx < calls.length; txIdx++) {
    const logs = calls[txIdx]!.logs;
    for (const log of logs) {
      try {
        const topic0 = log.topics[0];
        if (topic0 === undefined) continue;

        switch (topic0) {
          case WITHDRAWAL_TOPIC: {
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
            if (toTopic === zeroHash) {
              const paired = logs.some(
                (other) =>
                  other.topics[0] === WITHDRAWAL_TOPIC &&
                  other.address === log.address &&
                  other.data === log.data &&
                  other.topics.length === 2 &&
                  other.topics[1] === fromTopic,
              );
              if (paired) continue;
              if (wnativeShapedTokens.has(log.address.toLowerCase())) {
                warnNonCanonicalWnative(logger, log, "burn", txIdx);
              }
            }

            // WETH9 wrap dedup: Transfer from zero paired with a Deposit of
            // equal amount in the SAME tx.
            if (fromTopic === zeroHash) {
              const paired = logs.some(
                (other) =>
                  other.topics[0] === DEPOSIT_TOPIC &&
                  other.address === log.address &&
                  other.data === log.data &&
                  other.topics.length === 2 &&
                  other.topics[1] === toTopic,
              );
              if (paired) continue;
              if (wnativeShapedTokens.has(log.address.toLowerCase())) {
                warnNonCanonicalWnative(logger, log, "mint", txIdx);
              }
            }

            transfers.push({
              token: getAddress(log.address),
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

/**
 * Collect token addresses (lowercased) that emit `Deposit` or `Withdrawal`
 * anywhere in the bundle. Used to detect when a zero-address `Transfer` that
 * misses same-tx dedup is on a wnative-shaped contract — a strong signal
 * that the contract is emitting non-canonically and a phantom transfer is
 * about to leak into bundler retention.
 */
function collectWnativeShapedTokens(calls: readonly RawCall[]): Set<string> {
  const set = new Set<string>();
  for (const c of calls) {
    for (const l of c.logs) {
      const t0 = l.topics[0];
      if (t0 === WITHDRAWAL_TOPIC || t0 === DEPOSIT_TOPIC) {
        set.add(l.address.toLowerCase());
      }
    }
  }
  return set;
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
