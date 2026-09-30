import {
  blueAbi,
  metaMorphoAbi,
  metaMorphoFactoryAbi,
  vaultBundlesV1Abi,
  vaultV2Abi,
  vaultV2FactoryAbi,
} from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Abi, type Address, encodeFunctionData, getAddress } from "viem";
import { mainnet } from "viem/chains";
import { ExternalServiceError } from "../../errors.js";
import { readBindings } from "./read-bindings.js";

const addresses = getChainAddresses(1);
const VAULT: Address = getAddress("0x1111111111111111111111111111111111111111");
const ASSET: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const OWNER: Address = getAddress("0x5555555555555555555555555555555555555555");

const permit = { kind: 0, data: "0x" } as const;

const depositTx = () => ({
  from: OWNER,
  to: addresses.bundles!.vaultBundlesV1!,
  data: encodeFunctionData({
    abi: vaultBundlesV1Abi as Abi,
    functionName: "vaultBundlesV1Deposit",
    args: [VAULT, 1n, 0n, permit, 0n, OWNER, 1n],
  }),
  value: 0n,
});

describe("readBindings", () => {
  test("default: binds a MetaMorpho v1 vault with its asset", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: addresses.metaMorphoFactory!,
      abi: metaMorphoFactoryAbi as Abi,
      functionName: "isMetaMorpho",
      result: true,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi as Abi,
      functionName: "asset",
      result: ASSET,
    });
    const bindings = await readBindings({
      client: handle.client,
      chainId: 1,
      transactions: [depositTx()],
      blockNumber: 24_000_000n,
    });
    expect(bindings.vaults).toEqual([
      { address: VAULT, kind: "vaultV1", asset: ASSET },
    ]);
    expect(bindings.preLiquidations).toEqual([]);
    // Reads were pinned to the block.
    for (const call of handle.request.mock.calls) {
      if (call[0].method === "eth_call") {
        expect(call[0].params?.[1]).toBe("0x16e3600");
      }
    }
  });

  test("behavior: a non-factory vault candidate binds via vaultV2Factory", async () => {
    const handle = createMockClient(mainnet);
    for (const factory of [
      addresses.metaMorphoFactory!,
      getAddress("0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101"),
    ]) {
      mockRead(handle, {
        address: factory,
        abi: metaMorphoFactoryAbi as Abi,
        functionName: "isMetaMorpho",
        result: false,
      });
    }
    mockRead(handle, {
      address: addresses.vaultV2Factory!,
      abi: vaultV2FactoryAbi as Abi,
      functionName: "isVaultV2",
      result: true,
    });
    mockRead(handle, {
      address: VAULT,
      abi: vaultV2Abi as Abi,
      functionName: "asset",
      result: ASSET,
    });
    const bindings = await readBindings({
      client: handle.client,
      chainId: 1,
      transactions: [
        {
          from: OWNER,
          to: VAULT,
          data: encodeFunctionData({
            abi: vaultV2Abi as Abi,
            functionName: "multicall",
            args: [[]],
          }),
          value: 0n,
        },
      ],
      blockNumber: 24_000_000n,
    });
    expect(bindings.vaults).toEqual([
      { address: VAULT, kind: "vaultV2", asset: ASSET },
    ]);
  });

  test("behavior: candidates matching no factory stay unbound", async () => {
    const handle = createMockClient(mainnet);
    for (const factory of [
      addresses.metaMorphoFactory!,
      getAddress("0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101"),
    ]) {
      mockRead(handle, {
        address: factory,
        abi: metaMorphoFactoryAbi as Abi,
        functionName: "isMetaMorpho",
        result: false,
      });
    }
    mockRead(handle, {
      address: addresses.vaultV2Factory!,
      abi: vaultV2FactoryAbi as Abi,
      functionName: "isVaultV2",
      result: false,
    });
    const bindings = await readBindings({
      client: handle.client,
      chainId: 1,
      transactions: [depositTx()],
      blockNumber: 24_000_000n,
    });
    expect(bindings.vaults).toEqual([]);
  });

  test("behavior: setAuthorization candidates stay unbound without a preliq factory match", async () => {
    const OPERATOR: Address = getAddress(
      "0x3333333333333333333333333333333333333333",
    );
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: addresses.preLiquidationFactory!,
      abi: [
        {
          type: "function",
          name: "isPreLiquidation",
          inputs: [{ name: "", type: "address" }],
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "view",
        },
      ] as const,
      functionName: "isPreLiquidation",
      result: false,
    });
    const bindings = await readBindings({
      client: handle.client,
      chainId: 1,
      transactions: [
        {
          from: OWNER,
          to: addresses.blue,
          data: encodeFunctionData({
            abi: blueAbi as Abi,
            functionName: "setAuthorization",
            args: [OPERATOR, true],
          }),
          value: 0n,
        },
      ],
      blockNumber: 24_000_000n,
    });
    expect(bindings.preLiquidations).toEqual([]);
  });

  test("error: ExternalServiceError when a factory read throws", async () => {
    const handle = createMockClient(mainnet);
    // No mocks: every eth_call throws "unhandled".
    await expect(
      readBindings({
        client: handle.client,
        chainId: 1,
        transactions: [depositTx()],
        blockNumber: 24_000_000n,
      }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
