"""Reflow extracted prose without changing question content or mathematical layout."""
import copy
import re
from collections import Counter

CJK = re.compile(r'[\u3400-\u9fff]')
MATH = re.compile(r'[₀-₉⁰-⁹\U0001d400-\U0001d7ffα-ωΑ-Ω∑∫√≈≤≥=+*/^]')
END = re.compile(r'[。！？；：!?;:][”’」』）)]?$')
MARKER = re.compile(r'^(?P<marker>[（(][一二三四五六七八九十\d]+[）)]|[①-⑳]|[一二三四五六七八九十]+[、．]|\d{1,3}[.．、](?!\d)|[•●▪]|-\s)(?=\S|\s)')
HEADING = re.compile(r'^(?:【[^】]+】|答案与解析$)')
NUMBER = r'[+−-]?\d+(?:\.\d+)?%?'
TABLE_ROW = re.compile(rf'^\S+\s+{NUMBER}(?:\s+{NUMBER})+\s*$')
TABLE_HEADER = re.compile(r'^(?:项目|指标|年份|年度|账户|科目)\s+\S+(?:\s+\S+)+$')
TEXT_FIELDS = ('stem', 'explanation', 'material')


def content_fields(question):
    for name in TEXT_FIELDS:
        if isinstance(question.get(name), str):
            yield name, question[name]
    for index, option in enumerate(question.get('options', [])):
        if isinstance(option.get('text'), str):
            yield f'options[{index}].text', option['text']


def mathematical_line(line):
    compact = re.sub(r'\s', '', line)
    chinese = len(CJK.findall(compact))
    return bool(compact) and (
        bool(re.fullmatch(r'[A-Za-z]|[₀-₉⁰-⁹]+', compact))
        or bool(MATH.search(compact)) and chinese < len(compact) * .35
        and (not chinese or chinese <= 4 and not re.search(r'[。！？；：，!?;:]', compact))
    )


def marker_kind(line):
    match = MARKER.match(line)
    if not match:
        return ''
    return re.sub(r'[一二三四五六七八九十\d①-⑳]+', '#', match['marker'])


def normalize_text(text):
    """Join physical line wraps; retain paragraphs, list items, tables and formulas."""
    text = text.replace('\r\n', '\n').replace('\r', '\n').replace('\u2029', '\n\n').replace('\u2028', '\n')
    raw = text.strip('\n').split('\n')
    lines = [line.strip(' \t') for line in raw]
    markers = Counter(marker_kind(line) for line in lines if marker_kind(line))
    protected = {i for i, line in enumerate(lines)
                 if mathematical_line(line) or TABLE_ROW.fullmatch(line) or TABLE_HEADER.fullmatch(line)}
    output = raw[0].rstrip(' \t')
    for index in range(1, len(lines)):
        left, right = lines[index - 1], lines[index]
        kind = marker_kind(right)
        # A decimal or a wrapped value such as "为\n25.则…" is not a list item.
        numbered = bool(kind) and (
            not re.match(r'^\d+[.．]', right) or markers[kind] > 1 or bool(END.search(left))
        )
        keep = (not left or not right or index - 1 in protected or index in protected
                or END.search(left) or HEADING.match(right) or left == '答案与解析' or numbered)
        if keep:
            separator, line = '\n', raw[index].rstrip(' \t')
        else:
            separator = ' ' if re.search(r'[A-Za-z]$', left) and re.match(r'^[A-Za-z]', right) else ''
            line = lines[index]
        output += separator + line
    if re.sub(r'\s', '', output) != re.sub(r'\s', '', text):
        raise ValueError('Text reflow changed non-whitespace characters')
    return output


def normalize_question(question):
    result = copy.deepcopy(question)
    changed = []
    for field, before in content_fields(question):
        after = normalize_text(before)
        if before == after:
            continue
        if field in TEXT_FIELDS:
            result[field] = after
        else:
            result['options'][int(re.search(r'\[(\d+)\]', field)[1])]['text'] = after
        changed.append(field)
    return result, changed


def review_flags(field, text):
    """Report source extraction defects that cannot be repaired by removing wraps."""
    flags = []
    if any(re.fullmatch(r'\s*(?:[A-Za-z]|[₀-₉⁰-⁹\U0001d400-\U0001d7ff\s]+)\s*', line)
           for line in text.splitlines()):
        flags.append('floating_formula_fragment')
    if field.startswith('options[') and '答案与解析' in text:
        flags.append('source_heading_in_option')
    if field == 'explanation' and re.search(r'【\d+[-－](?:\d+|案例题)】', text):
        flags.append('embedded_case_question')
    return flags
