const fs = require('fs');
let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const newEntry = `## [1.9.9] - 2026-09-12

### Fixed
- Fixed widespread TypeScript 1064 errors regarding asynchronous return types in \`db.ts\`, \`device.repository.ts\`, \`alarm.repository.ts\`, \`notification.repository.ts\`, \`telemetry.repository.ts\`, and \`user.repository.ts\`.
- Updated Express route handlers in \`alarms.ts\`, \`devices.ts\`, \`network.ts\`, and \`auth.ts\` to use \`async (req, res)\` when \`await\` is utilized.
- Resolved various property access and parameter mismatched type errors (TS2339, TS2740) across repository methods.
- Fixed un-awaited promises and sync/async logic mismatch in integration test files (\`alarm-engine.test.ts\`, \`simulator.test.ts\`, \`auth.test.ts\`, \`docker_postgres_proxy_ws.test.ts\`, \`automation_and_field_ops.test.ts\`).

`;
changelog = changelog.replace('# Changelog\n\n', '# Changelog\n\n' + newEntry);
fs.writeFileSync('CHANGELOG.md', changelog);
