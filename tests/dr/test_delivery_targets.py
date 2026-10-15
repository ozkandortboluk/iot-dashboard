"""Safe, host-independent tests: never call real docker, systemd, or backup commands."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "dr" / "deliver-selected-backup.sh"

class TargetReadinessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="nexus-dr-target-mock-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.app = self.root / "fake-app-data"
        self.app.mkdir()
        self.bin = self.root / "fake-bin"
        self.bin.mkdir()
        docker = self.bin / "docker"
        docker.write_text("#!/bin/sh\nprintf '%s\\n' \"$DR_TEST_APPDATA\"\n")
        docker.chmod(0o700)
        rclone = self.bin / "rclone"
        rclone.write_text("#!/bin/sh\nif [ \"$1\" = listremotes ]; then printf 'gdrive:\\n'; else exit 89; fi\n")
        rclone.chmod(0o700)
        self.env = dict(os.environ, PATH=f"{self.bin}:/usr/bin:/bin", DR_TEST_APPDATA=str(self.app))

    def run_refresh(self):
        # '--refresh' is a no-backup code path. Fake docker is the ONLY docker in PATH.
        return subprocess.run(["/bin/bash", str(SCRIPT), "--refresh"], env=self.env,
                              capture_output=True, text=True, timeout=10)

    def test_refresh_does_not_create_a_backup_or_contact_remote(self):
        result = self.run_refresh()
        self.assertEqual(result.returncode, 0, result.stderr)
        ready = json.loads((self.app / ".dr_capabilities.json").read_text())["ready"]
        self.assertEqual(ready, ["local", "gdrive"])
        self.assertFalse((self.app / ".dr_delivery_status.json").exists())

    def test_untrusted_destination_does_not_execute(self):
        (self.app / ".dr_destination.json").write_text(
            json.dumps({"destination": "$(touch /tmp/nexus-dr-not-executed)"}))
        result = self.run_refresh()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("destination selection invalid", result.stderr)
        self.assertFalse((self.app / ".dr_capabilities.json").exists())

    def test_symlinked_selection_refused(self):
        (self.app / ".dr_destination.json").symlink_to(self.root / "missing")
        result = self.run_refresh()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.app / ".dr_capabilities.json").exists())

if __name__ == "__main__":
    unittest.main()
