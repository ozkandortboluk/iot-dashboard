import { Router } from 'express';
import { telemetryController } from '../controllers/telemetry.controller.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Primary Remote Telemetry Ingestion Handler
router.all('/', (req, res) => telemetryController.ingest(req, res));

// Telemetry Historical & Analytics Endpoints
router.get('/stats', authenticateUser, (req, res) => telemetryController.getStats(req, res));
router.get('/history', authenticateUser, (req, res) => telemetryController.getHistory(req, res));
router.get('/history/aggregated', authenticateUser, (req, res) => telemetryController.getAggregatedHistory(req, res));

export const handleTelemetryIngest = (req: any, res: any) => telemetryController.ingest(req, res);
export const telemetryRouter = router;
