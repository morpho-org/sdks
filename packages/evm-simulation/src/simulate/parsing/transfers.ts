import {
  type Address,
  getAddress,
  type Hex,
  isAddressEqual,
  zeroAddress,
  zeroHash,
} from "viem";

import type { RawCall, RawLog, Transfer } from "../../types.js";
import { freezeWarning, type SimulationWarning } from "../../warnings.js";
import { normalizeAssetToken } from "../asset-changes.js";

/** `keccak256("Transfer(address,address,uint256)")` — ERC-20 Transfer event topic. @internal */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** `keccak256("Withdrawal(address,uint256)")` — WETH9 Withdrawal event topic. @internal */
export const WITHDRAWAL_TOPIC =
  "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";
/** `keccak256("Deposit(address,uint256)")` — WETH9 Deposit event topic. @internal */
export const DEPOSIT_TOPIC =
  "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";

const TOPIC_HEX_LENGTH = 66; // "0x" + 32 bytes
const UINT256_HEX_LENGTH = 66; // "0x" + 32 bytes

/** Marks logs whose data was omitted before RPC normalization. @internal */
export const MISSING_LOG_DATA = Symbol("missingLogData");

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
 * metadata retain legacy signature-based parsing. On enabled paths, each
 * `Deposit`/`Withdrawal` cancels at most one matching zero-address `Transfer`
 * (none when `wNativeEmitsTransfer` is `false`). ERC721 and ERC1155 transfer
 * events are **not** parsed — consumers with NFT flows will see an incomplete
 * transfer list.
 *
 * **Native ETH (`eth_simulateV1` + `traceTransfers`).** When the backend runs
 * `eth_simulateV1` with `traceTransfers` enabled, native-ETH moves — including
 * those made through internal calls (e.g. a `WETH.withdraw` refund) — are
 * synthesized as `Transfer` events emitted from the native sentinel
 * `0xeee…eee`. These are parsed like any ERC20 transfer, with `token`
 * collapsed to viem's `ethAddress` so native deltas key consistently.
 *
 * **Wrapped-native dedup assumption — wrapper-dependent emission.** Dedup for
 * the registered wrapped-native token is scoped to the same tx: a zero-address
 * `Transfer` is suppressed only once for each matching `Deposit`/`Withdrawal`
 * in the same `calls[txIdx].logs` slice. Some wrappers emit these mirror
 * `Transfer` events; canonical WETH9 does not. Set
 * `wNativeEmitsTransfer: false` for verified chains whose wrapper emits no
 * mirror, keeping zero-address transfers alongside the `Deposit`/`Withdrawal`
 * mint/burn. The "WETH9 dedup miss" `warn` fires only when the transaction has
 * no matching same-tx `Deposit`/`Withdrawal` at all; a surplus equal-value
 * transfer after one-to-one pairing is kept silently. With
 * `wNativeEmitsTransfer: false`, a kept transfer matching a same-call event is
 * reported as `WRAPPED_NATIVE_MIRROR_DETECTED`.
 *
 * **Hex casing.** JSON-RPC `DATA` is case-insensitive, so `topics` and `data`
 * are lowercased before signature dispatch and pair matching; a backend that
 * echoes mixed-case hex cannot drop a transfer from the parsed output.
 *
 * **Failure mode:** on a per-log parse failure (invalid Transfer topic/data shape,
 * malformed topic length,
 * non-hex data), the log is skipped with a `MALFORMED_TRANSFER_LOG` warning.
 *
 * Output is sorted canonically by token, from, to, amount for determinism.
 * `txIdx` is attached but does not influence sort order.
 *
 * @param calls - Per-transaction call results to parse.
 * @param options - Chain ID and wrapped-native metadata. Pass `null` for
 *   a known chain without a wrapped-native token; omit it for legacy parsing on
 *   an unknown chain. `wNativeEmitsTransfer` defaults to `true` and controls
 *   pairing for a registered wrapped-native token.
 * @returns Canonically sorted transfers and frozen structured warnings in log order.
 * @internal
 */
export function parseTransfers(
  calls: readonly RawCall[],
  options: {
    readonly wNative?: Address | null;
    readonly wNativeEmitsTransfer?: boolean;
    readonly chainId: number;
  },
): { transfers: Transfer[]; warnings: readonly SimulationWarning[] } {
  const transfers: Transfer[] = [];
  const warnings: SimulationWarning[] = [];
  const { chainId, wNative, wNativeEmitsTransfer = true } = options;
  const shouldPairWnative = wNativeEmitsTransfer || wNative === undefined;
  // Lowercase `topics`/`data` so signature dispatch and pair matching are case-insensitive.
  const normalizedCalls = calls.map((call) =>
    call.logs.map(
      (log): RawLog => ({
        ...log,
        ...(log.data === undefined ? { [MISSING_LOG_DATA]: true } : {}),
        topics: log.topics.map((topic) => topic.toLowerCase() as Hex),
        data: (log.data ?? "0x").toLowerCase() as Hex,
      }),
    ),
  );
  const wnativeShapedTokens = collectWnativeShapedTokens(normalizedCalls);
  const acceptsWnativeEvent = (address: Address): boolean =>
    wNative === undefined ||
    (wNative !== null && isAddressEqual(address, wNative));

  const shouldWarnOnUnmatchedWnative = (address: Address): boolean =>
    wNative !== undefined || wnativeShapedTokens.has(address.toLowerCase());

  for (const [txIdx, logs] of normalizedCalls.entries()) {
    const consumedWnativeEventLogs = new Set<number>();
    for (const log of logs) {
      try {
        const topic0 = log.topics[0];
        if (topic0 === undefined) {
          continue;
        }

        switch (topic0) {
          case WITHDRAWAL_TOPIC:
          case DEPOSIT_TOPIC: {
            if (!acceptsWnativeEvent(log.address)) {
              continue;
            }
            const transfer = parseWnativeTransfer(log, {
              kind: topic0 === WITHDRAWAL_TOPIC ? "burn" : "mint",
              txIdx,
              warnings,
              chainId,
            });
            if (transfer !== undefined) {
              transfers.push(transfer);
            }
            continue;
          }

          case TRANSFER_TOPIC: {
            // ERC-20 Transfer has 3 topics; ERC-721 Transfer has 4 (tokenId indexed).
            // ERC-721 flows are out of scope.
            if (isErc721Transfer(log)) {
              continue;
            }

            const fromTopic = log.topics[1];
            const toTopic = log.topics[2];

            if (
              log.topics.length !== 3 ||
              !isTopicHex(fromTopic) ||
              !isTopicHex(toTopic) ||
              !isUint256Hex(log.data)
            ) {
              warnMalformed(
                warnings,
                log,
                "ERC20 Transfer: bad topic/data length",
                { chainId, txIdx },
              );
              continue;
            }

            if (
              (toTopic === zeroHash || fromTopic === zeroHash) &&
              acceptsWnativeEvent(log.address)
            ) {
              const pairedIndex = findMirroredWnativeLog(log, {
                fromTopic,
                toTopic,
                logs,
                consumedWnativeEventLogs,
                shouldPairWnative,
                shouldWarnOnUnmatchedWnative,
                txIdx,
                warnings,
                chainId,
              });
              if (pairedIndex !== undefined) {
                consumedWnativeEventLogs.add(pairedIndex);
                continue;
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
          warnings,
          log,
          /* v8 ignore next: parser paths throw Error instances for valid RawLog shapes. */
          error instanceof Error ? error.message : String(error),
          { chainId, txIdx },
        );
      }
    }
  }

  return {
    transfers: sortTransfers(transfers),
    warnings: Object.freeze(warnings),
  };
}

function parseWnativeTransfer(
  log: RawLog,
  {
    kind,
    txIdx,
    warnings,
    chainId,
  }: {
    kind: "burn" | "mint";
    txIdx: number;
    warnings: SimulationWarning[];
    chainId: number;
  },
): Transfer | undefined {
  const accountTopic = log.topics[1];
  if (!isTopicHex(accountTopic) || !isUint256Hex(log.data)) {
    const event = kind === "burn" ? "Withdrawal" : "Deposit";
    warnMalformed(
      warnings,
      log,
      `WETH9 ${event}: bad topic[1] or data length`,
      { chainId, txIdx },
    );
    return;
  }
  const token = getAddress(log.address);
  const account = getAddress(`0x${accountTopic.slice(26)}`);
  return {
    token,
    from: kind === "burn" ? account : zeroAddress,
    to: kind === "mint" ? account : zeroAddress,
    amount: BigInt(log.data),
    txIdx,
  };
}

function findMirroredWnativeLog(
  log: RawLog,
  {
    fromTopic,
    toTopic,
    logs,
    consumedWnativeEventLogs,
    shouldPairWnative,
    shouldWarnOnUnmatchedWnative,
    txIdx,
    warnings,
    chainId,
  }: {
    fromTopic: Hex;
    toTopic: Hex;
    logs: readonly RawLog[];
    consumedWnativeEventLogs: ReadonlySet<number>;
    shouldPairWnative: boolean;
    shouldWarnOnUnmatchedWnative: (address: Address) => boolean;
    txIdx: number;
    warnings: SimulationWarning[];
    chainId: number;
  },
): number | undefined {
  const sides = [
    ...(toTopic === zeroHash
      ? [{ kind: "burn" as const, accountTopic: fromTopic }]
      : []),
    ...(fromTopic === zeroHash
      ? [{ kind: "mint" as const, accountTopic: toTopic }]
      : []),
  ];
  for (const { kind, accountTopic } of sides) {
    const matches = logs.flatMap((other, otherIndex) =>
      other.topics[0] ===
        (kind === "burn" ? WITHDRAWAL_TOPIC : DEPOSIT_TOPIC) &&
      isAddressEqual(other.address, log.address) &&
      other.data === log.data &&
      other.topics.length === 2 &&
      other.topics[1] === accountTopic
        ? [otherIndex]
        : [],
    );

    if (matches.length === 0) {
      if (shouldPairWnative && shouldWarnOnUnmatchedWnative(log.address)) {
        warnNonCanonicalWnative(warnings, log, kind, { chainId, txIdx });
      }
      continue;
    }

    if (!shouldPairWnative) {
      const token = log.address;
      const data = log.data;
      warnings.push(
        freezeWarning({
          code: "WRAPPED_NATIVE_MIRROR_DETECTED",
          severity: "warn",
          chainId,
          message:
            "kept zero-address wNative Transfer matching a same-call Deposit/Withdrawal; chain is listed as non-mirroring — if this repeats for every wrap/unwrap the wrapper now mirrors and must be removed from the list",
          token,
          kind,
          txIdx,
          data,
        }),
      );
      continue;
    }

    const pairedIndex = matches.find(
      (otherIndex) => !consumedWnativeEventLogs.has(otherIndex),
    );
    if (pairedIndex !== undefined) {
      return pairedIndex;
    }
  }
}

function isTopicHex(value: Hex | undefined): value is Hex {
  return typeof value === "string" && value.length === TOPIC_HEX_LENGTH;
}

function isErc721Transfer(log: RawLog): boolean {
  return (
    log.topics.length === 4 && log.data === "0x" && !(MISSING_LOG_DATA in log)
  );
}

function isUint256Hex(value: Hex | undefined): value is Hex {
  return typeof value === "string" && value.length === UINT256_HEX_LENGTH;
}

// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
function warnMalformed(
  warnings: SimulationWarning[],
  log: RawLog,
  reason: string,
  { chainId, txIdx }: { chainId: number; txIdx: number },
): void {
  warnings.push(
    freezeWarning({
      code: "MALFORMED_TRANSFER_LOG",
      severity: "warn",
      chainId,
      txIdx,
      message: "Skipping malformed log during transfer parsing",
      address: log.address,
      topics: log.topics,
      data: log.data,
      reason,
    }),
  );
}

/** Collect contracts that emit WETH9-shaped events anywhere in the bundle. */
function collectWnativeShapedTokens(
  calls: readonly (readonly RawLog[])[],
): Set<string> {
  const tokens = new Set<string>();
  for (const logs of calls) {
    for (const log of logs) {
      const topic0 = log.topics[0];
      if (topic0 === WITHDRAWAL_TOPIC || topic0 === DEPOSIT_TOPIC) {
        tokens.add(log.address.toLowerCase());
      }
    }
  }
  return tokens;
}

// biome-ignore lint/complexity/useMaxParams: structured warn with full context
function warnNonCanonicalWnative(
  warnings: SimulationWarning[],
  log: RawLog,
  kind: "mint" | "burn",
  { chainId, txIdx }: { chainId: number; txIdx: number },
): void {
  warnings.push(
    freezeWarning({
      code: "WRAPPED_NATIVE_DEDUP_MISS",
      severity: "warn",
      chainId,
      message:
        "WETH9 dedup miss: zero-address Transfer on wnative-shaped token without paired same-tx Deposit/Withdrawal — possible non-canonical wrapped-native, may cause bundler retention false positive",
      token: log.address,
      kind,
      txIdx,
      data: log.data,
    }),
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
    if (a.tokenLc !== b.tokenLc) {
      return a.tokenLc < b.tokenLc ? -1 : 1;
    }
    if (a.fromLc !== b.fromLc) {
      return a.fromLc < b.fromLc ? -1 : 1;
    }
    if (a.toLc !== b.toLc) {
      return a.toLc < b.toLc ? -1 : 1;
    }
    if (a.t.amount < b.t.amount) {
      return -1;
    }
    return a.t.amount > b.t.amount ? 1 : 0;
  });
  return decorated.map((d) => d.t);
}
