import {
  ConstantWrappedToken,
  Eip5267Domain,
  ExchangeRateWrappedToken,
  getChainAddresses,
  getUnwrappedToken,
  NATIVE_ADDRESS,
  Token,
  UnknownTokenError,
} from "@morpho-org/blue-sdk";
import {
  type Address,
  BaseError,
  type Client,
  ContractFunctionRevertedError,
  encodeFunctionData,
  erc20Abi,
  erc20Abi_bytes32,
  getContractError,
  hexToString,
  isAddressEqual,
  isHex,
  size,
  toFunctionSelector,
} from "viem";
import { call, getChainId, readContract } from "viem/actions";
import { erc5267Abi, wstEthAbi } from "../abis.js";
import { readDeploylessContract } from "../deployless.js";
import {
  MalformedTokenMetadataError,
  type TokenMetadataField,
} from "../error.js";
import { abi, code, deployedCode } from "../queries/GetToken.js";
import type { DeploylessFetchParameters, FetchParameters } from "../types.js";
import {
  catchRevertOnly,
  isContractRevertError,
  isTransportError,
  isUndecodableResultError,
} from "../utils.js";

/**
 * Decodes ERC20 `bytes32` metadata results while leaving string metadata unchanged.
 *
 * @param hexOrStr - Metadata value returned by an ERC20 `name` or `symbol` read.
 * @returns The decoded string for hex input, or the original string for non-hex input.
 * @example
 * ```ts
 * import { decodeBytes32String } from "@morpho-org/blue-sdk-viem";
 *
 * const symbol = decodeBytes32String("0x5553444300000000000000000000000000000000000000000000000000000000");
 * ```
 */
export const decodeBytes32String = (hexOrStr: string) => {
  if (isHex(hexOrStr)) {
    return hexToString(hexOrStr, { size: 32 });
  }

  return hexOrStr;
};

// A failed metadata read means the token contract does not answer at all.
// Undecodable data counts as absent only for the first `string` read of
// `name`/`symbol`, so a bytes32 token (e.g. MKR) still reaches the bytes32
// retry; undecodable `bytes32` retries and `eip712Domain()` results reject.
// Data-less reverts (e.g. geth's `{code: -32000, message: "execution
// reverted"}`) surface as `ExecutionRevertedError`, not
// `ContractFunctionRevertedError`. Transport errors are never absent — even
// when the response body says "execution reverted" (e.g. a 503 carrying a
// JSON-RPC revert message, which viem wraps in `ExecutionRevertedError`) —
// and propagate unchanged.
const isAbsentResult = (error: unknown): boolean =>
  !isTransportError(error) &&
  (isContractRevertError(error) || isUndecodableResultError(error));

// Absent on a retry or on `eip712Domain()` means the call reverted or the
// contract has no code; non-empty data that does not decode is malformed.
const catchRevertOrMalformed =
  (token: Address, field: TokenMetadataField) =>
  (error: unknown): undefined => {
    if (
      !isTransportError(error) &&
      !isContractRevertError(error) &&
      isUndecodableResultError(error)
    ) {
      throw new MalformedTokenMetadataError(token, field, { cause: error });
    }
    return catchRevertOnly(undefined)(error);
  };

// Isolate direct reads from multicall; unlike the 60k staticcall stipend, this
// allowance includes intrinsic gas and L2 overhead (including Tempo's fixed costs).
const DIRECT_READ_GAS_LIMIT = 2_000_000n;

const MALFORMED_SELECTOR_FIELDS: Record<string, TokenMetadataField> = {
  [toFunctionSelector("name()")]: "name",
  [toFunctionSelector("symbol()")]: "symbol",
  [toFunctionSelector("eip712Domain()")]: "eip712Domain",
};

/**
 * Fetches token metadata, EIP-5267 permit domain metadata, and wrapper metadata.
 *
 * Reads native token metadata locally for `NATIVE_ADDRESS`. For ERC20 tokens, uses the deployless
 * `GetToken` query by default and falls back to ERC20, EIP-5267, wstETH, and local unwrap-token
 * reads when allowed.
 * Deployless metadata staticcalls are gas-capped (60,000 for ERC20 fields, 100,000 for EIP-5267).
 * Direct reads use a 2,000,000 gas allowance including intrinsic gas and L2 overhead,
 * bypassing viem's shared multicall batching to isolate token failures.
 * Gas exhaustion in direct reads propagates as a viem error; it is not classified as a revert.
 *
 * Only `name`, `symbol` and `eip712Domain` resolve to `undefined`: when the call reverts,
 * the contract has no code, or a deployless call exhausts its stipend (60,000 gas for
 * `name`/`symbol`, 100,000 for `eip712Domain`). A `name`/`symbol` that does not decode as `string` is
 * retried as `bytes32`; a malformed `bytes32` retry or `eip712Domain()` result throws
 * `MalformedTokenMetadataError`, and transport errors propagate. Under `deployless: true` or
 * `"force"`, a `GetToken` query that reports malformed `name()`/`symbol()`/`eip712Domain()`
 * returndata throws `MalformedTokenMetadataError` without falling back: the query validates
 * returndata more strictly than viem's decoding (for example, it requires the `0x20` string
 * offset).
 *
 * @param address - Token address, or `NATIVE_ADDRESS` for the native asset.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `Token`, `ConstantWrappedToken`, or `ExchangeRateWrappedToken` entity.
 * @throws {UnsupportedChainIdError} when the client's chain is absent from the address registry
 * (any ERC-20 token; native-asset reads skip the registry lookup).
 * @throws {UnknownTokenError} when `decimals()` reverts, has no code, returns
 *   undecodable data, or is out of range.
 * @throws {MalformedTokenMetadataError} when `eip712Domain()` or the `bytes32`
 *   `name`/`symbol` retry returns non-empty data that does not decode, or when the deployless
 *   query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
 * @throws {viem.BaseError} when a direct read exhausts its gas limit or an RPC transport failure occurs; a transport failure's cause chain contains a
 * viem.HttpRequestError, viem.TimeoutError, viem.LimitExceededRpcError, viem.SocketClosedError, or viem.WebSocketRequestError (detect with
 * isTransportError).
 * @example
 * ```ts
 * import type { Token } from "@morpho-org/blue-sdk";
 * import { fetchToken } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
 *
 * const token: Token = await fetchToken(usdc, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchToken(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  const chainId = await getChainId(client);

  if (typeof address === "string" && isAddressEqual(address, NATIVE_ADDRESS)) {
    return Token.native(chainId);
  }

  const { wstEth, stEth } = getChainAddresses(chainId);
  const isWstEth =
    wstEth != null &&
    typeof address === "string" &&
    isAddressEqual(address, wstEth);

  if (deployless) {
    const token = await readDeploylessContract(client, {
      ...parameters,
      abi,
      code,
      deployedCode,
      functionName: "query",
      args: [address, isWstEth],
    }).catch((error: unknown) => {
      if (isTransportError(error)) {
        throw error;
      }
      // The query's `MalformedReturnData` verdict holds in every deployless
      // mode: its returndata checks are stricter than the direct reads'.
      const field = getMalformedTokenMetadataField(error);
      if (field != null) {
        throw new MalformedTokenMetadataError(address, field, {
          cause: error,
        });
      }
      if (deployless === "force") {
        throw error;
      }
      // Fallback to multicall if deployless call fails.
      return undefined;
    });

    // The query reports decimals 0 for a genuine 0-decimal token, a failed
    // `decimals()` read, and a non-standard returndata length alike: fall
    // through to direct reads whenever it reports 0.
    if (token !== undefined && token.decimals !== 0n) {
      const eip5267Domain = token.hasEip5267Domain
        ? new Eip5267Domain(token.eip5267Domain)
        : undefined;
      const metadata = {
        address,
        decimals: token.decimals,
        symbol: token.hasSymbol ? token.symbol : undefined,
        name: token.hasName ? token.name : undefined,
        eip5267Domain,
      };

      if (isWstEth && stEth != null) {
        return new ExchangeRateWrappedToken(
          metadata,
          stEth,
          token.stEthPerWstEth,
        );
      }

      const unwrapToken = getUnwrappedToken(address, chainId);
      if (unwrapToken) {
        return new ConstantWrappedToken(metadata, unwrapToken, token.decimals);
      }

      return new Token(metadata);
    }
  }

  const metadataParameters = { ...parameters, gas: DIRECT_READ_GAS_LIMIT };
  const [decimals, symbol, name, eip5267Domain] = await Promise.all([
    readContract(client, {
      ...metadataParameters,
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }).then(
      (value) => {
        if (!Number.isInteger(value) || value < 0 || value > 255) {
          throw new UnknownTokenError(address);
        }
        return value;
      },
      (error) => {
        if (isAbsentResult(error)) {
          throw new UnknownTokenError(address);
        }
        throw error;
      },
    ),
    readTokenText(client, {
      address,
      functionName: "symbol",
      metadataParameters,
    }),
    readTokenText(client, {
      address,
      functionName: "name",
      metadataParameters,
    }),
    readContract(client, {
      ...metadataParameters,
      address,
      abi: erc5267Abi,
      functionName: "eip712Domain",
    })
      .then(
        ([
          fields,
          domainName,
          version,
          domainChainId,
          verifyingContract,
          salt,
          extensions,
        ]) =>
          new Eip5267Domain({
            fields,
            name: domainName,
            version,
            chainId: domainChainId,
            verifyingContract,
            salt,
            extensions,
          }),
      )
      .catch(catchRevertOrMalformed(address, "eip712Domain")),
  ]);

  const token = {
    address,
    name,
    symbol,
    decimals,
    eip5267Domain,
  };

  if (isWstEth && wstEth != null && stEth != null) {
    const stEthPerWstEth = await readContract(client, {
      ...metadataParameters,
      address: wstEth,
      abi: wstEthAbi,
      functionName: "stEthPerToken",
    });

    return new ExchangeRateWrappedToken(token, stEth, stEthPerWstEth);
  }

  const unwrapToken = getUnwrappedToken(address, chainId);
  if (unwrapToken) {
    return new ConstantWrappedToken(token, unwrapToken, token.decimals);
  }

  return new Token(token);
}

function getMalformedTokenMetadataField(error: unknown) {
  if (!(error instanceof BaseError)) {
    return undefined;
  }

  const revertError = error.walk(
    (err) => err instanceof ContractFunctionRevertedError,
  );
  if (
    !(revertError instanceof ContractFunctionRevertedError) ||
    revertError.data?.errorName !== "MalformedReturnData"
  ) {
    return undefined;
  }

  const [selector] = revertError.data.args ?? [];
  return typeof selector === "string"
    ? MALFORMED_SELECTOR_FIELDS[selector.toLowerCase()]
    : undefined;
}

function readTokenText(
  client: Client,
  {
    address,
    functionName,
    metadataParameters,
  }: {
    readonly address: Address;
    readonly functionName: "name" | "symbol";
    readonly metadataParameters: FetchParameters & { readonly gas: bigint };
  },
) {
  return readContract(client, {
    ...metadataParameters,
    address,
    abi: erc20Abi,
    functionName,
  }).catch((error) => {
    if (!isAbsentResult(error)) {
      throw error;
    }
    // Raw `call` so the bytes32 retry rejects non-32-byte returndata:
    // viem's `readContract` decode would ignore trailing bytes.
    return call(client, {
      ...metadataParameters,
      to: address,
      data: encodeFunctionData({
        abi: erc20Abi_bytes32,
        functionName,
      }),
    })
      .catch((callError: unknown) => {
        // `call` wraps rejects in `CallExecutionError`; map them through
        // the contract-error classifier so node reverts (e.g. -32603)
        // classify exactly as `readContract` rejects do.
        throw callError instanceof BaseError
          ? getContractError(callError, {
              abi: erc20Abi_bytes32,
              functionName,
              address,
              args: [],
            })
          : callError;
      })
      .then(({ data }) => {
        if (data == null || data === "0x") {
          return undefined;
        }
        if (size(data) !== 32) {
          throw new MalformedTokenMetadataError(address, functionName);
        }
        return decodeBytes32String(data);
      })
      .catch(catchRevertOrMalformed(address, functionName));
  });
}
