import {createDayUsage} from './mobile-day-usage.js';
import {modelIcon} from './mobile-model-icons.js';

export function createDayPanel({client,getData,preview,money,compact,count}) {
  const $=s=>document.querySelector(s),usage=createDayUsage(client);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let date='',version=0,timer;
  function expand(value) {
    $('#dayModelsPanel').hidden=!value;
    $('#dayModelsToggle').setAttribute('aria-expanded',String(value));
    $('#dayModelsToggle').innerHTML=value?'收起模型调用 <span>−</span>':'查看当天模型调用 <span>＋</span>';
  }
  function clearView() {$('#dayModelsList').replaceChildren();$('#dayRecordsList').replaceChildren();$('#dayRecords').hidden=true;$('#dayRecords').open=false;$('#dayModelsRetry').hidden=true;}
  function demo(key) {
    const row=(getData().daily||[]).find(r=>r.date===key);
    if(!row||!(row.tokens||row.requests||row.spent))return {models:[],logs:[],complete:true};
    let leftTokens=Number(row.tokens)||0,leftRequests=Number(row.requests)||0,leftCents=Math.round((Number(row.spent)||0)*100);
    const totalTokens=leftTokens,totalRequests=leftRequests,totalCents=leftCents;
    const models=['gpt-4o','claude-3-5-sonnet','gemini-1.5-pro'].map((model,i)=>{
      const weight=[.5,.3,.2][i],tokens=i===2?leftTokens:Math.floor(totalTokens*weight),requests=i===2?leftRequests:Math.floor(totalRequests*weight),cents=i===2?leftCents:Math.floor(totalCents*weight);
      leftTokens-=tokens;leftRequests-=requests;leftCents-=cents;
      const inputTokens=Math.floor(tokens*.65);
      return {model,tokens,requests,spent:cents/100,inputTokens,outputTokens:tokens-inputTokens};
    }).filter(m=>m.tokens||m.requests||m.spent);
    return {models,logs:[],complete:true};
  }
  async function load(force=false) {
    if(!date)return;
    const token=++version,key=date;clearView();expand(true);
    $('#dayModelsState').textContent='正在读取当天调用…';$('#dayModelsPanel').setAttribute('aria-busy','true');
    try {
      const result=preview?demo(key):await usage.get(key,{force});
      if(token!==version||key!==date)return;
      $('#dayModelsState').textContent=(preview?'演示数据 · ':'')+(result.warning||(!result.models.length?'当天暂无模型调用':`${result.models.length} 个模型 · ${count(result.models.reduce((sum,m)=>sum+m.requests,0))} 次调用`));
      $('#dayModelsRetry').hidden=result.complete&&!result.stale;
      $('#dayModelsList').innerHTML=result.models.map(m=>`<article class="day-model"><div class="model-title">${modelIcon(m.model)}<span>${esc(m.model)}</span></div><div class="day-model-metrics"><span>请求 <b>${esc(count(m.requests))}</b></span><span>Token <b>${esc(compact(m.tokens))}</b></span><span>费用 <b>${esc(money(m.spent,getData()))}</b></span></div><p>输入 ${esc(compact(m.inputTokens))} · 输出 ${esc(compact(m.outputTokens))}</p></article>`).join('');
      if(result.logs?.length) {
        $('#dayRecords').hidden=false;$('#dayRecordCount').textContent=`${result.logs.length} 条`;
        $('#dayRecordsList').innerHTML=result.logs.map(log=>`<li><time>${esc(log.createdAt?new Date(log.createdAt).toLocaleTimeString('zh-CN',{hour12:false}):'时间未知')}</time><strong>${esc(log.model)}</strong><span>${esc(compact(log.tokens))} Token · ${esc(money(log.spent,getData()))}</span></li>`).join('');
      }
    } catch(error) {
      if(token!==version||key!==date)return;
      $('#dayModelsState').textContent=error?.message||'调用明细加载失败';$('#dayModelsRetry').hidden=false;
    } finally {if(token===version)$('#dayModelsPanel').setAttribute('aria-busy','false');}
  }
  $('#dayModelsToggle').addEventListener('click',()=>{
    if(!$('#dayModelsPanel').hidden){version++;clearTimeout(timer);usage.cancel();expand(false);$('#dayModelsPanel').setAttribute('aria-busy','false');}
    else load();
  });
  $('#dayModelsRetry').addEventListener('click',()=>load(true));
  return {
    select(key,{expand:open=false}={}) {
      if(key===date&&!open)return;
      date=key;version++;clearTimeout(timer);usage.cancel();clearView();expand(open);
      $('#dayModelsPanel').setAttribute('aria-busy','false');
      if(open&&key){$('#dayModelsState').textContent='正在读取当天调用…';timer=setTimeout(()=>load(),120);}
    },
    reset(){version++;date='';clearTimeout(timer);usage.clear();clearView();expand(false);}
  };
}
