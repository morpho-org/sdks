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
