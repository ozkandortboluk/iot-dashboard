import React, { useState } from 'react';
import {
  Database,
  Server,
  Copy,
  Check,
  Download,
  ShieldCheck,
  Terminal,
  HardDrive,
  Cpu,
  HelpCircle,
  Code2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Key,
  Globe,
  Zap,
  RefreshCw,
  Laptop,
  Wifi,
  Share2,
  ArrowRight,
  FileText,
  Radio,
} from 'lucide-react';

export const DeploymentView: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [activeStepTab, setActiveStepTab] = useState<'local' | 'steps' | 'migration' | 'configurator' | 'nodemcu_esp' | 'device_code' | 'roadmap' | 'troubleshoot'>('local');
  const [selectedLanguage, setSelectedLanguage] = useState<'curl' | 'python' | 'esp32'>('esp32');
  const [selectedEspTab, setSelectedEspTab] = useState<'nodemcu_http' | 'esp32_http' | 'esp_websocket' | 'ide_setup'>('nodemcu_http');

  // Interactive Configuration Generator State
  const [customServerAddress, setCustomServerAddress] = useState('panel.sirketim.com');
  const [customDbPassword, setCustomDbPassword] = useState('GüçlüŞifre2026!');
  const [customApiKey, setCustomApiKey] = useState('NEXUS_DEV_982341');
  const [customAppPort, setCustomAppPort] = useState('3000');

  const handleCopy = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // Dynamic Docker Compose Yaml based on user configuration
  const dockerComposeYaml = `version: '3.8'

services:
  # IoT Dashboard & REST/WebSocket Uygulama Sunucusu
  app:
    build: .
    container_name: nexus_app
    ports:
      - "${customAppPort}:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgres://nexus_user:${customDbPassword}@postgres:5432/nexus_dashboard
      - GEMINI_API_KEY=${customApiKey}
      - ENABLE_SIMULATOR="true"
    depends_on:
      postgres:
        condition: service_healthy
    restart: always

  # PostgreSQL İlişkisel Veritabanı
  postgres:
    image: postgres:16-alpine
    container_name: nexus_postgres
    environment:
      POSTGRES_USER: nexus_user
      POSTGRES_PASSWORD: ${customDbPassword}
      POSTGRES_DB: nexus_dashboard
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nexus_user -d nexus_dashboard"]
      interval: 5s
      timeout: 5s
      retries: 5
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/init.sql
    restart: always

volumes:
  pgdata:`;

  const envFileContent = `# Environment Config File (.env)
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://nexus_user:${customDbPassword}@localhost:5432/nexus_dashboard
GEMINI_API_KEY=${customApiKey}
ENABLE_SIMULATOR=true`;

  const nginxConfig = `# Nginx Proxy ve SSL Yapılandırması (/etc/nginx/sites-available/dashboard)
server {
    listen 80;
    server_name ${customServerAddress};

    # Otomatik HTTPS Yönlendirmesi
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${customServerAddress};

    # Certbot SSL Sertifika Yolları
    ssl_certificate /etc/letsencrypt/live/${customServerAddress}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${customServerAddress}/privkey.pem;

    # Güvenlik ve SSL Ayarları
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:${customAppPort};
        proxy_http_version 1.1;

        # WebSocket Katmanı İçin Kritik Başlıklar
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;

  const esp32CodeSnippet = `// ESP32 / Arduino C++ Saha Cihazı Kodu (Çift Yönlü - Telemetri + Gelen Komut İşleme)
#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "WIFI_AG_ADINIZ";
const char* password = "WIFI_SIFRENIZ";

// Sunucu Adresi veya IP
const char* serverUrl = "http://${customServerAddress}/api/v1/telemetry";

// Cihaz API Tokeni (Cihazlar sekmesinden kopyalayabilirsiniz)
const char* deviceToken = "${customApiKey}";
const char* deviceName = "Saha_Sıcaklık_Sensörü_01";

// Çıkış Pinleri (Röle / LED / Aktüatör)
const int RELAY_PIN = 2; // ESP32 dahili LED / D2 Pini

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Bağlandı!");
}

// Sunucudan Dönüş Kodu İçindeki Komutları İşleme Fonksiyonu
void handleDownlinkCommands(String jsonResponse) {
  // Sunucunun Telemetri POST yanıtında bekleyen komutlar (Piggybacking) otomatik olarak gelir
  // Örnek Yanıt: {"status":"success", "commands":[{"command":"RELAY_1","payload":"ON"}]}
  
  if (jsonResponse.indexOf("\"commands\"") != -1) {
    Serial.println("⚡ Sunucudan Komut Alındı!");
    
    if (jsonResponse.indexOf("RELAY") != -1 || jsonResponse.indexOf("OUT_1") != -1) {
      if (jsonResponse.indexOf("\"ON\"") != -1 || jsonResponse.indexOf("\"1\"") != -1 || jsonResponse.indexOf("\"HIGH\"") != -1) {
        digitalWrite(RELAY_PIN, HIGH);
        Serial.println(">>> [AKSYON] RÖLE AÇILDI (HIGH)");
      } else if (jsonResponse.indexOf("\"OFF\"") != -1 || jsonResponse.indexOf("\"0\"") != -1 || jsonResponse.indexOf("\"LOW\"") != -1) {
        digitalWrite(RELAY_PIN, LOW);
        Serial.println(">>> [AKSYON] RÖLE KAPATILDI (LOW)");
      }
    }
  }
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", deviceToken);

    packetSequence++;
    float temp = 25.5 + (random(-10, 10) / 10.0);
    float hum = 60.0 + (random(-20, 20) / 10.0);

    // Üretim Formatı JSON Telemetri Paketi
    String payload = "{\"sequence\":" + String(packetSequence) + 
                     ",\"metrics\":{\"temperature\":{\"value\":" + String(temp, 1) + ",\"unit\":\"C\"}" +
                     ",\"humidity\":{\"value\":" + String(hum, 1) + ",\"unit\":\"%\"}}}";

    Serial.println("Gönderilen Üretim Paketi (#" + String(packetSequence) + "): " + payload);

    int httpResponseCode = http.POST(payload);
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Sunucu Yanıtı (" + String(httpResponseCode) + "): " + response);
      
      // Sunucudan gelen komut paketini işle
      handleDownlinkCommands(response);
    } else {
      Serial.println("Hata Kodu: " + String(httpResponseCode));
    }
    http.end();
  }
  
  delay(5000); // 5 saniyede bir paket gönder & komutları kontrol et
}`;

  const pythonCodeSnippet = `# Python Saha Cihazı Veri İletim Scripti (Üretim Formatı)
import requests
import time
import random

SERVER_URL = "http://${customServerAddress}/api/telemetry"
API_KEY = "${customApiKey}"
sequence_num = 1000

print(">>> Saha İletişimi Başlatıldı...")

while True:
    sequence_num += 1
    temp = round(random.uniform(20.0, 45.0), 1)
    power = round(random.uniform(10.0, 95.0), 1)
    
    # Standart Saha Veri Paketi (JSON)
    payload = {
        "sequence": sequence_num,
        "metrics": {
            "temperature": {"value": temp, "unit": "°C"},
            "power": {"value": power, "unit": "kW"}
        }
    }
    
    try:
        response = requests.post(
            SERVER_URL,
            json=payload,
            headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
            timeout=5
        )
        print(f"[{time.strftime('%H:%M:%S')}] Gönderildi (# {sequence_num}) -> HTTP {response.status_code}: {response.json()}")
    except Exception as e:
        print(f" Bağlantı Hatası: {e}")
        
    time.sleep(5) # 5 saniyede bir paket gönder`;

  const curlCodeSnippet = `# cURL Saha Paketi Gönderim Komutu (Terminal)
curl -X POST "http://${customServerAddress}/api/telemetry" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${customApiKey}" \\
  -d '{
    "sequence": 10021,
    "metrics": {
      "temperature": { "value": 24.3, "unit": "C" },
      "humidity": { "value": 58.2, "unit": "%" }
    }
  }'`;

  const nodeMcuCodeSnippet = `// ================================================================
// NODEMCU (ESP8266) GERÇEK CİHAZ TEST KODU (HTTP POST)
// Kart Seçimi: NodeMCU 0.9/1.0 (ESP-12E Module)
// Gerekli Kütüphaneler: ESP8266WiFi, ESP8266HTTPClient
// ================================================================

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// Wi-Fi Ağ Bilgileriniz
const char* ssid = "WIFI_AG_ADINIZ";
const char* password = "WIFI_SIFRENIZ";

// Panel Sunucu Adresi (Localhost IP veya Canlı Domain)
const char* serverUrl = "http://${customServerAddress}/api/v1/telemetry";

// Cihaz API Tokeni ve Kimliği (Cihazlar sayfasından kopyalayabilirsiniz)
const char* deviceToken = "${customApiKey}";
const char* deviceName = "NodeMCU_Saha_Node_01";

const int LED_PIN = LED_BUILTIN; // D4 Pinindeki Dahili Mavi LED

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH); // LED Sönük

  Serial.println("\n=============================================");
  Serial.println("  NodeMCU (ESP8266) IoT Gerçek Cihaz Başladı ");
  Serial.println("=============================================");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN)); // Baglanana kadar flaş yapar
  }

  digitalWrite(LED_PIN, LOW); // Baglaninca LED sabit yanar
  Serial.println("\n[WiFi] Bağlantı Başarılı!");
  Serial.print("[WiFi] IP Adresi: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;

    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "text/plain");

    // Analog A0 Pininden Sensör Okuması veya Isı Simülasyonu
    int rawAnalog = analogRead(A0);
    float temp = 22.5 + (rawAnalog % 120) / 10.0;
    float hum = 52.0 + (random(-15, 15) / 10.0);

    // Format: "TOKEN, CİHAZ_ADI, sıcaklık:VAL, nem:VAL"
    String payload = String(deviceToken) + ", " + String(deviceName) + 
                     ", sıcaklık:" + String(temp, 1) + 
                     ", nem:" + String(hum, 1);

    Serial.println("\n[NodeMCU TX] -> " + payload);

    int httpCode = http.POST(payload);

    if (httpCode > 0) {
      String response = http.getString();
      Serial.printf("[NodeMCU RX] HTTP %d OK! Sunucu Yanıtı: %s\n", httpCode, response.c_str());
    } else {
      Serial.printf("[NodeMCU HATA] HTTP Gönderim Başarısız! Hata Kodu: %d\n", httpCode);
    }

    http.end();
  } else {
    Serial.println("[UYARI] WiFi Kopuk, Yeniden Bağlanılıyor...");
    WiFi.reconnect();
  }

  delay(5000); // 5 saniyede bir paket gönder
}`;

  const esp32AdvancedCodeSnippet = `// ================================================================
// ESP32 (WROOM / DEVKIT) GERÇEK CİHAZ TEST KODU (HTTP POST)
// Kart Seçimi: ESP32 Dev Module
// Gerekli Kütüphaneler: WiFi, HTTPClient
// ================================================================

#include <WiFi.h>
#include <HTTPClient.h>

// Wi-Fi Ağ Bilgileriniz
const char* ssid = "WIFI_AG_ADINIZ";
const char* password = "WIFI_SIFRENIZ";

// Panel Sunucu Adresi
const char* serverUrl = "http://${customServerAddress}/api/v1/telemetry";

// Cihaz API Tokeni ve Kimliği
const char* deviceToken = "${customApiKey}";
const char* deviceName = "ESP32_Endustriyel_Node_01";
unsigned long packetSequence = 1000; // Paket sıra numarası (Sequence Number)

#define STATUS_LED 2  // GPIO2 (Dahili Mavi LED)
#define RELAY_PIN 23  // GPIO23 (Röle Kontrol Çıkışı)

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  Serial.println("\n=============================================");
  Serial.println("  ESP32 Endüstriyel Saha Düğümü Başlatılıyor ");
  Serial.println("=============================================");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
  }

  digitalWrite(STATUS_LED, HIGH);
  Serial.println("\n[ESP32] Wi-Fi Bağlantısı Başarılı!");
  Serial.print("[ESP32] Yerel IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", deviceToken);

    // Sensör Değerleri (Sıcaklık, Nem)
    float temp = 26.5 + (random(-30, 70) / 10.0);
    float hum = 52.0 + (random(-30, 30) / 10.0);

    packetSequence++; // Her yeni pakette sequence artırılır

    // JSON Formatı (sequence + metrics)
    String payload = "{\"sequence\":" + String(packetSequence) + 
                     ",\"metrics\":{\"temperature\":{\"value\":" + String(temp, 1) + ",\"unit\":\"C\"}" +
                     ",\"humidity\":{\"value\":" + String(hum, 1) + ",\"unit\":\"%\"}}}";

    Serial.printf("[ESP32 TX] Paket #%lu -> %s\n", packetSequence, payload.c_str());

    int httpCode = http.POST(payload);

    if (httpCode == 200 || httpCode == 201) {
      String response = http.getString();
      Serial.printf("[ESP32 RX] HTTP %d OK! Yanıt: %s\n", httpCode, response.c_str());
    } else {
      Serial.printf("[ESP32 HATA] Gönderim Hatası! HTTP Kodu: %d\n", httpCode);
    }

    http.end();
  }

  delay(4000); // 4 saniyede bir gönderim
}`;

  const espWebsocketSnippet = `// ================================================================
// ESP32 / NODEMCU WEBSOCKET CANLI AKIŞ KODU (Anlık Çift Yönlü İletişim)
// Kütüphane Yöneticisinden "WebSockets" (Markus Sattler) yükleyin
// ================================================================

#include <WiFi.h>
#include <WebSocketsClient.h>

const char* ssid = "WIFI_AG_ADINIZ";
const char* password = "WIFI_SIFRENIZ";

const char* wsHost = "${customServerAddress}";
const int wsPort = ${customAppPort};
const char* wsPath = "/ws";

WebSocketsClient webSocket;

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Sunucuyla Bağlantı Kesildi!");
      break;
    case WStype_CONNECTED:
      Serial.printf("[WS] Canlı WebSocket Sunucusuna Bağlandı: %s\n", payload);
      webSocket.sendTXT("{\"event\":\"device:connect\",\"payload\":{\"token\":\"${customApiKey}\"}}");
      break;
    case WStype_TEXT:
      Serial.printf("[WS RX]: %s\n", payload);
      break;
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }

  Serial.println("\n[WiFi] Bağlandı!");
  
  webSocket.begin(wsHost, wsPort, wsPath);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  webSocket.loop();

  static unsigned long lastSend = 0;
  if (millis() - lastSend > 3000) {
    lastSend = millis();
    if (WiFi.status() == WL_CONNECTED) {
      float temp = 24.5 + (random(-10, 10) / 10.0);
      String msg = "{\"event\":\"telemetry:send\",\"token\":\"${customApiKey}\",\"metric\":\"temperature\",\"value\":" + String(temp) + "}";
      webSocket.sendTXT(msg);
      Serial.println("[WS TX] -> " + msg);
    }
  }
}`;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-br from-slate-900 via-slate-900 to-[#0b1329] p-6 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold rounded-full uppercase tracking-wider">
              Yeni Başlayanlar İçin Kolay Kurulum
            </span>
            <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[10px] font-bold rounded-full uppercase tracking-wider">
              Docker + PostgreSQL + SSL
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-white mt-2 flex items-center gap-2.5">
            <Server className="w-6 h-6 text-emerald-400 shrink-0" />
            <span>Sunucu & Veritabanı Kurulum ve Canlıya Alma Rehberi</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Sisteminizi kendi ev sunucunuza (Raspberry Pi, Mini PC) veya bir VPS bulut sunucusuna (Ubuntu Server) adım adım sıfırdan kurun.
          </p>
        </div>

        <a
          href="/api/system/postgres-schema"
          download="schema.sql"
          className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all shrink-0 self-start md:self-auto border border-emerald-400/30"
        >
          <Download className="w-4 h-4" />
          <span>PostgreSQL schema.sql İndir</span>
        </a>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveStepTab('local')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeStepTab === 'local'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Laptop className="w-4 h-4 text-emerald-300" />
          <span>1. Yerel Kurulum (Kendi PC'niz & Test Cihazları)</span>
        </button>

        <button
          onClick={() => setActiveStepTab('steps')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeStepTab === 'steps'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Server className="w-4 h-4 text-indigo-300" />
          <span>2. Canlı Sunucu (VPS / Bulut / Docker)</span>
        </button>

        <button
          onClick={() => setActiveStepTab('migration')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeStepTab === 'migration'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Share2 className="w-4 h-4 text-purple-300" />
          <span>3. Yerelden Canlıya Geçiş & Veri Aktarımı</span>
        </button>

        <button
          onClick={() => setActiveStepTab('configurator')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeStepTab === 'configurator'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-300" />
          <span>4. Canlı Yapılandırma Üretici (.env)</span>
        </button>

        <button
          onClick={() => setActiveStepTab('nodemcu_esp')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeStepTab === 'nodemcu_esp'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Cpu className="w-4 h-4 text-emerald-300" />
          <span>5. NodeMCU & ESP8266 / ESP32 Test Kodları</span>
        </button>

        <button
          onClick={() => setActiveStepTab('device_code')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeStepTab === 'device_code'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>6. Python & cURL Test Scriptleri</span>
        </button>

        <button
          onClick={() => setActiveStepTab('roadmap')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeStepTab === 'roadmap'
              ? 'bg-slate-700 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>Sözlük & Kavramlar</span>
        </button>

        <button
          onClick={() => setActiveStepTab('troubleshoot')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeStepTab === 'troubleshoot'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Hatalar & Çözümler</span>
        </button>
      </div>

      {/* TAB 0: LOCAL PC SETUP & TEST DEVICES GUIDE */}
      {activeStepTab === 'local' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 p-6 rounded-3xl border border-emerald-500/30 text-xs text-slate-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xl relative overflow-hidden">
            <div className="flex items-start gap-3 z-10">
              <Laptop className="w-8 h-8 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold rounded-full uppercase tracking-wider">
                  Sıfırdan Başlayanlar İçin Rehber
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white mt-1">
                  1. Kendi Bilgisayarınızda Yerel Deneme Modu (Localhost)
                </h3>
                <p className="text-slate-300 leading-relaxed mt-1 max-w-3xl">
                  Hiçbir ücret ödemeden ve sunucu kiralamadan önce bu sistemi kendi dizüstü veya masaüstü bilgisayarınızda çalıştırabilirsiniz.
                  Aynı ev/ofis Wi-Fi ağına bağlı test cihazlarınız (ESP32, Raspberry Pi, Python scriptleri vb.) bilgisayarınıza anlık veri paketi gönderebilir.
                </p>
              </div>
            </div>
            <div className="px-4 py-2 bg-slate-900/90 rounded-2xl border border-slate-800 text-[11px] text-emerald-400 font-mono shrink-0 font-semibold shadow">
              🚀 Maliyet: 0 TL / Tamamen Ücretsiz
            </div>
          </div>

          {/* Prerequisites Banner */}
          <div className="bg-[#0f172a] p-5 rounded-3xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Ön Hazırlık: Bilgisayarınızda Olması Gerekenler</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800/80 space-y-1">
                <strong className="text-cyan-400 block font-semibold">1. Node.js (Çalışma Ortamı)</strong>
                <p className="text-slate-400 text-[11px]">
                  Web sunucusu ve veritabanı motorunu çalıştırır.{' '}
                  <a
                    href="https://nodejs.org"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:underline font-semibold"
                  >
                    nodejs.org
                  </a>{' '}
                  adresinden <b>LTS (Önerilen)</b> sürümünü indirip kurun.
                </p>
              </div>
              <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800/80 space-y-1">
                <strong className="text-emerald-400 block font-semibold">2. Kod Editörü (İsteğe Bağlı)</strong>
                <p className="text-slate-400 text-[11px]">
                  Kodları düzenlemek için ücretsiz <a href="https://code.visualstudio.com" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline font-semibold">VS Code</a> önerilir.
                </p>
              </div>
              <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800/80 space-y-1">
                <strong className="text-purple-400 block font-semibold">3. Aynı Wi-Fi Ağındaki Cihazlar</strong>
                <p className="text-slate-400 text-[11px]">
                  Bilgisayarınız ile ESP32 / Test cihazınız aynı modeme bağlı olmalıdır.
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step 1 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    1
                  </span>
                  <h3 className="text-sm font-bold text-white">Adım 1: Proje Kodlarını Bilgisayarınıza İndirin</h3>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Dosya İndirme
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Proje dosyalarını ZIP olarak indirip bilgisayarınızda istediğiniz bir klasöre (Örn: <code className="text-amber-300">C:\Proje\iot-dashboard</code>) çıkartın veya Git ile klonlayın:
              </p>
              <pre className="p-3.5 bg-[#020617] text-emerald-400 rounded-2xl border border-slate-800 text-xs font-mono leading-relaxed">
                {`git clone https://github.com/kullanici/iot-dashboard.git\ncd iot-dashboard`}
              </pre>
            </div>

            {/* Step 2 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-cyan-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    2
                  </span>
                  <h3 className="text-sm font-bold text-white">Adım 2: Komut Satırını (CMD/Terminal) Klasörde Açın</h3>
                </div>
                <span className="text-[10px] text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  Terminal
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                <b>Windows İpucu:</b> Proje klasörünü açın. Üstteki adres çubuğuna tıklayıp <code className="text-amber-300 font-mono">cmd</code> yazıp Enter'a basın. Komut satırı doğrudan o klasörde açılacaktır.
              </p>
              <div className="p-3 bg-[#020617] text-cyan-300 rounded-2xl border border-slate-800 text-xs font-mono">
                C:\Proje\iot-dashboard&gt;
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    3
                  </span>
                  <h3 className="text-sm font-bold text-white">Adım 3: Bağımlılıkları Yükleyin (`npm install`)</h3>
                </div>
                <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  Kütüphane Kurulumu
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Komut satırına aşağıdaki komutu yazıp Enter'a basın. Bu işlem projenin ihtiyaç duyduğu tüm kütüphaneleri otomatik yükler (yaklaşık 15-30 saniye sürer):
              </p>
              <pre className="p-3.5 bg-[#020617] text-indigo-300 rounded-2xl border border-slate-800 text-xs font-mono leading-relaxed">
                npm install
              </pre>
            </div>

            {/* Step 4 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    4
                  </span>
                  <h3 className="text-sm font-bold text-white">Adım 4: Yerel Sunucuyu Çalıştırın (`npm run dev`)</h3>
                </div>
                <span className="text-[10px] text-purple-400 font-mono bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Uygulamayı Başlatma
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Kurulum bittikten sonra aşağıdaki komutla sunucunuzu çalıştırın:
              </p>
              <pre className="p-3.5 bg-[#020617] text-emerald-400 rounded-2xl border border-slate-800 text-xs font-mono leading-relaxed">
                npm run dev
              </pre>
              <p className="text-[11px] text-slate-400">
                Ekranda <code className="text-amber-300">Server running on http://localhost:3000</code> yazısını gördüğünüz an web paneli ve veritabanı aktif hale gelir. Tarayıcınızdan <strong className="text-white">http://localhost:3000</strong> adresini açabilirsiniz!
              </p>
            </div>

            {/* Step 5 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    5
                  </span>
                  <h3 className="text-sm font-bold text-white">Adım 5: Bilgisayarınızın Yerel Ağ IP Adresini Öğrenin</h3>
                </div>
                <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Wi-Fi / LAN IP
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Aynı modeme bağlı test cihazlarının (ESP32, Arduino vb.) bilgisayarınıza veri atabilmesi için yerel IP adresinizi öğrenmelisiniz:
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Windows CMD: <b>ipconfig</b></span>
                  <span>Mac / Linux: <b>ifconfig</b></span>
                </div>
                <div className="p-3 bg-[#020617] text-amber-300 rounded-2xl border border-slate-800 text-xs font-mono">
                  IPv4 Adresi . . . . . . . . . . . : 192.168.1.45
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Saha/Test cihazınızdaki hedef URL: <code className="text-cyan-300 font-mono">http://192.168.1.45:3000/api/v1/telemetry</code> olacaktır.
              </p>
            </div>

            {/* Step 6 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    6
                  </span>
                  <h3 className="text-sm font-bold text-white">Adım 6: Güvenlik Duvarı (Windows Firewall) Ayarı</h3>
                </div>
                <span className="text-[10px] text-rose-400 font-mono bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                  Ağ İzni
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                <code className="text-amber-300">npm run dev</code> yaptığınızda Windows "Güvenlik Uyarısı" açabilir.
                <b>"Özel Ağlar (Ev/İş)"</b> kutucuğunu işaretleyip <b>"Erişime İzin Ver"</b> butonuna tıklayın. Böylece dışarıdaki ESP32 cihazları Port 3000 üzerinden bilgisayarınıza ulaşabilir.
              </p>
              <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800 text-xs text-emerald-400 font-mono">
                ✓ Port 3000 yerel ağ geçidine açıldı.
              </div>
            </div>
          </div>

          {/* Quick Test Console Section */}
          <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Adım 7: Komut Satırından İlk Test Verisini Gönderin</span>
            </h3>
            <p className="text-xs text-slate-400">
              Henüz ESP32 bağlamadıysanız, bilgisayarınızda yeni bir Komut Satırı (CMD) penceresi açıp aşağıdaki cURL komutunu kopyalayıp yapıştırın. Sistem veriyi hemen işleyecektir!
            </p>
            <div className="relative">
              <button
                onClick={() =>
                  handleCopy(
                    `curl -X POST "http://localhost:3000/api/v1/telemetry" -H "Content-Type: text/plain" -d "NEXUS_DEV_982341, Saha_Test_01, sıcaklık:37.8, nem:62.5"`,
                    'local_test_curl'
                  )
                }
                className="absolute right-3 top-3 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow transition"
              >
                {copiedSection === 'local_test_curl' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Kopyala</span>
              </button>
              <pre className="p-4 bg-[#020617] text-cyan-300 rounded-2xl border border-slate-800 text-xs font-mono overflow-x-auto leading-relaxed pr-24">
                curl -X POST "http://localhost:3000/api/v1/telemetry" -H "Content-Type: text/plain" -d "NEXUS_DEV_982341, Saha_Test_01, sıcaklık:37.8, nem:62.5"
              </pre>
            </div>
            <p className="text-[11px] text-slate-400">
              💡 Gönderim yaptıktan sonra paneldeki <strong className="text-white">Cihazlar &gt; Anlık Port Terminali</strong> sekmesini açarak veri paketinizin geliş anını milisaniyelik gecikmeyle canlı izleyebilirsiniz!
            </p>
          </div>
        </div>
      )}

      {/* TAB 1: STEP-BY-STEP WALKTHROUGH */}
      {activeStepTab === 'steps' && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">Hiç tecrübeniz yok mu? Endişelenmeyin!</strong>
              <p className="mt-0.5 text-slate-400">
                Aşağıdaki siyah kod kutularındaki komutları kopyalayıp sunucu terminalinize (SSH) yapıştırmanız yeterlidir.
                Sistem tüm servisleri, veritabanını ve bağlantıları otomatik ayağa kaldıracaktır.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step 1 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    1
                  </span>
                  <h3 className="text-sm font-bold text-white">1. Sunucuya Bağlanın ve Docker'ı Kurun</h3>
                </div>
                <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  Ubuntu / Linux
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Sunucunuza bilgisayarınızın terminalinden SSH ile bağlanın ve Docker motorunu yükleyin.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>SSH Bağlantı Komutu:</span>
                </div>
                <pre className="p-3 bg-[#020617] text-cyan-300 rounded-2xl border border-slate-800 text-xs font-mono">
                  ssh root@192.168.1.100
                </pre>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                  <span>Tek Tıkla Docker Kurulum Komutu:</span>
                </div>
                <pre className="p-3 bg-[#020617] text-emerald-400 rounded-2xl border border-slate-800 text-xs font-mono">
                  curl -fsSL https://get.docker.com | sh
                </pre>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-cyan-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    2
                  </span>
                  <h3 className="text-sm font-bold text-white">2. Projeyi Sunucuya İndirin ve Konfigüre Edin</h3>
                </div>
                <span className="text-[10px] text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  Git & .env
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Kod deposunu sunucunuza çekin ve özel konfigürasyon dosyanızı (.env) oluşturun.
              </p>
              <div className="space-y-2">
                <pre className="p-3.5 bg-[#020617] text-slate-200 rounded-2xl border border-slate-800 text-xs font-mono leading-relaxed">
                  {`git clone https://github.com/kullanici/iot-dashboard.git\ncd iot-dashboard\ncp .env.example .env`}
                </pre>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    3
                  </span>
                  <h3 className="text-sm font-bold text-white">3. Docker Compose İle Sistemi Çalıştırın</h3>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Arka Plan Servisi
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Bu komut PostgreSQL veritabanını, Node.js sunucusunu ve WebSocket katmanını arka planda ayağa kaldırır.
              </p>
              <div className="space-y-2">
                <pre className="p-3.5 bg-[#020617] text-amber-300 rounded-2xl border border-slate-800 text-xs font-mono leading-relaxed">
                  {`docker compose up -d --build\n\n# Durumu kontrol etmek için:\ndocker ps`}
                </pre>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    4
                  </span>
                  <h3 className="text-sm font-bold text-white">4. SSL (HTTPS) & Nginx Alan Adı Ayarı</h3>
                </div>
                <span className="text-[10px] text-purple-400 font-mono bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Ücretsiz Let's Encrypt
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                İnternetten güvenli (https://) erişim sağlamak için Certbot ile ücretsiz SSL sertifikası alın.
              </p>
              <div className="space-y-2">
                <pre className="p-3.5 bg-[#020617] text-purple-300 rounded-2xl border border-slate-800 text-xs font-mono leading-relaxed">
                  {`sudo apt update && sudo apt install nginx certbot python3-certbot-nginx -y\n\n# Otomatik SSL Kurulumu:\nsudo certbot --nginx -d panel.sirketim.com`}
                </pre>
              </div>
            </div>
          </div>

          {/* Quick Verification Panel */}
          <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Kurulumun Başarılı Olduğunu Nasıl Anlarım?</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800">
                <span className="text-cyan-400 font-bold block mb-1">1. Web Arayüzü</span>
                <p className="text-slate-400">Tarayıcınızdan <code className="text-amber-300">http://IP_ADRESINIZ:3000</code> adresine girdiğinizde giriş ekranı açılmalıdır.</p>
              </div>
              <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800">
                <span className="text-emerald-400 font-bold block mb-1">2. Veritabanı Durumu</span>
                <p className="text-slate-400"><code className="text-amber-300">docker logs nexus_postgres</code> komutunda "database system is ready to accept connections" görülmelidir.</p>
              </div>
              <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800">
                <span className="text-indigo-400 font-bold block mb-1">3. Live Terminal</span>
                <p className="text-slate-400">Cihazlar sekmesindeki Anlık Terminalde saha test paketleri 201 OK kodu ile düşmelidir.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LOCAL TO PRODUCTION MIGRATION */}
      {activeStepTab === 'migration' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-gradient-to-r from-purple-950/60 via-slate-900 to-slate-900 p-5 rounded-3xl border border-purple-500/30 text-xs text-slate-300 flex items-start gap-3 shadow-xl">
            <Share2 className="w-6 h-6 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white text-sm font-bold block mb-0.5">Yerel Testlerden Canlı (Production) Sisteme Kesintisiz Geçiş</strong>
              <p className="text-slate-300 leading-relaxed">
                Kendi bilgisayarınızda yaptığınız testler tamamlandığında ve cihaz tanımlamalarınız oturduğunda, verilerinizi ve cihaz kayıtlarınızı canlı sunucuya aktarmak sadece birkaç dakikanızı alır.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Migration Step 1 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    1
                  </span>
                  <h3 className="text-sm font-bold text-white">1. Yerel Veritabanını Dışa Aktarın (Export / Dump)</h3>
                </div>
                <span className="text-[10px] text-purple-400 font-mono bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  pg_dump
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Kendi bilgisayarınızda biriktirdiğiniz test cihazı verilerini ve ayarlarını tek dosya halinde yedekleyin:
              </p>
              <pre className="p-3.5 bg-[#020617] text-purple-300 rounded-2xl border border-slate-800 text-xs font-mono leading-relaxed">
                {`docker exec -t nexus_postgres pg_dump -U nexus_user nexus_dashboard > yerel_yedek.sql`}
              </pre>
            </div>

            {/* Migration Step 2 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    2
                  </span>
                  <h3 className="text-sm font-bold text-white">2. Yedeği Canlı Sunucuya Kopyalayın</h3>
                </div>
                <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  SCP Transfer
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Oluşturduğunuz <code className="text-amber-300">yerel_yedek.sql</code> dosyasını güvenli SCP komutuyla canlı sunucunuza aktarın:
              </p>
              <pre className="p-3.5 bg-[#020617] text-cyan-300 rounded-2xl border border-slate-800 text-xs font-mono leading-relaxed">
                {`scp yerel_yedek.sql root@panel.sirketim.com:/root/iot-dashboard/`}
              </pre>
            </div>

            {/* Migration Step 3 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    3
                  </span>
                  <h3 className="text-sm font-bold text-white">3. Canlı Veritabanına Yedeği Geri Yükleyin</h3>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Restore
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Canlı sunucuda komutu çalıştırarak tüm yerel cihaz tanımlarınızı ve telemetri geçmişinizi canlı veritabanına işleyin:
              </p>
              <pre className="p-3.5 bg-[#020617] text-emerald-400 rounded-2xl border border-slate-800 text-xs font-mono leading-relaxed">
                {`docker exec -i nexus_postgres psql -U nexus_user -d nexus_dashboard < yerel_yedek.sql`}
              </pre>
            </div>

            {/* Migration Step 4 */}
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    4
                  </span>
                  <h3 className="text-sm font-bold text-white">4. Saha Cihazlarını Canlı Domain'e Yönlendirin</h3>
                </div>
                <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  ESP32 / OTA Güncelleme
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                ESP32 veya saha cihazlarınızın yazılımındaki sunucu adresini yerel IP'den canlı domain adınıza güncelleyin:
              </p>
              <div className="p-3 bg-[#020617] rounded-2xl border border-slate-800 text-xs font-mono flex items-center justify-between">
                <span className="line-through text-rose-400">http://192.168.1.45:3000</span>
                <ArrowRight className="w-4 h-4 text-slate-500" />
                <span className="text-emerald-400 font-bold">https://panel.sirketim.com</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE CONFIGURATOR */}
      {activeStepTab === 'configurator' && (
        <div className="space-y-6">
          <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Kişiselleştirilmiş Yapılandırma Üretici</h3>
                <p className="text-xs text-slate-400">
                  Sunucu bilgilerinizi aşağıdaki kutucuklara yazın, tüm Docker, Nginx ve .env dosyalarınız anında otomatik oluşturulsun!
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs pt-2">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Sunucu Adı / Domain / IP:</label>
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={customServerAddress}
                    onChange={(e) => setCustomServerAddress(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                    placeholder="panel.sirketim.com veya 192.168.1.100:3000"
                  />
                </div>
                {/* Local IP Quick Presets */}
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  <span className="text-[10px] text-slate-500 font-semibold">Hızlı Doldur:</span>
                  <button
                    type="button"
                    onClick={() => setCustomServerAddress('192.168.1.100:3000')}
                    className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded font-mono border border-slate-700"
                  >
                    192.168.1.100:3000 (Yerel Ağ IP)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomServerAddress('localhost:3000')}
                    className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded font-mono border border-slate-700"
                  >
                    localhost:3000
                  </button>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">PostgreSQL Veritabanı Şifresi:</label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={customDbPassword}
                    onChange={(e) => setCustomDbPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-amber-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">API Güvenlik Anahtarı (Token):</label>
                <div className="relative">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Uygulama Portu:</label>
                <div className="relative">
                  <HardDrive className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={customAppPort}
                    onChange={(e) => setCustomAppPort(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-emerald-400 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Docker Compose Generated Box */}
          <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  docker-compose.yml (Sunucunuz İçin Özel Üretildi)
                </h3>
              </div>
              <button
                onClick={() => handleCopy(dockerComposeYaml, 'docker')}
                className="px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-xl text-xs font-bold flex items-center gap-1 border border-indigo-500/30 transition"
              >
                {copiedSection === 'docker' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Kopyala</span>
              </button>
            </div>

            <pre className="p-4 bg-[#020617] text-slate-200 rounded-2xl border border-slate-800 overflow-x-auto text-xs font-mono leading-relaxed">
              {dockerComposeYaml}
            </pre>
          </div>

          {/* .env Generated Box */}
          <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  .env (Ortam Değişkenleri Dosyası)
                </h3>
              </div>
              <button
                onClick={() => handleCopy(envFileContent, 'env')}
                className="px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 rounded-xl text-xs font-bold flex items-center gap-1 border border-cyan-500/30 transition"
              >
                {copiedSection === 'env' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Kopyala</span>
              </button>
            </div>

            <pre className="p-4 bg-[#020617] text-amber-300 rounded-2xl border border-slate-800 overflow-x-auto text-xs font-mono leading-relaxed">
              {envFileContent}
            </pre>
          </div>

          {/* Nginx Generated Box */}
          <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Nginx & SSL Reverse Proxy Yapılandırması
                </h3>
              </div>
              <button
                onClick={() => handleCopy(nginxConfig, 'nginx')}
                className="px-3 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-xl text-xs font-bold flex items-center gap-1 border border-purple-500/30 transition"
              >
                {copiedSection === 'nginx' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Kopyala</span>
              </button>
            </div>

            <pre className="p-4 bg-[#020617] text-purple-300 rounded-2xl border border-slate-800 overflow-x-auto text-xs font-mono leading-relaxed">
              {nginxConfig}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 5: NODEMCU & ESP TEST CODES */}
      {activeStepTab === 'nodemcu_esp' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-900 p-6 rounded-3xl border border-emerald-500/30 text-xs text-slate-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xl relative overflow-hidden">
            <div className="flex items-start gap-3.5 z-10">
              <span className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shrink-0">
                <Cpu className="w-7 h-7" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold rounded-full uppercase tracking-wider">
                    Gerçek Donanım Testi
                  </span>
                  <span className="px-2.5 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold rounded-full uppercase tracking-wider font-mono">
                    Arduino C++ (.ino)
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-white mt-1">
                  NodeMCU (ESP8266) & ESP32 Gerçek Cihaz Kod Örnekleri
                </h3>
                <p className="text-slate-300 leading-relaxed mt-1 max-w-3xl">
                  Bu kodları kopyala-yapıştır yapıp direkt Arduino IDE üzerinden cihazınıza yükleyebilirsiniz. Kod içerisindeki sunucu adresi ve API Key, <b>4. Canlı Yapılandırma Üretici</b> sekmesinde tanımladığınız değerlere göre (<code className="text-emerald-400 font-mono font-bold">{customServerAddress}</code>) otomatik güncellenir!
                </p>
              </div>
            </div>

            <div className="bg-slate-950/90 p-3.5 rounded-2xl border border-slate-800 text-[11px] text-slate-300 font-mono shrink-0 space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Anlık Aktif Sunucu Hedefi</span>
              <div className="text-emerald-400 font-bold">http://{customServerAddress}/api/v1/telemetry</div>
              <div className="text-amber-300 font-bold">API Token: {customApiKey}</div>
            </div>
          </div>

          {/* Sub-Tabs Selector */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
            <button
              onClick={() => setSelectedEspTab('nodemcu_http')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                selectedEspTab === 'nodemcu_http'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Cpu className="w-4 h-4 text-emerald-300" />
              <span>NodeMCU (ESP8266) HTTP POST</span>
            </button>

            <button
              onClick={() => setSelectedEspTab('esp32_http')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                selectedEspTab === 'esp32_http'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Zap className="w-4 h-4 text-cyan-300" />
              <span>ESP32 (WROOM / DevKit) HTTP POST</span>
            </button>

            <button
              onClick={() => setSelectedEspTab('esp_websocket')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                selectedEspTab === 'esp_websocket'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Radio className="w-4 h-4 text-indigo-300" />
              <span>ESP32 / NodeMCU Canlı WebSocket Streaming</span>
            </button>

            <button
              onClick={() => setSelectedEspTab('ide_setup')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                selectedEspTab === 'ide_setup'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <HelpCircle className="w-4 h-4 text-amber-300" />
              <span>Arduino IDE & Sürücü Kurulumu</span>
            </button>
          </div>

          {/* TAB CONTENT: NodeMCU HTTP */}
          {selectedEspTab === 'nodemcu_http' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-emerald-400" />
                      NodeMCU (ESP8266) Arduino C++ Taslağı (.ino)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      ESP8266Wi-Fi kütüphanesini kullanarak sensör verilerini her 5 saniyede bir panel REST API'sine iletir.
                    </p>
                  </div>

                  <button
                    onClick={() => handleCopy(nodeMcuCodeSnippet, 'nodemcu_code')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition self-start sm:self-auto shrink-0 cursor-pointer"
                  >
                    {copiedSection === 'nodemcu_code' ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>Kodu Kopyala</span>
                  </button>
                </div>

                <div className="relative">
                  <pre className="p-5 bg-[#020617] text-emerald-300 rounded-2xl border border-slate-800 overflow-x-auto text-xs font-mono leading-relaxed max-h-[550px] scrollbar-thin">
                    {nodeMcuCodeSnippet}
                  </pre>
                </div>
              </div>

              {/* Hardware Pinout Table */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    NodeMCU Pin Bağlantı Şeması
                  </h4>
                  <div className="overflow-x-auto text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                          <th className="py-2">NodeMCU Pin</th>
                          <th className="py-2">Fonksiyon / Bacak</th>
                          <th className="py-2">Açıklama</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                        <tr>
                          <td className="py-2 text-amber-300 font-bold">A0</td>
                          <td className="py-2">Analog Giriş (0-1.0V)</td>
                          <td className="py-2 font-sans">Sıcaklık/Işık Sensörü veya Potansiyometre</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-cyan-300 font-bold">D4 (GPIO2)</td>
                          <td className="py-2">Dahili Mavi LED</td>
                          <td className="py-2 font-sans">Wi-Fi durum indikatörü (Flaş yapar)</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-emerald-300 font-bold">3V3 & GND</td>
                          <td className="py-2">3.3V Güç Beslemesi</td>
                          <td className="py-2 font-sans">Sensör güç bağlantıları</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Seri Port Ekranında (115200 Baud) Beklenen Çıktı
                  </h4>
                  <pre className="p-3 bg-[#020617] text-slate-300 rounded-2xl border border-slate-800 text-[11px] font-mono leading-relaxed">
{`=============================================
  NodeMCU (ESP8266) IoT Gerçek Cihaz Başladı 
=============================================
.....
[WiFi] Bağlantı Başarılı!
[WiFi] IP Adresi: 192.168.1.108

[NodeMCU TX] -> NEXUS_DEV_982341, NodeMCU_Saha_Node_01, sıcaklık:24.8, nem:53.2
[NodeMCU RX] HTTP 200 OK! Sunucu Yanıtı: {"status":"success","readingId":"read_982"}`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: ESP32 HTTP */}
          {selectedEspTab === 'esp32_http' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Zap className="w-5 h-5 text-cyan-400" />
                      ESP32 (WROOM / DevKit) Arduino C++ Taslağı (.ino)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Çift çekirdekli ESP32 mikrodenetleyiciler için yüksek performanslı HTTP POST istemcisi.
                    </p>
                  </div>

                  <button
                    onClick={() => handleCopy(esp32AdvancedCodeSnippet, 'esp32_adv_code')}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-600/20 transition self-start sm:self-auto shrink-0 cursor-pointer"
                  >
                    {copiedSection === 'esp32_adv_code' ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>Kodu Kopyala</span>
                  </button>
                </div>

                <div className="relative">
                  <pre className="p-5 bg-[#020617] text-cyan-300 rounded-2xl border border-slate-800 overflow-x-auto text-xs font-mono leading-relaxed max-h-[550px] scrollbar-thin">
                    {esp32AdvancedCodeSnippet}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: ESP WebSocket */}
          {selectedEspTab === 'esp_websocket' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Radio className="w-5 h-5 text-indigo-400" />
                      ESP32 / NodeMCU Canlı WebSocket Akış Kodu
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      HTTP polling yükü olmadan doğrudan sunucunun WebSocket portuna (<code className="text-indigo-400 font-mono">/ws</code>) bağlanarak anlık milisaniyelik veri aktarımı sağlar.
                    </p>
                  </div>

                  <button
                    onClick={() => handleCopy(espWebsocketSnippet, 'esp_ws_code')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition self-start sm:self-auto shrink-0 cursor-pointer"
                  >
                    {copiedSection === 'esp_ws_code' ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>Kodu Kopyala</span>
                  </button>
                </div>

                <div className="relative">
                  <pre className="p-5 bg-[#020617] text-indigo-300 rounded-2xl border border-slate-800 overflow-x-auto text-xs font-mono leading-relaxed max-h-[550px] scrollbar-thin">
                    {espWebsocketSnippet}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: Arduino IDE Setup */}
          {selectedEspTab === 'ide_setup' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-amber-400" />
                  Arduino IDE, Kart Yöneticisi & Sürücü (CH340/CP2102) Adımları
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                    <strong className="text-amber-300 block font-bold text-sm">1. ESP8266 Kart URL'si (NodeMCU)</strong>
                    <p className="text-slate-300 leading-relaxed">
                      Arduino IDE &gt; Dosya &gt; Tercihler &gt; <b>Ek Kart Yöneticisi URL'leri</b> kısmına yapıştırın:
                    </p>
                    <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-emerald-400 font-mono text-[11px] select-all">
                      http://arduino.esp8266.com/stable/package_esp8266com_index.json
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                    <strong className="text-cyan-300 block font-bold text-sm">2. ESP32 Kart URL'si</strong>
                    <p className="text-slate-300 leading-relaxed">
                      Arduino IDE &gt; Dosya &gt; Tercihler &gt; <b>Ek Kart Yöneticisi URL'leri</b> kısmına ekleyin:
                    </p>
                    <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-cyan-400 font-mono text-[11px] select-all">
                      https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <strong className="text-purple-300 block font-bold text-sm">3. CH340 / CP2102 USB Sürücü Kontrolü</strong>
                  <p className="text-slate-300 leading-relaxed">
                    Cihazı USB kablosu ile bilgisayara bağladığınızda Arduino IDE &gt; Araçlar &gt; Port kısmında <b>COM3, COM4</b> görünmüyorsa klon kartlar için CH340 veya CP210x USB dönüştürücü sürücüsünü kurmanız gerekir.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DEVICE CODE SNIPPETS */}
      {activeStepTab === 'device_code' && (
        <div className="space-y-6">
          <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-emerald-400" />
                  Saha Cihazları Veri Gönderim Şablonları
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  ESP32 mikrodenetleyici, Raspberry Pi veya herhangi bir yazılımdan sunucuya telemetri paketi iletme kodları.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800">
                <button
                  onClick={() => setSelectedLanguage('esp32')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    selectedLanguage === 'esp32'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ESP32 (Arduino C++)
                </button>
                <button
                  onClick={() => setSelectedLanguage('python')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    selectedLanguage === 'python'
                      ? 'bg-cyan-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Python Script
                </button>
                <button
                  onClick={() => setSelectedLanguage('curl')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    selectedLanguage === 'curl'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  cURL Komutu
                </button>
              </div>
            </div>

            {/* Code Box */}
            <div className="relative">
              <button
                onClick={() =>
                  handleCopy(
                    selectedLanguage === 'esp32'
                      ? esp32CodeSnippet
                      : selectedLanguage === 'python'
                      ? pythonCodeSnippet
                      : curlCodeSnippet,
                    'device_code'
                  )
                }
                className="absolute right-4 top-4 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 border border-slate-700 shadow"
              >
                {copiedSection === 'device_code' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Kopyala</span>
              </button>

              <pre className="p-5 bg-[#020617] text-slate-200 rounded-2xl border border-slate-800 overflow-x-auto text-xs font-mono leading-relaxed max-h-[500px]">
                {selectedLanguage === 'esp32'
                  ? esp32CodeSnippet
                  : selectedLanguage === 'python'
                  ? pythonCodeSnippet
                  : curlCodeSnippet}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ROADMAP & TERMINOLOGY FOR BEGINNERS */}
      {activeStepTab === 'roadmap' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">VPS / Sunucu Nedir?</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                7/24 kesintisiz çalışan, sabit IP adresine sahip uzak bir bilgisayardır. Hetzner, DigitalOcean veya kendi evinizdeki bir Raspberry Pi / eski dizüstü bilgisayarı sunucu olarak kullanabilirsiniz.
              </p>
            </div>

            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Docker & Container Nedir?</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Uygulamanızı ve PostgreSQL veritabanınızı tüm kütüphaneleriyle birlikte izole bir kutu (container) içine paketler. "Bende çalışıyordu sunucuda çalışmıyor" sorununu %100 çözer.
              </p>
            </div>

            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">PostgreSQL Nedir?</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Dünyanın en güvenilir ve hızlı açık kaynaklı ilişkisel veritabanıdır. Milyonlarca sensör verisini, kullanıcıları ve cihaz loglarını güvenle depolar.
              </p>
            </div>

            <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold text-white">Nginx & SSL (Certbot) Nedir?</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Gelen internet trafiğini karşılar, kilitli yeşil HTTPS ikonunu (SSL) sağlar ve canlı WebSocket akışını kopmadan kullanıcı tarayıcısına iletir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: TROUBLESHOOTING */}
      {activeStepTab === 'troubleshoot' && (
        <div className="space-y-4">
          <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <span>Sık Karşılaşılan Hatalar ve Anlaşılır Çözümleri</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-1">
                <strong className="text-rose-400 block">1. Error: "bind: address already in use" veya Port 3000 dolu</strong>
                <p className="text-slate-300">
                  Sunucuda 3000 portunu kullanan başka bir süreç vardır. <code className="text-amber-300 font-mono">sudo lsof -i :3000</code> ile işlemi bulup sonlandırabilir veya <code className="text-amber-300 font-mono">docker-compose.yml</code> içinde portu <code className="text-amber-300 font-mono">"3001:3000"</code> yapabilirsiniz.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-1">
                <strong className="text-amber-400 block">2. PostgreSQL "FATAL: password authentication failed"</strong>
                <p className="text-slate-300">
                  .env dosyanızdaki şifre ile docker-compose.yml içindeki POSTGRES_PASSWORD eşleşmiyordur. İki dosyada da şifrenin birebir aynı olduğundan emin olun.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-1">
                <strong className="text-cyan-400 block">3. Saha Cihazı "401 Unauthorized" Hatası Alıyor</strong>
                <p className="text-slate-300">
                  Cihazın gönderdiği paketin ilk elemanı geçerli bir API Token olmalıdır. Örneğin: <code className="text-amber-300 font-mono">NEXUS_DEV_982341, Cihaz_Adi, sıcaklık:37.5</code>. Token'ın Cihazlar sekmesinde kayıtlı olduğundan emin olun.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-1">
                <strong className="text-purple-400 block">4. WebSocket "Connection failed" veya Anlık Veri Akmıyor</strong>
                <p className="text-slate-300">
                  Nginx reverse proxy kullanıyorsanız, nginx.conf dosyasında <code className="text-amber-300 font-mono">proxy_set_header Upgrade $http_upgrade;</code> ve <code className="text-amber-300 font-mono">proxy_set_header Connection "Upgrade";</code> satırlarının eklendiğinden emin olun.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

