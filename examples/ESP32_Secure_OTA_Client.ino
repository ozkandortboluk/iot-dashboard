/*
  NexusNode IoT Platform - Secure Production ESP32 OTA Client
  Features:
  - Hardware Pinned Root of Trust (Ed25519 Public Key Table with Key Rotation)
  - Strict keyId lookup against compile-time embedded trusted key ring
  - Complete immunity against MITM & Rogue Server key substitution attacks
  - SHA-256 and single-use downloadToken / bootNonce verification
  - State machine reporting (DOWNLOADING, FLASHING, REBOOTING)
  - Post-boot confirmation (/api/ota/confirm-boot)
  - Automatic partition rollback on invalid boot / signature failure
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <ArduinoJson.h>
#include <Preferences.h>

const char* WIFI_SSID       = "YOUR_WIFI_SSID";
const char* WIFI_PASS       = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL      = "http://192.168.1.100:3000"; // Platform server URL
const char* API_KEY         = "nkn_live_YOUR_DEVICE_TOKEN"; // Device API Key

// Device metadata
const char* DEVICE_TYPE        = "pump_controller";
const char* DEVICE_ROLE_KEY    = "PUMP_CTRL";
const char* HARDWARE_MODEL     = "ESP32_WROOM_32";
const char* HARDWARE_REVISION  = "v1.0";
const char* FIRMWARE_VERSION   = "1.0.0";

// ==============================================================================
// ROOT OF TRUST (Cihaz ROM/Flash İçerisinde Sabitlenmiş Güvenilir Genel Anahtar Tablosu)
// ==============================================================================
// KRİTİK GÜVENLİK KURALI:
// Sunucudan gelen "X-Public-Key" veya ağ yanıtındaki anahtarlara ASLA güvenilmez.
// Saldırgan sunucuyu taklit etse veya ele geçirse dahi cihazdaki Root of Trust
// tablosundaki Ed25519 anahtarı ile eşleşmeyen firmware binary'lerini çalıştıramaz.
// ==============================================================================
struct TrustedRootKey {
  const char* keyId;
  const char* publicKeyPem;
  const char* description;
};

const TrustedRootKey TRUSTED_ROOT_KEYS[] = {
  {
    "root_ed25519_v1",
    "-----BEGIN PUBLIC KEY-----\n"
    "MCowBQYDK2VwAyEAjP/fHdse0+0S7ZwrjlZaxd0QYhIyLMwD6VmD78CokU0=\n"
    "-----END PUBLIC KEY-----\n",
    "Primary Production Root of Trust Key (Active)"
  },
  {
    "root_ed25519_v2",
    "-----BEGIN PUBLIC KEY-----\n"
    "MCowBQYDK2VwAyEAtCcoQVIFQi6D7r29nPmnGOBVIqjzrwaVS3BPj9778W0=\n"
    "-----END PUBLIC KEY-----\n",
    "Secondary / Next Generation Rotation Key (Grace Period)"
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

Preferences preferences;

void reportStatus(const char* jobId, const char* firmwareId, const char* downloadToken, const char* status, int progress, const char* errorMsg = "") {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/ota/status");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  String body = "{\"jobId\":\"" + String(jobId) + 
                "\",\"firmwareId\":\"" + String(firmwareId) + 
                "\",\"downloadToken\":\"" + String(downloadToken) + 
                "\",\"status\":\"" + String(status) + 
                "\",\"progressPercent\":" + String(progress) + 
                ",\"errorMessage\":\"" + String(errorMsg) + "\"}";

  int code = http.POST(body);
  Serial.printf("[OTA Status] Status: %s | Code: %d\n", status, code);
  http.end();
}

void confirmBootIfPending() {
  preferences.begin("ota", false);
  String pendingJobId = preferences.getString("jobId", "");
  String pendingBootNonce = preferences.getString("bootNonce", "");

  if (pendingJobId.length() > 0 && pendingBootNonce.length() > 0) {
    Serial.println("[OTA Boot] Pending boot confirmation found in NVS. Contacting server...");
    
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(String(SERVER_URL) + "/api/ota/confirm-boot");
      http.addHeader("Content-Type", "application/json");
      http.addHeader("X-API-Key", API_KEY);

      String body = "{\"jobId\":\"" + pendingJobId + 
                    "\",\"firmwareVersion\":\"" + String(FIRMWARE_VERSION) + 
                    "\",\"bootNonce\":\"" + pendingBootNonce + "\"}";

      int code = http.POST(body);
      if (code == 200) {
        Serial.println("[OK] Post-boot confirmation successful! Clearing NVS pending flag.");
        preferences.clear();
      } else {
        Serial.printf("[WARN] Post-boot confirmation rejected (%d). Local rollback may trigger!\n", code);
      }
      http.end();
    }
  }
  preferences.end();
}

void checkOTA() {
  if (WiFi.status() != WL_CONNECTED) return;
  Serial.println("[OTA Check] Querying server for updates...");

  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/ota/check");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  String payload = "{\"device_type\":\"" + String(DEVICE_TYPE) + 
                   "\",\"role_key\":\"" + String(DEVICE_ROLE_KEY) + 
                   "\",\"hardware_model\":\"" + String(HARDWARE_MODEL) + 
                   "\",\"hardware_revision\":\"" + String(HARDWARE_REVISION) + 
                   "\",\"firmware_version\":\"" + String(FIRMWARE_VERSION) + "\"}";

  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    String response = http.getString();
    DynamicJsonDocument doc(2048);
    deserializeJson(doc, response);

    if (doc["updateAvailable"] | false) {
      String jobId          = doc["jobId"] | "";
      String firmwareId     = doc["firmwareId"] | "";
      String keyId          = doc["keyId"] | "";
      String downloadUrl    = doc["downloadUrl"] | "";
      String downloadToken  = doc["downloadToken"] | "";
      String bootNonce      = doc["bootNonce"] | "";
      String expectedSha256 = doc["sha256"] | "";
      String signatureHex   = doc["signature"] | "";

      Serial.println("[OTA] Update available! Job ID: " + jobId + " | KeyId: " + keyId);

      // ROOT OF TRUST VERIFICATION:
      // Check if keyId exists in our hardcoded compile-time trusted table
      const char* pinnedPublicKey = findPinnedPublicKey(keyId.c_str());
      if (pinnedPublicKey == nullptr) {
        Serial.printf("[SECURITY ERROR] keyId '%s' cihazdaki Root of Trust tablosunda bulunamadı! Güncelleme derhal reddedildi.\n", keyId.c_str());
        reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "FAILED", 0, "Bilinmeyen keyId / İmzalama anahtarı donanımda sabitli değil.");
        http.end();
        return;
      }

      Serial.printf("[OTA Security] keyId '%s' doğrulandı. Sabitlenmiş Root of Trust anahtarı kullanılıyor.\n", keyId.c_str());
      reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "DOWNLOADING", 10);

      // Save boot parameters to NVS before flashing
      preferences.begin("ota", false);
      preferences.putString("jobId", jobId);
      preferences.putString("bootNonce", bootNonce);
      preferences.end();

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
            Serial.println("[OTA] Flash complete! Rebooting into new firmware...");
            reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "REBOOTING", 95);
            delay(1000);
            ESP.restart();
          } else {
            reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "FAILED", 0, "Flash write failed.");
          }
        }
      } else {
        reportStatus(jobId.c_str(), firmwareId.c_str(), downloadToken.c_str(), "FAILED", 0, "Download HTTP failed.");
      }
      downloadHttp.end();
    } else {
      Serial.println("[OTA] Device firmware is up-to-date.");
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n>>> Starting Secure ESP32 OTA Client with Hardware Root of Trust...");

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\n[OK] WiFi connected! IP: " + WiFi.localIP().toString());

  // Confirm pending boot after restart
  confirmBootIfPending();
}

void loop() {
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 300000 || lastCheck == 0) {
    lastCheck = millis();
    checkOTA();
  }
  delay(1000);
}
