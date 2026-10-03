import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

/**
 * The slice of SQLite the repositories use. In the app it is backed by
 * expo-sqlite; in Jest it is backed by Node's built-in `node:sqlite`, so the
 * repository SQL (schema, search, filters, cascades) is tested against a real
 * SQLite engine instead of a mock.
 */

export type SqlParam = string | number | null;

export interface SqlDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  getFirst<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  getAll<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  /**
   * Runs `work` atomically: every statement issued through `tx` commits
   * together or not at all. Other queries cannot interleave with it.
   */
  transaction<T>(work: (tx: SqlDatabase) => Promise<T>): Promise<T>;
}

type ExpoQueryable = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

export class ExpoSqlDatabase implements SqlDatabase {
  constructor(
    private readonly db: ExpoQueryable,
    private readonly root: SQLiteDatabase | null = db as SQLiteDatabase,
  ) {}

  async exec(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }

  async run(sql: string, params: SqlParam[] = []): Promise<{ changes: number }> {
    const result = await this.db.runAsync(sql, params as SQLiteBindValue[]);
    return { changes: result.changes };
  }

  getFirst<T>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    return this.db.getFirstAsync<T>(sql, params as SQLiteBindValue[]);
  }

  getAll<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, params as SQLiteBindValue[]);
  }

  async transaction<T>(work: (tx: SqlDatabase) => Promise<T>): Promise<T> {
    if (!this.root) throw new Error('Nested transactions are not supported');
    let result: T | undefined;
    // Exclusive: plain withTransactionAsync lets unrelated async queries run
    // inside our transaction (documented expo-sqlite behaviour).
    await this.root.withExclusiveTransactionAsync(async (txn) => {
      result = await work(new ExpoSqlDatabase(txn, null));
    });
    return result as T;
  }
}
