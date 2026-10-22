const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const context = { URL, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "../src/services/ai/groq-core.js"), "utf8"),
  context
);
const core = context.LunaGroqCore;
const good = { autoFillEligible: true, candidate: { id: "live" } };

test("identical concurrent evidence shares work; successful evidence expires and remains bounded", async () => {
  let now = 1000,
    calls = 0;
  const pool = core.createRequestPool({ now: () => now, ttlMs: 100, maxEntries: 1 });
  const work = async () => {
    calls++;
    return good;
  };
  await Promise.all([pool.run("same", "a", 1000, work), pool.run("same", "b", 1000, work)]);
  await pool.run("same", "c", 1000, work);
  assert.equal(calls, 1);
  now += 101;
  await pool.run("same", "d", 1000, work);
  assert.equal(calls, 2);
  await pool.run("other", "e", 1000, work);
  await pool.run("same", "f", 1000, work);
  assert.equal(calls, 4);
});

test("one consumer cancelling preserves another; the last cancellation aborts upstream", async () => {
  const pool = core.createRequestPool();
  let signal, finish;
  const work = (execution) => {
    signal = execution.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const first = pool.run("same", "a", 1000, work);
  const second = pool.run("same", "b", 1000, work);
  await Promise.resolve();
  pool.cancel("a");
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(signal.aborted, false);
  finish(good);
  assert.equal(await second, good);
  const abandoned = pool.run("different", "c", 1000, work);
  await Promise.resolve();
  pool.cancel("c");
  await assert.rejects(abandoned, { name: "AbortError" });
  assert.equal(signal.aborted, true);
  finish(good);
});

test("early cancellation, review results, failures and settings invalidation do not yield stale cache hits", async () => {
  const pool = core.createRequestPool();
  let calls = 0;
  const work = async () => {
    calls++;
    return good;
  };
  pool.cancel("before-storage-read");
  await assert.rejects(pool.run("same", "before-storage-read", 1000, work), { name: "AbortError" });
  assert.equal(calls, 0);
  for (const id of ["a", "b"])
    await pool.run("review", id, 1000, async () => {
      calls++;
      return { autoFillEligible: false };
    });
  assert.equal(calls, 2);
  await assert.rejects(
    pool.run("error", "c", 1000, async () => {
      throw new Error("offline");
    })
  );
  await pool.run("error", "d", 1000, work);
  pool.clear();
  await pool.run("error", "e", 1000, work);
  assert.equal(calls, 4);
});

test("pool rejects new work below its time budget and caps simultaneous distinct tasks", async () => {
  const pool = core.createRequestPool({ maxActive: 1 });
  await assert.rejects(
    pool.run("late", "a", 799, async () => good),
    { name: "AbortError" }
  );
  const pending = pool.run("one", "b", 1000, () => new Promise(() => {}));
  await assert.rejects(
    pool.run("two", "c", 1000, async () => good),
    /busy/
  );
  pool.cancel("b");
  await assert.rejects(pending, { name: "AbortError" });
});

test("evidence cache keys include live candidates and image requirements; vision claims require an image", () => {
  const input = {
    task: "field",
    facts: { field: "Exterior Color", reported: "Green" },
    candidates: [{ id: "green", label: "Green" }]
  };
  assert.notEqual(core.cacheKey(input), core.cacheKey({ ...input, requiresImage: true }));
  assert.notEqual(
    core.cacheKey(input),
    core.cacheKey({ ...input, candidates: [{ id: "new", label: "Green" }] })
  );
  const result = core.parseAnalysis(
    {
      model: "@cf/google/gemma-4-26b-a4b-it",
      analysis: { candidateId: "green", confidence: "high", confidenceScore: 0.99, riskFlags: [] }
    },
    { ...input, requiresImage: true }
  );
  assert.equal(result.provider, "workersai");
  assert.equal(result.autoFillEligible, false);
});
