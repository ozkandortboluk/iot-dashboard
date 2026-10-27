import { Router } from 'express';
import { commandController } from '../controllers/command.controller.js';
import { authenticateUser } from '../middleware/auth.js';

const commandsRouter = Router();

// 1. User -> Device Command Creation (POST /api/devices/:deviceId/commands and aliases)
commandsRouter.post('/devices/:deviceId/commands', authenticateUser, (req, res) => commandController.createCommand(req, res));
commandsRouter.post('/devices/:deviceId/command', authenticateUser, (req, res) => commandController.createCommand(req, res));

// 2. User -> Device Commands List (GET /api/devices/:deviceId/commands)
commandsRouter.get('/devices/:deviceId/commands', authenticateUser, (req, res) => commandController.getDeviceCommands(req, res));

// 3. User -> Command by ID (GET /api/commands/:commandId)
commandsRouter.get('/commands/:commandId', authenticateUser, (req, res) => commandController.getCommandById(req, res));

// 4. User -> Cancel Command (POST /api/commands/:commandId/cancel)
commandsRouter.post('/commands/:commandId/cancel', authenticateUser, (req, res) => commandController.cancelCommand(req, res));

// 5. Hardware Device Downlink Command Polling (GET /api/device/commands or /api/v1/device/commands)
commandsRouter.get('/device/commands', (req, res) => commandController.pollDeviceCommands(req, res));

// 6. Hardware Device Command Execution Acknowledgement (POST /api/device/commands/ack or /api/v1/device/commands/ack)
commandsRouter.post('/device/commands/ack', (req, res) => commandController.acknowledgeDeviceCommand(req, res));

export { commandsRouter };
