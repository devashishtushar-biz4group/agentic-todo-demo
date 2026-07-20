export type Priority = "low" | "medium" | "high";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
  priority: Priority;
}

const BASE = import.meta.env.VITE_API_URL ?? "";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function listTodos(priority?: Priority): Promise<Todo[]> {
  const url = priority ? `${BASE}/api/todos?priority=${priority}` : `${BASE}/api/todos`;
  const res = await fetch(url);
  return json<Todo[]>(res);
}

export async function createTodo(title: string, priority?: Priority): Promise<Todo> {
  const body: { title: string; priority?: Priority } = { title };
  if (priority !== undefined) {
    body.priority = priority;
  }
  const res = await fetch(`${BASE}/api/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return json<Todo>(res);
}

export async function toggleTodo(id: number, done: boolean): Promise<Todo> {
  const res = await fetch(`${BASE}/api/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ done }),
  });
  return json<Todo>(res);
}

export async function updatePriority(id: number, priority: Priority): Promise<Todo> {
  const res = await fetch(`${BASE}/api/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priority }),
  });
  return json<Todo>(res);
}

export async function deleteTodo(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/todos/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
}
