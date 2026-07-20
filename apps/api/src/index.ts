import { createApp } from "./app.js";
import { createDb } from "./db/client.js";

const dbPath = process.env.DB_PATH ?? "./todos.db";
const port = Number(process.env.PORT ?? 3001);

const db = createDb(dbPath);
const app = createApp(db);

app.listen(port, () => {
  console.log(`api listening on :${port} (db: ${dbPath})`);
});
