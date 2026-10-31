"""Extract candidate banks; content review remains separate from structural validation."""
import re,json,hashlib,argparse,sys
from pathlib import Path
import pdfplumber
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.bank_text import normalize_question
HEADER=re.compile(r'(?m)^\s*(?:(\d+)\s*[.．、]\s*【(单选题?|多选题?|多项选择题|案例分析题)】|【(\d+)\s*[-－]\s*(单选题?|多选题?)】|【拓展题目】)')
ANSWER=re.compile(r'(?m)^\s*(\d+)\s*[.．]\s*正确答案[：:]\s*([A-E、,，\s]+?)\s*\|\s*解析[：:]')
def clean(page):
 def keep(o):
  if o.get('object_type')!='char':return True
  mat=o.get('matrix',(1,0,0,1,0,0));return abs(mat[1])<.03 and abs(mat[2])<.03 and 30<o['top']<page.height-28
 text=page.filter(keep).extract_text(x_tolerance=2) or ''
 return '\n'.join(l for l in text.splitlines() if not re.search('学员专用|请勿外泄|环球青藤教研中心',l))
def parse(path,pages):
 full='';offsets=[]
 for p in pages:offsets.append(len(full));full+=p+'\n'
 def pageof(pos):return sum(pos>=o for o in offsets)
 answers=list(ANSWER.finditer(full));start=answers[0].start() if answers else len(full)
 amap={}
 for i,a in enumerate(answers):amap[a[1]]=(re.findall('[A-E]',a[2]),full[a.end():answers[i+1].start() if i+1<len(answers) else len(full)].strip(),pageof(a.start()))
 matches=list(HEADER.finditer(full[:start]));out=[];issues=[]
 for i,h in enumerate(matches):
  end=matches[i+1].start() if i+1<len(matches) else start;chunk=full[h.end():end];number=h[1] or h[3] or f'extra-{i}';kind=h[2] or h[4] or ''
  inline=re.search(r'【答案】\s*([A-E、,，\s]+?)\s*【解析】',chunk)
  if inline:
   ans=re.findall('[A-E]',inline[1]);explanation=chunk[inline.end():].strip();content=chunk[:inline.start()];apage=pageof(h.end()+inline.start())
  elif number in amap:ans,explanation,apage=amap[number];content=chunk
  else:issues.append({'number':number,'page':pageof(h.start()),'reason':'缺答案或解析'});continue
  opts=list(re.finditer(r'(?m)^\s*([A-E])(?:[.．、：:]\s*|\s+)',content))
  if len(opts)<4 or len(opts)>5 or len(set(o[1] for o in opts))!=len(opts):issues.append({'number':number,'page':pageof(h.start()),'reason':'选项边界异常'});continue
  options=[{'id':o[1],'text':content[o.end():opts[j+1].start() if j+1<len(opts) else len(content)].strip()} for j,o in enumerate(opts)]
  stem=content[:opts[0].start()].strip()
  # Remove unrelated footer promotions and next chapter titles from explanations.
  explanation=re.split(r'考前冲刺利器|抢购请戳|第[一二三四五六七八九十\d]+章\s',explanation)[0].strip()
  if not stem or not set(ans)<=set(o['id'] for o in options):issues.append({'number':number,'reason':'题干或答案无效'});continue
  if '单选' in kind and len(ans)!=1:issues.append({'number':number,'reason':'单选含多个答案'});continue
  qid=hashlib.sha256((str(path.relative_to(ROOT))+'#'+str(i)+'#'+number).encode()).hexdigest()[:24]
  q={'id':qid,'revision':1,'status':'candidate','bank':path.parent.name.removeprefix('题-'),'stem':stem,'options':options,'answer':ans,'explanation':explanation,'multiple':len(ans)>1 or ('多选' in kind or '多项' in kind),'source':str(path.relative_to(ROOT)),'number':number,'pages':[pageof(h.start()),pageof(end-1)],'answer_page':apage}
  if kind=='案例分析题':
   q['material']='案例材料请结合原始页面核对。';q['images']=[]
   # Preserve complete original question pages, including raster tables missing from text.
   for pn in range(q['pages'][0],q['pages'][1]+1):
    target=ROOT/'data/assets'/f'{path.stem}-{pn}.png'
    if not target.exists():
     with pdfplumber.open(path) as doc:
      pg=doc.pages[pn-1]; words=pg.extract_words(); cuts=[w['top'] for w in words if '正确答案' in w['text']]
      if cuts:pg=pg.crop((0,0,pg.width,max(1,min(cuts)-8)))
      pg.to_image(resolution=110).save(target)
    q['images'].append('/assets-bank/'+target.name)
  q,_=normalize_question(q)
  out.append(q)
 return out,issues

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--cached',action='store_true');args=parser.parse_args();(ROOT/'data/assets').mkdir(parents=True,exist_ok=True);cache=ROOT/'tmp/cleaned';cache.mkdir(parents=True,exist_ok=True)
 allq=[];report=[]
 for path in sorted((ROOT/'题库').rglob('*.pdf')):
  dest=cache/(path.stem+'.json')
  if args.cached and dest.exists():pages=json.loads(dest.read_text())
  else:
   with pdfplumber.open(path) as doc:pages=[clean(p) for p in doc.pages]
   dest.write_text(json.dumps(pages,ensure_ascii=False))
  qs,issues=parse(path,pages);allq+=qs;report.append({'source':str(path.relative_to(ROOT)),'pages':len(pages),'candidates':len(qs),'issues':issues});print(path.name,len(qs),len(issues),flush=True)
 (ROOT/'data/questions.json').write_text(json.dumps(allq,ensure_ascii=False,indent=2));(ROOT/'data/import-report.json').write_text(json.dumps({'status':'candidate_not_reviewed','total':len(allq),'sources':report},ensure_ascii=False,indent=2))
 print('候选题共',len(allq),'；自动校验不代替内容复核。',flush=True)
if __name__=='__main__':main()
