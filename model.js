export const fields = {
  id: '行ID', tool: 'ツール', category: '業務区分', feature: 'AI機能', vendor: '提供元',
  initial: '初期設定', current: '現在の設定', enableBy: '有効化できる人',
  scope: 'AIに渡る範囲', scopeGap: '範囲の未確認事項', processor: '処理事業者',
  noticeType: '通知先の種別', noticeTo: '通知先（主担当）', backup: '予備担当',
  stopMethod: '止め方', stopBy: '止める担当',
};
export const choices = {
  initial: ['有効', '無効'],
  current: ['有効', '無効', '利用者が有効'],
  noticeType: ['共有窓口', '担当者個人', '未設定'],
};
export const decisions = ['止める', '確かめる', '条件付きで使う', '使わないまま'];
export const evidenceTypes = ['管理画面', '契約', '提供元の案内'];
export const statement = '記録上の管理状況で、実サービスの設定や処理データの扱いを確かめた結果ではありません。';
export const codeActor = 'コード（入力・候補の変更）';
export const rowName = row => row.feature ? row.tool + '／' + row.feature : row.tool;
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lineBreak = /[\r\n\v\f\u0085\u2028\u2029]/u;

function looksSensitive(text) {
  const value = text.normalize('NFKC').replace(/@example\.invalid(?![.\p{L}\p{N}-])/giu, '');
  return /(?:authorization|api[ _-]*(?:key|キー)|パスワード|password)["'”’」』]?\s*(?:[:=]\s*\S|\s+(?:bearer|basic)\s+\S)/iu.test(value)
    || /(?:https?|ssh|ftp):\/\//i.test(value)
    || /[a-z0-9_-]{24,}/i.test(value)
    || /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?!\d)/u.test(value)
    || /(?<![\p{L}\p{N}])(?:[a-f\d]{0,4}:){2,}[a-f\d]{0,4}(?![\p{L}\p{N}:])/iu.test(value)
    || /(?:[\p{L}\p{N}][\p{L}\p{N}\p{M}-]*[.])+[\p{L}][\p{L}\p{N}\p{M}-]*/u.test(value);
}

export function clean(value, label, { multiline = false, limit = 240 } = {}) {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error(label + 'は文字列か空欄にしてください。');
  if (!multiline && lineBreak.test(value)) throw new Error(label + 'に改行が含まれています。');
  if (looksSensitive(value)) throw new Error(label + 'に認証情報や接続先に似た形式があります。架空の内容に置き換えてください。');
  const trimmed = value.trim();
  if (trimmed.length > limit) throw new Error(label + 'は' + limit + '文字以内で入力してください。');
  return trimmed || null;
}

function validateObject(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(key => !keys.includes(key))) {
    throw new Error('形式が違うか、指定外の項目があります。');
  }
}

export function normalizeRow(source) {
  validateObject(source, Object.keys(fields));
  const row = Object.fromEntries(Object.entries(fields).map(([key, label]) => {
    const value = clean(source[key], label);
    if (value && choices[key] && !choices[key].includes(value)) throw new Error(label + 'の値が選択肢にありません。');
    return [key, value];
  }));
  if (!/^[A-Z0-9-]{1,16}$/.test(row.id ?? '')) throw new Error('行IDは半角の英大文字・数字・ハイフンで入力してください。');
  if (!row.tool || !row.category || !row.vendor) throw new Error('ツール・業務区分・提供元を入力してください。');
  if (!row.feature && Object.keys(fields).slice(5).some(key => row[key])) throw new Error('AI機能がない行は設定や処理先を空欄にしてください。');
  if (row.noticeType === '未設定' && (row.noticeTo || row.backup)) throw new Error('通知未設定の行は主担当と予備担当を空欄にしてください。');
  return row;
}

function csvRecords(text) {
  const records = [];
  let record = [];
  let value = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        value += char;
      }
    } else if (char === ',' || char === '\n' || char === '\r') {
      record.push(value);
      value = '';
      closed = false;
      if (char !== ',') {
        records.push(record);
        record = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (char === '"' && !value && !closed) {
      quoted = true;
    } else if (char === '"' || closed) {
      throw new Error('CSVの引用符の位置を確認してください。');
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error('CSVの引用符が閉じていません。');
  if (record.length || value || closed) records.push([...record, value]);
  return records;
}

export function parseRows(raw) {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text || text.length > 500_000) throw new Error('100行以内の一覧を貼り付けてください。');
  let input;
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      input = JSON.parse(text);
    } catch {
      throw new Error('一覧のJSON形式を確認してください。');
    }
  } else {
    const [header, ...records] = csvRecords(text);
    if (new Set(header).size !== header.length || header.some(key => !Object.hasOwn(fields, key))) throw new Error('CSVの見出しを確認してください。');
    input = records.map((record, index) => {
      if (record.length !== header.length) throw new Error('CSVのデータ行 ' + (index + 1) + ' の列数を確認してください。');
      return Object.fromEntries(header.map((key, column) => [key, record[column]]));
    });
  }
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) throw new Error('一覧は1〜100行で指定してください。');
  const ids = new Set();
  return input.map((item, i) => {
    try {
      const row = normalizeRow(item);
      if (ids.has(row.id)) throw new Error('行IDが重複しています。');
      ids.add(row.id);
      return row;
    } catch (error) {
      throw new Error('データ行 ' + (i + 1) + '。' + error.message);
    }
  });
}

const reasons = {
  initial: '初期状態で誰の操作もなく動くかを確かめる。',
  current: 'いま処理が動く設定かを確かめる。',
  enableBy: '誰が設定を切り替えられるかを確かめる。',
  scope: '入力欄以外から何が渡るかを確かめる。',
  processor: '誰が処理し、変更の知らせをどこで受け取るかを確かめる。',
  noticeType: '事案の知らせが共有窓口にも届くかを確かめる。',
  noticeTo: '最初に知らせを受け取る担当を決める。',
  backup: '主担当が不在でも知らせを受け取れるようにする。',
  stopMethod: '必要なときに組織全体で止められるかを確かめる。',
  stopBy: '停止を実行できる担当を確かめる。',
};

export function gaps(row) {
  if (!row.feature) return [];
  const result = Object.entries(reasons).filter(([key]) => !row[key]).map(([key, reason]) => ({
    field: fields[key],
    status: key === 'processor' ? '記録なし' : ['noticeTo', 'backup'].includes(key) && row.noticeType === '未設定' ? '未設定' : '未確認',
    reason,
  }));
  if (noticeGap(row) && row.noticeType !== '未設定') {
    result.push({
      field: '通知の引き継ぎ', status: '要確認',
      reason: '主担当と別の予備担当が共有窓口で知らせを受け取れるかを確かめる。',
    });
  }
  if (row.scopeGap) result.push({ field: fields.scope, status: '一部未確認', reason: row.scopeGap + 'を提供元の案内で確かめる。' });
  return result;
}

export function handoffReady(row) {
  return row.noticeType === '共有窓口' && !!row.noticeTo && !!row.backup && row.noticeTo !== row.backup;
}

export function noticeGap(row) {
  return row.noticeType !== null && !handoffReady(row);
}

export function localDay() {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(part => String(part).padStart(2, '0')).join('-');
}

export function validDate(value) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function decisionIssues(decision) {
  if (!decision) return ['扱いが未記録'];
  const issues = [];
  for (const [key, label] of Object.entries({
    action: '扱い', reason: '理由', owner: '担当', due: '期限', evidence: '根拠の種類',
    evidenceDetail: '根拠の内容', actor: '記録者', reviewed: '一覧・根拠の確認チェック',
  })) {
    if (!decision[key]) issues.push(label + 'が未入力');
  }
  if (decision.due && !validDate(decision.due)) issues.push('期限の日付が不正');
  if (decision.action === '確かめる' && !decision.contact) issues.push('確かめる先が未入力');
  if (decision.action === '条件付きで使う' && !decision.condition) issues.push('使う範囲の条件が未入力');
  return issues;
}

export function parseCandidate(raw, currentVersion, stamps) {
  if (raw.length > 500_000) throw new Error('候補JSONが長すぎます。');
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error('候補のJSON形式を確認してください。');
  }
  validateObject(input, ['version', 'candidates']);
  if (input.version !== currentVersion) throw new Error('現在の版と候補の版が一致しません。');
  if (!Array.isArray(input.candidates) || !input.candidates.length || input.candidates.length > 100) {
    throw new Error('候補は1〜100行で指定してください。');
  }
  const candidates = new Map();
  for (const item of input.candidates) {
    validateObject(item, ['id', 'inputKey', 'question', 'handoff']);
    if (!stamps.has(item.id) || item.inputKey !== stamps.get(item.id)) throw new Error('行IDまたは照合キーが現在の入力と一致しません。');
    if (candidates.has(item.id)) throw new Error('候補の行IDが重複しています。');
    const question = clean(item.question, '提供元への質問', { multiline: true, limit: 1000 });
    const handoff = clean(item.handoff, '社内への引き継ぎ文', { multiline: true, limit: 1000 });
    if (!question || !handoff) throw new Error('質問と引き継ぎ文の両方を入力してください。');
    candidates.set(item.id, { question, handoff });
  }
  return candidates;
}
