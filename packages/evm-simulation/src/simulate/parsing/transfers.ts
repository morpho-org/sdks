import { type Hex, getAddress, zeroAddress, zeroHash } from "viem";

import type { RawLog, SimulationLogger, Transfer } from "../../types.js";

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
 * **Supported event types:** ERC20 `Transfer(from, to, amount)` and WETH9
 * `Deposit(to, amount)` / `Withdrawal(from, amount)`. WETH9 mint/burn Transfer
 * events paired with their Deposit/Withdrawal are deduplicated. ERC721 and
 * ERC1155 transfer events are **not** parsed — consumers with NFT flows will
 * see an incomplete transfer list.
 *
 * **WETH9-specific dedup:** matches Transfer-to/from zero against the
 * matching Deposit/Withdrawal event on the same contract with the same data
 * and withdrawer. Non-standard wrapped-native implementations (e.g., rebasing
 * or fee-on-withdraw wrappers) may escape the dedup and produce double-counts.
 *
 * **Failure mode:** on a per-log parse failure (malformed topic length,
 * non-hex data), the log is skipped and a `warn` is emitted via the logger.
 * The caller receives a possibly-incomplete transfer list. Upstream sources
 * (e.g., Tenderly response schemas) should validate log shape before calling
 * here to avoid silent drops.
 *
 * Output is sorted canonically by token, from, to, amount for determinism.
 */
export function parseTransfers(
  logs: RawLog[],
  logger?: SimulationLogger,
): Transfer[] {
  const transfers: Transfer[] = [];

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
            warnMalformed(logger, log, "ERC20 Transfer: bad topic/data length");
            continue;
          }

          // WETH9 unwrap dedup: Transfer to zero paired with a Withdrawal of equal amount.
          if (
            toTopic === zeroHash &&
            logs.some(
              (other) =>
                other.topics[0] === WITHDRAWAL_TOPIC &&
                other.address === log.address &&
                other.data === log.data &&
                other.topics.length === 2 &&
                other.topics[1] === fromTopic,
            )
          )
            continue;

          // WETH9 wrap dedup: Transfer from zero paired with a Deposit of equal amount.
          if (
            fromTopic === zeroHash &&
            logs.some(
              (other) =>
                other.topics[0] === DEPOSIT_TOPIC &&
                other.address === log.address &&
                other.data === log.data &&
                other.topics.length === 2 &&
                other.topics[1] === toTopic,
            )
          )
            continue;

          transfers.push({
            token: getAddress(log.address),
            from: getAddress(`0x${fromTopic.slice(26)}`),
            to: getAddress(`0x${toTopic.slice(26)}`),
            amount: BigInt(log.data),
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
        error instanceof Error ? error.message : String(error),
      );
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
