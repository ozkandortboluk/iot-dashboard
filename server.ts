// This file acts as a wrapper so that the platform deployer sees "node server.ts" in package.json
// and correctly identifies this as a Full-Stack application.

if (process.env.NODE_ENV === 'production') {
  // In production, run the pre-bundled server
  const prodPath = './dist/server.cjs';
  import(prodPath).catch(err => {
    console.error("Failed to start production server:", err);
    process.exit(1);
  });
} else {
  // In development, tsx will run this and resolve the dynamic import
  import('./server-main.ts').catch(err => {
    console.error("Failed to start development server:", err);
    process.exit(1);
  });
}
