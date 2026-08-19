import { Router } from 'express';
import { telemetryController } from '../controllers/telemetry.controller.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Primary Production Remote Telemetry Ingestion Handler (Strict Single JSON Payload)
router.post('/', (req, res) => telemetryController.ingest(req, res));

// Legacy Multi-Format Ingestion Handler (CSV, Flat Query, Root Array)
router.post('/legacy', (req, res) => telemetryController.ingestLegacy(req, res));

// Telemetry Historical & Analytics Endpoints
router.get('/stats', authenticateUser, (req, res) => telemetryController.getStats(req, res));
router.get('/history', authenticateUser, (req, res) => telemetryController.getHistory(req, res));
router.get('/history/aggregated', authenticateUser, (req, res) => telemetryController.getAggregatedHistory(req, res));

export const handleTelemetryIngest = (req: any, res: any) => telemetryController.ingest(req, res);
export const telemetryRouter = router;
