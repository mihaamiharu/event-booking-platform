// Organizer lifecycle API coverage (ORG-001/ORG-002/ORG-003, NFR-011).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, startWorker, type ApiMeta } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "org-management-org001";

let stop: () => void;
before(async () => { stop = await startWorker(PORT); });
after(() => stop());

function sessionCookie(res: Response): string {
  const match = res.headers.getSetCookie().map((c) => c.match(/^ebp_session=([^;]*)/)?.[1]).find(Boolean);
  assert.ok(match, "response sets ebp_session");
  return match;
}

function cookieHeader(workspace: string, session: string): Record<string, string> {
  return { ...headers(`${ID}-${workspace}`), cookie: `ebp_workspace=${workspace}; ebp_session=${session}` };
}

async function signIn(workspace: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { ...headers(`${ID}-${email}`), cookie: `ebp_workspace=${workspace}` },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { role: string };
  assert.ok(body.role === "ORGANIZER" || body.role === "ATTENDEE");
  return sessionCookie(res);
}

function draftBody(venueId: string, publish = false) {
  return {
    name: `Organizer capacity lab ${Date.now()}`,
    description: "A workspace-scoped draft for room and ticket validation.",
    venueId,
    salesOpenAt: "2026-09-10T00:00:00.000Z",
    salesCloseAt: "2026-10-10T23:59:00.000Z",
    sessions: [{ startAt: "2026-10-15T02:00:00.000Z", endAt: "2026-10-15T05:00:00.000Z", capacity: 30 }],
    ticketTypes: [{ sessionIndex: 0, name: "General", priceIdr: 75000 }],
    publish,
  };
}

describe("org-001 organizer authorization", () => {
  it("allows the seeded organizer and rejects attendee and anonymous callers", async () => {
    const workspace = await provision(BASE, `${ID}-auth`);
    const anonymous = await fetch(`${BASE}/api/organizer`, { headers: headers(`${ID}-anonymous`, workspace), });
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json() as { error: { code: string } }).error.code, "AUTH_REQUIRED");

    const attendee = await signIn(workspace, "alex.attendee@example.test", "Attend123!");
    const forbidden = await fetch(`${BASE}/api/organizer`, { headers: cookieHeader(workspace, attendee) });
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json() as { error: { code: string } }).error.code, "ORGANIZER_FORBIDDEN");

    const organizer = await signIn(workspace, "raka.organizer@example.test", "Organize123!");
    const allowed = await fetch(`${BASE}/api/organizer`, { headers: cookieHeader(workspace, organizer) });
    assert.equal(allowed.status, 200);
    const body = await allowed.json() as { venues: Array<{ id: string }>; events: unknown[]; meta: ApiMeta };
    assert.ok(body.venues.length >= 1);
    assert.equal(body.events.length, 5);
    assert.ok(body.meta.rows_written >= 1);
  });
});

describe("org-002/org-003 event management", () => {
  it("creates an unpublished draft, then publishes room capacity and ticket configuration", async () => {
    const workspace = await provision(BASE, `${ID}-lifecycle`);
    const organizer = await signIn(workspace, "raka.organizer@example.test", "Organize123!");
    const dashboard = await fetch(`${BASE}/api/organizer`, { headers: cookieHeader(workspace, organizer) });
    const dashboardBody = await dashboard.json() as { venues: Array<{ id: string }> };
    const body = draftBody(dashboardBody.venues[0]!.id);
    const createdRes = await fetch(`${BASE}/api/organizer/events`, {
      method: "POST",
      headers: cookieHeader(workspace, organizer),
      body: JSON.stringify(body),
    });
    assert.equal(createdRes.status, 201);
    const created = await createdRes.json() as { event: { id: string; slug: string; status: string; sessions: Array<{ capacity: number }>; ticketTypes: Array<{ priceIdr: number }> } };
    assert.equal(created.event.status, "DRAFT");
    assert.equal(created.event.sessions[0]!.capacity, 30);
    assert.equal(created.event.ticketTypes[0]!.priceIdr, 75000);

    const notPublic = await fetch(`${BASE}/api/events/${encodeURIComponent(created.event.slug)}`, { headers: headers(`${ID}-lifecycle`, workspace) });
    assert.equal(notPublic.status, 404);

    const publishRes = await fetch(`${BASE}/api/organizer/events/${encodeURIComponent(created.event.id)}`, {
      method: "PUT",
      headers: cookieHeader(workspace, organizer),
      body: JSON.stringify({ ...body, name: `${body.name} Published`, publish: true, sessions: [{ ...body.sessions[0], id: created.event.sessions[0] ? undefined : undefined }] }),
    });
    // The server generates child IDs on create; the update body intentionally
    // uses the draft shape without child IDs to exercise replacement safely.
    assert.equal(publishRes.status, 200);
    const published = await publishRes.json() as { event: { slug: string; status: string; sessions: Array<{ capacity: number }>; ticketTypes: Array<{ priceIdr: number }> } };
    assert.equal(published.event.status, "PUBLISHED");
    assert.equal(published.event.sessions[0]!.capacity, 30);
    assert.equal(published.event.ticketTypes[0]!.priceIdr, 75000);

    const publicDetail = await fetch(`${BASE}/api/events/${encodeURIComponent(published.event.slug)}`, { headers: headers(`${ID}-lifecycle`, workspace) });
    assert.equal(publicDetail.status, 200);
    const detail = await publicDetail.json() as { data: { name: string; ticketTypes: Array<{ priceIdr: number }> } };
    assert.equal(detail.data.name, `${body.name} Published`);
    assert.equal(detail.data.ticketTypes[0]!.priceIdr, 75000);
  });

  it("rejects invalid publication without changing the draft", async () => {
    const workspace = await provision(BASE, `${ID}-validation`);
    const organizer = await signIn(workspace, "raka.organizer@example.test", "Organize123!");
    const dashboard = await fetch(`${BASE}/api/organizer`, { headers: cookieHeader(workspace, organizer) });
    const venueId = (await dashboard.json() as { venues: Array<{ id: string }> }).venues[0]!.id;
    const body = { ...draftBody(venueId), ticketTypes: [] };
    const createdRes = await fetch(`${BASE}/api/organizer/events`, { method: "POST", headers: cookieHeader(workspace, organizer), body: JSON.stringify(body) });
    assert.equal(createdRes.status, 201);
    const created = await createdRes.json() as { event: { id: string } };
    const invalid = await fetch(`${BASE}/api/organizer/events/${created.event.id}`, { method: "PUT", headers: cookieHeader(workspace, organizer), body: JSON.stringify({ ...body, publish: true }) });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json() as { error: { code: string } }).error.code, "TICKET_REQUIRED");
    const after = await fetch(`${BASE}/api/organizer`, { headers: cookieHeader(workspace, organizer) });
    const event = ((await after.json() as { events: Array<{ id: string; status: string; ticketTypes: unknown[] }> }).events).find((item) => item.id === created.event.id);
    assert.equal(event?.status, "DRAFT");
    assert.equal(event?.ticketTypes.length, 0);
  });
});

describe("org-001 workspace isolation", () => {
  it("does not allow an organizer from another workspace to update an event", async () => {
    const workspaceA = await provision(BASE, `${ID}-a`);
    const workspaceB = await provision(BASE, `${ID}-b`);
    const organizerA = await signIn(workspaceA, "raka.organizer@example.test", "Organize123!");
    const organizerB = await signIn(workspaceB, "raka.organizer@example.test", "Organize123!");
    const dashboard = await fetch(`${BASE}/api/organizer`, { headers: cookieHeader(workspaceA, organizerA) });
    const events = (await dashboard.json() as { events: Array<{ id: string }> }).events;
    const target = events[0]!;
    const res = await fetch(`${BASE}/api/organizer/events/${target.id}`, { method: "PUT", headers: cookieHeader(workspaceB, organizerB), body: JSON.stringify(draftBody("foreign-venue")) });
    assert.equal(res.status, 404);
    assert.equal((await res.json() as { error: { code: string } }).error.code, "EVENT_NOT_FOUND");
  });
});
