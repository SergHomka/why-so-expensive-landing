#!/usr/bin/env node
/* Why So Expensive — консольная версия. Читает все логи Claude Code за период и показывает,
   что повторяется из сессии в сессию. Тот же движок, что на странице демо: engine.js.
   Ничего не отправляет в сеть: только читает файлы и печатает результат. */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const E = require('./engine.js');

/* ---------- Настройки из командной строки ---------- */
const argv = process.argv.slice(2);
const opt = { days: 7, top: 3, lang: null, json: false, help: false, paths: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--days') opt.days = Math.max(0, parseInt(argv[++i], 10) || 0);
  else if (a === '--all') opt.days = 0;
  else if (a === '--top') opt.top = Math.max(0, parseInt(argv[++i], 10) || 0);
  else if (a === '--lang') opt.lang = argv[++i];
  else if (a === '--json') opt.json = true;
  else if (a === '--help' || a === '-h') opt.help = true;
  else opt.paths.push(a);
}

// язык: --lang, иначе по настройкам системы
function systemLang() {
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  if (env) return /^ru/i.test(env) ? 'ru' : 'en';
  try { return /^ru/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? 'ru' : 'en'; } catch (e) { return 'en'; }
}
const T = require(opt.lang === 'ru' || (opt.lang !== 'en' && systemLang() === 'ru') ? './i18n/ru.js' : './i18n/en.js');
const C = T.cli;

if (opt.help) { console.log(C.help); process.exit(0); }

/* ---------- Оформление: цвет, только если вывод идёт в терминал ---------- */
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = code => s => tty ? '\x1b[' + code + 'm' + s + '\x1b[0m' : s;
const bold = paint('1'), dim = paint('2'), orange = paint('38;5;208'), red = paint('31'), blue = paint('34'), cyan = paint('36');
// в текстах карточек команды отмечены <code>…</code> — в терминале подсвечиваем их цветом
const plain = s => String(s).replace(/<code>(.*?)<\/code>/g, (m, c) => cyan(c));

/* ---------- Какие файлы читать ---------- */
function defaultRoot() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects');
}
function collect(p, out) {
  let st;
  try { st = fs.statSync(p); } catch (e) { return false; }
  if (st.isFile()) { out.push({ file: p, mtime: st.mtimeMs }); return true; }
  if (st.isDirectory()) {
    fs.readdirSync(p, { withFileTypes: true }).forEach(d => {
      const q = path.join(p, d.name);
      if (d.isDirectory()) collect(q, out);
      else if (/\.jsonl$/i.test(d.name)) { try { out.push({ file: q, mtime: fs.statSync(q).mtimeMs }); } catch (e) { /* файл исчез — пропускаем */ } }
    });
    return true;
  }
  return false;
}

const roots = opt.paths.length ? opt.paths : [defaultRoot()];
const files = [];
for (const r of roots) {
  if (!collect(r, files)) { console.error(C.noFolder(r)); process.exit(1); }
}

const since = opt.days ? Date.now() - opt.days * 86400000 : 0;
const sessions = [];
files.filter(f => f.mtime >= since).forEach(f => {
  let s;
  try { s = E.parse(fs.readFileSync(f.file, 'utf8'), path.basename(f.file)); } catch (e) { return; }
  if (!s.uniqueCount) return;
  if (since && s.lastTs && s.lastTs < since) return;   // файл трогали недавно, но сама сессия старая
  s.file = f.file;
  sessions.push(s);
});
sessions.sort((a, b) => b.total - a.total);

if (!sessions.length) {
  if (opt.json) console.log(JSON.stringify({ sessions: 0, total: 0 }, null, 2));
  else console.log(C.noSessions(opt.days));
  process.exit(0);
}

const agg = E.aggregate(sessions, T);

/* ---------- JSON: для скриптов, скилла и MCP-сервера ---------- */
if (opt.json) {
  const strip = s => String(s || '').replace(/<\/?code>/g, '');
  console.log(JSON.stringify({
    days: opt.days || null,
    total: +agg.total.toFixed(4), sessions: agg.sessions, steps: agg.steps, duplicates: agg.duplicates,
    from: agg.firstTs ? new Date(agg.firstTs).toISOString() : null,
    to: agg.lastTs ? new Date(agg.lastTs).toISOString() : null,
    habits: agg.habits.map(h => ({ check: h.check.n, name: h.check.name, warn: h.warn, info: h.info, saving: +h.saving.toFixed(4), advice: strip(h.short) })),
    projects: agg.projects.map(p => ({ name: p.name, total: +p.total.toFixed(4) })),
    list: sessions.map(s => {
      const found = E.diagnose(s, T).map(r => r.finding).filter(f => f && f.level !== 'ok');
      return {
        file: s.file, project: s.project, total: +s.total.toFixed(4), steps: s.uniqueCount,
        model: s.mainModel, end: s.lastTs ? new Date(s.lastTs).toISOString() : null,
        findings: found.map(f => ({ check: f.check.n, name: f.check.name, level: f.level, saving: +(f.saving || 0).toFixed(4), headline: strip(f.headline), advice: strip(f.short) })),
      };
    }),
  }, null, 2));
  process.exit(0);
}

/* ---------- Отчёт в терминале ---------- */
const out = [];
const line = s => out.push(s === undefined ? '' : s);
const wrap = (s, indent) => {
  // переносим длинные строки по словам, чтобы текст не резался посреди слова
  const width = Math.max(40, Math.min(process.stdout.columns || 100, 100)) - indent.length;
  const words = s.split(' '), rows = [];
  let cur = '';
  words.forEach(w => {
    const len = (cur + ' ' + w).replace(/\x1b\[[0-9;]*m/g, '').length;
    if (cur && len > width) { rows.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  });
  if (cur) rows.push(cur);
  return rows.map(r => indent + r).join('\n');
};

line(bold(C.title));
line(dim(C.scope(roots.join(', '), opt.days)));
line();
line(bold(orange(C.total(agg))));
line(wrap(dim(T.ui.apiNote), ''));
if (agg.duplicates) line(wrap(dim(T.ui.duplicates(agg.duplicates)), ''));

line();
line(bold(T.ui.habitsTitle));
if (!agg.habits.length) line('  ' + T.ui.noHabits);
agg.habits.forEach(h => {
  const mark = h.warn ? red('!') : blue('●');
  line(' ' + mark + ' ' + bold(h.check.name) + ' — ' + T.ui.habitCount(h.warn + h.info, agg.sessions) +
    (h.saving >= 0.05 ? ' · ' + orange(T.ui.badge(h.saving)) : ''));
  if (h.short) line(wrap(plain(h.short), '   '));
});

if (agg.projects.length > 1) {
  line();
  line(bold(C.projectsTitle));
  agg.projects.slice(0, 10).forEach(p => line('  ' + T.money(p.total).padStart(9) + '  ' + p.name));
}

if (opt.top) {
  line();
  line(bold(C.topTitle));
  sessions.slice(0, opt.top).forEach(s => {
    const found = E.diagnose(s, T).map(r => r.finding).filter(Boolean);
    const top = E.mainFinding(found);
    line();
    line('  ' + bold(C.sessionLine(s)));
    if (top) {
      const h = top.headline.charAt(0).toUpperCase() + top.headline.slice(1);
      line(wrap(C.main + plain(h), '  '));
      line(wrap(plain(top.short) + (top.saving ? ' ' + orange(T.ui.badge(top.saving)) : ''), '  '));
    } else {
      line('  ' + T.ui.noLeaks);
    }
    line(dim('  ' + C.file + s.file));
  });
}

line();
line(dim(C.more));
console.log(out.join('\n'));
