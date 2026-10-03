// Reuse the complete creation boundary fixture before applying the incremental XP migration.
process.env.DF_TEST_PROGRESSION='1';
await import('./test_creation_lock_sql.mjs');
