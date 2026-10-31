import os,tempfile,json
os.environ['DATABASE_URL']='sqlite:///'+tempfile.mktemp(suffix='.db')
from fastapi.testclient import TestClient
from backend.app import app,lookup,limits

def client(name):
 c=TestClient(app);r=c.post('/api/v1/auth/register',json={'name':name,'password':'testing12345'});assert r.status_code==200;return c

def test_complete_flow():
 c=client('tester');s=c.post('/api/v1/practice-sessions',json={'mode':'mixed','count':20}).json()['id'];p='/api/v1/practice-sessions/'+s;v=c.get(p).json();assert v['total']==20;assert 'answer' not in v['question'];q=v['question'];wrong=next(o['id'] for o in q['options'] if o['id'] not in lookup[q['id']]['answer'])
 a={'index':0,'options':[wrong]};first=c.post(p+'/answers',json=a);assert first.status_code==200;assert first.json()['correct']==False
 assert c.post(p+'/answers',json=a).json()==first.json();assert c.get('/api/v1/stats').json()[q['id']]['attempts']==1
 assert c.get(p).json()['result']==first.json();assert c.get('/api/v1/mistakes').json()[0]['pending']
 c.post(p+'/next',json={'index':0});assert c.get(p).json()['index']==1;c.post(p+'/next',json={'index':0});assert c.get(p).json()['index']==1
 for _ in range(2):
  sid=c.post('/api/v1/practice-sessions',json={'mode':'mistakes','count':20}).json()['id'];url='/api/v1/practice-sessions/'+sid
  assert c.get(url).json()['question']['id']==q['id'];assert c.post(url+'/answers',json={'index':0,'options':lookup[q['id']]['answer']}).json()['correct']
 stats=c.get('/api/v1/stats').json()[q['id']];assert stats['attempts']==3 and stats['errors']==1 and not stats['pending']
 other=client('other');assert other.get(p).status_code==404;assert other.get('/api/v1/stats').json()=={}
 assert c.post('/api/v1/practice-sessions',json={'mode':'mixed','count':999}).status_code==400
 assert c.post('/api/v1/logout',json={}).status_code==200;assert c.get('/api/v1/me').status_code==401

def test_security_and_validation():
 c=client('secure');assert c.post('/api/v1/logout',json={},headers={'Origin':'https://evil.example'}).status_code==403
 assert c.post('/api/v1/auth/login',json={'name':'secure','password':'wrongpassword'}).status_code==401
 assert c.post('/api/v1/password',json={'current':'testing12345','password':'changed12345'}).status_code==200
 assert c.get('/api/v1/me').status_code==401
 assert c.post('/api/v1/auth/login',json={'name':'secure','password':'changed12345'}).status_code==200

def test_snapshot_and_special_resume():
 c=client('snapshot');bank=c.get('/api/v1/banks').json()[0]['name'];body={'mode':'special','bank':bank};sid=c.post('/api/v1/practice-sessions',json=body).json()['id'];assert c.post('/api/v1/practice-sessions',json=body).json()['id']==sid
 assert c.post('/api/v1/practice-sessions',json={**body,'restart':True}).json()['id']!=sid
