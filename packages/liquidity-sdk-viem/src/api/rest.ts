import type { MarketId } from "@morpho-org/blue-sdk";
import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";
import type { Address, Hash, Hex } from "viem";
import {
  MissingVaultV2LiquidityApiDataError,
  VaultV2LiquidityApiError,
} from "../errors.js";

interface ApiEnvelope<Data> {
  readonly data: Data;
}

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

interface VaultV2CapResponse {
  readonly cap_id: Hash;
  readonly cap_data: Hex;
  readonly allocated_assets: string;
  readonly absolute_cap: string;
  readonly relative_cap_wad: string;
  readonly cap_type: "adapter" | "collateral" | "market_v1";
  readonly market_id?: MarketId;
  readonly collateral_address?: Address;
}

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
  readonly last_indexed_block?: string;
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

async function requestApi<Data>(
  path: string,
  responseKind: "envelope" | "root" = "envelope",
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

  let body: Data | ApiEnvelope<Data>;
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
  if (responseKind === "root") return body as Data;

  const data = (body as ApiEnvelope<Data>).data;
  if (data == null)
    throw new MissingVaultV2LiquidityApiDataError(url.toString());
  return data;
}

const apiSelector = (chainId: number, identifier: string) =>
  `${chainId}:${encodeURIComponent(identifier)}`;

/** @internal Fetches Vault V2 configuration from the Morpho REST API. */
export const fetchRestVaultV2 = (chainId: number, address: Address) =>
  requestApi<VaultV2Response>(`/v0/vaults-v2/${apiSelector(chainId, address)}`);

/** @internal Fetches Vault V2 accounting state from the Morpho REST API. */
export const fetchRestVaultV2State = (chainId: number, address: Address) =>
  requestApi<VaultV2StateResponse>(
    `/v1/vaults-v2/${apiSelector(chainId, address)}/state`,
  );

/** @internal Fetches Vault V2 adapter allocations and cap state from the Morpho REST API. */
export const fetchRestVaultV2Allocations = (
  chainId: number,
  address: Address,
) =>
  requestApi<VaultV2AllocationsResponse>(
    `/v0/vaults-v2/${apiSelector(chainId, address)}/allocations`,
  );

/** @internal Fetches Vault V2 adapter force-deallocation penalties from the Morpho REST API. */
export const fetchRestVaultV2WithdrawalOptions = (
  chainId: number,
  address: Address,
) =>
  requestApi<VaultV2WithdrawalOptionsResponse>(
    `/v0/vaults-v2/${apiSelector(chainId, address)}/withdrawal-options`,
  );

/** @internal Fetches Morpho Blue market configuration from the REST API. */
export const fetchRestMarket = (chainId: number, marketId: MarketId) =>
  requestApi<MarketResponse>(
    `/v0/blue/markets/${apiSelector(chainId, marketId)}`,
  );

/** @internal Fetches Morpho Blue market accounting state from the REST API. */
export const fetchRestMarketState = (chainId: number, marketId: MarketId) =>
  requestApi<MarketStateResponse>(
    `/v0/blue/markets/${apiSelector(chainId, marketId)}/state`,
  );

/** @internal Fetches a Morpho Blue market position from the REST API. */
export const fetchRestMarketPosition = ({
  chainId,
  marketId,
  user,
}: MarketPositionParameters) =>
  requestApi<MarketPositionResponse>(
    `/v0/blue/markets/${apiSelector(chainId, marketId)}/users/${encodeURIComponent(user)}/position`,
  );

/** @internal Fetches a Morpho Blue oracle price from the REST API. */
export const fetchRestOracleState = (chainId: number, address: Address) =>
  requestApi<OracleStateResponse>(
    `/v0/oracles/${apiSelector(chainId, address)}/state`,
  );

/** @internal Fetches a Morpho Blue market's adaptive-curve IRM state from the REST API. */
export const fetchRestMarketIrm = (chainId: number, marketId: MarketId) =>
  requestApi<MarketIrmResponse>(
    `/consumer/chains/${chainId}/markets/${encodeURIComponent(marketId)}/irm`,
    "root",
  );
