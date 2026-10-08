---
title: Building Triplex on XTDB
description: A proposed Triplex adapter blueprint for XTDB's current SQL and bitemporal primitives, including non-interactive writes and stable read boundaries.
pageClass: backend-blueprint
---

<p class="blueprint-eyebrow">Backend blueprint / XTDB</p>

# Building Triplex on XTDB

<p class="blueprint-lead">A temporal database underneath a temporal application model. Keep the history, then connect it to the rules and work it explains.</p>

<p class="blueprint-status">Proposed blueprint · No adapter exists</p>

This is a design to investigate for current XTDB, using SQL and its temporal primitives.
It is not an XTDB 1.x Datalog integration. No Triplex XTDB adapter or installable package exists;
the mappings below need a prototype and conformance evidence.

<nav class="blueprint-actions" aria-label="XTDB blueprint actions">
<a href="#storage-mapping">Explore the mapping →</a>
<a href="#build-the-first-slice">Build the first slice →</a>
<a href="/backends">All blueprints →</a>
</nav>

## Why XTDB

XTDB tracks valid and system time and exposes SQL and XTQL for querying historical data.
That makes late evidence and corrections a natural area to explore.
[XTDB's overview](https://docs.xtdb.com/intro/what-is-xtdb.html) describes its temporal and relational
model.

Triplex would add its TypeScript-facing fact identity, configuration releases, attributed
command receipts, decision provenance, and derived work on top of an adapter. The shared temporal
vocabulary is a starting point; the exact representation and transaction behavior still need
to match Triplex.

## Storage mapping

Start with a compatibility representation: one row per Triplex assertion, retaining explicit
Triplex time fields and retraction metadata. Explore native temporal pushdown after that version
passes the behavioral corpus.

| Triplex contract             | Proposed XTDB representation                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Fact identity                | Assertion row keyed by `TripleId`, retaining the original domain `EntityId`                         |
| Typed values                 | Fixed assertion columns for the value tag and typed payload                                         |
| Recorded and valid intervals | Explicit Triplex timestamp fields initially; native temporal optimization requires a proven mapping |
| Retractions and history      | Retained assertion payload with retraction transaction, timestamp, and position                     |
| Ordered commit boundary      | Per-logical-database position record advanced with an atomic expected-position check                |
| Retry identity               | Scoped command-receipt record whose absence is checked in the submitted command                     |
| Attributed journal           | Triplex transaction envelope and typed changes written alongside source facts                       |
| Datalog                      | A dedicated translator/executor from validated Triplex queries to XTDB SQL                          |

The first version should keep adapter records visible independently of the domain fact's valid
interval. Applying native default valid-time filtering to a journal or receipt could hide it when
a user queries a different business date. Choose explicit temporal clauses for every adapter
table and test historical reads; do not rely on the backend's implicit "now" basis.

An existing PostgreSQL client connection does not establish compatibility with Triplex's
PostgreSQL adapter. XTDB needs its own storage implementation, transaction handling, and verified
query dialect. The [SQLite reference](/sqlite) illustrates the responsibilities to cover.

## Submit one atomic command

XTDB write transactions are non-interactive: DML and assertions form a submitted atomic batch,
and cannot be interleaved with result-returning `SELECT`s. Triplex's Effect callback expects
reads and pending writes on one view. See [XTDB transaction consistency](https://docs.xtdb.com/about/txs-in-xtdb.html).

One proposed bridge is to evaluate the callback against a stable read basis plus a staged overlay,
then submit an atomic batch:

1. Read the logical database's position and command receipt on one consistent basis.
2. Evaluate enforcement and pending reads using that basis plus all staged assertion and
   retraction changes. Build the journal and callback result without publishing them.
3. Submit an `ASSERT` guarding the expected position and command claim, then the position update,
   receipt, facts, and journal in the same write batch. XTDB's
   [SQL transaction reference](https://docs.xtdb.com/reference/main/sql/txs.html) describes `ASSERT`.
4. Confirm successful processing before returning the receipt. On a conflicting position,
   reacquire a basis and re-evaluate. An existing command claim must return its original
   transaction ID to core, which raises `CommandAlreadyCommittedError`; callers then resolve
   the durable receipt with `transactionByCommand`.

The guard must cover every source writer for that logical database. Prototype overlay reads,
retry behavior, interruption, and rejection before treating this approach as an implementation
of `withTransaction`. Native serial submission alone does not protect a constraint checked on an
older client-side read.

## Preserve a stable read boundary

XTDB distinguishes read snapshot tokens from await tokens used to ensure a node has processed
earlier writes. Reusing a snapshot and clock fixes the read basis; waiting for a write alone does
not pin future reads. [XTDB's basis documentation](https://docs.xtdb.com/about/txs-in-xtdb.html#repeatable-queries-basis)
explains the distinction.

Map Triplex's commit position to a reproducible source boundary, keep that boundary on every
page, and ensure pooled connections observe confirmed commits. Define how a position is mapped
to a native snapshot or reproduced from retained assertion/retraction positions. Timestamp-only
pagination cannot establish the same contract.

Maria's correction is the first useful exercise. Retain the original March 1 assertion, mark its
retraction, and assert the March 5 replacement atomically. Earlier recorded knowledge must still
show training on March 3, current knowledge must show the gap, and a cursor opened before the
correction must keep its original results. The governing release stays on the placement receipt.

Native system time and Triplex's recorded time must be mapped explicitly, including timestamp
precision, same-millisecond commits, open interval ends, and imported or scheduled valid times.
Any native temporal optimization must preserve the reference behavior of direct reads, Datalog,
history, and derivation wakeups.

## Build the first slice

1. Specify the supported XTDB version, driver, typed codecs, table temporal policy, and physical
   database isolation. Record the mapping of Triplex positions to consistent read boundaries.
2. Prototype atomic command submission before the query compiler: correction, failed assertion,
   competing writers, duplicate commands, and read-after-write across two connections.
3. Implement `StorageAdapter` and a dedicated `QueryExecutor`, including validation, joins,
   negation, aggregation, constrained recursion, stable ordering, pagination, and `explain`.
4. Compose with `Runtime.define` and `Capabilities.none`, then run
   [runtime conformance](/custom-runtimes#correctness-contract-and-conformance) against fresh
   storage. Add delayed processing, lost acknowledgements, restart, and upgrade exercises.

Once the base layer is coherent, Triplex's configuration and derivation services can reuse it.
Snapshot and emission capabilities need their own providers and failure tests.

[Open an XTDB design issue](https://github.com/bjacobso/triplex/issues/new) with the submission
prototype and read-boundary evidence, or compare the [Datomic proposal](/datomic).
