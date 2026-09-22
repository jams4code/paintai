from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
import json
ROOT=Path(__file__).resolve().parents[1]
CHAR='#252B30'; TEAL='#00B8A9'; LIGHT='#F4F7F7'

def svg(body,view='0 0 64 64',w=64,h=64):
 return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{view}" fill="none"><title>PaintAI</title>{body}</svg>'

def mark(face=True,color=CHAR,mono=False):
 # Gem wire: open outer end, long nested return, inner top hook and P bowl.
 wire='M44 37V18C44 2 12 2 12 18V47C12 59 24 59 24 47V22C24 14 36 14 36 22V30C36 38 30 38 24 38'
 b=f'<g stroke="{color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path id="clip-wire" d="{wire}"/><path id="brush-handle" d="M44 37L54 28"/>'
 if face:
  b+='<g id="eyes" fill="#FFFFFF"><circle cx="12" cy="23" r="5"/><circle cx="44" cy="23" r="5"/></g>'
  b+=f'<path id="brows" d="M6 7L12 5M44 5L50 7"/><g fill="{CHAR}" stroke="none"><circle cx="13" cy="23" r="1.6"/><circle cx="45" cy="23" r="1.6"/></g>'
 b+='</g>'
 b+=f'<path id="brush-tip" fill="{color if mono else TEAL}" d="M52 27C51 23 55 19 61 17C60 21 64 24 59 28C57 30 54 30 52 27Z"/>'
 return b

def micro(color=CHAR,mono=False):
 # Dedicated 16px optical master; 1.5px wire, all face detail removed.
 b=f'<g stroke="{color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.25 9.25V4.25C11.25.75 3.25.75 3.25 4.25V11.75C3.25 15.25 6.25 15.25 6.25 11.75V5.75C6.25 3.75 9.25 3.75 9.25 5.75V7.75C9.25 9.75 7.75 9.75 6.25 9.75"/><path d="M11.25 9.25L12.75 6.25"/></g>'
 b+=f'<path fill="{color if mono else TEAL}" d="M12 6C11.5 4.75 12.75 3.75 14.5 3.25C14.25 4.5 15.25 5.25 14 6.5C13.25 7.25 12.5 7 12 6Z"/>'
 return b

for name,b in [('paintai-icon',mark()),('paintai-icon-dark',mark(color=LIGHT)),('paintai-symbol',mark(False)),('paintai-silhouette',mark(False,color='#000000',mono=True))]:
 (ROOT/'svg'/f'{name}.svg').write_text(svg(b))
(ROOT/'svg/paintai-icon-16.svg').write_text(svg(micro(),'0 0 16 16',16,16))
(ROOT/'svg/paintai-icon-16-dark.svg').write_text(svg(micro(color=LIGHT),'0 0 16 16',16,16))
# Outlined wordmark; no font dependency in the deliverable SVG.
f=TTFont('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'); gs=f.getGlyphSet(); cmap=f.getBestCmap(); scale=44/f['head'].unitsPerEm
x=0; parts=[]
for c in 'PaintAI':
 g=gs[cmap[ord(c)]]; pen=SVGPathPen(gs);g.draw(pen)
 parts.append(f'<path fill="{TEAL if c in "AI" else CHAR}" transform="translate({x:.4f} 45) scale({scale:.8f} {-scale:.8f})" d="{pen.getCommands()}"/>')
 x+=g.width*scale-1.4
word=''.join(parts); ww=round(x+3)
(ROOT/'svg/paintai-wordmark.svg').write_text(svg(word,f'0 0 {ww} 58',ww,58))
(ROOT/'svg/paintai-lockup.svg').write_text(svg(mark()+f'<g transform="translate(80 4)">{word}</g>',f'0 0 {ww+80} 64',ww+80,64))
# Renderer uses sharp/librsvg; native exports avoid shrinking a large bitmap.
manifest=[]
for size in [16,24,32,48,64,128,256,512,1024]:
 source='paintai-icon-16.svg' if size<=24 else 'paintai-icon.svg'
 manifest.append({'input':f'svg/{source}','output':f'png/paintai-{size}.png','size':size})
manifest += [{'input':'svg/paintai-icon.svg','output':'src-tauri/icons/'+name,'size':size} for name,size in [('32x32.png',32),('128x128.png',128),('128x128@2x.png',256),('icon.png',512)]]
manifest += [{'input':'svg/paintai-silhouette.svg','output':'png/paintai-silhouette.png','size':256},{'input':'svg/paintai-icon-dark.svg','output':'png/paintai-dark.png','size':256}]
(ROOT/'source/render-jobs.json').write_text(json.dumps(manifest,indent=2))
