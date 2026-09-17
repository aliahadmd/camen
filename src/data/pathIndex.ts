type IndexDatabase = {
  execSync(sql: string): void;
  getFirstSync<T>(sql: string): T | null;
};

export function ensurePathIndex(db: IndexDatabase): void {
  const duplicate = db.getFirstSync<{ path: string }>(
    'SELECT path FROM shots GROUP BY path HAVING COUNT(*) > 1 LIMIT 1',
  );
  // Historical duplicate records must survive migration; new saves are serialized.
  db.execSync(duplicate
    ? 'CREATE INDEX IF NOT EXISTS idx_shots_path ON shots (path)'
    : 'CREATE UNIQUE INDEX IF NOT EXISTS idx_shots_path ON shots (path)');
}
