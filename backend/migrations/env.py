from alembic import context
from sqlalchemy import create_engine,pool
import os
url=os.environ['DATABASE_URL']
with create_engine(url,poolclass=pool.NullPool).connect() as connection:
 context.configure(connection=connection)
 with context.begin_transaction():context.run_migrations()
