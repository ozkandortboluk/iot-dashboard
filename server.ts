import fs from 'node:fs';
import path from 'node:path';

// This file acts as a wrapper so that the platform deployer sees "node server.ts" in package.json
// and correctly identifies this as a Full-Stack application.

const distServerPath = path.join(process.cwd(), 'dist', 'server.cjs');
const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(distServerPath);

if (isProd && fs.existsSync(distServerPath)) {
  // In production (or when pre-bundled dist exists), run the pre-bundled server
  const prodPath = './dist/server.cjs';
  import(prodPath).catch(err => {
    console.error("Failed to start production server:", err);
    process.exit(1);
  });
} else {
  // In development, tsx will run this and resolve the TypeScript source
  import('./server-main.ts').catch(err => {
    console.error("Failed to start development server:", err);
    process.exit(1);
  });
}

