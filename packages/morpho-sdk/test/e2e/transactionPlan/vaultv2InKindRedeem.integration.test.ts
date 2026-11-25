import {
  AccrualVaultV2MorphoMarketV1AdapterV2,
  MathLib,
} from "@morpho-org/blue-sdk";
import { erc2612Abi, fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { getErpcForkUrl, MAINNET_FORK_BLOCK } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  erc20Abi,
  isAddressEqual,
  keccak256,
  maxUint256,
  parseEventLogs,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { assert, describe, expect } from "vitest";
import { vaultExitBundlesV1Abi } from "../../../src/abis.js";
import { fetchAccrualVaultV2 } from "../../../src/fetch.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareVaultV2InKindRedeem,
  serializeTransactionPlan,
  vaultV2InKindRedeem,
} from "../../../src/index.js";
import { getVaultPermit } from "../../../src/transactionPlan/permit.js";
import { CbbtcUsdcBlue, WbtcUsdcSourceMarket } from "../../fixtures/blue.js";
import { setUpSingleAdapterVaultV2 } from "../../helpers/vaultV2.js";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_PROXY_ADMIN_SLOT = keccak256(toHex("org.zeppelinos.proxy.admin"));
const markets = [CbbtcUsdcBlue, WbtcUsdcSourceMarket] as const;
const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: MAINNET_FORK_BLOCK,
});

describe("Vault V2 in-kind TransactionPlan", () => {
  for (const branch of ["allowance", "approval", "permit", "idle"] as const) {
    test(`behavior: restored plan executes with ${branch}`, async ({
      client,
    }) => {
      await client.setCode({ address: client.account.address, bytecode: "0x" });
      const proxyAdmin = await client.getStorageAt({
        address: USDC,
        slot: USDC_PROXY_ADMIN_SLOT,
      });
      expect(proxyAdmin).not.toBe(toHex(0n, { size: 32 }));
      const {
        vault: address,
        adapter,
        depositAndAllocate,
      } = await setUpSingleAdapterVaultV2(client, {
        asset: USDC,
        markets,
        forceDeallocatePenalty: MathLib.WAD / 100n,
      });
      await depositAndAllocate({
        assets: parseUnits("1000", 6),
        perMarket: [
          { market: markets[0], assets: parseUnits("600", 6) },
          { market: markets[1], assets: parseUnits("200", 6) },
        ],
      });
      expect(
        await client.getStorageAt({
          address: USDC,
          slot: USDC_PROXY_ADMIN_SLOT,
        }),
      ).toBe(proxyAdmin);
      await client.setNextBlockTimestamp({ timestamp: Time.timestamp() });
      await client.mine({ blocks: 1 });
      const owner = client.account.address;
      const spender = getChainAddress(1, "bundles.vaultExitBundlesV1");
      const supportSignature = branch === "permit" || branch === "allowance";
      const vaultData = await fetchAccrualVaultV2(address, client);
      assert(
        vaultData.accrualAdapters[0] instanceof
          AccrualVaultV2MorphoMarketV1AdapterV2,
      );
      const amount = parseUnits(branch === "idle" ? "100" : "900", 6);
      const marketParamsList = branch === "idle" ? [] : [...markets];
      const expiresAt = Number(Time.timestamp() + 7200n);
      if (branch === "allowance") {
        // Finite but sufficient allowance must not be replaced by an approval or a permit.
        await client.approve({
          address,
          args: [spender, await client.balanceOf({ erc20: address })],
        });
      }
      await client.approve({
        address,
        args: [getChainAddress(1, "permit2"), maxUint256],
      });
      const readClient = createPublicClient({
        chain: client.chain,
        transport: custom({ request: client.request }),
      });
      const pending = await prepareVaultV2InKindRedeem(readClient, {
        chainId: 1,
        account: owner,
        assets: amount,
        marketParamsList,
        vault: vaultData,
        adapter,
        expiresAt,
        supportSignature,
        calldataOrigin: "0xcafe",
      });
      expect(pending.steps.map(({ action }) => action.type)).toEqual(
        branch === "approval" || branch === "idle"
          ? ["erc20Approval", "vaultV2InKindRedeem"]
          : ["vaultV2InKindRedeem"],
      );
      expect(pending.signatureRequests.map(({ kind }) => kind)).toEqual(
        branch === "permit" ? ["permit"] : [],
      );
      if (branch === "approval" || branch === "idle")
        expect(pending.steps[0]?.action.inputs).toMatchObject({
          spender,
          shares: maxUint256,
        });
      if (branch === "permit")
        expect(pending.signatureRequests[0]?.args).toMatchObject({
          spender,
          amount: maxUint256,
        });
      const restored = parseTransactionPlan(serializeTransactionPlan(pending));
      const updates = await Promise.all(
        getPendingSignatureRequests(restored).map(
          async ({ id, typedData }) => ({
            id,
            signature: await client.signTypedData({
              ...typedData,
              account: client.account,
            }),
          }),
        ),
      );
      const signed = applySignatures(restored, updates);
      const transactions = buildTransactions(
        parseTransactionPlan(serializeTransactionPlan(signed)),
      );
      expect(transactions).toEqual(buildTransactions(signed));
      const expected = vaultV2InKindRedeem({
        vault: { address, chainId: 1 },
        metadata: { origin: "0xcafe" },
        args: {
          amount,
          adapter,
          marketParamsList,
          userAddress: owner,
          deadline: BigInt(expiresAt),
          requirementSignature: getVaultPermit(signed.signatureRequests, {
            id: signed.signatureRequests[0]?.id,
            asset: address,
            owner,
          }),
        },
      });
      const exit = transactions.at(-1)!;
      expect(exit.to).toBe(spender);
      expect(exit.data).toBe(expected.data);
      expect(exit.value).toBe(expected.value);
      const decoded = decodeFunctionData({
        abi: vaultExitBundlesV1Abi,
        data: exit.data,
      });
      assert(
        decoded.functionName === "vaultExitBundlesV1InKindRedemptionVaultV2",
      );
      expect(decoded.args[1]).toBe(adapter);
      expect(decoded.args[2]).toEqual(
        marketParamsList.map(
          ({ loanToken, collateralToken, oracle, irm, lltv }) => ({
            loanToken,
            collateralToken,
            oracle,
            irm,
            lltv,
          }),
        ),
      );
      const initialAssets = await client.balanceOf({ erc20: USDC });
      const initialShares = await client.balanceOf({ erc20: address });
      const initialPositions = await Promise.all(
        markets.map(({ id }) => fetchAccrualPosition(owner, id, client)),
      );
      const nonce = await client.readContract({
        address,
        abi: erc2612Abi,
        functionName: "nonces",
        args: [owner],
      });
      let burnedShares = 0n;
      for (const transaction of transactions) {
        const hash = await client.sendTransaction(transaction);
        const receipt = await client.waitForTransactionReceipt({ hash });
        expect(receipt.status).toBe("success");
        burnedShares += parseEventLogs({
          abi: erc20Abi,
          eventName: "Transfer",
          logs: receipt.logs,
        })
          .filter(
            ({ address: token, args }) =>
              isAddressEqual(token, address) &&
              isAddressEqual(args.from, owner) &&
              isAddressEqual(args.to, zeroAddress),
          )
          .reduce((total, { args }) => total + args.value, 0n);
      }
      const finalShares = await client.balanceOf({ erc20: address });
      expect(burnedShares).toBeGreaterThan(0n);
      expect(finalShares).toBe(initialShares - burnedShares);
      expect(await client.balanceOf({ erc20: USDC })).toBe(
        initialAssets + (branch === "idle" ? amount : vaultData.assetBalance),
      );
      const finalPositions = await Promise.all(
        markets.map(({ id }) => fetchAccrualPosition(owner, id, client)),
      );
      for (const [index, position] of finalPositions.entries()) {
        if (branch === "idle")
          expect(position.supplyShares).toBe(
            initialPositions[index]!.supplyShares,
          );
        else
          expect(position.supplyShares).toBeGreaterThan(
            initialPositions[index]!.supplyShares,
          );
      }
      expect(
        await client.readContract({
          address,
          abi: erc2612Abi,
          functionName: "nonces",
          args: [owner],
        }),
      ).toBe(nonce + (branch === "permit" ? 1n : 0n));
      expect(await client.balanceOf({ erc20: address, owner: spender })).toBe(
        0n,
      );
      expect(await client.balanceOf({ erc20: USDC, owner: spender })).toBe(0n);
    });
  }
});
