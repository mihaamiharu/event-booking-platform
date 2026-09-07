// Event detail endpoint tests (EVT-002, NFR-009; row budgets usage-model §3).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker, type ApiMeta } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8795);
const BASE = baseUrl(PORT);
const ID = "s3-detail-evt002";

let stop: () => void;
let cookie = "";
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
  cookie = await provision(BASE, ID);
});
after(() => stop());

interface Detail {
  slug: string;
  name: string;
  sessions: { id: string; remainingCapacity: number; bookable: boolean; reason?: string }[];
  ticketTypes: { id: string; name: string; priceIdr: number }[];
}

async function detail(slug: string): Promise<{ status: number; body: never }> {
  const res = await fetch(`${BASE}/api/events/${slug}`, { headers: headers(ID, cookie) });
  return { status: res.status, body: (await res.json()) as never };
}

describe("evt-002 GET /api/events/:slug", () => {
  it("returns detail with bookable session and ticket prices", async () => {
    const { status, body } = await detail("jakarta-design-systems-workshop");
    assert.equal(status, 200);
    const data = (body as unknown as { data: Detail }).data;
    assert.equal(data.name, "Jakarta Design Systems Workshop");
    assert.equal(data.sessions.length, 1);
    const session = data.sessions[0]!;
    assert.equal(session.remainingCapacity, 18);
    assert.equal(session.bookable, true);
    assert.deepEqual(
      data.ticketTypes.map((t) => [t.name, t.priceIdr]),
      [["General", 150000], ["Premium", 250000]],
    );
  });

  it("marks the sold-out session with its reason", async () => {
    const { body } = await detail("community-product-meetup");
    const data = (body as unknown as { data: Detail }).data;
    const session = data.sessions.find((s) => s.remainingCapacity === 0)!;
    assert.ok(session);
    assert.equal(session.bookable, false);
    assert.equal(session.reason, "SOLD_OUT");
  });

  it("returns EVENT_NOT_FOUND for draft, cancelled, past, and unknown slugs", async () => {
    for (const slug of ["modern-web-conference", "creative-tech-evening", "product-leadership-forum", "no-such-event"]) {
      const { status, body } = await detail(slug);
      assert.equal(status, 404, slug);
      assert.equal((body as unknown as { error: { code: string } }).error.code, "EVENT_NOT_FOUND", slug);
    }
  });

  it("stays within the row budget (≤50 reads)", async () => {
    const { body } = await detail("jakarta-design-systems-workshop");
    const meta = (body as unknown as { meta: ApiMeta }).meta;
    assert.ok(meta.rows_read <= 50, `rows_read=${meta.rows_read}`);
  });
});
