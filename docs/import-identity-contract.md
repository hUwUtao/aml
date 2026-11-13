# Import identity contract

## Scope

AML importers decode source files into `{ tracks, diagnostics }`. They do not
inspect the destination project, allocate channels, or authorize replacement.
This contract applies to UST, USTX, SVP, CCS, and CCST imports.

## Source-local identities

- `trackId` is an opaque source-local identity, unique within one import result.
  It is not a project track ID, channel number, or update target.
- Note and gap IDs are source-local as well. AML namespaces these IDs by track
  and keeps them unique within the result.
- IDs are deterministic for the same input and filename. Repeating an import
  may return exactly the same IDs; this does not request replacement.
- Track names, source channel numbers, and IDs preserved in source extensions
  are metadata, not destination selectors.
- Returned track order is source order (after unsupported or unusable records
  are skipped). Names need not be unique.

Existing generation remains unchanged: UST uses a sanitized filename; USTX
adds source track and part indices; SVP and CeVIO add source track/unit indices.
Do not parse those strings to infer destination channels or rely on their
spelling as a permanent identifier format.

## Interface translation (host requirement)

The host must scope identities by import transaction and translate them before
committing to the project:

```text
(import transaction, source trackId) -> fresh project track ID -> new channel
(import transaction, source object ID) -> fresh project object ID
```

The host must remap schema-defined internal references consistently, without
rewriting opaque source metadata. Matching an existing project ID never
implicitly authorizes an update. Separate files in a batch need separate
transaction scopes (or equivalent namespacing), even if their filenames match.

Destination allocation, capacity checks, timing reconciliation, atomic commit,
undo, and explicit replacement actions belong to the host. AML cannot guarantee
non-destructive import on a host that still replaces channels or the project.

## Compatibility and flags

- No payload fields, track schema changes, or API dependency bumps are required.
  Keep `{ tracks, diagnostics }` and `amadeus.track/v2`.
- No AML `append`, `replace`, `legacy`, or destination-channel flag is added.
  Placement is host policy, not an importer capability.
- Existing importer releases can use fresh-identity translation on an updated
  host. An updated AML release does not fix placement on an old host.
- If the host retains legacy replacement, it must require an explicit action or
  a narrowly scoped compatibility mode on the host side. It must not infer that
  mode from matching source IDs or importer version.
- Do not add advisory result flags as a safety mechanism: the inspected host
  kernel normalizes results to `{ tracks, diagnostics }`, discarding other fields.

## Verification

`bun test packages/import.common/test/identity.test.ts` exercises every format,
including repeated imports, duplicate source names/IDs, filtered records, and
track/note/gap uniqueness. It verifies AML output only; append behavior requires
separate host integration tests.
