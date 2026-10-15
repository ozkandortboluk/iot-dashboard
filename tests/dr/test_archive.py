"""Standard library recovery tests; never touch a live VPS."""
import importlib.util
import io
import json
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('dr_archive',ROOT/'scripts/dr/archive.py')
dr=importlib.util.module_from_spec(spec);spec.loader.exec_module(dr)

class DRArchiveTests(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory()
        self.root=Path(self.t.name)
        self.stage=self.root/'stage';self.stage.mkdir()
        entries={
          'db.dump':b'PGDMP fixture',
          'app_data/.system_secrets.json':b'{"secrets":{"x":{"encryptedValue":"enc:v1:abcd"}}}',
          'host_secrets/encryption_key':b'0'*64,
          'host_secrets/postgres_password':b'test-password',
          'host_config/.env':b'POSTGRES_DB=test\n',
          'app_data/uploads/firmware/a.bin':b'\xe9\x01'
        }
        for name,body in entries.items():
            p=self.stage/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body)
        self.archive=self.root/'archive.tar.gz'
    def tearDown(self):self.t.cleanup()
    def tar(self):
        with tarfile.open(self.archive,'w:gz') as f:
            for entry in self.stage.iterdir():f.add(entry,arcname=entry.name)
    def test_manifest_round_trip(self):
        dr.manifest(self.stage,{})
        self.tar()
        restored=self.root/'restored';restored.mkdir()
        out=dr.verify_archive(self.archive,restored)
        self.assertEqual(out['format'],'nexusnode-dr-v1')
        self.assertEqual((restored/'app_data/uploads/firmware/a.bin').read_bytes(),b'\xe9\x01')
    def test_corrupt_payload_refused(self):
        dr.manifest(self.stage,{})
        (self.stage/'db.dump').write_bytes(b'changed')
        self.tar()
        with self.assertRaisesRegex(ValueError,'checksum/size'):dr.verify_archive(self.archive)
    def test_archive_path_traversal_refused(self):
        for name in ('../bad','/etc/shadow','app_data/../../escape'):
            with self.subTest(name=name):
                with tarfile.open(self.archive,'w:gz') as f:
                    m=tarfile.TarInfo(name);m.size=1;f.addfile(m,io.BytesIO(b'x'))
                with self.assertRaises(ValueError):dr.verify_archive(self.archive)
    def test_archive_symlink_refused(self):
        with tarfile.open(self.archive,'w:gz') as f:
            m=tarfile.TarInfo('app_data/link');m.type=tarfile.SYMTYPE;m.linkname='/etc/passwd';f.addfile(m)
        with self.assertRaises(ValueError):dr.verify_archive(self.archive)
    def test_missing_key_vault_refused(self):
        (self.stage/'host_secrets/encryption_key').write_text('wrong')
        with self.assertRaisesRegex(ValueError,'key format'):dr.manifest(self.stage,{})
        (self.stage/'host_secrets/encryption_key').write_bytes(b'0'*64)
        (self.stage/'app_data/.system_secrets.json').unlink()
        with self.assertRaisesRegex(ValueError,'mandatory'):dr.manifest(self.stage,{})
    def test_raw_app_tar_escape_refused(self):
        tarpath=self.root/'data.tar'
        with tarfile.open(tarpath,'w') as f:
            m=tarfile.TarInfo('../bad');m.size=1;f.addfile(m,io.BytesIO(b'x'))
        out=self.root/'out';out.mkdir()
        with self.assertRaises(ValueError):dr.extract_raw_app_tar(tarpath,out)
    def test_vault_wrong_key_refused(self):
        key=self.root/'root.key';key.write_text('2'*64)
        script=ROOT/'scripts/dr/verify-vault.cjs'
        ciphertext=subprocess.check_output(['node','-e',
          "const c=require('node:crypto'),k=Buffer.from('2'.repeat(64),'hex'),iv=Buffer.alloc(12,1);"
          "const x=c.createCipheriv('aes-256-gcm',k,iv);const v=Buffer.concat([x.update('private-test'),x.final()]);"
          "process.stdout.write('enc:v1:'+iv.toString('hex')+':'+x.getAuthTag().toString('hex')+':'+v.toString('hex'));"],text=True)
        v=self.root/'vault.json'
        v.write_text(json.dumps({'secrets':{'database.password':{'encryptedValue':ciphertext}}}))
        ok=subprocess.run(['node',str(script),str(key),str(v)],capture_output=True,text=True)
        self.assertEqual(ok.returncode,0)
        self.assertNotIn('private-test',ok.stdout)
        key.write_text('3'*64)
        bad=subprocess.run(['node',str(script),str(key),str(v)],capture_output=True,text=True)
        self.assertNotEqual(bad.returncode,0)
        self.assertNotIn('private-test',bad.stderr)

if __name__=='__main__':unittest.main()
