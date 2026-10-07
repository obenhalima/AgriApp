"""Extract or rebuild the static guide while preserving its HTML and anchors."""
import json,re,sys
from pathlib import Path
from html.parser import HTMLParser
from html import escape
root=Path(__file__).resolve().parents[1]
text=(root/'public/guide-utilisateur.html').read_text(encoding='utf8')
offsets=[0]
for m in re.finditer('\n',text):offsets.append(m.end())
class Guide(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=False);self.skip=0;self.edits=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','code'):self.skip+=1
    def handle_endtag(self,tag):
        if tag in ('script','style','code'):self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        key=re.sub(r'\s+',' ',data).strip()
        if self.skip or not re.search(r'[a-zÀ-ÿ]{2}',key,re.I):return
        line,col=self.getpos();start=offsets[line-1]+col
        self.edits.append((start,start+len(data),data,key))
guide=Guide();guide.feed(text)
if '--extract' in sys.argv:
    file=root/'tmp/i18n-sources.json';sources=json.loads(file.read_text(encoding='utf8'));known={e['source'] for e in sources}
    for _,_,_,key in guide.edits:
        if key not in known:sources.append({'source':key,'files':['public/guide-utilisateur.html']});known.add(key)
    file.write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Guide messages:',len(guide.edits),'Total:',len(sources))
else:
    catalog=json.loads((root/'lib/locales/generated.json').read_text(encoding='utf8'))
    for lang,index in [('ar',0),('en',1)]:
        result=text
        for start,end,data,key in reversed(guide.edits):
            value=catalog.get(key,[key,key])[index] or key
            prefix=re.match(r'^\s*',data)[0];suffix=re.search(r'\s*$',data)[0]
            result=result[:start]+prefix+escape(value)+suffix+result[end:]
        result=result.replace('<html lang="fr">',f'<html lang="{lang}" dir="'+('rtl' if lang=='ar' else 'ltr')+'">')
        if lang=='ar':result=result.replace('</head>','<style>body{font-family:Tahoma,Arial,sans-serif}.ti,.sh{direction:rtl}th{text-align:start}</style></head>')
        (root/f'public/guide-utilisateur.{lang}.html').write_text(result,encoding='utf8')
    print('Arabic and English guides generated with original links and anchors.')
