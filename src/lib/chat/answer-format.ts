export type ChatAnswerBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'bulletList'; items: string[] }
  | { kind: 'orderedList'; items: string[] }
  | { kind: 'checkList'; items: ChatAnswerCheckItem[] };

export interface ChatAnswerCheckItem {
  label: string;
  detail: string;
  tone: 'neutral' | 'found' | 'missing' | 'caution';
}

export function parseChatAnswer(input: string): ChatAnswerBlock[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const blocks: ChatAnswerBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const text = cleanInlineText(paragraph.join(' '));
    paragraph = [];
    if (!text || isProcessPreamble(text)) return;
    blocks.push({ kind: 'paragraph', text });
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || isHorizontalRule(line)) {
      flushParagraph();
      continue;
    }

    if (isPipeTableLine(line)) {
      flushParagraph();
      const tableLines: string[] = [];
      while (i < lines.length && isPipeTableLine(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
      }
      i--;
      const block = parsePipeTable(tableLines);
      if (block) blocks.push(block);
      continue;
    }

    if (isHeadingLine(line)) {
      flushParagraph();
      const text = cleanHeadingText(line);
      if (text) blocks.push({ kind: 'heading', text });
      continue;
    }

    if (isBulletLine(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && isBulletLine(lines[i].trim())) {
        items.push(cleanInlineText(lines[i].trim().replace(/^[-*]\s+/, '')));
        i++;
      }
      i--;
      const checkBlock = bulletItemsToCheckList(items);
      blocks.push(checkBlock ?? { kind: 'bulletList', items });
      continue;
    }

    if (isOrderedLine(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && isOrderedLine(lines[i].trim())) {
        items.push(cleanInlineText(lines[i].trim().replace(/^\d+[.)]\s+/, '')));
        i++;
      }
      i--;
      blocks.push({ kind: 'orderedList', items });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

function parsePipeTable(lines: string[]): ChatAnswerBlock | null {
  const rows = lines
    .map(parsePipeRow)
    .filter((row) => row.length > 0 && !isSeparatorRow(row));

  if (rows.length < 2) return null;

  const dataRows = rows.slice(1);
  const items = dataRows
    .map((row) => {
      const [first, ...rest] = row;
      const label = cleanInlineText(first);
      const detail = cleanInlineText(rest.join(' - '));
      if (!label || !detail) return null;
      return { label, detail, tone: detectTone(detail) } satisfies ChatAnswerCheckItem;
    })
    .filter((item): item is ChatAnswerCheckItem => item !== null);

  return items.length > 0 ? { kind: 'checkList', items } : null;
}

function parsePipeRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(row: string[]): boolean {
  return row.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
}

function bulletItemsToCheckList(items: string[]): ChatAnswerBlock | null {
  const rows = items.map(splitLabelDetail);
  if (rows.some((row) => row === null)) return null;

  const checkItems = rows as ChatAnswerCheckItem[];
  const hasSignal = checkItems.some((item) => item.tone !== 'neutral');
  return hasSignal ? { kind: 'checkList', items: checkItems } : null;
}

function splitLabelDetail(item: string): ChatAnswerCheckItem | null {
  const idx = item.indexOf(':');
  if (idx <= 0) return null;
  const label = cleanInlineText(item.slice(0, idx));
  const detail = cleanInlineText(item.slice(idx + 1));
  if (!label || !detail) return null;
  return { label, detail, tone: detectTone(detail) };
}

function detectTone(text: string): ChatAnswerCheckItem['tone'] {
  const lower = text.toLowerCase();
  if (/\b(no entries|no values|no data|not found|not captured|missing|none)\b/.test(lower)) {
    return 'missing';
  }
  if (/\b(below|above|out of range|flagged|high|low)\b/.test(lower)) {
    return 'caution';
  }
  if (/\b(found|available|recorded|captured|present|in range)\b/.test(lower)) {
    return 'found';
  }
  return 'neutral';
}

function cleanHeadingText(line: string): string {
  return cleanInlineText(line.replace(/^#{1,6}\s+/, '').replace(/:\s*$/, ''));
}

function cleanInlineText(text: string): string {
  return stripLeadingDecoration(text)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingDecoration(text: string): string {
  let next = text;
  while (next.length > 0) {
    const point = next.codePointAt(0);
    if (point === undefined || !isDecorativeEmojiCodePoint(point)) return next;
    next = next.slice(point > 0xffff ? 2 : 1).trimStart();
  }
  return next;
}

function isDecorativeEmojiCodePoint(point: number): boolean {
  return (
    (point >= 0x1f300 && point <= 0x1f5ff) ||
    (point >= 0x1f600 && point <= 0x1f64f) ||
    (point >= 0x1f680 && point <= 0x1f6ff) ||
    (point >= 0x1f900 && point <= 0x1f9ff)
  );
}

function isProcessPreamble(text: string): boolean {
  return /^i(?:'ve| have) done (?:a )?(?:thorough )?search\b/i.test(text);
}

function isHorizontalRule(line: string): boolean {
  return /^([-*_])(?:\s*\1){2,}$/.test(line);
}

function isPipeTableLine(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|') && line.includes('|');
}

function isHeadingLine(line: string): boolean {
  if (/^#{1,6}\s+\S/.test(line)) return true;
  if (isBulletLine(line) || isOrderedLine(line) || isPipeTableLine(line)) return false;
  if (!line.endsWith(':')) return false;
  const withoutColon = line.replace(/:\s*$/, '').trim();
  return withoutColon.length <= 80 && withoutColon.split(/\s+/).length <= 8;
}

function isBulletLine(line: string): boolean {
  return /^[-*]\s+\S/.test(line);
}

function isOrderedLine(line: string): boolean {
  return /^\d+[.)]\s+\S/.test(line);
}
