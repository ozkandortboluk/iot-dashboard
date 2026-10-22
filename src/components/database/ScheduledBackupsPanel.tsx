import React, { useState, useEffect, useMemo } from 'react';
import {
  HardDrive,
  Clock,
  Zap,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Download,
  Trash2,
  RotateCcw,
  Sliders,
  Check,
  Calendar,
  Save,
  Server,
  Database,
  Lock,
  Eye,
  Copy,
  CheckCheck,
  X,
  Cloud,
  Search,
  Terminal,
  FileCode,
  BookOpen,
  Wrench,
  ExternalLink,
} from 'lucide-react';
import { apiFetch as fetch } from '../../lib/apiFetch';
import type { ScheduledBackupConfig, BackupSnapshotItem } from '../../types';

type DestinationId = 'local' | 'disk' | 'gdrive' | 'dropbox' | 'sftp';
type DestinationStatus = {
  requestedDestination: DestinationId;
  destinations: Array<{
    id: DestinationId;
    label: string;
    description: string;
    configured: boolean;
    requiresHostSetup: boolean;
  }>;
  lastDelivery: null | { destination: DestinationId; timestamp: string; result: 'success' | 'failed' };
  note: string;
};

interface DestinationSetupInfo {
  id: DestinationId;
  title: string;
  badge: string;
  shortDesc: string;
  architecture: string;
  requirements: string[];
  steps: Array<{
    stepNumber: number;
    title: string;
    description: string;
    command?: string;
  }>;
  verificationCmd?: string;
  securityNote: string;
}

const DESTINATION_SETUP_GUIDES: Record<DestinationId, DestinationSetupInfo> = {
  local: {
    id: 'local',
    title: 'Yerel Sunucu Diski (NVMe/SSD)',
    badge: 'Varsayılan & Aktif',
    shortDesc: 'VPS ana depolama biriminde root korumalı yerel yedek dizini.',
    architecture:
      'Yedek dosyaları sunucunun ana dosya sisteminde (/var/backups/nexusnode/ veya data/backups/) izole şekilde saklanır. Ekstra bir dış ağ bağımlılığı olmadan en hızlı anlık snapshot ve kurtarma sağlar.',
    requirements: [
      'En az 5-10 GB boş yerel NVMe/SSD disk alanı',
      'Root veya node process yazma izni (0700 güvenli klasör modu)',
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Yedek Dizinini Hazırlama',
        description: 'VPS üzerinde kök korumalı yedek dizininin varlığını ve yetkilerini doğrulayın.',
        command: 'sudo mkdir -p /var/backups/nexusnode/gunluk && sudo chmod 700 /var/backups/nexusnode/gunluk',
      },
      {
        stepNumber: 2,
        title: 'Kullanıcı İzinlerini Ayarlama',
        description: 'Node.js servis kullanıcısının bu dizine yazabilmesi için sahipliği tanımlayın.',
        command: 'sudo chown -R 1000:1000 /var/backups/nexusnode',
      },
      {
        stepNumber: 3,
        title: 'Disk Doluluk Oranını Kontrol Etme',
        description: 'Ana diskte yeterli depolama alanı olduğunu teyit edin.',
        command: 'df -h /var/backups/nexusnode/',
      },
    ],
    verificationCmd: 'ls -ld /var/backups/nexusnode/gunluk',
    securityNote:
      'Yerel disk yedekleme daima etkindir ve devre dışı bırakılamaz. Fiziksel donanım veya ana VPS arızalarına karşı diğer hedeflerden (SAN, GDrive, Dropbox veya SFTP) en az birinin yapılandırılması önerilir.',
  },
  disk: {
    id: 'disk',
    title: 'İkincil VPS Montajlı Disk / SAN / Harici Blok Depolama',
    badge: 'İzole Blok Hacmi',
    shortDesc: 'VPS ana kök diskinden bağımsız, ayrı bir SCSI/NVMe blok depolama hacmi veya SAN montaj noktası.',
    architecture:
      'Sunucunuza bağlı ikincil bir sanal disk (/dev/sdb vb.) /mnt/nexus-backups konumuna kalıcı olarak bağlanır. Ana işletim sistemi çökse bile veriler harici blok depolama hacminde güvende kalır.',
    requirements: [
      'Bulut sağlayıcınızdan (Hetzner, DigitalOcean, AWS, OVH vb.) ek blok depolama hacmi (Volume)',
      'ext4 veya xfs dosya sistemi ile biçimlendirilmiş aygıt',
      '/etc/fstab üzerinde kalıcı montaj kaydı',
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'İkincil Diski Tespit Etme & Biçimlendirme',
        description: 'VPS terminalinde bağlı blok aygıtlarını listeleyin ve ikincil diski ext4 ile biçimlendirin.',
        command: 'sudo lsblk\nsudo mkfs.ext4 -F /dev/sdb',
      },
      {
        stepNumber: 2,
        title: 'Montaj Dizinini Oluşturma',
        description: 'Diskin bağlanacağı sistem dizinini hazırlayın.',
        command: 'sudo mkdir -p /mnt/nexus-backups',
      },
      {
        stepNumber: 3,
        title: 'Kalıcı Montaj Kaydı (/etc/fstab)',
        description: 'Sunucu yeniden başladığında diskin otomatik bağlanması için UUID değerini fstab dosyasına ekleyin.',
        command:
          'UUID=$(sudo blkid -s UUID -o value /dev/sdb)\necho "UUID=$UUID /mnt/nexus-backups ext4 defaults,noatime,nofail 0 2" | sudo tee -a /etc/fstab\nsudo mount -a',
      },
      {
        stepNumber: 4,
        title: 'Dizin Güvenlik İzinleri',
        description: 'Klasör sahipliğini ve okuma/yazma izinlerini kısıtlayın.',
        command: 'sudo chown -R 1000:1000 /mnt/nexus-backups\nsudo chmod 700 /mnt/nexus-backups',
      },
      {
        stepNumber: 5,
        title: 'Sistem Bağlantısı (Symlink)',
        description: 'Yedekleme servisinin bu diski görmesi için sistem bağıntısını oluşturun.',
        command: 'sudo mkdir -p /var/backups/nexusnode\nsudo ln -sfn /mnt/nexus-backups /var/backups/nexusnode/mounted-disk',
      },
    ],
    verificationCmd: 'df -h /mnt/nexus-backups',
    securityNote:
      'Blok depolama birimi VPS ana diskinden bağımsız bir donanım katmanında çalışır. Bu sayede işletim sistemi güncellemelerinde veya çöküşlerde sıfır veri kaybı riski sunar.',
  },
  gdrive: {
    id: 'gdrive',
    title: 'Google Drive Cloud Storage',
    badge: 'Offsite Bulut Arşivleme',
    shortDesc: 'Google Drive API ve rclone üzerinden client-side age şifrelemeli bulut yedekleme.',
    architecture:
      'Yedek arşivleri sunucudan çıkmadan önce modern "age" 256-bit asimetrik anahtarı ile şifrelenir. Google Drive üzerinde açılan klasöre yalnızca şifreli ikili dosyalar aktarılır; Google dahil kimse içeriği okuyamaz.',
    requirements: [
      'Google Cloud Console üzerinde ücretsiz bir proje',
      'Google Drive API etkinleştirilmiş ve Desktop App OAuth Client ID alınmış olmalı',
      'VPS sunucusunda rclone ve age paketleri kurulu olmalı',
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Gerekli Araçların (rclone & age) Kurulumu',
        description: 'VPS terminalinde rclone ve age şifreleme paketlerini yükleyin.',
        command: 'sudo apt-get update && sudo apt-get install -y rclone age',
      },
      {
        stepNumber: 2,
        title: 'Kriptografik Asimetrik Anahtar Üretme',
        description: 'Yedeklerin buluta yüklenmeden önce şifrelenmesi için güvenli bir age anahtar çifti oluşturun.',
        command:
          'sudo mkdir -p /root/.nexusnode-keys\nsudo age-keygen -o /root/.nexusnode-keys/backup_age.key\nsudo chmod 600 /root/.nexusnode-keys/backup_age.key',
      },
      {
        stepNumber: 3,
        title: 'Google Drive rclone Yapılandırması',
        description: 'Google Cloud Console OAuth bilgileriyle rclone remote tanımını yapın.',
        command:
          'rclone config\n# 1. "n" (New remote) seçin\n# 2. İsim: gdrive-backup\n# 3. Storage türü: drive\n# 4. client_id ve client_secret bilgilerinizi girin\n# 5. Scope: 1 (Full access to all files)',
      },
      {
        stepNumber: 4,
        title: 'Yedek Klasörü Oluşturma & Yetki Doğrulama',
        description: 'Google Drive üzerinde NexusNode yedek klasörünü açın ve bağlantıyı test edin.',
        command: 'rclone mkdir gdrive-backup:NexusNode-Backups\nrclone lsd gdrive-backup:',
      },
    ],
    verificationCmd: 'rclone about gdrive-backup:',
    securityNote:
      'Oluşturulan age anahtar çiftinin açık anahtarı (public key) şifrelemede kullanılırken, gizli anahtar (private key) yalnızca felaket kurtarmada gereklidir. Gizli anahtarınızı harici bir kasada saklayınız.',
  },
  dropbox: {
    id: 'dropbox',
    title: 'Dropbox Enterprise / Cloud Storage',
    badge: 'Offsite Bulut Depolama',
    shortDesc: 'Dropbox App API ve rclone üzerinden client-side şifrelenmiş otomatik senkronizasyon.',
    architecture:
      'Yedekler yerel sunucuda sıkıştırılıp şifrelendikten sonra Dropbox API üzerinden ayrılmış uygulama klasörüne (/Apps/NexusNode-Backups/) yüklenir.',
    requirements: [
      'Dropbox hesabı',
      'Dropbox Developers Console (developers.dropbox.com) üzerinde App Access Token',
      'VPS sunucusunda rclone ve age paketleri',
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'rclone ve age Paketlerini Kurma',
        description: 'Aktarım ve şifreleme kütüphanelerini VPS üzerine kurun.',
        command: 'sudo apt-get update && sudo apt-get install -y rclone age',
      },
      {
        stepNumber: 2,
        title: 'Dropbox Geliştirici Portalında Uygulama Açma',
        description:
          'developers.dropbox.com adresine gidin. "Scoped Access" ve "App folder" izinlerine sahip yeni uygulama oluşturun. Permissions sekmesinde "files.content.write" ve "files.content.read" yetkilerini onaylayın.',
      },
      {
        stepNumber: 3,
        title: 'Erişim Tokenı ile rclone Remote Tanımlama',
        description: 'Dropbox App Console üzerinden ürettiğiniz Generated Access Token ile remote ekleyin.',
        command:
          'rclone config\n# 1. "n" (New remote) seçin\n# 2. İsim: dropbox-backup\n# 3. Storage türü: dropbox\n# 4. token alanına aldığınız Token\'ı yapıştırın',
      },
      {
        stepNumber: 4,
        title: 'Dropbox Yedek Klasörünü Test Etme',
        description: 'Uzak sunucuda klasörü oluşturup bağlantıyı test edin.',
        command: 'rclone mkdir dropbox-backup:NexusNode-Backups\nrclone ls dropbox-backup:',
      },
    ],
    verificationCmd: 'rclone about dropbox-backup:',
    securityNote:
      'Dropbox token bilgisi sunucunun şifreli root konfigürasyonunda saklanır. Dosyalar aktarılmadan önce yerel olarak şifrelendiğinden üçüncü taraf depolama sağlayıcısı verilerin içeriğini göremez.',
  },
  sftp: {
    id: 'sftp',
    title: 'Harici Güvenli SFTP / SSH Uzak Sunucusu',
    badge: 'Sunucudan Sunucuya Replikasyon',
    shortDesc: 'Ed25519 SSH anahtarıyla ikinci bir Linux sunucusuna izole ve şifrelenmiş otomatik veri aktarımı.',
    architecture:
      'Farklı bir veri merkezindeki (datacenter) veya ofisinizdeki bir yedekleme sunucusuna SFTP protokolüyle parola girmeden, yüksek güvenlikli açık/kapalı anahtar şifrelemesiyle transfer yapılır.',
    requirements: [
      'SSH/SFTP servisi çalışan ikincil bir Linux sunucusu veya NAS cihazı',
      'Yedek sunucusunda ayrılmış bir kullanıcı hesabı (ör. backupuser)',
      '22 numaralı SSH portu (veya özel SFTP portu) erişimi',
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Özel Ed25519 SSH Anahtar Çifti Üretme',
        description: 'Ana VPS üzerinde yedeklemeye özel şifresiz Ed25519 SSH anahtarı oluşturun.',
        command:
          'sudo ssh-keygen -t ed25519 -N "" -f /root/.ssh/nexus_backup_ed25519 -C "nexusnode-backup-agent"\nsudo chmod 600 /root/.ssh/nexus_backup_ed25519',
      },
      {
        stepNumber: 2,
        title: 'Açık Anahtarı Hedef Sunucuya Kopyalama',
        description: 'Oluşturulan açık anahtarı hedef yedekleme sunucusuna aktarın.',
        command: 'ssh-copy-id -i /root/.ssh/nexus_backup_ed25519.pub backupuser@HEDEF_SUNUCU_IP',
      },
      {
        stepNumber: 3,
        title: 'Parolasız SSH ve Dizin Oluşturma Testi',
        description: 'Hedef sunucuya parolasız bağlanabildiğinizi test edin ve yedek dizinini açın.',
        command:
          'ssh -i /root/.ssh/nexus_backup_ed25519 backupuser@HEDEF_SUNUCU_IP "mkdir -p ~/nexusnode-backups && ls -ld ~/nexusnode-backups"',
      },
      {
        stepNumber: 4,
        title: 'SFTP Oturum Testi',
        description: 'SFTP üzerinden veri aktarım oturumunu doğrulayın.',
        command: 'echo "ls" | sftp -i /root/.ssh/nexus_backup_ed25519 backupuser@HEDEF_SUNUCU_IP',
      },
    ],
    verificationCmd: 'ssh -i /root/.ssh/nexus_backup_ed25519 backupuser@HEDEF_SUNUCU_IP "df -h ~/nexusnode-backups"',
    securityNote:
      'Hedef sunucuda SSH güvenliğini artırmak için ForceCommand internal-sftp ve ChrootDirectory kullanarak yedek kullanıcısını yalnızca kendi klasörüne hapsedebilirsiniz.',
  },
};

const DESTINATION_ICONS: Record<DestinationId, React.ElementType> = {
  local: HardDrive,
  disk: Server,
  gdrive: Cloud,
  dropbox: Cloud,
  sftp: Terminal,
};

interface DestinationSetupModalProps {
  info: DestinationSetupInfo;
  isConfigured: boolean;
  onClose: () => void;
  onToggleEnable: (id: DestinationId, enable: boolean) => Promise<void>;
  activating: boolean;
}

const DestinationSetupModal: React.FC<DestinationSetupModalProps> = ({
  info,
  isConfigured,
  onClose,
  onToggleEnable,
  activating,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedVerify, setCopiedVerify] = useState(false);
  const Icon = DESTINATION_ICONS[info.id] || HardDrive;

  const copyText = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2500);
    } else {
      setCopiedVerify(true);
      setTimeout(() => setCopiedVerify(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{info.title}</h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                    isConfigured
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {isConfigured ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {isConfigured ? 'Yapılandırıldı & Hazır' : 'Kurulum & Yapılandırma Gerekli'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{info.shortDesc}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 overflow-y-auto text-xs">
          {/* Architecture Overview */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              Çalışma Mimarisi & Güvenlik Prensibi
            </span>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{info.architecture}</p>
          </div>

          {/* Requirements Checklist */}
          <div className="space-y-1.5">
            <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">Ön Koşullar & Gereksinimler:</span>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {info.requirements.map((req, idx) => (
                <li
                  key={idx}
                  className="p-2 rounded-lg bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start gap-2 text-[11px] text-slate-700 dark:text-slate-300"
                >
                  <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Step-by-Step Instructions */}
          <div className="space-y-3">
            <span className="font-bold text-slate-900 dark:text-white block text-xs">
              Adım Adım VPS Kurulum ve Yapılandırma Talimatları:
            </span>

            <div className="space-y-3">
              {info.steps.map((step, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      {step.stepNumber}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-900 dark:text-white text-xs block">{step.title}</span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{step.description}</p>
                    </div>
                  </div>

                  {step.command && (
                    <div className="flex items-start gap-2 bg-slate-950 text-slate-100 p-2.5 rounded-lg font-mono text-[11px]">
                      <pre className="overflow-x-auto select-all flex-1 text-emerald-400 font-mono whitespace-pre-wrap">
                        {step.command}
                      </pre>
                      <button
                        type="button"
                        onClick={() => copyText(step.command!, idx)}
                        className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition shrink-0"
                        title="Komutu Kopyala"
                      >
                        {copiedIndex === idx ? (
                          <CheckCheck className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Verification Command */}
          {info.verificationCmd && (
            <div className="p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-950/80 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
              <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-indigo-500" />
                Kurulum Doğrulama & Bağlantı Test Komutu
              </span>
              <div className="flex items-center gap-2 bg-slate-950 text-slate-100 p-2.5 rounded-lg font-mono text-[11px]">
                <code className="break-all select-all flex-1 text-indigo-300">{info.verificationCmd}</code>
                <button
                  type="button"
                  onClick={() => copyText(info.verificationCmd!)}
                  className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition shrink-0"
                  title="Komutu Kopyala"
                >
                  {copiedVerify ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Security Note */}
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <span>{info.securityNote}</span>
          </div>
        </div>

        {/* Modal Footer & Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            {isConfigured
              ? 'Bu hedef sistemde hazır durumdadır. İsterseniz devre dışı bırakabilirsiniz.'
              : 'Kurulum adımlarını tamamladıktan sonra butona tıklayarak hedefi kullanıma açın.'}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs transition"
            >
              Kapat
            </button>

            {info.id !== 'local' && (
              <button
                type="button"
                onClick={() => onToggleEnable(info.id, !isConfigured)}
                disabled={activating}
                className={`px-4 py-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition shadow-sm disabled:opacity-50 cursor-pointer ${
                  isConfigured
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {activating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : isConfigured ? (
                  <Trash2 className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {activating
                    ? 'İşleniyor...'
                    : isConfigured
                    ? 'Hedefi Devre Dışı Bırak'
                    : '✓ Kurulumu Tamamla & Hedefi Etkinleştir'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const DisasterRecoveryDestinationPanel: React.FC = () => {
  const [status, setStatus] = useState<DestinationStatus | null>(null);
  const [choice, setChoice] = useState<DestinationId>('local');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setupModalTarget, setSetupModalTarget] = useState<DestinationSetupInfo | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/database/dr/destination')
      .then(async (r) => {
        if (!r.ok) throw new Error('Hedef bilgileri alınamadı');
        return r.json();
      })
      .then((data: DestinationStatus) => {
        if (!cancelled) {
          setStatus(data);
          setChoice(data.requestedDestination);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Tam kurtarma hedefleri okunamadı.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/database/dr/destination', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: choice }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Hedef seçimi kaydedilemedi');
      setStatus(data);
      setNotice('Afet kurtarma hedef tercihi kaydedildi. Sonraki tam yedeklemede kullanılacaktır.');
      setTimeout(() => setNotice(null), 5000);
    } catch (e: any) {
      setError(e.message || 'Hedef seçimi kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleEnable = async (id: DestinationId, enable: boolean) => {
    setActivating(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint = enable ? '/api/database/dr/destination/enable' : '/api/database/dr/destination/disable';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'İşlem başarısız');
      setStatus(data);
      if (enable) {
        setChoice(id);
        setNotice(`${DESTINATION_SETUP_GUIDES[id]?.title || id} hedefi başarıyla etkinleştirildi ve kullanıma açıldı.`);
      } else {
        setChoice(data.requestedDestination);
        setNotice(`${DESTINATION_SETUP_GUIDES[id]?.title || id} hedefi devre dışı bırakıldı.`);
      }
      setSetupModalTarget(null);
      setTimeout(() => setNotice(null), 5000);
    } catch (e: any) {
      setError(e.message || 'Hedef durumu güncellenemedi.');
    } finally {
      setActivating(false);
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
      {/* Setup Guide Modal */}
      {setupModalTarget && (
        <DestinationSetupModal
          info={setupModalTarget}
          isConfigured={status?.destinations.find((x) => x.id === setupModalTarget.id)?.configured ?? false}
          onClose={() => setSetupModalTarget(null)}
          onToggleEnable={handleToggleEnable}
          activating={activating}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-500" />
            Tam Kurtarma Yedeği — Saklama & Senkronizasyon Hedefi
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            PostgreSQL veritabanı, konfigürasyonlar, Vault anahtarları ve telemetri verilerinin saklanacağı hedef depolama birimini belirleyin.
            Kurulum adımlarını inceleyebilir ve istediğiniz hedefi doğrudan aktifleştirebilirsiniz.
          </p>
        </div>
        {status && (
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium self-start sm:self-auto border border-slate-200 dark:border-slate-700">
            Aktif Tercih:{' '}
            <strong className="text-indigo-600 dark:text-indigo-400">
              {status.destinations.find((x) => x.id === status.requestedDestination)?.label || 'Yerel Disk'}
            </strong>
          </span>
        )}
      </div>

      {status ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {status.destinations.map((item) => {
              const Icon = DESTINATION_ICONS[item.id] || HardDrive;
              const isSelected = choice === item.id;
              const isConfigured = item.configured;
              const setupInfo = DESTINATION_SETUP_GUIDES[item.id];

              return (
                <div
                  key={item.id}
                  className={`relative rounded-xl border p-4 flex flex-col justify-between transition select-none ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2.5 rounded-xl shrink-0 ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>

                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-white block">
                            {item.label}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-full ${
                              isConfigured
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {isConfigured ? (
                              <>
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Hazır & Aktif
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Kurulum Gerekli
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Selection Radio */}
                      <input
                        type="radio"
                        name="dr-destination"
                        value={item.id}
                        checked={isSelected}
                        onChange={() => {
                          if (isConfigured) {
                            setChoice(item.id);
                          } else if (setupInfo) {
                            setSetupModalTarget(setupInfo);
                          }
                        }}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 rounded-full cursor-pointer mt-1"
                        title={isConfigured ? 'Bu hedefi seç' : 'Bu hedefi yapılandır'}
                      />
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Actions & Setup Button */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setupInfo && setSetupModalTarget(setupInfo)}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px] flex items-center gap-1.5 transition cursor-pointer border border-indigo-200/80 dark:border-indigo-800"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>{isConfigured ? 'Kurulum & Detay' : '📖 Kurulum Adımları'}</span>
                    </button>

                    {isConfigured ? (
                      <button
                        type="button"
                        onClick={() => setChoice(item.id)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition cursor-pointer ${
                          isSelected
                            ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                      >
                        {isSelected ? '✓ Seçili Hedef' : 'Hedef Seç'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setupInfo && setSetupModalTarget(setupInfo)}
                        className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Wrench className="w-3 h-3" />
                        <span>Yapılandır</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {status.lastDelivery ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      status.lastDelivery.result === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  Son Senkronizasyon: {new Date(status.lastDelivery.timestamp).toLocaleString()} (
                  {status.lastDelivery.result === 'success' ? 'Başarılı' : 'Başarısız'})
                </span>
              ) : (
                <span>Tüm hedeflerin kurulum adımlarını inceleyebilir ve VPS ortamında anında devreye alabilirsiniz.</span>
              )}
            </div>

            <button
              type="button"
              onClick={save}
              disabled={busy || choice === status.requestedDestination}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition shadow-sm cursor-pointer self-start sm:self-auto flex items-center gap-1.5 active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{busy ? 'Kaydediliyor...' : 'Hedefi Kaydet'}</span>
            </button>
          </div>
        </>
      ) : (
        <div className="py-4 text-center text-xs text-slate-500">Hedef durumu yükleniyor...</div>
      )}

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
    </section>
  );
};

interface SnapshotDetailModalProps {
  snapshot: BackupSnapshotItem;
  onClose: () => void;
  onDownload: (filename: string) => void;
}

const SnapshotDetailModal: React.FC<SnapshotDetailModalProps> = ({ snapshot, onClose, onDownload }) => {
  const [copiedChecksum, setCopiedChecksum] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [reverifying, setReverifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const isSql = snapshot.filename.endsWith('.sql');
  const sizeMB = Math.round((snapshot.sizeBytes / (1024 * 1024)) * 100) / 100;
  const sizeKB = Math.round(snapshot.sizeBytes / 1024);

  const restoreCommand = isSql
    ? `docker exec -i iot-postgres-1 psql -U postgres -d iot_dashboard -v ON_ERROR_STOP=1 --single-transaction < /data/backups/${snapshot.filename}`
    : `npm run restore -- --file=${snapshot.filename}`;

  const copyToClipboard = (text: string, type: 'checksum' | 'cmd') => {
    navigator.clipboard.writeText(text);
    if (type === 'checksum') {
      setCopiedChecksum(true);
      setTimeout(() => setCopiedChecksum(false), 2500);
    } else {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2500);
    }
  };

  const handleLiveReverify = async () => {
    setReverifying(true);
    try {
      const res = await fetch(`/api/database/scheduled-backups/verify/${encodeURIComponent(snapshot.filename)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setVerifyResult(data.verification);
      }
    } catch {
      // Ignored
    } finally {
      setReverifying(false);
    }
  };

  const activeChecksum = verifyResult?.checksum || snapshot.checksum || 'Hesaplanmadı';
  const isHealthy = verifyResult ? verifyResult.isHealthy : snapshot.status === 'verified';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
              {isSql ? <Database className="w-5 h-5" /> : <FileCode className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Snapshot Bütünlük ve Güvenlik Detayları
              </h3>
              <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 truncate max-w-xs sm:max-w-md">
                {snapshot.filename}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Dosya Boyutu</span>
              <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                {sizeMB > 0 ? `${sizeMB} MB` : `${sizeKB} KB`}
              </p>
              <span className="text-[10px] text-slate-400 font-mono">({snapshot.sizeBytes.toLocaleString()} B)</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Tetiklenme Tipi</span>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {snapshot.triggerType === 'scheduled' ? 'Otomatik Cron' : 'Manuel Tetiklendi'}
              </p>
              <span className="text-[10px] text-slate-400">{isSql ? 'PostgreSQL SQL' : 'JSON Dump'}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Doğrulanan Tablo</span>
              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                {verifyResult?.tablesVerified ?? snapshot.verificationReport?.tablesVerified ?? 0} Tablo
              </p>
              <span className="text-[10px] text-slate-400">Şema Bütünlüğü</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Toplam Kayıt / INSERT</span>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {(verifyResult?.recordsCount ?? snapshot.totalRecordsCount ?? 0).toLocaleString()}
              </p>
              <span className="text-[10px] text-slate-400">Veri Satırı</span>
            </div>
          </div>

          {/* SHA-256 Checksum Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                SHA-256 Kriptografik Sağlama (Checksum)
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                  isHealthy
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                }`}
              >
                {isHealthy ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {isHealthy ? 'Sağlam & Doğrulanmış' : 'Doğrulama Başarısız'}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <code className="text-[11px] font-mono text-slate-700 dark:text-slate-300 break-all select-all flex-1">
                {activeChecksum}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(activeChecksum, 'checksum')}
                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 transition shrink-0 cursor-pointer"
                title="Panoya Kopyala"
              >
                {copiedChecksum ? (
                  <CheckCheck className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Disaster Recovery CLI Guide */}
          <div className="p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-950/80 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-indigo-500" />
                VPS Terminalinde Güvenli Tek-İşlemli (Single-Transaction) Geri Yükleme Komutu
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              PostgreSQL üretim konteynerinde yedeği atomik olarak geri yüklemek için aşağıdaki komutu kullanabilirsiniz.
            </p>
            <div className="flex items-center gap-2 bg-slate-900 text-slate-100 p-2.5 rounded-lg font-mono text-[11px]">
              <code className="break-all select-all flex-1 text-emerald-400">{restoreCommand}</code>
              <button
                type="button"
                onClick={() => copyToClipboard(restoreCommand, 'cmd')}
                className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
                title="Komutu Kopyala"
              >
                {copiedCmd ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleLiveReverify}
            disabled={reverifying}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reverifying ? 'animate-spin' : ''}`} />
            <span>{reverifying ? 'Doğrulanıyor...' : 'Bütünlüğü Yeniden Kontrol Et'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDownload(snapshot.filename)}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Yedeği İndir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs transition cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SafeRestoreModalProps {
  filename: string;
  isProd: boolean;
  onClose: () => void;
  onConfirmRestore: (filename: string) => Promise<void>;
  onDownload: (filename: string) => void;
  restoring: boolean;
}

const SafeRestoreModal: React.FC<SafeRestoreModalProps> = ({
  filename,
  isProd,
  onClose,
  onConfirmRestore,
  onDownload,
  restoring,
}) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const isSql = filename.endsWith('.sql');
  const cliCmd = isSql
    ? `docker exec -i iot-postgres-1 psql -U postgres -d iot_dashboard -v ON_ERROR_STOP=1 --single-transaction < /data/backups/${filename}`
    : `npm run restore -- --file=${filename}`;

  const copyCmd = () => {
    navigator.clipboard.writeText(cliCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                {isProd ? 'Afet Kurtarma & Güvenli Geri Yükleme Prosedürü' : 'Geliştirme Ortamı Geri Yükleme'}
              </h3>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate max-w-xs sm:max-w-md">
                {filename}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {isProd ? (
            <>
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 space-y-1.5">
                <div className="flex items-center gap-2 font-bold">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Canlı Üretim Ortamında Doğrudan Web Üzerinden Geri Yükleme Koruması</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Aktif telemetri veri akışının kesilmemesi, bağlantı havuzunun kilitlenmemesi ve şema bozulmalarının
                  önlenmesi amacıyla üretim sunucusunda canlı geri yükleme işlemi yalnızca izole VPS terminal prosedürüyle
                  gerçekleştirilir.
                </p>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-slate-900 dark:text-white block">
                  Önerilen 4 Adımlı Kurtarma Prosedürü:
                </span>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                  <li>
                    Aşağıdaki indirme butonuyla yedeği yerel bilgisayarınıza indirin ve dosya bütünlüğünü inceleyin.
                  </li>
                  <li>
                    VPS sunucusunda <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">/data/backups/</code>{' '}
                    klasöründe dosyanın bulunduğunu doğrulayın.
                  </li>
                  <li>
                    Aşağıdaki tek-işlemli (single-transaction) atomic geri yükleme komutunu VPS terminalinde çalıştırın:
                  </li>
                </ol>

                <div className="flex items-center gap-2 bg-slate-950 text-slate-100 p-2.5 rounded-lg font-mono text-[11px] mt-2">
                  <code className="break-all select-all flex-1 text-emerald-400">{cliCmd}</code>
                  <button
                    type="button"
                    onClick={copyCmd}
                    className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
                    title="Komutu Kopyala"
                  >
                    {copiedCmd ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 pt-1">
                  4. Geri yükleme tamamlandıktan sonra <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">docker compose restart app</code> komutu ile konteyneri tazeleyin.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 space-y-1.5">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>DİKKAT: Veritabanı Üzerine Yazılacaktır!</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Bu işlem seçilen snapshot yedeğindeki verileri yerel geliştirme veritabanına geri yükleyecek ve mevcut
                  cihaz/telemetri verilerini snapshot durumuna getirecektir.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500">Geri Yüklenecek Dosya:</span>
                <p className="font-mono font-semibold text-slate-900 dark:text-white">{filename}</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onDownload(filename)}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Yedeği İndir</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={restoring}
              className="px-3.5 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs transition cursor-pointer"
            >
              Vazgeç
            </button>

            {!isProd && (
              <button
                type="button"
                onClick={() => onConfirmRestore(filename)}
                disabled={restoring}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${restoring ? 'animate-spin' : ''}`} />
                <span>{restoring ? 'Geri Yükleniyor...' : 'Onaylıyorum, Geri Yükle'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ScheduledBackupsPanel: React.FC = () => {
  const [config, setConfig] = useState<ScheduledBackupConfig>({
    enabled: true,
    frequencyHours: 24,
    preferredTime: '03:00',
    maxBackupRetentionCount: 14,
    includeHypertables: true,
    includeMetadata: true,
    autoVerifySnapshots: true,
  });

  const [snapshots, setSnapshots] = useState<BackupSnapshotItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [triggeringNow, setTriggeringNow] = useState<boolean>(false);
  const [deletingFilename, setDeletingFilename] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [inspectSnapshot, setInspectSnapshot] = useState<BackupSnapshotItem | null>(null);
  const [restoreModalFile, setRestoreModalFile] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTrigger, setFilterTrigger] = useState<'all' | 'scheduled' | 'manual'>('all');

  const fetchBackupData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/database/scheduled-backups/config');
      if (!res.ok) throw new Error('Yedekleme verileri alınamadı.');
      const data = await res.json();
      if (data.config) setConfig(data.config);
      if (data.snapshots) setSnapshots(data.snapshots);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Ağ hatası oluştu.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackupData();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setMsg(null);
    try {
      const res = await fetch('/api/database/scheduled-backups/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: 'Zamanlanmış snapshot ayarları ve saklama ilkesi kaydedildi.' });
        if (data.config) setConfig(data.config);
        if (data.snapshots) setSnapshots(data.snapshots);
        setTimeout(() => setMsg(null), 5000);
      } else {
        setMsg({ type: 'error', text: data.error || 'Ayarlar kaydedilemedi.' });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Ağ hatası.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTriggerNow = async () => {
    setTriggeringNow(true);
    setMsg(null);
    try {
      const res = await fetch('/api/database/scheduled-backups/trigger-now', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({
          type: 'success',
          text: data.message || 'Anlık snapshot yedeği başarıyla alındı ve doğrulaması tamamlandı.',
        });
        if (data.config) setConfig(data.config);
        if (data.snapshots) setSnapshots(data.snapshots);
        setTimeout(() => setMsg(null), 6000);
      } else {
        setMsg({ type: 'error', text: data.error || 'Snapshot alma işlemi başarısız oldu.' });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Ağ bağlantı hatası.' });
    } finally {
      setTriggeringNow(false);
    }
  };

  const handleExecuteRestore = async (filename: string) => {
    setRestoring(true);
    setMsg(null);
    try {
      const res = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ type: 'success', text: data.message || 'Snapshot yedeği başarıyla geri yüklendi.' });
        setRestoreModalFile(null);
        fetchBackupData();
      } else {
        setMsg({ type: 'error', text: data.error || 'Geri yükleme başarısız oldu.' });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Ağ hatası.' });
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`${filename} dosyasını kalıcı olarak silmek istediğinize emin misiniz?`)) {
      return;
    }
    setDeletingFilename(filename);
    setMsg(null);
    try {
      const res = await fetch(`/api/database/scheduled-backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: `Snapshot yedeği silindi: ${filename}` });
        if (data.snapshots) setSnapshots(data.snapshots);
        setTimeout(() => setMsg(null), 4000);
      } else {
        setMsg({ type: 'error', text: data.error || 'Silme işlemi başarısız.' });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Ağ hatası.' });
    } finally {
      setDeletingFilename(null);
    }
  };

  const handleDownload = (filename: string) => {
    window.open(`/api/database/scheduled-backups/download/${encodeURIComponent(filename)}`, '_blank');
  };

  // Calculations
  const totalBytes = snapshots.reduce((acc, curr) => acc + curr.sizeBytes, 0);
  const totalMB = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
  const verifiedCount = snapshots.filter((s) => s.status === 'verified').length;

  const filteredSnapshots = useMemo(() => {
    return snapshots.filter((s) => {
      if (filterTrigger !== 'all' && s.triggerType !== filterTrigger) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return s.filename.toLowerCase().includes(q) || s.createdAt.toLowerCase().includes(q);
      }
      return true;
    });
  }, [snapshots, filterTrigger, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Modals */}
      {inspectSnapshot && (
        <SnapshotDetailModal
          snapshot={inspectSnapshot}
          onClose={() => setInspectSnapshot(null)}
          onDownload={handleDownload}
        />
      )}

      {restoreModalFile && (
        <SafeRestoreModal
          filename={restoreModalFile}
          isProd={import.meta.env.PROD}
          onClose={() => setRestoreModalFile(null)}
          onConfirmRestore={handleExecuteRestore}
          onDownload={handleDownload}
          restoring={restoring}
        />
      )}

      {/* Disaster Recovery Destination Panel */}
      <DisasterRecoveryDestinationPanel />

      {/* Top Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">
              Zamanlanmış Snapshot Yedeği & Afet Kurtarma Hazırlığı
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> TimescaleDB & PostgreSQL
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
            Periyodik PostgreSQL snapshot yedeklerini otomatik olarak oluşturun, SHA-256 doğrulamasını denetleyin ve
            felaket anında güvenli tek-işlemli (single-transaction) kurtarma komutlarıyla sisteminizi geri yükleyin.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleTriggerNow}
            disabled={triggeringNow}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shadow-md disabled:opacity-50 cursor-pointer active:scale-95"
            title="Şimdi anlık bir veritabanı yedeği al ve doğrula"
          >
            <Zap className={`w-4 h-4 ${triggeringNow ? 'animate-bounce text-amber-300' : ''}`} />
            <span>{triggeringNow ? 'Snapshot Alınıyor...' : '⚡ Şimdi Anlık Snapshot Al (Trigger-Now)'}</span>
          </button>

          <button
            onClick={fetchBackupData}
            disabled={loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition border border-slate-700 cursor-pointer"
            title="Yedekleme Durumunu Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Status Message */}
      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 animate-in fade-in ${
            msg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span>{msg.text}</span>
          </div>
          <button
            onClick={() => setMsg(null)}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Son Otomatik Snapshot</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
            {config.lastBackupAt ? new Date(config.lastBackupAt).toLocaleString() : 'Henüz Alınmadı'}
          </p>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <Check className="w-3 h-3" /> {config.lastBackupAt ? 'Bütünlüğü Doğrulandı' : 'Doğrulanmış yedek bekleniyor'}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Gelecek Planlanan Snapshot</span>
            <Calendar className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
            {config.nextBackupAt ? new Date(config.nextBackupAt).toLocaleString() : 'Planlanmadı'}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Sıklık: {config.frequencyHours} Saatte Bir ({config.preferredTime})
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Aktif Snapshot Sayısı</span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
            {snapshots.length} / {config.maxBackupRetentionCount} Adet
          </p>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.round((snapshots.length / (config.maxBackupRetentionCount || 1)) * 100))}%`,
              }}
            />
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>{verifiedCount} Doğrulanmış Kopya</span>
            <span>%{Math.min(100, Math.round((snapshots.length / (config.maxBackupRetentionCount || 1)) * 100))}</span>
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Toplam Disk Kaplaması</span>
            <HardDrive className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{totalMB} MB</p>
          <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
            Prune İlkesi: {config.maxBackupRetentionCount}. sonrası otomatik temizlenir
          </span>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-500" />
              Zamanlanmış Snapshot & Saklama İlkesi Yapılandırması
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Otomatik snapshot periyodunu, çalışma zamanını ve maksimum tutulacak snapshot sayısını belirleyin.
            </p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 self-start sm:self-auto">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {config.enabled ? 'Otomatik Snapshot: AKTİF' : 'Otomatik Snapshot: PASİF'}
            </span>
          </label>
        </div>

        <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
          {/* Frequency */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Yedekleme Sıklığı (Frekans)
            </label>
            <select
              value={config.frequencyHours}
              onChange={(e) => setConfig({ ...config, frequencyHours: parseInt(e.target.value, 10) })}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value={6}>Her 6 Saat (Yüksek Hacimli Endüstriyel)</option>
              <option value={12}>Her 12 Saat (Standart Sanayi)</option>
              <option value={24}>Günlük (24 Saatte Bir - Tercih Edilen Saatte)</option>
              <option value={168}>Haftalık (7 Günde Bir)</option>
            </select>
          </div>

          {/* Preferred Time */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tercih Edilen Çalışma Saati (HH:MM)
            </label>
            <input
              type="text"
              value={config.preferredTime}
              onChange={(e) => setConfig({ ...config, preferredTime: e.target.value })}
              placeholder="03:00"
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* Retention Count */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Maksimum Retention Snapshot Sınırı (Adet)
            </label>
            <input
              type="number"
              min={3}
              max={100}
              value={config.maxBackupRetentionCount}
              onChange={(e) =>
                setConfig({ ...config, maxBackupRetentionCount: parseInt(e.target.value, 10) || 14 })
              }
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* Scope Checkboxes */}
          <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.includeHypertables}
                onChange={(e) => setConfig({ ...config, includeHypertables: e.target.checked })}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                  TimescaleDB Telemetri Hypertables
                </span>
                <span className="text-[11px] text-slate-500">Zaman serisi telemetri verileri dahildir.</span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.includeMetadata}
                onChange={(e) => setConfig({ ...config, includeMetadata: e.target.checked })}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                  Kullanıcı, Cihaz & Sistem Ayarları
                </span>
                <span className="text-[11px] text-slate-500">Konfigürasyon ve yetkilendirme tabloları.</span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.autoVerifySnapshots}
                onChange={(e) => setConfig({ ...config, autoVerifySnapshots: e.target.checked })}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                  Otomatik SHA-256 Doğrulaması
                </span>
                <span className="text-[11px] text-slate-500">Oluşturulduktan sonra bütünlüğü test edilir.</span>
              </div>
            </label>
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={savingConfig}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition shadow-sm disabled:opacity-50 cursor-pointer active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>{savingConfig ? 'Kaydediliyor...' : 'Yapılandırmayı Kaydet'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Snapshot History Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              Yedek Snapshot Geçmişi & Afet Kurtarma Listesi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sunucuda saklanan SQL snapshot yedekleri. Bütünlüklerini inceleyebilir, bilgisayarınıza indirebilir veya izole kurtarma komutlarını görüntüleyebilirsiniz.
            </p>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Snapshot dosya adı ara..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 w-44 sm:w-56"
              />
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setFilterTrigger('all')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  filterTrigger === 'all'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Tümü ({snapshots.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTrigger('scheduled')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  filterTrigger === 'scheduled'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Zamanlanmış
              </button>
              <button
                type="button"
                onClick={() => setFilterTrigger('manual')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  filterTrigger === 'manual'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Manuel
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3">Snapshot Dosyası</th>
                <th className="p-3">Tetiklenme Şekli</th>
                <th className="p-3">Oluşturulma Tarihi</th>
                <th className="p-3 text-right">Dosya Boyutu</th>
                <th className="p-3">Bütünlük & Sağlama</th>
                <th className="p-3 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {filteredSnapshots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">
                    {snapshots.length === 0 ? (
                      <div className="space-y-2">
                        <HardDrive className="w-8 h-8 text-slate-400 mx-auto" />
                        <p className="font-semibold text-slate-700 dark:text-slate-300">
                          Henüz oluşturulmuş snapshot yedeği bulunamadı.
                        </p>
                        <p className="text-[11px]">
                          Yukarıdaki <strong className="text-emerald-600">"⚡ Şimdi Anlık Snapshot Al"</strong>{' '}
                          butonunu kullanarak ilk snapshot yedeğinizi oluşturabilirsiniz.
                        </p>
                      </div>
                    ) : (
                      'Arama kriterlerine uygun snapshot bulunamadı.'
                    )}
                  </td>
                </tr>
              ) : (
                filteredSnapshots.map((snap) => {
                  const sizeMB = Math.round((snap.sizeBytes / (1024 * 1024)) * 100) / 100;
                  const sizeKB = Math.round(snap.sizeBytes / 1024);
                  const isSql = snap.filename.endsWith('.sql');

                  return (
                    <tr
                      key={snap.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-default"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {isSql ? (
                            <Database className="w-4 h-4 text-indigo-500 shrink-0" />
                          ) : (
                            <FileCode className="w-4 h-4 text-amber-500 shrink-0" />
                          )}
                          <div>
                            <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400 block">
                              {snap.filename}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {isSql ? 'PostgreSQL SQL Dump' : 'JSON Schema Snapshot'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            snap.triggerType === 'scheduled'
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {snap.triggerType === 'scheduled' ? 'Zamanlanmış (Cron)' : 'Manuel Tetiklendi'}
                        </span>
                      </td>

                      <td className="p-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {new Date(snap.createdAt).toLocaleString()}
                      </td>

                      <td className="p-3 text-right font-mono font-bold tabular-nums">
                        {sizeMB > 0 ? `${sizeMB} MB` : `${sizeKB} KB`}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 w-fit ${
                              snap.status === 'verified'
                                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {snap.status === 'verified' ? 'Bütünlük Doğrulandı' : 'Doğrulama Hatası'}
                          </span>
                          {snap.checksum && (
                            <span
                              className="font-mono text-[10px] text-slate-400 truncate max-w-[80px]"
                              title={`SHA-256: ${snap.checksum}`}
                            >
                              {snap.checksum.substring(0, 8)}...
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Inspect Details Button */}
                          <button
                            onClick={() => setInspectSnapshot(snap)}
                            className="p-1.5 text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                            title="Bütünlük Detayları & SHA-256 İncele"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Download Button */}
                          <button
                            onClick={() => handleDownload(snap.filename)}
                            className="p-1.5 text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                            title="Bilgisayara İndir"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {/* Safe Restore Guide / Execution */}
                          <button
                            onClick={() => setRestoreModalFile(snap.filename)}
                            className="p-1.5 text-slate-600 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                            title="Afet Kurtarma & Geri Yükleme Rehberi"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDelete(snap.filename)}
                            disabled={deletingFilename === snap.filename}
                            className="p-1.5 text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer disabled:opacity-50"
                            title="Snapshot Yedeğini Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
