import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import * as api from "../src/api";
import type { Todo } from "../src/api";

vi.mock("../src/api");

const mockedApi = vi.mocked(api);

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 1,
    title: "Sample todo",
    done: false,
    createdAt: "2026-01-01T00:00:00Z",
    priority: "medium",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("App", () => {
  it("renders todos returned from the API on load", async () => {
    mockedApi.listTodos.mockResolvedValue([makeTodo({ id: 1, title: "First" })]);

    render(<App />);

    expect(await screen.findByText("First")).toBeInTheDocument();
  });

  it("adds a new todo via the form", async () => {
    mockedApi.listTodos.mockResolvedValue([]);
    mockedApi.createTodo.mockResolvedValue(makeTodo({ id: 2, title: "New task" }));

    render(<App />);
    await waitFor(() => expect(mockedApi.listTodos).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New todo title"), "New task");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("New task")).toBeInTheDocument();
    expect(mockedApi.createTodo).toHaveBeenCalledWith("New task");
  });

  it("toggles a todo's done state", async () => {
    const todo = makeTodo({ id: 3, title: "Toggle me", done: false });
    mockedApi.listTodos.mockResolvedValue([todo]);
    mockedApi.toggleTodo.mockResolvedValue({ ...todo, done: true });

    render(<App />);
    const checkbox = await screen.findByRole("checkbox");

    const user = userEvent.setup();
    await user.click(checkbox);

    await waitFor(() => expect(mockedApi.toggleTodo).toHaveBeenCalledWith(3, true));
  });

  it("deletes a todo", async () => {
    const todo = makeTodo({ id: 4, title: "Delete me" });
    mockedApi.listTodos.mockResolvedValue([todo]);
    mockedApi.deleteTodo.mockResolvedValue(undefined);

    render(<App />);
    await screen.findByText("Delete me");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("Delete me")).not.toBeInTheDocument());
  });

  it("renders a priority badge for a todo in the list", async () => {
    mockedApi.listTodos.mockResolvedValue([
      makeTodo({ id: 5, title: "High priority todo", priority: "high" }),
    ]);

    render(<App />);
    await screen.findByText("High priority todo");

    const badge = screen.getByText("high");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-priority", "high");
  });

  it("narrows the rendered list when a priority filter is selected", async () => {
    mockedApi.listTodos.mockResolvedValueOnce([
      makeTodo({ id: 6, title: "Low task", priority: "low" }),
      makeTodo({ id: 7, title: "High task", priority: "high" }),
    ]);

    render(<App />);
    await screen.findByText("Low task");
    await screen.findByText("High task");

    mockedApi.listTodos.mockResolvedValueOnce([
      makeTodo({ id: 7, title: "High task", priority: "high" }),
    ]);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Filter by priority"), "high");

    await waitFor(() => expect(mockedApi.listTodos).toHaveBeenLastCalledWith("high"));
    await waitFor(() => expect(screen.queryByText("Low task")).not.toBeInTheDocument());
    expect(screen.getByText("High task")).toBeInTheDocument();
  });
});
