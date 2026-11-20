// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Kanban } from "./kanban";

type Item = { id: string; columnId: string; position: number; title: string };

const columns = [
  { id: "todo", label: "To do" },
  { id: "done", label: "Done" },
];

const items: Item[] = [
  { id: "1", columnId: "todo", position: 1000, title: "Call the club" },
  { id: "2", columnId: "todo", position: 2000, title: "Send the proposal" },
];

afterEach(cleanup);

describe("Kanban", () => {
  it("renders a column with its cards and a count", () => {
    render(
      <Kanban
        columns={columns}
        items={items}
        renderCard={(item) => <div>{item.title}</div>}
        onMove={() => undefined}
        getItemLabel={(item) => item.title}
      />,
    );

    expect(screen.getByRole("region", { name: "To do" })).toBeTruthy();
    expect(screen.getByText("Call the club")).toBeTruthy();
    expect(screen.getByText("Send the proposal")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("No cards")).toBeTruthy();
  });

  it("gives each card a named drag handle for keyboard and touch users", () => {
    render(
      <Kanban
        columns={columns}
        items={items}
        renderCard={(item) => <div>{item.title}</div>}
        onMove={() => undefined}
        getItemLabel={(item) => item.title}
      />,
    );

    expect(screen.getByRole("button", { name: "Move Call the club" })).toBeTruthy();
  });

  it("shows no drag handles when the board is read only", () => {
    render(
      <Kanban
        columns={columns}
        items={items}
        renderCard={(item) => <div>{item.title}</div>}
        onMove={() => undefined}
        disabled
      />,
    );

    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
  });

  it("renders a custom column header", () => {
    render(
      <Kanban
        columns={columns}
        items={items}
        renderCard={(item) => <div>{item.title}</div>}
        onMove={() => undefined}
        renderColumnHeader={(column, count) => (
          <div>
            {column.label}: {count}
          </div>
        )}
      />,
    );

    expect(screen.getByText("To do: 2")).toBeTruthy();
    expect(screen.getByText("Done: 0")).toBeTruthy();
  });
});
