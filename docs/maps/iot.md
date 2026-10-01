# IoT / Realtime Map

## Telemetry
Primary: `src/server/routes/telemetry.ts`, `controllers/telemetry.controller.ts`, `services/telemetry.service.ts`, `repositories/telemetry.repository.ts`, `utils/telemetry.parser.ts`.
Physical/simulation: `physicalTelemetry.*`, `simulationTelemetry.*`.
Tests: `telemetry_db_integrity.test.ts`, `p0_database_telemetry_hardening.test.ts`, `scripts/telemetry-load-test.ts`.

## WebSocket / realtime
Primary: `src/server/services/websocket.ts`, `deviceWsProtocol.service.ts`, `deviceAuth.service.ts`, `src/context/RealtimeContext.tsx`.
Secondary: `src/server/middleware/auth.ts`, `tenantSecurity.service.ts`, `server.ts`.
Tests: `ws_protocol_integrity.test.ts`, `docker_postgres_proxy_ws.test.ts`, `runtime_auth_isolation.test.ts`.

## Devices / tenant
Primary: `routes/devices.ts`, `services/device.service.ts`, `deviceAuth.service.ts`, `repositories/device.repository.ts`, `tenantSecurity.service.ts`.
Tests: `device-api-key-uniqueness.test.ts`, `multitenant_negative_matrix.test.ts`, `rest_api_security_matrix.test.ts`.

## Commands / outputs
Primary: `routes/commands.ts`, `controllers/command.controller.ts`, `services/command.service.ts`.
Secondary: `services/websocket.ts`, `src/components/devices/outputs/`.
Tests: `command_lifecycle.test.ts`, `iot_command_claim_fallback.test.ts`.
