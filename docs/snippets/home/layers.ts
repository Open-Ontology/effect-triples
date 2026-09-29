import { Layer } from "effect";
import { KvTriples } from "@triplex-build/triplex";
import { ConfigStore } from "@triplex-build/triplex/config";
import { PgTriples } from "@triplex-build/triplex-postgres";
import { SqliteTriples } from "@triplex-build/triplex-sqlite";

// The same program runs against any of these. Only the provided layer changes.
export const InMemory = ConfigStore.layer.pipe(Layer.provideMerge(KvTriples.layer));

export const Sqlite = ConfigStore.layer.pipe(
  Layer.provideMerge(SqliteTriples.layer({ filename: "app.db" })),
);

export const Postgres = ConfigStore.layer.pipe(
  Layer.provideMerge(PgTriples.layerFromUrl(process.env["DATABASE_URL"] ?? "")),
);
