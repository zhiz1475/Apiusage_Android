// Canonical records retain raw quota and timestamps. Convert currency only at presentation aggregation.
export const DATA_VERSION=3;
export function numeric(value) {
  if(value===null||value===undefined||typeof value==='boolean'||typeof value==='object')return null;
  const text=typeof value==='string'?value.replace(/,/g,'').trim():value;
  if(text==='')return null;
  const n=Number(text);return Number.isFinite(n)?n:null;
}
export function timestamp(value) {
  if(value===null||value===undefined||value==='')return null;
  if(value instanceof Date)return Number.isNaN(+value)?null:new Date(value);
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d);}
  const n=numeric(value),date=n!==null?new Date(n<1e12?n*1000:n):new Date(value);
  return Number.isNaN(+date)?null:date;
}
export function dataError(message,code='SCHEMA_INVALID'){const e=new Error(message);e.code=code;return e;}
export const isAuthError=e=>['HTTP_401','HTTP_403','AUTH_EXPIRED'].includes(e?.code);
export function unwrap(payload,label='接口') {
  if(!payload||typeof payload!=='object')throw dataError(label+'返回格式错误');
  if(payload.success===false)throw dataError(payload.message||label+'返回失败',/登录|令牌|无权|认证/.test(payload.message||'')?'AUTH_EXPIRED':'API_ERROR');
  return payload.data??payload;
}
export function list(payload,label) {
  const data=unwrap(payload,label),rows=Array.isArray(data)?data:data.items??data.rows??data.list;
  if(!Array.isArray(rows))throw dataError(label+'记录格式错误');return rows;
}
const value=(r,keys)=>{for(const k of keys){if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k];}return null;};
export function normalizeRecord(r,kind='aggregate') {
  if(!r||typeof r!=='object')return null;
  if(kind==='log'&&r.type!=null&&Number(r.type)!==2)return null;
  const date=timestamp(value(r,['timestamp','created_at','createdAt','date','day']));if(!date)return null;
  const input=numeric(value(r,['inputTokens','prompt_tokens','input_tokens']));
  const output=numeric(value(r,['outputTokens','completion_tokens','output_tokens']));
  return {timestamp:date.toISOString(),model:String(value(r,['model_name','model','modelName'])||'未知模型'),
    quota:numeric(r.quota),spent:numeric(value(r,['spent','cost','amount'])),
    requests:kind==='log'?1:numeric(value(r,['requests','count','request_count'])),
    tokens:numeric(value(r,['token_used','tokens','total_tokens','token_count']))??(input!==null&&output!==null?input+output:null),
    inputTokens:input,outputTokens:output,
    dimensions:[r.use_group??r.group??'',r.channel_id??r.channel??'',r.token_id??'',r.node_name??''].join('|')};
}
export const recordKey=r=>[r.timestamp,r.model,r.dimensions,r.quota,r.spent,r.requests,r.tokens].join('|');
export function uniqueRecords(rows){const seen=new Set();return rows.filter(r=>{const key=recordKey(r);if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>a.timestamp.localeCompare(b.timestamp));}
const add=(a,b)=>a===null||b===null?null:a+b;
export function aggregate(records,scale,from=null,to=null) {
  const result={spent:0,requests:0,tokens:0,inputTokens:0,outputTokens:0};
  for(const r of records){const time=+timestamp(r.timestamp);if(from&&time<+from||to&&time>+to)continue;
    result.spent=add(result.spent,r.quota===null?r.spent:r.quota*scale);
    for(const key of ['requests','tokens','inputTokens','outputTokens'])result[key]=add(result[key],r[key]);
  }
  if(result.spent!==null)result.spent=Number(result.spent.toFixed(8));return result;
}
export function aggregateModels(records,scale,from,to) {
  const groups=new Map();for(const r of records){const time=+timestamp(r.timestamp);if(time<+from||time>+to)continue;const group=groups.get(r.model)||[];group.push(r);groups.set(r.model,group);}
  const models=[...groups].map(([model,rows])=>({model,logo:model,...aggregate(rows,scale)})).sort((a,b)=>(b.tokens||0)-(a.tokens||0));
  const total=models.reduce((s,r)=>s+(r.spent||0),0);for(const model of models)model.share=total>0?(model.spent||0)/total:0;return models;
}
export function aggregateDaily(records,scale) {
  const groups=new Map();for(const r of records){const date=timestamp(r.timestamp),key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;const group=groups.get(key)||[];group.push(r);groups.set(key,group);}
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>({date,...aggregate(rows,scale)}));
}
export function parseStats(payload,scale) {
  const data=unwrap(payload,'统计接口'),r=data.stat??data;
  const quota=numeric(r.quota),spent=quota!==null?Number((quota*scale).toFixed(8)):numeric(value(r,['spent','amount','cost']));
  return {spent,requests:numeric(value(r,['requests','request_count','count'])),tokens:numeric(value(r,['total_tokens','tokens','token_count'])),averageRPM:numeric(r.rpm),averageTPM:numeric(r.tpm)};
}
export function parseSubscriptions(payload,plansPayload,scale,now=new Date()) {
  const data=unwrap(payload,'订阅接口');
  const rows=Array.isArray(data)?data:data.subscriptions??data.all_subscriptions??data.items??data.rows??data.list;
  if(!Array.isArray(rows))throw dataError('订阅记录格式错误');
  const titles=new Map();
  if(plansPayload){for(const item of list(plansPayload,'套餐接口')){const plan=item.plan??item;titles.set(String(plan.id??plan.plan_id),plan.title??plan.name);}}
  const seen=new Set(),plans=[];
  for(const item of rows){const r=item.subscription??item;if(!r||typeof r!=='object')continue;
    const id=String(r.id??r.subscription_id??''),end=timestamp(value(r,['end_time','end_date','endDate','expired_at'])),start=timestamp(value(r,['start_time','start_date']));
    const status=String(r.status??'active').toLowerCase();
    if(!['active','enabled','valid','1'].includes(status)||end&&end<now||start&&start>now||id&&seen.has(id))continue;
    if(id)seen.add(id);
    const total=numeric(value(r,['amount_total','total','total_amount','quota','limit']));
    const used=numeric(value(r,['amount_used','used','used_quota']));
    const remaining=numeric(value(r,['amount_remaining','remaining','remain_quota']))??(total!==null&&used!==null?Math.max(0,total-used):null);
    const money=n=>n===null?null:Number((n*scale).toFixed(8));
    plans.push({id,planId:String(r.plan_id??''),title:String(r.title??r.name??item.plan?.title??titles.get(String(r.plan_id))??('订阅 #'+id)),total:money(total),used:money(used),remaining:money(remaining),remainingPercent:total>0&&remaining!==null?remaining/total:null,endDate:end?.toISOString()??null});
  }
  return plans;
}
