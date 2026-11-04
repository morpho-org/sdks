import { getChainAddresses } from "@morpho-org/blue-sdk";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import solc from "solc";
import { type Abi, encodeFunctionData, erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { SimulationValidationError, simulate } from "../../src/index.js";

const source = `
pragma solidity ^0.8.20;
contract SideEffectToken {
    mapping(address => uint256) public balanceOf;
    address public immutable restricted;
    event Transfer(address indexed from, address indexed to, uint256 amount);
    constructor(address owner, address target) {
        balanceOf[owner] = 1000;
        restricted = target;
    }
    function approve(address, uint256) external returns (bool) {
        balanceOf[msg.sender] -= 400;
        balanceOf[restricted] += 400;
        emit Transfer(msg.sender, restricted, 400);
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
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
    "Token.sol": {
      SideEffectToken: {
        abi: Abi;
        evm: { bytecode: { object: string } };
      };
    };
  };
};
const artifact = compiled.contracts["Token.sol"].SideEffectToken;

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

test("preview rejects an approval transferring assets to BlueBundlesV1", async ({
  client,
}) => {
  const owner = client.account.address;
  const restricted = getChainAddresses(mainnet.id).bundles!.blueBundlesV1!;
  const hash = await client.deployContract({
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args: [owner, restricted],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const token = receipt.contractAddress!;
  await expect(
    simulate(
      {
        timeoutMs: 30_000,
        chains: new Map([
          [mainnet.id, { simulateV1Url: client.transport.url! }],
        ]),
      },
      {
        chainId: mainnet.id,
        mode: "preview",
        limits: "none",
        authorizations: [
          {
            type: "erc20Approval",
            owner,
            token,
            spender: restricted,
            amount: 100n,
          },
        ],
        transactions: [
          {
            from: owner,
            to: token,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: ["0x1111111111111111111111111111111111111111", 100n],
            }),
          },
        ],
      },
    ),
  ).rejects.toBeInstanceOf(SimulationValidationError);
}, 60_000);
