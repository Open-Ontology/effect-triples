import { Effect } from "effect";
import { EntityId } from "@triplex-build/triplex";
import { Attribute, ConfigStore, EntityType } from "@triplex-build/triplex/config";

// Attributes own global identity and value type.
export const SiteName = Attribute.text(":site/name");
export const Site = EntityType.make("Site", {
  attributes: { name: Attribute.use(SiteName, { required: true, unique: true }) },
});

export const WorkerName = Attribute.text(":worker/name");
export const TrainedFor = Attribute.ref(":worker/trained-for", Site);
export const Worker = EntityType.make("Worker", {
  attributes: {
    name: Attribute.use(WorkerName, { required: true }),
    trainedFor: Attribute.use(TrainedFor, { cardinality: "many" }),
  },
});

export const PlacementWorker = Attribute.ref(":placement/worker", Worker);
export const PlacementSite = Attribute.ref(":placement/site", Site);
export const Placement = EntityType.make("Placement", {
  attributes: {
    worker: Attribute.use(PlacementWorker, { required: true }),
    site: Attribute.use(PlacementSite, { required: true }),
  },
});

// hr-2026.2 changes the rules: every placement now needs a supervisor.
export const PlacementSupervisor = Attribute.text(":placement/supervisor");
export const PlacementV2 = EntityType.make("Placement", {
  attributes: {
    worker: Attribute.use(PlacementWorker, { required: true }),
    site: Attribute.use(PlacementSite, { required: true }),
    supervisor: Attribute.use(PlacementSupervisor, { required: true }),
  },
});

export const maria = EntityId.make("worker:maria");
export const harbor = EntityId.make("site:harbor");
export const placement = EntityId.make("placement:maria-harbor");

// Entity types own usage rules. Publishing them creates an immutable release.
export const publish = (label: string, placementType: typeof Placement | typeof PlacementV2) =>
  Effect.gen(function* () {
    const config = yield* ConfigStore.ConfigStore;
    return yield* config.commit({
      label,
      objects: [...(yield* Site.nodes), ...(yield* Worker.nodes), ...(yield* placementType.nodes)],
      ref: "live",
    });
  });
