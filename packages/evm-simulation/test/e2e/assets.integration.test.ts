import { addressesRegistry, ChainId } from "@morpho-org/blue-sdk";
import { erc2612Abi, wstEthAbi } from "@morpho-org/morpho-sdk/abis";
import { testAccount } from "@morpho-org/test";
import {
  CallExecutionError,
  ExecutionRevertedError,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  getAddress,
  isAddressEqual,
  maxUint256,
  parseAbi,
  parseEventLogs,
  parseSignature,
  zeroHash,
} from "viem";
import { expect } from "vitest";
import { fundE2eAsset, getE2eAssets } from "./assets.js";
import { describeE2e } from "./setup.js";

interface AssetBehavior {
  readonly decimals: number;
  readonly approvalOnTransferFrom?: boolean;
  readonly proxy?: boolean;
}
const behaviors: {
  readonly [chainId: number]: { readonly [symbol: string]: AssetBehavior };
} = {
  [ChainId.EthMainnet]: {
    USDT: { decimals: 6 },
    DAI: { decimals: 18 },
    wstETH: { decimals: 18, approvalOnTransferFrom: true },
    sDAI: { decimals: 18 },
    WBTC: { decimals: 8 },
    GUSD: { decimals: 2 },
  },
  [ChainId.BaseMainnet]: { cbBTC: { decimals: 8 } },
  [ChainId.ArbitrumMainnet]: {
    wNative: { decimals: 18, approvalOnTransferFrom: true, proxy: true },
    USDT0: { decimals: 6, approvalOnTransferFrom: true, proxy: true },
    XAUt0: { decimals: 6, approvalOnTransferFrom: true, proxy: true },
  },
  [ChainId.HyperliquidMainnet]: {
    USDT0: { decimals: 6, approvalOnTransferFrom: true, proxy: true },
  },
};
const trueResult = encodeAbiParameters([{ type: "bool" }], [true]);
const assertCallReverted = async (call: Promise<unknown>) => {
  const error = await call.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(error).toBeInstanceOf(CallExecutionError);
  if (error instanceof CallExecutionError)
    expect(
      error.walk((cause) => cause instanceof ExecutionRevertedError),
    ).toBeInstanceOf(ExecutionRevertedError);
};

describeE2e(
  {
    name: "simulationAssetBehaviors",
    requires: ["blue", "adaptiveCurveIrm", "bundles.blueBundlesV1"],
  },
  (test, { chainId }) => {
    const assets = getE2eAssets(chainId);
    if (!assets.some(({ symbol }) => behaviors[chainId]?.[symbol])) {
      test.skip("no token-property cases for this chain");
      return;
    }
    for (const asset of assets) {
      const behavior = behaviors[chainId]?.[asset.symbol];
      if (!behavior) continue;
      test(`${asset.symbol}: funding, decimals, raw returns and transferFrom logs`, {
        tags: ["nightly"],
      }, async ({ client }) => {
        const owner = client.account.address;
        const spender = testAccount(1).address;
        const receiver = testAccount(2).address;
        const { decimals, amount } = await fundE2eAsset(client, {
          token: asset.address,
          amount: "1",
        });
        expect(decimals).toBe(behavior.decimals);
        expect(await client.balanceOf({ erc20: asset.address })).toBe(amount);
        const noReturn =
          chainId === ChainId.EthMainnet && asset.symbol === "USDT";
        const approve = (value: bigint) =>
          encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, value],
          });
        const approvalResult = await client.call({
          to: asset.address,
          data: approve(1n),
        });
        expect(approvalResult.data ?? "0x").toBe(noReturn ? "0x" : trueResult);
        await client.approve({ address: asset.address, args: [spender, 1n] });
        expect(await client.allowance({ erc20: asset.address, spender })).toBe(
          1n,
        );
        const changed = client.call({ to: asset.address, data: approve(2n) });
        if (noReturn) await assertCallReverted(changed);
        else {
          expect((await changed).data).toBe(trueResult);
          await client.approve({ address: asset.address, args: [spender, 2n] });
        }
        expect(await client.allowance({ erc20: asset.address, spender })).toBe(
          noReturn ? 1n : 2n,
        );
        await client.approve({ address: asset.address, args: [spender, 0n] });
        await client.approve({
          address: asset.address,
          args: [spender, maxUint256],
        });
        for (const value of [0n, amount]) {
          const data = encodeFunctionData({
            abi: erc20Abi,
            functionName: "transferFrom",
            args: [owner, receiver, value],
          });
          const result = await client.call({
            account: spender,
            to: asset.address,
            data,
          });
          expect(result.data ?? "0x").toBe(noReturn ? "0x" : trueResult);
          const before = await client.balanceOf({
            erc20: asset.address,
            owner: receiver,
          });
          const hash = await client.sendTransaction({
            account: spender,
            to: asset.address,
            data,
          });
          const receipt = await client.waitForTransactionReceipt({ hash });
          expect(receipt.status).toBe("success");
          const logs = receipt.logs.filter((log) =>
            isAddressEqual(log.address, asset.address),
          );
          const transfers = parseEventLogs({
            abi: erc20Abi,
            eventName: "Transfer",
            logs,
          });
          expect(transfers.map(({ args }) => args)).toEqual([
            { from: owner, to: receiver, value },
          ]);
          const approvals = parseEventLogs({
            abi: erc20Abi,
            eventName: "Approval",
            logs,
          });
          expect(approvals).toHaveLength(
            behavior.approvalOnTransferFrom ? 1 : 0,
          );
          if (behavior.approvalOnTransferFrom) {
            expect(approvals.map(({ args }) => args)).toEqual([
              {
                owner,
                spender,
                value: await client.allowance({
                  erc20: asset.address,
                  spender,
                }),
              },
            ]);
          }
          expect(await client.balanceOf({ erc20: asset.address })).toBe(
            amount - value,
          );
          expect(
            await client.balanceOf({ erc20: asset.address, owner: receiver }),
          ).toBe(before + value);
        }
        if (behavior.proxy) {
          const implementation = await client.getStorageAt({
            address: asset.address,
            slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
          });
          expect(implementation).toBeDefined();
          expect(implementation).not.toBe(zeroHash);
          const target = getAddress(`0x${implementation!.slice(-40)}`);
          expect(await client.getCode({ address: target })).toMatch(
            /^0x[0-9a-f]+$/i,
          );
          const trace = await client.traceCall({
            account: owner,
            to: asset.address,
            type: "legacy",
            gas: 1_000_000n,
            gasPrice: 0n,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [owner],
            }),
          });
          expect(trace.error).toBeUndefined();
          expect(
            trace.calls?.some(
              (call) =>
                call.type === "DELEGATECALL" && isAddressEqual(call.to, target),
            ),
          ).toBe(true);
        }
        if (asset.symbol === "wstETH") {
          expect(
            await client.readContract({
              address: asset.address,
              abi: wstEthAbi,
              functionName: "stETH",
            }),
          ).toBe(addressesRegistry[ChainId.EthMainnet].stEth);
          expect(
            await client.readContract({
              address: asset.address,
              abi: wstEthAbi,
              functionName: "stEthPerToken",
            }),
          ).toBeGreaterThan(amount);
        }
        if (asset.symbol === "sDAI") {
          expect(
            await client.readContract({
              address: asset.address,
              abi: erc4626Abi,
              functionName: "asset",
            }),
          ).toBe(addressesRegistry[ChainId.EthMainnet].dai);
          expect(
            await client.convertToAssets({
              erc4626: asset.address,
              shares: amount,
            }),
          ).toBeGreaterThan(amount);
        }
      });
    }
    if (chainId !== ChainId.EthMainnet) return;
    test("DAI: signed non-standard permit succeeds; ERC-2612 selector reverts", {
      tags: ["nightly"],
    }, async ({ client }) => {
      const token = addressesRegistry[ChainId.EthMainnet].dai;
      const owner = client.account.address;
      const spender = testAccount(1).address;
      const abi = parseAbi([
        "function nonces(address) view returns (uint256)",
        "function permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)",
      ]);
      const nonce = await client.readContract({
        address: token,
        abi,
        functionName: "nonces",
        args: [owner],
      });
      const expiry = (await client.getBlock()).timestamp + 3_600n;
      const signature = parseSignature(
        await client.account.signTypedData({
          domain: {
            name: "Dai Stablecoin",
            version: "1",
            chainId,
            verifyingContract: token,
          },
          primaryType: "Permit",
          types: {
            Permit: [
              { name: "holder", type: "address" },
              { name: "spender", type: "address" },
              { name: "nonce", type: "uint256" },
              { name: "expiry", type: "uint256" },
              { name: "allowed", type: "bool" },
            ],
          },
          message: { holder: owner, spender, nonce, expiry, allowed: true },
        }),
      );
      const { r, s, v } = signature;
      const data = encodeFunctionData({
        abi,
        functionName: "permit",
        args: [owner, spender, nonce, expiry, true, Number(v), r, s],
      });
      expect((await client.call({ to: token, data })).data ?? "0x").toBe("0x");
      const standardSignature = parseSignature(
        await client.account.signTypedData({
          domain: {
            name: "Dai Stablecoin",
            version: "1",
            chainId,
            verifyingContract: token,
          },
          primaryType: "Permit",
          types: {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          message: {
            owner,
            spender,
            value: maxUint256,
            nonce,
            deadline: expiry,
          },
        }),
      );
      await assertCallReverted(
        client.call({
          to: token,
          data: encodeFunctionData({
            abi: erc2612Abi,
            functionName: "permit",
            args: [
              owner,
              spender,
              maxUint256,
              expiry,
              Number(standardSignature.v),
              standardSignature.r,
              standardSignature.s,
            ],
          }),
        }),
      );
      const hash = await client.sendTransaction({ to: token, data });
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
        "success",
      );
      expect(await client.allowance({ erc20: token, spender })).toBe(
        maxUint256,
      );
      expect(
        await client.readContract({
          address: token,
          abi,
          functionName: "nonces",
          args: [owner],
        }),
      ).toBe(nonce + 1n);
    });
  },
);
