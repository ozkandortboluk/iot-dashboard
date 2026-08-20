# Project Guidelines & Autonomous Developer Rules

## MANDATORY RULE: Code Examples in Help & Knowledge Center (Yardım & Bilgi Merkezi)

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
