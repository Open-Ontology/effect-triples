import { Effect } from "effect";
import { Triples, type TemporalBasis } from "@triplex-build/triplex";
import { TrainedFor, maria } from "./model.ts";
import { MAR_2 } from "./record.ts";

// Was Maria trained for Harbor on the day she started there?
export const wasMariaTrained = Effect.gen(function* () {
  const triples = yield* Triples;
  const decision = yield* triples.transactionByCommand("placement:create:maria-harbor");
  if (decision === null) return yield* Effect.die("placement was never recorded");

  const trained = (basis: TemporalBasis) =>
    triples
      .match({ entityId: maria, attribute: TrainedFor.key }, basis)
      .pipe(Effect.map((facts) => facts.length > 0));

  return {
    // What the database believed at the instant Dana made the placement.
    knownAtDecision: yield* trained({ validAt: MAR_2, recordedAt: decision.instant }),
    // What the database knows now, after the auditor's correction.
    knownToday: yield* trained({ validAt: MAR_2 }),
  };
});
