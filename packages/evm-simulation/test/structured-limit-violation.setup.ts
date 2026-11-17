import { installStructuredLimitViolationCheck } from "../src/test-helpers/structured-limit-violation.js";

// Every caught limit violation or unavailable check must carry its structured fields.
installStructuredLimitViolationCheck();
