// Credentials are supplied through the process environment, never saved here.
(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9228/json')).json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) {pending.get(m.id)(m);pending.delete(m.id);} };
  const send = (expression) => new Promise(r => {pending.set(++id,r);ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));});
  if (process.env.TEST_LOGIN_USER && process.env.TEST_LOGIN_PASSWORD) {
    await send(`document.querySelector('#accountButton').click(); document.querySelector('#accountLogin').click(); document.querySelector('#loginUsername').value=${JSON.stringify(process.env.TEST_LOGIN_USER)}; document.querySelector('#loginPassword').value=${JSON.stringify(process.env.TEST_LOGIN_PASSWORD)}; document.querySelector('#loginSubmit').click(); void 0`);
    delete process.env.TEST_LOGIN_USER; delete process.env.TEST_LOGIN_PASSWORD;
  }
  for(let i=0;i<30;i++) {
    await new Promise(r=>setTimeout(r,2000));
    const result = await send(`JSON.stringify({busy:document.querySelector('#loginSubmit').disabled,error:document.querySelector('#loginError').textContent,dialogOpen:document.querySelector('#loginSheet').classList.contains('open')})`);
    const value = JSON.parse(result.result.result.value);
    if(!value.busy || i===29) {console.log(JSON.stringify(value));break;}
  }
  await send("document.querySelector('#loginPassword').value=''; void 0");
  const data = await send(`JSON.stringify(Object.fromEntries(['todaySpent','todayRequests','todayTokens','accountBalance','historyRange','historyRequests','historyTokens','historyStateText'].map(id=>[id,document.getElementById(id)?.textContent])))`);
  console.log(data.result.result.value);
  ws.close();
})().catch(() => {console.error('Login inspection failed; credentials omitted.');process.exit(1);});
