const fs = require('node:fs');
(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9228/json')).json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({id, method, params})); });
  const actions = {
    reset: "document.querySelector('#loginClose').click(); document.querySelector('.bottom-nav-item[data-target=overview]').click()",
    login: "document.querySelector('#accountButton').click()",
    history: "document.querySelector('.bottom-nav-item[data-target=history]').click()"
    ,day: "if(document.body.dataset.theme!=='day') document.querySelector('#themeToggle').click()"
    ,night: "if(document.body.dataset.theme!=='night') document.querySelector('#themeToggle').click()"
    ,back: "window.dispatchEvent(new Event('mobile-back'))"
    ,models: "document.querySelector('.bottom-nav-item[data-target=models]').click()"
  };
  if (actions[process.argv[2]]) await send('Runtime.evaluate', {expression: actions[process.argv[2]]});
  await new Promise(resolve => setTimeout(resolve, 500));
  const r = await send('Runtime.evaluate', {expression: `JSON.stringify({h:innerHeight,y:scrollY,v:visualViewport.height,items:[...document.querySelectorAll('.mobile-shell,.mobile-content,.mobile-bottom-nav,.login-sheet')].map(e=>({cls:e.className,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,h:e.clientHeight,sh:e.scrollHeight,st:e.scrollTop,overflow:getComputedStyle(e).overflowY}))})`, returnByValue:true});
  console.log(r.result.result.value);
  if (process.argv[3]) {const s = await send('Page.captureScreenshot'); fs.writeFileSync(process.argv[3], Buffer.from(s.result.data,'base64'));}
  ws.close();
})().catch(e => {console.error(e); process.exit(1);});
