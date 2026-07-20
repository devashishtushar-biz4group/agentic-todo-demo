import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createTodo, deleteTodo, listTodos, toggleTodo, type Priority, type Todo } from "./api";

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#2e7d32",
  medium: "#e6a700",
  high: "#c62828",
};

export function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");

  useEffect(() => {
    listTodos(priorityFilter === "all" ? undefined : priorityFilter)
      .then(setTodos)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [priorityFilter]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const created = await createTodo(trimmed);
      setTodos((prev) => [...prev, created]);
      setTitle("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleToggle(todo: Todo) {
    try {
      const updated = await toggleTodo(todo.id, !todo.done);
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main>
      <h1>Todos</h1>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          aria-label="New todo title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a todo"
        />
        <button type="submit">Add</button>
      </form>
      <label>
        Filter by priority
        <select
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | "all")}
        >
          <option value="all">All</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <label>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => handleToggle(todo)}
              />
              <span style={{ textDecoration: todo.done ? "line-through" : "none" }}>
                {todo.title}
              </span>
            </label>
            <span
              data-priority={todo.priority}
              style={{
                color: PRIORITY_COLORS[todo.priority],
                border: `1px solid ${PRIORITY_COLORS[todo.priority]}`,
                borderRadius: "4px",
                padding: "0 4px",
                marginLeft: "4px",
              }}
            >
              {todo.priority}
            </span>
            <button type="button" onClick={() => handleDelete(todo.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
