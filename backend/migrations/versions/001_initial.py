"""Initial immutable-session schema, matching the original 1.0 baseline."""
from alembic import op
import sqlalchemy as sa
revision='001'
down_revision=None

def upgrade():
 tables={
 'accounts':[sa.Column('id',sa.String,primary_key=True),sa.Column('name',sa.String,unique=True),sa.Column('password',sa.Text)],
 'auth_sessions':[sa.Column('token',sa.String,primary_key=True),sa.Column('uid',sa.String),sa.Column('expires',sa.Float)],
 'practice_sessions':[sa.Column('id',sa.String,primary_key=True),sa.Column('uid',sa.String,index=True),sa.Column('body',sa.Text),sa.Column('version',sa.Integer)],
 'answer_events':[sa.Column('id',sa.String,primary_key=True),sa.Column('uid',sa.String,index=True),sa.Column('qid',sa.String),sa.Column('correct',sa.Integer),sa.Column('created',sa.Float)]}
 existing=sa.inspect(op.get_bind()).get_table_names()
 for name,columns in tables.items():
  if name not in existing:op.create_table(name,*columns)
def downgrade():
 raise RuntimeError('请使用备份恢复，避免删除用户数据')
