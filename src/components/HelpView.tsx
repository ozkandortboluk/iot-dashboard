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

interface HelpViewProps {
  onNavigateToTab?: (tab: string) => void;
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

export const HelpView: React.FC<HelpViewProps> = ({ onNavigateToTab }) => {
  const [activeTab, setActiveTab] = useState<'faq' | 'dictionary' | 'code_examples' | 'guides' | 'troubleshooting'>('code_examples');
  const [selectedCodeCategory, setSelectedCodeCategory] = useState<'all' | 'esp32' | 'nodemcu' | 'ota' | 'ping' | 'control' | 'python' | 'curl' | 'nodejs'>('all');
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
      id: 'code_esp32_http_telemetry',
      title: 'ESP32 - HTTP Telemetri & Röle Yanıtı (Piggybacking)',
      category: 'esp32',
      categoryLabel: 'ESP32 / C++',
      badge: 'Canlı & Önerilen',
      description: 'Sensör verilerini (sıcaklık, nem, voltaj) sunucuya POST eder ve gelen HTTP yanıtından anında röle/PWM komutlarını okuyarak pinleri tetikler.',
      tags: ['esp32', 'http', 'telemetri', 'röle', 'piggybacking', 'komut yakalama'],
      endpoint: 'POST /api/v1/telemetry veya /api/telemetry',
      code: `// =========================================================================
// NEXUSNODE IoT PLATFORMU - ESP32 HTTP TELEMETRİ & KOMUT YAKALAMA (PIGGYBACKING)
// Bu kod derlenip doğrudan ESP32 kartınıza yüklenebilir.
// =========================================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> // ArduinoJson v6 veya v7

const char* WIFI_SSID     = "WIFI_AG_ADINIZ";
const char* WIFI_PASS     = "WIFI_SIFRENIZ";
const char* SERVER_URL    = "${originUrl}/api/v1/telemetry";
const char* API_KEY       = "nkn_live_YOUR_DEVICE_API_KEY"; // Cihazlar sekmesinden alınan Token
const char* DEVICE_NAME   = "Saha_ESP32_Sensor";

const int RELAY_PIN_1 = 26; // Röle 1 pini
const int RELAY_PIN_2 = 27; // Röle 2 pini
const int LED_STATUS  = 2;  // Dahili LED

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN_1, OUTPUT);
  pinMode(RELAY_PIN_2, OUTPUT);
  pinMode(LED_STATUS, OUTPUT);
  digitalWrite(RELAY_PIN_1, LOW);
  digitalWrite(RELAY_PIN_2, LOW);

  Serial.println("\\n>>> NexusNode ESP32 Istemcisi Baslatiliyor...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\\n[OK] WiFi Baglantisi Basarili! IP: " + WiFi.localIP().toString());
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

      // JSON Yanıt Ayrıştırma
      DynamicJsonDocument doc(1024);
      DeserializationError err = deserializeJson(doc, response);
      if (!err && doc.containsKey("commands")) {
        JsonArray commands = doc["commands"];
        for (JsonObject cmd : commands) {
          String commandName = cmd["command"] | "";
          String payloadVal  = cmd["payload"] | "";
          Serial.printf(">>> GELEN KOMUT: %s | DEĞER: %s\\n", commandName.c_str(), payloadVal.c_str());

          if (commandName == "RELAY_1" || commandName == "OUT_1") {
            digitalWrite(RELAY_PIN_1, payloadVal == "ON" || payloadVal == "HIGH" ? HIGH : LOW);
          } else if (commandName == "RELAY_2" || commandName == "OUT_2") {
            digitalWrite(RELAY_PIN_2, payloadVal == "ON" || payloadVal == "HIGH" ? HIGH : LOW);
          }
        }
      }
    } else {
      Serial.printf("[HATA] HTTP Baglanti Hatasi, Kod: %d\\n", httpCode);
    }
    http.end();
    digitalWrite(LED_STATUS, LOW);
  } else {
    Serial.println("[UYARI] WiFi Baglantisi koptu, yeniden baglaniliyor...");
    WiFi.reconnect();
  }

  delay(5000); // 5 Saniyede bir periyodik telemetri iletimi
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
      id: 'code_esp32_ota_update',
      title: 'ESP32 / ESP8266 - Çoklu Firmware OTA Kontrolü & Otomatik Flashing (HTTPUpdate)',
      category: 'esp32',
      categoryLabel: 'ESP32 / ESP8266 OTA',
      badge: 'Çoklu Firmware & OTA',
      description: 'ESP32/ESP8266 kartınız sunucuya cihaz kimliklerini (device_type, role_key, firmware_version) gönderir. Yeni sürüm yayınlandığında otomatik OTA güncellemesini indirip flash eder.',
      tags: ['esp32', 'esp8266', 'ota', 'firmware', 'httpupdate', 'role_key'],
      endpoint: 'POST /api/ota/check & GET /api/firmwares/:id/download',
      code: `// =========================================================================
// NEXUSNODE IoT - ESP32 / ESP8266 ÇOKLU FIRMWARE OTA GÜNCELLEME İSTEMCİSİ
// Bu kod periyodik olarak sunucudan cihaz tipine (device_type) ve görev kimliğine (role_key) 
// uygun yeni firmware kontrolü yapar ve otomatik günceller.
// =========================================================================
#include <WiFi.h> // ESP8266 için: #include <ESP8266WiFi.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h> // ESP8266 için: #include <ESP8266httpUpdate.h>
#include <ArduinoJson.h>

const char* WIFI_SSID       = "WIFI_AG_ADINIZ";
const char* WIFI_PASS       = "WIFI_SIFRENIZ";
const char* OTA_CHECK_URL   = "${originUrl}/api/ota/check";
const char* OTA_STATUS_URL  = "${originUrl}/api/ota/status";
const char* API_KEY         = "nkn_live_YOUR_DEVICE_API_KEY";

// CİHAZ GÖREV KİMLİK BİLGİLERİ (Cihaz bu bilgileri sunucuya beyan eder)
const char* DEVICE_TYPE      = "pump_controller";
const char* DEVICE_ROLE_KEY  = "PUMP_CTRL";
const char* HARDWARE_MODEL   = "ESP32_WROOM_32";
const char* FIRMWARE_VERSION = "v1.0.0";

void setup() {
  Serial.begin(115200);
  Serial.println("\\n>>> ESP32 OTA Istemcisi Baslatiliyor...");
  Serial.printf("Gorev Kimligi (role_key): %s | Mevcut Surum: %s\\n", DEVICE_ROLE_KEY, FIRMWARE_VERSION);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\\n[OK] WiFi Baglandi!");
}

void reportOtaStatus(const char* status, int progress, const char* errorMsg = "") {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(OTA_STATUS_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  String json = "{\\"status\\":\\"" + String(status) + 
                "\\",\\"progressPercent\\":" + String(progress) + 
                ",\\"errorMessage\\":\\"" + String(errorMsg) + "\\"}";

  http.POST(json);
  http.end();
}

void checkAndPerformOTA() {
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.println("[OTA] Sunucudan uygun Firmware guncellemesi sorgulaniyor...");
  HTTPClient http;
  http.begin(OTA_CHECK_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  // Cihaz Kimlik Handshake Paketi
  String body = "{\\"device_type\\":\\"" + String(DEVICE_TYPE) + 
                "\\",\\"role_key\\":\\"" + String(DEVICE_ROLE_KEY) + 
                "\\",\\"hardware_model\\":\\"" + String(HARDWARE_MODEL) + 
                "\\",\\"firmware_version\\":\\"" + String(FIRMWARE_VERSION) + "\\"}";

  int httpCode = http.POST(body);
  if (httpCode == 200) {
    String response = http.getString();
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, response);

    bool updateAvailable = doc["updateAvailable"] | false;
    if (updateAvailable) {
      String downloadUrl = doc["downloadUrl"] | "";
      String newVersion  = doc["version"] | "";
      String sha256      = doc["sha256"] | "";

      Serial.printf("[OTA] YENİ FIRMWARE BULUNDU! Versiyon: %s\\n", newVersion.c_str());
      Serial.println("[OTA] Indirme Adresi: " + downloadUrl);

      // Sunucuya indirme basladigini bildir
      reportOtaStatus("DOWNLOADING", 10);

      // HTTPUpdate ile Binaries Indir & Flash Et
      t_httpUpdate_return ret = httpUpdate.update(http, "${originUrl}" + downloadUrl);

      switch (ret) {
        case HTTP_UPDATE_FAILED:
          Serial.printf("[OTA] Guncelleme Basarisiz! Hata koda: (%d): %s\\n", httpUpdate.getLastError(), httpUpdate.getLastErrorString().c_str());
          reportOtaStatus("FAILED", 0, httpUpdate.getLastErrorString().c_str());
          break;

        case HTTP_UPDATE_NO_UPDATES:
          Serial.println("[OTA] Sunucuda yeni guncelleme yok.");
          break;

        case HTTP_UPDATE_OK:
          Serial.println("[OTA] GUNCELLEME BASARIYLA TAMAMLANDI! Cihaz yeniden baslatiliyor...");
          reportOtaStatus("SUCCESS", 100);
          delay(1000);
          ESP.restart(); // Otomatik reboot
          break;
      }
    } else {
      Serial.println("[OTA] Firmware guncel.");
    }
  } else {
    Serial.printf("[OTA] Sunucu sorgu hatasi: %d\\n", httpCode);
  }
  http.end();
}

void loop() {
  // Her 5 dakikada bir (300.000 ms) OTA guncelleme kontrolu yap
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 300000 || lastCheck == 0) {
    lastCheck = millis();
    checkAndPerformOTA();
  }

  delay(1000);
}`,
    },
    {
      id: 'code_nodemcu_esp8266_http',
      title: 'NodeMCU (ESP8266) - Standart JSON Telemetri Gönderimi',
      category: 'nodemcu',
      categoryLabel: 'NodeMCU ESP8266',
      badge: 'Kararlı',
      description: 'NodeMCU ESP8266 kartınızdan `/api/telemetry` endpointine standart JSON telemetri paketi iletme kodu.',
      tags: ['nodemcu', 'esp8266', 'json', 'telemetri', 'arduino'],
      endpoint: 'POST /api/telemetry',
      code: `// =========================================================================
// NEXUSNODE IoT - NODEMCU (ESP8266) STANDART JSON TELEMETRİ GÖNDERİMİ
// =========================================================================
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

const char* WIFI_SSID  = "WIFI_AG_ADINIZ";
const char* WIFI_PASS  = "WIFI_SIFRENIZ";
const char* SERVER_URL = "${originUrl}/api/telemetry";
const char* API_KEY    = "nkn_live_YOUR_DEVICE_API_KEY";

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nNodeMCU WiFi Ağına Başarıyla Bağlandı!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;

    http.begin(client, SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", API_KEY);

    // Çoklu Metrik Gönderimi (Array veya Tekil JSON)
    String jsonBody = "{\\"deviceId\\":\\"dev_nodemcu_01\\",\\"metric\\":\\"temperature\\",\\"value\\":26.8,\\"unit\\":\\"°C\\"}";

    int httpCode = http.POST(jsonBody);
    Serial.print("HTTP Yanıt Kodu: ");
    Serial.println(httpCode);

    if (httpCode > 0) {
      String response = http.getString();
      Serial.println("Sunucu Yanıtı: " + response);
    }
    http.end();
  }
  delay(10000); // 10 saniyede bir ölçüm ilet
}`,
    },
    {
      id: 'code_esp32_websocket_client',
      title: 'ESP32 - Canlı Çift Yönlü WebSocket İstemcisi',
      category: 'esp32',
      categoryLabel: 'ESP32 WebSocket',
      badge: 'Gerçek Zamanlı (<20ms)',
      description: 'WebSocketsClient kütüphanesi kullanarak sunucuya kalıcı WS soketi açar. Dashboard üzerinden butona basıldığında anında milisaniyeler içinde komutu yakalar.',
      tags: ['esp32', 'websocket', 'realtime', 'düşük gecikme', 'çift yönlü'],
      endpoint: 'WS ws://SERVER_HOST:3000/ws',
      code: `// =========================================================================
// NEXUSNODE IoT - ESP32 CANLI WEBSOCKET ÇİFT YÖNLÜ İLETİŞİM
// Kütüphane: Arduino WebSockets by Markus Sattler (Library Manager'dan ekleyin)
// =========================================================================
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID     = "WIFI_AG_ADINIZ";
const char* WIFI_PASS     = "WIFI_SIFRENIZ";
const char* WS_HOST       = "${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}";
const int   WS_PORT       = 3000;
const char* WS_PATH       = "/ws";
const char* API_KEY       = "nkn_live_YOUR_DEVICE_API_KEY";

WebSocketsClient webSocket;
unsigned long lastSend = 0;

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Baglanti Kesildi!");
      break;
    case WStype_CONNECTED:
      Serial.printf("[WS] Sunucuya Baglandi! URL: %s\\n", payload);
      // Sunucuya kimlik tanıtımı yap
      webSocket.sendTXT("{\\"type\\":\\"register\\",\\"apiKey\\":\\"" + String(API_KEY) + "\\"}");
      break;
    case WStype_TEXT: {
      Serial.printf("[WS GELEN VERİ]: %s\\n", payload);
      DynamicJsonDocument doc(512);
      deserializeJson(doc, payload);
      String typeStr = doc["type"] | "";
      if (typeStr == "CONTROL_COMMAND") {
        String cmd = doc["command"] | "";
        String val = doc["value"] | "";
        Serial.println(">>> ANLIK KOMUT ALINDI: " + cmd + " -> " + val);
        // Röle veya PWM pinini burada anında sürün!
      }
      break;
    }
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Baglandi!");

  // WebSocket Baslat
  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  webSocket.loop();

  // 5 Saniyede bir canli telemetri paketi yayinla
  if (millis() - lastSend > 5000) {
    lastSend = millis();
    if (WiFi.status() == WL_CONNECTED) {
      String json = "{\\"type\\":\\"TELEMETRY_PACKET\\",\\"deviceId\\":\\"dev_esp32_ws\\",\\"metrics\\":{\\"temp\\":27.3,\\"voltage\\":12.2}}";
      webSocket.sendTXT(json);
      Serial.println("[WS GÖNDERİLDİ] Canlı Telemetri Paketi");
    }
  }
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
  -d "YOUR_API_KEY, Saha_Cihazi_01, sıcaklık:28.4, nem:62.5, basınç:1013.2"

# 2. HEARTBEAT / PING SİNYALİ GÖNDERME (Cihazı Canlı Tutma / Çevrimiçi Yapma)
curl -X POST "${originUrl}/api/telemetry/ping" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"deviceId":"dev_esp32_01","ping":1,"rssi":-58}'

# 3. JSON FORMATINDA TELEMETRİ GÖNDERİMİ
curl -X POST "${originUrl}/api/telemetry" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "deviceId": "dev_esp32_01",
    "metric": "temperature",
    "value": 31.2,
    "unit": "°C"
  }'

# 4. RÖLE / PWM ÇIKIŞI TETİKLEME (Kontrol API)
curl -X POST "${originUrl}/api/devices/dev_esp32_01/control" \\
  -H "Content-Type: application/json" \\
  -d '{
    "command": "RELAY_1",
    "outputPin": "OUT_1",
    "value": "HIGH"
  }'
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
  ];

  const filteredCodeExamples = useMemo(() => {
    return codeExamples.filter((item) => {
      const matchesCategory =
        selectedCodeCategory === 'all' ||
        item.category === selectedCodeCategory ||
        (selectedCodeCategory === 'ota' && (item.category === 'ota' || item.tags.includes('ota')));
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
  ];

  // Technical Dictionary
  const dictionary: DictionaryTerm[] = [
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
            <LifeBuoy className="w-3.5 h-3.5 text-indigo-400" />
            <span>Yardım, Bilgi Merkezi & Terimler Sözlüğü</span>
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
    </div>
  );
};
