# Secrets — canonical rubric

Hardcoded credentials in source code, configuration, or CI/CD artifacts.
Single owner for this concern across the agent set; agents cross-check this
file via the pointer line `Cross-check \`references/secrets.md\` when this
concern applies.`

## What counts as a secret

- API keys (provider keys, integration tokens, third-party service keys)
- OAuth / session tokens (`Bearer`, `client_secret`, refresh tokens)
- AWS / GCP / Azure access keys
- npm publish tokens (`NPM_TOKEN`, `_authToken` in `.npmrc`)
- GitHub PATs, deploy keys
- Private keys (RSA / ECDSA / Ed25519 PEM blocks)
- Wallet / signing private keys, mnemonic phrases (Web3)
- RPC URLs that embed credentials (`https://user:pass@rpc.example.com`)
- Database passwords / connection strings
- HMAC / signing secrets used by application code

## Where to flag

| Location | Severity | Notes |
|---|---|---|
| Source code (`*.ts`, `*.js`, `*.py`, etc.) — string literal | **Critical** | Hardcoded secret in shipped code |
| Environment-file commits (`.env`, `.env.local`) | **Critical** | Should never be in git; verify `.gitignore` covers them |
| `.npmrc` with `_authToken=` or `always-auth=true` | **Critical** | Owned by `dependencies` agent — confirm the `_authToken` value is a literal, not a `${VAR}` reference |
| CI workflow `run:` block with `secrets.*` interpolated directly (not via `env:`) | **High** | Lands in logs; owned by `ci-security` |
| New `secrets:` names introduced without a matching reference in `SECURITY.md` | **Medium** | Surface for documentation parity |
| Test fixtures with realistic-looking but fake secrets | **Low** | Note only — confirm they're not real |

## How to fix

1. **Source code**: move the literal to an env var, reference via the project's
   config/env helper (`process.env.X`, `Deno.env.get('X')`, `os.getenv('X')`,
   `std::env::var("X")`), and document the variable in the project's secret
   management surface.
2. **CI workflows**: bind via `env:` block, then reference `$VAR` inside the
   `run:` script. GitHub redacts secrets bound via `env:` but not those
   interpolated as `${{ secrets.X }}` directly into a shell line.
3. **Lockfile or `.npmrc`**: rotate the credential immediately, scrub git
   history with `git filter-repo` or BFG, force-push, and notify the org.

## Out of scope

- Detection of secrets in dependency source code — that's the supply-chain
  audit, not the PR review surface.
- Generic input validation — see `correctness` (forbidden patterns) and the
  per-stack security agents (`web3` for calldata, `ai-sdk` for prompt
  injection).

## Consumers

Agents that cross-check this rubric:

- `correctness` — generic source-code hardcoded secrets / API keys / tokens
- `ci-security` — `secrets.*` exposure in workflow `run:` blocks
- `dependencies` — `_authToken=` in `.npmrc`, registry credential leaks
- `ai-sdk` — provider keys in AI SDK config
- `web3` — wallet private keys, mnemonic phrases, signing secrets
