const fs=require('fs'),path=require('path');
const sharp=require(require.resolve('sharp',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..');
(async()=>{for(const j of JSON.parse(fs.readFileSync(path.join(__dirname,'render-jobs.json')))){await sharp(path.join(root,j.input),{density:72*j.size/(j.input.includes("-16")?16:64)}).resize(j.size,j.size).ensureAlpha().png().toFile(path.join(root,j.output));} console.log('Rendered SVG masters to native RGBA PNG sizes');})();
