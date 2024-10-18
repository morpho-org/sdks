import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import "colors";
import { writeFile } from "node:fs/promises";
import { grey, red, yellow } from "colors";
import {
  type Address,
  type BlockTag,
  type Client,
  type ExactPartial,
  type Hex,
  type RpcTransactionRequest,
  decodeFunctionData,
  isAddress,
  parseAbi,
  slice,
} from "viem";

export type TraceCallRpcSchema = {
  Method: "debug_traceCall";
  Parameters:
    | [ExactPartial<RpcTransactionRequest>, Hex | BlockTag]
    | [
        ExactPartial<RpcTransactionRequest>,
        BlockTag | Hex,
        {
          tracer: "callTracer" | "prestateTracer";
          tracerConfig?: { onlyTopCall?: boolean };
        },
      ];
  ReturnType: RpcCallTrace;
};

export const signaturesPath = join(
  homedir(),
  ".foundry",
  "cache",
  "signatures",
);

export const signatures: {
  events: Record<Hex, string>;
  functions: Record<Hex, string>;
} = existsSync(signaturesPath)
  ? JSON.parse(readFileSync(signaturesPath, { encoding: "utf8" }))
  : { events: {}, functions: {} };

export type RpcCallType =
  | "CALL"
  | "STATICCALL"
  | "DELEGATECALL"
  | "CREATE"
  | "CREATE2"
  | "SELFDESTRUCT"
  | "CALLCODE";

export type RpcCallTrace = {
  from: Address;
  gas: Hex;
  gasUsed: Hex;
  to: Address;
  input: Hex;
  output: Hex;
  error?: string;
  revertReason?: string;
  calls?: RpcCallTrace[];
  value: Hex;
  type: RpcCallType;
};

export const getSelector = (input: Hex) => slice(input, 0, 4);

export const getCallTraceUnknownSelectors = (trace: RpcCallTrace): string => {
  const rest = (trace.calls ?? [])
    .flatMap((subtrace) => getCallTraceUnknownSelectors(subtrace))
    .filter(Boolean)
    .join(",");

  if (!trace.input) return rest;

  const selector = getSelector(trace.input);

  if (signatures.functions[selector]) return rest;

  if (!rest) return selector;

  return `${selector},${rest}`;
};

export const getIndentLevel = (level: number, index = false) =>
  `${"  ".repeat(level - 1)}${index ? `${level - 1} ↳ `.cyan : "    "}`;

export const formatAddress = (address: Address) =>
  `${address.slice(0, 6)}...${address.slice(0, 4)}`;

export const formatArg = (arg: unknown, level: number): string => {
  if (Array.isArray(arg)) {
    const formattedArr = arg
      .map(
        (arg) => `\n${getIndentLevel(level + 1)}${formatArg(arg, level + 1)},`,
      )
      .join("");

    return `[${formattedArr ? `${formattedArr}\n` : ""}${getIndentLevel(level)}]`;
  }

  switch (typeof arg) {
    case "object": {
      if (arg == null) return "";

      const formattedObj = Object.entries(arg)
        .map(
          ([key, value]) =>
            `\n${getIndentLevel(level + 1)}${key}: ${formatArg(value, level + 1)},`,
        )
        .join("");

      return `{${formattedObj ? `${formattedObj}\n` : ""}${getIndentLevel(level)}}`;
    }
    case "string":
      return isAddress(arg, { strict: false }) ? formatAddress(arg) : arg;
    default:
      return String(arg);
  }
};

export const formatCallSignature = (trace: RpcCallTrace, level: number) => {
  const selector = getSelector(trace.input);

  const signature = signatures.functions[selector];
  if (!signature) return trace.input;

  const { functionName, args } = decodeFunctionData({
    abi: parseAbi(
      // @ts-ignore
      [`function ${signature}`],
    ),
    data: trace.input,
  });

  const formattedArgs = args?.map((arg) => formatArg(arg, level)).join(", ");

  return `${(trace.error ? red : yellow)(functionName).bold}(${(formattedArgs ?? "").grey})`;
};

export const formatCallTrace = (trace: RpcCallTrace, level = 1): string => {
  const rest = (trace.calls ?? [])
    .map((subtrace) => formatCallTrace(subtrace, level + 1))
    .join("\n");

  const returnValue = trace.revertReason ?? trace.output;

  return `${level === 1 ? `${getIndentLevel(level, true)}FROM ${trace.from.grey}\n`.cyan : ""}${getIndentLevel(level, true)}${trace.type.yellow} ${trace.from === trace.to ? ("self").grey : `(${trace.to.white})`}.${formatCallSignature(trace, level)}${returnValue ? (trace.error ? red : grey)(` -> ${returnValue}`) : ""}
${rest}`;
};

export async function trace(
  client: Client,
  tx: ExactPartial<RpcTransactionRequest>,
  block: Hex | BlockTag = "latest",
) {
  const trace = await client.request<TraceCallRpcSchema>(
    {
      method: "debug_traceCall",
      params: [tx, block, { tracer: "callTracer" }],
    },
    { retryCount: 0 },
  );

  const unknownSelectors = getCallTraceUnknownSelectors(trace);

  if (unknownSelectors) {
    const lookupRes = await fetch(
      `https://api.openchain.xyz/signature-database/v1/lookup?filter=false&function=${unknownSelectors}`,
    );

    const lookup = await lookupRes.json();

    if (lookup.ok) {
      Object.entries<{ name: string; filtered: boolean }[]>(
        lookup.result.function,
      ).map(([sig, results]) => {
        const match = results.find(({ filtered }) => !filtered)?.name;
        if (!match) return;

        signatures.functions[sig as Hex] = match;
      });

      writeFile(signaturesPath, JSON.stringify(signatures)); // Non blocking.
    } else {
      console.warn(
        `Failed to fetch signatures for unknown selectors: ${unknownSelectors}`,
        lookup.error,
      );
    }
  }

  return formatCallTrace(trace);
}
