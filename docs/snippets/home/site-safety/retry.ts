import { Effect } from "effect";
import { Triples } from "@triplex-build/triplex";
import type { InMemoryConfigStore } from "@triplex-build/triplex/config";
import { placeWorker } from "./record.ts";

// A retried command must never apply twice. The duplicate is rejected with the
// original transaction, so the caller can answer with the first receipt.
export const placeWorkerOnce = (release: InMemoryConfigStore.ConfigSnapshot) =>
  placeWorker(release).pipe(
    Effect.map((result) => result.position),
    Effect.catchTag("CommandAlreadyCommittedError", (duplicate) =>
      Effect.gen(function* () {
        const triples = yield* Triples;
        const receipt = yield* triples.transactionByCommand(duplicate.commandId);
        return receipt?.position;
      }),
    ),
  );
