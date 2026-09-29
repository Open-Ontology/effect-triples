import { Effect } from "effect";
import { Triples } from "@triplex-build/triplex";
import { GraphConstraint, type InMemoryConfigStore } from "@triplex-build/triplex/config";
import { Placement, Site, TrainedFor, Worker, harbor, maria, placement } from "./model.ts";

export const JAN_5 = Date.UTC(2026, 0, 5);
export const MAR_1 = Date.UTC(2026, 2, 1);
export const MAR_2 = Date.UTC(2026, 2, 2);
export const MAR_5 = Date.UTC(2026, 2, 5);
export const JUN_1 = Date.UTC(2026, 5, 1);

export const onboard = Effect.gen(function* () {
  const triples = yield* Triples;
  return yield* triples.transact(
    [
      {
        op: "assert",
        entityId: harbor,
        entityType: "Site",
        ...Site.attributes.name.assertion("Harbor", { validFrom: JAN_5 }),
      },
      {
        op: "assert",
        entityId: maria,
        entityType: "Worker",
        ...Worker.attributes.name.assertion("Maria", { validFrom: JAN_5 }),
      },
    ],
    { actor: "user:hr", commandId: "onboard:maria" },
  );
});

// Evidence holds for a window of business time: [validFrom, validTo).
export const recordTraining = Effect.gen(function* () {
  const triples = yield* Triples;
  return yield* triples.transact(
    [
      {
        op: "assert",
        entityId: maria,
        entityType: "Worker",
        attribute: TrainedFor.key,
        value: TrainedFor.encode(harbor),
        validFrom: MAR_1,
        validTo: JUN_1,
      },
    ],
    { actor: "user:trainer", commandId: "training:record:maria-harbor" },
  );
});

// #region place
// One application command is one atomic transaction that records who acted,
// which command it was, and the release whose rules it was checked against.
export const placeWorker = (release: InMemoryConfigStore.ConfigSnapshot) =>
  Effect.gen(function* () {
    const triples = yield* Triples;
    const rules = yield* GraphConstraint.collect(release.root);
    return yield* triples.transact(
      [
        {
          op: "assert",
          entityId: placement,
          entityType: "Placement",
          ...Placement.attributes.worker.assertion(maria, { validFrom: MAR_2 }),
        },
        {
          op: "assert",
          entityId: placement,
          entityType: "Placement",
          ...Placement.attributes.site.assertion(harbor, { validFrom: MAR_2 }),
        },
      ],
      {
        actor: "user:dana",
        commandId: "placement:create:maria-harbor", // unique: a retry can never apply twice
        correlationId: "request:7f3a",
        configSnapshot: release.id, // the rules this write was governed by
        enforce: GraphConstraint.enforcement(rules), // required/unique/ref checks, atomically
      },
    );
  });
// #endregion place

// A correction never deletes history. It retracts the recorded belief and
// asserts what is now known, in one attributed transaction.
export const correctTraining = Effect.gen(function* () {
  const triples = yield* Triples;
  const [wrong] = yield* triples.match(
    { entityId: maria, attribute: TrainedFor.key },
    { validAt: MAR_1 },
  );
  if (wrong === undefined) return yield* Effect.die("no training evidence to correct");
  return yield* triples.transact(
    [
      { op: "retract", id: wrong.id },
      {
        op: "assert",
        entityId: maria,
        entityType: "Worker",
        attribute: TrainedFor.key,
        value: TrainedFor.encode(harbor),
        validFrom: MAR_5,
        validTo: JUN_1,
      },
    ],
    {
      actor: "user:auditor",
      commandId: "training:correct:maria-harbor",
      causationId: "audit:2026-q1",
    },
  );
});
