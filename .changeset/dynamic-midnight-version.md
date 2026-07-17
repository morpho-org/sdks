---
"@morpho-org/midnight-sdk": patch
"@morpho-org/morpho-sdk": patch
---

Send the installed `@morpho-org/midnight-sdk` package version with Midnight API requests instead of a hardcoded SDK version.

Keep the version lookup compatible with both ESM and CommonJS consumers, including through the Midnight API re-export from `@morpho-org/morpho-sdk`.
