# SSH Bootstrap Token & Connection Fix Implementation Plan

This plan addresses the SSH bootstrap authentication, UI input for bootstrap token/key, robust error handling, and test consistency.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **SSH Bootstrap Token UI**: Adding a dedicated input field in the SSH connection modal/drawer for the development environment bootstrap/recovery token.
> - **Authentication Check**: Verifying the bootstrap token via `/bootstrap-token` before initiating tunnel test/connection.
> - **Test Suite Alignment**: Updating unit and integration tests (`ssh_bootstrap_http.test.ts` and `aistudio_ssh_connection_flow.test.ts`) to consistently expect strict authentication requirements on bootstrap endpoints.

- **Confirmed Decision**: Implement clean UI prompt for the bootstrap token with local storage persistence and clear error feedback.

---

## 1. Overview & Core Concept

- **What It Does**: Allows developers to supply and save the development environment bootstrap/recovery token in the SSH connection dialog, validates it with the backend (`/bootstrap-token`), handles 401 errors cleanly with descriptive messages, and clears expired tokens automatically.
- **Key Value**: Eliminates silent SSH connection failures and provides a seamless developer flow when setting up tunnels.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. User opens SSH Connection Drawer.
  2. If no valid bootstrap token is stored, a clearly labeled input field ("Dev Environment Bootstrap / Recovery Token") appears.
  3. Clicking "Test Connection" or "Connect" validates the token; on success, proceeds to SSH tunnel initialization. On 401, displays the exact backend error message and prompts for token update.
- **Visual Identity & Theme**: Professional utilitarian style matching the existing design system with Tailwind CSS.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: LocalStorage caching of bootstrap token with manual override.
  - *Why*: Prevents re-entering the token on every modal open while allowing quick updates when the dev environment restarts and generates a new token.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────┐         ┌─────────────────────────┐
│ SSHTunnelDrawer.tsx     │───────> │ /api/bootstrap-token    │
│ (Token Input & State)   │         │ (Backend Validation)    │
└─────────────────────────┘         └─────────────────────────┘
             │                                   │
             ▼                                   ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│ SSH Connection Logic    │         │ App.tsx Auth Gate       │
└─────────────────────────>         └─────────────────────────┘
```
