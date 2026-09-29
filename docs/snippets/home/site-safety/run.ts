/**
 * Runs the homepage site-safety scenario end to end and writes every output the
 * homepage displays. `--check` fails instead of writing when an output drifts,
 * so the published answers are always produced by the published code.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Effect, Layer } from "effect";
import { EntityId, KvTriples, Triples, type TransactionChange } from "@triplex-build/triplex";
import { ConfigStore, GraphConstraint } from "@triplex-build/triplex/config";
import { ContentId } from "@triplex-build/triplex/content";

import { Placement, PlacementV2, harbor, maria, publish } from "./model.ts";
import { JUN_1, MAR_2, correctTraining, onboard, placeWorker, recordTraining } from "./record.ts";
import { openWorkOn } from "./open-work.ts";
import { placeWorkerOnce } from "./retry.ts";
import { governingRules } from "./which-rules.ts";
import { wasMariaTrained } from "./what-we-knew.ts";

const day = (instant: number) => new Date(instant).toISOString().slice(0, 10);

// `+` asserts and `−` retracts; valid time is the half-open interval [validFrom, validTo).
const describe = (change: TransactionChange) => {
  const value =
    change.value?.type === "ref" ? change.value.value : JSON.stringify(change.value?.value);
  const from = change.validFrom === undefined ? "" : day(change.validFrom);
  const valid = change.validTo === undefined ? `from ${from}` : `[${from}, ${day(change.validTo)})`;
  return `${change.op === "assert" ? "+" : "−"} \`${change.attribute}\` \`${value}\` ${valid}`;
};

// Recorded time comes from the wall clock; keep each step on a distinct instant.
const tick = Effect.sleep("5 millis");

const scenario = Effect.gen(function* () {
  const triples = yield* Triples;
  const release = yield* publish("hr-2026.1", Placement);
  yield* tick;
  yield* onboard;
  yield* tick;
  yield* recordTraining;
  yield* tick;
  const placed = yield* placeWorker(release.snapshot);
  yield* tick;
  const retried = yield* placeWorkerOnce(release.snapshot);
  if (retried !== placed.position)
    throw new Error("a retried command must return its first receipt");
  yield* tick;
  const next = yield* publish("hr-2026.2", PlacementV2);
  yield* tick;
  // The same kind of command, checked against today's rules, is rejected atomically.
  const rejected = yield* triples
    .transact(
      [
        {
          op: "assert",
          entityId: EntityId.make("placement:maria-pier"),
          entityType: "Placement",
          ...PlacementV2.attributes.worker.assertion(maria, { validFrom: MAR_2 }),
        },
        {
          op: "assert",
          entityId: EntityId.make("placement:maria-pier"),
          entityType: "Placement",
          ...PlacementV2.attributes.site.assertion(harbor, { validFrom: MAR_2 }),
        },
      ],
      {
        actor: "user:dana",
        commandId: "placement:create:maria-pier",
        configSnapshot: next.snapshot.id,
        enforce: GraphConstraint.enforcement(yield* GraphConstraint.collect(next.snapshot.root)),
      },
    )
    .pipe(Effect.flip);
  yield* tick;
  yield* correctTraining;

  const config = yield* ConfigStore.ConfigStore;
  const journal = yield* triples.transactions({ after: 0, limit: 1_000 });
  const rows = [
    "| Position | Actor | Command | Changes (+ assert, − retract; valid time) |",
    "| --- | --- | --- | --- |",
  ];
  for (const transaction of journal.transactions) {
    const pinned = transaction.configSnapshot;
    const changed =
      transaction.actor === "triplex/config-store" &&
      pinned !== undefined &&
      ContentId.isContentId(pinned)
        ? `Release \`${(yield* config.snapshotById(pinned))?.label}\`; \`live\` moved to it`
        : transaction.changes.map(describe).join("<br>");
    rows.push(
      `| ${transaction.position} | \`${transaction.actor}\` | ${transaction.commandId === undefined ? "—" : `\`${transaction.commandId}\``} | ${changed} |`,
    );
  }
  const snapshot = release.snapshot.id;
  return {
    timeline: `${rows.join("\n")}\n`,
    "what-we-knew": yield* wasMariaTrained,
    "which-rules": yield* governingRules,
    rejected: {
      error: rejected._tag,
      ...(rejected._tag === "ConstraintViolationError"
        ? { violations: [...new Set(rejected.violations.map((violation) => violation.message))] }
        : {}),
    },
    "open-work": [
      yield* openWorkOn(snapshot, Date.UTC(2026, 2, 3)),
      yield* openWorkOn(snapshot, Date.UTC(2026, 3, 1)),
      yield* openWorkOn(snapshot, JUN_1),
    ],
  };
});

const AppLayer = ConfigStore.layer.pipe(Layer.provideMerge(KvTriples.layer));
const outputs = await Effect.runPromise(scenario.pipe(Effect.provide(AppLayer)));

const check = process.argv.includes("--check");
const files: Record<string, string> = {
  "timeline.md": outputs.timeline,
  "what-we-knew.json": JSON.stringify(outputs["what-we-knew"]),
  "which-rules.json": JSON.stringify(outputs["which-rules"]),
  "rejected.json": JSON.stringify(outputs.rejected),
  "open-work.json": JSON.stringify(outputs["open-work"]),
};

// Format exactly as the repository formatter would, so `pnpm format` never fights `--check`.
const staging = await mkdtemp(join(tmpdir(), "triplex-home-"));
for (const [name, body] of Object.entries(files)) await writeFile(join(staging, name), body);
execFileSync(resolve(import.meta.dirname, "../../../../node_modules/.bin/oxfmt"), [staging], {
  stdio: "ignore",
});

const outputDirectory = resolve(import.meta.dirname, "output");
const drift: string[] = [];
for (const name of Object.keys(files)) {
  const expected = await readFile(join(staging, name), "utf8");
  const path = join(outputDirectory, name);
  if (!check) await writeFile(path, expected);
  else if ((await readFile(path, "utf8").catch(() => "")) !== expected) drift.push(path);
}
await rm(staging, { recursive: true, force: true });

if (drift.length > 0) {
  console.error("Homepage outputs are stale. Run `pnpm docs:outputs` and commit:");
  for (const path of drift) console.error(`  ${path}`);
  process.exit(1);
}
console.log(check ? "Homepage outputs match the scenario." : "Wrote homepage outputs.");
