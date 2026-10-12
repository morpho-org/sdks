import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  ethAddress,
  type Hex,
  multicall3Abi,
} from "viem";
import {
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
  type SimulationAssertionContext,
  SimulationRevertedError,
} from "../errors.js";
import type { SimulationMode } from "../params.js";
import type { Assertion } from "../types.js";

const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

/**
 * Encode the view call for one caller-supplied transaction assertion.
 *
 * Chains without Multicall3 at its standard address return empty data for
 * `nativeBalance`, which is reported as `MissingVerificationEvidenceError`.
 *
 * @param assertion - Assertion whose value is observed.
 * @returns Contract address and calldata for the assertion read.
 * @internal
 */
export function encodeAssertion(assertion: Assertion): {
  readonly to: Address;
  readonly data: Hex;
} {
  switch (assertion.type) {
    case "erc20Balance":
      return {
        to: assertion.token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [assertion.account],
        }),
      };
    case "nativeBalance":
      return {
        to: MULTICALL3_ADDRESS,
        data: encodeFunctionData({
          abi: multicall3Abi,
          functionName: "getEthBalance",
          args: [assertion.account],
        }),
      };
    case "maxDeposit":
      return {
        to: assertion.vault,
        data: encodeFunctionData({
          abi: erc4626Abi,
          functionName: "maxDeposit",
          args: [assertion.receiver],
        }),
      };
    default: {
      const _exhaustive: never = assertion;
      return _exhaustive;
    }
  }
}

/**
 * Decode and enforce a transaction assertion using its in-block call result.
 *
 * @param params - Assertion, raw read result and request coordinates.
 * @returns Nothing when the observed value meets the minimum.
 * @throws {MissingVerificationEvidenceError} When the read reverted or returned
 *   empty data.
 * @throws {InvalidSimulationResponseError} When non-empty return data cannot
 *   be decoded.
 * @throws {SimulationRevertedError} When the observation is below the minimum.
 * @internal
 */
export function evaluateAssertion(params: {
  readonly assertion: Assertion;
  readonly returnData: Hex;
  readonly status: boolean;
  readonly transactionIndex: number;
  readonly phase: "before" | "after";
  readonly assertionIndex: number;
  readonly chainId: number;
  readonly mode: SimulationMode;
  readonly blockNumber: bigint;
}): void {
  const {
    assertion,
    returnData,
    status,
    transactionIndex,
    phase,
    assertionIndex,
    chainId,
    mode,
    blockNumber,
  } = params;
  const field = `transactions[${transactionIndex}].assert${phase === "before" ? "Before" : "After"}[${assertionIndex}]`;

  if (!status || returnData === "0x") {
    throw new MissingVerificationEvidenceError(
      `Cannot observe transaction assertion "${field}": its simulated read ${status ? "returned no data" : "reverted"}.`,
      {
        context: {
          stage: "verification",
          chainId,
          mode,
          blockNumber,
          field,
        },
      },
    );
  }

  let observed: bigint;
  try {
    switch (assertion.type) {
      case "erc20Balance":
        observed = decodeFunctionResult({
          abi: erc20Abi,
          functionName: "balanceOf",
          data: returnData,
        });
        break;
      case "nativeBalance":
        observed = decodeFunctionResult({
          abi: multicall3Abi,
          functionName: "getEthBalance",
          data: returnData,
        });
        break;
      case "maxDeposit":
        observed = decodeFunctionResult({
          abi: erc4626Abi,
          functionName: "maxDeposit",
          data: returnData,
        });
        break;
    }
  } catch (cause) {
    throw new InvalidSimulationResponseError(
      `Cannot decode transaction assertion "${field}". Check the selected contract and RPC response.`,
      { cause },
    );
  }

  if (observed >= assertion.min) return;

  let description: string;
  let remedy: string;
  let reasonCode: "INSUFFICIENT_BALANCE" | "CAP_EXCEEDED";
  let context: SimulationAssertionContext;
  switch (assertion.type) {
    case "erc20Balance":
      description = `an ERC-20 balance for account "${assertion.account}" in token "${assertion.token}"`;
      remedy = "Fund the account or reduce the amount.";
      reasonCode = "INSUFFICIENT_BALANCE";
      context = {
        stage: "execution",
        chainId,
        mode,
        blockNumber,
        transactionIndex,
        phase,
        assertionIndex,
        assertion: assertion.type,
        account: assertion.account,
        token: assertion.token,
        expected: assertion.min,
        observed,
      };
      break;
    case "nativeBalance":
      description = `a native balance for account "${assertion.account}"`;
      remedy = "Fund the account or reduce the amount.";
      reasonCode = "INSUFFICIENT_BALANCE";
      context = {
        stage: "execution",
        chainId,
        mode,
        blockNumber,
        transactionIndex,
        phase,
        assertionIndex,
        assertion: assertion.type,
        account: assertion.account,
        token: ethAddress,
        expected: assertion.min,
        observed,
      };
      break;
    case "maxDeposit":
      description = `a maximum deposit for receiver "${assertion.receiver}" in vault "${assertion.vault}"`;
      remedy = "Reduce the deposit or pick another vault.";
      reasonCode = "CAP_EXCEEDED";
      context = {
        stage: "execution",
        chainId,
        mode,
        blockNumber,
        transactionIndex,
        phase,
        assertionIndex,
        assertion: assertion.type,
        account: assertion.receiver,
        vault: assertion.vault,
        expected: assertion.min,
        observed,
      };
      break;
  }
  throw new SimulationRevertedError(
    `Transaction ${transactionIndex} expects ${description} of at least "${assertion.min}" ${phase} execution, got "${observed}". ${remedy}`,
    undefined,
    reasonCode,
    context,
  );
}
