"""Compile explicit option references without changing source explanations.

Unclassified standalone letters deliberately disable shuffling for new sessions.
Historical snapshots are never rewritten. Formula variables and English words
are not option references. Compilation is deterministic and requires no model.
"""
import re

GROUP = re.compile(r'(?<![A-Za-z0-9_])[A-E](?:(?:\s*(?:、|，|,|和|与|及|或|以及)\s*|\s*)[A-E])*(?![A-Za-z0-9_])')
PREFIX = re.compile(r'(?:选项|原题|(?:正确|参考)?答案(?:为|是|应为|应选|选择|选)?|故选|应选|选择|选)\s*[:：]?\s*[（(]?\s*$')
SUFFIX = re.compile(r'^\s*(?:选项|[一二三四五两\d]*项|说法|表述|叙述|正确|错误|不正确|不选|符合|不符合|(?:均|都)(?:为|是)?(?:正确|错误|不正确|不选|符合|不符合))')
LITERAL_PREFIX = re.compile(r'(?:(?:公式|变量|系数|函数|常数|参数|字母|代码|等级|评级|曲线|直线|线段|坐标|交点|向量)(?:中的?|里的?|为|是)?|式中(?:的)?)\s*$')
LITERAL_SUFFIX = re.compile(r'^\s*(?:公司|企业|银行|国(?:家)?|商品|产品|股票|债券|品牌|型号|项目|方案|模型|曲线|点|级|类(?:股|型|产品|份额))')
MATH = re.compile(r'[=+\-*/×÷^<>≤≥≈≠]')


def source_labels(question):
    """Only explicit provenance or legacy letter IDs establish source labels."""
    options = question.get('options', [])
    result = {}
    ids = set()
    for option in options:
        oid = option.get('id')
        source = option.get('source_label') or (oid if isinstance(oid, str) and re.fullmatch('[A-E]', oid) else None)
        if not isinstance(source, str) or not re.fullmatch('[A-E]', source) or source in result or not isinstance(oid, str) or not oid or oid in ids:
            return None
        result[source] = oid
        ids.add(oid)
    return result or None


def compile_explanation(text, question):
    """Return lossless text/ref tokens, or an explicit conservative fallback."""
    if not isinstance(text, str):
        return {'explanation_mode': 'original', 'explanation_parts': [], 'issues': [{'offset': 0, 'reason': 'invalid_text'}]}
    labels = source_labels(question)
    parts, issues, cursor = [], [], 0
    for match in GROUP.finditer(text):
        before, after = text[:match.start()], text[match.end():]
        # Literal contexts win even if prose nearby says "选项" or "正确".
        literal = (LITERAL_PREFIX.search(before) or LITERAL_SUFFIX.match(after)
                   or MATH.search(before.rstrip()[-1:]) or MATH.match(after.lstrip()[:1]))
        if literal:
            if PREFIX.search(before):
                issues.append({'offset': match.start(), 'reason': 'ambiguous_literal_reference'})
            continue
        if not (PREFIX.search(before) or SUFFIX.match(after)):
            issues.append({'offset': match.start(), 'reason': 'ambiguous_letter'})
            continue
        refs = re.findall('[A-E]', match.group())
        if not labels or any(letter not in labels for letter in refs):
            issues.append({'offset': match.start(), 'reason': 'missing_source_label'})
            continue
        if match.start() > cursor:
            parts.append({'type': 'text', 'text': text[cursor:match.start()]})
        parts.append({'type': 'option_ref', 'option_ids': [labels[letter] for letter in refs], 'source_text': match.group()})
        cursor = match.end()
    if issues:
        return {'explanation_mode': 'original', 'explanation_parts': [], 'issues': issues}
    if cursor < len(text):
        parts.append({'type': 'text', 'text': text[cursor:]})
    return {'explanation_mode': 'mapped', 'explanation_parts': parts, 'issues': []}


def explanation_metadata(text, question):
    compiled = compile_explanation(text, question)
    return {key: compiled[key] for key in ('explanation_mode', 'explanation_parts')}
