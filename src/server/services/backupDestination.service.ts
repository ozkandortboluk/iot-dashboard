import fs from 'node:fs';
import path from 'node:path';

export const BACKUP_DESTINATIONS = ['local', 'disk', 'gdrive', 'dropbox', 'sftp'] as const;
export type BackupDestination = (typeof BACKUP_DESTINATIONS)[number];

const DESTINATIONS: Array<{ id: BackupDestination; label: string; description: string }> = [
  { id: 'local', label: 'VPS yerel disk', description: 'Root korumalı /var/backups/nexusnode/gunluk konumu' },
  { id: 'disk', label: 'Harici veya bağlı disk', description: 'VPS kök diskinden ayrı, bağlanmış bir dosya sistemi' },
  { id: 'gdrive', label: 'Google Drive', description: 'age ile şifrelenmiş arşiv; root tarafında rclone OAuth' },
  { id: 'dropbox', label: 'Dropbox', description: 'age ile şifrelenmiş arşiv; root tarafında rclone OAuth' },
  { id: 'sftp', label: 'Başka VPS (SFTP/SSH)', description: 'age ile şifrelenmiş arşiv; root tarafında SSH kimliği' },
];

function stateDir(): string {
  if (process.env.NODE_ENV === 'test' && process.env.NEXUS_TEST_DATA_DIR) {
    return path.resolve(process.env.NEXUS_TEST_DATA_DIR);
  }
  return path.join(process.cwd(), 'data');
}
const selectionPath = () => path.join(stateDir(), '.dr_destination.json');
const statusPath = () => path.join(stateDir(), '.dr_delivery_status.json');
const capabilityPath = () => path.join(stateDir(), '.dr_capabilities.json');

function readJSON(file: string): unknown {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
function validDestination(input: unknown): input is BackupDestination {
  return typeof input === 'string' && (BACKUP_DESTINATIONS as readonly string[]).includes(input);
}
function objectRecord(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
}

export function getBackupDestination(): BackupDestination {
  const record = objectRecord(readJSON(selectionPath()));
  return validDestination(record?.destination) ? record.destination : 'local';
}

function capabilities(): BackupDestination[] {
  const record = objectRecord(readJSON(capabilityPath()));
  if (!record || !Array.isArray(record.ready)) return ['local'];
  const ready = record.ready.filter(validDestination) as BackupDestination[];
  return [...new Set<BackupDestination>(['local', ...ready])];
}

export function readBackupDestinationStatus() {
  const requestedDestination = getBackupDestination();
  const ready = capabilities();
  const raw = objectRecord(readJSON(statusPath()));
  const lastDelivery = raw && validDestination(raw.destination) &&
    typeof raw.timestamp === 'string' && raw.timestamp.length <= 64 &&
    (raw.result === 'success' || raw.result === 'failed')
      ? {
          destination: raw.destination as BackupDestination,
          timestamp: raw.timestamp,
          result: raw.result as 'success' | 'failed',
        } : null;
  return {
    requestedDestination,
    destinations: DESTINATIONS.map((entry) => ({
      ...entry,
      configured: ready.includes(entry.id),
      requiresHostSetup: entry.id !== 'local',
    })),
    lastDelivery,
    note: 'Seçim tam kurtarma betiği içindir; SQL snapshot sayfasından bağımsızdır. Root tarafındaki servis gerçek hedefi yeniden doğrular.',
  };
}

export function selectBackupDestination(destination: unknown): ReturnType<typeof readBackupDestinationStatus> {
  if (!validDestination(destination)) throw new Error('Geçersiz yedekleme hedefi.');
  const ready = capabilities();
  if (!ready.includes(destination)) {
    throw new Error('Bu hedef VPS üzerinde henüz güvenli şekilde yapılandırılmadı.');
  }
  const dir = stateDir();
  fs.mkdirSync(dir, { recursive: true });
  // Atomic rename, no arbitrary paths, commands, credentials, or provider URLs.
  const file = selectionPath();
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Hedef ayar dosyası güvenli değil.');
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }
  const tmp = path.join(dir, '.dr_destination-' + process.pid + '-' +
    Math.random().toString(16).slice(2) + '.tmp');
  try {
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, destination }) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(tmp, file);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
  return readBackupDestinationStatus();
}
