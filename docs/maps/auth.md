# Auth / Setup Map

## Login / session
Primary: `src/context/AuthContext.tsx`, `src/lib/apiFetch.ts`, `src/server/routes/auth.ts`, `src/server/middleware/auth.ts`.
Secondary: `src/server/db.ts`, `src/server/database/postgres.ts`, `src/server/services/websocket.ts`, `src/server/services/passwordReset.service.ts`.
Tests: `src/tests/auth.test.ts`, `runtime_auth_environment.test.ts`, `runtime_auth_isolation.test.ts`, `rest_api_security_matrix.test.ts`.
Flow: login → session → HttpOnly cookie → `/api/auth/me` → protected REST/WS.

## Setup / recovery
Primary: `src/components/setup/DatabaseSetupWizard.tsx`, `RecoveryView.tsx`, `src/server/routes/setup.ts`, `src/server/services/setup.service.ts`, `src/server/middleware/setupAuth.ts`.
Secondary: `scripts/generate-recovery-token.ts`, `src/context/AuthContext.tsx`.
Tests: `database_setup_wizard.test.ts`, `setup_auth_security.test.ts`, `password_reset_flow.test.ts`.
