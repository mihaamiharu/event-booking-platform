// Organizer request boundaries (ORG-001/ORG-002/ORG-003, NFR-011).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseOrganizerDraft } from "../../worker/src/routes/organizer.ts";

const valid = {
  name: "Room-aware event",
  description: "Draft",
  venueId: "venue-1",
  salesOpenAt: "2026-09-10T00:00:00.000Z",
  salesCloseAt: "2026-10-10T23:59:00.000Z",
  sessions: [{ startAt: "2026-10-15T02:00:00.000Z", endAt: "2026-10-15T05:00:00.000Z", capacity: 20 }],
  ticketTypes: [{ sessionIndex: 0, name: "General", priceIdr: 100000 }],
  publish: false,
};

describe("org-001/org-002/org-003 organizer validation", () => {
  it("normalizes a valid room capacity and ticket price", () => {
    const result = parseOrganizerDraft(valid);
    assert.ok("draft" in result);
    assert.equal(result.draft.sessions[0]!.capacity, 20);
    assert.equal(result.draft.ticketTypes[0]!.priceIdr, 100000);
  });

  it("rejects overlapping sessions", () => {
    const result = parseOrganizerDraft({
      ...valid,
      sessions: [
        valid.sessions[0],
        { startAt: "2026-10-15T04:00:00.000Z", endAt: "2026-10-15T06:00:00.000Z", capacity: 10 },
      ],
    });
    assert.deepEqual(result, { code: "SESSION_OVERLAP", message: "Sessions cannot overlap." });
  });

  it("rejects zero capacity, negative price, and an out-of-range ticket session", () => {
    const capacity = parseOrganizerDraft({ ...valid, sessions: [{ ...valid.sessions[0], capacity: 0 }] });
    assert.equal("code" in capacity && capacity.code, "SESSION_INVALID");
    const price = parseOrganizerDraft({ ...valid, ticketTypes: [{ ...valid.ticketTypes[0], priceIdr: -1 }] });
    assert.equal("code" in price && price.code, "TICKET_INVALID");
    const session = parseOrganizerDraft({ ...valid, ticketTypes: [{ ...valid.ticketTypes[0], sessionIndex: 2 }] });
    assert.equal("code" in session && session.code, "TICKET_INVALID");
  });

  it("allows an incomplete draft but keeps publication intent explicit", () => {
    const result = parseOrganizerDraft({ ...valid, ticketTypes: [], publish: true });
    assert.ok("draft" in result);
    assert.equal(result.draft.publish, true);
    assert.equal(result.draft.ticketTypes.length, 0);
  });
});
