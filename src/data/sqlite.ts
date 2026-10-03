import { openDatabaseAsync } from 'expo-sqlite';

import { prepareDatabase } from './schema';
import { ExpoSqlDatabase, type SqlDatabase } from './SqlDatabase';

export const DATABASE_NAME = 'archive.db';

/** Opens the on-device database and brings its schema up to date. */
export async function openArchiveDatabase(name: string = DATABASE_NAME): Promise<SqlDatabase> {
  const db = new ExpoSqlDatabase(await openDatabaseAsync(name));
  await prepareDatabase(db);
  return db;
}
