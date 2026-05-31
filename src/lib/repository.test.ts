import { describe, expect, it } from "vitest";
import { createSeedState } from "./seed";
import { createPostgresSnapshotRepositoryForTests } from "./repository";

const describePostgres = process.env.DATABASE_URL ? describe : describe.skip;

describePostgres("postgres snapshot repository", () => {
  it("resets, writes, and reads AppState through Postgres", () => {
    const previousSnapshotId = process.env.EX3CUUSION_STATE_SNAPSHOT_ID;
    process.env.EX3CUUSION_STATE_SNAPSHOT_ID = `test_${Date.now()}`;
    try {
      const repository = createPostgresSnapshotRepositoryForTests();
      const seed = repository.reset();
      expect(seed.tasks.some((task) => task.title === "Finish auth bug")).toBe(true);

      const next = createSeedState();
      next.currentDate = "2026-06-04";
      next.tasks.push({
        ...next.tasks[0],
        id: "task_postgres_roundtrip",
        title: "Postgres roundtrip task"
      });

      repository.write(next);
      const readBack = repository.read();

      expect(readBack.currentDate).toBe("2026-06-04");
      expect(readBack.tasks.some((task) => task.id === "task_postgres_roundtrip")).toBe(true);
      expect(readBack.captureSessions).toEqual([]);
    } finally {
      if (previousSnapshotId === undefined) {
        delete process.env.EX3CUUSION_STATE_SNAPSHOT_ID;
      } else {
        process.env.EX3CUUSION_STATE_SNAPSHOT_ID = previousSnapshotId;
      }
    }
  });
});
