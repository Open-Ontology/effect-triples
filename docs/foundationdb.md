---
title: Building Triplex on FoundationDB
description: An experimental Triplex storage blueprint that maps ordered byte keys and atomic FoundationDB transactions to the existing hexastore runtime.
pageClass: backend-blueprint
---

<p class="blueprint-eyebrow">Backend blueprint / FoundationDB</p>

# Building Triplex on FoundationDB

<p class="blueprint-lead">Let FoundationDB keep the ordered keys. Let Triplex turn them into facts, history, and explainable work.</p>

<p class="blueprint-status">Experimental · Private workspace package</p>

An adapter already exists in this repository. It requires compatible native FoundationDB client
libraries and is held from npm publication. Native integration tests are opt-in; it is outside the
default CI matrix. Evaluate from a source checkout with locked dependencies.

<nav class="blueprint-actions" aria-label="FoundationDB blueprint actions">
<a href="#compose-the-runtime">Compose the runtime →</a>
<a href="#storage-mapping">Follow the storage mapping →</a>
<a href="/backends">All blueprints →</a>
</nav>

## Why these primitives fit

FoundationDB exposes an ordered key-value store with atomic transactions and range reads.
Transaction retries handle optimistic conflicts; transaction size and lifetime limits shape how
much work can fit in one command. See its [developer guide](https://apple.github.io/foundationdb/developer-guide.html).

That matches Triplex's `KvBackend` path. The backend handles bytes and atomicity; Triplex's existing
hexastore handles fact indexes, temporal visibility, Datalog, command receipts, and the journal.
The design avoids implementing a second query engine.

## Storage mapping

| Triplex needs                                | FoundationDB adapter responsibility                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| Ordered byte keys                            | Preserve lexicographic ordering within an isolated subspace                      |
| Pattern index scans                          | Implement inclusive start, exclusive end, direction, and limit                   |
| Atomic fact and journal writes               | Run every operation in the callback on the same native transaction               |
| Ordered commit positions and unique receipts | Preserve the KV engine's counter and claim read/write conflicts                  |
| Abort behavior                               | Discard all pending mutations when the callback fails                            |
| Large reads                                  | Page range reads without changing the requested scan semantics                   |
| Invalidation hints                           | Optional FoundationDB watches; consumers still catch up from the durable journal |

Hexastore keys and their encoding are implementation details. A backend implements `KvBackend`;
it does not introduce a portable on-disk hexastore format. Persistent-data upgrades need their own
rehearsal.

## Compose the runtime

This checked example uses existing repository exports. Run it only in a checkout with the native
client and a configured FoundationDB cluster. It is not an npm installation recipe.

<<< @/snippets/foundationdb.ts

The existing `FdbTriples.layer({ subspace })` is also a convenience composition. A nonempty
subspace is required by default, and clears stay within it. Choose physically disjoint subspaces
for separate databases; `DatabaseScope` binds cursors and does not partition cluster keys.

`Capabilities.none` deliberately selects the base store. Durable KV entity snapshot persistence
is not supplied automatically. Add a database-owned snapshot provider or a change emitter only
after testing those capabilities separately.

## One correction across every index

Maria's correction touches the old assertion's visibility, the new assertion, pattern indexes,
the command claim, the commit position, and the journal. All those mutations must share one
FoundationDB transaction, so a failed correction leaves the old belief intact.

A retried callback must keep effects inside storage. Sending an email or advancing a host workflow
inside it would repeat on conflict. Use the committed journal to drive host-owned effects.
Splitting one logical command across native transactions would lose Triplex's atomicity.

The adapter's bulk `setAll` helper can chunk large loads; those chunks are separate commits.
It must not be used to make an oversized atomic Triplex command appear supported. Establish and
measure command limits before production use.

## Verify and extend the adapter

Start with the [KV adapter](https://github.com/bjacobso/triplex/blob/main/packages/foundationdb/src/FdbKvBackend.ts)
and [package guide](https://github.com/bjacobso/triplex/blob/main/packages/foundationdb/README.md).
Run `pnpm test:foundationdb:integration` with the native client and a disposable cluster. Use the
[shared runtime conformance helper](/custom-runtimes#correctness-contract-and-conformance) against
an isolated subspace as well.

Before promoting this backend, establish multi-process contention behavior, interruption and
lost-acknowledgement handling, crash recovery, persistent-key upgrades, and measured transaction
limits. A command interrupted during submission must not leave an unexplained commit; receipts
must resolve any uncertain outcome. These are additional gates beyond the shared corpus.

See [current state](/current-state#backend-maturity) for maturity and [custom runtimes](/custom-runtimes)
for the complete KV and capability contract.
