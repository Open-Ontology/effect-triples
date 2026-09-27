import { it } from "vitest";
import { Effect } from "effect";
import { SqliteTriples } from "../src/index.js";
import { numericIndexPlan } from "../../../test/fixtures/numeric-index.js";

it("uses an expression range index for live and snapshot actor due-work", async () => {
  await Effect.runPromise(
    numericIndexPlan("sqlite").pipe(Effect.provide(SqliteTriples.layerMemory)),
  );
});
