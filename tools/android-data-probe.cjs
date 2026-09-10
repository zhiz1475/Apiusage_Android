// Read-only native API diagnostics. Output is restricted to status, schema and aggregate counts.
const fs=require('node:fs'),path=require('node:path');
(async()=>{
  const tabs=await(await fetch('http://127.0.0.1:9228/json')).json();
  const ws=new WebSocket(tabs[0].webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=expression=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
  const bundle=fs.readFileSync(path.resolve(__dirname,'../dist/mobile-preview/client-probe.js'),'utf8');
  const expression=bundle+`; (async()=>{
    const client=new AuditClient.MobileKapibalaClient();
    try { await client.hydrate(); } catch(e){return {stage:'hydrate',error:e.message};}
    if(!client.getStoredStatus().authenticated)return {stage:'hydrate',authenticated:false};
    globalThis.__nativeAuditClient=client;
    const now=new Date(),from=new Date(now);from.setHours(0,0,0,0);
    const sec=d=>Math.floor(d/1000);
    const paths={user:'/api/user/self',subscription:'/api/subscription/self',dayExport:'/api/data/self?start_timestamp='+sec(from)+'&end_timestamp='+sec(now),logs:'/api/log/self?type=2&p=1&page_size=2&start_timestamp='+sec(from)+'&end_timestamp='+sec(now)};
    const summarize=(v,depth=0)=>{if(v===null)return null;if(Array.isArray(v))return {length:v.length,first:depth<5?summarize(v[0],depth+1):undefined};if(typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!/(cookie|password|secret|email|username|access_token|refresh_token|session|sid|^token$)/i.test(k)).map(([k,n])=>[k,depth<5?summarize(n,depth+1):typeof n]));return typeof v==='number'||typeof v==='boolean'?v:typeof v==='string'&&/^[0-9.]+$/.test(v)?v:typeof v;};
    const cached=client.getCachedData(); const results={authenticated:true,cachePresent:!!cached,cacheSummary:cached?{state:cached.dataState,first:cached.historyStart,last:cached.historyEnd,historyComplete:cached.historyComplete,days:cached.daily?.length,maxDailySpend:Math.max(...(cached.daily||[]).map(r=>r.spent)),today:cached.today}:null,deviceTime:now.toISOString(),deviceTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
    for(const [name,path] of Object.entries(paths)){try{const r=await client.request(path);results[name]={status:r.status,success:r.body?.success,message:r.body?.success===false?r.body.message:undefined,schema:summarize(r.body)};}catch(e){results[name]={error:e.message,code:e.code};}}
    return results;
  })()`;
  const result=await send(expression);
  if(result.result?.exceptionDetails)throw Error('Native diagnostic evaluation failed');
  console.log(JSON.stringify(result.result?.result?.value,null,2));ws.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
