import assert from 'node:assert/strict';
import { MobileKapibalaClient } from './mobile/mobile-client.js';
const memory = new Map();
const storage = {getItem:k=>memory.get(k) || null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const client = new MobileKapibalaClient({storage});
client.session = {accessToken:'fixture-only'};
client.refreshPromise = new Promise(resolve=>setTimeout(()=>{
  client.writeJson('apiusagebar.mobile.cache.v1',{data:{fixture:true}});
  client.writeJson('apiusagebar.mobile.session.v1',{accessToken:'fixture-only'});
  resolve();
},10));
await client.logout();
assert.equal(client.getSession(),null);
assert.equal(client.getCachedData(),null);
assert.equal(memory.size,0,'refresh must not revive cache after logout');
const calls=[];
globalThis.Capacitor = {getPlatform:()=> 'android',Plugins:{SecureStorage:{
  setItem:async(k)=>{await new Promise(r=>setTimeout(r,10));calls.push('write:'+k);},
  removeItem:async(k)=>{calls.push('remove:'+k);}
}}};
const native = new MobileKapibalaClient({storage});
native.writeJson('apiusagebar.mobile.session.v1',{fixture:true});
native.writeJson('apiusagebar.mobile.cache.v1',{data:{fixture:true}});
await native.logout();
assert.ok(calls[0].startsWith('write:') && calls[1].startsWith('write:'));
assert.ok(calls[2].startsWith('remove:') && calls[3].startsWith('remove:'));
assert.equal(native.getCachedData(),null);
native.session={accessToken:'fixture-only'};
native.nativeStorage.removeItem=async()=>{throw Error('fixture storage error');};
await assert.rejects(native.logout(),/fixture storage error/);
console.log('Mobile session cleanup: 3 scenarios passed');
