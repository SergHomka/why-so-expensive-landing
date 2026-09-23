/* Why So Expensive — движок разбора логов Claude Code.
   Один файл на всех: страница демо (русская и английская) и консольная версия (cli.js).
   Здесь только расчёты — ни одного текста для человека. Тексты карточек лежат в i18n/ru.js и i18n/en.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WSE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- Справочник цен (доллары за 1 млн токенов) ---------- */
const PRICES = {
  'claude-opus-5':     { in: 5,  out: 25, name: 'Opus 5' },
  'claude-opus-4-8':   { in: 5,  out: 25, name: 'Opus 4.8' },
  'claude-opus-4-7':   { in: 5,  out: 25, name: 'Opus 4.7' },
  'claude-opus-4-6':   { in: 5,  out: 25, name: 'Opus 4.6' },
  'claude-sonnet-5':   { in: 2,  out: 10, name: 'Sonnet 5' },
  'claude-sonnet-4-6': { in: 3,  out: 15, name: 'Sonnet 4.6' },
  'claude-haiku-4-5':  { in: 1,  out: 5,  name: 'Haiku 4.5' },
  'claude-fable-5-1':  { in: 10, out: 50, name: 'Fable 5.1' },
  'claude-fable-5':    { in: 10, out: 50, name: 'Fable 5' },
};
const FALLBACK = { in: 3, out: 15, name: '' };   // имя «неизвестная модель» подставляет перевод
const CHEAP = PRICES['claude-haiku-4-5'];
const TOKENS_PER_PAGE = 700;   // грубо: страница обычного текста

function priceFor(model) {
  if (PRICES[model]) return { p: PRICES[model], known: true };
  const key = Object.keys(PRICES).find(k => model && model.indexOf(k) === 0);
  if (key) return { p: PRICES[key], known: true };
  return { p: FALLBACK, known: false };
}

/* Кэш: запись на 5 минут стоит 1.25× входа, на час — 2×, чтение — 0.1×. */
function costOf(usage, model) {
  const r = priceFor(model), p = r.p;
  const cc = usage.cache_creation || {};
  const w1h = cc.ephemeral_1h_input_tokens || 0;
  const w5m = cc.ephemeral_5m_input_tokens || 0;
  const wPlain = (w1h || w5m) ? 0 : (usage.cache_creation_input_tokens || 0);
  const outCost = (usage.output_tokens || 0) * p.out / 1e6;
  const dollars =
      (usage.input_tokens || 0) * p.in / 1e6
    + outCost
    + w1h    * p.in * 2    / 1e6
    + w5m    * p.in * 1.25 / 1e6
    + wPlain * p.in * 1.25 / 1e6
    + (usage.cache_read_input_tokens || 0) * p.in * 0.1 / 1e6;
  return { dollars: dollars, outCost: outCost, known: r.known, ttl1h: w1h > 0 };
}

/* Текст реплики пользователя без служебных вставок Claude Code. */
function promptText(message) {
  if (!message) return '';
  let t = '';
  if (typeof message.content === 'string') t = message.content;
  else if (Array.isArray(message.content)) {
    message.content.forEach(c => { if (c && c.type === 'text' && c.text) t += c.text + '\n'; });
  }
  // служебные вставки Claude Code: <system-reminder>, <ide_selection>, <command-name> и т. п. —
  // у них в имени всегда дефис или подчёркивание, у обычного HTML из текста пользователя — нет
  t = t.replace(/<([a-z][a-z0-9]*[_-][a-z0-9_-]*)(\s[^>]*)?>[\s\S]*?<\/\1>/g, ' ')
       .replace(/Caveat: The messages below[^\n]*/g, ' ')
       .replace(/\[Request interrupted[^\]]*\]/g, ' ')
       .replace(/\s+/g, ' ').trim();
  return t;
}

function countImages(message) {
  let n = 0;
  if (!message || !Array.isArray(message.content)) return 0;
  message.content.forEach(c => {
    if (!c) return;
    if (c.type === 'image') n++;
    if (c.type === 'tool_result' && Array.isArray(c.content)) c.content.forEach(k => { if (k && k.type === 'image') n++; });
  });
  return n;
}

const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const FILE_TOOLS = ['Read'].concat(EDIT_TOOLS);
const BG_TOOLS = ['Monitor', 'ScheduleWakeup', 'CronCreate'];

function resultText(b) {
  if (typeof b.content === 'string') return b.content;
  if (Array.isArray(b.content)) return b.content.map(k => (k && k.text) || '').join(' ');
  return '';
}

/* Сообщение пришло не от человека, а от фоновой задачи: она закончилась или что-то вывела. */
function isAuto(o) {
  if (o.origin && o.origin.kind && o.origin.kind !== 'human') return true;
  const c = o.message.content;
  return typeof c === 'string' && /^\s*<task-notification>/.test(c);
}

/* ---------- Разбор лога ----------
   Один ответ модели лежит в логе несколькими записями с одним message.id:
   в каждой записи тот же расход, но свой кусок ответа (размышления, текст, вызов инструмента).
   Поэтому деньги считаем по уникальному message.id, а вызовы инструментов собираем из всех записей. */
function parse(text, name) {
  const byId = {}, toolById = {}, requests = [], files = {}, turns = [], errors = [];
  let rawCount = 0, badLines = 0, project = null, firstTs = null, lastTs = null,
      unknownModel = null, naive = 0, images = 0, effort = null, ttl1h = false;
  let turn = null, pendingError = false, auto = false, autoCount = 0, streak = 0, maxStreak = 0, humanTs = null;
  const bg = [];

  const rows = text.split('\n');
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i].trim();
    if (!s) continue;
    let o;
    try { o = JSON.parse(s); } catch (e) { badLines++; continue; }
    if (!o || typeof o !== 'object') continue;

    if (o.type === 'user' && o.message) {
      images += countImages(o.message);
      const parts = Array.isArray(o.message.content) ? o.message.content : [];
      let results = 0;
      parts.forEach(b => {
        if (!b || b.type !== 'tool_result') return;
        results++;
        const tool = toolById[b.tool_use_id];
        if (!b.is_error) { streak = 0; return; }
        if (tool && tool.edit) tool.turn.edits--;           // правка не прошла — файл не изменился
        // отказ пользователя или запрет правилами — не ошибка модели
        if (o.toolDenialKind || /doesn't want to proceed|Request interrupted/.test(resultText(b))) return;
        errors.push({ tool: tool ? tool.name : '' });
        if (++streak > maxStreak) maxStreak = streak;
        if (!o.isSidechain) pendingError = true;
      });
      if (results || o.isSidechain) continue;
      if (isAuto(o)) { auto = true; autoCount++; continue; }
      if (!o.isMeta) {
        const t = promptText(o.message);
        if (t) {
          turn = { text: t, dollars: 0, steps: 0, startCtx: null, edits: 0 };
          turns.push(turn);
          auto = false; pendingError = false;
          humanTs = o.timestamp ? Date.parse(o.timestamp) : humanTs;
        }
      }
      continue;
    }
    if (o.type !== 'assistant' || !o.message || !o.message.usage) continue;
    rawCount++;

    const model = o.message.model || '';
    const c = costOf(o.message.usage, model);
    naive += c.dollars;                    // так посчитал бы тот, кто не убирает дубли

    const id = o.message.id;
    let r = id ? byId[id] : null;
    if (!r) {
      if (!c.known && model) unknownModel = model;
      if (c.ttl1h) ttl1h = true;
      if (o.effort) effort = o.effort;

      const ts = o.timestamp ? Date.parse(o.timestamp) : null;
      if (ts) { if (!firstTs || ts < firstTs) firstTs = ts; if (!lastTs || ts > lastTs) lastTs = ts; }
      if (!project && o.cwd) {
        const dirs = String(o.cwd).split(/[\\/]/).filter(Boolean);
        project = dirs[dirs.length - 1] || null;
      }

      if (!turn) { turn = { text: '', dollars: 0, steps: 0, startCtx: null, edits: 0 }; turns.push(turn); }
      const u = o.message.usage;
      const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      const side = !!o.isSidechain;
      if (!side && turn.startCtx === null) turn.startCtx = ctx;
      turn.dollars += c.dollars;
      turn.steps++;

      r = {
        id: id || null,
        dollars: c.dollars, outCost: c.outCost, model: model, ts: ts, side: side, turn: turn, ctx: ctx,
        afterError: pendingError && !side,     // шаг, где модель разбирается с только что случившейся ошибкой
        auto: auto && !side,                   // шаг, который запустила фоновая задача, а не человек
        idle: ts && humanTs ? (ts - humanTs) / 60000 : 0,   // минут с последнего сообщения человека
        input: u.input_tokens || 0,
        output: u.output_tokens || 0,
        thinking: (u.output_tokens_details && u.output_tokens_details.thinking_tokens) || 0,
        cacheRead: u.cache_read_input_tokens || 0,
        cacheWrite: u.cache_creation_input_tokens || 0,
      };
      if (!side) pendingError = false;
      requests.push(r);
      if (id) byId[id] = r;
    }

    const content = o.message.content || [];
    for (let k = 0; k < content.length; k++) {
      const b = content[k];
      if (!b || b.type !== 'tool_use' || !b.input) continue;
      if (b.id) { if (toolById[b.id]) continue; }
      const edit = EDIT_TOOLS.indexOf(b.name) >= 0;
      if (b.id) toolById[b.id] = { name: b.name, turn: r.turn, edit: edit };
      if (edit) r.turn.edits++;
      if (b.input.run_in_background || BG_TOOLS.indexOf(b.name) >= 0) bg.push(b.input.command || b.input.description || b.name);
      const fp = b.input.file_path || b.input.notebook_path;
      if (fp && FILE_TOOLS.indexOf(b.name) >= 0) {
        const short = String(fp).split(/[\\/]/).pop();
        files[short] = (files[short] || 0) + 1;
      }
    }
  }

  let total = 0;
  requests.forEach(r => total += r.dollars);

  return {
    name: name, requests: requests, files: files, project: project,
    turns: turns.filter(t => t.steps > 0),
    errors: errors, maxStreak: maxStreak, autoCount: autoCount, bg: bg,
    badLines: badLines, unknownModel: unknownModel, images: images, effort: effort, ttl1h: ttl1h,
    rawCount: rawCount, uniqueCount: requests.length,
    total: total, naive: naive,
    mainModel: mainModel(requests),
    firstTs: firstTs, lastTs: lastTs,
    minutes: firstTs && lastTs ? (lastTs - firstTs) / 60000 : 0,
  };
}

function mainModel(requests) {
  const by = {};
  requests.forEach(r => by[r.model] = (by[r.model] || 0) + r.dollars);
  let best = '', v = -1;
  for (const k in by) if (by[k] > v) { v = by[k]; best = k; }
  return best;
}

/* Имя инструмента из лога — вид действия. Понятные слова для каждого вида — в переводе. */
function toolKind(name) {
  if (name === 'Bash' || name === 'PowerShell') return 'terminal';
  if (name === 'Read') return 'read';
  if (EDIT_TOOLS.indexOf(name) >= 0) return 'edit';
  if (name === 'Grep' || name === 'Glob') return 'search';
  if (name === 'WebFetch' || name === 'WebSearch') return 'web';
  if (/^mcp__playwright/.test(name)) return 'browser';
  if (/^mcp__/.test(name)) return 'mcp';
  return name || 'other';
}

function clip(t, n) { return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t; }

function topEntry(obj) {
  let top = null;
  for (const k in obj) if (!top || obj[k] > top[1]) top = [k, obj[k]];
  return top;
}

/* ---------- Правила диагностики ----------
   Каждое правило смотрит на разобранную сессию и возвращает факты: уровень (warn / info / ok),
   цифры для текста и экономию в долларах, если её можно честно оценить. Или null — проблемы нет.
   Слова к фактам подбирает перевод: i18n/*.js, поле rules. */
const RULES = {
  growth(s) {
    const main = s.requests.filter(r => !r.side && r.ctx > 0);
    if (main.length < 10) return null;
    const first = main[0].ctx;
    let max = 0; main.forEach(r => { if (r.ctx > max) max = r.ctx; });
    const ratio = max / first;
    if (ratio < 3) return null;

    const n = Math.min(5, Math.floor(main.length / 3));
    const avg = arr => arr.reduce((a, r) => a + r.dollars, 0) / arr.length;

    // Оценка: что было бы, если бы каждая новая просьба начиналась с чистой переписки.
    let saving = 0;
    main.forEach(r => {
      const start = r.turn.startCtx === null ? first : r.turn.startCtx;
      const cf = Math.min(r.ctx, first + Math.max(0, r.ctx - start));
      saving += (r.dollars - r.outCost) * (1 - cf / r.ctx);
    });
    return {
      level: ratio >= 5 ? 'warn' : 'info',
      first: first, max: max, ratio: ratio,
      early: avg(main.slice(0, n)), late: avg(main.slice(-n)),
      saving: saving >= 0.05 ? saving : 0,
    };
  },

  bigAsk(s) {
    if (s.turns.length < 2) return null;
    const top = s.turns.slice().sort((a, b) => b.dollars - a.dollars)[0];
    const share = top.dollars / s.total;
    if (share < 0.4) return null;
    return { level: share >= 0.6 ? 'warn' : 'info', top: top, share: share };
  },

  thinking(s) {
    let out = 0, th = 0;
    s.requests.forEach(r => { out += r.output; th += r.thinking; });
    if (!out || th / out < 0.25) return null;
    const share = th / out;
    const p = priceFor(s.mainModel).p;
    return { level: share > 0.5 ? 'warn' : 'info', share: share, cost: th * p.out / 1e6, effort: s.effort };
  },

  loop(s) {
    const top = topEntry(s.files);
    if (!top || top[1] < 3) return null;
    return { level: top[1] >= 5 ? 'warn' : 'info', file: top[0], count: top[1] };
  },

  screenshots(s) {
    if (s.images < 5) return null;
    return { level: s.images >= 12 ? 'warn' : 'info', images: s.images };
  },

  shortAnswers(s) {
    const heavy = s.requests.filter(r => r.output < 200 && (r.cacheRead + r.input) > 20000);
    if (heavy.length < 3) return null;
    let dollars = 0, inCost = 0;
    heavy.forEach(r => { dollars += r.dollars; inCost += r.dollars - r.outCost; });
    if (dollars < 0.02) return null;
    const p = priceFor(s.mainModel).p;
    const cheaper = p.in > CHEAP.in;
    const saving = cheaper ? inCost * (1 - CHEAP.in / p.in) : 0;
    return {
      level: 'info', count: heavy.length, dollars: dollars, cheaper: cheaper,
      model: p, cheap: CHEAP,
      saving: saving >= 0.05 ? saving : 0,
    };
  },

  errors(s) {
    const n = s.errors.length;
    if (n < 3) return null;
    let cost = 0;
    s.requests.forEach(r => { if (r.afterError) cost += r.dollars; });
    if (cost < 0.05) return null;
    const share = cost / s.total;
    const by = {};
    s.errors.forEach(e => { const k = toolKind(e.tool); by[k] = (by[k] || 0) + 1; });
    const top = topEntry(by);
    return {
      level: share >= 0.15 || s.maxStreak >= 4 ? 'warn' : 'info',
      n: n, cost: cost, share: share, kind: top[0], kindCount: top[1], maxStreak: s.maxStreak,
    };
  },

  noResult(s) {
    const idle = s.turns.filter(t => t.text && t.edits <= 0 && t.steps >= 8 && t.dollars >= 0.1);
    if (!idle.length) return null;
    let cost = 0;
    idle.forEach(t => cost += t.dollars);
    if (cost / s.total < 0.2 && cost < 0.5) return null;
    const top = idle.slice().sort((a, b) => b.dollars - a.dollars)[0];
    return { level: 'info', count: idle.length, cost: cost, top: top };
  },

  background(s) {
    const auto = s.requests.filter(r => r.auto);
    if (auto.length < 3) return null;
    let cost = 0;
    auto.forEach(r => cost += r.dollars);
    if (cost < 0.05) return null;
    // «забытые» — шаги, случившиеся, когда человек молчал больше 10 минут: скорее всего, он уже ушёл
    const tail = auto.filter(r => r.idle >= 10);
    let tailCost = 0;
    tail.forEach(r => tailCost += r.dollars);
    return {
      level: tailCost >= 0.1 ? 'warn' : 'info',
      steps: auto.length, wakeups: s.autoCount, cost: cost,
      tailSteps: tail.length, tailCost: tailCost,
      commands: s.bg.map(t => String(t).replace(/\s+/g, ' ')),
      saving: tailCost >= 0.05 ? tailCost : 0,
    };
  },

  cache(s) {
    let read = 0, fresh = 0;
    s.requests.forEach(r => { read += r.cacheRead; fresh += r.input + r.cacheWrite; });
    if (read + fresh === 0 || s.requests.length < 5) return null;
    const share = read / (read + fresh);
    const p = priceFor(s.mainModel).p;
    if (share >= 0.7) return { level: 'ok', calm: true, share: share, saved: read * p.in * 0.9 / 1e6 };
    return { level: 'warn', share: share, ttl1h: s.ttl1h };
  },
};

/* Факты для карточек «всё хорошо»: что увидели в сессии, когда правило ничего не нашло. */
const CALM = {
  growth(s) {
    const main = s.requests.filter(r => !r.side && r.ctx > 0);
    if (main.length < 2) return { tooShort: true };
    let max = 0; main.forEach(r => { if (r.ctx > max) max = r.ctx; });
    return { first: main[0].ctx, max: max, steps: main.length };
  },
  loop(s) {
    const top = topEntry(s.files);
    return top ? { file: top[0], count: top[1] } : {};
  },
  screenshots(s) { return { images: s.images }; },
  cache(s) { return { steps: s.requests.length }; },
  bigAsk(s) {
    if (s.turns.length < 2) return { single: true };
    let top = 0; s.turns.forEach(t => { if (t.dollars > top) top = t.dollars; });
    return { share: top / s.total };
  },
  errors(s) { return { n: s.errors.length }; },
  noResult() { return {}; },
  thinking(s) {
    let out = 0, th = 0;
    s.requests.forEach(r => { out += r.output; th += r.thinking; });
    return { out: out, thinking: th };
  },
  shortAnswers() { return {}; },
  background(s) { return { wakeups: s.autoCount, started: s.bg.length }; },
};

/* ---------- Что проверяем ----------
   Десять проверок в трёх группах. Названия и описания — в переводе.
   prio — порядок важности: самая важная находка попадает в «Коротко» и открыта сразу. */
const GROUPS = ['reread', 'task', 'model'];
const CHECKS = [
  { n: 1,  group: 'reread', rule: 'growth',       prio: 1 },
  { n: 2,  group: 'reread', rule: 'loop',         prio: 5 },
  { n: 3,  group: 'reread', rule: 'screenshots',  prio: 7 },
  { n: 4,  group: 'reread', rule: 'cache',        prio: 10 },
  { n: 5,  group: 'task',   rule: 'bigAsk',       prio: 2 },
  { n: 6,  group: 'task',   rule: 'errors',       prio: 3 },
  { n: 7,  group: 'task',   rule: 'noResult',     prio: 9 },
  { n: 8,  group: 'model',  rule: 'thinking',     prio: 4 },
  { n: 9,  group: 'model',  rule: 'shortAnswers', prio: 8 },
  { n: 10, group: 'model',  rule: 'background',   prio: 6 },
];

/* Результат по каждой из десяти проверок: { check, finding }. T — перевод (i18n/*.js).
   Если правило ничего не нашло — карточка «всё хорошо» с советами на будущее. */
function diagnose(s, T) {
  return CHECKS.map(c => {
    const check = Object.assign({}, c, T.checks[c.rule]);
    let f = null;
    try {
      const d = RULES[c.rule](s);
      if (d) f = Object.assign({ level: d.level, calm: !!d.calm, saving: d.saving || 0, facts: d }, T.rules[c.rule](d, s));
    } catch (e) { f = null; }
    if (!f) {
      try {
        const d = CALM[c.rule](s);
        f = Object.assign({ level: 'ok', calm: true, headline: '', saving: 0, facts: d }, T.calm[c.rule](d, s));
      } catch (e) { f = null; }
    }
    if (f) f.check = check;
    return { check: check, finding: f };
  });
}

/* Главная находка — самая важная из проблем, у которой есть фраза для «Коротко». */
function mainFinding(found) {
  return found.filter(f => f.level !== 'ok' && f.headline).sort((a, b) => a.check.prio - b.check.prio)[0] || null;
}

/* ---------- Сводка по нескольким сессиям ----------
   Что повторяется из сессии в сессию: в скольких сессиях сработала каждая проверка и сколько
   на этом можно было сэкономить. Общую сумму считаем без повторов: если один и тот же ответ модели
   лежит в двух файлах (например, после продолжения сессии), он оплачен один раз. */
function aggregate(sessions, T) {
  const seen = {};
  let total = 0, steps = 0, dup = 0, firstTs = null, lastTs = null;
  const projects = {};
  const byCheck = CHECKS.map(c => ({ check: Object.assign({}, c, T.checks[c.rule]), warn: 0, info: 0, saving: 0, short: '', bestSaving: 0 }));
  sessions.forEach(s => {
    let own = 0;
    s.requests.forEach(r => {
      if (r.id && seen[r.id]) { dup++; return; }
      if (r.id) seen[r.id] = 1;
      own += r.dollars; steps++;
    });
    total += own;
    const pk = s.project || '—';
    projects[pk] = (projects[pk] || 0) + own;
    if (s.firstTs && (!firstTs || s.firstTs < firstTs)) firstTs = s.firstTs;
    if (s.lastTs && (!lastTs || s.lastTs > lastTs)) lastTs = s.lastTs;
    diagnose(s, T).forEach((r, i) => {
      const f = r.finding;
      if (!f || f.level === 'ok') return;
      const h = byCheck[i];
      h[f.level]++;
      h.saving += f.saving || 0;
      // совет берём из самого дорогого случая: там он точнее всего
      if (!h.short || (f.saving || 0) > h.bestSaving) { h.short = f.short; h.bestSaving = f.saving || 0; }
    });
  });
  const habits = byCheck.filter(h => h.warn + h.info > 0)
    .sort((a, b) => (b.saving - a.saving) || ((b.warn * 2 + b.info) - (a.warn * 2 + a.info)) || (a.check.prio - b.check.prio));
  const projectList = Object.keys(projects).map(k => ({ name: k, total: projects[k] })).sort((a, b) => b.total - a.total);
  return {
    sessions: sessions.length, total: total, steps: steps, duplicates: dup,
    firstTs: firstTs, lastTs: lastTs, habits: habits, projects: projectList,
  };
}

/* ---------- Учебный пример: сессия, где всё пошло не так ----------
   Тексты просьб — из перевода (T.sample), всё остальное одинаково на любом языке. */
function makeSampleLog(T) {
  let seed = 20260824;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const lines = [];
  const t0 = Date.parse('2026-08-24T21:14:00Z');
  const asks = T.sample.asks;
  const failing = [11, 12, 13, 16, 17];   // тесты падают снова и снова
  let ctx = 24000;

  for (let i = 0; i < 49; i++) {
    const at = new Date(t0 + i * 97000).toISOString();
    if (asks[i]) lines.push(JSON.stringify({ type: 'user', timestamp: at, cwd: '/srv/shop-api', message: { role: 'user', content: asks[i] } }));
    // запущенный в фоне сервер будит модель, когда человек уже ушёл
    if (i >= 46) lines.push(JSON.stringify({ type: 'user', timestamp: at, origin: { kind: 'task-notification' },
      message: { role: 'user', content: '<task-notification><task-id>dev</task-id><summary>' + T.sample.notification + '</summary></task-notification>' } }));
    if (i >= 20 && i < 30 && i % 2 === 0) {
      lines.push(JSON.stringify({ type: 'user', timestamp: at, message: { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't' + i, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: '' } }] }] } }));
    }

    ctx += 1800 + Math.floor(rnd() * 2600);
    const cacheRead = i % 9 === 0 ? 0 : Math.floor(ctx * 0.18);
    const input = ctx - cacheRead;
    const think = Math.floor(600 + rnd() * 2400);
    const output = i > 38 ? 60 + Math.floor(rnd() * 90) : think + Math.floor(120 + rnd() * 900);

    const tools = [], tid = 'toolu_sample_' + i;
    let result = null;
    if (i === 41) tools.push({ type: 'tool_use', id: tid, name: 'Bash', input: { command: 'npm run dev', run_in_background: true } });
    else if (failing.indexOf(i) >= 0) {
      tools.push({ type: 'tool_use', id: tid, name: 'Bash', input: { command: 'npm test' } });
      result = { type: 'tool_result', tool_use_id: tid, is_error: true, content: 'Exit code 1\n3 failing' };
    } else if (i % 3 === 0) {
      tools.push({ type: 'tool_use', id: tid, name: 'Read', input: { file_path: '/srv/shop-api/db/schema.sql' } });
      result = { type: 'tool_result', tool_use_id: tid, content: '…' };
    } else if (i % 5 === 0 && !(i >= 30 && i < 38)) {
      tools.push({ type: 'tool_use', id: tid, name: 'Edit', input: { file_path: '/srv/shop-api/src/orders.ts' } });
    }

    lines.push(JSON.stringify({
      type: 'assistant', timestamp: at, cwd: '/srv/shop-api', effort: 'high',
      message: {
        id: 'msg_sample_' + i, model: 'claude-sonnet-5', role: 'assistant',
        content: [{ type: 'thinking', thinking: '' }].concat(tools, [{ type: 'text', text: '' }]),
        usage: {
          input_tokens: input, output_tokens: output,
          output_tokens_details: { thinking_tokens: i > 38 ? 0 : think },
          cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0,
        },
      },
    }));
    if (i % 2 === 0) lines.push(lines[lines.length - 1]);
    if (result) lines.push(JSON.stringify({ type: 'user', timestamp: at, message: { role: 'user', content: [result] } }));
  }
  return lines.join('\n');
}

return {
  PRICES: PRICES, CHEAP: CHEAP, TOKENS_PER_PAGE: TOKENS_PER_PAGE,
  priceFor: priceFor, costOf: costOf, parse: parse, toolKind: toolKind, clip: clip,
  GROUPS: GROUPS, CHECKS: CHECKS, RULES: RULES, CALM: CALM,
  diagnose: diagnose, mainFinding: mainFinding, aggregate: aggregate, makeSampleLog: makeSampleLog,
};
});
