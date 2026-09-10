import {monthKeys, monthCells, localDate, finite} from './mobile-view-model.js';

export function createCalendar({money,compact,count,onSelect,picker}) {
  const $=s=>document.querySelector(s);
  const select=$('#calendarMonth'), grid=$('#mobileCalendar');
  let data={}, rows=[], byDate=new Map(), months=[], current='', selected='', pickerYear=0;
  const label=key=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long'}).format(localDate(key+'-01'));
  const fmt=key=>new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(localDate(key));
  function detail(key,expand=false) {
    selected=key;
    grid.querySelectorAll('[data-date]').forEach(b=>{b.classList.toggle('selected',b.dataset.date===key);b.setAttribute('aria-pressed',String(b.dataset.date===key));});
    const row=byDate.get(key);
    const unknown=!row && data.historyComplete !== true;
    $('#calendarDate').textContent=fmt(key);
    $('#daySpent').textContent=unknown?'—':money(row?.spent ?? 0,data);
    $('#dayRequests').textContent=unknown?'—':count(row?.requests ?? 0);
    $('#dayTokens').textContent=unknown?'—':compact(row?.tokens ?? 0);
    $('#calendarDayStatus').hidden=!unknown;
    onSelect?.(key,{expand});
  }
  function paint() {
    $('#calendarPanel').hidden=!months.length;
    $('#calendarEmpty').hidden=!!months.length;
    if(!months.length) {onSelect?.('',{expand:false});return;}
    select.value=current;
    $('#calendarMonthLabel').textContent=label(current);
    select.setAttribute('aria-label',`选择月份，当前${label(current)}`);
    const index=months.indexOf(current);
    $('#calendarPrevious').disabled=index<=0;
    $('#calendarNext').disabled=index>=months.length-1;
    const monthly=rows.filter(r=>r.date.startsWith(current));
    const total=field=>monthly.reduce((sum,r)=>sum+(finite(r[field])||0),0);
    const unknown=!monthly.length && data.historyComplete!==true;
    $('#historySpent').textContent=unknown?'—':money(total('spent'),data);
    $('#historyRequests').textContent=unknown?'—':count(total('requests'));
    $('#historyTokens').textContent=unknown?'—':compact(total('tokens'));
    const amounts=rows.map(r=>finite(r.tokens)).filter(v=>v>0).sort((a,b)=>a-b);
    const q=[.25,.5,.8].map(v=>amounts[Math.min(amounts.length-1,Math.floor(amounts.length*v))]||1);
    if(!selected.startsWith(current)) selected=monthly.at(-1)?.date || current+'-01';
    grid.replaceChildren();
    for(const key of monthCells(current)) {
      if(!key) {const blank=document.createElement('span');blank.className='calendar-blank';grid.append(blank);continue;}
      const item=byDate.get(key), value=finite(item?.tokens)||0;
      const level=value<=0?0:value>=(amounts.at(-1)||1)?4:1+q.filter(n=>value>n).length;
      const button=document.createElement('button'); button.type='button';button.dataset.date=key;
      button.className=`calendar-day level-${level}`;
      const future=localDate(key)>new Date();button.disabled=future;
      const numeral=document.createElement('span');numeral.textContent=String(Number(key.slice(-2)));button.append(numeral);
      const mark=document.createElement('i');mark.setAttribute('aria-hidden','true');button.append(mark);
      button.setAttribute('aria-label',`${fmt(key)}，${item?compact(item.tokens)+' Token':future?'尚未到来':data.historyComplete===true?'无用量':'未获取数据'}`);
      grid.append(button);
    }
    detail(selected);
  }
  function choose(month) {if(!months.includes(month))return;current=month;paint();}
  function paintPicker() {
    const min=Number(months[0]?.slice(0,4)),max=Number(months.at(-1)?.slice(0,4));
    pickerYear=Math.min(max,Math.max(min,pickerYear));
    $('#monthPickerYear').textContent=`${pickerYear} 年`;
    $('#monthPickerRange').textContent=`${label(months[0])} — ${label(months.at(-1))}`;
    $('#monthYearPrevious').disabled=pickerYear<=min;$('#monthYearNext').disabled=pickerYear>=max;
    const options=Array.from({length:12},(_,i)=>{
      const key=`${pickerYear}-${String(i+1).padStart(2,'0')}`;
      const button=document.createElement('button');button.type='button';button.className='month-option';button.dataset.month=key;button.textContent=`${i+1}月`;
      button.disabled=!months.includes(key);button.setAttribute('aria-label',`${pickerYear}年${i+1}月`);button.setAttribute('aria-pressed',String(key===current));return button;
    });
    $('#monthOptions').replaceChildren(...options);
  }
  select.addEventListener('click',()=>{if(!months.length)return;pickerYear=Number(current.slice(0,4));paintPicker();select.setAttribute('aria-expanded','true');picker.open();});
  $('#monthYearPrevious').addEventListener('click',()=>{pickerYear--;paintPicker();});
  $('#monthYearNext').addEventListener('click',()=>{pickerYear++;paintPicker();});
  $('#monthOptions').addEventListener('click',event=>{const button=event.target.closest('[data-month]');if(!button||button.disabled)return;choose(button.dataset.month);picker.close();});
  $('#monthPickerClose').addEventListener('click',()=>picker.close());
  $('#monthPickerCancel').addEventListener('click',()=>picker.close());
  $('#monthSheet').addEventListener('sheet-close',()=>select.setAttribute('aria-expanded','false'));
  $('#calendarPrevious').addEventListener('click',()=>choose(months[months.indexOf(current)-1]));
  $('#calendarNext').addEventListener('click',()=>choose(months[months.indexOf(current)+1]));
  grid.addEventListener('click',event=>{const cell=event.target.closest('[data-date]');if(cell&&!cell.disabled)detail(cell.dataset.date,true);});
  return {update(next){
    data=next; rows=(next.daily||[]).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date));byDate=new Map(rows.map(r=>[r.date,r]));months=monthKeys(rows);
    if(!months.includes(current)) current=months.at(-1)||'';
    paint();
    if($('#monthSheet').classList.contains('open')){if(months.length)paintPicker();else picker.close();}
  }};
}
