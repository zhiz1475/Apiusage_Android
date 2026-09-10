import assert from 'node:assert/strict';
import {accentTokens,accentPalettes} from './mobile/mobile-accent.js';
const lum=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
assert.equal(accentPalettes.length,6);
for(const p of accentPalettes)for(const mode of ['day','night']) {
  const t=accentTokens(p.id,mode);
  assert.ok(contrast(t['--accent'],mode==='day'?'#fafafa':'#29292c')>=4.5,p.id+' '+mode+' accent text');
  assert.ok(contrast(t['--accent-action'],'#ffffff')>=4.5,p.id+' button');
  assert.ok(contrast(t['--heat-3'],'#ffffff')>=4.5,p.id+' calendar');
  assert.equal(t['--heat-4'],t['--accent-action']);
}
assert.deepEqual(accentTokens('invalid','day'),accentTokens('wine','day'));
console.log('6 palettes × 2 modes: contrast and fallback checks passed');
