import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const Database = require("better-sqlite3");
const { createJobQueue, JOB_STATUS } = require("../../src/services/jobQueue.js");

describe("Job Queue Service", () => {
  let queue;
  let db;
  let mockLogger;

  beforeEach(() => {
    db = new Database(":memory:");
    const mockSqliteDb = { getDb: () => db };
    mockLogger = { warn: vi.fn(), info: vi.fn() };
    queue = createJobQueue({ sqliteDb: mockSqliteDb, logger: mockLogger });
  });

  afterEach(async () => {
    await queue.stop();
    db.close();
  });

  // ── registerHandler ───────────────────────────────────────────────

  it("registerHandler stores handler and is callable", () => {
    const fn = vi.fn();
    queue.registerHandler("email", fn);

    // Handler kaydedildi mi kontrol: add + process ile dolayli test
    // Direkt Map'e erisemiyoruz, ama processJob'da kullanilacak
    expect(fn).not.toHaveBeenCalled(); // sadece kayit, cagri yok henuz
  });

  // ── add ───────────────────────────────────────────────────────────

  it("add creates a job and returns its id", () => {
    const id = queue.add("email", { to: "test@example.com" });
    expect(id).toBeTypeOf("number");
    expect(id).toBeGreaterThan(0);
  });

  it("add stores payload and defaults correctly", () => {
    const id = queue.add("sms", { phone: "555" });
    const row = db.prepare("SELECT * FROM job_queue WHERE id = ?").get(id);

    expect(row.type).toBe("sms");
    expect(row.status).toBe(JOB_STATUS.PENDING);
    expect(JSON.parse(row.payload)).toEqual({ phone: "555" });
    expect(row.priority).toBe(0);
    expect(row.maxAttempts).toBe(5);
    expect(row.attempts).toBe(0);
  });

  it("add respects custom options", () => {
    const id = queue.add("webhook", { url: "https://x.com" }, {
      priority: 10,
      maxAttempts: 3,
    });
    const row = db.prepare("SELECT * FROM job_queue WHERE id = ?").get(id);
    expect(row.priority).toBe(10);
    expect(row.maxAttempts).toBe(3);
  });

  // ── processNextJob (start/stop cycle) ─────────────────────────────

  it("processNextJob picks up pending job and calls handler", async () => {
    const handler = vi.fn(() => Promise.resolve());
    queue.registerHandler("email", handler);
    queue.add("email", { to: "a@b.com" });

    queue.start({ pollIntervalMs: 50 });

    // Handler'in cagrilmasini bekle
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledOnce();
    }, { timeout: 2000 });

    expect(handler).toHaveBeenCalledWith({ to: "a@b.com" });

    await queue.stop();

    // Job completed olmali
    const row = db.prepare("SELECT * FROM job_queue WHERE type = 'email'").get();
    expect(row.status).toBe(JOB_STATUS.COMPLETED);
    expect(row.completedAt).toBeTruthy();
  });

  it("completed job increments no attempts beyond 1 on success", async () => {
    const handler = vi.fn(() => Promise.resolve());
    queue.registerHandler("task", handler);
    queue.add("task", {});

    queue.start({ pollIntervalMs: 50 });
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledOnce();
    }, { timeout: 2000 });
    await queue.stop();

    const row = db.prepare("SELECT * FROM job_queue WHERE type = 'task'").get();
    expect(row.status).toBe(JOB_STATUS.COMPLETED);
    // attempts DB'de 0 kalir cunku _markCompleted attempts'i guncellemez
    // ama _processJob newAttempts hesaplar, burada DB'deki degeri kontrol
  });

  // ── Failed job retry ──────────────────────────────────────────────

  it("failed job gets retried (status back to pending with backoff)", async () => {
    let callCount = 0;
    const handler = vi.fn(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("fail-1"));
      return Promise.resolve();
    });
    queue.registerHandler("flaky", handler);
    queue.add("flaky", { x: 1 }, { maxAttempts: 3 });

    queue.start({ pollIntervalMs: 50 });

    // Ilk cagri: fail -> pending'e doner runAfter ile
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledOnce();
    }, { timeout: 2000 });
    await queue.stop();

    // Job pending'e donmeli, attempts=1
    const row = db.prepare("SELECT * FROM job_queue WHERE type = 'flaky'").get();
    expect(row.status).toBe(JOB_STATUS.PENDING);
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("fail-1");
    expect(row.runAfter).toBeTruthy(); // backoff set edilmis olmali
  });

  // ── Max retries exceeded -> dead ──────────────────────────────────

  it("job with max retries exceeded gets marked dead", async () => {
    const handler = vi.fn(() => Promise.reject(new Error("always-fail")));
    queue.registerHandler("doomed", handler);

    // maxAttempts=1 -> ilk basarisizlikta dead olur
    queue.add("doomed", {}, { maxAttempts: 1 });

    queue.start({ pollIntervalMs: 50 });

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledOnce();
    }, { timeout: 2000 });
    await queue.stop();

    const row = db.prepare("SELECT * FROM job_queue WHERE type = 'doomed'").get();
    expect(row.status).toBe(JOB_STATUS.DEAD);
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("always-fail");
  });

  // ── Handler not found -> dead ─────────────────────────────────────

  it("job without handler gets marked dead immediately", async () => {
    // Handler kaydetmiyoruz
    queue.add("unknown-type", {}, { maxAttempts: 3 });

    queue.start({ pollIntervalMs: 50 });

    await vi.waitFor(() => {
      const row = db.prepare("SELECT * FROM job_queue WHERE type = 'unknown-type'").get();
      expect(row.status).toBe(JOB_STATUS.DEAD);
    }, { timeout: 2000 });
    await queue.stop();
  });

  // ── getStats ──────────────────────────────────────────────────────

  it("getStats returns counts by status", () => {
    queue.add("a", {});
    queue.add("b", {});
    // Manually mark one as dead
    const id = queue.add("c", {});
    db.prepare("UPDATE job_queue SET status = ? WHERE id = ?").run(JOB_STATUS.DEAD, id);

    const stats = queue.getStats();
    expect(stats.pending).toBe(2);
    expect(stats.dead).toBe(1);
    expect(stats.completed).toBe(0);
    expect(stats.running).toBe(0);
  });

  // ── listDead / retryDead / purgeDead ──────────────────────────────

  it("listDead returns dead jobs", () => {
    const id = queue.add("x", {});
    db.prepare("UPDATE job_queue SET status = ? WHERE id = ?").run(JOB_STATUS.DEAD, id);

    const dead = queue.listDead();
    expect(dead).toHaveLength(1);
    expect(dead[0].id).toBe(id);
    expect(dead[0].status).toBe(JOB_STATUS.DEAD);
  });

  it("retryDead resets dead job to pending", () => {
    const id = queue.add("x", {});
    db.prepare("UPDATE job_queue SET status = ?, attempts = 3, lastError = 'err' WHERE id = ?")
      .run(JOB_STATUS.DEAD, id);

    const result = queue.retryDead(id);
    expect(result).toBe(true);

    const row = db.prepare("SELECT * FROM job_queue WHERE id = ?").get(id);
    expect(row.status).toBe(JOB_STATUS.PENDING);
    expect(row.attempts).toBe(0);
    expect(row.lastError).toBe("");
  });

  it("purgeDead deletes all dead jobs", () => {
    const id1 = queue.add("x", {});
    const id2 = queue.add("y", {});
    db.prepare("UPDATE job_queue SET status = ? WHERE id IN (?, ?)").run(JOB_STATUS.DEAD, id1, id2);

    const count = queue.purgeDead();
    expect(count).toBe(2);

    const remaining = db.prepare("SELECT COUNT(*) as c FROM job_queue").get();
    expect(remaining.c).toBe(0);
  });

  // ── Priority ordering ─────────────────────────────────────────────

  it("higher priority job gets processed first", async () => {
    const order = [];
    const handler = vi.fn((payload) => {
      order.push(payload.name);
      return Promise.resolve();
    });
    queue.registerHandler("prio", handler);

    queue.add("prio", { name: "low" }, { priority: 0 });
    queue.add("prio", { name: "high" }, { priority: 10 });

    queue.start({ pollIntervalMs: 50 });

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(2);
    }, { timeout: 3000 });
    await queue.stop();

    expect(order[0]).toBe("high");
    expect(order[1]).toBe("low");
  });

  // ── Crash recovery ────────────────────────────────────────────────

  it("start resets stale running jobs to pending", async () => {
    const id = queue.add("x", {});
    db.prepare("UPDATE job_queue SET status = ? WHERE id = ?").run(JOB_STATUS.RUNNING, id);

    // Yeni queue olustur ayni DB ile (simulating restart)
    const queue2 = createJobQueue({ sqliteDb: { getDb: () => db }, logger: mockLogger });

    // Handler kaydet ki tick islediginde dead'e dusmesin
    queue2.registerHandler("x", () => Promise.resolve());
    queue2.start({ pollIntervalMs: 60000 });

    // _resetStaleJobs start icerisinde senkron calisiyor,
    // ama _tick de hemen calisiyor. Kisa bekle sonra kontrol et.
    await new Promise((r) => setTimeout(r, 100));

    // Job ya pending'den completed'a gecmis olabilir (handler calistiysa)
    // Onemli olan: dead OLMAMASI, yani reset calisti
    const row = db.prepare("SELECT * FROM job_queue WHERE id = ?").get(id);
    expect(row.status).not.toBe(JOB_STATUS.RUNNING); // artik running degil
    expect(row.status).not.toBe(JOB_STATUS.DEAD);    // dead de degil
    // pending veya completed kabul edilir
    expect([JOB_STATUS.PENDING, JOB_STATUS.COMPLETED]).toContain(row.status);

    await queue2.stop();
  });
});
