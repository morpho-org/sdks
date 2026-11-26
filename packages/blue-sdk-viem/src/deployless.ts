import {
  type Abi,
  AbiDecodingZeroDataError,
  BaseError,
  type Chain,
  type Client,
  type ContractFunctionArgs,
  type ContractFunctionName,
  ContractFunctionRevertedError,
  getAddress,
  type Hex,
  isAddressEqual,
  keccak256,
  type ReadContractParameters,
  TimeoutError,
  toHex,
  withTimeout,
} from "viem";
import { readContract } from "viem/actions";
import { isTransportError } from "./utils.js";

/** @internal Maximum duration of the runtime state-override attempt in milliseconds. */
export const OVERRIDE_TIMEOUT_MS = 5_000;

/** @internal Duration of a client's unsupported-override verdict in milliseconds. */
export const OVERRIDE_UNSUPPORTED_TTL_MS = 10 * 60_000;

/** @internal Backoff after a timed-out override later fails with a non-timeout transport error. */
export const OVERRIDE_TRANSPORT_BACKOFF_MS = 30_000;

type OverrideVerdict = { readonly until: number };

const overridesUnsupportedUntil = new WeakMap<Client, OverrideVerdict>();
const verdictDeadlines = new WeakMap<OverrideVerdict, object>();

/** @internal Stable placement for runtime query bytecode in state overrides. */
export const QUERY_ADDRESS = getAddress(
  `0x${keccak256(toHex("morpho-org/blue-sdk-viem/deployless-query")).slice(26)}`,
);

/** @internal Whether an override failure permits retrying via creation bytecode. */
export function shouldFallbackFromOverride(error: unknown): boolean {
  if (!(error instanceof BaseError)) {
    return false;
  }
  const verdict = error.walk(
    (cause) =>
      cause instanceof ContractFunctionRevertedError &&
      (!!cause.data || (!!cause.raw && cause.raw !== "0x")),
  );
  if (verdict) {
    return false;
  }
  const timeout = error.walk((cause) => cause instanceof TimeoutError);
  return !!timeout || !isTransportError(error);
}

function sameFailure(first: BaseError, second: unknown): boolean {
  if (!(second instanceof BaseError) || !shouldFallbackFromOverride(second)) {
    return false;
  }
  const verdict = (error: BaseError) =>
    error.walk((cause) => cause instanceof ContractFunctionRevertedError) ??
    error.walk();
  const firstCause = verdict(first);
  const secondCause = verdict(second);
  return (
    firstCause.name === secondCause.name &&
    (firstCause instanceof BaseError
      ? firstCause.shortMessage
      : firstCause.message) ===
      (secondCause instanceof BaseError
        ? secondCause.shortMessage
        : secondCause.message)
  );
}

function raceCreationWithLateOverride<Result>(
  creation: Promise<Result>,
  override: Promise<Result>,
) {
  return new Promise<Result>((resolve, reject) => {
    void creation.then(resolve, reject);
    void override.then(resolve, () => undefined);
  });
}

/** Records a fresh ten-minute unsupported-override verdict. */
function rememberUnsupportedOverrides(client: Client): OverrideVerdict {
  const verdict = { until: Date.now() + OVERRIDE_UNSUPPORTED_TTL_MS };
  overridesUnsupportedUntil.set(client, verdict);
  return verdict;
}

/** Clears only the current verdict belonging to the specified deadline. */
function clearOverrideVerdict(client: Client, deadline: object) {
  const verdict = overridesUnsupportedUntil.get(client);
  if (verdict && verdictDeadlines.get(verdict) === deadline) {
    overridesUnsupportedUntil.set(client, { until: 0 });
  }
}

/** Tracks an owned deadline verdict or shares success-only recovery of its provisional/backoff verdict. */
function watchTimedOutOverride(
  client: Client,
  {
    override,
    initialVerdict,
  }: {
    readonly override: Promise<unknown>;
    readonly initialVerdict: OverrideVerdict | undefined;
  },
) {
  const currentVerdict = overridesUnsupportedUntil.get(client);
  if (
    currentVerdict !== initialVerdict &&
    (currentVerdict?.until ?? 0) > Date.now()
  ) {
    const deadline = currentVerdict && verdictDeadlines.get(currentVerdict);
    if (deadline) {
      void override.then(
        () => clearOverrideVerdict(client, deadline),
        () => undefined,
      );
    }
    return;
  }
  const verdict = rememberUnsupportedOverrides(client);
  const deadline = {};
  verdictDeadlines.set(verdict, deadline);
  void override.then(
    () => clearOverrideVerdict(client, deadline),
    (lateError: unknown) => {
      if (
        lateError instanceof BaseError &&
        isTransportError(lateError) &&
        !lateError.walk((cause) => cause instanceof TimeoutError) &&
        overridesUnsupportedUntil.get(client) === verdict
      ) {
        const backoff = {
          until: Math.min(
            verdict.until,
            Date.now() + OVERRIDE_TRANSPORT_BACKOFF_MS,
          ),
        };
        verdictDeadlines.set(backoff, deadline);
        overridesUnsupportedUntil.set(client, backoff);
      }
    },
  );
}

/** Confirms an ambiguous failure only if no other read has replaced the initial verdict. */
function confirmUnsupportedOverrides(
  client: Client,
  initialVerdict: OverrideVerdict | undefined,
) {
  if (overridesUnsupportedUntil.get(client) === initialVerdict) {
    rememberUnsupportedOverrides(client);
  }
}

/**
 * @internal Reads a query using runtime state overrides, retrying unsupported providers
 * with creation bytecode. Caller overrides are preserved, including address collisions.
 * Unsupported overrides are remembered per client for ten minutes. A transport
 * TimeoutError on the override attempt retries creation once without caching;
 * any error from that retry, timeouts included, propagates as before.
 * The SDK's own deadline sets a provisional verdict unless another read has set a
 * still-active verdict since this read began. Another timed-out probe may clear
 * the same deadline's provisional or backoff verdict on late decoded success,
 * but cannot shorten its expiry on failure or clear a definitive verdict.
 * An on-time decoded success from a plain probe also clears a provisional or
 * backoff verdict written since that probe began, never a definitive verdict.
 * A late decoded success clears
 * it immediately and returns its result if creation has not settled yet. Late override
 * failures never replace creation's outcome; once creation settles, later override
 * results only affect the verdict. This race also applies with caller overrides.
 * A late non-timeout transport error replaces its verdict with a 30 s backoff,
 * capped at the original verdict's expiry.
 * Definitive verdicts are protected; late settlements cannot clear unrelated deadlines.
 * Late transport timeouts and query failures retain the full ten-minute verdict.
 * Ambiguous rejections are cached only when creation does not fail the same way.
 * Reads with non-empty caller state overrides never write or clear client-wide verdicts.
 */
export async function readDeploylessContract<
  const abi extends Abi,
  name extends ContractFunctionName<abi, "view" | "pure">,
  const args extends ContractFunctionArgs<abi, "view" | "pure", name>,
>(
  client: Client,
  parameters: ReadContractParameters<abi, name, args> & {
    readonly code: Hex;
    readonly deployedCode: Hex;
  },
) {
  const { code, deployedCode, ...params } = parameters;
  const canCacheOverrideFailure = !params.stateOverride?.length;
  const initialVerdict = overridesUnsupportedUntil.get(client);
  let overrideFailure: BaseError | undefined;
  let lateOverride:
    | ReturnType<typeof readContract<Chain | undefined, abi, name, args>>
    | undefined;
  if (
    (initialVerdict?.until ?? 0) <= Date.now() &&
    !params.stateOverride?.some(({ address }) =>
      isAddressEqual(address, QUERY_ADDRESS),
    )
  ) {
    const overrideTimeout = new TimeoutError({
      url: "deployless query override",
      body: {},
    });
    const overrideClient = {
      ...client,
      ccipRead: false as const,
      call: undefined,
    };
    const override = readContract<Chain | undefined, abi, name, args>(
      overrideClient,
      {
        ...params,
        batch: false,
        address: QUERY_ADDRESS,
        stateOverride: [
          ...(params.stateOverride ?? []),
          { address: QUERY_ADDRESS, code: deployedCode },
        ],
      } as ReadContractParameters<abi, name, args>,
    );
    try {
      const result = await withTimeout(() => override, {
        timeout: OVERRIDE_TIMEOUT_MS,
        errorInstance: overrideTimeout,
      });
      const currentVerdict = overridesUnsupportedUntil.get(client);
      const deadline = currentVerdict && verdictDeadlines.get(currentVerdict);
      if (
        canCacheOverrideFailure &&
        currentVerdict !== initialVerdict &&
        deadline
      ) {
        // Recover only a deadline installed while this plain probe was in flight.
        clearOverrideVerdict(client, deadline);
      }
      return result;
    } catch (error) {
      if (!shouldFallbackFromOverride(error)) {
        throw error;
      }
      if (error === overrideTimeout) {
        lateOverride = override;
      }
      if (
        canCacheOverrideFailure &&
        (error === overrideTimeout ||
          (error instanceof BaseError &&
            error.walk((cause) => cause instanceof AbiDecodingZeroDataError)))
      ) {
        if (error === overrideTimeout) {
          watchTimedOutOverride(client, { override, initialVerdict });
        } else {
          rememberUnsupportedOverrides(client);
        }
      } else if (
        canCacheOverrideFailure &&
        error instanceof BaseError &&
        !isTransportError(error)
      ) {
        overrideFailure = error;
      }
    }
  }
  const creation = readContract<Chain | undefined, abi, name, args>(client, {
    ...params,
    code,
  } as ReadContractParameters<abi, name, args>);
  if (lateOverride) {
    return raceCreationWithLateOverride(creation, lateOverride);
  }
  if (!overrideFailure) {
    return creation;
  }
  try {
    const result = await creation;
    confirmUnsupportedOverrides(client, initialVerdict);
    return result;
  } catch (error) {
    if (!isTransportError(error) && !sameFailure(overrideFailure, error)) {
      confirmUnsupportedOverrides(client, initialVerdict);
    }
    throw error;
  }
}
