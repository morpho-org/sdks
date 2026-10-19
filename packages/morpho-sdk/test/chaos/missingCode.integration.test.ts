import { UnknownTokenError } from "@morpho-org/blue-sdk";
import {
  fetchMarket,
  fetchToken,
  fetchVault,
  fetchVaultV2,
} from "@morpho-org/blue-sdk-viem";
import {
  getChainAddress,
  getChainAddresses,
  RegistryValueAlreadyRegisteredError,
  registerCustomAddresses,
} from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { expectFailClosed } from "@morpho-org/test/chaos";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  ContractFunctionExecutionError,
  maxUint256,
  parseUnits,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MissingContractCodeError,
  morphoViemExtension,
} from "../../src/index.js";
import { CbbtcUsdcBlue, WbtcUsdcSourceMarket } from "../fixtures/blue.js";
import { SteakhouseUsdcVaultV1 } from "../fixtures/vaultV1.js";
import { KeyrockUsdcVaultV2, KpkWETHVaultV2 } from "../fixtures/vaultV2.js";
import { setUpSingleAdapterVaultV2 } from "../helpers/vaultV2.js";

/**
 * Chaos S8: a registry address with no contract code. `anvil_setCode` wipes the
 * deployed contract so every flow must fail closed at `getRequirements()`
 * before it can plan calldata that would no-op onchain.
 */

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 24_593_903n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({
      address: client.account.address,
      bytecode: "0x",
    });
    await use(client);
  },
});

// The bundles periphery (BlueBundlesV1, VaultBundlesV1, VaultExitBundlesV1) and
// the adapter factory are deployed at this later pin, matching
// vaultV2.forceWithdraw.integration.test.ts. Flow tests that wipe a single role
// need the other roles deployed so the guard reports the intended target.
const exitBundlesTest = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 26_150_000n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({
      address: client.account.address,
      bytecode: "0x",
    });
    await use(client);
  },
});

type RegistryRole =
  | "bundles.blueBundlesV1"
  | "bundles.vaultBundlesV1"
  | "bundles.vaultExitBundlesV1"
  | "blue"
  | "permit2";

const roleAddress = (role: RegistryRole): Address =>
  role === "permit2"
    ? getChainAddresses(mainnet.id).permit2!
    : getChainAddress(mainnet.id, role);

const wipeCode = (client: AnvilTestClient, address: Address) =>
  client.setCode({ address, bytecode: "0x" }).then(() => {});

const morphoOf = (client: AnvilTestClient) =>
  client.extend(morphoViemExtension({ supportSignature: true })).morpho;

const expectMissingCode = async (
  promise: Promise<unknown>,
  role: RegistryRole,
) => {
  await expectFailClosed(promise, "config");
  await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
  await expect(promise).rejects.toMatchObject({
    address: roleAddress(role),
    chainId: mainnet.id,
    role,
  });
};

describe("chaos: S8 missing contract", () => {
  describe.each(["bundles.blueBundlesV1", "blue", "permit2"] as const)(
    "Blue supply: MissingContractCodeError when %s has no code",
    (role) => {
      exitBundlesTest("rejects at getRequirements", async ({ client }) => {
        await wipeCode(client, roleAddress(role));
        const market = morphoOf(client).blue(CbbtcUsdcBlue, mainnet.id);
        const action = market.supply({
          userAddress: client.account.address,
          assets: parseUnits("1", 6),
          deadline: maxUint256,
        });
        await expectMissingCode(
          action.getRequirements({ useSimplePermit: true }),
          role,
        );
      });
    },
  );

  describe.each(["bundles.vaultBundlesV1", "permit2"] as const)(
    "deposit ERC-20: MissingContractCodeError when %s has no code",
    (role) => {
      exitBundlesTest("VaultV1", async ({ client }) => {
        const vault = morphoOf(client).vaultV1(
          SteakhouseUsdcVaultV1.address,
          mainnet.id,
        );
        const vaultData = await vault.getData();
        await wipeCode(client, roleAddress(role));
        await expectMissingCode(
          vault
            .deposit({
              amount: parseUnits("1", 6),
              userAddress: client.account.address,
              vaultData,
            })
            .getRequirements(),
          role,
        );
      });

      exitBundlesTest("VaultV2", async ({ client }) => {
        const vault = morphoOf(client).vaultV2(
          KeyrockUsdcVaultV2.address,
          mainnet.id,
        );
        const vaultData = await vault.getData();
        await wipeCode(client, roleAddress(role));
        await expectMissingCode(
          vault
            .deposit({
              amount: parseUnits("1", 6),
              userAddress: client.account.address,
              vaultData,
            })
            .getRequirements(),
          role,
        );
      });
    },
  );

  exitBundlesTest(
    "VaultV2 native deposit: the funding.value > 0n branch still checks",
    async ({ client }) => {
      const role = "bundles.vaultBundlesV1";
      const vault = morphoOf(client).vaultV2(
        KpkWETHVaultV2.address,
        mainnet.id,
      );
      const vaultData = await vault.getData();
      await wipeCode(client, roleAddress(role));
      await expectMissingCode(
        vault
          .deposit({
            nativeAmount: parseUnits("0.001", 18),
            userAddress: client.account.address,
            vaultData,
          })
          .getRequirements(),
        role,
      );
    },
  );
});

exitBundlesTest.describe("chaos: S8 missing contract", () => {
  exitBundlesTest(
    "VaultV2 forceWithdraw: MissingContractCodeError when vaultExitBundlesV1 has no code",
    async ({ client }) => {
      const role = "bundles.vaultExitBundlesV1";

      const { vault: vaultAddress, depositAndAllocate } =
        await setUpSingleAdapterVaultV2(client, {
          asset: CbbtcUsdcBlue.loanToken,
          markets: [CbbtcUsdcBlue, WbtcUsdcSourceMarket],
          liquidityMarket: CbbtcUsdcBlue,
        });
      await depositAndAllocate({
        assets: parseUnits("100", 6),
        perMarket: [{ market: CbbtcUsdcBlue, assets: parseUnits("60", 6) }],
      });
      const vault = morphoOf(client).vaultV2(vaultAddress, mainnet.id);
      const vaultData = await vault.getData();

      await wipeCode(client, roleAddress(role));
      await expectMissingCode(
        vault
          .forceWithdraw({
            exitAssets: parseUnits("90", 6),
            vaultData,
            userAddress: client.account.address,
          })
          .getRequirements(),
        role,
      );
    },
  );

  exitBundlesTest(
    "unexpected contract: a non-adapter contract at the vault's adapter rejects the read",
    async ({ client }) => {
      const { vault: vaultAddress, adapter } = await setUpSingleAdapterVaultV2(
        client,
        {
          asset: CbbtcUsdcBlue.loanToken,
          markets: [CbbtcUsdcBlue, WbtcUsdcSourceMarket],
          liquidityMarket: CbbtcUsdcBlue,
        },
      );
      const usdcRuntime = await client.getCode({
        address: CbbtcUsdcBlue.loanToken,
      });
      expect(usdcRuntime).not.toBe("0x");
      await client.setCode({ address: adapter, bytecode: usdcRuntime! });

      const vault = morphoOf(client).vaultV2(vaultAddress, mainnet.id);
      const promise = vault.getData();
      await expect(promise).rejects.toBeInstanceOf(
        ContractFunctionExecutionError,
      );
    },
  );
});

describe("chaos: S8 reads on code-less contracts", () => {
  test("fetchMarket rejects when blue has no code", async ({ client }) => {
    await wipeCode(client, getChainAddress(mainnet.id, "blue"));
    const promise = fetchMarket(CbbtcUsdcBlue.id, client);
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(
      ContractFunctionExecutionError,
    );
  });

  test("fetchVault rejects when the VaultV1 has no code", async ({
    client,
  }) => {
    await wipeCode(client, SteakhouseUsdcVaultV1.address);
    const promise = fetchVault(SteakhouseUsdcVaultV1.address, client);
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(
      ContractFunctionExecutionError,
    );
  });

  test("fetchVaultV2 rejects when the VaultV2 has no code", async ({
    client,
  }) => {
    await wipeCode(client, KeyrockUsdcVaultV2.address);
    const promise = fetchVaultV2(KeyrockUsdcVaultV2.address, client);
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(
      ContractFunctionExecutionError,
    );
  });

  test("fetchToken rejects on a code-less address", async ({ client }) => {
    const promise = fetchToken(zeroAddress, client);
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(UnknownTokenError);
  });
});

describe("chaos: S8 registry protection", () => {
  test("registerCustomAddresses refuses to repoint mainnet blue at an EOA", () => {
    // The "EOA-chain variant" cannot be constructed on a pinned mainnet fork:
    // the registry rejects overrides of already-registered addresses, so the
    // only way `blue` can lack code on mainnet is a wiped deployment, covered
    // above via `anvil_setCode`.
    expect(() =>
      registerCustomAddresses({
        addresses: {
          [mainnet.id]: {
            blue: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
          },
        },
      }),
    ).toThrow(RegistryValueAlreadyRegisteredError);
  });
});
