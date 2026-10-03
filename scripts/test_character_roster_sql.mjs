process.env.DF_TEST_PROGRESSION='1';
process.env.DF_TEST_LEARNING='1';
process.env.DF_TEST_ROSTER='1';
await import('./test_creation_lock_sql.mjs');
