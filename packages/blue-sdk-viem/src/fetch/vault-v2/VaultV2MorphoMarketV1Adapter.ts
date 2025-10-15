import {
  AccrualVaultV2MorphoMarketV1Adapter,
  VaultV2MorphoMarketV1Adapter,
} from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { morphoMarketV1AdapterAbi } from "../../abis";
import {
  abi,
  code,
} from "../../queries/vault-v2/GetVaultV2MorphoMarketV1Adapter";
import type { DeploylessFetchParameters } from "../../types";
import { fetchAccrualPosition } from "../Position";

export async function fetchVaultV2MorphoMarketV1Adapter(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  if (deployless) {
    try {
      const adapter = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address],
      });

      return new VaultV2MorphoMarketV1Adapter({
        ...adapter,
        marketParamsList: [...adapter.marketParamsList],
        address,
      });
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  const [parentVault, adapterId, skimRecipient, marketParamsListLength] =
    await Promise.all([
      readContract(client, {
        ...parameters,
        address,
        abi: morphoMarketV1AdapterAbi,
        functionName: "parentVault",
      }),
      readContract(client, {
        ...parameters,
        address,
        abi: morphoMarketV1AdapterAbi,
        functionName: "adapterId",
      }),
      readContract(client, {
        ...parameters,
        address,
        abi: morphoMarketV1AdapterAbi,
        functionName: "skimRecipient",
      }),
      readContract(client, {
        ...parameters,
        address,
        abi: morphoMarketV1AdapterAbi,
        functionName: "marketParamsListLength",
      }),
    ]);

  const marketParamsList = await Promise.all(
    new Array(Number(marketParamsListLength)).fill(null).map((_, i) =>
      readContract(client, {
        ...parameters,
        address,
        abi: morphoMarketV1AdapterAbi,
        functionName: "marketParamsList",
        args: [BigInt(i)],
      }),
    ),
  );

  return new VaultV2MorphoMarketV1Adapter({
    parentVault,
    adapterId,
    skimRecipient,
    address,
    marketParamsList: marketParamsList.map(
      ([loanToken, collateralToken, oracle, irm, lltv]) => ({
        loanToken,
        collateralToken,
        oracle,
        irm,
        lltv,
      }),
    ),
  });
}

export async function fetchAccrualVaultV2MorphoMarketV1Adapter(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  const adapter = await fetchVaultV2MorphoMarketV1Adapter(
    address,
    client,
    parameters,
  );
  const positions = await Promise.all(
    adapter.marketParamsList.map((params) =>
      fetchAccrualPosition(address, params.id, client, parameters),
    ),
  );

  return new AccrualVaultV2MorphoMarketV1Adapter(adapter, positions);
}
