import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };
const sql = globalForDb.sql ?? postgres(process.env.DATABASE_URL ?? "", { max: 5, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Exec = Db | Tx;
