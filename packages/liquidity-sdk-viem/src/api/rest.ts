import type { MarketId } from "@morpho-org/blue-sdk";
import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Hash,
  type Hex,
  isAddress,
  isAddressEqual,
  isHex,
  size,
} from "viem";
import {
  InvalidVaultV2LiquidityApiResponseError,
  MissingVaultV2LiquidityApiDataError,
  VaultV2LiquidityApiError,
} from "../errors.js";

interface VaultV2AssetResponse {
  readonly address: Address;
  readonly decimals: number;
  readonly name: string;
  readonly symbol: string;
}

interface VaultV2GatesResponse {
  readonly send_shares: Address | null;
  readonly receive_shares: Address | null;
  readonly send_assets: Address | null;
  readonly receive_assets: Address | null;
}

interface VaultV2Response {
  readonly chain_id: number;
  readonly address: Address;
  readonly last_indexed_block: string;
  readonly version: string;
  readonly name: string;
  readonly symbol: string;
  readonly asset: VaultV2AssetResponse;
  readonly decimals_offset: number;
  readonly factory_address: Address;
  readonly creation_block_number: string;
  readonly owner: Address;
  readonly curator: Address;
  readonly timelock_seconds: number;
  readonly management_fee_wad: string | null;
  readonly management_fee_recipient: Address | null;
  readonly performance_fee_wad: string | null;
  readonly performance_fee_recipient: Address | null;
  readonly max_rate_per_second_wad: string;
  readonly adapter_registry: Address;
  readonly liquidity_adapter: Address;
  readonly liquidity_data: Hex;
  readonly gates: VaultV2GatesResponse;
}

interface VaultV2StateResponse {
  readonly chain_id: number;
  readonly address: Address;
  readonly last_indexed_block: string;
  readonly last_accrual_timestamp: number;
  readonly total_assets: string;
  readonly total_supply: string;
  readonly withdrawable_assets: string;
  readonly allocated_assets: string;
  readonly idle_assets: string;
  readonly share_price_ray: string;
}

interface VaultV2CapResponseBase {
  readonly cap_id: Hash;
  readonly cap_data: Hex;
  readonly allocated_assets: string;
  readonly absolute_cap: string;
  readonly relative_cap_wad: string;
}

type VaultV2CapResponse = VaultV2CapResponseBase &
  (
    | {
        readonly cap_type: "adapter";
        readonly market_id?: MarketId;
        readonly collateral_address?: Address;
      }
    | {
        readonly cap_type: "collateral";
        readonly market_id?: MarketId;
        readonly collateral_address: Address;
      }
    | {
        readonly cap_type: "market_v1";
        readonly market_id: MarketId;
        readonly collateral_address?: Address;
      }
  );

interface VaultV2AdapterAllocationResponse {
  readonly adapter_address: Address;
  readonly adapter_kind:
    | "morpho_market_v1"
    | "morpho_market_v1_v2"
    | "morpho_vault_v1"
    | "morpho_vault_v2";
  readonly caps: readonly VaultV2CapResponse[];
}

interface VaultV2AllocationsResponse {
  readonly chain_id: number;
  readonly vault_address: Address;
  readonly last_indexed_block: string;
  readonly allocations: readonly VaultV2AdapterAllocationResponse[];
  readonly unscoped_caps: readonly VaultV2CapResponse[];
}

interface VaultV2AdapterPenaltyResponse {
  readonly adapter_address: Address;
  readonly adapter_kind:
    | "blue_market_adapter"
    | "vault_v1_adapter"
    | "vault_v2_adapter"
    | "unknown_adapter";
  readonly force_deallocatable_assets: string;
  readonly penalty_rate_wad: string;
}

interface VaultV2WithdrawalOptionsResponse {
  readonly chain_id: number;
  readonly vault_address: Address;
  readonly liquidity_adapter_available_assets: string;
  readonly idle_assets: string;
  readonly adapter_penalties: readonly VaultV2AdapterPenaltyResponse[];
}

interface MarketResponse {
  readonly chain_id: number;
  readonly market_id: MarketId;
  readonly loan_token: Address;
  readonly collateral_token: Address;
  readonly oracle_address: Address;
  readonly irm_address: Address;
  readonly lltv_wad: string;
  readonly creation_block_number: string;
}

interface MarketStateResponse {
  readonly chain_id: number;
  readonly market_id: MarketId;
  readonly last_indexed_block: string;
  readonly last_accrual_timestamp: number;
  readonly total_supply_assets: string;
  readonly total_supply_shares: string;
  readonly total_borrow_assets: string;
  readonly total_borrow_shares: string;
  readonly fee_wad: string;
}

interface MarketPositionResponse {
  readonly chain_id: number;
  readonly market_id: MarketId;
  readonly user_address: Address;
  readonly last_indexed_block: string;
  readonly collateral_assets: string;
  readonly supply_shares: string;
  readonly borrow_shares: string;
}

interface MarketPositionParameters {
  readonly chainId: number;
  readonly marketId: MarketId;
  readonly user: Address;
}

interface OracleStateResponse {
  readonly chain_id: number;
  readonly oracle_address: Address;
  readonly last_indexed_block: string;
  readonly last_updated_at?: string | null;
  readonly price?: string | null;
}

interface MarketIrmResponse {
  readonly chainId: number;
  readonly marketId: MarketId;
  readonly irmAddress: Address;
  /** @deprecated The consumer API always returns the fixed 90% target. */
  readonly targetUtilization: number;
  readonly utilization: number | null;
  readonly apyAtTarget: number | null;
  readonly rateAtTarget?: string | null;
  readonly borrowToTarget: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isDecimalString = (value: unknown): value is string =>
  typeof value === "string" && /^\d+$/.test(value);
const isAddressValue = (value: unknown): value is Address =>
  typeof value === "string" && isAddress(value);
const isNullableAddress = (value: unknown): value is Address | null =>
  value === null || isAddressValue(value);
const isHexValue = (value: unknown): value is Hex =>
  typeof value === "string" && isHex(value, { strict: true });
const isHashValue = (value: unknown): value is Hash =>
  isHexValue(value) && size(value) === 32;
const isNullableDecimalString = (value: unknown): value is string | null =>
  value === null || isDecimalString(value);

const responseValidators = {
  vault: (value: unknown): value is VaultV2Response => {
    if (!isRecord(value) || !isRecord(value.asset) || !isRecord(value.gates))
      return false;
    const { asset, gates } = value;
    return (
      isInteger(value.chain_id) &&
      isAddressValue(value.address) &&
      isDecimalString(value.last_indexed_block) &&
      typeof value.version === "string" &&
      typeof value.name === "string" &&
      typeof value.symbol === "string" &&
      isAddressValue(asset.address) &&
      isInteger(asset.decimals) &&
      typeof asset.name === "string" &&
      typeof asset.symbol === "string" &&
      isInteger(value.decimals_offset) &&
      isAddressValue(value.factory_address) &&
      isDecimalString(value.creation_block_number) &&
      isAddressValue(value.owner) &&
      isAddressValue(value.curator) &&
      isInteger(value.timelock_seconds) &&
      isNullableDecimalString(value.management_fee_wad) &&
      isNullableAddress(value.management_fee_recipient) &&
      isNullableDecimalString(value.performance_fee_wad) &&
      isNullableAddress(value.performance_fee_recipient) &&
      isDecimalString(value.max_rate_per_second_wad) &&
      isAddressValue(value.adapter_registry) &&
      isAddressValue(value.liquidity_adapter) &&
      isHexValue(value.liquidity_data) &&
      isNullableAddress(gates.send_shares) &&
      isNullableAddress(gates.receive_shares) &&
      isNullableAddress(gates.send_assets) &&
      isNullableAddress(gates.receive_assets)
    );
  },
  vaultState: (value: unknown): value is VaultV2StateResponse =>
    isRecord(value) &&
    isInteger(value.chain_id) &&
    isAddressValue(value.address) &&
    isDecimalString(value.last_indexed_block) &&
    isInteger(value.last_accrual_timestamp) &&
    isDecimalString(value.total_assets) &&
    isDecimalString(value.total_supply) &&
    isDecimalString(value.withdrawable_assets) &&
    isDecimalString(value.allocated_assets) &&
    isDecimalString(value.idle_assets) &&
    isDecimalString(value.share_price_ray),
  vaultAllocations: (value: unknown): value is VaultV2AllocationsResponse => {
    if (
      !isRecord(value) ||
      !isInteger(value.chain_id) ||
      !isAddressValue(value.vault_address) ||
      !isDecimalString(value.last_indexed_block) ||
      !Array.isArray(value.allocations) ||
      !Array.isArray(value.unscoped_caps)
    )
      return false;

    const caps = [...value.unscoped_caps];
    for (const adapter of value.allocations) {
      if (
        !isRecord(adapter) ||
        !isAddressValue(adapter.adapter_address) ||
        (adapter.adapter_kind !== "morpho_market_v1" &&
          adapter.adapter_kind !== "morpho_market_v1_v2" &&
          adapter.adapter_kind !== "morpho_vault_v1" &&
          adapter.adapter_kind !== "morpho_vault_v2") ||
        !Array.isArray(adapter.caps)
      )
        return false;
      caps.push(...adapter.caps);
    }

    return caps.every((cap) => {
      if (
        !isRecord(cap) ||
        !isHashValue(cap.cap_id) ||
        !isHexValue(cap.cap_data) ||
        !isDecimalString(cap.allocated_assets) ||
        !isDecimalString(cap.absolute_cap) ||
        !isDecimalString(cap.relative_cap_wad) ||
        (cap.market_id !== undefined && !isHashValue(cap.market_id)) ||
        (cap.collateral_address !== undefined &&
          !isAddressValue(cap.collateral_address))
      )
        return false;

      switch (cap.cap_type) {
        case "adapter":
          return true;
        case "collateral":
          return isAddressValue(cap.collateral_address);
        case "market_v1":
          return isHashValue(cap.market_id);
        default:
          return false;
      }
    });
  },
  withdrawalOptions: (
    value: unknown,
  ): value is VaultV2WithdrawalOptionsResponse =>
    isRecord(value) &&
    isInteger(value.chain_id) &&
    isAddressValue(value.vault_address) &&
    isDecimalString(value.liquidity_adapter_available_assets) &&
    isDecimalString(value.idle_assets) &&
    Array.isArray(value.adapter_penalties) &&
    value.adapter_penalties.every(
      (penalty) =>
        isRecord(penalty) &&
        isAddressValue(penalty.adapter_address) &&
        (penalty.adapter_kind === "blue_market_adapter" ||
          penalty.adapter_kind === "vault_v1_adapter" ||
          penalty.adapter_kind === "vault_v2_adapter" ||
          penalty.adapter_kind === "unknown_adapter") &&
        isDecimalString(penalty.force_deallocatable_assets) &&
        isDecimalString(penalty.penalty_rate_wad),
    ),
  market: (value: unknown): value is MarketResponse =>
    isRecord(value) &&
    isInteger(value.chain_id) &&
    isHashValue(value.market_id) &&
    isAddressValue(value.loan_token) &&
    isAddressValue(value.collateral_token) &&
    isAddressValue(value.oracle_address) &&
    isAddressValue(value.irm_address) &&
    isDecimalString(value.lltv_wad) &&
    isDecimalString(value.creation_block_number),
  marketState: (value: unknown): value is MarketStateResponse =>
    isRecord(value) &&
    isInteger(value.chain_id) &&
    isHashValue(value.market_id) &&
    isDecimalString(value.last_indexed_block) &&
    isInteger(value.last_accrual_timestamp) &&
    isDecimalString(value.total_supply_assets) &&
    isDecimalString(value.total_supply_shares) &&
    isDecimalString(value.total_borrow_assets) &&
    isDecimalString(value.total_borrow_shares) &&
    isDecimalString(value.fee_wad),
  marketPosition: (value: unknown): value is MarketPositionResponse =>
    isRecord(value) &&
    isInteger(value.chain_id) &&
    isHashValue(value.market_id) &&
    isAddressValue(value.user_address) &&
    isDecimalString(value.last_indexed_block) &&
    isDecimalString(value.collateral_assets) &&
    isDecimalString(value.supply_shares) &&
    isDecimalString(value.borrow_shares),
  oracleState: (value: unknown): value is OracleStateResponse =>
    isRecord(value) &&
    isInteger(value.chain_id) &&
    isAddressValue(value.oracle_address) &&
    isDecimalString(value.last_indexed_block) &&
    (value.last_updated_at === undefined ||
      value.last_updated_at === null ||
      isDecimalString(value.last_updated_at)) &&
    (value.price === undefined ||
      value.price === null ||
      isDecimalString(value.price)),
  marketIrm: (value: unknown): value is MarketIrmResponse =>
    isRecord(value) &&
    isInteger(value.chainId) &&
    isHashValue(value.marketId) &&
    isAddressValue(value.irmAddress) &&
    isFiniteNumber(value.targetUtilization) &&
    (value.utilization === null || isFiniteNumber(value.utilization)) &&
    (value.apyAtTarget === null || isFiniteNumber(value.apyAtTarget)) &&
    (value.rateAtTarget === undefined ||
      value.rateAtTarget === null ||
      isDecimalString(value.rateAtTarget)) &&
    (value.borrowToTarget === null || isFiniteNumber(value.borrowToTarget)),
};

async function requestApi<Data>(
  path: string,
  {
    validator,
    responseKind = "envelope",
  }: {
    readonly validator: (value: unknown) => value is Data;
    readonly responseKind?: "envelope" | "root";
  },
): Promise<Data> {
  const url = new URL(path, BLUE_API_BASE_URL);
  let response: Response;
  try {
    response = await globalThis.fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new VaultV2LiquidityApiError({
      url: url.toString(),
      cause: error,
    });
  }

  if (!response.ok)
    throw new VaultV2LiquidityApiError({
      url: url.toString(),
      status: response.status,
    });

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new VaultV2LiquidityApiError({
      url: url.toString(),
      status: response.status,
      cause: error,
    });
  }

  if (body == null)
    throw new MissingVaultV2LiquidityApiDataError(url.toString());
  const data =
    responseKind === "root" ? body : isRecord(body) ? body.data : null;
  if (data == null)
    throw new MissingVaultV2LiquidityApiDataError(url.toString());
  if (!validator(data))
    throw new InvalidVaultV2LiquidityApiResponseError(url.toString());
  return data;
}

const apiSelector = (chainId: number, identifier: string) =>
  `${chainId}:${encodeURIComponent(identifier)}`;

/** @internal Fetches Vault V2 configuration from the Morpho REST API. */
export const fetchRestVaultV2 = (chainId: number, address: Address) =>
  requestApi<VaultV2Response>(
    `/v0/vaults-v2/${apiSelector(chainId, address)}`,
    {
      validator: (value): value is VaultV2Response =>
        responseValidators.vault(value) &&
        value.chain_id === chainId &&
        isAddressEqual(value.address, address),
    },
  );

/** @internal Fetches Vault V2 accounting state from the Morpho REST API. */
export const fetchRestVaultV2State = (chainId: number, address: Address) =>
  requestApi<VaultV2StateResponse>(
    `/v1/vaults-v2/${apiSelector(chainId, address)}/state`,
    {
      validator: (value): value is VaultV2StateResponse =>
        responseValidators.vaultState(value) &&
        value.chain_id === chainId &&
        isAddressEqual(value.address, address),
    },
  );

/** @internal Fetches Vault V2 adapter allocations and cap state from the Morpho REST API. */
export const fetchRestVaultV2Allocations = (
  chainId: number,
  address: Address,
) =>
  requestApi<VaultV2AllocationsResponse>(
    `/v0/vaults-v2/${apiSelector(chainId, address)}/allocations`,
    {
      validator: (value): value is VaultV2AllocationsResponse =>
        responseValidators.vaultAllocations(value) &&
        value.chain_id === chainId &&
        isAddressEqual(value.vault_address, address),
    },
  );

/** @internal Fetches Vault V2 adapter force-deallocation penalties from the Morpho REST API. */
export const fetchRestVaultV2WithdrawalOptions = (
  chainId: number,
  address: Address,
) =>
  requestApi<VaultV2WithdrawalOptionsResponse>(
    `/v0/vaults-v2/${apiSelector(chainId, address)}/withdrawal-options`,
    {
      validator: (value): value is VaultV2WithdrawalOptionsResponse =>
        responseValidators.withdrawalOptions(value) &&
        value.chain_id === chainId &&
        isAddressEqual(value.vault_address, address),
    },
  );

/** @internal Fetches Morpho Blue market configuration from the REST API. */
export const fetchRestMarket = (chainId: number, marketId: MarketId) =>
  requestApi<MarketResponse>(
    `/v0/blue/markets/${apiSelector(chainId, marketId)}`,
    {
      validator: (value): value is MarketResponse =>
        responseValidators.market(value) &&
        value.chain_id === chainId &&
        value.market_id.toLowerCase() === marketId.toLowerCase(),
    },
  );

/** @internal Fetches Morpho Blue market accounting state from the REST API. */
export const fetchRestMarketState = (chainId: number, marketId: MarketId) =>
  requestApi<MarketStateResponse>(
    `/v0/blue/markets/${apiSelector(chainId, marketId)}/state`,
    {
      validator: (value): value is MarketStateResponse =>
        responseValidators.marketState(value) &&
        value.chain_id === chainId &&
        value.market_id.toLowerCase() === marketId.toLowerCase(),
    },
  );

/** @internal Fetches a Morpho Blue market position from the REST API. */
export const fetchRestMarketPosition = ({
  chainId,
  marketId,
  user,
}: MarketPositionParameters) =>
  requestApi<MarketPositionResponse>(
    `/v0/blue/markets/${apiSelector(chainId, marketId)}/users/${encodeURIComponent(user)}/position`,
    {
      validator: (value): value is MarketPositionResponse =>
        responseValidators.marketPosition(value) &&
        value.chain_id === chainId &&
        value.market_id.toLowerCase() === marketId.toLowerCase() &&
        isAddressEqual(value.user_address, user),
    },
  );

/** @internal Fetches a Morpho Blue oracle price from the REST API. */
export const fetchRestOracleState = (chainId: number, address: Address) =>
  requestApi<OracleStateResponse>(
    `/v0/oracles/${apiSelector(chainId, address)}/state`,
    {
      validator: (value): value is OracleStateResponse =>
        responseValidators.oracleState(value) &&
        value.chain_id === chainId &&
        isAddressEqual(value.oracle_address, address),
    },
  );

/** @internal Fetches a Morpho Blue market's adaptive-curve IRM state from the REST API. */
export const fetchRestMarketIrm = (chainId: number, marketId: MarketId) =>
  requestApi<MarketIrmResponse>(
    `/consumer/chains/${chainId}/markets/${encodeURIComponent(marketId)}/irm`,
    {
      validator: (value): value is MarketIrmResponse =>
        responseValidators.marketIrm(value) &&
        value.chainId === chainId &&
        value.marketId.toLowerCase() === marketId.toLowerCase(),
      responseKind: "root",
    },
  );
