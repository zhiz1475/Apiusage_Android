// Temporary WebView preview of local UI code; reloading returns to installed APK assets.
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '../mobile');
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  let bundle = fs.readFileSync(path.resolve(__dirname,'../dist/mobile-preview/native-preview.js'),'utf8');
  if (process.argv.includes('--demo')) bundle = bundle.replace(/var previewMode = [^;]+;/, 'var previewMode = true;');
  let html = read('index.html').replace(/<script[\s\S]*?<\/script>/g,'').replace('<link rel="stylesheet" href="mobile.css">','<style>'+read('mobile.css')+'</style>');
  const assetMap={};
  for(const dir of ['assets','assets/logos','assets/logos/night'])for(const name of fs.readdirSync(path.join(root,dir))) {
    if(!/\.(svg|png)$/.test(name))continue;
    const relative=dir+'/'+name,mime=name.endsWith('.svg')?'image/svg+xml':'image/png';
    assetMap[relative]='data:'+mime+';base64,'+fs.readFileSync(path.join(root,relative)).toString('base64');
  }
  html=html.replace(/src="(assets\/[^"?]+)(?:\?[^" ]*)?"/g,(whole,key)=>assetMap[key]?'src="'+assetMap[key]+'"':whole);
  const tabs = await (await fetch('http://127.0.0.1:9228/json')).json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r=>ws.onopen=r);
  let id=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}));});
  await send('Page.setBypassCSP',{enabled:true});
  const expression=`(()=>{
    const lastTimer=setTimeout(()=>{},0);for(let i=1;i<=lastTimer;i++){clearTimeout(i);clearInterval(i);}
    document.open();document.write(${JSON.stringify(html)});document.close();
    const assets=${JSON.stringify(assetMap)};
    new MutationObserver(()=>document.querySelectorAll('img[src^="assets/"]').forEach(img=>{const src=assets[img.getAttribute('src').split('?')[0]];if(src)img.src=src;})).observe(document.body,{subtree:true,childList:true});
    ${bundle}
    document.body.dataset.devPreview='true';return {preview:true,native:Capacitor.isNativePlatform()};
  })()`;
  const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.result?.exceptionDetails)throw Error(result.result.exceptionDetails.text);
  console.log(JSON.stringify(result.result.result.value));ws.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
