import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const sql = `
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_api_key_hash VARCHAR(128);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS auth_token VARCHAR(128);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_expires_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_revoked BOOLEAN DEFAULT FALSE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_last_used_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_scopes JSONB DEFAULT '["all"]'::jsonb;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_rotated_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip VARCHAR(45);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS hardware_model VARCHAR(64);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(32);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_status VARCHAR(32) DEFAULT 'IDLE';
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_target_firmware_id VARCHAR(64);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_target_version VARCHAR(32);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_progress INT DEFAULT 0;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS error_message TEXT;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_last_check_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_job_id VARCHAR(64);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT FALSE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS save_simulated_data_to_db BOOLEAN DEFAULT FALSE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS simulated_metrics JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS expected_interval_seconds INT DEFAULT 30;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS auto_detected_interval_seconds INT DEFAULT 30;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS heartbeat_timeout_seconds INT DEFAULT 60;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS interval_mode VARCHAR(16) DEFAULT 'auto';
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS custom_interval_seconds INT;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS recent_intervals JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS websocket_connected BOOLEAN DEFAULT FALSE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS output_definitions JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS supported_outputs JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS supported_commands JSONB DEFAULT '[]'::jsonb;
  `;
  try {
    await pool.query(sql);
    console.log("Success");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
