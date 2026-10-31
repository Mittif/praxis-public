// Shared by both interfaces. Stable IDs, never displayed letters, bind references.
export const PHONE_QUERY = '(max-width: 760px)';
export const DESKTOP_PAGE_SIZE = 12;
export const PHONE_PAGE_SIZE = 5;

export function displayOptionLabel(option, index) {
  return option.label || option.source_label || (/^[A-E]$/.test(option.id) ? option.id : String.fromCharCode(65 + index));
}

export function explanationView(question, result) {
  const original = result.explanation || '';
  const fallback = { text: original, mapped: false, hasReferences: false };
  if (result.explanation_mode !== 'mapped' || !Array.isArray(result.explanation_parts)) return fallback;
  const options = question.options || [];
  const labels = new Map(options.map((option, index) => [option.id, displayOptionLabel(option, index)]));
  if (labels.size !== options.length || new Set(labels.values()).size !== labels.size) return fallback;
  let source = '', text = '', hasReferences = false;
  for (const part of result.explanation_parts) {
    if (part.type === 'text' && typeof part.text === 'string') { source += part.text; text += part.text; }
    else if (part.type === 'option_ref' && typeof part.source_text === 'string' && Array.isArray(part.option_ids) && part.option_ids.length && part.option_ids.every(id => labels.has(id))) {
      source += part.source_text;
      text += part.option_ids.map(id => labels.get(id)).join('、');
      hasReferences = true;
    } else return fallback;
  }
  return source === original ? { text, mapped: true, hasReferences } : fallback;
}

export function recordQuestion(current, result) {
  const saved = result?.question;
  if (!saved || saved.id !== current.id || !Array.isArray(saved.options)) return current;
  // Use the current display order only when it describes the same content.
  const same = current.stem === saved.stem && (current.material || '') === (saved.material || '') && JSON.stringify(current.images || []) === JSON.stringify(saved.images || []) &&
    current.options.length === saved.options.length && current.options.every(option => saved.options.some(old => old.id === option.id && old.text === option.text));
  return same ? current : { ...current, ...saved };
}

export function pageInfo(total, anchor, size) {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages - 1, Math.max(0, Math.floor(anchor / size)));
  const start = page * size;
  return { page, pages, start, end: Math.min(total, start + size), total, size };
}
