"""Generate UI catalogs locally from public Argos models; no outbound text/API calls."""
import json
import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tmp/i18n-toolchain'))
import ctranslate2
import sentencepiece as spm

def model(folder):
    directory=ROOT / 'tmp/i18n-models' / folder
    base = next(directory.rglob('metadata.json')).parent
    return (ctranslate2.Translator(str(base / 'model'), device='cpu', compute_type='int8', inter_threads=1, intra_threads=4), spm.SentencePieceProcessor(model_file=str(base / 'sentencepiece.model')))

def batch(pair, strings):
    translator, tokenizer = pair
    # SentencePiece's unknown leading emoji can cause immediate EOS. Preserve
    # decorative symbols outside the model rather than translating them.
    prefixes=[re.match(r'^[^A-Za-zÀ-ÿ0-9]+',s).group(0) if re.match(r'^[^A-Za-zÀ-ÿ0-9]+',s) else '' for s in strings]
    tokens = [tokenizer.encode(s[len(prefix):], out_type=str) for s,prefix in zip(strings,prefixes)]
    results = translator.translate_batch(tokens, beam_size=1, max_batch_size=2048, batch_type='tokens', max_decoding_length=512, repetition_penalty=1.1)
    return [prefix+' '.join(tokenizer.decode(r.hypotheses[0]).replace('▁',' ').split()) for prefix,r in zip(prefixes,results)]

def protect(text):
    tokens=[]
    def replace(m):
        tokens.append(m.group(0))
        return ' ' + str(98765000+len(tokens)-1) + ' '
    value=re.sub(r'\{\w+\}|`[^`]+`|\b(?:ItriX(?: Farm| Technologies)?|ITRIX|Supabase|CNSS|ONSSA|MAD|FIFO|DAR|LMR|CPC|EC|pH|NPK|AMM|PWA|WhatsApp|Telegram)\b',replace,text)
    return value,tokens

def restore(result, original, tokens, pair, pivot=None):
    for i,token in enumerate(tokens):
        pattern=r'\b'+str(98765000+i)+r'\b'
        if not re.search(pattern,result,re.I):
            # Never discard an interpolation or a protected technical reference.
            pattern='('+'|'.join(re.escape(t) for t in sorted(tokens,key=len,reverse=True))+')'
            parts=re.split(pattern,original)
            pending=[p for p in parts if p not in tokens and p.strip()]
            intermediate=batch(pivot,pending) if pivot else pending
            translated=iter(batch(pair,intermediate))
            return ''.join(p if p in tokens or not p.strip() else next(translated) for p in parts)
        result=re.sub(pattern,lambda _:token,result,flags=re.I)
    return result.strip()

if __name__ == '__main__':
    sources=json.loads((ROOT/'tmp/i18n-sources.json').read_text(encoding='utf8'))
    checkpoint=ROOT/'tmp/i18n-generated.json'
    catalog=json.loads(checkpoint.read_text(encoding='utf8')) if checkpoint.exists() else {}
    catalog={k:[' '.join(v.replace('▁',' ').split()) for v in values] for k,values in catalog.items()}
    fr_en=model('fr-en'); en_ar=model('en-ar')
    todo=[e['source'] for e in sources if e['source'] not in catalog or any(not v.strip() for v in catalog[e['source']])]
    started=time.time()
    for offset in range(0,len(todo),32):
        group=todo[offset:offset+32]
        protected=[protect(s) for s in group]
        english=batch(fr_en,[p[0] for p in protected])
        arabic=batch(en_ar,english)
        for source,en,ar,(_,tokens) in zip(group,english,arabic,protected):
            # English intermediates are restored only after Arabic generation.
            en=restore(en,source,tokens,fr_en)
            ar=restore(ar,source,tokens,en_ar,fr_en)
            en=re.sub(r'\bcampaign\b','growing season',en,flags=re.I)
            catalog[source]=[ar,en]
        checkpoint.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(f'{min(offset+32,len(todo))}/{len(todo)} translated ({time.time()-started:.0f}s)',flush=True)
    destination=ROOT/'lib/locales/generated.json'
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(f'Catalog generated: {len(catalog)} UI messages',flush=True)
