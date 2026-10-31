"""Versioned practice API. Session snapshots preserve published question content."""
import os,json,uuid,hashlib,secrets,random,time,math,re,copy
from collections import defaultdict,deque
from urllib.parse import urlparse
from fastapi import FastAPI,HTTPException,Request,Response
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel,Field
from sqlalchemy import create_engine,MetaData,Table,Column,String,Text,Integer,Float,select,insert,update,delete
from sqlalchemy.exc import IntegrityError
from backend.bank_text import normalize_question,normalize_text
from backend.explanation_refs import compile_explanation,explanation_metadata,source_labels
app=FastAPI(title='Praxis API',version='1.0.0')
e=create_engine(os.getenv('DATABASE_URL','sqlite:///data/app.db'),hide_parameters=True,**({'connect_args':{'check_same_thread':False,'timeout':30}} if os.getenv('DATABASE_URL','sqlite:').startswith('sqlite') else {}))
m=MetaData()
users=Table('accounts',m,Column('id',String,primary_key=True),Column('name',String,unique=True),Column('password',Text),Column('role',String,nullable=False,server_default='user'))
tokens=Table('auth_sessions',m,Column('token',String,primary_key=True),Column('uid',String),Column('expires',Float))
sessions=Table('practice_sessions',m,Column('id',String,primary_key=True),Column('uid',String,index=True),Column('body',Text),Column('version',Integer))
attempts=Table('answer_events',m,Column('id',String,primary_key=True),Column('uid',String,index=True),Column('qid',String),Column('correct',Integer),Column('created',Float))
m.create_all(e)
questions=json.load(open(os.getenv('BANK_PATH','data/questions.json')))
lookup={q['id']:q for q in questions}
BANKS=['真题速攻-经济基础','高频错题-经济基础','真题速攻-金融','高频错题-金融']
limits=defaultdict(deque)

@app.exception_handler(RequestValidationError)
async def validation_error(r,exc):
 # Pydantic's default errors include raw input, including submitted passwords.
 return JSONResponse(status_code=422,content={'detail':[
  {'loc':error['loc'],'msg':error['msg'],'type':error['type']} for error in exc.errors()
 ]},headers={'Cache-Control':'no-store'})

@app.middleware('http')
async def guard(r,call):
 if r.method not in ('GET','HEAD','OPTIONS'):
  origin=r.headers.get('origin')
  allowed=os.getenv('ALLOWED_ORIGINS','http://localhost:5173,http://127.0.0.1:5173' if e.dialect.name=='sqlite' else '').split(',')
  if origin and urlparse(origin).netloc!=r.headers.get('host') and origin not in allowed:return JSONResponse({'detail':'禁止跨站请求'},403)
  if r.headers.get('sec-fetch-site')=='cross-site':return JSONResponse({'detail':'禁止跨站请求'},403)
 response=await call(r);response.headers['X-Content-Type-Options']='nosniff'
 if r.url.path.startswith(('/api/','/assets-bank/')):
  response.headers['Cache-Control']='no-store'
 return response

def user(r):
 token=hashlib.sha256(r.cookies.get('session','').encode()).hexdigest()
 with e.connect() as c: row=c.execute(select(tokens.c.uid).where(tokens.c.token==token,tokens.c.expires>time.time())).first()
 if not row:raise HTTPException(401,'请先登录')
 return row[0]
def digest(p,s):return hashlib.scrypt(p.encode(),salt=s.encode(),n=16384,r=8,p=1).hex()
def password(p):
 s=secrets.token_hex(16);return s+':'+digest(p,s)
def matches(p,h):return secrets.compare_digest(h.split(':')[1],digest(p,h.split(':')[0]))
class Credentials(BaseModel):
 name:str=Field(min_length=2,max_length=40)
 password:str=Field(min_length=8,max_length=128)
@app.get('/api/v1/health')
def health():
 with e.connect() as c:c.execute(select(users.c.id).limit(1))
 return {'ok':True,'questions':len(questions),'bank_status':'candidate'}
@app.post('/api/v1/auth/{action}')
def auth(action:str,b:Credentials,r:Request,response:Response):
 if action not in ('login','register'):raise HTTPException(404)
 key=(r.client.host,action);now=time.time();queue=limits[key]
 while queue and queue[0]<now-60:queue.popleft()
 if len(queue)>=15:raise HTTPException(429,'请求过于频繁，请稍后重试')
 queue.append(now);name=b.name.strip()
 if len(name)<2:raise HTTPException(400,'用户名至少2字')
 try:
  with e.begin() as c:
   row=c.execute(select(users).where(users.c.name==name)).mappings().first()
   if action=='register':
    if row:raise HTTPException(409,'用户名已存在')
    uid=str(uuid.uuid4());c.execute(insert(users).values(id=uid,name=name,password=password(b.password)))
   else:
    if not row or not matches(b.password,row['password']):raise HTTPException(401,'账号或密码错误')
    uid=row['id']
   token=secrets.token_hex(32);c.execute(insert(tokens).values(token=hashlib.sha256(token.encode()).hexdigest(),uid=uid,expires=now+30*86400))
 except IntegrityError:raise HTTPException(409,'用户名已存在')
 response.set_cookie('session',token,httponly=True,secure=os.getenv('COOKIE_SECURE')=='true',samesite='strict',max_age=30*86400);return {'name':name}
@app.get('/api/v1/me')
def me(r:Request):
 with e.connect() as c:return dict(c.execute(select(users.c.id,users.c.name,users.c.role).where(users.c.id==user(r))).mappings().one())
@app.post('/api/v1/logout')
def logout(r:Request,response:Response):
 with e.begin() as c:c.execute(delete(tokens).where(tokens.c.token==hashlib.sha256(r.cookies.get('session','').encode()).hexdigest()))
 response.delete_cookie('session');return {'ok':True}
class ChangePassword(BaseModel):
 current:str
 password:str=Field(min_length=8,max_length=128)
@app.post('/api/v1/password')
def change(b:ChangePassword,r:Request):
 u=user(r)
 with e.begin() as c:
  h=c.execute(select(users.c.password).where(users.c.id==u)).scalar_one()
  if not matches(b.current,h):raise HTTPException(400,'原密码错误')
  c.execute(update(users).where(users.c.id==u).values(password=password(b.password)));c.execute(delete(tokens).where(tokens.c.uid==u))
 return {'ok':True}
def statistics(u):
 result={}
 with e.connect() as c:rows=c.execute(select(attempts).where(attempts.c.uid==u).order_by(attempts.c.created,attempts.c.id)).mappings().all()
 for row in rows:
  s=result.setdefault(row['qid'],{'attempts':0,'errors':0,'streak':0,'pending':False,'last':0})
  s['attempts']+=1;s['last']=row['created']
  if row['correct']:s['streak']+=1;s['pending']=s['pending'] and s['streak']<2
  else:s['errors']+=1;s['streak']=0;s['pending']=True
 return result
@app.get('/api/v1/stats')
def stats(r:Request):return statistics(user(r))
@app.get('/api/v1/banks')
def banks(r:Request):
 s=statistics(user(r));return [{'name':n,'count':sum(q['bank']==n for q in questions),'done':sum(q['bank']==n and q['id'] in s for q in questions)} for n in BANKS]
class CreateSession(BaseModel):
 mode:str
 bank:str|None=None
 subject:str='全部'
 count:int=20
 restart:bool=False

def question_snapshot(question, rng=None):
 """Shuffle presentation once; immutable option IDs remain the grading keys."""
 snapshot=copy.deepcopy(question)
 # These answers reference their position or other option letters. Preserve their
 # original order rather than silently changing the meaning of a valid answer.
 references=re.compile(r'选项\s*[A-E]|[A-E]\s*项|[A-E]\s*(?:和|与|及|或|、|，|,)\s*[A-E]|(?:[A-E]){2,}\s*(?:项|均|都|正确|错误)|(?:以上|上述|前述)\s*(?:各项|选项|各选项|说法|表述|答案|都|均|全部|所有)|前[一二三四五两\d]+[个项]',re.I)
 compiled=compile_explanation(question.get('explanation',''),question)
 provenance={oid:label for label,oid in (source_labels(question) or {}).items()}
 snapshot['option_order_locked']=question.get('shuffle_options') is False or compiled['explanation_mode']=='original' or bool(references.search(question['stem']) or any(references.search(option['text']) for option in question['options']))
 for i,option in enumerate(snapshot['options']):
  source=provenance.get(option['id']) or (option['id'] if option['id'] in 'ABCDE' and len(option['id'])==1 else None)
  if source:option['source_label']=source
  else:option.pop('source_label',None)
 if not snapshot['option_order_locked']:(rng or random).shuffle(snapshot['options'])
 for i,option in enumerate(snapshot['options']):option['label']=option.get('source_label',chr(65+i)) if snapshot['option_order_locked'] else chr(65+i)
 return snapshot

def answer_labels(question, ids):
 return [option.get('label') or option.get('source_label') or (option['id'] if re.fullmatch('[A-E]',option['id']) else chr(65+i)) for i,option in enumerate(question['options']) if option['id'] in ids]

@app.post('/api/v1/practice-sessions')
def create(b:CreateSession,r:Request):
 u=user(r)
 if b.mode not in ('special','mixed','mistakes') or b.count not in (20,30,50) or b.subject not in ('全部','金融','经济基础'):raise HTTPException(400,'无效练习设置')
 if b.mode=='special' and b.bank not in BANKS:raise HTTPException(400,'请选择专项')
 if b.mode=='special' and not b.restart:
  for h in history(r):
   if h['mode']=='special' and h['bank']==b.bank and h['index']<h['total']:return {'id':h['id']}
 pool=[q for q in questions if (not b.bank or q['bank']==b.bank) and (b.subject=='全部' or b.subject in q['bank'])];s=statistics(u)
 def weight(q):
  z=s.get(q['id'],{});return 1+z.get('errors',0)**2/max(z.get('attempts',1),1)
 def sample(p,n):return sorted(p,key=lambda q:-math.log(max(random.random(),1e-12))/weight(q))[:n]
 pending=[q for q in pool if s.get(q['id'],{}).get('pending')]
 if b.mode=='mistakes':pool=sample(pending,b.count)
 elif b.mode=='mixed':
  picked=sample(pending,round(b.count*.3));ids={q['id'] for q in picked};rest=[q for q in pool if q['id'] not in ids];random.shuffle(rest);rest.sort(key=lambda q:(q['id'] in s,s.get(q['id'],{}).get('last',0)));pool=picked+rest[:b.count-len(picked)];random.shuffle(pool)
 else:random.shuffle(pool)
 if not pool:raise HTTPException(400,'暂无可练习题目')
 # Full immutable snapshots allow updates without changing active sessions.
 body={'items':[question_snapshot(question) for question in pool],'index':0,'results':{},'mode':b.mode,'bank':b.bank,'subject':b.subject,'created':time.time()};sid=str(uuid.uuid4())
 with e.begin() as c:c.execute(insert(sessions).values(id=sid,uid=u,body=json.dumps(body,ensure_ascii=False),version=0))
 return {'id':sid}
def read_session(c,sid,u):
 row=c.execute(select(sessions).where(sessions.c.id==sid,sessions.c.uid==u)).mappings().first()
 if not row:raise HTTPException(404,'练习不存在')
 return json.loads(row['body']),row['version']
def safe(q):
 display,_=normalize_question(q)
 return {k:v for k,v in display.items() if k not in ('answer','explanation','explanation_parts','explanation_mode')}
def display_result(result):
 if result is None:return None
 display=copy.deepcopy(result)
 if isinstance(display.get('explanation'),str):display['explanation']=normalize_text(display['explanation'])
 display.update(explanation_metadata(display.get('explanation',''),display.get('question') or {}))
 if isinstance(display.get('question'),dict):display['question']=safe(display['question'])
 return display
@app.get('/api/v1/history')
def history(r:Request):
 u=user(r)
 with e.connect() as c:rows=c.execute(select(sessions).where(sessions.c.uid==u)).mappings().all()
 out=[]
 for row in rows:
  b=json.loads(row['body']);out.append({'id':row['id'],'mode':b['mode'],'bank':b['bank'],'subject':b['subject'],'index':b['index'],'total':len(b['items']),'correct':sum(x['correct'] for x in b['results'].values()),'created':b['created']})
 return sorted(out,key=lambda x:x['created'],reverse=True)
@app.get('/api/v1/practice-sessions/{sid}')
def get(sid:str,r:Request):
 with e.connect() as c:b,_=read_session(c,sid,user(r))
 idx=b['index'];item=b['items'][idx] if idx<len(b['items']) else None
 return {'id':sid,'index':idx,'total':len(b['items']),'mode':b['mode'],'question':safe(item) if item else None,'result':display_result(b['results'].get(str(idx))),'results':[display_result(value) for value in b['results'].values()],'elapsed':round(time.time()-b['created'])}
class Answer(BaseModel):
 index:int=Field(ge=0)
 options:list[str]=Field(min_length=1,max_length=5)
@app.post('/api/v1/practice-sessions/{sid}/answers')
def answer(sid:str,v:Answer,r:Request):
 return save_answer(sid,v,user(r))
def save_answer(sid,v,u,allow_jump=False):
 for _ in range(3):
  with e.begin() as c:
   b,version=read_session(c,sid,u);key=str(v.index)
   if key in b['results']:return display_result(b['results'][key])
   if (not allow_jump and v.index!=b['index']) or v.index>=len(b['items']):raise HTTPException(409,'题目状态已更新，请刷新')
   q=b['items'][v.index]
   if len(set(v.options))!=len(v.options) or not set(v.options)<=set(o['id'] for o in q['options']) or (not q['multiple'] and len(v.options)!=1):raise HTTPException(400,'无效选项')
   correct=set(v.options)==set(q['answer']);result={'correct':correct,'answer':q['answer'],'answer_labels':answer_labels(q,q['answer']),'selected':v.options,'selected_labels':answer_labels(q,v.options),'explanation':q['explanation'],'question':safe(q)};b['results'][key]=result
   if allow_jump:
    while b['index']<len(b['items']) and str(b['index']) in b['results']:b['index']+=1
   changed=c.execute(update(sessions).where(sessions.c.id==sid,sessions.c.version==version).values(body=json.dumps(b,ensure_ascii=False),version=version+1))
   if changed.rowcount:
    c.execute(insert(attempts).values(id=sid+':'+key,uid=u,qid=q['id'],correct=int(correct),created=time.time()));return display_result(result)
 raise HTTPException(409,'请重试')
@app.post('/api/v1/practice-sessions/{sid}/next')
def next_question(sid:str,v:dict,r:Request):
 with e.begin() as c:
  b,version=read_session(c,sid,user(r))
  if v.get('index')!=b['index']:return {'ok':True}
  if str(b['index']) not in b['results']:raise HTTPException(400,'请先作答')
  b['index']+=1;c.execute(update(sessions).where(sessions.c.id==sid,sessions.c.version==version).values(body=json.dumps(b,ensure_ascii=False),version=version+1))
 return {'ok':True}
@app.get('/api/v1/mistakes')
def mistakes(r:Request):
 s=statistics(user(r));return [{'question':safe(lookup[k]),**v} for k,v in s.items() if v['errors'] and k in lookup]
@app.get('/api/v1/mistakes/{qid}/review')
def mistake_review(qid:str,r:Request):
 """Latest personal attempt, using its immutable content and option identities."""
 u=user(r)
 if not statistics(u).get(qid,{}).get('errors'):raise HTTPException(404,'错题记录不存在')
 with e.connect() as c:
  events=c.execute(select(attempts.c.id).where(attempts.c.uid==u,attempts.c.qid==qid).order_by(attempts.c.created.desc(),attempts.c.id.desc())).scalars().all()
  for event in events:
   sid,_,index=event.rpartition(':')
   body,_=read_session(c,sid,u)
   result=body.get('results',{}).get(index)
   if result:return display_result(result)
 raise HTTPException(404,'作答快照不存在')
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

class BankAssets(StaticFiles):
 """Question materials have the same login boundary as the question API."""
 async def get_response(self,path,scope):
  await run_in_threadpool(user,Request(scope))
  return await super().get_response(path,scope)

app.mount('/assets-bank',BankAssets(directory='data/assets',check_dir=False),name='bank-assets')
from backend.simple import install as install_simple
install_simple(app)
