import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { bold, grey, red, yellow } from "colors";
import {
  type Abi,
  type Address,
  type BlockTag,
  type Client,
  type DeployContractParameters,
  type ExactPartial,
  type HDAccount,
  type Hex,
  type HttpTransport,
  type PublicActions,
  type RpcTransactionRequest,
  type SendRawTransactionParameters,
  type SendTransactionParameters,
  type SendTransactionRequest,
  type TestActions,
  type TestRpcSchema,
  type UnionPartialBy,
  type WaitForTransactionReceiptReturnType,
  type WalletActions,
  type WriteContractParameters,
  type WriteContractReturnType,
  createTestClient,
  decodeFunctionData,
  erc20Abi,
  parseAbi,
  publicActions,
  rpcSchema,
  slice,
  walletActions,
} from "viem";
import { type DealActions, dealActions } from "viem-deal";
import { parseAccount } from "viem/accounts";
import { sendRawTransaction } from "viem/actions";
import type { Chain } from "viem/chains";
import { testAccount } from "./fixtures.js";

const cachePath = join(homedir(), ".foundry", "cache", "signatures");
const cache: {
  events: Record<Hex, string>;
  functions: Record<Hex, string>;
} = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, { encoding: "utf8" }))
  : { events: {}, functions: {} };

export type AnvilTestClient<chain extends Chain = Chain> = Client<
  HttpTransport,
  chain,
  HDAccount,
  TestRpcSchema<"anvil">,
  TestActions &
    DealActions &
    PublicActions<HttpTransport, chain, HDAccount> &
    WalletActions<chain, HDAccount> & {
      timestamp(): Promise<bigint>;
      approve(args: ApproveParameters<chain>): Promise<WriteContractReturnType>;
      balanceOf(args: { erc20?: Address; address?: Address }): Promise<bigint>;
      deployContractWait<const abi extends Abi | readonly unknown[]>(
        args: DeployContractParameters<abi, chain, HDAccount>,
      ): Promise<
        WaitForTransactionReceiptReturnType<chain> & {
          contractAddress: Address;
        }
      >;
    }
>;

export type ApproveParameters<
  chain extends Chain,
  chainOverride extends Chain | undefined = undefined,
> = UnionPartialBy<
  WriteContractParameters<
    typeof erc20Abi,
    "approve",
    [Address, bigint],
    chain,
    HDAccount,
    chainOverride
  >,
  "abi" | "functionName"
>;

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

export const getCallTraceUnknownSigs = (trace: RpcCallTrace): string => {
  const rest = (trace.calls ?? [])
    .flatMap((subtrace) => getCallTraceUnknownSigs(subtrace))
    .join(",");

  if (!trace.input) return rest;

  const sig = slice(trace.input, 0, 4);

  if (cache.functions[sig]) return rest;

  if (!rest) return sig;

  return `${sig},${rest}`;
};

export const formatCallSignature = (
  trace: RpcCallTrace,
  lookup: Record<Hex, string | undefined>,
) => {
  const sig = slice(trace.input, 0, 4);

  if (!lookup[sig]) return trace.input;

  const { functionName, args } = decodeFunctionData({
    abi: parseAbi(
      // @ts-ignore
      [`function ${lookup[sig]}`],
    ),
    data: trace.input,
  });

  return `${bold(functionName)}(${grey(args?.join(", ") ?? "")})`;
};

export const formatCallTrace = (
  trace: RpcCallTrace,
  lookup: Record<Hex, string | undefined>,
  level = 0,
): string => {
  const rest = (trace.calls ?? [])
    .map((subtrace) => formatCallTrace(subtrace, lookup, level + 1))
    .join("\n");

  const error = trace.revertReason ?? trace.error;

  return `${level === 0 ? `FROM ${grey(trace.from)}\n` : ""}${"  ".repeat(level)}[${yellow(trace.type)}] ${trace.from === trace.to ? grey("self") : `(${trace.to})`}.${formatCallSignature(trace, lookup)}${error ? red(` -> ${error}`) : ""}
${rest}`;
};

export const createAnvilTestClient = <chain extends Chain>(
  transport: HttpTransport,
  chain: chain,
): AnvilTestClient<chain> =>
  createTestClient({
    chain,
    mode: "anvil",
    account: testAccount(),
    transport,
    rpcSchema:
      rpcSchema<
        [
          {
            Method: "debug_traceCall";
            Parameters: [
              ExactPartial<RpcTransactionRequest>,
              BlockTag | Hex,
              {
                tracer: "callTracer" | "prestateTracer";
                tracerConfig: { onlyTopCall: boolean };
              },
            ];
            ReturnType: RpcCallTrace;
          },
        ]
      >(),
  })
    .extend(dealActions)
    .extend(publicActions)
    .extend(walletActions)
    .extend((client) => {
      let automine: boolean;

      return {
        async timestamp() {
          const latestBlock = await client.getBlock();

          return latestBlock.timestamp;
        },
        approve<chainOverride extends Chain | undefined = undefined>(
          args: ApproveParameters<chain, chainOverride>,
        ) {
          args.abi = erc20Abi;
          args.functionName = "approve";

          return client.writeContract(
            // @ts-ignore
            args,
          );
        },
        balanceOf({
          erc20 = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          address = client.account.address,
        }: { erc20?: Address; address?: Address }) {
          if (erc20 === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")
            return client.getBalance({ address });

          return client.readContract({
            address: erc20,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          });
        },
        async deployContractWait<const abi extends Abi | readonly unknown[]>(
          args: DeployContractParameters<abi, chain, HDAccount>,
        ) {
          const hash = await client.deployContract(args);
          const receipt = await client.waitForTransactionReceipt({ hash });

          if (receipt.contractAddress == null)
            throw Error("no contract address");

          return receipt as typeof receipt & { contractAddress: Address };
        },
        async sendTransaction<
          const request extends SendTransactionRequest<chain, chainOverride>,
          chainOverride extends Chain | undefined = undefined,
        >(
          args: SendTransactionParameters<
            chain,
            HDAccount,
            chainOverride,
            request
          >,
        ) {
          const hash = await client
            .sendTransaction(args)
            .catch(async (error) => {
              client
                .request(
                  {
                    method: "debug_traceCall",
                    params: [
                      {
                        from: parseAccount(args.account ?? client.account)
                          .address,
                        ...args,
                      } as ExactPartial<RpcTransactionRequest>,
                      "latest",
                      {
                        tracer: "callTracer",
                        tracerConfig: { onlyTopCall: false },
                      },
                    ],
                  },
                  { retryCount: 0 },
                )
                .then(async (trace) => {
                  const unknownSigs = getCallTraceUnknownSigs(trace);

                  if (unknownSigs) {
                    const lookupRes = await fetch(
                      `https://api.openchain.xyz/signature-database/v1/lookup?filter=false&function=${unknownSigs}`,
                    );

                    const lookup = await lookupRes.json();

                    if (lookup.ok) {
                      Object.entries<{ name: string; filtered: boolean }[]>(
                        lookup.result.function,
                      ).map(([sig, results]) => {
                        const match = results.find(
                          ({ filtered }) => !filtered,
                        )?.name;
                        if (!match) return;

                        cache.functions[sig as Hex] = match;
                      });

                      writeFile(cachePath, JSON.stringify(cache)); // Non blocking.
                    }
                  }

                  console.debug(formatCallTrace(trace, cache.functions));
                });

              throw error;
            });

          return hash;
        },
        async sendRawTransaction(args: SendRawTransactionParameters) {
          const hash = await sendRawTransaction(client, args);

          if ((automine ??= await client.getAutomine()))
            await client.waitForTransactionReceipt({ hash });

          return hash;
        },
      };
    });
