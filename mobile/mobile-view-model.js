export function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
export function localDate(key) {
  if (typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d);
  }
  return new Date(key);
}
export function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function lastSevenDays(data, today = new Date()) {
  const byDate = new Map((data.daily || []).map(row=>[row.date,row]));
  return Array.from({length:7},(_,i)=>{
    const date = new Date(today); date.setDate(today.getDate()-6+i);
    const key = dayKey(date), row = byDate.get(key);
    return {date:key,spent:row ? finite(row.spent) : data.historyComplete === true ? 0 : null};
  });
}
export function subscriptionFunds(data, now = new Date()) {
  const plans = (data.subscriptions || []).filter(plan=>{
    const expiry = plan.endDate ? new Date(plan.endDate) : null;
    return !expiry || Number.isNaN(expiry.getTime()) || expiry >= now;
  });
  // No global sum with wallet funds: plan credit and wallet balance have different restrictions.
  const known = data.authenticated && Array.isArray(data.subscriptions) && data.subscriptionsAvailable !== false && plans.every(p=>finite(p.remaining)!==null);
  return {plans,remaining:known ? plans.reduce((sum,p)=>sum+finite(p.remaining),0) : null};
}
export function monthKeys(rows) {
  const keys = rows.map(r=>r.date).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (!keys.length) return [];
  const first = localDate(keys[0].slice(0,7)+'-01'), last = keys.at(-1).slice(0,7), result=[];
  for (let i=0;i<1200;i++) {
    const key=dayKey(first).slice(0,7); result.push(key); if(key>=last) break;
    first.setMonth(first.getMonth()+1);
  }
  return result;
}
export function monthCells(month) {
  const first=localDate(month+'-01'), days=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  const offset=(first.getDay()+6)%7;
  const length=Math.ceil((offset+days)/7)*7;
  return Array.from({length},(_,i)=>i<offset||i>=offset+days ? null : `${month}-${String(i-offset+1).padStart(2,'0')}`);
}
