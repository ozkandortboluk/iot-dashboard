"""Run the *real* DR dispatcher logic against a copied, path-isolated script.

No Docker socket, host backups, /etc/nexusnode, systemd, or real remotes are
accessed. Exact known paths in the copied script are substituted with a
TemporaryDirectory; the original production script is never modified or run.
"""
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[2] / "scripts/dr/deliver-selected-backup.sh"


def replace_exact(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise AssertionError(f"Expected exactly one test isolation anchor: {old!r}")
    return text.replace(old, new, 1)


class IsolatedEncryptedDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="nexus-dr-integration-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.app = self.root / "fake-app"
        self.backups = self.root / "backups"
        self.daily = self.backups / "gunluk"
        self.remote = self.root / "fake-remote"
        self.bin = self.root / "mock-bin"
        for directory in (self.app, self.daily, self.remote, self.bin):
            directory.mkdir(parents=True, exist_ok=True)
        self.recipient = self.root / "age-recipients.txt"
        self.identity = self.root / "age-identity.txt"
        self.env = os.environ.copy()
        self.env.update({
            "PATH": str(self.bin) + ":/usr/bin:/bin",
            "DR_MOCK_APP_DATA": str(self.app),
            "DR_MOCK_REMOTE": str(self.remote),
            "DR_MOCK_FAIL_UPLOAD": "0",
        })
        self.run_command(["age-keygen", "-o", str(self.identity)])
        public = self.run_command(["age-keygen", "-y", str(self.identity)])
        self.recipient.write_text(public.stdout, encoding="utf8")
        self._make_mocks()
        self.runner = self.root / "isolated-dispatcher.sh"
        script = SOURCE.read_text(encoding="utf8")
        replacements = (
            ("BASE=/var/backups/nexusnode", "BASE=" + shlex.quote(str(self.backups))),
            ("APP_VOLUME=iot-dashboard_app_data", "APP_VOLUME=isolated_mock_volume"),
            ("RECIPIENTS=/etc/nexusnode/dr-recipients.txt", "RECIPIENTS=" + shlex.quote(str(self.recipient))),
            ("EXTERNAL_DISK=/mnt/nexusnode-backup", "EXTERNAL_DISK=" + shlex.quote(str(self.root / "never-mounted"))),
            ("if ! /usr/local/sbin/nexusnode-local-backup; then",
             "if ! " + shlex.quote(str(self.bin / "mock-local-backup")) + "; then"),
            ('install -d -o root -g root -m 700 "$BASE"', 'install -d -m 700 "$BASE"'),
            ('install -d -o root -g root -m 700 "$DAILY"', 'install -d -m 700 "$DAILY"'),
            ('"$(stat -c %u "$BASE")" = 0', '"$(stat -c %u "$BASE")" = "$(id -u)"'),
            ('"$(stat -c %u "$DAILY")" = 0', '"$(stat -c %u "$DAILY")" = "$(id -u)"'),
        )
        for old, new in replacements:
            script = replace_exact(script, old, new)
        self.assertNotIn("/var/backups/nexusnode", script)
        self.assertNotIn("/usr/local/sbin/nexusnode-local-backup", script)
        self.assertNotIn("/etc/nexusnode/dr-recipients.txt", script)
        self.runner.write_text(script, encoding="utf8")
        self.runner.chmod(0o700)

    def run_command(self, command, *, env=None):
        result = subprocess.run(
            command, env=env or self.env,
            capture_output=True, text=True, timeout=25,
        )
        if result.returncode:
            raise AssertionError(f"{command!r} failed ({result.returncode}): {result.stderr}")
        return result

    def _make_mocks(self):
        docker = self.bin / "docker"
        docker.write_text(
            "#!/bin/sh\n"
            "if [ \"$1\" = volume ] && [ \"$2\" = inspect ]; then\n"
            "  printf '%s\\n' \"$DR_MOCK_APP_DATA\"\n"
            "else\n"
            "  exit 88\n"
            "fi\n", encoding="utf8")
        docker.chmod(0o700)
        rclone = self.bin / "rclone"
        rclone.write_text(
            "#!/bin/sh\n"
            "set -eu\n"
            "case \"$1\" in\n"
            " listremotes) printf 'gdrive:\\n' ;;\n"
            " copyto)\n"
            "   [ \"$DR_MOCK_FAIL_UPLOAD\" = 0 ] || exit 93\n"
            "   case \"$3\" in gdrive:NexusNode-DR/production/*) ;; *) exit 94 ;; esac\n"
            "   name=${3#gdrive:}\n"
            "   target=\"$DR_MOCK_REMOTE/$name\"\n"
            "   mkdir -p \"$(dirname \"$target\")\"\n"
            "   [ ! -e \"$target\" ] || exit 95\n"
            "   cp \"$2\" \"$target\" ;;\n"
            " cat)\n"
            "   case \"$2\" in gdrive:NexusNode-DR/production/*) ;; *) exit 96 ;; esac\n"
            "   name=${2#gdrive:}\n"
            "   cat \"$DR_MOCK_REMOTE/$name\" ;;\n"
            " *) exit 97 ;;\n"
            "esac\n", encoding="utf8")
        rclone.chmod(0o700)
        fake_backup = self.bin / "mock-local-backup"
        fake_backup.write_text(
            "#!/bin/sh\n"
            "set -eu\n"
            "dir=" + shlex.quote(str(self.daily / "yedek-20261015T170000Z-FAKE0001")) + "\n"
            "mkdir \"$dir\"\n"
            "printf 'this is synthetic test data\\n' > \"$dir/sample.txt\"\n"
            "(cd \"$dir\" && sha256sum sample.txt > manifest.sha256)\n",
            encoding="utf8")
        fake_backup.chmod(0o700)

    def run_dispatcher(self, destination: str, *, upload_failure=False):
        (self.app / ".dr_destination.json").write_text(
            json.dumps({"destination": destination}), encoding="utf8")
        env = dict(self.env, DR_MOCK_FAIL_UPLOAD="1" if upload_failure else "0")
        return subprocess.run(
            ["/bin/bash", str(self.runner)], env=env,
            capture_output=True, text=True, timeout=40,
        )

    def test_mock_remote_success_encrypts_and_readback_matches(self):
        result = self.run_dispatcher("gdrive")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("DR encrypted copy verified", result.stdout)
        archive = next(self.remote.glob("NexusNode-DR/production/*.age"))
        decrypted = self.root / "decrypted.tar.gz"
        self.run_command(["age", "-d", "-i", str(self.identity), "-o",
                          str(decrypted), str(archive)])
        listing = self.run_command(["tar", "-tzf", str(decrypted)]).stdout
        self.assertIn("./sample.txt", listing)
        self.assertEqual(
            json.loads((self.app / ".dr_delivery_status.json").read_text())["result"],
            "success",
        )
        self.assertTrue((self.daily / "yedek-20261015T170000Z-FAKE0001" / "sample.txt").exists())

    def test_mock_remote_failure_keeps_new_and_old_local_backups(self):
        old = self.daily / "yedek-20261014T170000Z-OLD00001"
        old.mkdir()
        (old / "protected.txt").write_text("keep forever", encoding="utf8")
        result = self.run_dispatcher("gdrive", upload_failure=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((old / "protected.txt").read_text(), "keep forever")
        self.assertTrue((self.daily / "yedek-20261015T170000Z-FAKE0001" / "sample.txt").exists())
        self.assertEqual(
            json.loads((self.app / ".dr_delivery_status.json").read_text())["result"],
            "failed",
        )
        self.assertFalse(list(self.remote.rglob("*.age")))

    def test_local_selection_stays_local(self):
        result = self.run_dispatcher("local")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads((self.app / ".dr_delivery_status.json").read_text())["result"],
            "success",
        )
        self.assertFalse(list(self.remote.rglob("*.age")))

if __name__ == "__main__":
    unittest.main()
