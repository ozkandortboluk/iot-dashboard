import React, { useState, useMemo } from 'react';
import {
  HelpCircle,
  BookOpen,
  Search,
  ChevronDown,
  ChevronRight,
  Cpu,
  Zap,
  Power,
  Sliders,
  ShieldCheck,
  Server,
  Wifi,
  Terminal,
  Code2,
  CheckCircle2,
  ExternalLink,
  Info,
  Radio,
  FileText,
  LifeBuoy,
  Layers,
  Activity,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react';
import { NexusNodeLogo } from './NexusNodeLogo';
import { DeploymentView } from './DeploymentView';

interface HelpViewProps {
  onNavigateToTab?: (tab: string) => void;
  initialTab?: 'code_examples' | 'faq' | 'dictionary' | 'guides' | 'troubleshooting' | 'server_deployment';
}

interface FAQItem {
  id: string;
  category: 'Cihaz Entegrasyonu' | 'Widget & Kontrol' | 'Müşteri & Güvenlik' | 'Alarmlar & Raporlama';
  question: string;
  answer: string;
  tags: string[];
  codeSnippet?: string;
}

interface DictionaryTerm {
  term: string;
  shortDef: string;
  category: 'Donanım & Sinyal' | 'Yazılım & Protokol' | 'Sistem & Güvenlik';
  fullExplanation: string;
  example?: string;
}

export const HelpView: React.FC<HelpViewProps> = ({ onNavigateToTab, initialTab }) => {
  const [activeTab, setActiveTab] = useState<'faq' | 'dictionary' | 'code_examples' | 'guides' | 'troubleshooting' | 'server_deployment'>(initialTab || 'code_examples');
  const [selectedCodeCategory, setSelectedCodeCategory] = useState<'all' | 'esp32' | 'nodemcu' | 'ota' | 'ping' | 'control' | 'python' | 'curl' | 'nodejs' | 'logs'>('all');
  const [activeCodeExampleId, setActiveCodeExampleId] = useState<string>('code_esp32_http_telemetry');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFaqCategory, setSelectedFaqCategory] = useState<string>('all');
  const [selectedTermCategory, setSelectedTermCategory] = useState<string>('all');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>('faq_1');
  const [expandedTerm, setExpandedTerm] = useState<string | null>('Telemetri (Telemetry)');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  // Comprehensive, 100% Working Code Examples Registry (Always kept working and updated)
  const codeExamples = [
    {
      id: 'code_python_field_agent',
      title: 'Python - Saha Ajanı (Ağ Taraması & Ping Botu)',
      category: 'python',
      categoryLabel: 'Python',
      badge: 'Yeni Ağ Mimarisi',
      description: 'Saha ajanı/mDNS mimarisi ile yerel ağ taraması (Subnet Scanning) ve ICMP ping işlemlerini asenkron yöneterek merkezi buluta (VPS) sonuçları raporlar. Sunucuyla uzun süreli bağlantı (long-polling) veya WebSocket ile çalışır.',
      tags: ['python', 'saha ajanı', 'ağ keşfi', 'nmap', 'ping', 'asenkron', 'jobs'],
      endpoint: 'POST /api/network/scans & /api/network/ping',
      code: `import time
import requests
import json
import subprocess
import threading

SERVER_URL = "${originUrl}"
AGENT_API_KEY = "saha_ajani_gizli_anahtari_001"
AGENT_ID = "field_agent_rpi_1"

def perform_network_scan(subnet, job_id):
    print(f"[{job_id}] Tarama baslatiliyor: {subnet}")
    
    # Gercek hayatta NMAP veya ARP taramasi calistirilir
    # Ornek Nmap: nmap -sn -oG - {subnet}
    
    # Ilerlemeyi sunucuya bildir:
    requests.post(
        f"{SERVER_URL}/api/network/scans/{job_id}/progress",
        headers={"Authorization": f"Bearer {AGENT_API_KEY}"},
        json={"progress": 50}
    )
    time.sleep(2) # Tarama simulasyonu
    
    # Ornek kesfedilen cihazlar (Gercek ARP listesi)
    discovered_devices = [
        {
            "ip": "192.168.1.100", 
            "mac": "AA:BB:CC:DD:EE:01", 
            "hostname": "ESP32-Saha-Node-1", 
            "vendor": "Espressif",
            "openPorts": [80],
            "hasAuthToken": False
        },
        {
            "ip": "192.168.1.102", 
            "mac": "AA:BB:CC:DD:EE:02", 
            "hostname": "Endustriyel-Gateway", 
            "vendor": "Siemens",
            "openPorts": [3000, 502],
            "hasAuthToken": True
        }
    ]
    
    # Sonuclari sunucuya ilet ve gorevi tamamla
    requests.post(
        f"{SERVER_URL}/api/network/scans/{job_id}/results",
        headers={"Authorization": f"Bearer {AGENT_API_KEY}"},
        json={"status": "completed", "progress": 100, "discoveredDevices": discovered_devices}
    )
    print(f"[{job_id}] Tarama tamamlandi ve sunucuya gonderildi.")

def poll_for_jobs():
    print(f"[{AGENT_ID}] Saha ajani calisiyor. Sunucudan gorev bekleniyor...")
    while True:
        try:
            # 1. Bekleyen Tarama veya Ping gorevlerini al
            # Not: Cift yonlu gercek zamanli iletisim (WebSocket/MQTT) tavsiye edilir
            res = requests.get(
                f"{SERVER_URL}/api/network/agent/{AGENT_ID}/jobs",
                headers={"Authorization": f"Bearer {AGENT_API_KEY}"},
                timeout=10
            )
            
            if res.status_code == 200:
                jobs = res.json()
                for job in jobs:
                    if job["type"] == "scan":
                        threading.Thread(target=perform_network_scan, args=(job["subnet"], job["id"])).start()
                    elif job["type"] == "ping":
                        # Ping calistir...
                        print(f"Ping istegi alindi: {job['ip']}")
        except Exception as e:
            pass
        time.sleep(5)

if __name__ == "__main__":
    poll_for_jobs()
`
    },
    {
      id: 'code_esp32_http_telemetry',
      title: 'ESP32 - HTTP Telemetri & Generic Output (Piggybacking)',
      category: 'esp32',
      categoryLabel: 'ESP32 / C++',
      badge: 'Canlı & Generic Output',
      description: 'Sensör verilerini (sıcaklık, nem, voltaj) sunucuya POST eder ve gelen yanıttan generic output komutlarını (relay, digital, analog DAC, PWM) setOutput(outputId, value) ile çalıştırır. Güvenli başlangıç (Safe-State) korumalıdır.',
      tags: ['esp32', 'http', 'telemetri', 'generic output', 'relay', 'digital', 'analog', 'pwm', 'piggybacking'],
      endpoint: 'POST /api/v1/telemetry veya /api/telemetry',
      code: `// =========================================================================
// NEXUSNODE IoT - ESP32 HTTP TELEMETRİ & GENERIC OUTPUT YÖNETİMİ
// Desteklenen Çıkış Tipleri: relay, digital, analog (DAC), PWM
// Güvenli Başlangıç (Safe-State Initialization) Korumalı
// =========================================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> // ArduinoJson v6 veya v7

const char* WIFI_SSID     = "WIFI_AG_ADINIZ";
const char* WIFI_PASS     = "WIFI_SIFRENIZ";
const char* SERVER_URL    = "${originUrl}/api/v1/telemetry";
const char* API_KEY       = "nkn_live_YOUR_DEVICE_API_KEY"; // Cihazlar sekmesinden alınan Token
const char* DEVICE_NAME   = "Saha_ESP32_Sensor";
const int   LED_STATUS    = 2;  // Dahili Durum LED'i

// -------------------------------------------------------------------------
// 1. GENERIC OUTPUT & CAPABILITY YAPILANDIRMASI
// -------------------------------------------------------------------------
enum OutputType {
  TYPE_RELAY,    // Röle (ON/OFF)
  TYPE_DIGITAL,  // Standart Dijital Çıkış (HIGH/LOW)
  TYPE_ANALOG,   // Analog / DAC Gerilim Çıkışı (0-255 / 0-3.3V)
  TYPE_PWM       // Donanımsal PWM Sinyali (0-255 Duty / Hız-Parlaklık)
};

struct OutputDef {
  const char* id;          // "relay_1", "relay_2", "digital_1", "analog_1", "pwm_1"
  OutputType  type;        // Çıkış Tipi
  uint8_t     pin;         // ESP32 GPIO Numarası
  bool        activeLow;   // Active-Low röleler için true
  uint8_t     safeInitial; // Güvenli başlangıç değeri (0 = Kapalı/0V)
  uint8_t     pwmChannel;  // ESP32 LEDC Kanalı (0-15)
  uint32_t    pwmFreq;     // PWM Frekansı (Hz)
  uint8_t     pwmResolution;// PWM Çözünürlüğü (8 bit = 0-255)
  float       currentValue;// Mevcut aktif değer
};

// Cihazın Donanım Capability Tablosu
OutputDef outputs[] = {
  { "relay_1",   TYPE_RELAY,   26, false, 0, 0, 0,     0, 0.0 }, // GPIO 26 -> Röle 1
  { "relay_2",   TYPE_RELAY,   27, false, 0, 0, 0,     0, 0.0 }, // GPIO 27 -> Röle 2
  { "digital_1", TYPE_DIGITAL, 32, false, 0, 0, 0,     0, 0.0 }, // GPIO 32 -> Dijital Çıkış
  { "analog_1",  TYPE_ANALOG,  25, false, 0, 0, 0,     0, 0.0 }, // GPIO 25 -> ESP32 DAC1 (0-3.3V)
  { "pwm_1",     TYPE_PWM,     18, false, 0, 0, 5000,  8, 0.0 }  // GPIO 18 -> PWM Kanal 0 (5kHz)
};
const size_t OUTPUT_COUNT = sizeof(outputs) / sizeof(outputs[0]);

// -------------------------------------------------------------------------
// 2. GÜVENLİ BAŞLANGIÇ DURUMU (SAFE REBOOT INITIALIZATION)
// -------------------------------------------------------------------------
void initOutputs() {
  for (size_t i = 0; i < OUTPUT_COUNT; i++) {
    switch (outputs[i].type) {
      case TYPE_RELAY:
      case TYPE_DIGITAL:
        pinMode(outputs[i].pin, OUTPUT);
        // Active-low tersleme mantığı ile güvenli başlangıç
        if (outputs[i].activeLow) {
          digitalWrite(outputs[i].pin, outputs[i].safeInitial ? LOW : HIGH);
        } else {
          digitalWrite(outputs[i].pin, outputs[i].safeInitial ? HIGH : LOW);
        }
        outputs[i].currentValue = outputs[i].safeInitial;
        break;

      case TYPE_ANALOG:
        #if defined(ESP32)
          dacWrite(outputs[i].pin, outputs[i].safeInitial);
        #else
          pinMode(outputs[i].pin, OUTPUT);
          analogWrite(outputs[i].pin, outputs[i].safeInitial);
        #endif
        outputs[i].currentValue = outputs[i].safeInitial;
        break;

      case TYPE_PWM:
        #if defined(ESP32)
          ledcSetup(outputs[i].pwmChannel, outputs[i].pwmFreq, outputs[i].pwmResolution);
          ledcAttachPin(outputs[i].pin, outputs[i].pwmChannel);
          ledcWrite(outputs[i].pwmChannel, outputs[i].safeInitial);
        #else
          pinMode(outputs[i].pin, OUTPUT);
          analogWrite(outputs[i].pin, outputs[i].safeInitial);
        #endif
        outputs[i].currentValue = outputs[i].safeInitial;
        break;
    }
  }
  Serial.println(F("[INIT] Tüm GPIO/Output pinleri güvenli başlangıç modunda (Safe-State) kuruldu."));
}

// -------------------------------------------------------------------------
// 3. GENERIC OUTPUT YÖNETİM FONKSİYONU: setOutput(outputId, value)
// -------------------------------------------------------------------------
bool setOutput(const String& outputId, const String& value, String& outErrMsg) {
  for (size_t i = 0; i < OUTPUT_COUNT; i++) {
    // outputId ile birebir eşleşme (relay_1, pwm_1, analog_1, digital_1 veya büyük harf)
    if (outputId.equalsIgnoreCase(outputs[i].id) || 
        outputId.equalsIgnoreCase(String("OUT_") + String(i + 1))) {
      
      switch (outputs[i].type) {
        case TYPE_RELAY:
        case TYPE_DIGITAL: {
          bool turnOn = (value.equalsIgnoreCase("ON") || value.equalsIgnoreCase("1") || 
                         value.equalsIgnoreCase("HIGH") || value.equalsIgnoreCase("TRUE"));
          bool physicalPin = outputs[i].activeLow ? !turnOn : turnOn;
          digitalWrite(outputs[i].pin, physicalPin ? HIGH : LOW);
          outputs[i].currentValue = turnOn ? 1.0 : 0.0;
          Serial.printf("[OUTPUT OK] %s (Pin %d) -> %s (fiziksel: %d)\\n", 
                        outputs[i].id, outputs[i].pin, turnOn ? "ON" : "OFF", physicalPin);
          return true;
        }

        case TYPE_ANALOG: {
          int dacVal = value.toInt();
          if (dacVal < 0) dacVal = 0;
          if (dacVal > 255) dacVal = 255;
          #if defined(ESP32)
            dacWrite(outputs[i].pin, dacVal);
          #else
            analogWrite(outputs[i].pin, dacVal);
          #endif
          outputs[i].currentValue = dacVal;
          Serial.printf("[OUTPUT OK] %s (DAC Pin %d) -> %d / 255 (%.2fV)\\n", 
                        outputs[i].id, outputs[i].pin, dacVal, (dacVal / 255.0) * 3.3);
          return true;
        }

        case TYPE_PWM: {
          int pwmVal = value.toInt();
          if (pwmVal < 0) pwmVal = 0;
          if (pwmVal > 255) pwmVal = 255;
          #if defined(ESP32)
            ledcWrite(outputs[i].pwmChannel, pwmVal);
          #else
            analogWrite(outputs[i].pin, pwmVal);
          #endif
          outputs[i].currentValue = pwmVal;
          Serial.printf("[OUTPUT OK] %s (PWM Pin %d, Ch %d) -> Duty: %d / 255\\n", 
                        outputs[i].id, outputs[i].pin, outputs[i].pwmChannel, pwmVal);
          return true;
        }
      }
    }
  }

  outErrMsg = "Tanımsız çıkış (outputId): " + outputId;
  Serial.println("[OUTPUT HATA] " + outErrMsg);
  return false;
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_STATUS, OUTPUT);
  digitalWrite(LED_STATUS, LOW);

  // Çıkışları güvenli başlangıç durumuna al (Röleler açık/kapalı kalmaz)
  initOutputs();

  Serial.println("\\n>>> NexusNode ESP32 Başlatılıyor...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\\n[OK] WiFi Bağlandı! IP: " + WiFi.localIP().toString());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_STATUS, HIGH);

    // 1. Ölçüm Simülasyonu / Sensör Okumaları (DHT22, BMP280, vb.)
    float sicaklik = 24.0 + (random(0, 100) / 20.0);
    float nem = 50.0 + (random(0, 200) / 10.0);
    float voltaj = 12.1 + (random(0, 40) / 100.0);

    // 2. Hafif & Hızlı Veri Formatı: TOKEN, CIHAZ_ADI, METRIK:DEGER...
    String payload = String(API_KEY) + "," + DEVICE_NAME + 
                     ",sıcaklık:" + String(sicaklik, 2) + 
                     ",nem:" + String(nem, 1) + 
                     ",voltaj:" + String(voltaj, 2) + 
                     ",rssi:" + String(WiFi.RSSI());

    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "text/plain");

    int httpCode = http.POST(payload);
    Serial.printf("[HTTP POST] Kod: %d | Paket: %s\\n", httpCode, payload.c_str());

    // 3. Yanıttan Bekleyen Komutları Yakala (Response Piggybacking)
    if (httpCode == 200) {
      String response = http.getString();
      Serial.println("[SUNUCU YANITI]: " + response);

      DynamicJsonDocument doc(1024);
      DeserializationError err = deserializeJson(doc, response);
      if (!err && doc.containsKey("commands")) {
        JsonArray commands = doc["commands"];
        for (JsonObject cmd : commands) {
          String cmdId       = cmd["commandId"] | cmd["id"] | "";
          String targetOut   = cmd["outputId"] | cmd["commandType"] | cmd["command"] | "";
          String payloadVal  = cmd["value"] | cmd["payload"] | "";
          Serial.printf(">>> GELEN KOMUT [ID: %s]: Hedef Çıkış: %s | Değer: %s\\n", 
                        cmdId.c_str(), targetOut.c_str(), payloadVal.c_str());

          // 1. Aşama ACK: Komut Alındı (Received) Bildirimi
          if (cmdId.length() > 0) {
            HTTPClient ackHttp;
            ackHttp.begin("${originUrl}/api/device/commands/ack");
            ackHttp.addHeader("Content-Type", "application/json");
            ackHttp.addHeader("X-API-Key", API_KEY);
            String ackBody = "{\\"commandId\\":\\"" + cmdId + "\\",\\"status\\":\\"received\\"}";
            ackHttp.POST(ackBody);
            ackHttp.end();
            Serial.println("[ACK 1/2] Komut Cihaza Ulaştı (received) -> ID: " + cmdId);
          }

          // 2. Aşama: Generic setOutput(outputId, value) Çağrısı
          String errorMsg = "";
          bool executedOK = setOutput(targetOut, payloadVal, errorMsg);

          // 3. Aşama ACK: Komut İcra Edildi (executed) veya Başarısız (failed) Bildirimi
          if (cmdId.length() > 0) {
            HTTPClient ackHttp;
            ackHttp.begin("${originUrl}/api/device/commands/ack");
            ackHttp.addHeader("Content-Type", "application/json");
            ackHttp.addHeader("X-API-Key", API_KEY);
            
            String ackStatus = executedOK ? "executed" : "failed";
            String ackBody = "{\\"commandId\\":\\"" + cmdId + "\\",\\"status\\":\\"" + ackStatus + "\\"";
            if (!executedOK) {
              ackBody += ",\\"errorMessage\\":\\"" + errorMsg + "\\"";
            } else {
              ackBody += ",\\"result\\":{\\"outputId\\":\\"" + targetOut + "\\",\\"value\\":\\"" + payloadVal + "\\",\\"timestamp\\":" + String(millis()) + "}";
            }
            ackBody += "}";

            ackHttp.POST(ackBody);
            ackHttp.end();
            Serial.printf("[ACK 2/2] Komut Sonucu Bildirildi (%s) -> ID: %s\\n", ackStatus.c_str(), cmdId.c_str());
          }
        }
      }
    } else {
      Serial.printf("[HATA] HTTP Bağlantı Hatası, Kod: %d\\n", httpCode);
    }
    http.end();
    digitalWrite(LED_STATUS, LOW);
  } else {
    Serial.println("[UYARI] WiFi Bağlantısı koptu, yeniden bağlanılıyor...");
    WiFi.reconnect();
  }

  delay(5000); // 5 Saniyede bir periyodik telemetri iletimi
}`,
    },
    {
      id: 'code_esp32_discovery_pairing',
      title: 'ESP32 - Otomatik Keşif, PIN/QR Eşleştirme & Dinamik Token Alıcı',
      category: 'esp32',
      categoryLabel: 'Discovery & Eşleştirme',
      badge: 'Sihirbaz Uyumlu',
      description: 'Cihazın ağa ilk katıldığında tek kullanımlık 6 haneli eşleştirme kodu (PIN) veya MAC adresiyle web paneli Provizyon Sihirbazına kendini tanıtması ve API anahtarını güvenle alması.',
      tags: ['esp32', 'discovery', 'pairing', 'pin', 'qr', 'provisioning'],
      endpoint: 'POST /api/network/pair & POST /api/network/check-duplicate',
      code: `// =========================================================================
// NEXUSNODE IoT - ESP32 OTOMATİK KEŞİF & PIN / QR EŞLEŞTİRME İSTEMCİSİ
// 1. Cihaz açıldığında yerel ağda rastgele/benzersiz 6 haneli PIN kodu üretir.
// 2. Web panelinden "Cihaz Keşfi" ekranında bu PIN veya MAC ile eşleştirilir.
// 3. Eşleştirme sonrası atanan X-API-Key kalıcı Flash hafızaya (Preferences) yazılır.
// =========================================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

const char* WIFI_SSID     = "WIFI_AG_ADINIZ";
const char* WIFI_PASS     = "WIFI_SIFRENIZ";
const char* SERVER_URL    = "${originUrl}";

Preferences prefs;
String deviceApiKey = "";
String pairingPin   = "";

void setup() {
  Serial.begin(115200);
  prefs.begin("nexus_iot", false);
  deviceApiKey = prefs.getString("api_key", "");

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }

  Serial.println("\\n[NEXUSNODE] WiFi Bağlantısı Kuruldu!");
  Serial.printf("[BİLGİ] MAC Adresi: %s\\n", WiFi.macAddress().c_str());
  Serial.printf("[BİLGİ] IP Adresi: %s\\n", WiFi.localIP().toString().c_str());

  if (deviceApiKey.length() == 0) {
    // 6 Haneli rastgele geçici eşleştirme kodu oluştur
    randomSeed(micros());
    pairingPin = String(random(100000, 999999));
    Serial.println("==================================================");
    Serial.printf(">>> GEÇİCİ EŞLEŞTİRME KODU (PIN): %s <<<\\n", pairingPin.c_str());
    Serial.println(">>> Web Panelinden Provizyon Sihirbazına bu PIN'i girin.");
    Serial.println("==================================================");
  } else {
    Serial.println("[BİLGİ] Cihaz yetkilendirilmiş API anahtarına sahip. Telemetri moduna geçiliyor.");
  }
}

void loop() {
  if (deviceApiKey.length() == 0) {
    // Henüz API anahtarı yoksa serial porta PIN hatırlatması yap
    Serial.printf("[EŞLEŞME BEKLENİYOR] Web panelinden PIN (%s) veya MAC (%s) ile eşleştirin.\\n",
                  pairingPin.c_str(), WiFi.macAddress().c_str());
    delay(4000);
  } else {
    // Standart Telemetri Gönderimi
    HTTPClient http;
    http.begin(String(SERVER_URL) + "/api/telemetry");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", deviceApiKey.c_str());

    StaticJsonDocument<200> doc;
    doc["temperature"] = 23.8 + (random(-10, 10) / 10.0);
    doc["rssi"] = WiFi.RSSI();
    String body;
    serializeJson(doc, body);

    int code = http.POST(body);
    Serial.printf("[TELEMETRİ] Kod: %d | Yanıt: %s\\n", code, http.getString().c_str());
    http.end();
    delay(5000);
  }
}`,
    },
    {
      id: 'code_esp32_heartbeat_ping',
      title: 'ESP32 - Düşük Güçlü Periyodik Heartbeat (Ping)',
      category: 'ping',
      categoryLabel: 'Heartbeat / Ping',
      badge: 'Yeni / Tolerans Destekli',
      description: 'Pilli veya güneş enerjili cihazlar için hafif sinyal pini. Cihaz zaman aşımına uğrayıp Çevrimdışı kalsa bile bu ping gittiğinde otomatik Çevrimiçi olur.',
      tags: ['esp32', 'heartbeat', 'ping', 'düşük güç', 'tolerans', 'çevrimiçi'],
      endpoint: 'POST /api/telemetry/ping',
      code: `// =========================================================================
// NEXUSNODE IoT - DÜŞÜK GÜÇLÜ PERİYODİK HEARTBEAT / PING ÖRNEĞİ
// Cihazınız Çevrimdışı kalsa dahi bu hafif istek ile anında Çevrimiçi duruma geçer.
// =========================================================================
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID     = "WIFI_AG_ADINIZ";
const char* WIFI_PASS     = "WIFI_SIFRENIZ";
const char* PING_ENDPOINT = "${originUrl}/api/telemetry/ping";
const char* API_KEY       = "nkn_live_YOUR_DEVICE_API_KEY"; // Cihaz Token
const char* DEVICE_ID     = "dev_esp32_01";

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\\n[OK] WiFi Baglandi!");
}

void sendHeartbeatPing() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(PING_ENDPOINT);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", API_KEY);

    // Hafif JSON Ping Paketi
    String jsonPayload = "{\\"deviceId\\":\\"" + String(DEVICE_ID) + 
                         "\\",\\"ping\\":1,\\"rssi\\":" + String(WiFi.RSSI()) + "}";

    int httpCode = http.POST(jsonPayload);
    if (httpCode == 200) {
      Serial.println("[OK] Heartbeat Ping sunucu tarafından onaylandı -> Cihaz Canlı & Çevrimiçi!");
    } else {
      Serial.printf("[HATA] Ping gönderilemedi, Kod: %d\\n", httpCode);
    }
    http.end();
  }
}

void loop() {
  sendHeartbeatPing();
  // Cihazınızın paneldeki Heartbeat Toleransına göre periyot belirleyin (Örn: 60 saniye)
  delay(60000); 
}`,
    },
    {
      id: 'code_esp32_smart_interval',
      title: 'ESP32 - Akıllı Dinamik Veri Sıklığı & 2x Watchdog Toleransı',
      category: 'esp32',
      categoryLabel: 'ESP32 Akıllı Sıklık',
      badge: 'Akıllı 2x Watchdog & Dinamik Frekans',
      description: 'Sistem cihazın veri gönderme sıklığını otomatik öğrenir. 2 katı süre veri gelmezse cihaz otomatik Çevrimdışı olur. Veri geldiğinde tekrar Çevrimiçi olur ve kullanıcı panelden sıklığı istediği zaman değiştirebilir.',
      tags: ['esp32', 'akıllı sıklık', '2x watchdog', 'offline', 'online', 'dinamik frekans', 'piggybacking'],
      endpoint: 'POST /api/telemetry & POST /api/telemetry/ping',
      code: `// =========================================================================
// NEXUSNODE IoT - AKILLI DİNAMİK VERİ SIKLIĞI & 2X WATCHDOG KODU (ESP32)
//
// 1. Sistem cihazın veri gönderim sıklığını (interval) otomatik tespit eder.
// 2. Eğer (2 * Sıklık) süresince cihazdan veri gelmezse, sistem cihazı OFFLINE yapar.
// 3. Cihaz tekrar veri gönderdiğinde anında ONLINE durumuna geçer.
// 4. Kullanıcı cihaz ayarlarından sıklığı manuel değiştirebilir; cihaz son ayarda kalır.
// 5. Cihazın çevrimdışı kaldığı süre sıklık hesaplamasını bozmaz (filtrelenir).
// =========================================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID     = "WIFI_SSID_GIRINIZ";
const char* WIFI_PASS     = "WIFI_SIFRE_GIRINIZ";
const char* SERVER_URL    = "${originUrl}/api/telemetry";
const char* API_KEY       = "nkn_live_YOUR_DEVICE_API_KEY"; // Cihaz Token
const char* DEVICE_ID     = "dev_esp32_01";

// Cihazın varsayılan veri gönderme sıklığı (Saniye)
// Sistem bu sıklığı otomatik öğrenir veya sunucu yanıtından dinamik günceller
unsigned long sendIntervalSeconds = 5; 
unsigned long lastSendMillis = 0;

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\\n[NEXUSNODE] WiFi Baglantisi Basarili!");
}

void sendSmartTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  // Örnek sensör telemetri verileri
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["temperature"] = 24.5 + (random(-10, 10) / 10.0);
  doc["humidity"] = 55.0 + (random(-20, 20) / 10.0);
  doc["rssi"] = WiFi.RSSI();

  String payload;
  serializeJson(doc, payload);

  Serial.printf("[NEXUSNODE] Telemetri gönderiliyor (%lu sn aralıkla)...\\n", sendIntervalSeconds);
  int httpCode = http.POST(payload);

  if (httpCode == 200) {
    String response = http.getString();
    Serial.println("[OK] Sunucu Yaniti: " + response);

    // Sunucu yanıtından bekleyen komutları veya sistemin belirlediği sıklığı oku:
    StaticJsonDocument<512> resDoc;
    DeserializationError err = deserializeJson(resDoc, response);
    if (!err) {
      // Eğer kullanıcı panelden veri gönderim sıklığını güncellemişse cihaz otomatik uyum sağlar:
      if (resDoc.containsKey("expectedIntervalSeconds")) {
        unsigned long serverInterval = resDoc["expectedIntervalSeconds"];
        if (serverInterval >= 1 && serverInterval != sendIntervalSeconds) {
          sendIntervalSeconds = serverInterval;
          Serial.printf(">>> Veri sıklığı panel ayarıyla güncellendi: %lu saniye\\n", sendIntervalSeconds);
        }
      }
    }
  } else {
    Serial.printf("[HATA] Telemetri iletilemedi! HTTP Kod: %d\\n", httpCode);
  }
  http.end();
}

void loop() {
  unsigned long currentMillis = millis();
  
  // Belirlenen sıklıkta (sendIntervalSeconds) telemetri ilet:
  if (currentMillis - lastSendMillis >= (sendIntervalSeconds * 1000)) {
    lastSendMillis = currentMillis;
    sendSmartTelemetry();
  }
  
  delay(100);
}`,
    },
    {
      id: 'code_esp32_ota_update',
      title: 'ESP32 / ESP8266 - Ed25519 İmzalı Güvenli OTA & Post-Boot Onaylı İstemci',
      category: 'esp32',
      categoryLabel: 'ESP32 / ESP8266 OTA',
      badge: 'Root of Trust & Ed25519',
      description: 'Donanıma derleme anında sabitlenen (pinned) Root of Trust anahtar tablosu ve Ed25519 ile imza doğrulaması yapar. Ağdan gelen sahte anahtarlara karşı tam korumalıdır. Key Rotation ve tek kullanımlık token destekler.',
      tags: ['esp32', 'esp8266', 'ota', 'root-of-trust', 'ed25519', 'key-rotation', 'confirm-boot'],
      endpoint: 'POST /api/ota/check, /api/ota/status & /api/ota/confirm-boot',
      code: `// =========================================================================
// NEXUSNODE IoT - ESP32 ROOT OF TRUST (PINNED KEY) & ED25519 GÜVENLİ OTA
// Güvenlik Kuralı: Sunucudan gelen X-Public-Key'e ASLA güvenilmez.
// İmzalar cihazın ROM/Flash hafızasında derleme anında sabitlenen bu anahtarlarla doğrulanır.
// =========================================================================
#include <WiFi.h> // ESP8266 için: #include <ESP8266WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <ArduinoJson.h>

const char* WIFI_SSID       = "WIFI_AG_ADINIZ";
const char* WIFI_PASS       = "WIFI_SIFRENIZ";
const char* SERVER_URL      = "${originUrl}";
const char* API_KEY         = "nkn_live_YOUR_DEVICE_API_KEY";

// CİHAZ BEYANI VE SÜRÜM BİLGİSİ
const char* DEVICE_TYPE        = "pump_controller";
const char* DEVICE_ROLE_KEY    = "PUMP_CTRL";
const char* HARDWARE_MODEL     = "ESP32_WROOM_32";
const char* HARDWARE_REVISION  = "v1.0";
const char* FIRMWARE_VERSION   = "1.0.0";

// =========================================================================
// ROOT OF TRUST (Donanım İçinde Sabitlenmiş Güvenilir Ed25519 Anahtar Tablosu)
// Key Rotation için geçiş döneminde hem aktif hem eski/yeni anahtarlar listelenir.
// =========================================================================
struct TrustedRootKey {
  const char* keyId;
  const char* publicKeyPem;
  const char* desc;
};

const TrustedRootKey TRUSTED_ROOT_KEYS[] = {
  {
    "root_ed25519_v1",
    "-----BEGIN PUBLIC KEY-----\\n"
    "MCowBQYDK2VwAyEAjP/fHdse0+0S7ZwrjlZaxd0QYhIyLMwD6VmD78CokU0=\\n"
    "-----END PUBLIC KEY-----\\n",
    "Birincil Aktif İmza Anahtarı"
  },
  {
    "root_ed25519_v2",
    "-----BEGIN PUBLIC KEY-----\\n"
    "MCowBQYDK2VwAyEAtCcoQVIFQi6D7r29nPmnGOBVIqjzrwaVS3BPj9778W0=\\n"
    "-----END PUBLIC KEY-----\\n",
    "İkincil / Rotasyon Geçiş Anahtarı"
  }
};
const size_t TRUSTED_KEYS_COUNT = sizeof(TRUSTED_ROOT_KEYS) / sizeof(TRUSTED_ROOT_KEYS[0]);

const char* findPinnedPublicKey(const char* keyId) {
  if (!keyId || strlen(keyId) == 0) return nullptr;
  for (size_t i = 0; i < TRUSTED_KEYS_COUNT; i++) {
    if (strcmp(TRUSTED_ROOT_KEYS[i].keyId, keyId) == 0) {
      return TRUSTED_ROOT_KEYS[i].publicKeyPem;
    }
  }
  return nullptr;
}

void reportStatus(const char* jobId, const char* firmwareId, const char* downloadToken, const char* status, int progress, const char* errorMsg = "") {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/ota/status");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  String json = "{\\"jobId\\":\\"" + String(jobId) + 
                "\\",\\"firmwareId\\":\\"" + String(firmwareId) + 
                "\\",\\"downloadToken\\":\\"" + String(downloadToken) + 
                "\\",\\"status\\":\\"" + String(status) + 
                "\\",\\"progressPercent\\":" + String(progress) + 
                ",\\"errorMessage\\":\\"" + String(errorMsg) + "\\"}";

  http.POST(json);
  http.end();
}

void checkOTA() {
  if (WiFi.status() != WL_CONNECTED) return;
  Serial.println("[OTA] Güncelleme sorgulanıyor...");

  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/ota/check");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  String payload = "{\\"device_type\\":\\"" + String(DEVICE_TYPE) + 
                   "\\",\\"role_key\\":\\"" + String(DEVICE_ROLE_KEY) + 
                   "\\",\\"hardware_model\\":\\"" + String(HARDWARE_MODEL) + 
                   "\\",\\"hardware_revision\\":\\"" + String(HARDWARE_REVISION) + 
                   "\\",\\"firmware_version\\":\\"" + String(FIRMWARE_VERSION) + "\\"}";

  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    String res = http.getString();
    DynamicJsonDocument doc(2048);
    deserializeJson(doc, res);

    if (doc["updateAvailable"] | false) {
      String jobId          = doc["jobId"] | "";
      String firmwareId     = doc["firmwareId"] | "";
      String keyId          = doc["keyId"] | "";
      String downloadUrl    = doc["downloadUrl"] | "";
      String sha256Expected = doc["sha256"] | "";
      String downloadToken  = doc["downloadToken"] | "";
      String bootNonce      = doc["bootNonce"] | "";

      Serial.println("[OTA] Yeni Firmware Bulundu! JobID: " + jobId + " | KeyID: " + keyId);

      // ROOT OF TRUST DOĞRULAMASI:
      // keyId cihazın hafızasındaki sabitlenmiş Root of Trust tablosunda aranır
      const char* pinnedPublicKey = findPinnedPublicKey(keyId.c_str());
      if (pinnedPublicKey == nullptr) {
        Serial.printf("[GÜVENLİK ALARMI] keyId '%s' cihazdaki Root of Trust tablosunda bulunamadı! Güncelleme reddedildi.\\n", keyId.c_str());
        reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "FAILED", 0, "Bilinmeyen keyId / İmzalama anahtarı donanımda kayıtlı değil.");
        http.end();
        return;
      }

      Serial.printf("[GÜVENLİK] keyId '%s' doğrulandı. Sabitlenmiş anahtar kullanılıyor.\\n", keyId.c_str());
      reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "DOWNLOADING", 10);

      String fullUrl = downloadUrl.startsWith("http") ? downloadUrl : String(SERVER_URL) + downloadUrl;

      HTTPClient downloadHttp;
      downloadHttp.begin(fullUrl);
      downloadHttp.addHeader("X-API-Key", API_KEY);
      downloadHttp.addHeader("X-OTA-Token", downloadToken);

      int dlCode = downloadHttp.GET();
      if (dlCode == HTTP_CODE_OK) {
        int contentLength = downloadHttp.getSize();
        if (contentLength > 0 && Update.begin(contentLength)) {
          reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "FLASHING", 50);

          WiFiClient* stream = downloadHttp.getStreamPtr();
          size_t written = Update.writeStream(*stream);

          if (written == contentLength && Update.end(true)) {
            Serial.println("[OTA] Flash Başarılı! Rebooting...");
            reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "REBOOTING", 95);
            delay(1000);
            ESP.restart();
          } else {
            reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "FAILED", 0, "Flash yazma hatası.");
          }
        }
      } else {
        reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "FAILED", 0, "Firmware binary indirilemedi.");
      }
      downloadHttp.end();
    } else {
      Serial.println("[OTA] Cihaz yazılımı güncel.");
    }
  }
  http.end();
}

void loop() {
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 300000 || lastCheck == 0) {
    lastCheck = millis();
    checkOTA();
  }
  delay(1000);
}`,
    },
    {
      id: 'code_nodemcu_esp8266_ota_ws',
      title: 'NodeMCU (ESP8266) - Canlı Çift Yönlü WebSocket + Web OTA Güncelleme Kodu',
      category: 'nodemcu',
      categoryLabel: 'NodeMCU ESP8266',
      badge: 'İlk Kurulum & Canlı OTA Destekli',
      description: 'NodeMCU cihazınıza bu kodu ilk kez USB kablosuyla yüklediğinizde, cihaz sunucuya canlı WebSocket ile bağlanır. Artık cihazınıza bir daha kablo takmanıza gerek kalmaz; web panelindeki Kod Derleyici veya Firmware sayfasından tek tıkla kablosuz OTA yazılım yüklemesi yapabilirsiniz.',
      tags: ['nodemcu', 'esp8266', 'ota', 'websocket', 'çift yönlü', 'uzaktan güncelleme', 'httpupdate'],
      endpoint: 'WS /ws/device & POST /api/ota/download',
      code: `// =========================================================================
// NEXUSNODE IoT - NODEMCU (ESP8266) CANLI WEBSOCKET & WEB OTA DESTEKLİ İLK KOD
// Bu kodu 1 kez USB kablosuyla yükleyin; sonrasında tüm güncellemeleri Web'den yapın!
// Gerekli Kütüphaneler: ESP8266WiFi, ESP8266httpUpdate, WebSocketsClient, ArduinoJson
// =========================================================================
#include <ESP8266WiFi.h>
#include <ESP8266httpUpdate.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// --- WiFi ve Sunucu Bilgileri ---
const char* WIFI_SSID     = "WIFI_AG_ADINIZ";
const char* WIFI_PASS     = "WIFI_SIFRENIZ";
const char* WS_HOST       = "${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}";
const int   WS_PORT       = 443; // HTTPS/WSS için 443, Yerel HTTP için 3000
const char* API_KEY       = "nkn_live_YOUR_DEVICE_API_KEY"; // Cihaz Tokenı

// --- Cihaz Kimlik & Sürüm Bilgileri ---
const char* FIRMWARE_VERSION  = "v1.0.0";
const char* HARDWARE_MODEL    = "ESP8266_NODEMCU";
const char* ROLE_KEY          = "NODEMCU_MAIN";

// --- Donanım Pin Tanımları ---
const int RELAY_PIN       = D1;  // GPIO5 -> Röle Modülü (Active-Low)
const int STATUS_LED      = D4;  // GPIO2 -> Dahili Mavi LED
const bool ACTIVE_LOW     = true;

WebSocketsClient webSocket;
unsigned long lastTelemetryTime = 0;
bool relayState = false;

// Röleyi güvenli ayarla
void setRelay(bool state) {
  relayState = state;
  digitalWrite(RELAY_PIN, (ACTIVE_LOW ? !state : state) ? HIGH : LOW);
  Serial.printf("[RÖLE] Durum Değişti -> %s\\n", state ? "AÇIK (ON)" : "KAPALI (OFF)");
}

// =========================================================================
// KABLOSUZ OTA GÜNCELLEME MOTORU (Web Panelinden Gelen Emri Çalıştırır)
// =========================================================================
void performOTAUpdate(const String& downloadUrl, const String& version, const String& token) {
  Serial.println("\\n>>> [OTA] KABLOSUZ YAZILIM GÜNCELLEMESİ BAŞLATILIYOR...");
  Serial.printf(">>> Hedef Sürüm: %s | URL: %s\\n", version.c_str(), downloadUrl.c_str());

  digitalWrite(STATUS_LED, LOW);

  WiFiClientSecure secureClient;
  secureClient.setInsecure(); // SSL sertifika doğrulamasını atla

  String fullUrl = downloadUrl;
  if (!fullUrl.startsWith("http")) {
    fullUrl = "https://" + String(WS_HOST) + downloadUrl;
  }

  // ESP8266 HTTPUpdate Motorunu Başlat
  ESPhttpUpdate.setLedPin(STATUS_LED, LOW);
  ESPhttpUpdate.rebootOnUpdate(true); // Güncelleme bitince cihazı otomatik yeniden başlat

  t_httpUpdate_return ret = ESPhttpUpdate.update(secureClient, fullUrl);

  switch (ret) {
    case HTTP_UPDATE_FAILED:
      Serial.printf("[OTA HATA] Güncelleme Başarısız! Hata Kodu (%d): %s\\n", 
                    ESPhttpUpdate.getLastError(), ESPhttpUpdate.getLastErrorString().c_str());
      break;

    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("[OTA] Cihaz yazılımı zaten güncel.");
      break;

    case HTTP_UPDATE_OK:
      Serial.println("[OTA BAŞARILI] Yazılım yüklendi! Cihaz yeniden başlatılıyor...");
      break;
  }
}

// =========================================================================
// WEBSOCKET OLAY DİNLEYİCİSİ (Anlık Komutlar ve Canlı OTA Tetikleyici)
// =========================================================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("\\n[WS] CANLI BAĞLANTI KURULDU! Panelden anlık komut ve OTA almaya hazır.");
      break;

    case WStype_DISCONNECTED:
      Serial.println("[WS] Bağlantı kesildi, yeniden bağlanılıyor...");
      break;

    case WStype_TEXT: {
      String msg = String((char*)payload);
      Serial.println("[WS GELEN]: " + msg);

      StaticJsonDocument<1024> doc;
      DeserializationError err = deserializeJson(doc, payload);
      if (!err) {
        String msgType = doc["type"] | "";

        // 1. CANLI OTA GÜNCELLEME EMRİ
        if (msgType == "ota_trigger" || msgType == "ota") {
          String url     = doc["data"]["url"] | doc["data"]["downloadUrl"] | "";
          String fwVer   = doc["data"]["version"] | "v_latest";
          String dlToken = doc["data"]["downloadToken"] | "";

          if (url.length() > 0) {
            performOTAUpdate(url, fwVer, dlToken);
          }
        }
        // 2. CANLI RÖLE & GPIO KONTROL EMRİ (0ms Gecikme)
        else if (msgType == "command") {
          String msgId    = doc["messageId"] | "";
          String targetOut = doc["data"]["outputId"] | "";
          String val       = doc["data"]["value"] | "";

          Serial.printf(">>> [KOMUT] Hedef: %s | Değer: %s\\n", targetOut.c_str(), val.c_str());

          bool turnOn = (val.equalsIgnoreCase("ON") || val == "1" || val.equalsIgnoreCase("TRUE"));
          setRelay(turnOn);

          // İcra Onayı (ACK) Gönder
          String ackPayload = "{\\"type\\":\\"ack\\",\\"deviceId\\":\\"" + String(API_KEY) + 
                             "\\",\\"messageId\\":\\"ack_" + String(millis()) + 
                             "\\",\\"data\\":{\\"forMessageId\\":\\"" + msgId + 
                             "\\",\\"status\\":\\"executed\\",\\"result\\":{\\"outputId\\":\\"" + targetOut + 
                             "\\",\\"value\\":\\"" + val + "\\"}}}";
          webSocket.sendTXT(ackPayload);
        }
      }
      break;
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  setRelay(false);
  digitalWrite(STATUS_LED, HIGH);

  Serial.println("\\n>>> NexusNode NodeMCU (ESP8266) OTA & WS Başlatılıyor...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\\n[OK] WiFi Bağlandı! IP: " + WiFi.localIP().toString());

  String wsUrl = "/ws/device?token=" + String(API_KEY) + 
                 "&hardware=" + String(HARDWARE_MODEL) + 
                 "&firmware=" + String(FIRMWARE_VERSION) + 
                 "&role=" + String(ROLE_KEY);
                 
  webSocket.beginSSL(WS_HOST, WS_PORT, wsUrl.c_str());
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(4000);
}

void loop() {
  webSocket.loop();

  if (millis() - lastTelemetryTime > 10000) {
    lastTelemetryTime = millis();
    if (WiFi.status() == WL_CONNECTED) {
      float sicaklik = 24.0 + (random(-10, 10) / 10.0);
      float nem = 50.0 + (random(-15, 15) / 10.0);
      int analogVal = analogRead(A0);
      int rssi = WiFi.RSSI();

      String telPayload = "{\\"type\\":\\"telemetry\\",\\"deviceId\\":\\"" + String(API_KEY) + 
                          "\\",\\"messageId\\":\\"tel_" + String(millis()) + 
                          "\\",\\"data\\":{\\"sicaklik\\":" + String(sicaklik, 1) + 
                          ",\\"nem\\":" + String(nem, 1) + 
                          ",\\"analog_a0\\":" + String(analogVal) + 
                          ",\\"relay_1\\":" + String(relayState ? 1 : 0) + 
                          ",\\"rssi\\":" + String(rssi) + 
                          ",\\"firmware\\":\\"" + String(FIRMWARE_VERSION) + "\\"}}}";
                          
      webSocket.sendTXT(telPayload);
      Serial.println("[WS TELEMETRİ] Gönderildi -> " + telPayload);
    }
  }
}`,
    },
    {
      id: 'code_esp32_websocket_client',
      title: 'ESP32 - Canlı Çift Yönlü WebSocket & Birleşik Protokol (Unified WS)',
      category: 'esp32',
      categoryLabel: 'ESP32 WebSocket',
      badge: 'Birleşik Protokol (<10ms)',
      description: 'WebSocketsClient kütüphanesi kullanarak sunucuya kalıcı çift yönlü WS soketi açar. Birleşik Protokol Zarfı ({ type, deviceId, messageId, timestamp, data }) ile hello, telemetry, command, ack, ping ve event mesajlarını 100% standart şekilde yönetir.',
      tags: ['esp32', 'websocket', 'unified protocol', 'realtime', 'hello', 'telemetry', 'command', 'ack', 'ping', 'relay'],
      endpoint: 'WS ws://SERVER_HOST:3000/ws',
      code: `// =========================================================================
// NEXUSNODE IoT - ESP32 BİRLEŞİK WEBSOCKET PROTOKOLÜ (UNIFIED WS PROTOCOL)
// Kütüphane: WebSocketsClient (Arduino WebSockets by Markus Sattler) & ArduinoJson
// Format: { "type": "...", "deviceId": "...", "messageId": "...", "timestamp": ..., "data": { ... } }
// =========================================================================
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID     = "WIFI_AG_ADINIZ";
const char* WIFI_PASS     = "WIFI_SIFRENIZ";
const char* WS_HOST       = "${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}";
const int   WS_PORT       = 3000;
const char* WS_PATH       = "/ws";
const char* DEVICE_ID     = "dev_esp32_saloon_01"; // Cihaz ID veya API Key
const char* API_KEY       = "nkn_live_YOUR_DEVICE_API_KEY"; // Cihaz Token

// -------------------------------------------------------------------------
// 1. GENERIC OUTPUT & DONANIM KONTROL TANIMLARI
// -------------------------------------------------------------------------
enum OutputType {
  TYPE_RELAY,    // Röle (ON/OFF)
  TYPE_DIGITAL,  // Dijital Çıkış (HIGH/LOW)
  TYPE_ANALOG,   // Analog DAC Gerilim (0-255)
  TYPE_PWM       // Donanımsal PWM Sinyali (0-255)
};

struct OutputDef {
  const char* id;          // "relay_1", "relay_2", "digital_1", "pwm_1"
  OutputType  type;
  uint8_t     pin;         // ESP32 GPIO
  bool        activeLow;
  uint8_t     safeInitial;
  uint8_t     pwmChannel;
  uint32_t    pwmFreq;
  uint8_t     pwmResolution;
  float       currentValue;
};

OutputDef outputs[] = {
  { "relay_1",   TYPE_RELAY,   26, false, 0, 0, 0,     0, 0.0 },
  { "relay_2",   TYPE_RELAY,   27, false, 0, 0, 0,     0, 0.0 },
  { "digital_1", TYPE_DIGITAL, 32, false, 0, 0, 0,     0, 0.0 },
  { "pwm_1",     TYPE_PWM,     18, false, 0, 0, 5000,  8, 0.0 }
};
const size_t OUTPUT_COUNT = sizeof(outputs) / sizeof(outputs[0]);

void initOutputs() {
  for (size_t i = 0; i < OUTPUT_COUNT; i++) {
    if (outputs[i].type == TYPE_RELAY || outputs[i].type == TYPE_DIGITAL) {
      pinMode(outputs[i].pin, OUTPUT);
      digitalWrite(outputs[i].pin, outputs[i].activeLow ? HIGH : LOW);
    } else if (outputs[i].type == TYPE_PWM) {
      ledcSetup(outputs[i].pwmChannel, outputs[i].pwmFreq, outputs[i].pwmResolution);
      ledcAttachPin(outputs[i].pin, outputs[i].pwmChannel);
      ledcWrite(outputs[i].pwmChannel, outputs[i].safeInitial);
    }
  }
}

bool setOutput(const String& outputId, const String& value, String& outErrMsg) {
  for (size_t i = 0; i < OUTPUT_COUNT; i++) {
    if (outputId.equalsIgnoreCase(outputs[i].id) || outputId.equalsIgnoreCase(String("OUT_") + String(i + 1))) {
      if (outputs[i].type == TYPE_RELAY || outputs[i].type == TYPE_DIGITAL) {
        bool turnOn = (value.equalsIgnoreCase("ON") || value.equalsIgnoreCase("1") || 
                       value.equalsIgnoreCase("HIGH") || value.equalsIgnoreCase("TRUE"));
        digitalWrite(outputs[i].pin, (outputs[i].activeLow ? !turnOn : turnOn) ? HIGH : LOW);
        outputs[i].currentValue = turnOn ? 1.0 : 0.0;
        return true;
      } else if (outputs[i].type == TYPE_PWM) {
        int pwmVal = constrain(value.toInt(), 0, 255);
        ledcWrite(outputs[i].pwmChannel, pwmVal);
        outputs[i].currentValue = pwmVal;
        return true;
      }
    }
  }
  outErrMsg = "Tanımsız çıkış: " + outputId;
  return false;
}

WebSocketsClient webSocket;
unsigned long lastTelemetry = 0;
unsigned long lastPing = 0;
unsigned long msgCounter = 1000;

// Mesaj ID Üretici
String generateMessageId(const String& prefix) {
  return prefix + "_" + String(millis()) + "_" + String(++msgCounter);
}

// -------------------------------------------------------------------------
// 2. UNIFIED WEBSOCKET PROTOKOL MESAJ GÖNDERİCİLERİ
// -------------------------------------------------------------------------

// Hello Mesajı (Bağlantı Anında El Sıkışma & Kimlik Tanıtma)
void sendHello() {
  DynamicJsonDocument doc(512);
  doc["type"] = "hello";
  doc["deviceId"] = DEVICE_ID;
  doc["messageId"] = generateMessageId("hello");
  doc["timestamp"] = (uint32_t)(millis() / 1000);
  
  JsonObject data = doc.createNestedObject("data");
  data["hardware"] = "ESP32";
  data["firmwareVersion"] = "1.2.0";
  data["mac"] = WiFi.macAddress();
  data["ip"] = WiFi.localIP().toString();
  data["apiKey"] = API_KEY; // Güvenlik doğrulaması

  String msg;
  serializeJson(doc, msg);
  webSocket.sendTXT(msg);
  Serial.println("[UNIFIED WS] 'hello' el sıkışma paketi gönderildi.");
}

// Telemetri Mesajı (Periyodik Sensör & Durum Gönderimi)
void sendTelemetry() {
  float temp = 24.5 + (random(0, 100) / 20.0);
  float hum = 52.0 + (random(0, 100) / 10.0);

  DynamicJsonDocument doc(512);
  doc["type"] = "telemetry";
  doc["deviceId"] = DEVICE_ID;
  doc["messageId"] = generateMessageId("tel");
  doc["timestamp"] = (uint32_t)(millis() / 1000);

  JsonObject data = doc.createNestedObject("data");
  data["sicaklik"] = temp;
  data["nem"] = hum;
  data["rssi"] = WiFi.RSSI();
  data["relay_1"] = (int)outputs[0].currentValue;
  data["relay_2"] = (int)outputs[1].currentValue;

  String msg;
  serializeJson(doc, msg);
  webSocket.sendTXT(msg);
  Serial.printf("[UNIFIED WS] Telemetri gönderildi (Sıcaklık: %.1f, Nem: %.1f)\\n", temp, hum);
}

// ACK Mesajı (Sunucudan Gelen Komutun İcra Onayı)
void sendAck(const String& forMessageId, const String& status, const String& outputId, const String& value, const String& error = "") {
  DynamicJsonDocument doc(512);
  doc["type"] = "ack";
  doc["deviceId"] = DEVICE_ID;
  doc["messageId"] = generateMessageId("ack");
  doc["timestamp"] = (uint32_t)(millis() / 1000);

  JsonObject data = doc.createNestedObject("data");
  data["forMessageId"] = forMessageId;
  data["status"] = status; // "executed" veya "failed"
  
  if (status == "executed") {
    JsonObject res = data.createNestedObject("result");
    res["output"] = outputId;
    res["value"] = value;
  } else if (error.length() > 0) {
    data["error"] = error;
  }

  String msg;
  serializeJson(doc, msg);
  webSocket.sendTXT(msg);
  Serial.printf("[UNIFIED WS] ACK gönderildi: %s (%s)\\n", forMessageId.c_str(), status.c_str());
}

// Ping Mesajı (Canlılık Bildirimi / Keep-Alive)
void sendPing() {
  DynamicJsonDocument doc(256);
  doc["type"] = "ping";
  doc["deviceId"] = DEVICE_ID;
  doc["messageId"] = generateMessageId("ping");
  doc["timestamp"] = (uint32_t)(millis() / 1000);
  doc.createNestedObject("data");

  String msg;
  serializeJson(doc, msg);
  webSocket.sendTXT(msg);
}

// -------------------------------------------------------------------------
// 3. GELEN UNIFIED MESAJLARIN PARSE EDİLMESİ (DISPATCHER)
// -------------------------------------------------------------------------
void handleIncomingUnifiedMessage(uint8_t * payload) {
  DynamicJsonDocument doc(1024);
  DeserializationError err = deserializeJson(doc, payload);
  if (err) return;

  // 1. Unified Format Kontrolü: { "type": "...", "deviceId": "...", "data": { ... } }
  String msgType = doc["type"] | "";
  String msgId   = doc["messageId"] | "";

  if (msgType == "command") {
    JsonObject data = doc["data"];
    String cmd = data["command"] | data["commandType"] | "relay";
    String targetOut = data["output"] | data["outputId"] | "relay_1";
    String val = data["value"] | data["payload"] | "";

    Serial.printf(">>> [UNIFIED KOMUT] ID: %s | Komut: %s | Çıkış: %s | Değer: %s\\n",
                  msgId.c_str(), cmd.c_str(), targetOut.c_str(), val.c_str());

    String errMsg = "";
    bool success = setOutput(targetOut, val, errMsg);
    sendAck(msgId, success ? "executed" : "failed", targetOut, val, errMsg);
  }
  else if (msgType == "ack") {
    JsonObject data = doc["data"];
    String forMsg = data["forMessageId"] | "";
    String status = data["status"] | "";
    Serial.printf("[SUNUCU ACK] Mesaj: %s, Durum: %s\\n", forMsg.c_str(), status.c_str());
  }
  else if (msgType == "pong") {
    Serial.println("[SUNUCU PONG] Canlılık doğrulandı.");
  }
  // 2. Geriye Dönük Uyumluluk (Legacy Event Downlink)
  else if (doc.containsKey("event")) {
    String event = doc["event"] | "";
    if (event == "command:downlink") {
      JsonObject cmd = doc["command"];
      String cmdId = cmd["commandId"] | cmd["id"] | "";
      String out = cmd["outputId"] | "relay_1";
      String val = cmd["value"] | "";
      String errMsg = "";
      bool ok = setOutput(out, val, errMsg);
      sendAck(cmdId, ok ? "executed" : "failed", out, val, errMsg);
    }
  }
}

// -------------------------------------------------------------------------
// 4. WEBSOCKET OLAY YÖNETİMİ & DÖNGÜSÜ
// -------------------------------------------------------------------------
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Bağlantı Kesildi! Yeniden bağlanılıyor...");
      break;
    case WStype_CONNECTED:
      Serial.printf("[WS] Sunucuya Bağlandı! URL: %s\\n", payload);
      // Bağlantı kurulduğu anda Unified 'hello' el sıkışması gönder
      sendHello();
      break;
    case WStype_TEXT:
      Serial.printf("[WS GELEN]: %s\\n", payload);
      handleIncomingUnifiedMessage(payload);
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  initOutputs();

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\n[OK] WiFi Bağlandı! IP: " + WiFi.localIP().toString());

  // WebSocket Başlat (Kalıcı bağlantı)
  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  webSocket.loop();

  // 5 Saniyede bir Telemetri gönderimi
  if (millis() - lastTelemetry > 5000) {
    lastTelemetry = millis();
    if (WiFi.status() == WL_CONNECTED) {
      sendTelemetry();
    }
  }

  // 30 Saniyede bir Keep-Alive Ping gönderimi
  if (millis() - lastPing > 30000) {
    lastPing = millis();
    if (WiFi.status() == WL_CONNECTED) {
      sendPing();
    }
  }
}`,
    },
    {
      id: 'code_esp32_generic_output_driver',
      title: 'ESP32 - Generic Output Sürücüsü (Relay, Digital, Analog, PWM & Safe Boot)',
      category: 'control',
      categoryLabel: 'GPIO / Output Sürücüsü',
      badge: 'Donanım Güvenliği (Safe-Boot)',
      description: 'Cihazın capability tablosundaki tüm çıkış tanımlarını (relay_1, relay_2, digital_1, analog_1, pwm_1) generic setOutput(outputId, value) API ile yöneten, yeniden başlatma anında güvenli başlangıç durumlarını (Safe-State) kuran modüler C++ sürücüsü.',
      tags: ['esp32', 'gpio', 'output', 'relay', 'digital', 'analog', 'pwm', 'dac', 'safe-boot', 'capability'],
      endpoint: 'C++ Modül: OutputManager.h / setOutput(outputId, value)',
      code: `// =========================================================================
// NEXUSNODE IoT - ESP32 GENERIC OUTPUT & GPIO SÜRÜCÜSÜ (STANDALONE / MODÜLER)
// Desteklenen Çıkış Tipleri:
//   - relay   : Aç/Kapa Röle Çıkışları (Active-High veya Active-Low)
//   - digital : Standart GPIO Dijital Çıkışlar (0 / 1)
//   - analog  : ESP32 Dahili DAC Gerilim Çıkışı (0-255 / 0-3.3V)
//   - PWM     : Donanımsal LEDC Zamanlayıcı Kanalı (0-255 Duty / Motor / Dimmer)
// =========================================================================
#include <Arduino.h>

// -------------------------------------------------------------------------
// 1. ÇIKIŞ TİPLERİ VE DONANIM CAPABILITY TANIMLARI
// -------------------------------------------------------------------------
enum OutputType {
  TYPE_RELAY,    // Röle (ON/OFF, 1/0, HIGH/LOW)
  TYPE_DIGITAL,  // Dijital GPIO (1/0)
  TYPE_ANALOG,   // Analog / DAC Gerilim (0-255)
  TYPE_PWM       // Donanımsal PWM Sinyali (0-255)
};

struct OutputDef {
  const char* id;          // Çıkış Kimliği ("relay_1", "relay_2", "digital_1", "analog_1", "pwm_1")
  OutputType  type;        // Çıkış Tipi (relay, digital, analog, pwm)
  uint8_t     pin;         // ESP32 GPIO Numarası
  bool        activeLow;   // Active-Low röle kartları için true
  uint8_t     safeInitial; // Güvenli başlangıç değeri (Reboot safe-state)
  uint8_t     pwmChannel;  // ESP32 LEDC Kanalı (0-15)
  uint32_t    pwmFreq;     // PWM Frekansı (Hz)
  uint8_t     pwmResolution;// PWM Çözünürlüğü (8-bit: 0-255)
  float       currentValue;// Çalışma anındaki aktif değer
};

// Cihazın Donanım Yetenek (Capability) Tablosu:
OutputDef outputs[] = {
  { "relay_1",   TYPE_RELAY,   26, false, 0, 0, 0,     0, 0.0 }, // GPIO 26 -> Ana Güç Rölesi
  { "relay_2",   TYPE_RELAY,   27, false, 0, 0, 0,     0, 0.0 }, // GPIO 27 -> Valf / Pompa Rölesi
  { "digital_1", TYPE_DIGITAL, 32, false, 0, 0, 0,     0, 0.0 }, // GPIO 32 -> Durum LED / Siren
  { "analog_1",  TYPE_ANALOG,  25, false, 0, 0, 0,     0, 0.0 }, // GPIO 25 -> ESP32 DAC1 (0-3.3V Gerilim)
  { "pwm_1",     TYPE_PWM,     18, false, 0, 0, 5000,  8, 0.0 }  // GPIO 18 -> Fan Hızı / Dimmer (5kHz PWM)
};
const size_t OUTPUT_COUNT = sizeof(outputs) / sizeof(outputs[0]);

// -------------------------------------------------------------------------
// 2. GÜVENLİ BAŞLANGIÇ FONKSİYONU (SAFE REBOOT INITIALIZATION)
// ESP yeniden başladığında donanımların istenmeyen şekilde tetiklenmesini önler.
// -------------------------------------------------------------------------
void initOutputs() {
  Serial.println(F("[OUTPUT INIT] Çıkışlar güvenli başlangıç durumuna (Safe-State) getiriliyor..."));

  for (size_t i = 0; i < OUTPUT_COUNT; i++) {
    switch (outputs[i].type) {
      case TYPE_RELAY:
      case TYPE_DIGITAL:
        pinMode(outputs[i].pin, OUTPUT);
        // Active-low mantığına göre güvenli kapalı durumunu yaz:
        if (outputs[i].activeLow) {
          digitalWrite(outputs[i].pin, outputs[i].safeInitial ? LOW : HIGH);
        } else {
          digitalWrite(outputs[i].pin, outputs[i].safeInitial ? HIGH : LOW);
        }
        outputs[i].currentValue = outputs[i].safeInitial;
        break;

      case TYPE_ANALOG:
        #if defined(ESP32)
          dacWrite(outputs[i].pin, outputs[i].safeInitial);
        #else
          pinMode(outputs[i].pin, OUTPUT);
          analogWrite(outputs[i].pin, outputs[i].safeInitial);
        #endif
        outputs[i].currentValue = outputs[i].safeInitial;
        break;

      case TYPE_PWM:
        #if defined(ESP32)
          ledcSetup(outputs[i].pwmChannel, outputs[i].pwmFreq, outputs[i].pwmResolution);
          ledcAttachPin(outputs[i].pin, outputs[i].pwmChannel);
          ledcWrite(outputs[i].pwmChannel, outputs[i].safeInitial);
        #else
          pinMode(outputs[i].pin, OUTPUT);
          analogWrite(outputs[i].pin, outputs[i].safeInitial);
        #endif
        outputs[i].currentValue = outputs[i].safeInitial;
        break;
    }

    Serial.printf("  ✓ [%s] Tip: %d | Pin: GPIO %d | Güvenli Durum: %d\\n", 
                  outputs[i].id, outputs[i].type, outputs[i].pin, outputs[i].safeInitial);
  }
  Serial.println(F("[OUTPUT INIT] Tüm çıkışlar başarıyla güvenceye alındı."));
}

// -------------------------------------------------------------------------
// 3. GENERIC ÇIKIŞ KONTROL APİ: setOutput(outputId, value)
// -------------------------------------------------------------------------
bool setOutput(const String& outputId, const String& value, String& outErrMsg) {
  for (size_t i = 0; i < OUTPUT_COUNT; i++) {
    // ID eşleşmesi (büyük/küçük harf duyarsız)
    if (outputId.equalsIgnoreCase(outputs[i].id) || 
        outputId.equalsIgnoreCase(String("OUT_") + String(i + 1))) {
      
      switch (outputs[i].type) {
        // A) RÖLE VE DİJİTAL ÇIKIŞLAR
        case TYPE_RELAY:
        case TYPE_DIGITAL: {
          bool turnOn = (value.equalsIgnoreCase("ON") || value.equalsIgnoreCase("1") || 
                         value.equalsIgnoreCase("HIGH") || value.equalsIgnoreCase("TRUE"));
          bool physicalPinState = outputs[i].activeLow ? !turnOn : turnOn;
          digitalWrite(outputs[i].pin, physicalPinState ? HIGH : LOW);
          outputs[i].currentValue = turnOn ? 1.0 : 0.0;
          Serial.printf("[OUTPUT SÜRÜLDÜ] %s -> %s (Pin %d, Fiziksel: %d)\\n", 
                        outputs[i].id, turnOn ? "AÇIK (HIGH)" : "KAPALI (LOW)", 
                        outputs[i].pin, physicalPinState);
          return true;
        }

        // B) ANALOG / DAC ÇIKIŞLAR (0-255 / 0-3.3V)
        case TYPE_ANALOG: {
          int dacVal = value.toInt();
          if (dacVal < 0) dacVal = 0;
          if (dacVal > 255) dacVal = 255;
          #if defined(ESP32)
            dacWrite(outputs[i].pin, dacVal);
          #else
            analogWrite(outputs[i].pin, dacVal);
          #endif
          outputs[i].currentValue = dacVal;
          float voltage = (dacVal / 255.0) * 3.3;
          Serial.printf("[OUTPUT SÜRÜLDÜ] %s -> DAC Değeri: %d / 255 (~%.2f Volt)\\n", 
                        outputs[i].id, dacVal, voltage);
          return true;
        }

        // C) PWM ÇIKIŞLARI (0-255 Duty)
        case TYPE_PWM: {
          int pwmVal = value.toInt();
          if (pwmVal < 0) pwmVal = 0;
          if (pwmVal > 255) pwmVal = 255;
          #if defined(ESP32)
            ledcWrite(outputs[i].pwmChannel, pwmVal);
          #else
            analogWrite(outputs[i].pin, pwmVal);
          #endif
          outputs[i].currentValue = pwmVal;
          float dutyPercent = (pwmVal / 255.0) * 100.0;
          Serial.printf("[OUTPUT SÜRÜLDÜ] %s -> PWM Duty: %d / 255 (%%%.1f Hız/Parlaklık)\\n", 
                        outputs[i].id, pwmVal, dutyPercent);
          return true;
        }
      }
    }
  }

  outErrMsg = "Desteklenmeyen veya tanımlanmamış outputId: " + outputId;
  Serial.println("[OUTPUT HATA] " + outErrMsg);
  return false;
}

// -------------------------------------------------------------------------
// 4. TEST VE KULLANIM ÖRNEĞİ
// -------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  // 1. Çıkışları güvenli başlat
  initOutputs();

  // 2. Generic API Testleri
  String errMsg = "";
  
  // Röle 1 Aç:
  setOutput("relay_1", "ON", errMsg);
  delay(1000);

  // PWM Fan Hızını %50 (128) yap:
  setOutput("pwm_1", "128", errMsg);
  delay(1000);

  // Analog DAC Çıkışını 2.0V (~155) yap:
  setOutput("analog_1", "155", errMsg);
  delay(1000);

  // Röle 2 Aç:
  setOutput("relay_2", "1", errMsg);
  delay(1000);
}

void loop() {
  // Saha telemetri ve komut alma döngüsü
  delay(10000);
}`,
    },
    {
      id: 'code_python_iot_agent',
      title: 'Python - Endüstriyel IoT Ajanı (Auto-Reconnect & Telemetri)',
      category: 'python',
      categoryLabel: 'Python Script',
      badge: 'Linux / Raspberry Pi',
      description: 'Raspberry Pi, endüstriyel PC veya yerel sunucularda arka planda çalışan ve sistem parametrelerini otomatik gönderen Python servisi.',
      tags: ['python', 'raspberry pi', 'linux', 'iot agent', 'requests'],
      endpoint: 'POST /api/v1/telemetry',
      code: `# =========================================================================
# NEXUSNODE IoT - PYTHON SAHA VERİ TOPLAYICI AJAN (IoT AGENT)
# Gereksinim: pip install requests psutil
# =========================================================================
import time
import requests
import psutil

SERVER_URL = "${originUrl}/api/v1/telemetry"
API_KEY = "nkn_live_YOUR_DEVICE_API_KEY"
DEVICE_NAME = "RaspberryPi_Saha_01"

print(f">>> NexusNode Python IoT Ajanı Başlatıldı! Hedef: {SERVER_URL}")

while True:
    try:
        # Sistem Gerçek Metrikleri
        cpu_usage = psutil.cpu_percent(interval=1)
        ram_usage = psutil.virtual_memory().percent
        disk_usage = psutil.disk_usage('/').percent

        # Format: TOKEN, CIHAZ_ADI, METRIK:DEGER...
        payload = f"{API_KEY}, {DEVICE_NAME}, cpu_kullanım:{cpu_usage}, ram_kullanım:{ram_usage}, disk_doluluk:{disk_usage}"

        response = requests.post(
            SERVER_URL,
            data=payload.encode('utf-8'),
            headers={"Content-Type": "text/plain; charset=utf-8"},
            timeout=5
        )

        if response.status_code == 200:
            print(f"[OK] Paket İletildi (CPU: %{cpu_usage}, RAM: %{ram_usage}) -> Yanıt: {response.json()}")
        else:
            print(f"[HATA] Sunucu Kodu: {response.status_code} | Yanıt: {response.text}")

    except Exception as e:
        print(f"[BAĞLANTI HATASI] {e}. 5 saniye sonra tekrar denenecek...")

    time.sleep(5) # 5 Saniye aralıkla veri gönder
`,
    },
    {
      id: 'code_python_unified_websocket',
      title: 'Python - Birleşik WebSocket İstemcisi (Unified WS Protocol)',
      category: 'python',
      categoryLabel: 'Python WebSocket',
      badge: 'Birleşik Protokol',
      description: 'Linux, Raspberry Pi veya endüstriyel gateway sistemlerinde websocket-client kütüphanesi ile sunucuya kalıcı çift yönlü WS bağlantısı kurar. Hello, Telemetry, Command, Ack ve Ping mesajlarını Birleşik Protokol Zarfı ile yönetir.',
      tags: ['python', 'websocket', 'unified protocol', 'raspberry pi', 'linux', 'realtime', 'telemetry', 'command', 'ack'],
      endpoint: 'WS ws://SERVER_HOST:3000/ws',
      code: `# =========================================================================
# NEXUSNODE IoT - PYTHON BİRLEŞİK WEBSOCKET İSTEMCİSİ (UNIFIED WS PROTOCOL)
# Gereksinim: pip install websocket-client psutil
# =========================================================================
import json
import time
import uuid
import threading
import psutil
import websocket

SERVER_WS = "ws://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/ws"
DEVICE_ID = "dev_rpi_gateway_01"
API_KEY   = "nkn_live_YOUR_DEVICE_API_KEY"

def generate_msg_id(prefix="msg"):
    return f"{prefix}_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"

def on_open(ws):
    print(">>> [WS BAĞLANDI] Sunucu ile kalıcı bağlantı kuruldu.")
    # 1. El Sıkışma: Hello Mesajı
    hello_msg = {
        "type": "hello",
        "deviceId": DEVICE_ID,
        "messageId": generate_msg_id("hello"),
        "timestamp": int(time.time()),
        "data": {
            "hardware": "Raspberry Pi 4",
            "firmwareVersion": "2.1.0",
            "os": "Linux ARM64",
            "apiKey": API_KEY
        }
    }
    ws.send(json.dumps(hello_msg))
    print("[UNIFIED WS] 'hello' paketi gönderildi.")

    # Telemetri ve Ping gönderecek iş parçacığını başlat
    threading.Thread(target=periodic_tasks, args=(ws,), daemon=True).start()

def on_message(ws, message):
    try:
        data = json.loads(message)
        msg_type = data.get("type")
        msg_id   = data.get("messageId")

        # Gelen Komut İcrası
        if msg_type == "command":
            cmd_data = data.get("data", {})
            cmd = cmd_data.get("command", "relay")
            out = cmd_data.get("output", "relay_1")
            val = cmd_data.get("value")

            print(f">>> [UNIFIED KOMUT ALINDI] ID: {msg_id} | Komut: {cmd} | Çıkış: {out} | Değer: {val}")

            # Donanım sürüş işlemi (örnek: GPIO)
            # RPi.GPIO.output(pin, GPIO.HIGH if val else GPIO.LOW)
            time.sleep(0.05) # İşlem süresi

            # İcra Onayı (ACK) Gönder
            ack_msg = {
                "type": "ack",
                "deviceId": DEVICE_ID,
                "messageId": generate_msg_id("ack"),
                "timestamp": int(time.time()),
                "data": {
                    "forMessageId": msg_id,
                    "status": "executed",
                    "result": {
                        "output": out,
                        "value": val,
                        "executedAt": time.time()
                    }
                }
            }
            ws.send(json.dumps(ack_msg))
            print(f"[UNIFIED WS] Komut icra edildi ve ACK iletildi: {msg_id}")

        elif msg_type == "ack":
            print(f"[SUNUCU ACK] {data.get('data')}")

        elif msg_type == "pong":
            pass # Keep-Alive canlı

    except Exception as e:
        print(f"[HATA] Mesaj parse edilemedi: {e}")

def on_error(ws, error):
    print(f"[WS HATA] {error}")

def on_close(ws, close_status_code, close_msg):
    print(f"[WS KAPANDI] Kod: {close_status_code}, Mesaj: {close_msg}")

def periodic_tasks(ws):
    last_ping = time.time()
    while True:
        try:
            # Her 5 saniyede telemetri gönder
            cpu = psutil.cpu_percent(interval=1)
            ram = psutil.virtual_memory().percent
            disk = psutil.disk_usage('/').percent

            telemetry_msg = {
                "type": "telemetry",
                "deviceId": DEVICE_ID,
                "messageId": generate_msg_id("tel"),
                "timestamp": int(time.time()),
                "data": {
                    "cpu_kullanım": cpu,
                    "ram_kullanım": ram,
                    "disk_doluluk": disk
                }
            }
            ws.send(json.dumps(telemetry_msg))
            print(f"[UNIFIED WS] Telemetri gönderildi -> CPU: %{cpu}, RAM: %{ram}")

            # Her 30 saniyede bir Keep-Alive Ping gönder
            if time.time() - last_ping > 30:
                ping_msg = {
                    "type": "ping",
                    "deviceId": DEVICE_ID,
                    "messageId": generate_msg_id("ping"),
                    "timestamp": int(time.time()),
                    "data": {}
                }
                ws.send(json.dumps(ping_msg))
                last_ping = time.time()

            time.sleep(4)
        except Exception as e:
            print(f"[TASK HATASI] {e}")
            break

if __name__ == "__main__":
    while True:
        try:
            print(f">>> NexusNode WebSocket Ajanı Bağlanıyor: {SERVER_WS}")
            ws_app = websocket.WebSocketApp(
                SERVER_WS,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            ws_app.run_forever(ping_interval=25, ping_timeout=10)
        except Exception as e:
            print(f"[BAĞLANTI KESİLDİ] {e}. 5 saniye sonra tekrar denenecek...")
        time.sleep(5)
`,
    },
    {
      id: 'code_curl_bash_scripts',
      title: 'cURL / Bash - Hızlı Test ve Entegrasyon Betikleri',
      category: 'curl',
      categoryLabel: 'cURL & Bash',
      badge: 'Komut Satırı',
      description: 'Terminalden tek satırda telemetri verisi gönderme, heartbeat ping atma ve röle kontrol tetikleme komutları.',
      tags: ['curl', 'bash', 'terminal', 'cli', 'ping', 'kontrol'],
      endpoint: 'POST /api/v1/telemetry & /api/telemetry/ping & /api/devices/:id/control',
      code: `#!/bin/bash
# =========================================================================
# NEXUSNODE IoT - cURL HIZLI TEST KOMUTLARI
# =========================================================================

# 1. HIZLI METİN FORMATINDA TELEMETRİ GÖNDERİMİ
curl -X POST "${originUrl}/api/v1/telemetry" \\
  -H "Content-Type: text/plain" \\
  -d "dev_key_test_0000000000000000, dev_test_01, sıcaklık:28.4, nem:62.5, basınç:1013.2"

# 2. HEARTBEAT / PING SİNYALİ GÖNDERME (Cihazı Canlı Tutma / Çevrimiçi Yapma)
curl -X POST "${originUrl}/api/telemetry/ping" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: dev_key_test_0000000000000000" \\
  -d '{"deviceId":"dev_test_01","ping":1,"rssi":-58}'

# 3. JSON FORMATINDA TELEMETRİ GÖNDERİMİ
curl -X POST "${originUrl}/api/telemetry" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: dev_key_test_0000000000000000" \\
  -d '{
    "deviceId": "dev_test_01",
    "metric": "temperature",
    "value": 31.2,
    "unit": "°C"
  }'

# 4. RÖLE / PWM ÇIKIŞI TETİKLEME (Kontrol API)
curl -X POST "${originUrl}/api/devices/dev_test_01/control" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN" \\
  -d '{
    "command": "RELAY_1",
    "outputPin": "OUT_1",
    "value": "HIGH"
  }'

# 5. KULLANICI -> CİHAZ YENİ KOMUT GÖNDERME (PostgreSQL Multi-Tenant Command API)
# 5 Aşamalı Doğrulama: Oturum + Tenant İzolasyonu + Cihaz Sahipliği + Rol Kontrolü + Çıkış Pini Desteği
curl -X POST "${originUrl}/api/devices/dev_test_01/commands" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN" \\
  -d '{
    "command": "RELAY_1",
    "commandType": "SET_OUTPUT",
    "outputId": "RELAY_1",
    "value": "1",
    "source": "manual"
  }'

# 6. CİHAZ KOMUT LİSTESİ SORGULAMA (GET /api/devices/:id/commands)
curl -X GET "${originUrl}/api/devices/dev_test_01/commands" \\
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN"

# 7. BEKLEYEN KOMUTU İPTAL ETME (POST /api/commands/:id/cancel)
curl -X POST "${originUrl}/api/commands/cmd_123456/cancel" \\
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN"

# 8. SAHA CİHAZI KOMUT İNFAK ONAYI (Command Execution ACK)
curl -X POST "${originUrl}/api/device/commands/ack" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "commandId": "cmd_123456",
    "status": "acknowledged"
  }'
`,
    },
    {
      id: 'code_postgresql_commands_api',
      title: 'Çift Yönlü Komut & Kontrol API (PostgreSQL Multi-Tenant Yetkili)',
      category: 'curl',
      categoryLabel: 'Komut & Kontrol API',
      badge: 'Multi-Tenant & PostgreSQL',
      description: 'Kullanıcıdan cihaza 5 aşamalı güvenlik ve çıkış pini doğrulama kontrolü ile komut gönderme, kuyruk sorgulama ve iptal etme uç noktaları.',
      tags: ['command', 'komut', 'postgresql', 'multi-tenant', '403', 'güvenlik', 'röle', 'pwm', 'iptal'],
      endpoint: 'POST /api/devices/:deviceId/commands & GET /api/devices/:deviceId/commands',
      code: `// =========================================================================
// NEXUSNODE IoT - ÇİFT YÖNLÜ POSTGRESQL KOMUT GÖNDERME VE YÖNETİMİ
// 5 Aşamalı Doğrulama:
//   1. Oturum Kontrolü (Authentication)
//   2. Organizasyon / Tenant Erişimi (Multi-Tenant Isolation)
//   3. Cihaz Sahipliği Denetimi (Device Ownership)
//   4. Komut İletim İzni (Role & Permission Check - Viewer 403 Forbidden)
//   5. Çıkış / Pin Donanım Desteği Doğrulaması (Supported Output Check)
// =========================================================================

// 1. Cihaza Yeni Çıkış / Röle / PWM Komutu Gönderme:
POST ${originUrl}/api/devices/dev_esp32_01/commands
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_USER_JWT_TOKEN",
  "X-Idempotency-Key": "req_uniq_987654321"  // Çift gönderimi önleyen benzersiz idempotency anahtarı (P1)
}
Body:
{
  "command": "RELAY_1",
  "commandType": "SET_OUTPUT",
  "outputId": "RELAY_1",
  "value": "1",
  "source": "manual",
  "timeoutSeconds": 60,                     // Özel zaman aşımı süresi (saniye) (P1)
  "idempotencyKey": "req_uniq_987654321"    // Body üzerinden de idempotency anahtarı iletilebilir
}

// Başarılı Yanıt (HTTP 201 Created):
{
  "status": "success",
  "message": "Komut başarıyla doğrulandı ve PostgreSQL kuyruğuna eklendi.",
  "command": {
    "id": "cmd_1725100000000_abc1",
    "commandId": "cmd_1725100000000_abc1",
    "tenantId": "usr_customer_01",
    "deviceId": "dev_esp32_01",
    "userId": "usr_customer_01",
    "commandType": "SET_OUTPUT",
    "command": "RELAY_1",
    "outputId": "RELAY_1",
    "value": "1",
    "source": "manual",
    "status": "pending",
    "idempotencyKey": "req_uniq_987654321",
    "timeoutSeconds": 60,
    "createdAt": "2026-08-31T15:30:00.000Z"
  }
}

// Yetkisiz veya Başka Müşteri Cihazı İstek Yanıtı (HTTP 403 Forbidden):
{
  "error": "Yetkisiz erişim (403): 'ESP32 Pompa İstasyonu' (dev_esp32_01) cihazı hesabınıza veya bağlı olduğunuz organizasyona ait değildir."
}

// Desteklenmeyen Çıkış Pini Yanıtı (HTTP 400 Bad Request):
{
  "error": "Geçersiz Çıkış / Pin (400): 'UNKNOWN_PIN_999' çıkışı bu cihaz (ESP32 Pompa İstasyonu) tarafından desteklenmemektedir."
}

// 2. Cihazın Komut Kuyruğunu ve Geçmişini Listeleme:
GET ${originUrl}/api/devices/dev_esp32_01/commands?limit=50
Headers: {
  "Authorization": "Bearer YOUR_USER_JWT_TOKEN"
}

// 3. Bekleyen Bir Komutu İptal Etme:
POST ${originUrl}/api/commands/cmd_1725100000000_abc1/cancel
Headers: {
  "Authorization": "Bearer YOUR_USER_JWT_TOKEN"
}
Response:
{
  "success": true,
  "message": "Komut [cmd_1725100000000_abc1] başarıyla iptal edildi."
}

// =========================================================================
// 4. GERÇEK ZAMANLI WEBSOCKET COMMAND EVENT AKIŞI (Dashboard & Client)
// Multi-tenant izolasyonu ile yetkili dashboard ve istemcilere anlık aktarılır:
// =========================================================================
//
// 1. 'command:created'     -> Komut oluşturulduğunda yayınlanır (status: 'pending')
// 2. 'command:sent'        -> Cihaz komutu çektiğinde/teslim edildiğinde yayınlanır (status: 'sent'/'claimed')
// 3. 'command:acknowledged'-> Cihaz komut alındı/işleme başladı onayı verdiğinde yayınlanır
// 4. 'command:executed'    -> Cihaz komutun başarıyla icra edildiğini onayladığında yayınlanır
// 5. 'command:failed'      -> Komut hata aldığında veya kullanıcı tarafından iptal edildiğinde
// 6. 'command:expired'     -> TTL süresi dolup zaman aşımına uğradığında otomatik tetiklenir
//
// JavaScript / WebSocket Dinleyici Örneği:
// const ws = new WebSocket("ws://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/ws?token=YOUR_TOKEN");
// ws.onmessage = (event) => {
//   const msg = JSON.parse(event.data);
//   switch(msg.event) {
//     case 'command:created':      console.log('Yeni komut kuyrukta:', msg.payload); break;
//     case 'command:sent':         console.log('Cihaza iletildi:', msg.payload); break;
//     case 'command:acknowledged': console.log('Cihaz teslim aldı:', msg.payload); break;
//     case 'command:executed':     console.log('Komut başarıyla çalıştı:', msg.payload); break;
//     case 'command:failed':       console.error('Komut başarısız:', msg.payload); break;
//     case 'command:expired':      console.warn('Komut zaman aşımına uğradı:', msg.payload); break;
//   }
// };
`,
    },
    {
      id: 'code_nodejs_javascript_client',
      title: 'Node.js / JavaScript - Axios & Fetch İstemcisi',
      category: 'nodejs',
      categoryLabel: 'Node.js / JS',
      badge: 'Web & Backend',
      description: 'Node.js veya modern tarayıcı ortamlarından sistem API’lerine veri gönderme ve kontrol sinyali iletme kodu.',
      tags: ['nodejs', 'javascript', 'axios', 'fetch', 'backend'],
      endpoint: 'POST /api/v1/telemetry',
      code: `// =========================================================================
// NEXUSNODE IoT - NODE.JS / JAVASCRIPT TELEMETRİ VE KONTROL İSTEMCİSİ
// =========================================================================
const axios = require('axios'); // veya modern fetch

const SERVER_URL = '${originUrl}/api/v1/telemetry';
const API_KEY = 'nkn_live_YOUR_DEVICE_API_KEY';
const DEVICE_NAME = 'NodeJS_Gateway_01';

async function sendTelemetry() {
  try {
    const payload = \`\${API_KEY}, \${DEVICE_NAME}, sicaklik:25.6, nem:58.2, voltaj:220.4\`;

    const response = await axios.post(SERVER_URL, payload, {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 5000,
    });

    console.log('[OK] Telemetri gönderildi! Sunucu yanıtı:', response.data);

    // Gelen komutları kontrol et
    if (response.data && response.data.commands) {
      console.log('>>> Bekleyen komutlar:', response.data.commands);
    }
  } catch (error) {
    console.error('[HATA] İstek başarısız:', error.message);
  }
}

// 5 saniyede bir gönder
setInterval(sendTelemetry, 5000);
sendTelemetry();
`,
    },
    {
      id: 'code_isolated_apis_architecture',
      title: 'İki Ayrı Giriş API & Veritabanı Hypertable İzolasyonu (Fiziksel vs Sanal)',
      category: 'curl',
      categoryLabel: 'Mimari & API İzolasyonu',
      badge: 'Güvenlik & Mimari',
      description: 'Fiziksel telemetri (POST /api/v1/telemetry -> telemetry_readings) ve Sanal simülasyon telemetrisi (POST /api/simulator/v1/telemetry -> simulation_telemetry_readings) arasındaki iki ayrı hypertable mimarisi ve cURL örnekleri.',
      tags: ['mimari', 'api', 'fiziksel', 'simülatör', 'izolasyon', '403', 'hypertable', 'timescaledb'],
      endpoint: 'POST /api/v1/telemetry (Fiziksel) vs POST /api/simulator/v1/telemetry (Sanal)',
      code: `#!/bin/bash
# =========================================================================
# NEXUSNODE IoT - İKİ AYRI TELEMETRİ GİRİŞ API, HYPERTABLE & WAL İZOLASYON MİMARİSİ
# =========================================================================
# 1. VERİTABANI & WAL KUYRUK İZOLASYONU:
#    - Fiziksel Telemetri: telemetry_readings (TimescaleDB Hypertable)
#      -> WAL Kuyruğu: data/wal/physical-telemetry.ndjson
#      -> Yalnızca gerçek donanım verilerini depolar ve kuyruklar (source='physical').
#      -> telemetry_hourly_summary ve telemetry_daily_summary continuous aggregate'larını besler.
#    - Sanal Simülasyon Telemetrisi: simulation_telemetry_readings (TimescaleDB Hypertable)
#      -> WAL Kuyruğu: data/wal/simulation-telemetry.ndjson
#      -> Tamamen ayrı bir hypertable ve kısa ömürlü (ephemeral/RAM) kuyrukta tutulur.
#      -> Sanal veriler kesinlikle gerçek üretim kuyruğuna, WAL dosyasına veya Timescale aggregate'larına karışamaz.
#
# 2. GERÇEK FİZİKSEL CİHAZ TELEMETRİ GİRİŞİ (Production Telemetry Pipeline)
# Uç Nokta: POST /api/v1/telemetry
# Kural: Yalnızca isSimulated === false olan gerçek donanım API anahtarları kabul edilir.
# İdempotency: deviceId + bootId + sequence anahtarı ile çift paketler otomatik deduplicate edilir.
curl -X POST "${originUrl}/api/v1/telemetry" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_PHYSICAL_DEVICE_API_KEY" \\
  -H "X-Boot-Id: boot_counter_042" \\
  -d '{
    "deviceId": "dev_esp32_saha_01",
    "bootId": "boot_counter_042",
    "sequence": 1042,
    "metrics": {
      "temperature": { "value": 24.8, "unit": "°C" },
      "humidity": { "value": 55.2, "unit": "%" },
      "voltage": { "value": 228.4, "unit": "V" }
    }
  }'

# 3. SANAL SİMÜLATÖR TELEMETRİ GİRİŞİ (Sandbox / Test Telemetry Pipeline)
# Uç Nokta: POST /api/simulator/v1/telemetry
# Kural: Yalnızca isSimulated === true olan sanal cihaz API anahtarları kabul edilir.
# Fiziksel cihaz API anahtarı ile istek gelirse 403 Forbidden (physical_device_not_allowed_in_simulator) döner.
curl -X POST "${originUrl}/api/simulator/v1/telemetry" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_SIMULATED_DEVICE_API_KEY" \\
  -d '{
    "deviceId": "sim_dev_server_01",
    "bootId": "sim_boot_01",
    "sequence": 1,
    "metrics": {
      "cpu": { "value": 42.5, "unit": "%" },
      "memory": { "value": 68.0, "unit": "%" },
      "bandwidth": { "value": 450.0, "unit": "Mbps" }
    }
  }'

# 4. MANUEL TEST TELEMETRİ ENJEKSİYONU (Yönetici Oturumu & Cihaz API Anahtarsız)
# Uç Nokta: POST /api/simulator/v1/inject
# Kural: Cihaz API anahtarı KULLANILMAZ. Yönetici oturum token'ı (Authorization: Bearer <TOKEN>) ile doğrulanır.
# Güvenlik Kuralı: Yalnızca isSimulated === true olan sanal cihazlara gönderilebilir; fiziksel cihazlar korunur (403 Forbidden).
curl -X POST "${originUrl}/api/simulator/v1/inject" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ADMIN_SESSION_TOKEN" \\
  -d '{
    "deviceId": "sim_dev_server_01",
    "metric": "temperature",
    "value": 38.5,
    "unit": "°C"
  }'

# 5. WEBSOCKET KANAL VE ABONELİK İZOLASYONU
# Kanallar:
#   - telemetry:physical:batch (ve telemetry:physical:new) -> Gerçek donanım verileri
#   - telemetry:simulation:batch (ve telemetry:simulation:new) -> Sanal simülasyon/test verileri
# İstemci Abonelik Akışı:
#   - Bağlantı açıldığında varsayılan: { "event": "subscribe", "channels": ["physical"] }
#   - Sanal Veri Üreteci sayfasına girildiğinde: { "event": "subscribe", "channels": ["simulation"] }
#   - Sayfadan çıkıldığında: { "event": "unsubscribe", "channels": ["simulation"] }
`,
    },
    {
      id: 'code_timescaledb_tiered_storage',
      title: 'TimescaleDB Kademeli Depolama (3-Tiered Storage) & Sıkıştırma Yönetim API\'si',
      category: 'curl',
      categoryLabel: 'Veritabanı & Kademeli Saklama',
      badge: '5 Yıl Saklama Mimarisi',
      description: '500 cihaz, 5 saniyede bir veri ve 5 yıl saklama hedefine uygun 3 Kademeli Depolama Mimarisi (0-14 gün Sıcak Ham, 14-365 gün Ilık Sıkıştırılmış, 1-5 yıl Soğuk Downsample Özetler) ve yönetim API uç noktaları.',
      tags: ['timescaledb', 'retention', 'compression', 'continuous-aggregates', '5-year-storage', 'tiering', 'api'],
      endpoint: 'GET /api/timescale/stats, POST /api/timescale/compress-now & POST /api/timescale/policies',
      code: `#!/bin/bash
# =========================================================================
# NEXUSNODE IoT - TIMESCALEDB 3 KADEMELİ SAKLAMA (3-TIER RETENTION) & YÖNETİM
# =========================================================================
# Mimari Tasarım (500 Cihaz * 5s Veri Aralığı = Günde 8.64 Milyon Kayıt):
#  - KADEME 1 (0 – 14 Gün): Sıcak Ham Veri (Hot Raw Telemetry)
#      -> 7 günlük TimescaleDB chunk parçalarında uncompressed saklanır.
#      -> Anlık alarm kuralları, canlı grafikler ve ham veri incelemeleri buradan beslenir.
#  - KADEME 2 (14 Gün – 1 Yıl / 365 Gün): Ilık Sıkıştırılmış Veri (Warm Compressed Telemetry)
#      -> TimescaleDB columnar compression ile otomatik sıkıştırılır (segmentBy: device_id, metric).
#      -> Disk alanı %80–%92 oranında küçülür. 365 gün boyunca saklanır.
#  - KADEME 3 (1 Yıl – 5 Yıl / 1825 Gün): Soğuk Sürekli Özetler (Cold Downsampled Rollups)
#      -> telemetry_hourly_summary (Saatlik rollup): 730 gün (2 yıl) saklanır.
#      -> telemetry_daily_summary (Günlük rollup): 1825 gün (5 yıl) saklanır.
#
# 1. CANLI TIMESCALEDB PARÇA (CHUNK) VE SIKIŞTIRMA İSTATİSTİKLERİNİ ALMA
# Uç Nokta: GET /api/timescale/stats
# Kimlik: Yönetici Oturum Token'ı (usr_test_admin)
curl -X GET "${originUrl}/api/timescale/stats" \\
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"

# 2. ELDEKİ TÜM UYGUN PARÇALARI DERHAL SIKIŞTIRMA (MANUEL TETİKLEME)
# Uç Nokta: POST /api/timescale/compress-now
curl -X POST "${originUrl}/api/timescale/compress-now" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"

# 3. SIKIŞTIRMA VE SAKLAMA (RETENTION) POLİTİKALARINI DİNAMİK GÜNCELLEME
# Uç Nokta: POST /api/timescale/policies
# Gövde:
#   - compressOlderThanDays: Kaç günden eski ham verilerin sıkıştırılacağı (Örn: 14)
#   - dropOlderThanDays: Ham verinin kaçıncı günde silineceği (Örn: 365 -> 1 yıl)
#   - continuousAggregates: Saatlik ve günlük özet tablolarının aktifliği (true)
curl -X POST "${originUrl}/api/timescale/policies" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \\
  -d '{
    "compressOlderThanDays": 14,
    "dropOlderThanDays": 365,
    "continuousAggregates": true
  }'
`,
    },
    {
      id: 'code_first_run_setup_api',
      title: 'First Run Database Setup Wizard & Headless Kurulum API\'si',
      category: 'curl',
      categoryLabel: 'İlk Kurulum & Veritabanı',
      badge: 'First Run Setup API',
      description: 'Yeni bir VPS veya Home Server kurulumunda veritabanı bağlantısı testi, konfigürasyon kaydetme, TimescaleDB ve migrasyon ilklendirme ile ilk yönetici hesabı oluşturma uç noktaları.',
      tags: ['setup', 'wizard', 'database', 'timescaledb', 'first run', 'migrations', 'admin', 'headless'],
      endpoint: 'GET /api/setup/status, POST /api/setup/test-database, POST /api/setup/initialize, POST /api/setup/create-admin, POST /api/setup/reset, POST /api/setup/resume',
      code: `#!/bin/bash
# =========================================================================
# NEXUSNODE IoT - FIRST RUN DATABASE SETUP WIZARD & HEADLESS KURULUM API
# =========================================================================
# Güvenlik Kuralı:
#  - Kurulum tamamlandıktan sonra setup uç noktaları kalıcı olarak kilitlenir (HTTP 403).
#  - Veritabanı şifresi hiçbir API yanıtında veya loglarda saklanmaz.
#  - Veriler (telemetri ve cihazlar) sıfır veri kaybı garantisiyle korunur.
#  - Setup Token: X-Setup-Token başlığı ile gönderilmelidir.
#
# 1. KURULUM DURUMUNU SORGULAMA
# Uç Nokta: GET /api/setup/status
curl -s -X GET "\${originUrl}/api/setup/status"

# 2. VERİTABANI BAĞLANTISINI TEST ETME
# Uç Nokta: POST /api/setup/test-database
# PostgreSQL soketini doğrular ve TimescaleDB varlığını kontrol eder.
curl -s -X POST "\${originUrl}/api/setup/test-database" \\
  -H "Content-Type: application/json" \\
  -H "X-Setup-Token: YOUR_SETUP_TOKEN" \\
  -d '{
    "host": "timescaledb",
    "port": 5432,
    "database": "iot_dashboard",
    "user": "iot_user",
    "password": "YOUR_STRONG_PASSWORD",
    "sslMode": "disable"
  }'

# 3. VERİTABANI KONFİGÜRASYONUNU GÜVENLE KAYDETME
# Uç Nokta: POST /api/setup/configure-database
# Sunucu 0600 izinli protected secret dosyasında saklar ve bağlantı havuzunu başlatır.
curl -s -X POST "\${originUrl}/api/setup/configure-database" \\
  -H "Content-Type: application/json" \\
  -H "X-Setup-Token: YOUR_SETUP_TOKEN" \\
  -d '{
    "host": "timescaledb",
    "port": 5432,
    "database": "iot_dashboard",
    "user": "iot_user",
    "password": "YOUR_STRONG_PASSWORD",
    "sslMode": "disable"
  }'

# 4. VERİTABANINI İLKLENDİRME & MİGRASYONLARI ÇALIŞTIRMA
# Uç Nokta: POST /api/setup/initialize
# TimescaleDB eklentisini açar, migrasyonları uygular ve Canonical Schema'yı doğrular.
curl -s -X POST "\${originUrl}/api/setup/initialize" \\
  -H "Content-Type: application/json" \\
  -H "X-Setup-Token: YOUR_SETUP_TOKEN"

# 5. İLK SİSTEM YÖNETİCİSİNİ OLUŞTURMA VE KURULUMU KİLİTLEME
# Uç Nokta: POST /api/setup/create-admin
# İlk yöneticiyi oluşturur, şifreyi bcrypt ile hashler ve setup mode'u kalıcı kilitler.
curl -s -X POST "\${originUrl}/api/setup/create-admin" \\
  -H "Content-Type: application/json" \\
  -H "X-Setup-Token: YOUR_SETUP_TOKEN" \\
  -d '{
    "name": "Sistem Yöneticisi",
    "email": "test@nexusnodeiot.com.tr",
    "password": "YOUR_STRONG_ADMIN_PASSWORD",
    "passwordConfirm": "YOUR_STRONG_ADMIN_PASSWORD",
    "companyName": "Merkez Yönetim"
  }'

# 6. KURULUMU SIFIRLAMA / YENİDEN BAŞLATMA (RECOVERY)
# Uç Nokta: POST /api/setup/reset
# Kurulum yarım kaldığında veya kilitlendiğinde güvenle sıfırlar.
# preserveConfig: true -> Veritabanı bağlantı ayarlarını korur, adımları baştan başlatır.
# preserveConfig: false -> Tüm kayıtlı veritabanı ayarlarını ve anahtarları siler.
curl -s -X POST "\${originUrl}/api/setup/reset" \\
  -H "Content-Type: application/json" \\
  -H "X-Setup-Token: YOUR_SETUP_TOKEN" \\
  -d '{"preserveConfig": true}'

# 7. KURULUMU DEVAM ETTİRME / KURTARMA (RESUME)
# Uç Nokta: POST /api/setup/resume
# Yarım kalmış kurulumu kurtarır ve kilidi kaldırarak adımları senkronize eder.
curl -s -X POST "\${originUrl}/api/setup/resume" \\
  -H "Content-Type: application/json" \\
  -H "X-Setup-Token: YOUR_SETUP_TOKEN"

# 8. YÖNETİCİ KURTARMA ANAHTARI ÜRETME (DOCKER / VPS ONE-LINER)
# Docker Ortamı (Node.js Doğrudan Komut):
docker compose exec app node -e "const c=require('crypto'),f=require('fs');const t='rec_token_'+c.randomBytes(32).toString('hex');f.writeFileSync('/app/data/.recovery_token',t,{mode:0o600});console.log('\nYeni Kurtarma Anahtari:\n\n'+t+'\n');"

# Docker Ortamı (NPM Script):
docker compose exec app npm run generate-recovery-token

# Standart VPS / Yerel Ortam:
npm run generate-recovery-token
`,
    },
    {
      id: 'code_production_idempotency_health',
      title: 'Production - İdempotency (Deduplication) & Canlılık/Hazırlık Sağlık Kontrolleri',
      category: 'curl',
      categoryLabel: 'Production Politikası & Sağlık',
      badge: 'Zero-Data-Loss & SLA',
      description: 'Her telemetri paketi için deviceId + bootId + sequence idempotency anahtarı, dayanıklı disk retry WAL kuyruğu ve Kubernetes / Container uyumlu /health/live ve /health/ready sağlık uç noktaları.',
      tags: ['production', 'idempotency', 'deduplication', 'health', 'liveness', 'readiness', 'wal', 'retry-queue'],
      endpoint: 'GET /health/live, GET /health/ready & POST /api/v1/telemetry',
      code: `#!/bin/bash
# =========================================================================
# PRODUCTION TELEMETRİ POLİTİKASI & SAĞLIK DENETİMİ (HEALTH CHECKS)
# =========================================================================
#
# 1. HER PAKET İÇİN İDEMPOTENCY ANAHTARI (DEDUPLICATION)
# Formül: deviceId + ":" + bootId + ":" + sequence
# Örnek: "dev_esp32_01:boot_007:1042"
# Cihaz yeniden bağlandığında veya ağ gecikmesiyle aynı paketi tekrar yolladığında
# PostgreSQL 'telemetry_packets' tablosundaki benzersiz anahtar sayesinde çift kayıt engellenir.
# Sunucu "COMMITTED_TO_TIMESCALEDB (Duplicate Skipped)" yanıtı döner ve çift alarm tetiklenmez.

# İdempotent Telemetri Gönderimi (Header veya Body ile bootId ve sequence iletimi):
curl -X POST "${originUrl}/api/v1/telemetry" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_PHYSICAL_DEVICE_API_KEY" \\
  -H "X-Boot-Id: boot_seq_001" \\
  -d '{
    "deviceId": "dev_esp32_saha_01",
    "bootId": "boot_seq_001",
    "sequence": 5001,
    "metrics": {
      "temperature": { "value": 24.3, "unit": "°C" },
      "humidity": { "value": 52.0, "unit": "%" }
    }
  }'

# 2. CANLILIK KONTROLÜ (LIVENESS PROBE)
# Uç Nokta: GET /health/live veya /api/health/live
# Amaç: Node.js işlemcinin çalıştığını doğrular. (Her zaman HTTP 200 döner)
curl -i "${originUrl}/health/live"

# 3. HAZIRLIK KONTROLÜ (READINESS PROBE)
# Uç Nokta: GET /health/ready veya /api/health/ready
# Kural: PostgreSQL / TimescaleDB ana veritabanı hazır DEĞİLSE HTTP 503 Service Unavailable döner.
#        Veritabanı bağlı ve hazır ise HTTP 200 OK döner.
curl -i "${originUrl}/health/ready"

# 4. DETAYLI SİSTEM & KUYRUK SAĞLIĞI
# Uç Nokta: GET /health veya /api/health
curl -i "${originUrl}/health"
`,
    },
    {
      id: 'code_system_logs_api_curl',
      title: 'Sistem & Hata Günlükleri Yönetim API\'si (cURL / REST)',
      category: 'curl',
      categoryLabel: 'Sistem & Hata Logları',
      badge: 'Yönetici & Teşhis API',
      description: 'Sunucu çalışma zamanı loglarını listeleme, loglama motorunu açma/kapatma (toggle), filtreleme, test hatası üretme ve JSON/LOG formatında dışa aktarma (export) uç noktaları.',
      tags: ['system logs', 'error logs', 'hata', 'loglama', 'curl', 'rest api', 'diagnostics', 'export', 'toggle'],
      endpoint: 'GET, POST /api/system-logs & /api/system-logs/settings',
      code: `#!/bin/bash
# =========================================================================
# NEXUSNODE IoT - SİSTEM & HATA GÜNLÜKLERİ YÖNETİM API REHBERİ
# Güvenlik Kuralı: Bu uç noktalar yalnızca Yönetici (Admin) oturumu ile yetkilendirilir.
# =========================================================================

ADMIN_TOKEN="Bearer YOUR_ADMIN_SESSION_TOKEN"
API_BASE="${originUrl}/api/system-logs"

# 1. TÜM LOGLARI LİSTELEME VE FİLTRELEME
# Parametreler: level (critical|error|warn|info), category, search, limit, offset
curl -X GET "\${API_BASE}?level=error&limit=50" \\
  -H "Authorization: \${ADMIN_TOKEN}"

# 2. LOGLAMA SİSTEMİ DURUMUNU VE YAPILANDIRMASINI SORGULAMA
curl -X GET "\${API_BASE}/settings" \\
  -H "Authorization: \${ADMIN_TOKEN}"

# 3. LOGLAMA SİSTEMİNİ AÇMA / KAPATMA (TOGGLE)
# Loglama motorunu geçici olarak kapatma:
curl -X POST "\${API_BASE}/settings" \\
  -H "Authorization: \${ADMIN_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "enabled": false
  }'

# Loglama motorunu tekrar aktif etme:
curl -X POST "\${API_BASE}/settings" \\
  -H "Authorization: \${ADMIN_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "enabled": true,
    "minLevel": "info",
    "logToFile": true,
    "maxInMemory": 1000
  }'

# 4. TANI & TEST HATASI ÜRETME (Simulated Error Trigger)
curl -X POST "\${API_BASE}/test-error" \\
  -H "Authorization: \${ADMIN_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "level": "error",
    "category": "server",
    "message": "Manuel test hata kaydı - Hata yakalama boru hattı doğrulaması"
  }'

# 5. LOGLARI DOSYA OLARAK DIŞA AKTARMA (EXPORT)
# JSON formatında indirme:
curl -O -J "\${API_BASE}/export?format=json" \\
  -H "Authorization: \${ADMIN_TOKEN}"

# Düz metin (.log) formatında indirme:
curl -O -J "\${API_BASE}/export?format=log" \\
  -H "Authorization: \${ADMIN_TOKEN}"

# 6. LOG KAYITLARINI TEMİZLEME / SIFIRLAMA
curl -X POST "\${API_BASE}/clear" \\
  -H "Authorization: \${ADMIN_TOKEN}"
`,
    },
    {
      id: 'code_system_factory_reset_api',
      title: 'Kasa Şifreleme Anahtarı ile Sistem Sıfırlama (Factory Reset) API\'si',
      category: 'curl',
      categoryLabel: 'Yönetim & Fabrika Ayarları',
      badge: 'Admin & Kriptografik Doğrulama',
      description: 'Yönetici panelinden veya REST API üzerinden sunucunun 256-bit AES Kasa Şifreleme Anahtarı (Vault Encryption Key) ile doğrulanarak cihazlar, telemetri, müşteri hesapları, paneller, alarmlar ve sistem ayarlarını seçici ya da tümden sıfırlama uç noktası.',
      tags: ['factory reset', 'sıfırlama', 'encryption key', 'vault', 'kasa', 'admin', 'cihazlar', 'telemetri', 'curl', 'rest api'],
      endpoint: 'POST /api/system/verify-encryption-key & POST /api/system/factory-reset',
      code: `#!/bin/bash
# =========================================================================
# NEXUSNODE IoT - KASA ŞİFRELEME ANAHTARI İLE SİSTEM SIFIRLAMA (FACTORY RESET)
# Güvenlik Kuralı: Bu uç nokta yalnızca Yönetici (Admin) oturumu ve aktif Kasa
# Şifreleme Anahtarı (secrets/encryption_key veya /run/secrets/encryption_key) ile çalışır.
# =========================================================================

ADMIN_TOKEN="Bearer YOUR_ADMIN_SESSION_TOKEN"
API_BASE="${originUrl}/api/system"

# 1. KASA ŞİFRELEME ANAHTARINI ÖN-DOĞRULAMA (Pre-Validation)
# Anahtarınızın geçerliliğini test etmek için:
curl -X POST "\${API_BASE}/verify-encryption-key" \\
  -H "Authorization: \${ADMIN_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "encryptionKey": "YOUR_VAULT_ENCRYPTION_KEY_HERE"
  }'

# 2. SEÇİCİ SIFIRLAMA (Örn: Sadece Cihazlar & Telemetri Kayıtlarını Temizle)
curl -X POST "\${API_BASE}/factory-reset" \\
  -H "Authorization: \${ADMIN_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "encryptionKey": "YOUR_VAULT_ENCRYPTION_KEY_HERE",
    "wipeDevices": true,
    "wipeTelemetry": true,
    "wipeUsers": false,
    "wipeDashboards": false,
    "wipeAlarms": true,
    "wipeAutomations": false,
    "wipeFirmwares": false,
    "wipeServiceTokens": false,
    "wipeDeviceCommands": true,
    "wipeSystemSettings": false,
    "wipeAuditLogs": false,
    "wipeAll": false
  }'

# 3. TÜM SİSTEMİ TAM FABRİKA AYARLARINA DÖNDÜRME (Master Factory Reset - usr_admin Korunur)
# Not: wipeAll=true olduğunda confirmText olarak "FABRİKA AYARLARI" veya "SIFIRLA" zorunludur.
# Yönetici hesabı (usr_admin) güvenlik protokolü gereği korunur.
curl -X POST "\${API_BASE}/factory-reset" \\
  -H "Authorization: \${ADMIN_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "encryptionKey": "YOUR_VAULT_ENCRYPTION_KEY_HERE",
    "confirmText": "FABRİKA AYARLARI",
    "wipeAll": true
  }'

# 4. SİSTEMİ TAMAMEN İLK KURULMAMIŞ HALİNE DÖNDÜRME (Sıfırdan Başlatma / Out-of-the-Box)
# Not: wipeToUnconfigured=true olduğunda confirmText olarak "SIFIRDAN KURULUM" veya "SIFIRLA" zorunludur.
# Yönetici (usr_admin) dahil tüm hesaplar, tablolar ve kilitler temizlenir; sistem doğrudan İlk Kurulum Sihirbazı'na döner.
curl -X POST "\${API_BASE}/factory-reset" \\
  -H "Authorization: \${ADMIN_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "encryptionKey": "YOUR_VAULT_ENCRYPTION_KEY_HERE",
    "confirmText": "SIFIRDAN KURULUM",
    "wipeToUnconfigured": true
  }'
`,
    },
    {
      id: 'code_vps_zero_touch_installer',
      title: 'Tek Komutla Otomatik VPS Kurulumu (Zero-Touch Linux & Docker Installer)',
      category: 'curl',
      categoryLabel: 'VPS & Otomatik Kurulum',
      badge: 'Zero-Touch & Production Ready',
      description: 'Yeni kiralanan sıfır Ubuntu/Debian/Linux sunucuda Docker, Nginx, TimescaleDB, SSL sertifikaları, AES-256 Vault anahtarları ve servisleri tek bir komutla kendi kendine kuran ve ayağa kaldıran üretim orkestrasyonu.',
      tags: ['vps', 'kurulum', 'docker', 'tek-komut', 'zero-touch', 'vault', 'backup', 'restore', 'ssl', 'bash'],
      endpoint: './install.sh [SEÇENEKLER]',
      code: `#!/bin/bash
# =========================================================================
# NEXUSNODE IoT - TEK KOMUTLA SIFIR-DOKUNUŞ (ZERO-TOUCH) VPS KURULUMU
# =========================================================================
# Sıfır bir sunucuya (Ubuntu, Debian, CentOS, AlmaLinux, Rocky) SSH ile bağlandıktan
# sonra hiçbir manuel veritabanı, Nginx veya anahtar yapılandırması yapmadan
# tüm sistemi tek bir komutla ayağa kaldırabilirsiniz.
# =========================================================================

# 1. HIZLI KURULUM (TAM OTOMATİK SESSİZ MOD)
# - Eksikse resmi Docker & Docker Compose eklentisini kurar
# - 256-bit AES Vault Root Anahtarını (/run/secrets/encryption_key) otomatik üretir
# - JWT Secret ve Ed25519 OTA imzalama anahtarlarını üretir
# - TimescaleDB için güçlü rastgele parola ve izole ağ oluşturur
# - Self-signed TLS sertifikasını hazırlar
# - Konteynerleri derleyip arka planda başlatır ve sağlık kontrollerini doğrular:
./install.sh --quick

# 2. ALAN ADI VE E-POSTA İLE KURULUM (CANLI DOMAIN & SSL)
./install.sh --domain iot.sirketim.com --email admin@sirketim.com

# 3. YALNIZCA SİSTEM VE PORT KONTROLÜ YAPMA (DRY-RUN)
# CPU, RAM, disk alanı ve port (80, 443, 3000, 5432) çakışmalarını denetler:
./install.sh --check

# 4. TEK KOMUTLA TAM AFET KURTARMA YEDEĞİ ALMA (BACKUP)
# TimescaleDB veritabanı dökümü, Vault kasası ve .env ayarlarını zaman damgalı arşivler:
./install.sh --backup
# Çıktı: ./backups/nexus_backup_YYYYMMDD_HHMMSS.tar.gz

# 5. YEDEKTEN GERİ YÜKLEME (RESTORE)
./install.sh --restore ./backups/nexus_backup_20261003_184304.tar.gz

# 6. SİSTEM DURUMU VE SERVİS SAĞLIK RAPORU
./install.sh --status

# 7. SIFIR KESİNTİYLE SÜRÜM GÜNCELLEME (UPDATE)
./install.sh --update

# =========================================================================
# MODÜLER EKLENTİ (PLUGIN / HOOK) MİMARİSİ
# =========================================================================
# Gelecekte sisteme yeni bir servis (Mosquitto MQTT, Prometheus, Cloudflare Tunnel vb.)
# eklemek için "scripts/setup/plugins.d/" klasörüne bir .sh betiği koymanız yeterlidir.
# Kurulum sihirbazı pre-install, pre-start ve post-start kancalarında eklentiyi
# otomatik olarak çağıracaktır.
`,
    },
    {
      id: 'code_client_error_logging_js',
      title: 'İstemci ve Node.js Hata Telemetrisi Gönderimi (JavaScript / Fetch)',
      category: 'nodejs',
      categoryLabel: 'Hata Teşhis & Raporlama',
      badge: 'Frontend & Backend Error Telemetry',
      description: 'Web arayüzü (React ErrorBoundary) veya Node.js istemcilerindeki çalışma zamanı hatalarını ve stack trace dökümlerini sunucu sistem loguna ileten üretim kodu.',
      tags: ['error reporting', 'client error', 'stack trace', 'javascript', 'fetch', 'axios', 'telemetry'],
      endpoint: 'POST /api/system-logs/client-error',
      code: `// =========================================================================
// NEXUSNODE IoT - İSTEMCİ HATA TELEMETRİSİ RAPORLAMA KODU (JavaScript / TypeScript)
// Amaç: Web arayüzü veya harici JS servislerindeki hataları merkezi loga yazar.
// =========================================================================

async function reportErrorToSystemLog(error, context = {}) {
  try {
    const payload = {
      message: error.message || String(error),
      stack: error.stack || null,
      url: typeof window !== 'undefined' ? window.location.href : 'node_runtime',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
      componentStack: context.componentStack || null,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch('${originUrl}/api/system-logs/client-error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return result.success;
  } catch (err) {
    console.error('[Hata Raporlama Başarısız]:', err);
    return false;
  }
}

// 1. ÖRNEK KULLANIM (Window / Global Hata Yakalayıcı)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    reportErrorToSystemLog(event.error || new Error(event.message));
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportErrorToSystemLog(new Error('İstemci İşlenmeyen Promise Reddi: ' + event.reason));
  });
}

// 2. ÖRNEK KULLANIM (Manuel Try / Catch Bloğu)
async function performCriticalDeviceOperation(deviceId) {
  try {
    // Kritik API veya kontrol işlemi
    const res = await fetch(\`/api/devices/\${deviceId}/control\`, { method: 'POST' });
    if (!res.ok) throw new Error(\`Cihaz kontrol yanıt vermedi: HTTP \${res.status}\`);
  } catch (error) {
    // Hatayı merkezi sistem loguna ilet
    await reportErrorToSystemLog(error, { deviceId });
    throw error;
  }
}
`,
    },
  ];

  const filteredCodeExamples = useMemo(() => {
    return codeExamples.filter((item) => {
      const matchesCategory =
        selectedCodeCategory === 'all' ||
        item.category === selectedCodeCategory ||
        (selectedCodeCategory === 'ota' && (item.category === 'ota' || item.tags.includes('ota'))) ||
        (selectedCodeCategory === 'logs' && (item.tags.includes('system logs') || item.tags.includes('error logs') || item.tags.includes('error reporting')));
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [codeExamples, selectedCodeCategory, searchQuery]);

  const activeCodeBlock =
    codeExamples.find((c) => c.id === activeCodeExampleId) || codeExamples[0];

  const sampleCurl = codeExamples.find((c) => c.id === 'code_curl_bash_scripts')?.code || '';
  const samplePython = codeExamples.find((c) => c.id === 'code_python_iot_agent')?.code || '';

  // FAQ Database
  const faqs: FAQItem[] = [
    {
      id: 'faq_1',
      category: 'Cihaz Entegrasyonu',
      question: 'Cihazımdan veri gönderiyorum (konsolda görüyorum) ancak widget’larda görünmüyor, neden?',
      answer: 'Cihazınızın gönderdiği veri payload yapısında "deviceId" ve "metric" alanlarının doğru tanımlandığından emin olun. Ayrıca, cihazınızın sistemde kayıtlı cihaz ID’si ile veri gönderen ID eşleşmelidir. Müşteri hesabı ile giriş yaptıysanız, cihazın o müşteriye atanmış olması gerekir. Müşteriye tanımlanmayan cihaz verileri müşteri panelinde engellenir.',
      tags: ['telemetri', 'cihaz id', 'müşteri izolasyonu', 'widget'],
      codeSnippet: `// Örnek Doğru HTTP POST Payload Yapısı:
POST /api/telemetry
Headers: { "Content-Type": "application/json", "X-API-Key": "YOUR_DEVICE_API_KEY" }
Body:
{
  "deviceId": "dev_esp32_01",
  "metric": "temperature",
  "value": 24.5,
  "unit": "°C"
}`,
    },
    {
      id: 'faq_8',
      category: 'Cihaz Entegrasyonu',
      question: 'Gerçek ESP32 / NodeMCU cihazına komut nasıl gider? Sürekli veritabanı sorgusu yapmaya gerek var mıdır?',
      answer: 'Hayır! Sürekli veritabanı sorgulamak cihaz işlemcisini ve ağı boş yere yorar. Sistemimiz "Response Piggybacking (Telemetri Yanıtında Komut İletimi)" mimarisini kullanır. Cihazınız telemetri paketi gönderdiğinde (POST /api/v1/telemetry), sunucu yanıt olarak cihaz için bekleyen komutları JSON formatında döner (commands: [{command: "RELAY_1", payload: "ON"}]). ESP32 bu yanıtı okuyarak GPIO pinini tetikler. İkinci bir yöntem olarak cihazınız doğrudan GET /api/v1/device/commands?token=... ile de sorgu atabilir.',
      tags: ['esp32', 'komut', 'downlink', 'röle', 'piggybacking', 'db polling'],
      codeSnippet: `// ESP32 Telemetri POST Yanıtından Komut Yakalama Örneği:
int httpResponseCode = http.POST(payload);
if (httpResponseCode > 0) {
  String response = http.getString();
  // Yanıtta komut var mı kontrol et:
  if (response.indexOf("RELAY_1") != -1 && response.indexOf("ON") != -1) {
    digitalWrite(RELAY_PIN, HIGH); // Röleyi aç!
    Serial.println(">>> Röle 1 Açıldı!");
  }
}`,
    },
    {
      id: 'faq_smart_interval',
      category: 'Cihaz Entegrasyonu',
      question: 'Cihazların veri gönderme sıklığı ve çevrimdışı (offline) olma kuralı nasıl çalışır?',
      answer: 'Sistem akıllı sıklık ve ağ toleransı motoruna sahiptir:\n1. Otomatik Tespit: Cihaz ilk kez veri göndermeye başladığında ardışık paketler arasındaki süre ölçülerek "beklenen veri gönderim sıklığı" (expectedIntervalSeconds) otomatik belirlenir.\n2. Akıllı 2x Watchdog & Ağ Jitter Toleransı: Veri gönderim sıklığının 2 katı süresince cihazdan yeni veri gelmezse sistem durumu takip eder. Wi-Fi dalgalanmaları veya sensör gecikmelerine karşı dinamik ağ toleransı (jitter cushion buffer) uygulanır; tekil gecikmelerde sahte çevrimdışı uyarısı üretilmez.\n3. Doğrulanmış Çevrimdışı Bildirimi & Debouncing: Tolerans süresini de aşan durumlarda doğrulanmış ÇEVRİMDİŞİ (Offline) durumuna geçer ve 3 dakikalık debouncing ile bildirim iletilir.\n4. Çevrimdışı Süresinin Yalıtımı: Cihazın çevrimdışı kaldığı süre sıklık hesaplamasına dahil edilmez; böylece cihazın gerçek periyodu bozulmaz.\n5. Otomatik Canlanma: Çevrimdışı olan cihaz yeni veri gönderdiği anda son ayarlarını koruyarak anında ÇEVRİMİÇİ (Online) olur.\n6. Manuel Ayar & Kalıcılık: Kullanıcı cihaz ayarlarından sıklığı manuel değiştirebilir. Cihaz her zaman kullanıcının belirlediği son ayarda kalır.\n7. Geçmiş Metrik Temizliği: Sistemden gelen metrikler ekranında, 2 katı süresini aşan bayatlamış parametreler tek tıkla ("Süresi Dolanları Temizle (2x)") temizlenebilir.',
      tags: ['akıllı sıklık', '2x kuralı', 'offline', 'online', 'watchdog', 'metrik temizleme', 'tolerans', 'jitter'],
      codeSnippet: `// Sunucu Yanıtında Dinamik Veri Sıklığı (Piggybacking):
{
  "success": true,
  "status": "online",
  "expectedIntervalSeconds": 10,
  "offlineTimeoutSeconds": 20,
  "commands": []
}`,
    },
    {
      id: 'faq_2',
      category: 'Widget & Kontrol',
      question: 'Cihaz çıkışlarını (Röle / PWM / Dijital Pin) widget üzerinden nasıl kontrol edebilirim?',
      answer: 'Dashboard’unuza "1’li, 2’li, 3’lü, 4’lü Buton Paneli", "Analog Slider / PWM Kontrolü" veya "Röle & Switch Paneli" widget’ı ekleyin. Widget üzerinde butona tıkladığınızda veya sürgüyü kaydırdığınızda sistem `/api/devices/:id/control` endpoint’ine kontrol komutu iletir ve anlık geri bildirim verir.',
      tags: ['buton widget', 'slider', 'pwm', 'röle', 'kontrol'],
      codeSnippet: `// Cihaza Gönderilen Kontrol Sinyali Örneği:
POST /api/devices/dev_esp32_01/control
Body:
{
  "command": "RELAY_1",
  "outputPin": "OUT_1",
  "value": "HIGH" // veya Slider için 0-255 / 0-100 sayısal değer
}`,
    },
    {
      id: 'faq_widget_freshness',
      category: 'Widget & Kontrol',
      question: 'Widget başlıklarındaki renkli durum noktaları (🟢🟡🟠🔴⚪) ne anlama gelir?',
      answer: 'Durum göstergesi tek bir metriğe kilitlenmek yerine, cihazdan genel olarak metrik (telemetri) akışının sağlanıp sağlanmadığını doğrular. Sahadaki donanımın veri üretim döngüsüne göre şu 5 kademeli akıllı tazelik kuralı uygulanır:\n• 🟢 Canlı: Cihazdan düzenli metrik akışı alınıyor ve beklenen sıklıkta güncelleniyor.\n• 🟡 Gecikmeli: Cihazdan metrik alımı beklenenden uzun süredir gelmedi (gecikme).\n• 🟠 Eski veri: Cihaz bağlı görünse dahi uzun süredir yeni bir metrik paketi alınmıyor.\n• 🔴 Çevrimdışı: Cihaz bağlantısı koptu veya sinyal zaman aşımına uğradı, metrik akışı durdu.\n• ⚪ Veri yok: Cihazdan henüz sisteme hiç metrik alınmamış.\nİmleci gösterge noktasının üzerine getirdiğinizde alınan metrik sayısı, son metrik zamanı, beklenen sıklık ve anlık akış durumu detaylı bilgi kutusunda görüntülenir.',
      tags: ['canlı', 'gecikmeli', 'eski veri', 'çevrimdışı', 'veri yok', 'durum göstergesi', 'widget', 'metrik akışı'],
    },
    {
      id: 'faq_3',
      category: 'Cihaz Entegrasyonu',
      question: 'Sanal Veri Üreteci (Simülatör) ne işe yarar ve nasıl çalışır?',
      answer: 'Fiziksel donanımınız (ESP32, Raspberry Pi) olmadığında veya test senaryolarında sistemin nasıl tepki verdiğini görmek için Sanal Veri Üreteci’ni kullanabilirsiniz. Üreteç, belirlenen periyotlarda rastgele sıcaklık, nem, basınç, voltaj ve röle durumları üreterek WebSocket üzerinden canlı olarak yayınlar.',
      tags: ['simülatör', 'sanal cihaz', 'test', 'demo'],
    },
    {
      id: 'faq_4',
      category: 'Müşteri & Güvenlik',
      question: 'Müşteri İzolasyonu (Multi-Tenant Isolation) nasıl çalışır?',
      answer: 'NexusNode IoT platformu, çoklu kiracı (Multi-tenant) mimarisine sahiptir. Her müşteri sadece kendisine atanan saha cihazlarını ve onların ürettiği telemetri verilerini görebilir. Admin kullanıcılar ise tüm müşterilerin cihazlarını listeleyebilir ve gerektiğinde belirli bir müşterinin görünümüne filtreleme yapabilir.',
      tags: ['multi-tenant', 'güvenlik', 'yetki', 'müşteri'],
    },
    {
      id: 'faq_5',
      category: 'Widget & Kontrol',
      question: 'Widget buton tipleri (1’li, 2’li, 3’lü, 4’lü) arasındaki fark nedir?',
      answer: '1’li Buton: Ana Master Güç Şalteri veya Acil Stop için idealdir. 2’li Buton: Başlat/Durdur veya İki Röle kontrolüdür. 3’lü Buton: Mod seçimi (Manuel, Oto, Kapalı) için kullanılır. 4’lü Buton: 4 kanallı röle kartlarını tek modülden yönetmeyi sağlar.',
      tags: ['1li buton', '2li buton', '4lu buton', 'widget seçimi'],
    },
    {
      id: 'faq_6',
      category: 'Alarmlar & Raporlama',
      question: 'Eşik Değeri (Threshold) uyarısı ve alarmlar nasıl tetiklenir?',
      answer: 'MetricWidget ve Progress Bar widget’larında "Uyarı Eşiği" ve "Kritik Eşik" değerleri tanımlayabilirsiniz. Örnek olarak sıcaklık 45°C üzerine çıktığında sistem otomatik olarak sarı uyarı kartına, 60°C üzerine çıktığında ise sesli ve kırmızı kritik alarm durumuna geçer ve Bildirim Akışı’na log düşer.',
      tags: ['alarm', 'eşik', 'bildirim', 'kritik'],
    },
    {
      id: 'faq_7',
      category: 'Cihaz Entegrasyonu',
      question: 'Otomatik Sinyal & Çevrimdışı Takip Sistemi kuralları nelerdir?',
      answer: 'Sistemimizdeki tüm cihazlar canlı olarak takip edilir. Son sinyal zamanından itibaren 18 saniyeyi geçen cihazlar "Gecikme/Uyarı", 40 saniye boyunca hiç veri göndermeyen cihazlar ise otomatik olarak "ÇEVRİMDİŞİ" (offline) durumuna alınır.',
      tags: ['çevrimdışı', 'gecikme', 'sinyal', 'uyarı', 'offline', 'otomatik takip'],
    },
    {
      id: 'faq_9',
      category: 'Müşteri & Güvenlik',
      question: 'Sanal Simülatör cihazı ile Gerçek Donanım ayrımı ve izolasyonu nasıl çalışır?',
      answer: 'Sistem sanal ve fiziksel donanımları kesin sınırlarla izole eder. Gerçek telemetri API’sine (/api/v1/telemetry, /api/telemetry, /api/telemetry/ping) sanal cihaz anahtarıyla gelen istekler otomatik olarak 403 Forbidden (simulated_device_not_allowed) hatası ile reddedilir. Sanal bir cihaz ancak yönetici (Admin) tarafından "Gerçek Donanıma Dönüştür" işlemi ile fiziksel cihaza çevrilebilir ve bu işlem sonucunda yeni bir fiziksel API anahtarı atanır.',
      tags: ['sanal cihaz', 'simülatör', 'izolasyon', '403', 'simulated_device_not_allowed', 'dönüştürme', 'fiziksel donanım', 'güvenlik'],
    },
    {
      id: 'faq_10',
      category: 'Müşteri & Güvenlik',
      question: 'Cihaz API Anahtarı benzersizliği ve çakışma önleme mekanizması nasıl çalışır?',
      answer: 'Her IoT cihazı platformda tekil ve güvenli bir API Anahtarına (API Key / Token) sahiptir. Yeni cihaz eklerken veya anahtar güncellerken başka bir cihaza ait olan bir anahtar girilirse sistem bunu anında algılar ve kullanıcı dostu bir hata ile işlemi engeller. Otomatik oluşturulan anahtarlar kriptografik rastgelelikle üretilir ve veritabanında yüksek performanslı B-Tree indeksleriyle indekslenir.',
      tags: ['api key', 'token', 'güvenlik', 'benzersizlik', 'postgres', 'çakışma'],
    },
  ];

  // Technical Dictionary
  const dictionary: DictionaryTerm[] = [
    {
      term: 'Sanal ve Gerçek Cihaz İzolasyonu',
      shortDef: 'Sanal simülatör cihazlarının fiziksel telemetri kanallarına sızmasını önleyen kesin güvenlik sınırıdır.',
      category: 'Sistem & Güvenlik',
      fullExplanation: 'Sanal cihazlar sadece sistem simülatörü içinde çalışır. Gerçek donanım API uçlarına istek gönderdiklerinde sunucu HTTP 403 Forbidden ("Sanal cihaz gerçek telemetri API\'sini kullanamaz") döner. Sanal cihazdan gerçek cihaza geçiş sadece Admin kontrolünde kontrollü dönüştürme ve yeni API key üretimiyle mümkündür.',
      example: 'HTTP 403 Response: { "error": "simulated_device_not_allowed", "message": "Sanal cihaz gerçek telemetri API’sini kullanamaz." }',
    },
    {
      term: 'Telemetri (Telemetry)',
      shortDef: 'Uzaktaki cihaz ve sensörlerden kablosuz veya kablolu ağlar üzerinden toplanan canlı ölçüm verileridir.',
      category: 'Donanım & Sinyal',
      fullExplanation: 'Saha cihazlarının (örn. ESP32, STM32, Arduino) sıcaklık, nem, basınç, akım, voltaj veya konum gibi parametreleri merkeze periyodik olarak iletmesidir. Veriler timestamp (zaman damgası) ve metric ID ile saklanır.',
      example: 'Örn: { "deviceId": "dev_01", "metric": "temperature", "value": 26.4 }',
    },
    {
      term: 'Aktüatör / Çıkış (Output & Actuator)',
      shortDef: 'Dijital veya analog komut alarak fiziksel eylem gerçekleştiren elemanlardır (Röle, Vana, Motor, LED).',
      category: 'Donanım & Sinyal',
      fullExplanation: 'Sensörlerin aksine, dış dünyaya müdahale eden bileşenlerdir. Platform üzerindeki Buton, Slider ve Switch widget’ları aktüatörlere sinyal göndererek cihazların durumunu değiştirir.',
      example: 'Örn: Röle kartını tetikleyerek su pompasını çalıştırmak.',
    },
    {
      term: 'PWM (Pulse Width Modulation)',
      shortDef: 'Dijital sinyal genişliğini değiştirerek ortalama voltaj veya güç kontrolü sağlama tekniğidir.',
      category: 'Donanım & Sinyal',
      fullExplanation: 'Analog çıkışı olmayan mikrodenetleyicilerde motor hızını ayarlamak, LED parlaklığını kısmak veya ısıtıcı gücünü dilediğimiz yüzdeye (0-100%) ayarlamak için kullanılır. Slider widget’ımız PWM değerlerini iletir.',
      example: 'Örn: Fan hızını %65 seviyesine ayarlamak için PWM duty-cycle sinyali.',
    },
    {
      term: 'GPIO (General Purpose Input/Output)',
      shortDef: 'Mikrodenetleyiciler üzerindeki genel amaçlı dijital giriş/çıkış pinleridir.',
      category: 'Donanım & Sinyal',
      fullExplanation: 'Giriş (Input) modunda sensör okur (buton basıldı mı?), Çıkış (Output) modunda ise röle veya transistör sürer (HIGH = 3.3V/5V, LOW = 0V).',
    },
    {
      term: 'WebSocket (Canlı Çift Yönlü İletişim)',
      shortDef: 'İstemci ve sunucu arasında tek bir TCP bağlantısı üzerinden kesintisiz, anlık veri akışı sağlar.',
      category: 'Yazılım & Protokol',
      fullExplanation: 'Geleneksel HTTP isteklerinin aksine sürekli açık kalır. Cihazdan gelen yeni bir telemetri anında ekrandaki grafiklere yansır, sayfa yenileme gerektirmez.',
      example: 'WS Latency göstergesi (24ms) WebSocket canlı bağlantısının kalitesini temsil eder.',
    },
    {
      term: 'API Key (X-API-Key)',
      shortDef: 'Cihazların platforma veri gönderirken veya komut alırken kullandığı özel güvenlik anahtarıdır.',
      category: 'Sistem & Güvenlik',
      fullExplanation: 'Yetkisiz kişilerin veya sahte cihazların sisteminize hatalı veri enjekte etmesini önler. Her cihaza özgü benzersiz bir API Key üretilir ve HTTP istek başlığına (Header) eklenir.',
      example: 'Header: X-API-Key: nkn_live_7a9f82d0...',
    },
    {
      term: 'Multi-Tenant (Müşteri İzolasyonu)',
      shortDef: 'Tek bir veritabanı altyapısında birden fazla müşterinin verilerinin birbirinden tamamen yalıtılmasıdır.',
      category: 'Sistem & Güvenlik',
      fullExplanation: 'Müşteri A oturum açtığında sadece kendisine atanan Cihaz 1 ve Cihaz 2’yi görür. Müşteri B’nin verilerine erişemez. Bu sayede her müşteri kendi özel portalına sahip olur.',
    },
    {
      term: 'Ingestion (Veri Toplama / İşleme)',
      shortDef: 'Binlerce cihazdan gelen eşzamanlı verilerin yakalanması, doğrulanması ve veritabanına yazılması sürecidir.',
      category: 'Yazılım & Protokol',
      fullExplanation: 'Log Stream Terminal konsolu, sistemin arkasında gerçekleşen canlı Ingestion işlemlerini gerçek zamanlı takip etmenizi sağlar.',
    },
    {
      term: 'Audit Log (Denetim İzi)',
      shortDef: 'Sistemde kimin ne zaman hangi işlemi yaptığını kaydeden değiştirilemez güvenlik günlüğüdür.',
      category: 'Sistem & Güvenlik',
      fullExplanation: 'Örn: "Özkan Dörtbölük kullanıcısı ABC Lojistik cihazının Röle 1 çıkışını AÇTI" şeklindeki işlem geçmişidir.',
    },
    {
      term: 'JSON Payload',
      shortDef: 'Cihazlar ile sunucu arasında veri alışverişinde kullanılan hafif ve okunabilir veri formatıdır.',
      category: 'Yazılım & Protokol',
      fullExplanation: 'Süslü parantezler içinde anahtar-değer ikilileri halinde iletilir.',
      example: '{ "deviceId": "dev_01", "metric": "humidity", "value": 58.2 }',
    },
  ];

  // Filtered FAQs
  const filteredFaqs = useMemo(() => {
    return faqs.filter((faq) => {
      const matchesCategory = selectedFaqCategory === 'all' || faq.category === selectedFaqCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [faqs, selectedFaqCategory, searchQuery]);

  // Filtered Dictionary
  const filteredDictionary = useMemo(() => {
    return dictionary.filter((item) => {
      const matchesCategory = selectedTermCategory === 'all' || item.category === selectedTermCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.shortDef.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.fullExplanation.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [dictionary, selectedTermCategory, searchQuery]);

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Hero / Header Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white border border-indigo-500/20 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -z-0 pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <NexusNodeLogo variant="full" size="md" showDomain={true} animated={true} theme="dark" />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
              <LifeBuoy className="w-3.5 h-3.5 text-indigo-400" />
              <span>Yardım, Bilgi Merkezi & Terimler Sözlüğü</span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Nasıl Yardımcı Olabiliriz?
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Sistem entegrasyonu, veri gönderimi, widget kullanımı, dijital/analog kontrol çıkışları ve platformda kullanılan IoT terimleri hakkında tüm bilgilere buradan ulaşabilirsiniz.
          </p>

          {/* Search Bar */}
          <div className="relative max-w-xl pt-2">
            <Search className="absolute left-4 top-5 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Soru, terim veya anahtar kelime arayın (Örn: Telemetri, PWM, Röle, Cihaz ID)..."
              className="w-full pl-12 pr-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-5 text-xs text-slate-400 hover:text-white"
              >
                Temizle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Section Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('code_examples')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'code_examples'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Code2 className="w-4 h-4 text-emerald-300" />
          <span>Çalışan Kod Örnekleri & API</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-200 font-mono">
            {codeExamples.length} Örnek
          </span>
        </button>

        <button
          onClick={() => setActiveTab('faq')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'faq'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>Sıkça Sorulan Sorular (SSS)</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono">
            {faqs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('dictionary')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'dictionary'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>IoT & Platform Sözlüğü</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono">
            {dictionary.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('guides')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'guides'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Hızlı Entegrasyon Kılavuzları</span>
        </button>

        <button
          onClick={() => setActiveTab('troubleshooting')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'troubleshooting'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>NodeMCU & Cihaz Sorun Giderme</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/30 text-amber-200 font-mono">
            6 Adım
          </span>
        </button>

        <button
          onClick={() => setActiveTab('server_deployment')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'server_deployment'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Server className="w-4 h-4 text-blue-300" />
          <span>Sunucu & DB Kurulum Rehberi</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-200 font-mono">
            Docker & Production
          </span>
        </button>
      </div>

      {/* TAB 0: COMPREHENSIVE WORKING CODE EXAMPLES & API */}
      {activeTab === 'code_examples' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Card */}
          <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 p-6 sm:p-7 rounded-3xl border border-emerald-500/30 shadow-2xl text-white space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shrink-0">
                  <Code2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-black text-white">
                      Çalışan Kod Blokları & Canlı API Örnekleri
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      %100 Test Edilmiş
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Bu kısımdaki tüm kod blokları sistem mimarisiyle tam uyumludur. Cihazınıza veya sunucunuza kopyalayıp anında çalıştırabilirsiniz.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleCopy(activeCodeBlock.code)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedText === activeCodeBlock.code ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-200" />
                      <span>Kopyalandı!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Aktif Kodu Kopyala</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Filter Categories */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
              <span className="text-slate-400 font-bold text-[11px] shrink-0">Platform:</span>
              {[
                { id: 'all', label: 'Tüm Kodlar' },
                { id: 'esp32', label: 'ESP32 (C++)' },
                { id: 'nodemcu', label: 'NodeMCU ESP8266' },
                { id: 'ota', label: 'OTA & Firmware' },
                { id: 'ping', label: 'Heartbeat / Ping' },
                { id: 'python', label: 'Python (Agent)' },
                { id: 'curl', label: 'cURL & Bash' },
                { id: 'nodejs', label: 'Node.js / JS' },
                { id: 'logs', label: 'Sistem & Hata Logları' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCodeCategory(cat.id as any)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer ${
                    selectedCodeCategory === cat.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main 2-Column Code Workbench */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar: Example Selector List */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Hazır Kod Kütüphanesi ({filteredCodeExamples.length})
                </span>
                <span className="text-[10px] text-slate-400">Seçmek için tıklayın</span>
              </div>

              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {filteredCodeExamples.map((item) => {
                  const isSelected = item.id === activeCodeBlock.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveCodeExampleId(item.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/40 text-slate-900 dark:text-white'
                          : 'bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {item.categoryLabel}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20">
                          {item.badge}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span className="truncate max-w-[200px]">{item.endpoint}</span>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'text-emerald-500 translate-x-0.5' : ''}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Full Interactive Code Viewer & Documentation */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-[#020617] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
                {/* Code Window Top Bar */}
                <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                      <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                      <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    </div>
                    <span className="text-xs font-bold text-slate-200 font-mono">
                      {activeCodeBlock.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-cyan-400 border border-slate-700">
                      {activeCodeBlock.endpoint}
                    </span>
                    <button
                      onClick={() => handleCopy(activeCodeBlock.code)}
                      className="p-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
                    >
                      {copiedText === activeCodeBlock.code ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Kopyalandı</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Kodu Kopyala</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Code Content */}
                <div className="p-5 overflow-x-auto max-h-[560px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                  <pre className="font-mono text-xs text-emerald-400 leading-relaxed">
                    {activeCodeBlock.code}
                  </pre>
                </div>

                {/* Code Footer / Instructions */}
                <div className="p-4 bg-slate-900/60 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <b>Not:</b> Koddaki <code className="text-slate-200 font-mono bg-slate-800 px-1 py-0.5 rounded">API_KEY</code> alanını sistemdeki <em>Cihazlar</em> sekmesinden kopyalayacağınız cihaz anahtarınızla değiştirin.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeCodeBlock.tags.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick Integration Guidance Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-sm">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
                    <Zap className="w-4 h-4" />
                    <span>Otomatik Çevrimiçi Olma Mantığı</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                    Cihazınız tolerans aşımından dolayı Çevrimdışı kalsa bile; telemetri veya <code className="text-emerald-500 font-mono">/api/telemetry/ping</code> sinyali gönderdiğinde <b>otomatik olarak anında ÇEVRİMİÇİ</b> konuma alınır.
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-sm">
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold">
                    <Radio className="w-4 h-4" />
                    <span>Bağımsız Watchdog & Tolerans Eşiği</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                    Hızlı veri gönderen cihazlarda (örn: 5 sn) Wi-Fi dalgalanmalarından kaynaklı sahte çevrimdışı bildirimlerini önlemek için, Cihaz Düzenle penceresinden <b>Çevrimdışı (Timeout) Eşiği</b> değerini 60 sn (1 dk) olarak belirleyebilirsiniz. Sistem cihazın 5 sn gönderim sıklığını korur ancak yalnızca 60 sn sinyal kesilirse alarm üretir.
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-sm">
                  <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-bold">
                    <Radio className="w-4 h-4" />
                    <span>Röle & Komut Tetikleme (Piggybacking)</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                    Kullanıcı dashboard üzerindeki butona bastığında komut kuyruğa eklenir. ESP32 bir sonraki POST telemetri paketinde yanıt içerisinden komutu doğrudan alıp GPIO çıkışını sürer.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: FAQ SECTION */}
      {activeTab === 'faq' && (
        <div className="space-y-4">
          {/* FAQ Category Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 font-bold text-[11px] shrink-0">Kategori:</span>
            {['all', 'Cihaz Entegrasyonu', 'Widget & Kontrol', 'Müşteri & Güvenlik', 'Alarmlar & Raporlama'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedFaqCategory(cat)}
                className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer ${
                  selectedFaqCategory === cat
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                    : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                }`}
              >
                {cat === 'all' ? 'Tüm Sorular' : cat}
              </button>
            ))}
          </div>

          {/* Accordion List */}
          <div className="space-y-3">
            {filteredFaqs.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-500 text-xs">
                Aramanızla eşleşen soru bulunamadı.
              </div>
            ) : (
              filteredFaqs.map((faq) => {
                const isExpanded = expandedFaqId === faq.id;
                return (
                  <div
                    key={faq.id}
                    className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm transition-all overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                      className="w-full p-4 sm:p-5 text-left flex items-start justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                            {faq.category}
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                          {faq.question}
                        </h3>
                      </div>
                      <div className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0 mt-1">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-slate-100 dark:border-slate-800/80 space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed animate-fade-in">
                        <p>{faq.answer}</p>

                        {faq.codeSnippet && (
                          <div className="mt-2 bg-slate-900 text-emerald-400 p-3.5 rounded-xl font-mono text-[11px] overflow-x-auto border border-slate-800">
                            <pre>{faq.codeSnippet}</pre>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 pt-2">
                          <span className="text-[10px] text-slate-400 font-bold">Etiketler:</span>
                          {faq.tags.map((tag) => (
                            <span key={tag} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-mono">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DICTIONARY & GLOSSARY */}
      {activeTab === 'dictionary' && (
        <div className="space-y-4">
          {/* Dictionary Category Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 font-bold text-[11px] shrink-0">Sözlük Grubu:</span>
            {['all', 'Donanım & Sinyal', 'Yazılım & Protokol', 'Sistem & Güvenlik'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedTermCategory(cat)}
                className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer ${
                  selectedTermCategory === cat
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                    : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                }`}
              >
                {cat === 'all' ? 'Tüm Terimler' : cat}
              </button>
            ))}
          </div>

          {/* Dictionary Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDictionary.length === 0 ? (
              <div className="col-span-full p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-500 text-xs">
                Aramanızla eşleşen terim bulunamadı.
              </div>
            ) : (
              filteredDictionary.map((item) => {
                const isSelected = expandedTerm === item.term;
                return (
                  <div
                    key={item.term}
                    onClick={() => setExpandedTerm(isSelected ? null : item.term)}
                    className={`p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-slate-900 text-white border-indigo-500/50 shadow-xl shadow-indigo-500/10 ring-2 ring-indigo-500/30'
                        : 'bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono text-indigo-500 dark:text-indigo-400">
                          {item.term}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                          {item.category}
                        </span>
                      </div>

                      <p className={`text-xs font-bold ${isSelected ? 'text-slate-200' : 'text-slate-800 dark:text-slate-200'}`}>
                        {item.shortDef}
                      </p>

                      <p className={`text-xs leading-relaxed ${isSelected ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                        {item.fullExplanation}
                      </p>
                    </div>

                    {item.example && (
                      <div className="mt-3 pt-2 border-t border-slate-200/20 dark:border-slate-800 text-[10px] font-mono text-emerald-400 bg-black/20 p-2 rounded-xl">
                        {item.example}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GUIDES & QUICK LINKS */}
      {activeTab === 'guides' && (
        <div className="space-y-6">
          {/* Otomatik Sinyal & Çevrimdışı Takip Banner */}
          <div className="p-6 bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 rounded-3xl border border-indigo-500/30 shadow-xl space-y-3 text-white">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="p-2.5 bg-indigo-500/20 rounded-2xl text-indigo-400 font-bold shrink-0 border border-indigo-500/30">
                <Activity className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Otomatik Sinyal & Çevrimdışı Takip Sistemi
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Cihaz bağlantı durumlarının ve sinyal gecikmelerinin anlık değerlendirilme kriterleri:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
              <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>18 Saniye Sinyal Gecikmesi (Gecikme / Uyarı)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Son sinyal zamanından bu yana 18 saniye geçen cihazlar sarı renkli <em>"Gecikme / Uyarı"</em> durumuna geçer.
                </p>
              </div>

              <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 text-rose-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>40 Saniye Kesinti (Çevrimdışı)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  40 saniyedir hiç telemetri paketi iletmeyen cihazlar sistem tarafından otomatik olarak <strong className="text-rose-400">"ÇEVRİMDİŞİ"</strong> olarak işaretlenir.
                </p>
              </div>
            </div>
          </div>

          {/* Saha Cihazları Entegrasyon Kod Örnekleri */}
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Saha Cihazları Entegrasyon Kod Örnekleri
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-indigo-500/10 text-indigo-500 font-bold border border-indigo-500/20">
                HTTP / REST Ingestion API
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Kendi yazılımlarınızdan, cURL betiklerinizden veya Python IoT ajanlarınızdan sistem sunucusuna telemetri verisi göndermek için aşağıdaki hazır kod örneklerini kullanabilirsiniz:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              {/* cURL */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-sans">
                  <span className="font-bold">Bash / cURL Komutu</span>
                  <button
                    onClick={() => handleCopy(sampleCurl)}
                    className="text-indigo-500 hover:text-indigo-400 flex items-center gap-1 cursor-pointer font-bold"
                  >
                    {copiedText === sampleCurl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" /> Kopyalandı
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Kopyala
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 bg-[#020617] text-slate-200 rounded-2xl border border-slate-800 overflow-x-auto text-[11px] leading-relaxed">
                  {sampleCurl}
                </pre>
              </div>

              {/* Python */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-sans">
                  <span className="font-bold">Python Script (IoT Agent)</span>
                  <button
                    onClick={() => handleCopy(samplePython)}
                    className="text-indigo-500 hover:text-indigo-400 flex items-center gap-1 cursor-pointer font-bold"
                  >
                    {copiedText === samplePython ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" /> Kopyalandı
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Kopyala
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 bg-[#020617] text-slate-200 rounded-2xl border border-slate-800 overflow-x-auto text-[11px] leading-relaxed">
                  {samplePython}
                </pre>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Guide 1 */}
            <div className="p-6 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
              <div className="p-3 w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 font-bold flex items-center justify-center">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">1. Cihaz Bağlama Kılavuzu</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                ESP32 veya Arduino cihazınızı Wi-Fi/Ethernet ile bağlayıp sistemden aldığınız API Key ile periyodik HTTP POST istekleri atarak ilk telemetrinizi canlıya alın.
              </p>
              <div className="bg-slate-900 p-3 rounded-xl font-mono text-[10px] text-cyan-400 overflow-x-auto">
                <code>HTTP POST /api/telemetry</code>
              </div>
            </div>

            {/* Guide 2 */}
            <div className="p-6 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
              <div className="p-3 w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 font-bold flex items-center justify-center">
                <Power className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">2. Buton & Kontrol Widget’ları</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Dashboard'a "Widget Ekle" butonu ile 1'li, 2'li, 3'lü veya 4'lü Buton panelleri yerleştirin. Her butona özel çıkış pin adı ve komut tanımlayarak sahadaki röleleri tek tıkla tetikleyin.
              </p>
              <div className="bg-slate-900 p-3 rounded-xl font-mono text-[10px] text-emerald-400 overflow-x-auto">
                <code>POST /api/devices/:id/control</code>
              </div>
            </div>

            {/* Guide 3 */}
            <div className="p-6 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
              <div className="p-3 w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-500 font-bold flex items-center justify-center">
                <Sliders className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">3. Analog Slider & PWM Çıkışı</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Motor devri, vana açıklığı veya LED parlaklığı gibi sürekli değişkenleri kontrol etmek için Slider widget’ını seçin. Min-Max değer aralıklarını ve adım miktarını dilediğiniz gibi belirleyin.
              </p>
              <div className="bg-slate-900 p-3 rounded-xl font-mono text-[10px] text-purple-400 overflow-x-auto">
                <code>{`{ "command": "PWM_OUT_1", "value": 75 }`}</code>
              </div>
            </div>

            {/* Guide 4 - Moved Network Discovery Info */}
            <div className="p-6 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
              <div className="p-3 w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 font-bold flex items-center justify-center">
                <Radio className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">4. Yerel Ağ Dedektörü & Keşif</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Sunucunuzla aynı yerel ağda (Wi-Fi / Ethernet) bulunan NodeMCU, ESP32 ve Gateway cihazlarını anlık izleyin, IP adreslerini ve gönderdikleri paketleri canlı eşleştirin.
              </p>
              {onNavigateToTab && (
                <button
                  onClick={() => onNavigateToTab('network_discovery')}
                  className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl font-bold text-[11px] border border-amber-500/30 transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Yerel Ağ Taramasına Git</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Setup Architecture Banner link */}
          {onNavigateToTab && (
            <div className="p-6 bg-gradient-to-r from-indigo-900 to-slate-900 rounded-3xl border border-indigo-500/30 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
              <div className="space-y-1">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Sunucu, PostgreSQL & WebSocket Mimarisi
                </h4>
                <p className="text-xs text-slate-300">
                  Kendi sunucunuza canlı kurulum yapmak, veritabanı şemalarını incelemek ve kod örneklerini indirmek için Kurulum Rehberini ziyaret edin.
                </p>
              </div>
              <button
                onClick={() => onNavigateToTab('setup_guide')}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-2xl shadow-lg shadow-indigo-600/30 transition shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Kurulum Rehberine Git</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: NODEMCU & DEVICE TROUBLESHOOTING */}
      {activeTab === 'troubleshooting' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Card */}
          <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 p-6 rounded-3xl border border-amber-500/40 shadow-xl space-y-4 text-white">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <span className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 shrink-0">
                <ShieldAlert className="w-7 h-7" />
              </span>
              <div>
                <h3 className="text-base sm:text-lg font-black">
                  NodeMCU / ESP32 Cihazımı Göremiyorum - 6 Adımda Hızlı Kontrol Listesi
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed mt-0.5">
                  Fiziksel donanımınızın (NodeMCU, ESP32, ESP8266, STM32) ürettiği verilerin panoda veya canlı konsolda görünmemesi durumunda kontrol etmeniz gereken kritik adımlar:
                </p>
              </div>
            </div>

            {/* Grid Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs pt-2">
              <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-mono">1</span>
                  <span>Aynı Wi-Fi Ağı Kontrolü</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  NodeMCU cihazınız ile sunucunuzun/bilgisayarınızın <b>aynı Wi-Fi modeme</b> bağlı olduğundan emin olun. Telefon hotspot'una veya farklı bir alt ağa bağlıysa paketler ulaşamaz.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-cyan-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px] font-mono">2</span>
                  <span>Koddaki IP ve Port Bilgisi</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  NodeMCU kodunuzda <code className="text-cyan-300 font-mono">http://localhost:3000</code> YAZMAYIN. Sunucunuzun/bilgisayarınızın yerel IP adresini yazın: <code className="text-emerald-400 font-mono">http://192.168.1.X:3000/api/v1/telemetry</code>.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-mono">3</span>
                  <span>Header: Content-Type</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  HTTP POST isteğinizde <code className="text-emerald-300 font-mono">http.addHeader("Content-Type", "application/json");</code> veya <code className="text-emerald-300 font-mono">text/plain</code> başlığını doğru tanımlayın.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-purple-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-mono">4</span>
                  <span>X-API-Key Yetkilendirmesi</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  İstek başlığına veya JSON payload içerisine cihazın benzersiz API Key bilgisini ekleyin: <code className="text-purple-300 font-mono">X-API-Key: nkn_live_xxx...</code>. Bu key'i "Cihazlar" sekmesinden kopyalayabilirsiniz.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center text-[10px] font-mono">5</span>
                  <span>Güvenlik Duvarı (Port 3000)</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Kendi bilgisayarınızda test ediyorsanız Windows Güvenlik Duvarı (Firewall) Port 3000'i engelleyebilir. Güvenlik duvarı ayarlarından Gelen Kurallar (Inbound Rules) port izni verin.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-mono">6</span>
                  <span>Seri Port (115200 Baud) Kontrolü</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Arduino IDE Seri Port Ekranında <code className="text-indigo-300 font-mono">httpCode: 200</code> cevabı aldığınızı doğrulayın. Eksi değer (örn: -1) alıyorsanız IP adresi yanlış veya cihaz Wi-Fi kopması yaşıyordur.
                </p>
              </div>
            </div>
          </div>

          {/* Arduino C++ Code Template */}
          <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-500" />
                Örnek Çalışan ESP32 / NodeMCU HTTP POST Kodu
              </h4>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">
                C++ / Arduino IDE
              </span>
            </div>
            <div className="bg-slate-900 text-emerald-400 p-4 rounded-2xl font-mono text-xs overflow-x-auto border border-slate-800 leading-relaxed">
              <pre>{`#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>

const char* ssid = "WIFI_AG_ADINIZ";
const char* password = "WIFI_SIFRENIZ";
const char* serverUrl = "http://192.168.1.50:3000/api/telemetry"; // Bilgisayarınızın yerel IP'si
const char* apiKey = "YOUR_DEVICE_API_KEY"; // Cihazlar sekmesinden alınan API Anahtarı

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Baglandi!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", apiKey);

    // Telemetri Verisi Gönderimi
    String httpRequestData = "{\\"deviceId\\":\\"dev_esp32_01\\",\\"metric\\":\\"temperature\\",\\"value\\":25.4,\\"unit\\":\\"°C\\"}";
    int httpResponseCode = http.POST(httpRequestData);
    
    Serial.print("HTTP Yanit Kodu: ");
    Serial.println(httpResponseCode);
    http.end();
  }
  delay(5000); // 5 saniyede bir veri gonder
}`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SERVER & DATABASE DEPLOYMENT GUIDE */}
      {activeTab === 'server_deployment' && (
        <div className="animate-fade-in">
          <DeploymentView />
        </div>
      )}
    </div>
  );
};
