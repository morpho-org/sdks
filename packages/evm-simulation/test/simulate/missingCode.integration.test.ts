import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { getChainAddress, getChainAddresses } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { expectFailClosed } from "@morpho-org/test/chaos";
import { createViemTest } from "@morpho-org/test/vitest";
import { type Address, getAddress, isAddressEqual, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  BlacklistViolationError,
  ConsumerLimitViolationError,
  SimulationValidationError,
  simulate,
} from "../../src/index.js";

/**
 * Chaos S8: transactions that target a code-less address. `eth_simulateV1`
 * would execute a call to an EOA as a silent success, so the pipeline must
 * reject the request at validation before the backend call.
 *
 * Residual documented in the threat model: a `to` deployed by an earlier
 * transaction in the same batch has no code at the state block and is
 * rejected — contract-creation chains are out of scope.
 */

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

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const KEYROCK_USDC_VAULT_V2: Address =
  "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
const EOA: Address = getAddress("0x00000000000000000000000000000000DeaDBeef");

const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
});

describe.sequential("chaos: S8 missing contract", () => {
  test("error: SimulationValidationError when the calldata target has no code", async ({
    client,
  }) => {
    const promise = simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: EOA,
          // erc20 transfer(address,uint256)
          data: "0xa9059cbb00000000000000000000000000000000000000000000000000000000deadbeef0000000000000000000000000000000000000000000000000000000000000001",
        },
      ],
    });

    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(SimulationValidationError);
    const error = (await promise.catch(
      (e: unknown) => e,
    )) as SimulationValidationError;
    expect(error.fieldErrors).toEqual([
      `transactions[0].to: no contract code at ${EOA}`,
    ]);
  });

  test("error: real contract wiped mid-session is rejected the same way", async ({
    client,
  }) => {
    await client.setCode({ address: USDC, bytecode: "0x" });
    const promise = simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: USDC,
          data: "0xa9059cbb00000000000000000000000000000000000000000000000000000000deadbeef0000000000000000000000000000000000000000000000000000000000000001",
        },
      ],
    });

    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(SimulationValidationError);
  });

  test("default: value-only transfer to an EOA stays allowed", async ({
    client,
  }) => {
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: EOA,
          data: "0x",
          value: parseUnits("0.001", 18),
        },
      ],
    });
    expect(result.simulationTxs).toHaveLength(1);
  });

  test("unexpected contract: WETH9 runtime at the bundler on a native deposit", async ({
    client,
  }) => {
    // The bundler holds *unexpected* code (WETH9 runtime). The getRequirements
    // code check passes (code is non-empty); the executed call absorbs the
    // deposit value, so the retention check rejects it as BlacklistViolationError.
    const bundler = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
    const weth = getChainAddresses(mainnet.id).wNative!;
    const wethRuntime = await client.getCode({ address: weth });
    expect(wethRuntime).not.toBe("0x");
    await client.setCode({
      address: bundler,
      bytecode: wethRuntime!,
    });

    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(
        "0xBb50A5341368751024ddf33385BA8cf61fE65FF9", // KpkWETHVaultV2
        mainnet.id,
      );
    const vaultData = await morpho.getData();
    const action = morpho.deposit({
      nativeAmount: parseUnits("0.001", 18),
      userAddress: client.account.address,
      vaultData,
    });
    // Native funding emits no token requirement to satisfy.
    await action.getRequirements();
    const tx = action.buildTx();
    const promise = simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      ],
    });
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(BlacklistViolationError);
  });

  test("unexpected contract: USDC runtime at the bundler fails the declared deposit limits", async ({
    client,
  }) => {
    // The bundler holds USDC's runtime: its proxy fallback resolves to an
    // implementation slot that is empty at this address, so the deposit call
    // executes as a no-op success. Only the caller-declared outcome limits
    // expose it.
    const bundler = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
    const usdcRuntime = await client.getCode({ address: USDC });
    expect(usdcRuntime).not.toBe("0x");
    await client.setCode({ address: bundler, bytecode: usdcRuntime! });

    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(KEYROCK_USDC_VAULT_V2, mainnet.id);
    const vaultData = await morpho.getData();
    const assets = parseUnits("1", 6);
    const action = morpho.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData,
    });
    for (const requirement of await action.getRequirements()) {
      if (!("to" in requirement)) continue;
      await client.sendTransaction({
        account: client.account,
        to: requirement.to,
        data: requirement.data,
        value: requirement.value,
      });
    }
    await client.deal({ erc20: USDC, amount: assets });
    const tx = action.buildTx();
    const promise = simulate(configFor(client), {
      chainId: mainnet.id,
      limits: {
        operations: [
          {
            type: "vaultV2Deposit",
            vault: KEYROCK_USDC_VAULT_V2,
            account: client.account.address,
            slippageTolerance: 0n,
            quote: { sharesMinted: 1n, assetsPaid: assets },
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      ],
    });
    await expectFailClosed(promise, "revert");
    await expect(promise).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  });

  test("accepted residual: unexpected code that no-ops without declared limits", async ({
    client,
  }) => {
    // Same unexpected-code setup with no declared limits: the no-op call
    // resolves and the user receives no vault shares. This pins the
    // documented residual — tightening it must be a deliberate change.
    const bundler = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
    const usdcRuntime = await client.getCode({ address: USDC });
    expect(usdcRuntime).not.toBe("0x");
    await client.setCode({ address: bundler, bytecode: usdcRuntime! });

    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(KEYROCK_USDC_VAULT_V2, mainnet.id);
    const vaultData = await morpho.getData();
    const assets = parseUnits("1", 6);
    const action = morpho.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData,
    });
    for (const requirement of await action.getRequirements()) {
      if (!("to" in requirement)) continue;
      await client.sendTransaction({
        account: client.account,
        to: requirement.to,
        data: requirement.data,
        value: requirement.value,
      });
    }
    await client.deal({ erc20: USDC, amount: assets });
    const tx = action.buildTx();
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      ],
    });
    expect(
      result.transfers.filter(
        (transfer) =>
          isAddressEqual(transfer.token, KEYROCK_USDC_VAULT_V2) &&
          isAddressEqual(transfer.to, client.account.address),
      ),
    ).toEqual([]);
  });
});
