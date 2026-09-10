// Same source silhouettes, with explicit light fills for dark surfaces. No remote assets.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../mobile/assets/logos');
fs.mkdirSync(path.join(root,'night'),{recursive:true});
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.svg'))) {
  let svg=fs.readFileSync(path.join(root,name),'utf8');
  svg=svg.replace(/fill="(?!none)[^"]+"/g,'fill="#eeeef0"').replace(/stroke="(?!none)[^"]+"/g,'stroke="#eeeef0"');
  if(!/<svg[^>]*\sfill=/.test(svg))svg=svg.replace('<svg ','<svg fill="#eeeef0" ');
  fs.writeFileSync(path.join(root,'night',name),svg);
}
fs.writeFileSync(path.join(root,'night/glm.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img"><title>GLM</title><path d="M12 1.5 22 7.3v9.4L12 22.5 2 16.7V7.3Z" fill="#eeeef0"/><path d="m12 4 2.6 5.4L20 12l-5.4 2.6L12 20l-2.6-5.4L4 12l5.4-2.6Z" fill="#323236"/></svg>`);
console.log('Created 9 night model icons');
