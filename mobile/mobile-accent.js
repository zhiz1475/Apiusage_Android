export const ACCENT_STORAGE_KEY = 'apiusagebar-mobile-accent';
// Text, buttons and calendar levels are paired for light/dark surfaces.
export const accentPalettes = [
  {id:'wine',name:'酒红',action:'#76252c',day:['#76252c','#8f3038','#ead6d8','#c59a9e','#a25e65'],night:['#c7838a','#93434c','#493035','#71434a','#a25e68']},
  {id:'blue',name:'雾蓝',action:'#285577',day:['#285577','#396987','#dce7ed','#a4bdcc','#49748e'],night:['#8cbbd6','#507f9b','#293e4c','#3a5c72','#49748e']},
  {id:'forest',name:'松绿',action:'#315e4d',day:['#315e4d','#467460','#dce8e1','#a7c5b4','#537a63'],night:['#91bca8','#557e68','#2c4037','#42644f','#537a63']},
  {id:'violet',name:'靛紫',action:'#59436f',day:['#59436f','#74598b','#e7e0ec','#beb0cf','#80628e'],night:['#b8a0cf','#816995','#3d344a','#5d4b73','#80628e']},
  {id:'amber',name:'琥珀',action:'#785320',day:['#785320','#916b39','#eee4d5','#d1b692','#926e3f'],night:['#d2b27e','#9a7847','#443a2d','#705637','#926e3f']},
  {id:'graphite',name:'石墨',action:'#4b5058',day:['#4b5058','#636a74','#e3e5e8','#b5bac2','#6e7580'],night:['#b7bec8','#858e9a','#34383f','#505864','#6e7580']}
];
export function accentTokens(id,theme) {
  const p=accentPalettes.find(p=>p.id===id)||accentPalettes[0];
  const [text,strong,heat1,heat2,heat3]=p[theme==='night'?'night':'day'];
  return {'--accent':text,'--accent-strong':strong,'--accent-action':p.action,'--accent-hover':p.action,'--accent-soft':heat1,'--heat-1':heat1,'--heat-2':heat2,'--heat-3':heat3,'--heat-4':p.action};
}
export function createAccentPicker({ui,getTheme}) {
  let chosen='wine';
  try {const saved=localStorage.getItem(ACCENT_STORAGE_KEY);if(accentPalettes.some(p=>p.id===saved))chosen=saved;} catch {}
  const grid=document.querySelector('#accentOptions');
  for(const p of accentPalettes) {
    const button=document.createElement('button');button.type='button';button.className='accent-option';button.dataset.accent=p.id;
    button.setAttribute('role','radio');button.setAttribute('aria-label',p.name);
    const swatch=document.createElement('span');swatch.className='accent-swatch';swatch.style.background=p.action;swatch.setAttribute('aria-hidden','true');
    const name=document.createElement('span');name.textContent=p.name;
    const tick=document.createElement('span');tick.className='accent-tick';tick.textContent='✓';tick.setAttribute('aria-hidden','true');
    button.append(swatch,name,tick);grid.append(button);
  }
  function refresh() {
    document.body.dataset.accent=chosen;
    for(const [name,value] of Object.entries(accentTokens(chosen,getTheme()))) document.body.style.setProperty(name,value);
    document.querySelector('#accentValue').textContent=accentPalettes.find(p=>p.id===chosen).name;
    grid.querySelectorAll('[data-accent]').forEach(button=>{const active=button.dataset.accent===chosen;button.setAttribute('aria-checked',String(active));button.tabIndex=active?0:-1;});
  }
  function choose(id) {
    if(!accentPalettes.some(p=>p.id===id))return;
    chosen=id;try{localStorage.setItem(ACCENT_STORAGE_KEY,id);}catch{};refresh();
  }
  grid.addEventListener('click',event=>{const button=event.target.closest('[data-accent]');if(button)choose(button.dataset.accent);});
  grid.addEventListener('keydown',event=>{
    const delta={ArrowRight:1,ArrowLeft:-1,ArrowDown:3,ArrowUp:-3}[event.key];
    if(!delta&&event.key!=='Home'&&event.key!=='End')return;
    event.preventDefault();const n=accentPalettes.length;
    const index=event.key==='Home'?0:event.key==='End'?n-1:(accentPalettes.findIndex(p=>p.id===chosen)+delta+n)%n;
    choose(accentPalettes[index].id);grid.children[index].focus();
  });
  document.querySelector('#settingsTheme').addEventListener('click',()=>{ui.openSheet('accentSheet');});
  document.querySelector('#accentClose').addEventListener('click',()=>ui.closeSheet());
  document.querySelector('#accentDone').addEventListener('click',()=>ui.closeSheet());
  refresh();return {refresh};
}
