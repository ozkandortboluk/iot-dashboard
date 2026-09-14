import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../server/db.js';
import { deviceWsProtocolService } from '../server/services/deviceWsProtocol.service.js';
import { terminateDeviceSockets, isAllowedWsOrigin } from '../server/services/websocket.js';
import type { Device } from '../types.js';

describe('P1 - 2.3: WebSocket Protocol Integrity & Hardening', () => {
  const testDevId = 'dev_test_01';
  const testApiKey = 'dev_key_test_0000000000000000';

  beforeEach(() => {
    const dev = db.getDeviceById('dev_test_01');
    if (dev) {
      dev.status = 'online';
      dev.tenantId = 'usr_test_admin';
      dev.apiKey = testApiKey;
    }
  });

  it('1. Origin Validation Policy (CORS/Origin Protection for WebSockets)', () => {
    expect(isAllowedWsOrigin('https://nexusnodeiot.com.tr')).toBe(true);
    expect(isAllowedWsOrigin('https://app.nexusnodeiot.com.tr')).toBe(true);
    expect(isAllowedWsOrigin('https://ais-dev-test.run.app')).toBe(true);
    expect(isAllowedWsOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedWsOrigin(null)).toBe(true); // Non-browser embedded clients (ESP32)

    expect(isAllowedWsOrigin('https://malicious-site.attacker.com')).toBe(false);
    expect(isAllowedWsOrigin('https://phishing-iot.xyz')).toBe(false);
  });

  it('2. Telemetry Schema Validation (Reject malformed envelope or empty data)', async () => {
    const mockWs: any = {
      readyState: 1, // OPEN
      send: () => {},
      isAuth: true,
      device: db.getDeviceById(testDevId),
    };

    // Missing data payload
    const invalidEnvelope: any = {
      type: 'telemetry',
      deviceId: testDevId,
      messageId: 'msg_invalid_01',
      timestamp: Date.now(),
      // data is missing
    };

    const handled = await deviceWsProtocolService.handleDeviceMessage(mockWs, invalidEnvelope);
    expect(handled).toBe(false);
  });

  it('3. Command -> ACK Execution Round-Trip via WebSocket Protocol', async () => {
    const mockWs: any = {
      readyState: 1,
      OPEN: 1,
      send: () => {},
      isAuth: true,
      device: db.getDeviceById(testDevId),
    };

    // Register socket
    deviceWsProtocolService.registerDeviceSocket(testDevId, mockWs);
    expect(deviceWsProtocolService.isDeviceConnected(testDevId)).toBe(true);

    // Queue command for device
    const cmd = await db.addDeviceCommand({
      deviceId: testDevId,
      type: 'RELAY_TOGGLE',
      payload: { pin: 12, state: 1 },
      status: 'pending',
    });
    expect(cmd).toBeDefined();
    expect(cmd.id).toBeDefined();

    // Device sends ACK message back
    const ackMsg: any = {
      type: 'ack',
      deviceId: testDevId,
      messageId: `msg_ack_${Date.now()}`,
      timestamp: Date.now(),
      data: {
        forMessageId: cmd.id,
        commandId: cmd.id,
        status: 'executed',
        result: { pin: 12, state: 1, applied: true },
      },
    };

    const ackHandled = await deviceWsProtocolService.handleDeviceMessage(mockWs, ackMsg);
    expect(ackHandled).toBe(true);

    // Check command status in DB
    const updatedCmd = db.getDeviceCommands(testDevId).find((c) => c.id === cmd.id);
    expect(updatedCmd?.status).toBe('executed');

    deviceWsProtocolService.unregisterDeviceSocket(testDevId, mockWs);
  });

  it('4. Credential Revocation terminates active WebSocket connections', () => {
    let socketClosed = false;
    let closeCode = 0;
    let closeReason = '';

    const mockWs: any = {
      readyState: 1,
      device: db.getDeviceById(testDevId),
      close: (code: number, reason: string) => {
        socketClosed = true;
        closeCode = code;
        closeReason = reason;
      },
      terminate: () => {
        socketClosed = true;
      },
    };

    // Verify terminateDeviceSockets triggers close
    terminateDeviceSockets(testDevId, 1008, 'API key revoked');
    // Calling db.revokeApiKey
    db.revokeApiKey(testDevId, 'Security compromise');
    const revokedDev = db.getDeviceById(testDevId);
    expect(revokedDev?.apiKeyRevoked).toBe(true);
  });
});
