import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  type Hex,
  multicall3Abi,
} from "viem";
import { SimulationAssertError, SimulationLogAssertError } from "../errors.js";
import type { Assertion, LogAssertion, RawLog } from "../types.js";
import { formatRevert } from "./backends/decode-revert.js";

const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

/**
 * Inclusive bounds for one of the built-in assertion helpers. Values use that
 * helper's units: token base units, wei, or vault asset units.
 *
 * At least one bound is required; when both are supplied, the observation must
 * be between them, including either endpoint.
 *
 * @example
 * ```ts
 * const bounds: AssertionBounds = { min: 1n, max: 10n };
 * ```
 */
export type AssertionBounds =
  | { readonly min: bigint; readonly max?: bigint }
  | { readonly min?: bigint; readonly max: bigint };

const boundedUintAssertion = (params: {
  readonly to: Address;
  readonly data: Hex;
  readonly decode: (returnData: Hex) => bigint;
  readonly description: string;
  readonly undecodable: string;
  readonly remedy: string;
  readonly min: bigint | undefined;
  readonly max: bigint | undefined;
}): Assertion => ({
  to: params.to,
  data: params.data,
  check: (returnData) => {
    let observed: bigint;
    try {
      observed = params.decode(returnData);
    } catch {
      return `${params.undecodable} "${returnData}".`;
    }
    if (
      (params.min === undefined || observed >= params.min) &&
      (params.max === undefined || observed <= params.max)
    )
      return undefined;

    const expected =
      params.min !== undefined && params.max !== undefined
        ? `between "${params.min}" and "${params.max}"`
        : params.min !== undefined
          ? `at least "${params.min}"`
          : `at most "${params.max}"`;
    return `${params.description} is "${observed}", expected ${expected}. ${params.remedy}`;
  },
});

/**
 * Assert an ERC-20 balance in token base units. Optional `min` and `max` bounds
 * are inclusive; at least one bound is required.
 *
 * @param params.token - ERC-20 token contract to read.
 * @param params.account - Account whose balance is read.
 * @param params.min - Optional inclusive minimum balance, in token base units.
 * @param params.max - Optional inclusive maximum balance, in token base units.
 * @returns An assertion that calls `balanceOf(account)` on `token`.
 * @example
 * ```ts
 * import {
 *   erc20BalanceAssertion,
 *   type SimulationTransaction,
 * } from "@morpho-org/evm-simulation";
 * import { addressesRegistry, ChainId } from "@morpho-org/blue-sdk";
 * import { zeroAddress } from "viem";
 *
 * const transaction: SimulationTransaction = {
 *   from: zeroAddress,
 *   to: zeroAddress,
 *   data: "0x",
 *   assertBefore: [
 *     erc20BalanceAssertion({
 *       token: addressesRegistry[ChainId.EthMainnet].usdc,
 *       account: zeroAddress,
 *       min: 0n,
 *     }),
 *   ],
 * };
 * ```
 */
export function erc20BalanceAssertion(
  params: {
    readonly token: Address;
    readonly account: Address;
  } & AssertionBounds,
): Assertion {
  const { token, account, min, max } = params;
  return boundedUintAssertion({
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
    decode: (returnData) =>
      decodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        data: returnData,
      }),
    description: `ERC-20 balance of account "${account}" in token "${token}"`,
    undecodable: `ERC-20 balance read for account "${account}" in token "${token}" returned undecodable data`,
    remedy: "Fund the account or reduce the amount.",
    min,
    max,
  });
}

/**
 * Assert a native ETH balance in wei. Optional `min` and `max` bounds are
 * inclusive; at least one bound is required.
 *
 * This reads through `getEthBalance(account)` at Multicall3's standard address.
 * Chains without Multicall3 there return data that cannot be decoded by the
 * check, which becomes an assertion failure.
 *
 * @param params.account - Account whose native balance is read.
 * @param params.min - Optional inclusive minimum balance, in wei.
 * @param params.max - Optional inclusive maximum balance, in wei.
 * @returns An assertion that calls Multicall3 `getEthBalance(account)`.
 * @example
 * ```ts
 * import {
 *   nativeBalanceAssertion,
 *   type SimulationTransaction,
 * } from "@morpho-org/evm-simulation";
 * import { zeroAddress } from "viem";
 *
 * const transaction: SimulationTransaction = {
 *   from: zeroAddress,
 *   to: zeroAddress,
 *   data: "0x",
 *   assertAfter: [
 *     nativeBalanceAssertion({ account: zeroAddress, min: 0n }),
 *   ],
 * };
 * ```
 */
export function nativeBalanceAssertion(
  params: { readonly account: Address } & AssertionBounds,
): Assertion {
  const { account, min, max } = params;
  return boundedUintAssertion({
    to: MULTICALL3_ADDRESS,
    data: encodeFunctionData({
      abi: multicall3Abi,
      functionName: "getEthBalance",
      args: [account],
    }),
    decode: (returnData) =>
      decodeFunctionResult({
        abi: multicall3Abi,
        functionName: "getEthBalance",
        data: returnData,
      }),
    description: `Native balance of account "${account}"`,
    undecodable: `Native balance read for account "${account}" returned undecodable data`,
    remedy: "Fund the account or reduce the amount.",
    min,
    max,
  });
}

/**
 * Assert an ERC-4626 vault `maxDeposit` in vault asset units. Optional `min`
 * and `max` bounds are inclusive; at least one bound is required. Morpho Vault
 * V2's `maxDeposit` is `pure` and always returns 0, so a `min > 0` always fails
 * there; this helper is meaningful for Vault V1/MetaMorpho.
 *
 * @param params.vault - ERC-4626 vault contract to read.
 * @param params.receiver - Receiver passed to `maxDeposit`.
 * @param params.min - Optional inclusive minimum, in vault asset units.
 * @param params.max - Optional inclusive maximum, in vault asset units.
 * @returns An assertion that calls `maxDeposit(receiver)` on `vault`.
 * @example
 * ```ts
 * import {
 *   maxDepositAssertion,
 *   type SimulationTransaction,
 * } from "@morpho-org/evm-simulation";
 * import { vaults } from "@morpho-org/morpho-test";
 * import { zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const transaction: SimulationTransaction = {
 *   from: zeroAddress,
 *   to: zeroAddress,
 *   data: "0x",
 *   assertBefore: [
 *     maxDepositAssertion({
 *       vault: vaults[mainnet.id].steakUsdc.address,
 *       receiver: zeroAddress,
 *       min: 0n,
 *     }),
 *   ],
 * };
 * ```
 */
export function maxDepositAssertion(
  params: {
    readonly vault: Address;
    readonly receiver: Address;
  } & AssertionBounds,
): Assertion {
  const { vault, receiver, min, max } = params;
  return boundedUintAssertion({
    to: vault,
    data: encodeFunctionData({
      abi: erc4626Abi,
      functionName: "maxDeposit",
      args: [receiver],
    }),
    decode: (returnData) =>
      decodeFunctionResult({
        abi: erc4626Abi,
        functionName: "maxDeposit",
        data: returnData,
      }),
    description: `Maximum deposit for receiver "${receiver}" in vault "${vault}"`,
    undecodable: `maxDeposit read for receiver "${receiver}" in vault "${vault}" returned undecodable data`,
    remedy: "Reduce the deposit or pick another vault.",
    min,
    max,
  });
}

/**
 * Evaluate a caller check using its in-block call result.
 *
 * @param params - Assertion, raw read result and transaction coordinates.
 * @returns Nothing when the check returns `undefined`.
 * @throws {SimulationAssertError} When the read reverts, the check returns a
 *   failure message, or the check throws; it carries the transaction index,
 *   phase, assertion index, a copy of the caller's assertion (`to`, `data`,
 *   and `check`), and return data. A thrown check error is retained as the
 *   error's cause.
 * @internal
 */
export function evaluateAssertion(params: {
  readonly assertion: Assertion;
  readonly returnData: Hex;
  readonly status: boolean;
  readonly revertData: Hex;
  readonly cause: unknown;
  readonly transactionIndex: number;
  readonly phase: "before" | "after";
  readonly assertionIndex: number;
}): void {
  const {
    assertion,
    returnData,
    status,
    revertData,
    cause,
    transactionIndex,
    phase,
    assertionIndex,
  } = params;
  const assertionLocation = `Transaction ${transactionIndex} assert${phase === "before" ? "Before" : "After"}[${assertionIndex}]`;
  if (!status) {
    const message = formatRevert(revertData) ?? "Revert reason unavailable";
    throw new SimulationAssertError(
      `${assertionLocation} read reverted: ${message}.`,
      {
        transactionIndex,
        phase,
        assertionIndex,
        assertion,
        returnData: revertData,
      },
      { cause },
    );
  }

  let failure: string | undefined;
  try {
    failure = assertion.check(returnData);
  } catch (error) {
    throw new SimulationAssertError(
      `${assertionLocation} check threw: ${error instanceof Error ? error.message : String(error)}`,
      {
        transactionIndex,
        phase,
        assertionIndex,
        assertion,
        returnData,
      },
      { cause: error },
    );
  }
  if (failure === undefined) return;
  throw new SimulationAssertError(
    `${assertionLocation} failed ${phase} execution: ${failure}`,
    {
      transactionIndex,
      phase,
      assertionIndex,
      assertion,
      returnData,
    },
  );
}

/**
 * Evaluate a caller-supplied assertion over one transaction's frozen,
 * lowercase log copy.
 *
 * @param params - Assertion, emitted logs, and transaction coordinates.
 * @throws {SimulationLogAssertError} When the check returns a failure message
 *   or throws; the error carries the transaction index, assertion index, a
 *   copy of the assertion, and the lowercase logs passed to the check. A thrown
 *   check error is retained as the error's cause.
 * @internal
 */
export function evaluateLogAssertion(params: {
  readonly assertion: LogAssertion;
  readonly logs: readonly RawLog[];
  readonly transactionIndex: number;
  readonly assertionIndex: number;
}): void {
  const { assertion, logs, transactionIndex, assertionIndex } = params;
  const assertionLocation = `Transaction ${transactionIndex} assertLogs[${assertionIndex}]`;
  let failure: string | undefined;
  try {
    failure = assertion.check(logs);
  } catch (error) {
    throw new SimulationLogAssertError(
      `${assertionLocation} check threw: ${error instanceof Error ? error.message : String(error)}`,
      {
        transactionIndex,
        assertionIndex,
        assertion,
        logs,
      },
      { cause: error },
    );
  }
  if (failure === undefined) return;
  throw new SimulationLogAssertError(
    `${assertionLocation} failed: ${failure}`,
    {
      transactionIndex,
      assertionIndex,
      assertion,
      logs,
    },
  );
}
