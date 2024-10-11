import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import "colors";
import { red, yellow } from "colors";
import {
  type Address,
  type Hex,
  decodeFunctionData,
  isAddress,
  parseAbi,
  slice,
} from "viem";

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
    .join(",");

  if (!trace.input) return rest;

  const selector = getSelector(trace.input);

  if (signatures.functions[selector]) return rest;

  if (!rest) return selector;

  return `${selector},${rest}`;
};

export const getIndentLevel = (level: number) => "  ".repeat(level);

export const formatAddress = (address: Address) =>
  `${address.slice(0, 6)}...${address.slice(0, 4)}`;

export const formatArg = (arg: unknown, level: number): string => {
  if (Array.isArray(arg)) {
    const formattedArr = arg
      .map((arg) => `\n${getIndentLevel(level + 1)}${formatArg(arg, level)},`)
      .join("");

    return `[${formattedArr ? `${formattedArr}\n` : ""}${getIndentLevel(level)}]`;
  }

  switch (typeof arg) {
    case "object": {
      if (arg == null) return "";

      const formattedObj = Object.entries(arg)
        .map(
          ([key, value]) =>
            `\n${getIndentLevel(level)}${key}: ${formatArg(value, level)},`,
        )
        .join("");

      return `{${formattedObj ? `${formattedObj}\n` : ""}${getIndentLevel(level - 1)}}`;
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

  const error = trace.revertReason ?? trace.output;

  return `${level === 1 ? `FROM ${trace.from.grey}\n` : ""}${getIndentLevel(level)}${trace.type.yellow} ${trace.from === trace.to ? ("self").grey : `(${trace.to.white})`}.${formatCallSignature(trace, level)}${error ? ` -> ${error}`.red : ""}
${rest}`;
};
