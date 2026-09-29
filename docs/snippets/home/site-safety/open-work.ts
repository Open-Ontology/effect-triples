import { Effect } from "effect";
import { Triples } from "@triplex-build/triplex";
import * as Derivation from "@triplex-build/triplex/derivation";
import { PlacementSite, PlacementWorker, TrainedFor } from "./model.ts";

// Obligation: every placed worker holds current training for that site.
export const siteSafety = (configSnapshot: string) =>
  Derivation.make({
    name: "task.site-safety-training",
    query: {
      find: ["?worker", "?site"],
      where: [
        ["?placement", PlacementWorker.key, "?worker"],
        ["?placement", PlacementSite.key, "?site"],
        ["not", ["?worker", TrainedFor.key, "?site"]],
      ],
    },
    identity: ["?worker", "?site"],
    configSnapshot,
  });

const day = (instant: number) => new Date(instant).toISOString().slice(0, 10);

// Which training tasks should be open on a given day, and when will that change?
export const openWorkOn = (configSnapshot: string, validAt: number) =>
  Effect.gen(function* () {
    const triples = yield* Triples;
    const definition = yield* siteSafety(configSnapshot);
    const { candidates, nextTemporalBoundary } = yield* Derivation.evaluate(triples, definition, {
      basis: { validAt },
    });
    return {
      on: day(validAt),
      open: candidates.map((task) => task.result),
      recheckOn: nextTemporalBoundary === undefined ? null : day(nextTemporalBoundary),
    };
  });
