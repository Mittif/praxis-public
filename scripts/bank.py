"""Validate, compare and atomically publish a maintained bank JSON."""
import json,sys,hashlib,shutil,time,os
from pathlib import Path
root=Path(__file__).resolve().parents[1];target=root/'data/questions.json'
def validate(path):
 qs=json.loads(path.read_text());seen=set()
 for q in qs:
  assert q['id'] not in seen,'重复ID';seen.add(q['id']);assert q['stem'].strip(),'空题干'
  ids=[o['id'] for o in q['options']];assert len(set(ids))==len(ids) and len(ids)>=2,'选项异常'
  assert q['answer'] and set(q['answer'])<=set(ids),'答案异常'
  assert q['multiple'] or len(q['answer'])==1,'单选多答案'
  for image in q.get('images',[]):assert (root/'data/assets'/Path(image).name).exists(),'缺少资源'
 return qs
if __name__=='__main__':
 cmd=sys.argv[1];path=Path(sys.argv[2]) if len(sys.argv)>2 else target
 if cmd=='validate':print('校验通过：',len(validate(path)))
 elif cmd in ('diff','publish'):
  new=validate(path);old=json.loads(target.read_text());a={q['id']:q for q in old};b={q['id']:q for q in new}
  print('新增',len(b.keys()-a.keys()),'移除',len(a.keys()-b.keys()),'修订',sum(a[k]!=b[k] for k in a.keys()&b.keys()))
  if cmd=='publish':
   releases=root/'data/releases';releases.mkdir(exist_ok=True);shutil.copy2(target,releases/(str(time.time_ns())+'.json'));temp=target.with_suffix('.tmp');temp.write_text(json.dumps(new,ensure_ascii=False,indent=2));os.replace(temp,target);print('已发布，更新后端服务以加载；进行中的会话不变。')
 else:raise SystemExit('用法：bank.py validate|diff|publish [JSON路径]')
