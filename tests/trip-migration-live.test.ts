import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { parseTripState } from "@/lib/model";
import { createSeed } from "@/lib/seed";
import { getStorageMode, readTrip, writeTrip } from "@/lib/storage";
it.skipIf(process.env.TRIP_CLOUD_IMPORT !== "1")("copies the approved local trip only over an unchanged cloud seed", async () => {
  process.loadEnvFile(".env.local");
  expect(getStorageMode()).toBe("shared");
  const local = parseTripState(JSON.parse(await readFile(".data/trip.json", "utf8")));
  const initial = await readTrip();
  const places = local.places.map((p) => {
    if (!p.image.startsWith("/api/place-photos/")) return p;
    const { photoCredit: _credit, ...rest } = p;
    return { ...rest, image: "" };
  });
  const desired = { ...local, places, version: initial.version };
  const currentWithoutVersion = { ...initial, version: 0 };
  const desiredWithoutVersion = { ...desired, version: 0 };
  if (JSON.stringify(currentWithoutVersion) === JSON.stringify(desiredWithoutVersion)) return;
  // Do not overwrite a real edited cloud trip, even with an explicit import flag.
  expect(initial).toEqual(parseTripState(createSeed()));
  const copied = await writeTrip(desired, initial.version);
  expect(copied.places).toHaveLength(local.places.length);
  expect(copied.schedule).toEqual(local.schedule); expect(copied.packing).toEqual(local.packing);
  expect((await readTrip()).trip).toEqual(local.trip);
  console.log(JSON.stringify({ copied: true, places: copied.places.length, schedule: copied.schedule.length, packing: copied.packing.length, localVersion: local.version, cloudVersion: copied.version, localOnlyPhotosExcluded: local.places.filter((p) => p.image.startsWith("/api/place-photos/")).length }));
}, 30000);
