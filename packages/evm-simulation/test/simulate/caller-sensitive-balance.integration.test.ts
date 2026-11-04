import { getChainAddresses } from "@morpho-org/blue-sdk";
import { vaultV2FactoryAbi } from "@morpho-org/morpho-sdk/abis";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import solc from "solc";
import {
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  type Hex,
  parseAbi,
  parseEventLogs,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { ConsumerLimitViolationError, simulate } from "../../src/index.js";

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

const source = `
pragma solidity ^0.8.20;
contract CallerSensitiveToken {
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 amount);
    function mint(address account, uint256 amount) external {
        balances[account] += amount;
        totalSupply += amount;
        emit Transfer(address(0), account, amount);
    }
    function balanceOf(address account) external view returns (uint256) {
        return msg.sender == address(0) ? 0 : balances[account];
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balances[from] -= amount;
        balances[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}`;

test("error: owner observations reject an understated quote for a caller-sensitive deposit asset", async ({
  client,
}) => {
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "Token.sol": { content: source } },
        settings: {
          evmVersion: "cancun",
          outputSelection: { "*": { "*": ["evm.bytecode.object"] } },
        },
      }),
    ),
  ) as {
    contracts: Record<
      string,
      Record<string, { evm: { bytecode: { object: string } } }>
    >;
  };
  const receipt = await client.deployContractWait({
    abi: [],
    bytecode:
      `0x${output.contracts["Token.sol"]!.CallerSensitiveToken!.evm.bytecode.object}` as Hex,
  });
  const token = receipt.contractAddress!;
  const owner = client.account.address;
  const amount = 100n;
  await client.writeContract({
    address: token,
    abi: parseAbi(["function mint(address account, uint256 amount)"]),
    functionName: "mint",
    args: [owner, amount],
  });
  const hash = await client.writeContract({
    address: getChainAddresses(mainnet.id).vaultV2Factory!,
    abi: vaultV2FactoryAbi,
    functionName: "createVaultV2",
    args: [owner, token, zeroHash],
  });
  const vaultReceipt = await client.waitForTransactionReceipt({ hash });
  const [created] = parseEventLogs({
    abi: vaultV2FactoryAbi,
    eventName: "CreateVaultV2",
    logs: vaultReceipt.logs,
  });
  const vault = created!.args.newVaultV2;
  await client.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [vault, amount],
  });
  const transaction = {
    from: owner,
    to: vault,
    data: encodeFunctionData({
      abi: erc4626Abi,
      functionName: "deposit",
      args: [amount, owner],
    }),
  };
  const config = {
    timeoutMs: 30_000,
    chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
  };
  const request = (assetsPaid: bigint) => ({
    chainId: mainnet.id,
    transactions: [transaction],
    limits: {
      operations: [
        {
          type: "vaultV2Deposit" as const,
          vault,
          quote: { assetsPaid, sharesMinted: 1n },
          slippageTolerance: 0n,
        },
      ],
    },
  });
  await expect(simulate(config, request(amount - 1n))).rejects.toThrow(
    ConsumerLimitViolationError,
  );
  await expect(simulate(config, request(amount))).resolves.toBeDefined();
  const balance = () =>
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
      account: owner,
    });
  const before = await balance();
  await client.sendTransaction(transaction);
  expect(before - (await balance())).toBe(amount);
});
