# ADR-2026-10-21: EVM simulation fail-closed limits ship in v8

| Field      | Value                   |
| ---------- | ----------------------- |
| **Status** | accepted                |
| **Date**   | 2026-10-21              |
| **Author** | @Foulks-Plb             |
| **Scope**  | `evm-simulation` 8.0.0  |

_Status is the only field that changes after acceptance._

## Context

`evm-simulation` 7.0.0 shipped the error-simplification major without the
fail-closed limits change. The limits change first ships in 8.0.0.

## Decision

ADR-2026-10-15's fail-closed limits decision and no-deprecation exception apply
unchanged to `evm-simulation` 8.0.0. Version 7.x keeps limits optional.
Consumers upgrading from 7.x must pass `limits` in 8.0.0. The major changeset
and the v7 → v8 migration guide remain required.

## Invariants

- `simulate()` rejects an omitted `limits` or an empty `limits.operations` →
  the evm-simulation request-parser tests for missing and empty `limits`.
- `evm-simulation` 7.x keeps `limits` optional; 8.0.0 is the first major that
  requires it → the 7.0.0 and 8.0.0 CHANGELOG entries.
- No break beyond ADR-2026-10-15's listed limits changes inherits this exception
  → revisit if another break is proposed under this exception that
  ADR-2026-10-15 does not list.

## References

- [ADR-2026-10-15: EVM simulation — limits fail closed](./ADR-2026-10-15-evm-simulation-fail-closed-limits.md)
- Accepted in the PR that added this file.
