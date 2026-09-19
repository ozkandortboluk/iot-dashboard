# NexusNode IoT Dashboard

> Industrial IoT real-time telemetry, alarms, device control, automation and OTA management platform.

Repository: `ozkandortboluk/iot-dashboard`

See the GitHub **PROJE MERKEZİ Issue #1** for the current error list, priorities, feature roadmap and review checklist.

## Current release

- Version: `1.34.3`
- Branch: `main`
- Production runtime: bundled `dist/server.cjs`
- Node.js: `>=20`

## Core capabilities

- PostgreSQL + TimescaleDB telemetry storage
- Real-time WebSocket telemetry and bidirectional device commands
- Multi-tenant device/customer management
- Alarm and notification engine
- Customizable dashboard widgets
- Automation/scenario engine
- OTA Studio and Web Compiler
- Device heartbeat/offline detection
- Audit and operational tooling

## Development

Install dependencies with the repository's lockfile, then run the development server:

```bash
npm install
npm run dev
```

Validation:

```bash
npm run type-check
npm run lint
npm test
npm run build
```

VPS production deployment: [`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md)\n\nProduction build output is `dist/server.cjs` and the production start command is:

```bash
npm start
```

## Important

- Do not commit secrets or production credentials.
- Keep dependency lockfiles synchronized with `package.json`.
- Database migrations and TimescaleDB versions should be tested before production deployment.
- Review the central project issue after every significant change.
