(async()=>{
  const tabs=await(await fetch('http://127.0.0.1:9228/json')).json();const ws=new WebSocket(tabs[0].webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){console.log(JSON.stringify(m.result?.result?.value??{error:'storage diagnostic failed'},null,2));ws.close();}};
  ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{awaitPromise:true,returnByValue:true,expression:`(async()=>{
    const store=Capacitor.Plugins.SecureStorage,out={native:Capacitor.isNativePlatform(),pluginAvailable:Capacitor.isPluginAvailable('SecureStorage')};
    const key='apiusagebar.test.storage-probe';
    try {await store.setItem(key,'{"test":true}');const value=await store.getItem(key);out.alias={type:typeof value,matches:value==='{"test":true}'};await store.removeItem(key);}catch(e){out.alias={error:e.message};}
    try {await store.set(key,{test:true});const value=await store.get(key,false);out.typed={type:typeof value,matches:value?.test===true};await store.remove(key);}catch(e){out.typed={error:e.message};}
    try {const value=await store.getItem('apiusagebar.mobile.session.v1');out.session={type:typeof value,length:typeof value==='string'?value.length:0};}catch(e){out.session={error:e.message};}
    return out;
  })()`}}));
})().catch(()=>{console.error('Storage probe failed');process.exit(1);});
