import {
  type Abi,
  type Address,
  type ContractFunctionName,
  type Hash,
  type Hex,
  decodeFunctionData,
  getAddress,
} from "viem";
import type { AnvilTestClient } from "../client";

type OtsTraceNode = {
  type: string;
  depth: number;
  from: string;
  to?: string;
  value?: string;
  input?: string;
  output?: string;
  calls?: OtsTraceNode[];
  children?: OtsTraceNode[];
};

type OtsTraceTransactionSchema = {
  Method: "ots_traceTransaction";
  Parameters: [hash: Hash];
  ReturnType: OtsTraceNode[];
};

/**
 * Get the number of times a specific function was called within a transaction.
 *
 * This helper queries Anvil's `ots_traceTransaction` RPC method to retrieve the
 * call tree for a given transaction and counts how many times the provided
 * contract + function name combination appears in the trace (including internal calls).
 *
 * @template TAbi - The ABI type of the target contract.
 * @template TName - A function name extracted from the ABI. Ensures type-safety:
 *                   only function names that exist in the ABI are allowed.
 *
 * @param client - An Anvil test client capable of making raw JSON-RPC requests.
 * @param params - Object containing the function parameters.
 * @param params.txHash - The transaction hash to analyze.
 * @param params.abi - The ABI of the contract to decode calldata against.
 * @param params.contract - The address of the contract whose function calls to count.
 * @param params.functionName - The function name to check for (type-safe).
 *
 * @returns The number of times the specified function was called during execution
 *          of the given transaction (may be `0` if not called).
 *
 * @example
 * ```ts
 * const count = await getFunctionCallCount(client, {
 *   txHash: "0x1234..." as Hash,
 *   abi: myAbi,
 *   contract: "0xabc..." as Address,
 *   functionName: "foo", // must exist in `myAbi`
 * });
 *
 * expect(count).toBe(1); // assert foo() was called once
 * ```
 */
export async function getFunctionCallCount<
  TAbi extends Abi,
  TName extends ContractFunctionName<TAbi>,
>(
  client: AnvilTestClient,
  {
    txHash,
    abi,
    contract,
    functionName,
  }: {
    txHash: Hash;
    abi: TAbi;
    contract: Address;
    functionName: TName;
  },
) {
  const trace = await client.request<OtsTraceTransactionSchema>({
    method: "ots_traceTransaction",
    params: [txHash],
  });

  const target = getAddress(contract);

  let count = 0;

  const walk = (node: OtsTraceNode | OtsTraceNode[]) => {
    if (Array.isArray(node)) return node.forEach(walk);

    if (node?.to && node?.input) {
      if (getAddress(node.to) === target) {
        try {
          const { functionName: name } = decodeFunctionData({
            abi,
            data: node.input as Hex,
          });
          if (name === functionName) count++;
        } catch {}
      }
    }
    if (Array.isArray(node?.calls)) node.calls.forEach(walk);
    if (node?.children) node.children.forEach(walk);
  };
  walk(trace);

  return count;
}
