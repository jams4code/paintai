from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import struct, json, zipfile
R=Path(__file__).resolve().parents[1]; icons=R/'src-tauri/icons'
# Per-size optical masters are embedded individually, 32px first (Tauri recommendation).
order=[32,16,24,48,64,256]; blobs=[(R/f'png/paintai-{s}.png').read_bytes() for s in order]
offset=6+16*len(order); entries=[]
for s,b in zip(order,blobs):
 entries.append(struct.pack('<BBBBHHII',s%256,s%256,0,0,1,32,len(b),offset));offset+=len(b)
(icons/'icon.ico').write_bytes(struct.pack('<HHH',0,1,len(order))+b''.join(entries)+b''.join(blobs))
chunks=[]
for code,s in [('icp4',16),('icp5',32),('icp6',64),('ic07',128),('ic08',256),('ic09',512),('ic10',1024),('ic11',32),('ic12',64),('ic13',256),('ic14',512)]:
 b=(R/f'png/paintai-{s}.png').read_bytes();chunks.append(code.encode()+struct.pack('>I',len(b)+8)+b)
b=b''.join(chunks);(icons/'icon.icns').write_bytes(b'icns'+struct.pack('>I',len(b)+8)+b)
(R/'tauri-bundle-icons.json').write_text(json.dumps({'bundle':{'icon':['icons/32x32.png','icons/128x128.png','icons/128x128@2x.png','icons/icon.icns','icons/icon.ico']}},indent=2)+'\n')
# Show exported pixels, not a second drawing of the mark.
W,H=1440,1050; im=Image.new('RGB',(W,H),'#F5F7F6');d=ImageDraw.Draw(im)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
f=lambda s,b=False:ImageFont.truetype(bold if b else font,s)
d.text((65,48),'PaintAI',fill='#252B30',font=f(42,True));d.text((65,105),'VECTOR REBUILD  /  02',fill='#64716F',font=f(15))
d.line((65,151,1375,151),fill='#D8DEDC',width=1)
def paste(path,x,y,size=None):
 a=Image.open(path).convert('RGBA')
 if size:a=a.resize((size,size),Image.Resampling.LANCZOS)
 im.paste(a,(x,y),a)
paste(R/'png/paintai-512.png',112,180,380)
d.text((125,592),'Mascot',fill='#252B30',font=f(22,True));d.text((125,625),'Wire, eyes, brows, brush. No mouth.',fill='#64716F',font=f(16))
paste(R/'png/paintai-silhouette.png',607,220,256)
d.text((599,592),'Wire silhouette',fill='#252B30',font=f(22,True));d.text((599,625),'Face removed. P formed by the wire.',fill='#64716F',font=f(16))
d.rounded_rectangle((1000,190,1350,550),radius=22,fill='#252B30')
paste(R/'png/paintai-dark.png',1047,236)
d.text((1012,592),'Dark surface',fill='#252B30',font=f(22,True));d.text((1012,625),'Light wire / teal brush.',fill='#64716F',font=f(16))
d.line((65,680,1375,680),fill='#D8DEDC',width=1)
d.text((65,717),'Native size',fill='#252B30',font=f(19,True))
for x,s in [(90,16),(180,24),(280,32),(390,48),(515,64)]:
 paste(R/f'png/paintai-{s}.png',x,780+(64-s)//2)
 d.text((x,862),f'{s}px',fill='#64716F',font=f(14))
d.text((725,717),'16px optical master',fill='#252B30',font=f(19,True))
a=Image.open(R/'png/paintai-16.png').resize((128,128),Image.Resampling.NEAREST);im.paste(a,(730,775),a)
d.text((905,783),'At 16–24px, keep the clip + brush.',fill='#64716F',font=f(17))
d.text((905,814),'Face returns from 32px.',fill='#64716F',font=f(17))
d.text((905,863),'8× pixel view',fill='#64716F',font=f(14))
d.text((65,973),'CHARCOAL  #252B30      TEAL  #00B8A9      4-UNIT MASTER STROKE',fill='#64716F',font=f(14))
im.save(R/'PaintAI-Vector-Preview.png')
# Container and native pixel validation.
assert Image.open(icons/'icon.ico').ico.sizes()=={(s,s) for s in order}
for s in [16,24,32,48,64,128,256,512,1024]:
 a=Image.open(R/f'png/paintai-{s}.png');assert a.mode=='RGBA' and a.size==(s,s)
 assert a.getbbox()
 border=a.getchannel("A"); assert max(border.crop((0,0,s,1)).getdata())<64 and max(border.crop((0,s-1,s,s)).getdata())<64
icns=Image.open(icons/'icon.icns');icns.load()
print('Validated 9 RGBA sizes, 6 ICO layers, and ICNS decoding.')
