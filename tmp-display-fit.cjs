const { app, BrowserWindow, screen } = require('electron');
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
function fit(win, mode, measured={}) {
 const limits=mode==='full'?{width:1080,height:800,maxWidth:1600,maxHeight:1100}:{width:460,height:690,maxWidth:640,maxHeight:860};
 const min=mode==='full'?[720,580]:[400,600];
 win.setMinimumSize(...min);
 const width=clamp(Number.isFinite(Number(measured.width))?Number(measured.width):limits.width,min[0],limits.maxWidth);
 const height=clamp(Number.isFinite(Number(measured.height))?Number(measured.height):limits.height,min[1],limits.maxHeight);
 const current=win.getBounds(); const display=screen.getDisplayMatching(current); const work=display.workArea;
 const aw=Math.max(1,work.width-24), ah=Math.max(1,work.height-24); const sw=clamp(width,Math.min(min[0],aw),aw), sh=clamp(height,Math.min(min[1],ah),ah);
 const cx=current.x+current.width/2,cy=current.y+current.height/2;
 const lb=work.width>sw+24?work.x+12:work.x,tb=work.height>sh+24?work.y+12:work.y,rb=work.width>sw+24?work.x+work.width-sw-12:work.x+work.width-sw,bb=work.height>sh+24?work.y+work.height-sh-12:work.y+work.height-sh;
 const b={x:clamp(Math.round(cx-sw/2),lb,rb),y:clamp(Math.round(cy-sh/2),tb,bb),width:sw,height:sh};win.setBounds(b,false);return {display:{id:display.id,bounds:display.bounds,workArea:work},b};
}
app.whenReady().then(async()=>{const displays=screen.getAllDisplays();const secondary=displays.find(d=>d.bounds.x<0)||displays[0];const w=new BrowserWindow({x:secondary.workArea.x+20,y:secondary.workArea.y+20,width:460,height:690,show:false,frame:false,transparent:false,thickFrame:true,resizable:true,minWidth:400,minHeight:600,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});const out=[];out.push({phase:'initial',bounds:w.getBounds(),matching:screen.getDisplayMatching(w.getBounds()).id});out.push({phase:'full-secondary',...fit(w,'full',{width:1080,height:800})});out.push({phase:'widget-secondary',...fit(w,'widget',{width:460,height:690})});w.setBounds({x:secondary.workArea.x+secondary.workArea.width-420,y:secondary.workArea.y+secondary.workArea.height-620,width:400,height:600},false);out.push({phase:'widget-edge-secondary',bounds:w.getBounds(),matching:screen.getDisplayMatching(w.getBounds()).id});out.push({phase:'full-edge-secondary',...fit(w,'full',{width:1080,height:800})});console.log(JSON.stringify({displays:displays.map(d=>({id:d.id,workArea:d.workArea})),out},null,2));app.exit(0)});
