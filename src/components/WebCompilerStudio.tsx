import React, { useState } from 'react';
import { apiFetch } from '../lib/apiFetch';
import {
  Code,
  Play,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  Cpu,
  Layers,
  BookOpen,
} from 'lucide-react';
import type { Firmware, Device } from '../types';

interface WebCompilerStudioProps {
  onFirmwareCompiled?: (firmware: Firmware) => void;
  devices?: Device[];
}

const TEMPLATE_NODEMCU_OTA = `// =========================================================================
// NEXUSNODE IoT - NODEMCU (ESP8266) CANLI OTA & RÖLE KONTROL KODU
// =========================================================================
#include <ESP8266WiFi.h>
#include <ESP8266httpUpdate.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID     = "WIFI_AG_ADINIZ";
const char* WIFI_PASS     = "WIFI_SIFRENIZ";
const char* WS_HOST       = "localhost";
const int   WS_PORT       = 443;
const char* API_KEY       = "nkn_live_YOUR_DEVICE_TOKEN";

const char* FIRMWARE_VERSION  = "v1.1.0";
const char* HARDWARE_MODEL    = "ESP8266_NODEMCU";
const char* ROLE_KEY          = "NODEMCU_MAIN";

const int RELAY_PIN       = D1;  // GPIO5
const int STATUS_LED      = D4;  // GPIO2

WebSocketsClient webSocket;
unsigned long lastSend = 0;
bool relayState = false;

void setRelay(bool state) {
  relayState = state;
  digitalWrite(RELAY_PIN, state ? LOW : HIGH); // Active-Low
}

void performOTA(const String& url) {
  WiFiClientSecure client;
  client.setInsecure();
  ESPhttpUpdate.rebootOnUpdate(true);
  ESPhttpUpdate.update(client, url);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_CONNECTED) {
    Serial.println("[WS] Cihaz Çevrimiçi!");
  } else if (type == WStype_TEXT) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, payload);
    String msgType = doc["type"] | "";

    if (msgType == "ota_trigger" || msgType == "ota") {
      String url = doc["data"]["url"] | doc["data"]["downloadUrl"] | "";
      if (url.length() > 0) performOTA(url);
    } else if (msgType == "command") {
      String val = doc["data"]["value"] | "";
      setRelay(val.equalsIgnoreCase("ON") || val == "1");
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  setRelay(false);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Bağlandı!");

  String wsUrl = "/ws/device?token=" + String(API_KEY);
  webSocket.beginSSL(WS_HOST, WS_PORT, wsUrl.c_str());
  webSocket.onEvent(webSocketEvent);
}

void loop() {
  webSocket.loop();

  if (millis() - lastSend > 8000) {
    lastSend = millis();
    if (WiFi.status() == WL_CONNECTED) {
      String payload = "{\\"type\\":\\"telemetry\\",\\"data\\":{\\"sicaklik\\":24.5,\\"relay\\":" + String(relayState ? 1 : 0) + "}}";
      webSocket.sendTXT(payload);
    }
  }
}`;

const TEMPLATE_ESP32_OTA = `// =========================================================================
// NEXUSNODE IoT - ESP32 DUAL-CORE ROOT OF TRUST & OTA KODU
// =========================================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <ArduinoJson.h>

const char* WIFI_SSID     = "WIFI_AG_ADINIZ";
const char* WIFI_PASS     = "WIFI_SIFRENIZ";
const char* SERVER_URL    = "https://localhost";
const char* API_KEY       = "nkn_live_ESP32_TOKEN";

const char* FIRMWARE_VERSION  = "v1.2.0";
const char* HARDWARE_MODEL    = "ESP32_WROOM_32";
const char* ROLE_KEY          = "ESP32_SENSOR";

const int RELAY_PIN       = 26;
const int LED_PIN         = 2;

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\\nESP32 WiFi Hazır!");
}

void loop() {
  // Telemetri ve sensör döngüsü
  delay(5000);
}`;

export const WebCompilerStudio: React.FC<WebCompilerStudioProps> = ({
  onFirmwareCompiled,
  devices = [],
}) => {
  const [board, setBoard] = useState<'ESP8266_NODEMCU' | 'ESP32_WROOM_32' | 'ESP8266_GENERIC' | 'ESP32_S3'>('ESP8266_NODEMCU');
  const [name, setName] = useState('NodeMCU Akıllı Saha Firmware');
  const [version, setVersion] = useState('v1.2.0');
  const [roleKey, setRoleKey] = useState('NODEMCU_MAIN');
  const [deviceType, setDeviceType] = useState('nodemcu_v3');
  const [description, setDescription] = useState('Web Compiler ile derlendi.');
  const [code, setCode] = useState(TEMPLATE_NODEMCU_OTA);

  const [compiling, setCompiling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; title: string; text?: string; details?: string[] } | null>(null);
  const [compiledResult, setCompiledResult] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  // Switch templates
  const handleSelectTemplate = (type: 'nodemcu' | 'esp32') => {
    if (type === 'nodemcu') {
      setBoard('ESP8266_NODEMCU');
      setName('NodeMCU Akıllı Saha Firmware');
      setRoleKey('NODEMCU_MAIN');
      setDeviceType('nodemcu_v3');
      setVersion('v1.1.0');
      setCode(TEMPLATE_NODEMCU_OTA);
    } else {
      setBoard('ESP32_WROOM_32');
      setName('ESP32 Endüstriyel Sensör & OTA');
      setRoleKey('ESP32_SENSOR');
      setDeviceType('esp32_wroom');
      setVersion('v1.2.0');
      setCode(TEMPLATE_ESP32_OTA);
    }
    setStatusMessage(null);
    setCompiledResult(null);
  };

  // 1. Syntax & Static Analysis Check
  const handleCheckCode = async () => {
    setVerifying(true);
    setStatusMessage(null);
    try {
      const res = await apiFetch('/api/compiler/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, targetBoard: board }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Statik analiz başarısız.');

      const { analysis } = data;
      if (analysis.valid) {
        setStatusMessage({
          type: 'success',
          title: 'Sözdizimi ve Yapı Geçerli!',
          text: `Kod hatasız görünüyor. Setup ve Loop fonksiyonları eksiksiz. ${analysis.warnings.length > 0 ? 'Uyarılar: ' + analysis.warnings.join(' | ') : ''}`,
          details: analysis.warnings,
        });
      } else {
        setStatusMessage({
          type: 'error',
          title: 'Sözdizimi Hataları Bulundu',
          text: 'Lütfen C++ kodunuzdaki aşağıdaki hataları düzeltin:',
          details: analysis.errors,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        title: 'Analiz Hatası',
        text: err.message || 'Kod analizi sırasında hata oluştu.',
      });
    } finally {
      setVerifying(false);
    }
  };

  // 2. Compile to .bin & Auto Publish
  const handleCompileAndPublish = async () => {
    setCompiling(true);
    setStatusMessage(null);
    setCompiledResult(null);
    try {
      const res = await apiFetch('/api/compiler/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          name,
          version,
          targetBoard: board,
          deviceType,
          roleKey,
          description,
          autoPublish: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Derleme işlemi başarısız oldu.');
      }

      setCompiledResult(data);
      setStatusMessage({
        type: 'success',
        title: 'Firmware Başarıyla Derlendi ve İmzalandı!',
        text: `${data.firmware.name} (${data.firmware.version}) oluşturuldu, Ed25519 ile imzalandı ve OTA Kütüphanesine eklendi. Artık doğrudan cihazlarınıza OTA görevi başlatabilirsiniz!`,
      });

      if (onFirmwareCompiled) {
        onFirmwareCompiled(data.firmware);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        title: 'Derleme Başarısız Oldu',
        text: err.message || 'C++ derleme motoru hatası.',
      });
    } finally {
      setCompiling(false);
    }
  };

  const handleDownloadBin = async () => {
    if (!compiledResult?.firmware?.id) return;
    try {
      const res = await apiFetch(`/api/firmwares/${compiledResult.firmware.id}/download`);
      if (!res.ok) throw new Error('Dosya indirilemedi.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${compiledResult.firmware.roleKey}_${compiledResult.firmware.version}.bin`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert('İndirme hatası: ' + err.message);
    }
  };

  return (
    <div className="space-y-6" id="web-compiler-studio-container">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-cyan-900/40 via-indigo-900/30 to-slate-900 border border-cyan-500/20 rounded-2xl p-6 text-white relative overflow-hidden shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30">
                <Code className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold tracking-tight">Arduino C++ Web Derleyici & OTA Stüdyosu</h2>
              <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                CANLI DERLEYİCİ
              </span>
            </div>
            <p className="text-sm text-slate-300 max-w-2xl">
              NodeMCU (ESP8266) veya ESP32 C++ kodunuzu tarayıcı üzerinden yazın, tek tıkla <strong>.bin</strong> ikili dosyasına derleyin ve doğrudan sahadaki cihazlarınıza kablosuz (OTA) olarak yükleyin.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="template-btn-nodemcu"
              onClick={() => handleSelectTemplate('nodemcu')}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                board === 'ESP8266_NODEMCU'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              NodeMCU (ESP8266) Şablonu
            </button>
            <button
              type="button"
              id="template-btn-esp32"
              onClick={() => handleSelectTemplate('esp32')}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                board === 'ESP32_WROOM_32'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              ESP32 Şablonu
            </button>
          </div>
        </div>
      </div>

      {/* Compiler Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Hedef Mikrodenetleyici (Board)
          </label>
          <select
            id="compiler-target-board"
            value={board}
            onChange={(e) => setBoard(e.target.value as any)}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="ESP8266_NODEMCU">NodeMCU v2/v3 (ESP8266)</option>
            <option value="ESP32_WROOM_32">ESP32 DevKit / WROOM-32</option>
            <option value="ESP32_S3">ESP32-S3 Dual-Core</option>
            <option value="ESP8266_GENERIC">Generic ESP8266 (ESP-01/12E)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Firmware Adı
          </label>
          <input
            id="compiler-firmware-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn: Saha İstasyonu v2"
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Sürüm (SemVer)
          </label>
          <input
            id="compiler-firmware-version"
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="v1.0.0"
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Görev Kimliği (Role Key)
          </label>
          <input
            id="compiler-firmware-rolekey"
            type="text"
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value.toUpperCase())}
            placeholder="NODEMCU_MAIN"
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      </div>

      {/* Code Editor Area */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Editor Toolbar */}
        <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 bg-cyan-950/60 px-2.5 py-1 rounded-md border border-cyan-800/40">
              <Code className="w-3.5 h-3.5" />
              sketch.ino ({code.split('\n').length} satır)
            </span>
            <span className="text-xs text-slate-400">
              C++ 17 | ESP Flash Format 0xE9
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-verify-syntax"
              onClick={handleCheckCode}
              disabled={verifying || compiling}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
              Kodu Doğrula (Sözdizimi)
            </button>

            <button
              type="button"
              id="btn-compile-and-publish"
              onClick={handleCompileAndPublish}
              disabled={compiling || verifying}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 rounded-lg shadow-md transition-all disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 fill-current ${compiling ? 'animate-pulse' : ''}`} />
              {compiling ? 'Derleniyor...' : 'Derle & .bin Üret (OTA Yayınla)'}
            </button>
          </div>
        </div>

        {/* Textarea Code Input */}
        <div className="relative">
          <textarea
            id="arduino-cpp-source-editor"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={22}
            spellCheck={false}
            className="w-full bg-slate-950 text-emerald-400 font-mono text-sm p-4 leading-relaxed focus:outline-none focus:ring-1 focus:ring-cyan-500/50 resize-y"
            placeholder="// C++ Arduino kodunuzu buraya yazın..."
          />
        </div>
      </div>

      {/* Status & Feedback Area */}
      {statusMessage && (
        <div
          id="compiler-status-alert"
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
              : statusMessage.type === 'warning'
              ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
          }`}
        >
          {statusMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />}
          {statusMessage.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />}
          {statusMessage.type === 'error' && <XCircle className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />}

          <div className="space-y-1 flex-1 text-sm">
            <h4 className="font-semibold">{statusMessage.title}</h4>
            {statusMessage.text && <p className="opacity-90">{statusMessage.text}</p>}

            {statusMessage.details && statusMessage.details.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5 mt-2 font-mono text-xs opacity-90">
                {statusMessage.details.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Result Card: Compiled Binary & Direct Actions */}
      {compiledResult && (
        <div id="compiled-success-card" className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  {compiledResult.firmware.name} ({compiledResult.firmware.version}) Hazır!
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                SHA-256: {compiledResult.firmware.sha256.slice(0, 32)}... | Boyut: {(compiledResult.firmware.binarySize / 1024).toFixed(1)} KB
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-download-compiled-bin"
                onClick={handleDownloadBin}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                .bin Dosyasını İndir
              </button>

              <button
                type="button"
                id="btn-copy-sha256"
                onClick={() => {
                  navigator.clipboard.writeText(compiledResult.firmware.sha256);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/50 rounded-lg transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Kopyalandı!' : 'SHA256 Kopyala'}
              </button>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex items-center justify-between text-xs text-slate-300">
            <span>
              Bu firmware doğrudan <strong>OTA Dağıtım</strong> sekmesinde listelenmiştir. Sahadaki NodeMCU veya ESP32 cihazlarınıza tek tıkla yükleyebilirsiniz.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
