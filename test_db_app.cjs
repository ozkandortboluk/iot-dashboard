// Note: We can't easily require ES modules from CJS. We will use a dynamic import.
(async () => {
  const { db } = await import('./dist/server.cjs');
  console.log("Users:", db.data.users.length);
  const { adminTenantsRouter } = await import('./dist/server.cjs');
  console.log("Router exists:", !!adminTenantsRouter);
})();
