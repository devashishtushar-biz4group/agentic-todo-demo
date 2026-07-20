import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createTodo,
  deleteTodo,
  listTodos,
  toggleTodo,
  updatePriority,
  type Priority,
  type Todo,
} from "./api";

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#2e7d32",
  medium: "#e6a700",
  high: "#c62828",
};

interface PriorityFilterProps {
  value: Priority | "all";
  onChange: (value: Priority | "all") => void;
}

function PriorityFilterSelect({ value, onChange }: PriorityFilterProps) {
  return (
    <label>
      Filter by priority
      <select
        aria-label="Filter by priority"
        value={value}
        onChange={(e) => onChange(e.target.value as Priority | "all")}
      >
        <option value="all">All</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </label>
  );
}

interface TodoItemProps {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onDelete: (id: number) => void;
  onPriorityChange: (todo: Todo, priority: Priority) => void;
}

function TodoItem({ todo, onToggle, onDelete, onPriorityChange }: TodoItemProps) {
  return (
    <li>
      <label>
        <input type="checkbox" checked={todo.done} onChange={() => onToggle(todo)} />
        <span style={{ textDecoration: todo.done ? "line-through" : "none" }}>{todo.title}</span>
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
      <label>
        Priority
        <select
          aria-label={`Priority for ${todo.title}`}
          value={todo.priority}
          onChange={(e) => onPriorityChange(todo, e.target.value as Priority)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <button type="button" onClick={() => onDelete(todo.id)}>
        Delete
      </button>
    </li>
  );
}

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

  async function handlePriorityChange(todo: Todo, priority: Priority) {
    try {
      const updated = await updatePriority(todo.id, priority);
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
      <PriorityFilterSelect value={priorityFilter} onChange={setPriorityFilter} />
      <ul>
        {todos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onPriorityChange={handlePriorityChange}
          />
        ))}
      </ul>
    </main>
  );
}
