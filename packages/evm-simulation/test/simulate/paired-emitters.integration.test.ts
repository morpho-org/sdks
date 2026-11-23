import { getChainAddresses, type MarketId } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  keccak256,
  numberToHex,
  padHex,
  parseAbi,
  parseEventLogs,
} from "viem";
import { arc, hyperEvm, mainnet } from "viem/chains";
import { describe, expect, test as liveTest } from "vitest";
import { simulate } from "../../src/index.js";
import { PAIRED_EMITTERS } from "../../src/simulate/paired-emitters.js";
import arcUsdc from "../../src/test-helpers/paired-emitter-arc-usdc.json" with {
  type: "json",
};
import eure from "../../src/test-helpers/paired-emitter-eure.json" with {
  type: "json",
};
import wstHype from "../../src/test-helpers/paired-emitter-wsthype.json" with {
  type: "json",
};
import code from "../paired-emitter-code.json" with { type: "json" };
import { redactedHttp } from "../redacted-http.js";

const rpcUrl = (chainId: number, network: string) =>
  getErpcForkUrl(chainId, process.env.ERPC_SECRET) ??
  (process.env.ALCHEMY_KEY
    ? `https://${network}.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`
    : undefined);
const receiver: Address = "0x111111111111111111111111111111111111abCD";
const shareAbi = parseAbi([
  "function balanceToShares(uint256) view returns (uint256)",
  "function balanceToShareDecimals() view returns (uint256)",
  "function sharesOf(address) view returns (uint256)",
]);
const wiringAbi = parseAbi([
  "function sthype() view returns (address)",
  "function WRAPPER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32,address) view returns (bool)",
  "function owner() view returns (address)",
]);
const proxySlots = {
  implementation:
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
} as const;

for (const { fixture, chain, network } of [
  { fixture: eure, chain: mainnet, network: "eth-mainnet" },
  { fixture: wstHype, chain: hyperEvm, network: "hyperliquid-mainnet" },
] as const) {
  const url = rpcUrl(chain.id, network);
  const test = createViemTest(chain, {
    forkUrl: url,
    chainId: chain.id,
    forkBlockNumber: BigInt(fixture.source.stateBlock),
  });
  describe.skipIf(!url)(`shared ledger: ${fixture.name}`, () => {
    if (chain.id === hyperEvm.id)
      test("pins HyperEVM proxy wiring and both transfer interfaces to the stHYPE share ledger", async ({
        client,
      }) => {
        const pair = PAIRED_EMITTERS[chain.id]![0]!;
        const blockNumber = BigInt(fixture.source.stateBlock);
        expect(await client.getBlockNumber()).toBe(blockNumber);
        for (const [address, implementation, admin, implementationHash] of [
          [
            pair.primary,
            "0x104324863cFB2220756c60384Efa9bB67A57Aaf7",
            "0xa29a2043b2fcBc9189Beb9E6EFCb2ba48bb3d586",
            "0x3bca1426a75e04a4fb628558e756735e1d9061cf1c4ea131998ff769ef617f3b",
          ],
          [
            pair.paired,
            "0xe71cAF5c1fe56d8897c7B604295D23968049E057",
            "0xE7B0f26E8E20E109441F0AD1C885fffBB27125dc",
            "0xeb084a00a96688e2139c5a80963e48c3fdbf29ab3ed5fad0317658d1b898b98a",
          ],
        ] as const) {
          for (const [slot, value] of [
            [proxySlots.implementation, implementation],
            [proxySlots.admin, admin],
            [proxySlots.beacon, "0x00"],
          ] as const)
            expect(
              await client.getStorageAt({ address, slot, blockNumber }),
            ).toBe(padHex(value, { size: 32 }).toLowerCase());
          expect(
            keccak256(
              (await client.getCode({
                address: implementation,
                blockNumber,
              })) ?? "0x",
            ),
          ).toBe(implementationHash);
          expect(
            (
              await client.readContract({
                address: admin,
                abi: wiringAbi,
                functionName: "owner",
                blockNumber,
              })
            ).toLowerCase(),
          ).toBe("0xc5DEd4F7F53919c714059a17d31371aE847E23D2".toLowerCase());
        }
        expect(
          (
            await client.readContract({
              address: pair.primary,
              abi: wiringAbi,
              functionName: "sthype",
              blockNumber,
            })
          ).toLowerCase(),
        ).toBe(pair.paired.toLowerCase());
        expect(
          (
            await client.getStorageAt({
              address: pair.primary,
              slot: "0x0",
              blockNumber,
            })
          )?.toLowerCase(),
        ).toBe(padHex(pair.paired, { size: 32 }).toLowerCase());
        const wrapperRole = await client.readContract({
          address: pair.paired,
          abi: wiringAbi,
          functionName: "WRAPPER_ROLE",
          blockNumber,
        });
        expect(
          await client.readContract({
            address: pair.paired,
            abi: wiringAbi,
            functionName: "hasRole",
            args: [wrapperRole, pair.primary],
            blockNumber,
          }),
        ).toBe(true);
        const scale = await client.readContract({
          address: pair.primary,
          abi: shareAbi,
          functionName: "balanceToShareDecimals",
          blockNumber,
        });
        expect(scale).toBe(1_000_000n);
        const owner = fixture.source.holder as Address;
        const amount = 1_000_000n;
        const reads = [
          ...[owner, receiver].flatMap((account) => [
            {
              from: owner,
              to: pair.paired,
              data: encodeFunctionData({
                abi: shareAbi,
                functionName: "sharesOf",
                args: [account],
              }),
            },
            {
              from: owner,
              to: pair.primary,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [account],
              }),
            },
          ]),
          {
            from: owner,
            to: pair.paired,
            data: encodeFunctionData({
              abi: shareAbi,
              functionName: "balanceToShares",
              args: [amount],
            }),
          },
        ];
        for (const token of [pair.paired, pair.primary]) {
          const [block] = await client.request({
            method: "eth_simulateV1",
            params: [
              {
                validation: false,
                traceTransfers: false,
                blockStateCalls: [
                  {
                    calls: [
                      ...reads,
                      {
                        from: owner,
                        to: token,
                        data: encodeFunctionData({
                          abi: erc20Abi,
                          functionName: "transfer",
                          args: [receiver, amount],
                        }),
                      },
                      ...reads,
                    ],
                  },
                ],
              },
              "latest",
            ],
          });
          expect(block!.calls.map(({ status }) => status)).toEqual(
            Array(reads.length * 2 + 1).fill("0x1"),
          );
          const before = block!.calls
            .slice(0, reads.length)
            .map(({ returnData }) => BigInt(returnData));
          const after = block!.calls
            .slice(reads.length + 1)
            .map(({ returnData }) => BigInt(returnData));
          const shareDelta =
            token === pair.paired ? before[4]! : amount * scale;
          expect(shareDelta).toBeGreaterThan(0n);
          expect(after[0]).toBe(before[0]! - shareDelta);
          expect(after[2]).toBe(before[2]! + shareDelta);
          for (const balances of [before, after]) {
            expect(balances[1]).toBe(balances[0]! / scale);
            expect(balances[3]).toBe(balances[2]! / scale);
          }
        }
      });
    test("paired-interface transfer debits the primary balance on a pinned Anvil fork", async ({
      client,
    }) => {
      const pair = PAIRED_EMITTERS[chain.id]![0]!;
      const owner = fixture.source.holder as Address;
      for (const role of ["primary", "paired"] as const)
        expect(
          keccak256((await client.getCode({ address: pair[role] })) ?? "0x"),
        ).toBe(code[chain.id][role]);
      const amount = 1_000_000n;
      const expectedAfter =
        chain.id === 999
          ? ((await client.readContract({
              address: pair.paired,
              abi: shareAbi,
              functionName: "sharesOf",
              args: [owner],
            })) -
              (await client.readContract({
                address: pair.paired,
                abi: shareAbi,
                functionName: "balanceToShares",
                args: [amount],
              }))) /
            (await client.readContract({
              address: pair.paired,
              abi: shareAbi,
              functionName: "balanceToShareDecimals",
            }))
          : undefined;
      const balance = {
        from: owner,
        to: pair.primary,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        }),
      };
      const [block] = await client.request({
        method: "eth_simulateV1",
        params: [
          {
            validation: false,
            traceTransfers: false,
            blockStateCalls: [
              {
                calls: [
                  balance,
                  {
                    from: owner,
                    to: pair.paired,
                    data: encodeFunctionData({
                      abi: erc20Abi,
                      functionName: "transfer",
                      args: [receiver, amount],
                    }),
                  },
                  balance,
                ],
              },
            ],
          },
          "latest",
        ],
      });
      expect(block!.calls.map(({ status }) => status)).toEqual([
        "0x1",
        "0x1",
        "0x1",
      ]);
      const before = BigInt(block!.calls[0]!.returnData);
      const after = BigInt(block!.calls[2]!.returnData);
      expect(before).toBeGreaterThan(after);
      expect(after).toBe(expectedAfter ?? before - amount);
    });
  });
}

// Arc's ledger is a node extension, not EVM bytecode; standard Anvil cannot emulate it.
const arcUrl = rpcUrl(arc.id, "arc-mainnet");
describe.skipIf(!arcUrl)(
  "Arc shared native ledger (pinned live RPC, no broadcast)",
  () => {
    liveTest(
      "trace-enabled public simulate accepts mirrored USDC supply but warns on an extra native send",
      async () => {
        const client = createPublicClient({
          chain: arc,
          transport: redactedHttp(arcUrl),
        });
        const pair = PAIRED_EMITTERS[arc.id]![0]!;
        const owner = arcUsdc.source.holder as Address;
        const blockNumber = BigInt(arcUsdc.source.stateBlock);
        const morpho = getChainAddresses(arc.id).blue!;
        const marketId =
          "0xc2db905f174e5defcce01d321b09f15f78856a36a21b90cc7e1abbc29225815d" as MarketId;
        const [loanToken, collateralToken, oracle, irm, lltv] =
          await client.readContract({
            address: morpho,
            abi: blueAbi,
            functionName: "idToMarketParams",
            args: [marketId],
            blockNumber,
          });
        expect(loanToken.toLowerCase()).toBe(pair.primary.toLowerCase());
        const transactions = [
          {
            from: owner,
            to: pair.primary,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [morpho, 1_000n],
            }),
          },
          {
            from: owner,
            to: morpho,
            data: encodeFunctionData({
              abi: blueAbi,
              functionName: "supply",
              args: [
                { loanToken, collateralToken, oracle, irm, lltv },
                1_000n,
                0n,
                owner,
                "0x",
              ],
            }),
          },
        ];
        const limits = {
          operations: [
            {
              type: "blueSupply",
              marketId,
              quote: { assetsPaid: 1_000n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
          ],
        } as const;
        const accepted = await simulate(client, {
          blockNumber,
          transactions,
          limits,
        });
        expect(accepted.ok).toBe(true);
        expect(accepted.warnings).toEqual([]);
        expect(accepted.verification).toEqual({ retention: "checked" });
        if (accepted.ok) {
          expect(
            accepted.result.transfers.map(({ token }) => token.toLowerCase()),
          ).toEqual(
            expect.arrayContaining([
              pair.primary.toLowerCase(),
              pair.paired.toLowerCase(),
            ]),
          );
          expect(accepted.result.verification.operations).toHaveLength(1);
        }
        const warned = await simulate(client, {
          blockNumber,
          transactions: [
            ...transactions,
            { from: owner, to: receiver, data: "0x", value: 1n },
          ],
          limits,
        });
        expect(warned.ok).toBe(true);
        expect(warned.warnings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "UNEXPECTED_TOKEN_TRANSFER",
              severity: "warn",
              chainId: arc.id,
              token: ethAddress,
            }),
          ]),
        );
      },
    );
    liveTest(
      "native and ERC-20 transfers debit the same USDC balance and emit the specified system logs",
      async () => {
        const client = createPublicClient({
          chain: arc,
          transport: redactedHttp(arcUrl),
        });
        const pair = PAIRED_EMITTERS[arc.id]![0]!;
        const owner = arcUsdc.source.holder as Address;
        const blockNumber = BigInt(arcUsdc.source.stateBlock);
        for (const role of ["primary", "paired"] as const)
          expect(
            keccak256(
              (await client.getCode({ address: pair[role], blockNumber })) ??
                "0x",
            ),
          ).toBe(code["5042"][role]);
        const balance = {
          from: owner,
          to: pair.primary,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          }),
        };
        const primary = await client.readContract({
          address: pair.primary,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
          blockNumber,
        });
        expect(
          (await client.getBalance({ address: owner, blockNumber })) /
            10n ** 12n,
        ).toBe(primary);
        const [block] = await client.request({
          method: "eth_simulateV1",
          params: [
            {
              validation: false,
              traceTransfers: false,
              blockStateCalls: [
                {
                  calls: [
                    balance,
                    {
                      from: owner,
                      to: receiver,
                      value: numberToHex(10n ** 15n),
                    },
                    balance,
                    {
                      from: owner,
                      to: pair.primary,
                      data: encodeFunctionData({
                        abi: erc20Abi,
                        functionName: "transfer",
                        args: [receiver, 1_000n],
                      }),
                    },
                    balance,
                  ],
                },
              ],
            },
            numberToHex(blockNumber),
          ],
        });
        expect(block!.calls.map(({ status }) => status)).toEqual(
          Array(5).fill("0x1"),
        );
        expect(
          BigInt(block!.calls[0]!.returnData) -
            BigInt(block!.calls[2]!.returnData),
        ).toBe(1_000n);
        expect(
          BigInt(block!.calls[2]!.returnData) -
            BigInt(block!.calls[4]!.returnData),
        ).toBe(1_000n);
        const nativeLogs = parseEventLogs({
          abi: erc20Abi,
          eventName: "Transfer",
          logs: [...block!.calls[1]!.logs!],
        });
        expect(nativeLogs.map(({ address }) => address.toLowerCase())).toEqual([
          pair.paired.toLowerCase(),
        ]);
        const erc20Logs = parseEventLogs({
          abi: erc20Abi,
          eventName: "Transfer",
          logs: [...block!.calls[3]!.logs!],
        });
        expect(erc20Logs.map(({ address }) => address.toLowerCase())).toEqual([
          pair.paired.toLowerCase(),
          pair.primary.toLowerCase(),
        ]);
        expect(erc20Logs.map(({ args }) => args.value)).toEqual([
          10n ** 15n,
          1_000n,
        ]);
      },
    );
  },
);
