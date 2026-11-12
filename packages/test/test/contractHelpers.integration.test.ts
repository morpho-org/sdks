import {
  decodeFunctionData,
  erc20Abi,
  erc4626Abi,
  http,
  maxUint256,
} from "viem";
import { anvil } from "viem/chains";
import { expect, test } from "vitest";
import { spawnAnvil } from "../src/anvil.js";
import { createAnvilTestClient } from "../src/client.js";

test("approves and deposits with frozen parameters", async () => {
  const node = await spawnAnvil({ gasPrice: 0n, blockBaseFeePerGas: 0n });
  const client = createAnvilTestClient(http(node.rpcUrl), anvil);
  try {
    const token = "0x1111111111111111111111111111111111111111";
    const vault = "0x2222222222222222222222222222222222222222";
    const approveArgs = Object.freeze({
      address: token,
      args: Object.freeze([vault, maxUint256] as const),
    });
    const approveOriginal = { ...approveArgs, args: [...approveArgs.args] };
    const approveHash = await client.approve(approveArgs);
    const approveTx = await client.getTransaction({ hash: approveHash });
    expect(approveTx.blockNumber).not.toBeNull();
    expect(approveTx.to).toBe(token);
    expect(
      decodeFunctionData({ abi: erc20Abi, data: approveTx.input }),
    ).toEqual({
      functionName: "approve",
      args: approveArgs.args,
    });
    expect(approveArgs).toEqual(approveOriginal);

    const depositArgs = Object.freeze({
      address: vault,
      args: Object.freeze([10n, client.account.address] as const),
    });
    const depositOriginal = { ...depositArgs, args: [...depositArgs.args] };
    const depositHash = await client.deposit(depositArgs);
    const depositTx = await client.getTransaction({ hash: depositHash });
    expect(depositTx.blockNumber).not.toBeNull();
    expect(depositTx.to).toBe(vault);
    expect(
      decodeFunctionData({ abi: erc4626Abi, data: depositTx.input }),
    ).toEqual({ functionName: "deposit", args: depositArgs.args });
    expect(depositArgs).toEqual(depositOriginal);
  } finally {
    await node.stopAndWait();
  }
});
