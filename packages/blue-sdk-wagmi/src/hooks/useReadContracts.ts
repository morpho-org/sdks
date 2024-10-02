import type { Abi, ContractFunctionArgs, ContractFunctionName } from "viem";
import { ReadContractData, readContractQueryOptions } from "wagmi/query";
import { mergeDeepEqual } from "../utils";

import { useQueries } from "@tanstack/react-query";
import {
  Config,
  ResolvedRegister,
  UseReadContractParameters,
  UseReadContractReturnType,
  useChainId,
  useConfig,
} from "wagmi";

export type UseReadContractsParameters<
  abi extends Abi | readonly unknown[] = Abi,
  functionName extends ContractFunctionName<
    abi,
    "pure" | "view"
  > = ContractFunctionName<abi, "pure" | "view">,
  args extends ContractFunctionArgs<
    abi,
    "pure" | "view",
    functionName
  > = ContractFunctionArgs<abi, "pure" | "view", functionName>,
  config extends Config = Config,
  selectData = ReadContractData<abi, functionName, args>,
> = UseReadContractParameters<abi, functionName, args, config, selectData>[];

export type UseReadContractsReturnType<
  abi extends Abi | readonly unknown[] = Abi,
  functionName extends ContractFunctionName<
    abi,
    "pure" | "view"
  > = ContractFunctionName<abi, "pure" | "view">,
  args extends ContractFunctionArgs<
    abi,
    "pure" | "view",
    functionName
  > = ContractFunctionArgs<abi, "pure" | "view", functionName>,
  selectData = ReadContractData<abi, functionName, args>,
> = UseReadContractReturnType<abi, functionName, args, selectData>[];

/** https://wagmi.sh/react/api/hooks/useReadContracts */
export function useReadContracts<
  const abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi, "pure" | "view">,
  args extends ContractFunctionArgs<abi, "pure" | "view", functionName>,
  config extends Config = ResolvedRegister["config"],
  selectData = ReadContractData<abi, functionName, args>,
>(
  allParameters: UseReadContractsParameters<
    abi,
    functionName,
    args,
    config,
    selectData
  > = [],
): UseReadContractsReturnType<abi, functionName, args, selectData> {
  const config = useConfig();
  const chainId = useChainId();

  return useQueries({
    queries: allParameters.map((parameters) => {
      const { abi, address, functionName, query = {} } = parameters;
      // @ts-ignore
      const code = parameters.code as Hex | undefined;

      const options = readContractQueryOptions<config, abi, functionName, args>(
        // @ts-ignore
        parameters.config ?? config,
        { ...(parameters as any), chainId: parameters.chainId ?? chainId },
      );

      const enabled = Boolean(
        (address || code) && abi && functionName && (query.enabled ?? true),
      );

      return {
        ...query,
        ...options,
        enabled,
        structuralSharing: query.structuralSharing ?? mergeDeepEqual,
      };
    }),
  });
}
