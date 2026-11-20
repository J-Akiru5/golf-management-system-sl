import { describe, expect, it } from "vitest";
import { can, canDeleteComment, canEditComment, type Viewer } from "./permissions";

const owner: Viewer = { role: "owner", status: "active" };
const partner: Viewer = { role: "partner", status: "active" };
const member: Viewer = { role: "member", status: "active" };
const suspended: Viewer = { role: "owner", status: "suspended" };

describe("can", () => {
  it("lets every active member read and write content", () => {
    for (const v of [owner, partner, member]) {
      expect(can(v, "content.read")).toBe(true);
      expect(can(v, "content.write")).toBe(true);
    }
  });

  it("limits deleting to owner and partner", () => {
    expect(can(owner, "content.delete")).toBe(true);
    expect(can(partner, "content.delete")).toBe(true);
    expect(can(member, "content.delete")).toBe(false);
  });

  it("limits member management and emails to owners", () => {
    expect(can(owner, "members.manage")).toBe(true);
    expect(can(owner, "members.list_emails")).toBe(true);
    expect(can(partner, "members.manage")).toBe(false);
    expect(can(member, "members.list_emails")).toBe(false);
  });

  it("gives nothing to a missing or suspended membership", () => {
    expect(can(null, "content.read")).toBe(false);
    expect(can(suspended, "content.read")).toBe(false);
    expect(can(suspended, "members.manage")).toBe(false);
  });
});

describe("comment rules", () => {
  it("lets the author delete, and owner or partner delete anyone's", () => {
    expect(canDeleteComment(member, "u1", "u1")).toBe(true);
    expect(canDeleteComment(member, "u1", "u2")).toBe(false);
    expect(canDeleteComment(partner, "u1", "u2")).toBe(true);
    expect(canDeleteComment(null, "u1", "u1")).toBe(false);
  });

  it("lets only the author edit", () => {
    expect(canEditComment(member, "u1", "u1")).toBe(true);
    expect(canEditComment(owner, "u1", "u2")).toBe(false);
    expect(canEditComment(suspended, "u1", "u1")).toBe(false);
  });
});
