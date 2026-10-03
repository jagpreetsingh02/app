import { DatabaseSync } from 'node:sqlite';

import type { SqlDatabase, SqlParam } from '../../src/data/SqlDatabase';
import { prepareDatabase } from '../../src/data/schema';

/**
 * SqlDatabase over Node's built-in synchronous SQLite, used only in tests.
 * Same engine and SQL dialect as the device, so schema constraints, COLLATE
 * NOCASE, foreign-key cascades and the search SQL are exercised for real.
 */
export class NodeSqlDatabase implements SqlDatabase {
  constructor(readonly raw: DatabaseSync = new DatabaseSync(':memory:')) {}

  async exec(sql: string): Promise<void> {
    this.raw.exec(sql);
  }

  async run(sql: string, params: SqlParam[] = []): Promise<{ changes: number }> {
    const result = this.raw.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  async getFirst<T>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    return (this.raw.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  async getAll<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  async transaction<T>(work: (tx: SqlDatabase) => Promise<T>): Promise<T> {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const result = await work(this);
      this.raw.exec('COMMIT');
      return result;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
  }
}

export async function createTestDatabase(): Promise<NodeSqlDatabase> {
  const db = new NodeSqlDatabase();
  await prepareDatabase(db);
  return db;
}
