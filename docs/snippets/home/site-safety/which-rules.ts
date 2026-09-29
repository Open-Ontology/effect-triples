import { Effect } from "effect";
import { Triples } from "@triplex-build/triplex";
import { ConfigStore, ContentId } from "@triplex-build/triplex/config";

// Who placed Maria, and under which version of the rules?
export const governingRules = Effect.gen(function* () {
  const triples = yield* Triples;
  const config = yield* ConfigStore.ConfigStore;
  const receipt = yield* triples.transactionByCommand("placement:create:maria-harbor");
  const pinned = receipt?.configSnapshot;
  if (pinned === undefined || !ContentId.isContentId(pinned)) {
    return yield* Effect.die("placement was not pinned to a release");
  }

  return {
    actor: receipt?.actor,
    correlationId: receipt?.correlationId,
    governedBy: (yield* config.snapshotById(pinned))?.label,
    liveToday: (yield* config.resolveRef("live"))?.label,
  };
});
