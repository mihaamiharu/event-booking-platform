// Catalog endpoint tests (EVT-001, NFR-009; row budgets usage-model §3).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker, type ApiMeta } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8794);
const BASE = baseUrl(PORT);
const ID = "s3-catalog-evt001";

let stop: () => void;
let cookie = "";
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
  cookie = await provision(BASE, ID);
});
after(() => stop());

interface CatalogItem {
  slug: string;
  name: string;
  venue: { name: string; city: string };
  startingPriceIdr: number;
  currency: string;
  availabilityStatus: string;
}

async function catalog(query = ""): Promise<{ status: number; body: never }> {
  const res = await fetch(`${BASE}/api/events${query}`, { headers: headers(ID, cookie) });
  return { status: res.status, body: (await res.json()) as never };
}

describe("evt-001 GET /api/events", () => {
  it("lists published events with prices, venue, and availability", async () => {
    const { status, body } = await catalog();
    assert.equal(status, 200);
    const data = (body as unknown as { data: CatalogItem[] }).data;
    assert.equal(data.length, 2);
    const workshop = data.find((e) => e.slug === "jakarta-design-systems-workshop")!;
    assert.deepEqual(workshop.venue, { name: "Merdeka Community Hall", city: "Jakarta" });
    assert.equal(workshop.startingPriceIdr, 150000);
    assert.equal(workshop.currency, "IDR");
    assert.equal(workshop.availabilityStatus, "AVAILABLE");
    const meetup = data.find((e) => e.slug === "community-product-meetup")!;
    assert.equal(meetup.availabilityStatus, "SOLD_OUT");
  });

  it("paginates and reports totals", async () => {
    const { body } = await catalog("?perPage=1&page=2");
    const page = body as unknown as { data: CatalogItem[]; pagination: { page: number; perPage: number; total: number } };
    assert.deepEqual(page.pagination, { page: 2, perPage: 1, total: 2 });
    assert.equal(page.data.length, 1);
  });

  it("returns an empty page beyond the catalog, never an error", async () => {
    const { status, body } = await catalog("?perPage=1&page=9");
    assert.equal(status, 200);
    assert.deepEqual((body as unknown as { data: unknown[] }).data, []);
  });

  it("rejects invalid pagination with VALIDATION_FAILED", async () => {
    const { status, body } = await catalog("?perPage=51");
    assert.equal(status, 400);
    assert.equal((body as unknown as { error: { code: string } }).error.code, "VALIDATION_FAILED");
  });

  it("stays within the row budget (≤30 reads)", async () => {
    const { body } = await catalog();
    const meta = (body as unknown as { meta: ApiMeta }).meta;
    assert.ok(meta.rows_read <= 30, `rows_read=${meta.rows_read}`);
  });
});
