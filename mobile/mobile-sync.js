import {list,unwrap,numeric,timestamp,normalizeRecord,uniqueRecords,dataError,isAuthError} from './mobile-data-core.js';
const DAY=86400000,WINDOW=27*DAY;
const seconds=d=>Math.floor(+d/1000);
export async function fetchExportWindow(request,from,to) {
  const r=await request(`/api/data/self?start_timestamp=${seconds(from)}&end_timestamp=${seconds(to)}`);
  const rows=list(r.body,'历史聚合接口'),result=[];
  for(const row of rows){const normalized=normalizeRecord(row);if(!normalized)throw dataError('历史聚合记录缺少有效时间');
    // The provider stores hourly buckets; retain the whole starting hour.
    const at=+timestamp(normalized.timestamp);if(at>=Math.floor(+from/3600000)*3600000&&at<=+to)result.push(normalized);
  }
  return result;
}
export async function syncHistory(request,{previous=null,now=new Date(),expectedRequests=null,createdAt=null,maxWindows=26}={}) {
  const existing=previous?.full===true&&Array.isArray(previous.rows)&&timestamp(previous.end)&&+timestamp(previous.end)<=+now?previous:null;
  try {
    if(existing) {
      const from=new Date(Math.max(+timestamp(existing.start),+timestamp(existing.end)-3*DAY));from.setHours(0,0,0,0);
      let fresh=[];
      for(let cursor=+from;cursor<=+now;cursor+=WINDOW){fresh.push(...await fetchExportWindow(request,new Date(cursor),new Date(Math.min(+now,cursor+WINDOW-1000))));}
      const rows=uniqueRecords([...existing.rows.filter(r=>+timestamp(r.timestamp)<+from),...fresh]);
      const next={...existing,rows,end:now.toISOString()};
      return {rows,complete:true,next,mode:'incremental'};
    }
    let rows=[],cursor=+now,oldest=now,complete=false;
    const minimum=timestamp(createdAt),expected=numeric(expectedRequests);
    for(let i=0;i<maxWindows;i++) {
      const from=new Date(Math.max(minimum?+minimum:0,cursor-WINDOW+1000));from.setMinutes(0,0,0);
      rows=uniqueRecords([...rows,...await fetchExportWindow(request,from,new Date(cursor))]);oldest=from;
      const known=rows.every(r=>r.requests!==null),requests=rows.reduce((s,r)=>s+(r.requests||0),0);
      if(known&&expected!==null&&requests>=expected || minimum&&+from<=+minimum){complete=true;break;}
      cursor=+from-1000;if(cursor<=0){complete=true;break;}
    }
    return {rows,complete,next:complete?{full:true,start:oldest.toISOString(),end:now.toISOString(),rows}:null,mode:'full',warning:complete?'':'可用历史尚未与账户累计请求数对齐'};
  } catch(error) {
    if(isAuthError(error))throw error;
    return {rows:existing?.rows||[],complete:false,next:existing,mode:existing?'incremental':'full',warning:error.message};
  }
}

// Full pagination; provider-capped ranges are bisected rather than labelled complete.
export async function fetchLogRange(request,from,to,{depth=0,isCurrent=()=>true}={}) {
  if(!isCurrent())throw dataError('日期已切换','ABORTED');
  const query=`type=2&start_timestamp=${seconds(from)}&end_timestamp=${seconds(to)}&page_size=100`;
  const raw=[],seenPages=new Set();let total=null,complete=false;
  for(let p=1;p<=100;p++) {
    if(!isCurrent())throw dataError('日期已切换','ABORTED');
    const response=await request(`/api/log/self?${query}&p=${p}`);
    const data=unwrap(response.body,'模型日志接口'),rows=list(response.body,'模型日志接口');
    if(p===1)total=numeric(data.total);
    if(total!==null&&total>=10000)break;
    const fingerprint=JSON.stringify(rows);if(rows.length&&seenPages.has(fingerprint))throw dataError('日志分页重复','INCOMPLETE_LOGS');seenPages.add(fingerprint);
    raw.push(...rows);
    if(!rows.length){complete=total===null||raw.length>=total;break;}
    if(total!==null?raw.length>=total:rows.length<100){complete=true;break;}
  }
  if(total>=10000||raw.length>=10000&&!complete) {
    const a=seconds(from),b=seconds(to),mid=Math.floor((a+b)/2);
    if(depth>=20||a>=b)throw dataError('当前时段日志超过接口上限','INCOMPLETE_LOGS');
    const left=await fetchLogRange(request,new Date(a*1000),new Date((mid+1)*1000-1),{depth:depth+1,isCurrent});
    const right=await fetchLogRange(request,new Date((mid+1)*1000),new Date(b*1000),{depth:depth+1,isCurrent});
    return [...left,...right];
  }
  if(!complete)throw dataError('日志分页未完成','INCOMPLETE_LOGS');
  const ids=new Set(),result=[];
  for(const r of raw){if(r.type!=null&&Number(r.type)!==2)continue;
    const id=r.id??r.log_id??r.request_id;if(id!=null){if(ids.has(String(id)))throw dataError('日志分页包含重复记录，请重试','INCOMPLETE_LOGS');ids.add(String(id));}
    const item=normalizeRecord(r,'log');if(!item)throw dataError('调用日志缺少有效时间');
    if(+timestamp(item.timestamp)>=+from&&+timestamp(item.timestamp)<=+to)result.push(item);
  }
  return result;
}
