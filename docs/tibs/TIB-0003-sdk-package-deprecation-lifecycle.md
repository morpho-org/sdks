# TIB-0003: SDK Package Deprecation Lifecycle

| Field             | Value       |
| ----------------- | ----------- |
| **Status**        | Proposed    |
| **Date**          | 2026-05-13  |
| **Author**        | @Rubilmax   |
| **Scope**         | Repo-wide   |
| **Supersedes**    | N/A         |
| **Superseded by** | N/A         |

---

## Context

The SDK monorepo sometimes needs to deprecate public packages after their supported use cases have
moved into another package or have been explicitly discontinued. Deprecation should be predictable
for integrators and maintainers: consumers need time to react, while the monorepo should not keep
obsolete source code indefinitely.

This TIB defines the default lifecycle for SDK package deprecations. Package-specific TIBs can
override it, but should do so explicitly.

## Goals / Non-Goals

**Goals**

- Provide a repeatable deprecation sequence for public SDK packages.
- Require replacement features or no-replacement decisions before npm deprecation.
- Give integrators a communication window before source code is removed.
- Avoid keeping deprecated package source code in the monorepo indefinitely.

**Non-Goals**

- Defining replacement APIs for any specific SDK package.
- Forcing every deprecated package to have a replacement package.
- Unpublishing historical npm versions.
- Removing generated artifacts independently from their owning source package.

## Lifecycle

### Phase 1 -- Extract Features

Before deprecating a package, move any still-supported public features into their replacement
package or document that the feature has no replacement.

The extraction phase should include:

- source changes required by the replacement package;
- public exports for the replacement surface;
- package README and docs updates that point consumers to the replacement or no-replacement
  decision;
- review sign-off that the maintained behavior has been moved or intentionally discontinued.

Do not publish the npm deprecation notice until this phase is complete.

### Phase 2 -- Communicate with Integrators

Before npm deprecation, communicate the upcoming package status to known integrators and update
public documentation.

Communication should include:

- which package is being deprecated;
- the replacement package or an explicit no-replacement statement;
- the expected npm deprecation timing;
- the expected source-code removal timing;
- any migration notes needed to avoid accidental dependency or import-path breakage.

### Phase 3 -- Deprecate npm Package

After extraction and communication, mark the package as deprecated on npm with a clear message.

The npm deprecation message must tell consumers either:

- which maintained package replaces the deprecated package; or
- that there is no replacement package.

Deprecation is an npm metadata change only. Do not unpublish historical versions.

### Phase 4 -- Delete Source Code After 3 Months

Three months after npm deprecation, delete the deprecated package source code from this monorepo.

The deletion PR should remove:

- the workspace package source;
- package-level tests and fixtures owned only by that deprecated package;
- package references from workspace configuration and repository documentation;
- generated outputs only when they are owned by the deleted package and normally tracked.

Maintained replacement APIs must remain in their owning packages.

## Assumptions & Constraints

- The three-month delay starts on the date the npm deprecation notice is published.
- Deprecated packages are not unpublished from npm.
- Package-specific TIBs may choose a longer delay, but should not choose a shorter one without
  documenting the reason.
- Source deletion should not happen while a maintained package still imports the deprecated
  package.

## References

- [SDK package consolidation](./TIB-0002-consolidate-sdk-packages.md)
