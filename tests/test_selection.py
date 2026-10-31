from tests.test_api import client
from backend.app import lookup,limits

def test_multiselect_and_validation():
 limits.clear();c=client('multiple');bank=next(q['bank'] for q in lookup.values() if q['multiple']);sid=c.post('/api/v1/practice-sessions',json={'mode':'special','bank':bank}).json()['id'];url='/api/v1/practice-sessions/'+sid
 for _ in range(30):
  v=c.get(url).json();q=v['question'];correct=lookup[q['id']]['answer']
  assert c.post(url+'/answers',json={'index':v['index'],'options':['Z']}).status_code==400
  if q['multiple']:
   r=c.post(url+'/answers',json={'index':v['index'],'options':correct}).json();assert r['correct'];break
  c.post(url+'/answers',json={'index':v['index'],'options':correct});c.post(url+'/next',json={'index':v['index']})
 else:raise AssertionError('测试未找到多选')

def test_question_inventory_valid():
 for q in lookup.values():
  ids=[o['id'] for o in q['options']]
  assert len(set(ids))==len(ids)
  assert set(q['answer'])<=set(ids)
  assert q['multiple'] or len(q['answer'])==1

def test_concurrent_duplicate_submission():
 from concurrent.futures import ThreadPoolExecutor
 limits.clear();c=client('concurrent');sid=c.post('/api/v1/practice-sessions',json={'mode':'mixed','count':20}).json()['id'];url='/api/v1/practice-sessions/'+sid;q=c.get(url).json()['question'];payload={'index':0,'options':lookup[q['id']]['answer']}
 with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:c.post(url+'/answers',json=payload),range(2)))
 assert all(r.status_code==200 for r in results)
 assert results[0].json()==results[1].json()
 assert c.get('/api/v1/stats').json()[q['id']]['attempts']==1
