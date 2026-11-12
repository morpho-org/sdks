import {
  type Abi,
  type AbiStateMutability,
  type Address,
  type Client,
  type ContractFunctionArgs,
  type ContractFunctionName,
  decodeFunctionData,
  getAddress,
  type Hash,
  type Hex,
} from "viem";

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

export type GetFunctionCallsArgs<
  TAbi extends Abi,
  TName extends ContractFunctionName<TAbi>,
> = {
  txHash: Hash;
  abi: TAbi;
  contract: Address;
  functionName: TName;
};

export type FunctionCall<
  TAbi extends Abi,
  TName extends ContractFunctionName<TAbi>,
> = {
  args: ContractFunctionArgs<TAbi, AbiStateMutability, TName>;
  functionName: TName;
};

/**
 * Gets the decoded calls to a specific function within a transaction.
 *
 * This helper queries Anvil's `ots_traceTransaction` RPC method to retrieve the
 * call tree for a given transaction and returns matching calls to the provided
 * contract and function name, including internal calls.
 *
 * @template TAbi - The ABI type of the target contract.
 * @template TName - A function name extracted from the ABI. Ensures type-safety:
 *                   only function names that exist in the ABI are allowed.
 *
 * @param client - An Anvil test client capable of making raw JSON-RPC requests.
 * @param params - Object containing the function parameters.
 * @param params.txHash - The transaction hash to analyze.
 * @param params.abi - The ABI of the contract to decode calldata against.
 * @param params.contract - The address of the contract whose function calls to decode.
 * @param params.functionName - The function name to check for (type-safe).
 *
 * @returns An array of decoded calls containing `functionName` and `args`,
 * or an empty array if no matching calls were found.
 *
 * @example
 * ```ts
 * import { getFunctionCalls } from "@morpho-org/test";
 * import { erc20Abi } from "viem";
 *
 * const calls = await getFunctionCalls(client, {
 *   txHash: "0x1234..." as Hash,
 *   abi: erc20Abi,
 *   contract: "0xabc..." as Address,
 *   functionName: "transfer",
 * });
 *
 * expect(calls.length).toBe(1); // assert transfer() was called once
 * ```
 */
export async function getFunctionCalls<
  TAbi extends Abi,
  TName extends ContractFunctionName<TAbi>,
>(
  client: Client,
  { txHash, abi, contract, functionName }: GetFunctionCallsArgs<TAbi, TName>,
) {
  const trace = await client.request<OtsTraceTransactionSchema>({
    method: "ots_traceTransaction",
    params: [txHash],
  });

  const target = getAddress(contract);

  const calls: FunctionCall<TAbi, TName>[] = [];

  const walk = (node: OtsTraceNode | OtsTraceNode[]) => {
    if (Array.isArray(node)) return node.forEach(walk);

    if (node?.to && node?.input) {
      if (getAddress(node.to) === target) {
        try {
          const call = decodeFunctionData({
            abi,
            data: node.input as Hex,
          });
          if (call.functionName === functionName)
            calls.push(
              call as {
                args: ContractFunctionArgs<TAbi, AbiStateMutability, TName>;
                functionName: TName;
              },
            );
        } catch {}
      }
    }
    if (Array.isArray(node?.calls)) node.calls.forEach(walk);
    if (node?.children) node.children.forEach(walk);
  };
  walk(trace);

  return calls;
}
