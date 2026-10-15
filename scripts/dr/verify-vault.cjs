#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
function verify(keyFile,vaultFile){
  const raw=fs.readFileSync(keyFile,'utf8').trim();
  if(!/^[0-9a-fA-F]{64}$/.test(raw))throw Error('invalid root key format');
  const key=Buffer.from(raw,'hex');
  const records=Object.values(JSON.parse(fs.readFileSync(vaultFile,'utf8'))?.secrets??{});
  if(!records.length)throw Error('empty vault');
  let total=0;
  for(const item of records){
    const v=item?.encryptedValue;
    if(typeof v!=='string'||!v.startsWith('enc:v1:'))throw Error('plaintext record');
    const p=v.split(':');
    if(p.length!==5||!/^[0-9a-f]{24}$/i.test(p[2])||!/^[0-9a-f]{32}$/i.test(p[3])||!/^(?:[0-9a-f]{2})+$/i.test(p[4]))throw Error('invalid ciphertext');
    try{
      const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(p[2],'hex'));
      d.setAuthTag(Buffer.from(p[3],'hex'));
      if(!Buffer.concat([d.update(Buffer.from(p[4],'hex')),d.final()]).length)throw Error('empty');
    }catch{throw Error('Vault authentication failure: key mismatch or damage');}
    total++;
  }
  return total;
}
if(require.main===module){try{
  if(process.argv.length!==4)throw Error('two file paths required');
  console.log('Vault decryption verified: '+verify(process.argv[2],process.argv[3])+' records');
}catch(e){console.error('Vault verification failed: '+e.message);process.exitCode=1;}}
module.exports={verify};
