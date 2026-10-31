"""A second presentation of the primary bank and immutable practice records."""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import time
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import Table, Column, String, Float, select, insert, delete
from sqlalchemy.exc import IntegrityError

from backend.app import (e, m, user, questions, lookup, sessions, attempts, statistics,
                         safe, question_snapshot, answer_labels, read_session, Answer, save_answer, display_result)
from backend.bank_text import normalize_question, normalize_text

bookmarks = Table('question_bookmarks', m, Column('uid', String, primary_key=True),
                  Column('qid', String, primary_key=True), Column('created', Float, nullable=False))
m.create_all(e)
metadata_path = Path(os.getenv('SIMPLE_METADATA_PATH', 'data/simple-metadata.json'))
metadata = json.loads(metadata_path.read_text()) if metadata_path.is_file() else {}
display = metadata.get('questions', {})
legacy_ids = {key: value for key, value in metadata.get('legacy_ids', {}).items() if value in lookup}
catalog_version = hashlib.sha256(json.dumps(questions, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]
router = APIRouter(prefix='/api/v1')


def presentation(q):
    q, _ = normalize_question(q)
    info = display.get(q['id'], {})
    source = Path(q.get('source', '')).stem
    series = '真题速攻' if q['bank'].startswith('真题速攻') else '高频错题'
    subject = '金融' if '金融' in q['bank'] else '基础'
    group = re.sub(r'^\d+[.．]中级(?:基础|金融)(?:高频错题|-真题速攻)-?', '', source) or series
    if '高频错题' in series:
        group = re.search(r'第\d+期', source).group() if re.search(r'第\d+期', source) else group
    if series == '真题速攻':
        part = re.search(r'[（(](\d+)[）)]', source)
        if '单选' in source:
            group = f'第 {part[1]} 套' if subject == '基础' and part else '单选' + (f'（{part[1]}）' if part else '')
        elif '多选' in source:
            group = '多选' + (f'（{part[1]}）' if part else '')
        elif '案例' in source:
            group = '案例'
    source_key = hashlib.sha256((q['bank'] + ':' + source).encode()).hexdigest()[:12]
    return {
        'id': q['id'], 'stem': q['stem'], 'options': q['options'], 'multiple': q['multiple'],
        'bank': q['bank'], 'subject': subject, 'series': series, 'set': source_key,
        'set_label': info.get('set_label', group),
        'set_order': int(re.match(r'\d+', source)[0]) if re.match(r'\d+', source) else 999,
        'no': q.get('number', ''), 'module': info.get('module') or q.get('module') or '未分类',
        'type': 'case' if q.get('images') or q.get('material') else 'multi' if q['multiple'] else 'single',
        'material': q.get('material', ''), 'images': q.get('images', []),
    }


def account_state(uid):
    stats = statistics(uid)
    with e.connect() as connection:
        rows = connection.execute(select(sessions).where(sessions.c.uid == uid)).mappings().all()
        events = connection.execute(select(attempts).where(attempts.c.uid == uid)
                                    .order_by(attempts.c.created, attempts.c.id)).mappings().all()
        stars = list(connection.execute(select(bookmarks.c.qid).where(bookmarks.c.uid == uid)).scalars())
    bodies = {row['id']: json.loads(row['body']) for row in rows}
    records = {}
    for event in events:
        sid, _, index = event['id'].rpartition(':')
        result = bodies.get(sid, {}).get('results', {}).get(index)
        if result:
            records[event['qid']] = display_result(result)
    recent = sorted(((sid, b) for sid, b in bodies.items() if b['index'] < len(b['items'])),
                    key=lambda item: item[1]['created'], reverse=True)
    return {'user_id': uid, 'stats': stats, 'records': records, 'stars': stars,
            'resume': {'id': recent[0][0], 'index': recent[0][1]['index'], 'total': len(recent[0][1]['items'])} if recent else None}


@router.get('/simple/catalog')
def catalog(request: Request):
    user(request)
    return {'questions': [presentation(q) for q in questions], 'version': catalog_version}


@router.get('/simple/state')
def state(request: Request):
    return account_state(user(request))


@router.get('/bookmarks')
def get_bookmarks(request: Request):
    uid = user(request)
    with e.connect() as connection:
        return {qid: True for qid in connection.execute(select(bookmarks.c.qid).where(bookmarks.c.uid == uid)).scalars()}


class Star(BaseModel):
    starred: bool


@router.post('/bookmarks/{qid}')
def set_bookmark(qid: str, body: Star, request: Request):
    uid = user(request)
    if qid not in lookup:
        raise HTTPException(404, '题目不存在')
    try:
        with e.begin() as connection:
            if body.starred:
                if not connection.execute(select(bookmarks.c.qid).where(bookmarks.c.uid == uid, bookmarks.c.qid == qid)).first():
                    connection.execute(insert(bookmarks).values(uid=uid, qid=qid, created=time.time()))
            else:
                connection.execute(delete(bookmarks).where(bookmarks.c.uid == uid, bookmarks.c.qid == qid))
    except IntegrityError:
        # Concurrent identical requests are idempotent under the composite key.
        pass
    return {'starred': body.starred}


class Start(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=5000)
    version: str
    retry: bool = False


@router.post('/simple/sessions')
def start(body: Start, request: Request):
    uid = user(request)
    if body.version != catalog_version:
        raise HTTPException(409, '题库已更新，请刷新页面后继续')
    if len(set(body.ids)) != len(body.ids) or any(qid not in lookup for qid in body.ids):
        raise HTTPException(400, '题目范围无效')
    signature = hashlib.sha256(','.join(body.ids).encode()).hexdigest()
    if not body.retry:
        with e.connect() as connection:
            rows = connection.execute(select(sessions).where(sessions.c.uid == uid)).mappings().all()
        for row in sorted(rows, key=lambda r: json.loads(r['body'])['created'], reverse=True):
            saved = json.loads(row['body'])
            if (saved.get('simple_signature') == signature
                    and saved.get('simple_catalog_version') == catalog_version
                    and saved['index'] < len(saved['items'])):
                return {'id': row['id'], 'index': saved['index'], 'total': len(saved['items'])}
    bank_names = {lookup[qid]['bank'] for qid in body.ids}
    bank = next(iter(bank_names)) if len(bank_names) == 1 else None
    items = []
    for qid in body.ids:
        q = copy.deepcopy(lookup[qid])
        q['shuffle_options'] = False
        items.append(question_snapshot(q))
    saved = {'items': items, 'index': 0, 'results': {}, 'mode': 'special' if bank else 'mixed',
             'bank': bank, 'subject': '金融' if all('金融' in n for n in bank_names) else '经济基础' if all('经济基础' in n for n in bank_names) else '全部',
             'created': time.time(), 'interface': 'simple', 'simple_signature': signature,
             'simple_catalog_version': catalog_version}
    sid = str(uuid.uuid4())
    with e.begin() as connection:
        connection.execute(insert(sessions).values(id=sid, uid=uid, body=json.dumps(saved, ensure_ascii=False), version=0))
    return {'id': sid, 'index': 0, 'total': len(items)}


@router.get('/simple/sessions/{sid}')
def view(sid: str, request: Request):
    with e.connect() as connection:
        saved, _ = read_session(connection, sid, user(request))
    return {'id': sid, 'index': saved['index'], 'total': len(saved['items']),
            'questions': [presentation(q) for q in saved['items']],
            'results': {key: display_result(result) for key, result in saved['results'].items()}}


@router.post('/simple/sessions/{sid}/answers')
def submit(sid: str, body: Answer, request: Request):
    return save_answer(sid, body, user(request), allow_jump=True)


@router.get('/simple/questions/{qid}/review')
def review(qid: str, request: Request, session_id: str | None = None):
    uid = user(request)
    if session_id:
        with e.connect() as connection:
            saved, _ = read_session(connection, session_id, uid)
        q = next((item for item in saved['items'] if item['id'] == qid), None)
        if not q:
            raise HTTPException(404, '本轮题目不存在')
    else:
        q = lookup.get(qid)
    if not q:
        raise HTTPException(404, '题目不存在')
    return display_result({'answer': q['answer'], 'explanation': q.get('explanation', ''), 'question': presentation(q)})


class ImportRecords(BaseModel):
    records: dict[str, dict] = Field(default_factory=dict, max_length=5000)
    stars: list[str] = Field(default_factory=list, max_length=5000)


@router.post('/simple/import')
def import_records(body: ImportRecords, request: Request):
    uid = user(request)
    existing = statistics(uid)
    imported, star_count, skipped = [], 0, 0
    stars = {legacy_ids.get(qid, qid) for qid in body.stars}
    for original_id, record in body.records.items():
        qid = legacy_ids.get(original_id, original_id)
        if record.get('star'):
            stars.add(qid)
        selected = record.get('selected', record.get('c', []))
        if isinstance(selected, str):
            selected = list(selected)
        q = lookup.get(qid)
        if (not q or qid in existing or not isinstance(selected, list) or not selected
                or any(not isinstance(option, str) for option in selected)
                or len(set(selected)) != len(selected)
                or not set(selected) <= {option['id'] for option in q['options']}
                or (not q['multiple'] and len(selected) != 1)):
            skipped += 1
            continue
        imported.append((q, selected))
        existing[qid] = {}  # Reject aliases pointing to the same canonical question.
    if imported:
        sid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'simple-import:' + uid + ':' + ','.join(sorted(q['id'] for q, _ in imported))))
        items, results = [], {}
        for index, (q, selected) in enumerate(imported):
            snapshot = copy.deepcopy(q)
            snapshot['shuffle_options'] = False
            snapshot = question_snapshot(snapshot)
            items.append(snapshot)
            results[str(index)] = {'correct': set(selected) == set(q['answer']), 'answer': q['answer'],
                                   'answer_labels': answer_labels(snapshot, q['answer']), 'selected': selected,
                                   'selected_labels': answer_labels(snapshot, selected),
                                   'explanation': q.get('explanation', ''), 'question': safe(snapshot)}
        saved = {'items': items, 'index': len(items), 'results': results, 'mode': 'mixed', 'bank': None,
                 'subject': '全部', 'created': time.time(), 'interface': 'simple-import'}
        try:
            with e.begin() as connection:
                connection.execute(insert(sessions).values(id=sid, uid=uid, body=json.dumps(saved, ensure_ascii=False), version=0))
                for index, (q, _) in enumerate(imported):
                    connection.execute(insert(attempts).values(id=f'{sid}:{index}', uid=uid, qid=q['id'],
                                                              correct=int(results[str(index)]['correct']), created=time.time()))
        except IntegrityError:
            skipped += len(imported)
            imported = []
    for qid in stars & lookup.keys():
        try:
            with e.begin() as connection:
                if not connection.execute(select(bookmarks.c.qid).where(bookmarks.c.uid == uid, bookmarks.c.qid == qid)).first():
                    connection.execute(insert(bookmarks).values(uid=uid, qid=qid, created=time.time()))
                    star_count += 1
        except IntegrityError:
            pass
    return {'imported': len(imported), 'stars': star_count, 'skipped': skipped}


def install(app):
    app.include_router(router)
