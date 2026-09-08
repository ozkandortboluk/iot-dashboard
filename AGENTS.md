# Project Guidelines & Autonomous Developer Rules

## MANDATORY RULE 1: Automatic Semantic Version Bumping on Every Change (Her Değişiklikte Sürüm Yükseltme)

1. **Automatic Version Increment on Every Task/Modification**:
   - Whenever any code modification, feature addition, bugfix, or refactoring is performed in the project, the AI agent **MUST ALWAYS BUMP the application version** following Semantic Versioning (SemVer: `MAJOR.MINOR.PATCH`):
     - **PATCH bump (`1.2.1` -> `1.2.2`)**: For bug fixes, minor UI adjustments, styling fixes, Docker/build tweaks, and non-breaking improvements.
     - **MINOR bump (`1.2.x` -> `1.3.0`)**: For new features, new widgets, new API endpoints, major views, or protocol extensions.
     - **MAJOR bump (`1.x.x` -> `2.0.0`)**: For breaking architectural redesigns or database schema overhauls.
2. **Synchronized Multi-File Version Updates**:
   - The agent MUST keep the following files strictly synchronized with the newly bumped version:
     - `package.json` (`"version": "X.Y.Z"`)
     - `src/config/version.ts` (`export const APP_VERSION = 'X.Y.Z'; export const APP_RELEASE_TAG = 'vX.Y.Z';`)
     - `CHANGELOG.md` (Add a new chronological release block describing the changes)
3. **No Hardcoded Version Strings in Components**:
   - All UI components (e.g., `Sidebar.tsx`, `AccountSettingsView.tsx`, headers/footers) MUST import and display the version from `src/config/version.ts` rather than hardcoded string literals.

---

## MANDATORY RULE 2: Code Examples in Help & Knowledge Center (Yardım & Bilgi Merkezi)

1. **Always-Working Code Section (Örnekler & Çalışan Kod Blokları)**:
   - The "Yardım & Bilgi Merkezi" (Help & Knowledge Center / `HelpView.tsx`) MUST ALWAYS maintain an active, fully featured, working code examples section (`code_examples` / "Çalışan Kod Örnekleri & API").
   - This section must provide 100% executable, syntactically correct, and production-tested code snippets for real hardware and client integrations, including:
     - **ESP32 & NodeMCU (ESP8266) HTTP Telemetry Ingestion with Response Piggybacking (Downlink command execution for relays/PWM)**
     - **ESP32 Periodic Heartbeat / Ping (`/api/telemetry/ping`)** with dynamic timeout tolerance support
     - **ESP32 / ESP8266 Live WebSocket 2-Way Client**
     - **Compact Comma-Separated Fast Ingestion (`/api/v1/telemetry`)**
     - **JSON Telemetry Ingestion (`/api/telemetry`)**
     - **Device Output Control API (`/api/devices/:id/control`)**
     - **Python Production IoT Agent with Auto-Reconnect & Heartbeat**
     - **cURL & Node.js / JavaScript Fetch / Axios Telemetry & Control scripts**

2. **Synchronization on Any API/Backend Modification**:
   - Whenever any API endpoint, telemetry payload format, device control signature, heartbeat mechanism, or authentication header in the system is updated or introduced, the agent **MUST SIMULTANEOUSLY UPDATE all code snippets in `HelpView.tsx`** to reflect the new functionality.
   - Any new platform feature (such as new metrics, token schemas, or WebSocket protocols) MUST immediately receive a working hardware/software code template in `HelpView.tsx`.

