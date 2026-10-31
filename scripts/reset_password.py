import sys,getpass
from backend.app import e,users,tokens,password,select,update,delete
name=sys.argv[1] if len(sys.argv)>1 else input('用户名：')
p=getpass.getpass('新密码（至少8位）：')
if len(p)<8:raise SystemExit('密码过短')
with e.begin() as c:
 uid=c.execute(select(users.c.id).where(users.c.name==name)).scalar_one()
 c.execute(update(users).where(users.c.id==uid).values(password=password(p)))
 c.execute(delete(tokens).where(tokens.c.uid==uid))
print('密码已重置，旧会话已失效')
