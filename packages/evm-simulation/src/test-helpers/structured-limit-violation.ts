import {
  CONSUMER_LIMIT_CHECKS,
  ConsumerLimitViolationError,
  SLIPPAGE_CHECK_UNAVAILABLE_REASONS,
  SlippageCheckUnavailableError,
} from "../errors.js";

const REQUIRED_FIELDS = [
  "operationIndex",
  "operationType",
  "field",
  "check",
  "expected",
  "observed",
] as const;

/**
 * Names the structured fields a {@link ConsumerLimitViolationError} lacks, or
 * `"check"` when its check is outside {@link CONSUMER_LIMIT_CHECKS}.
 */
export function missingLimitViolationFields(
  error: ConsumerLimitViolationError,
): readonly string[] {
  const missing: string[] = REQUIRED_FIELDS.filter(
    (field) => error[field] === undefined,
  );
  if (error.check !== undefined && !CONSUMER_LIMIT_CHECKS.includes(error.check))
    missing.push("check");
  return missing;
}

const isInstance = Function.prototype[Symbol.hasInstance];

/** Names missing or invalid unavailable-check facts, including incomplete operation coordinates. */
export function missingSlippageUnavailableFields(
  error: SlippageCheckUnavailableError,
): readonly string[] {
  const missing: string[] = (["reason", "field"] as const).filter(
    (field) => error[field] === undefined,
  );
  if (
    error.reason !== undefined &&
    !SLIPPAGE_CHECK_UNAVAILABLE_REASONS.includes(error.reason)
  )
    missing.push("reason");
  if (error.operationIndex !== undefined || error.operationType !== undefined) {
    if (error.operationIndex === undefined) missing.push("operationIndex");
    if (error.operationType === undefined) missing.push("operationType");
  }
  return missing;
}

/**
 * Makes every `instanceof` check for limit violations or unavailable checks, including the
 * `toThrow` and `toBeInstanceOf` matchers, fail on an instance without its
 * structured fields. Tests catch limit violations through such checks, so a
 * green suite means no caught instance is message-only. Returns the uninstall.
 */
export function installStructuredLimitViolationCheck(): () => void {
  for (const ErrorClass of [
    ConsumerLimitViolationError,
    SlippageCheckUnavailableError,
  ]) {
    Object.defineProperty(ErrorClass, Symbol.hasInstance, {
      configurable: true,
      value(
        this:
          | typeof ConsumerLimitViolationError
          | typeof SlippageCheckUnavailableError,
        value: unknown,
      ) {
        const matches = isInstance.call(this, value);
        if (matches) {
          const missing =
            this === ConsumerLimitViolationError
              ? missingLimitViolationFields(
                  value as ConsumerLimitViolationError,
                )
              : missingSlippageUnavailableFields(
                  value as SlippageCheckUnavailableError,
                );
          if (missing.length > 0)
            throw new Error(
              `${this.name} lacks structured fields ${JSON.stringify(missing)}: ${(value as Error).message}`,
            );
        }
        return matches;
      },
    });
  }
  return () => {
    Reflect.deleteProperty(ConsumerLimitViolationError, Symbol.hasInstance);
    Reflect.deleteProperty(SlippageCheckUnavailableError, Symbol.hasInstance);
  };
}
