"""Run against a live deployment: BASE_URL=http://localhost:8080 python3 scripts/smoke.py."""
import urllib.request,json,http.cookiejar,time,os,secrets
jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));base=os.getenv('BASE_URL','http://localhost:8080')
def call(p,b=None):
 req=urllib.request.Request(base+'/api/v1'+p,data=json.dumps(b).encode() if b is not None else None,headers={'Content-Type':'application/json'})
 return json.load(client.open(req))
name='smoke'+str(time.time_ns());call('/auth/register',{'name':name,'password':secrets.token_urlsafe(24)});assert call('/me')['name']==name
assert len(call('/banks'))==4
s=call('/practice-sessions',{'mode':'mixed','count':20,'subject':'全部'});url='/practice-sessions/'+s['id'];v=call(url);assert v['total']==20;assert 'answer' not in v['question'];answer={'index':0,'options':[v['question']['options'][0]['id']]};r=call(url+'/answers',answer);assert 'correct' in r
assert call(url+'/answers',answer)==r;assert call('/stats')[v['question']['id']]['attempts']==1
call(url+'/next',{'index':0});assert call(url)['index']==1;assert call('/history')
print('PASS: 注册、题库、选题、答案隔离、幂等提交、进度与统计')
