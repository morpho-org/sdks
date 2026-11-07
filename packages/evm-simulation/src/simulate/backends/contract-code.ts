import { type Address, type Client, getAddress } from "viem";
import { getBytecode } from "viem/actions";
import { RpcTransportError, SimulationValidationError } from "../../errors.js";
import type { SimulationStateOverrides } from "../../params.js";
import type { ParsedTransaction } from "../request/parse-request.js";
import { rpc } from "./eth-simulate-v1.js";

/**
 * Stage between block pinning and `eth_simulateV1`: every distinct transaction
 * target carrying calldata must hold contract code at the pinned state block,
 * or in its explicit caller code override. EIP-7702 delegation requires the
 * delegate to hold code too, from its override or the pinned state block.
 *
 * A call to a code-less address succeeds on-chain as a no-op, so a missing
 * contract must fail non-bypassably before execution instead of producing a
 * `SimulationResult`. Value-only transfers to an EOA (empty calldata) stay
 * allowed — they are legitimate native transfers.
 *
 * Without an explicit code override, a `to` deployed by an earlier transaction
 * in the same simulated batch has no code at the state block and is rejected;
 * the pipeline does not model in-bundle contract creations.
 *
 * @param params - Check parameters.
 * @param params.client - Shared simulation client (created by `createSimulationClient`).
 * @param params.transactions - Parsed caller transactions, in execution order.
 * @param params.chainId - Request chain id, named in the validation error.
 * @param params.blockNumber - Pinned state block the `eth_getCode` reads run at.
 * @param params.stateOverrides - Caller code overrides, checked instead of onchain code when present.
 * @returns Nothing when every calldata target and its EIP-7702 delegate hold code.
 * @throws {SimulationValidationError} when a transaction with calldata targets
 *   a code-less address or EIP-7702 delegate, in overrides or at the pinned block;
 *   `fieldErrors` names each offending `transactions[i].to`.
 * @throws {RpcTransportError} when an `eth_getCode` read fails.
 * @throws {InvalidSimulationResponseError} when an `eth_getCode` reply has a
 *   2xx status and a body that is not JSON or is the JSON value `null`. Other
 *   JSON bodies without an RPC result are treated as no code, so a calldata
 *   target fails with `SimulationValidationError`.
 * @internal
 */
export async function assertTransactionTargetsHaveCode(params: {
  readonly client: Client;
  readonly transactions: readonly ParsedTransaction[];
  readonly chainId: number;
  readonly blockNumber: bigint;
  readonly stateOverrides?: SimulationStateOverrides;
}): Promise<void> {
  const { client, transactions, chainId, blockNumber, stateOverrides } = params;
  const overrides = new Map(
    Object.entries(stateOverrides ?? {}).map(([address, account]) => [
      address.toLowerCase(),
      account,
    ]),
  );
  const checked = new Map<Address, Promise<`0x${string}` | undefined>>();
  // Start every distinct target's read up front so the RPCs run concurrently.
  for (const transaction of transactions) {
    if (transaction.data === "0x" || checked.has(transaction.to)) continue;
    const code = overrides.get(transaction.to.toLowerCase())?.code;
    checked.set(
      transaction.to,
      (code !== undefined
        ? Promise.resolve(code)
        : rpc("eth_getCode", () =>
            getBytecode(client, {
              address: transaction.to,
              blockNumber,
            }),
          )
      ).then((resolvedCode) => {
        if (
          resolvedCode === undefined ||
          !/^0xef0100[0-9a-f]{40}$/i.test(resolvedCode)
        )
          return resolvedCode;
        // EIP-7702 follows one delegation; a code-less delegate is still a no-op.
        const delegate = getAddress(`0x${resolvedCode.slice(8)}`);
        const delegateCode = overrides.get(delegate.toLowerCase())?.code;
        return delegateCode !== undefined
          ? delegateCode
          : rpc("eth_getCode", () =>
              getBytecode(client, { address: delegate, blockNumber }),
            );
      }),
    );
  }
  // Settle every read before walking transactions: a fast rejection must not
  // leave a slower sibling's promise unobserved (unhandled rejection), and the
  // surfaced error stays in transaction order among RPC transport failures.
  const outcomes = new Map<
    Address,
    PromiseSettledResult<`0x${string}` | undefined>
  >();
  {
    const keys = [...checked.keys()];
    const settled = await Promise.allSettled([...checked.values()]);
    settled.forEach((outcome, index) => outcomes.set(keys[index]!, outcome));
  }
  const fieldErrors: string[] = [];
  let firstRejection:
    | (PromiseSettledResult<`0x${string}` | undefined> & {
        status: "rejected";
      })
    | undefined;
  for (const [index, transaction] of transactions.entries()) {
    if (transaction.data === "0x") continue;
    const outcome = outcomes.get(transaction.to);
    if (outcome === undefined) continue;
    if (outcome.status === "rejected") {
      // A non-RPC failure must not hide behind a sibling's RPC outage.
      if (
        firstRejection === undefined ||
        (firstRejection.reason instanceof RpcTransportError &&
          !(outcome.reason instanceof RpcTransportError))
      )
        firstRejection = outcome;
      continue;
    }
    const bytecode = outcome.value;
    if (bytecode == null || bytecode.length <= 2) {
      fieldErrors.push(
        `transactions[${index}].to: no contract code at ${transaction.to}`,
      );
    }
  }
  // A confirmed empty target wins over a failed read: the deterministic
  // validation error carries the same wrong-chain signal a probe upgrades,
  // whereas a flaky getCode would mask it as an external failure.
  if (fieldErrors.length > 0) {
    throw new SimulationValidationError(
      `Transaction targets with calldata must hold contract code at the state block: ${fieldErrors.join("; ")}. Check the transaction list and that the endpoint serves chain ${chainId}.`,
      fieldErrors,
    );
  }
  if (firstRejection !== undefined) throw firstRejection.reason;
}
