import { erc2612Abi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  type Hex,
} from "viem";
import { InvalidSimulationResponseError } from "../../errors.js";
import type {
  SequentialNonceChange,
  TokenAllowance,
  TokenBalance,
} from "../../result.js";
import type { DecodedStateRead, StateRead } from "./contract.js";

/** ERC-20 subjects to observe: balances, allowances and ERC-2612 nonces. @internal */
export interface Erc20Subjects {
  readonly balances: readonly {
    readonly token: Address;
    readonly account: Address;
  }[];
  readonly allowances: readonly {
    readonly token: Address;
    readonly owner: Address;
    readonly spender: Address;
  }[];
  readonly nonces: readonly {
    readonly token: Address;
    readonly owner: Address;
  }[];
}

/**
 * Encode `balanceOf`/`allowance`/`nonces` view calls for the given subjects.
 * @internal
 */
export function erc20Reads(subjects: Erc20Subjects): StateRead[] {
  const reads: StateRead[] = [];
  for (const { token, account } of subjects.balances) {
    reads.push({
      kind: "erc20.balance",
      id: `erc20.balance:${token}:${account}`,
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
      token,
      account,
    });
  }
  for (const { token, owner, spender } of subjects.allowances) {
    reads.push({
      kind: "erc20.allowance",
      id: `erc20.allowance:${token}:${owner}:${spender}`,
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      }),
      token,
      owner,
      spender,
    });
  }
  for (const { token, owner } of subjects.nonces) {
    reads.push({
      kind: "erc2612.nonce",
      id: `erc2612.nonce:${token}:${owner}`,
      to: token,
      data: encodeFunctionData({
        abi: erc2612Abi,
        functionName: "nonces",
        args: [owner],
      }),
      token,
      owner,
    });
  }
  return reads;
}

/**
 * Decode ERC-20 reads into the balances/allowances/nonces slices of
 * `SimulationState`. Throws when a read failed or its return data does not
 * decode.
 * @internal
 */
export function parseErc20(reads: readonly DecodedStateRead[]): {
  readonly balances: TokenBalance[];
  readonly allowances: TokenAllowance[];
  readonly nonces: SequentialNonceChange[];
} {
  const balances: TokenBalance[] = [];
  const allowances: TokenAllowance[] = [];
  const nonces: SequentialNonceChange[] = [];
  for (const { read, value } of reads) {
    switch (read.kind) {
      case "erc20.balance":
        if (typeof value !== "bigint") throw badRead(read.id);
        balances.push({
          token: read.token,
          account: read.account,
          assets: value,
        });
        break;
      case "erc20.allowance":
        if (typeof value !== "bigint") throw badRead(read.id);
        allowances.push({
          token: read.token,
          owner: read.owner,
          spender: read.spender,
          amount: value,
        });
        break;
      case "erc2612.nonce":
        if (typeof value !== "bigint") throw badRead(read.id);
        nonces.push({
          type: "erc2612",
          verifyingContract: read.token,
          owner: read.owner,
          before: value,
          after: value,
        });
        break;
      default:
        break;
    }
  }
  return { balances, allowances, nonces };
}

/**
 * Decode an ERC-20/permit-family read's return data. Centralised here so
 * `read-state.parse` stays a thin dispatcher.
 * @internal
 */
export function decodeErc20Value(read: StateRead, data: Hex): bigint {
  try {
    switch (read.kind) {
      case "erc20.balance":
        return decodeFunctionResult({
          abi: erc20Abi,
          functionName: "balanceOf",
          data,
        });
      case "erc20.allowance":
        return decodeFunctionResult({
          abi: erc20Abi,
          functionName: "allowance",
          data,
        });
      case "erc2612.nonce":
        return decodeFunctionResult({
          abi: erc2612Abi,
          functionName: "nonces",
          data,
        });
      default:
        throw new InvalidSimulationResponseError(
          `State read "${read.id}" is not an ERC-20 read`,
        );
    }
  } catch (error) {
    if (error instanceof InvalidSimulationResponseError) throw error;
    return badRead(read.id, error);
  }
}

/** Throw a response error for a failed or undecodable read. @internal */
export function badRead(id: string, cause?: unknown): never {
  throw new InvalidSimulationResponseError(
    `State read "${id}" failed or returned undecodable data`,
    { cause },
  );
}
