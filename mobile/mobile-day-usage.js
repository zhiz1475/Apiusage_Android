import {asDate,asNumber,MobileClientError} from './mobile-client.js';
import {localDate,dayKey} from './mobile-view-model.js';

const unauthorized=e=>['HTTP_401','HTTP_403','AUTH_EXPIRED'].includes(e?.code);
const rowsOf=body=>{
  if(body?.success===false)throw new MobileClientError(body.message||'调用记录读取失败','API_ERROR');
  const data=body?.data??body;
  const rows=Array.isArray(data)?data:data?.items??data?.rows??data?.list;
  if(!Array.isArray(rows))throw new MobileClientError('调用记录格式异常','SCHEMA_INVALID');
  return {rows,total:asNumber(data?.total)};
};
export async function fetchDayUsage(client,key,{isCurrent=()=>true}={}) {
  const start=localDate(key), end=localDate(key);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||Number.isNaN(start.getTime())||dayKey(start)!==key)throw new MobileClientError('日期无效','INVALID_DATE');
  end.setDate(end.getDate()+1);
  let session=client.getSession();
  if(!session)throw new MobileClientError('请先登录后查看调用记录','AUTH_EXPIRED');
  if(client.shouldRenew(session))session=await client.renewSession();
  let scale=asNumber(client.getCachedData()?.moneyScale);
  if(!(scale>0)) {
    const response=await client.request('/api/status');
    if(response.body?.success===false)throw new MobileClientError('计费配置读取失败','API_ERROR');
    const config=response.body?.data??response.body;
    const quota=asNumber(config?.quota_per_unit??config?.QuotaPerUnit);
    const cny=String(config?.quota_display_type??config?.QuotaDisplayType).toUpperCase()==='CNY';
    const exchange=cny?asNumber(config?.usd_exchange_rate??config?.USDExchangeRate):1;
    if(!(quota>0)||!(exchange>0))throw new MobileClientError('计费配置缺失，无法确认费用','SCHEMA_INVALID');
    scale=exchange/quota;
  }
  const models=new Map(),ids=new Set(),pages=new Set(),logs=[];
  let complete=false,warning='',fetched=0;
  for(let page=1;page<=50;page++) {
    if(!isCurrent())throw new MobileClientError('日期已切换','ABORTED');
    let batch;
    try {
      const query=new URLSearchParams({start_timestamp:String(Math.floor(start/1000)),end_timestamp:String(Math.floor(end/1000)-1),type:'2',p:String(page),page_size:'100'});
      const response=await client.request('/api/log/self?'+query,{headers:{'X-Auth-Session':session.sessionSid||''}});
      batch=rowsOf(response.body);
    } catch(error) {
      if(unauthorized(error)||page===1)throw error;
      warning='部分记录加载失败，请重试';break;
    }
    const {rows,total}=batch;
    const fingerprint=JSON.stringify(rows);
    if(rows.length&&pages.has(fingerprint)){warning='接口返回重复分页，当前记录不完整';break;}
    pages.add(fingerprint);fetched+=rows.length;
    for(const raw of rows) {
      if(!raw||typeof raw!=='object') {warning='部分记录格式异常';continue;}
      if(raw.type!=null && Number(raw.type)!==2)continue;
      if(raw.id!=null){const id=String(raw.id);if(ids.has(id))continue;ids.add(id);}
      const date=asDate(raw.created_at??raw.createdAt??raw.timestamp);
      if(date&&(date<start||date>=end))continue;
      const model=String(raw.model_name??raw.model??raw.modelName??'未知模型');
      const input=asNumber(raw.prompt_tokens??raw.input_tokens)??0, output=asNumber(raw.completion_tokens??raw.output_tokens)??0;
      const tokens=asNumber(raw.total_tokens??raw.tokens??raw.token_used)??input+output;
      const quota=asNumber(raw.quota), monetary=asNumber(raw.spent??raw.cost??raw.amount);
      const spent=quota!==null?quota*scale:monetary;
      const record={model,createdAt:date?.toISOString()||null,inputTokens:Math.max(0,input),outputTokens:Math.max(0,output),tokens:Math.max(0,tokens),spent};
      const item=models.get(model)||{model,requests:0,inputTokens:0,outputTokens:0,tokens:0,spent:0};
      item.requests++;item.tokens+=record.tokens;item.inputTokens+=record.inputTokens;item.outputTokens+=record.outputTokens;
      item.spent=spent===null||item.spent===null?null:item.spent+spent;models.set(model,item);logs.push(record);
    }
    if(!rows.length) {complete=!warning&&(total===null||fetched>=total);if(!complete&&!warning)warning='分页提前结束，当前记录不完整';break;}
    if(total!==null?fetched>=total:rows.length<100){complete=!warning;break;}
  }
  return {date:key,models:[...models.values()].sort((a,b)=>b.tokens-a.tokens),logs:logs.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,20),complete,warning:warning||(!complete?'记录较多，当前仅加载前 5000 条':''),fetchedAt:new Date().toISOString()};
}

export function createDayUsage(client) {
  const cache=new Map(),pending=new Map();let generation=0;
  const owner=()=>{const session=client.getSession();return session?String(session.userId||session.username):'';};
  return {
    clear(){generation++;cache.clear();pending.clear();},
    cancel(){generation++;pending.clear();},
    async get(date,{force=false}={}) {
      const account=owner();if(!account)throw new MobileClientError('请先登录','AUTH_EXPIRED');
      const key=account+':'+date, saved=cache.get(key), token=generation;
      if(!force&&saved&&Date.now()-saved.time<120000)return saved.data;
      if(pending.has(key))return pending.get(key);
      const task=fetchDayUsage(client,date,{isCurrent:()=>token===generation&&account===owner()}).then(data=>{
        if(token!==generation||account!==owner())throw new MobileClientError('账户已变化','ACCOUNT_CHANGED');
        cache.set(key,{time:Date.now(),data});if(cache.size>20)cache.delete(cache.keys().next().value);return data;
      }).catch(error=>{
        if(!unauthorized(error)&&token===generation&&account===owner()&&saved)return {...saved.data,stale:true,warning:'网络不可用，显示该日缓存'};
        throw error;
      }).finally(()=>{if(pending.get(key)===task)pending.delete(key);});
      pending.set(key,task);return task;
    }
  };
}
