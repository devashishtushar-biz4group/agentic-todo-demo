export interface Todo {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
}

const BASE = import.meta.env.VITE_API_URL ?? "";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function listTodos(): Promise<Todo[]> {
  const res = await fetch(`${BASE}/api/todos`);
  return json<Todo[]>(res);
}

export async function createTodo(title: string): Promise<Todo> {
  const res = await fetch(`${BASE}/api/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
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

export async function deleteTodo(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/todos/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
}
