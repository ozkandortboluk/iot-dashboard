import { physicalTelemetryController, PhysicalTelemetryController } from './physicalTelemetry.controller.js';
import { simulationTelemetryController, SimulationTelemetryController } from './simulationTelemetry.controller.js';

export const telemetryController = physicalTelemetryController;
export { PhysicalTelemetryController, SimulationTelemetryController, physicalTelemetryController, simulationTelemetryController };

