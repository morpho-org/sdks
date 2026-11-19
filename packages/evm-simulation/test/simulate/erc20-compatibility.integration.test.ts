import { getChainAddresses, MarketParams } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import solc from "solc";
import {
  type Abi,
  erc20Abi,
  isAddressEqual,
  type Log,
  maxUint256,
  parseEventLogs,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { toSimulationAuthorizations } from "../../src/index.js";
import {
  simulateOrThrow,
  simulationClientFor,
} from "../../src/test-helpers/index.js";

const source = `
pragma solidity ^0.8.20;
contract CompatibilityToken {
    string public constant name = "Compatibility Token";
    string public constant symbol = "COMPAT";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool immutable emitApproval;
    bool immutable missingReturn;
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    constructor(bool emitApproval_, bool missingReturn_) {
        emitApproval = emitApproval_;
        missingReturn = missingReturn_;
        totalSupply = 1000 ether;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        if (missingReturn) { assembly { return(0, 0) } }
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        move(msg.sender, to, amount);
        if (missingReturn) { assembly { return(0, 0) } }
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 remaining = allowance[from][msg.sender];
        if (remaining != type(uint256).max) {
            remaining -= amount;
            allowance[from][msg.sender] = remaining;
        }
        if (emitApproval) emit Approval(from, msg.sender, remaining);
        move(from, to, amount);
        if (missingReturn) { assembly { return(0, 0) } }
        return true;
    }
    function move(address from, address to, uint256 amount) internal {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
contract FixedOracle {
    function price() external pure returns (uint256) { return 1e24; }
}`;
const compiled = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "Token.sol": { content: source } },
      settings: {
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
) as {
  contracts: {
    "Token.sol": Record<
      "CompatibilityToken" | "FixedOracle",
      { abi: Abi; evm: { bytecode: { object: string } } }
    >;
  };
};
const artifacts = compiled.contracts["Token.sol"];
const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 25_832_676n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

describe.each([
  {
    name: "finite allowance with Approval",
    emitsApproval: true,
    noReturn: false,
    allowance: parseUnits("100", 18),
  },
  {
    name: "infinite allowance with Approval",
    emitsApproval: true,
    noReturn: false,
    allowance: maxUint256,
  },
  {
    name: "infinite allowance without Approval",
    emitsApproval: false,
    noReturn: false,
    allowance: maxUint256,
  },
  {
    name: "finite allowance with missing returns",
    emitsApproval: true,
    noReturn: true,
    allowance: parseUnits("100", 18),
  },
])("ERC-20 compatibility: $name", (variant) => {
  describe.each(["supplyCollateral", "borrow", "withdrawCollateral"] as const)(
    "%s",
    (operation) => {
      test("executes through BlueBundlesV1", async ({ client }) => {
        const owner = client.account.address;
        const addresses = getChainAddresses(mainnet.id);
        const bundles = addresses.bundles!.blueBundlesV1!;
        const tokenHash = await client.deployContract({
          abi: artifacts.CompatibilityToken.abi,
          bytecode: `0x${artifacts.CompatibilityToken.evm.bytecode.object}`,
          args: [variant.emitsApproval, variant.noReturn],
        });
        const token = (
          await client.waitForTransactionReceipt({ hash: tokenHash })
        ).contractAddress!;
        const oracleHash = await client.deployContract({
          abi: artifacts.FixedOracle.abi,
          bytecode: `0x${artifacts.FixedOracle.evm.bytecode.object}`,
        });
        const oracle = (
          await client.waitForTransactionReceipt({ hash: oracleHash })
        ).contractAddress!;
        const params = new MarketParams({
          loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          collateralToken: token,
          oracle,
          irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
          lltv: 860_000_000_000_000_000n,
        });
        await client.writeContract({
          address: addresses.blue,
          abi: blueAbi,
          functionName: "createMarket",
          args: [params],
        });
        const collateral = parseUnits("10", 18);
        await client.writeContract({
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [addresses.blue, maxUint256],
        });
        await client.writeContract({
          address: addresses.blue,
          abi: blueAbi,
          functionName: "supplyCollateral",
          args: [params, collateral, owner, "0x"],
        });
        await client.deal({
          erc20: params.loanToken,
          amount: parseUnits("100", 6),
        });
        await client.approve({
          address: params.loanToken,
          args: [addresses.blue, maxUint256],
        });
        await client.writeContract({
          address: addresses.blue,
          abi: blueAbi,
          functionName: "supply",
          args: [params, parseUnits("100", 6), 0n, owner, "0x"],
        });
        await client.writeContract({
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [bundles, variant.allowance],
        });
        const market = client
          .extend(morphoViemExtension({ supportSignature: false }))
          .morpho.blue(params, mainnet.id);
        const positionData = await market.getPositionData(owner);
        const amount =
          operation === "borrow" ? parseUnits("1", 6) : parseUnits("1", 18);
        const action =
          operation === "supplyCollateral"
            ? market.supplyCollateral({
                userAddress: owner,
                collateralAssets: amount,
                deadline: maxUint256,
              })
            : operation === "borrow"
              ? market.borrow({
                  userAddress: owner,
                  borrowAssets: amount,
                  positionData,
                  deadline: maxUint256,
                })
              : market.withdrawCollateral({
                  userAddress: owner,
                  collateralAssets: amount,
                  positionData,
                  deadline: maxUint256,
                });
        const authorizations = toSimulationAuthorizations({
          owner,
          requirements: await action.getRequirements(),
        });
        const tx = action.buildTx();
        const limit =
          operation === "supplyCollateral"
            ? {
                type: "blueSupplyCollateral" as const,
                marketId: params.id,
                quote: { assetsPaid: amount, collateralSupplied: amount },
              }
            : operation === "borrow"
              ? {
                  type: "blueBorrow" as const,
                  marketId: params.id,
                  quote: {
                    assetsReceived: amount,
                    sharesMinted:
                      (await market.getMarketData()).toBorrowShares(
                        amount,
                        "Up",
                      ) * 2n,
                  },
                }
              : {
                  type: "blueWithdrawCollateral" as const,
                  marketId: params.id,
                  quote: {
                    assetsReceived: amount,
                    collateralWithdrawn: amount,
                  },
                };
        const result = await simulateOrThrow(
          simulationClientFor(client.transport.url, mainnet),
          {
            mode: "preview",
            authorizations,
            limits: { operations: [{ ...limit, slippageTolerance: 0n }] },
            transactions: [
              { from: owner, to: tx.to, data: tx.data, value: tx.value },
            ],
          },
        );
        expect(result.verification.operations).toHaveLength(1);
        const allLogs = result.calls
          .flatMap((call) => call.logs)
          .map((log) => ({
            ...log,
            topics: [...log.topics] as Log["topics"],
            blockHash: null,
            blockNumber: null,
            logIndex: null,
            transactionHash: null,
            transactionIndex: null,
            removed: false,
          }));
        const logs = allLogs.filter((log) =>
          isAddressEqual(log.address, token),
        );
        const approvals = parseEventLogs({
          abi: erc20Abi,
          eventName: "Approval",
          logs,
        }).filter(
          ({ args }) =>
            isAddressEqual(args.owner, owner) &&
            isAddressEqual(args.spender, bundles),
        );
        // Collateral withdrawal pulls zero loan tokens, not zero collateral tokens.
        const pullsCollateral = operation !== "withdrawCollateral";
        const pulled = operation === "supplyCollateral" ? amount : 0n;
        expect(approvals.map(({ args }) => args.value)).toEqual(
          pullsCollateral && variant.emitsApproval
            ? [
                variant.allowance === maxUint256
                  ? maxUint256
                  : variant.allowance - pulled,
              ]
            : [],
        );
        const transfers = parseEventLogs({
          abi: erc20Abi,
          eventName: "Transfer",
          logs,
        });
        expect(transfers.length).toBeGreaterThan(0);
        expect(
          transfers.some(
            ({ args }) => args.value === (operation === "borrow" ? 0n : amount),
          ),
        ).toBe(true);
        const userChanges = result.assetChanges.find(({ account }) =>
          isAddressEqual(account, owner),
        );
        const collateralChange = userChanges?.changes.find(({ token: asset }) =>
          isAddressEqual(asset, token),
        );
        if (operation === "borrow") {
          expect(transfers).toHaveLength(1);
          expect(transfers[0]!.args).toMatchObject({
            from: owner,
            to: bundles,
            value: 0n,
          });
          expect(
            result.assetChanges.every(({ changes }) =>
              changes.every(
                ({ token: asset }) => !isAddressEqual(asset, token),
              ),
            ),
          ).toBe(true);
        } else {
          expect(collateralChange?.diff).toBe(
            operation === "supplyCollateral" ? -amount : amount,
          );
          if (operation === "withdrawCollateral") {
            const loanTransfers = parseEventLogs({
              abi: erc20Abi,
              eventName: "Transfer",
              logs: allLogs.filter((log) =>
                isAddressEqual(log.address, params.loanToken),
              ),
            });
            expect(
              loanTransfers.some(
                ({ args }) =>
                  isAddressEqual(args.from, owner) &&
                  isAddressEqual(args.to, bundles) &&
                  args.value === 0n,
              ),
            ).toBe(true);
            expect(
              result.assetChanges.every(({ changes }) =>
                changes.every(
                  ({ token: asset }) =>
                    !isAddressEqual(asset, params.loanToken),
                ),
              ),
            ).toBe(true);
          }
        }
      });
    },
  );
});
