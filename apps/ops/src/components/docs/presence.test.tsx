// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Presence } from "./presence";

describe("Presence", () => {
  it("shows the initials of everyone in the document", () => {
    render(
      <Presence
        users={[
          { clientId: 1, name: "Mara Santos", color: "#2f6b4f" },
          { clientId: 2, name: "Jun Reyes", color: "#2c5c94" },
        ]}
      />,
    );
    expect(screen.getByText("MS")).toBeTruthy();
    expect(screen.getByText("JR")).toBeTruthy();
    expect(screen.getByText(/In this document: Mara Santos, Jun Reyes/)).toBeTruthy();
  });

  it("says so when nobody else is there", () => {
    render(<Presence users={[]} />);
    expect(screen.getByText("Just you here")).toBeTruthy();
  });

  it("counts the people it does not show", () => {
    const users = ["Ana", "Ben", "Cara", "Dan", "Eve"].map((name, index) => ({
      clientId: index + 1,
      name,
      color: "#2f6b4f",
    }));
    render(<Presence users={users} />);
    expect(screen.getByText("+1")).toBeTruthy();
  });
});
