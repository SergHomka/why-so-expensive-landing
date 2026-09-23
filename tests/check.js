/* Проверки движка, переводов и консольной версии. Запуск: node tests/check.js
   С флагом --local дополнительно прогоняет все ваши логи из ~/.claude/projects (они никуда не копируются). */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const E = require('../engine.js');
const LANGS = { ru: require('../i18n/ru.js'), en: require('../i18n/en.js') };

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

// в готовом тексте не должно остаться следов незаполненных полей
const BROKEN = /undefined|NaN|null|\[object/;
function checkCards(res, label) {
  assert.strictEqual(res.length, 10, label + ': проверок не 10');
  res.forEach(r => {
    const f = r.finding;
    assert.ok(f, label + ': нет карточки у проверки ' + r.check.n);
    ['title', 'what', 'why'].forEach(k => {
      assert.ok(f[k], label + ': пустое поле ' + k + ' у проверки ' + r.check.n);
      assert.ok(!BROKEN.test(f[k]), label + ': «' + f[k] + '»');
    });
    assert.ok(f.todo.length >= 2, label + ': меньше двух советов у проверки ' + r.check.n);
    if (f.level !== 'ok') {
      assert.ok(f.headline && f.short, label + ': у проблемы нет фразы для «Коротко» (проверка ' + r.check.n + ')');
      assert.ok(!BROKEN.test(f.headline + f.short), label + ': ' + f.headline);
    }
    if (f.saving) assert.ok(f.savingNote && !BROKEN.test(f.savingNote), label + ': экономия без пояснения');
  });
}

const tiny = [1, 2].map(i => JSON.stringify({ type: 'assistant', message: { id: 'm' + i, model: 'claude-sonnet-5', usage: { input_tokens: 500, output_tokens: 300 } } })).join('\n');

/* ---------- Учебный пример ---------- */
Object.keys(LANGS).forEach(lang => {
  const T = LANGS[lang];
  const s = E.parse(E.makeSampleLog(T), 'sample');

  test(lang + ': сумма учебного примера и удаление дублей', () => {
    assert.strictEqual(s.total.toFixed(2), '9.62');
    assert.ok(s.rawCount > s.uniqueCount, 'в примере есть дубли, а разбор их не увидел');
    assert.strictEqual(s.uniqueCount, 49);
    const turns = s.turns.reduce((a, t) => a + t.dollars, 0);
    assert.ok(Math.abs(turns - s.total) < 1e-9, 'сумма по просьбам не равна сумме сессии');
  });

  test(lang + ': все десять карточек в учебном примере', () => {
    const res = E.diagnose(s, T);
    checkCards(res, 'пример/' + lang);
    const levels = res.map(r => r.check.n + r.finding.level[0]).join(' ');
    assert.strictEqual(levels, '1w 2w 3i 4w 5o 6i 7i 8w 9i 10w');
    const top = E.mainFinding(res.map(r => r.finding));
    assert.strictEqual(top.check.rule, 'growth');
  });

  test(lang + ': короткая сессия — все карточки «всё хорошо»', () => {
    const res = E.diagnose(E.parse(tiny, 'tiny'), T);
    checkCards(res, 'tiny/' + lang);
    assert.ok(res.every(r => r.finding.level === 'ok'));
  });

  test(lang + ': сводка по сессиям не считает один ответ дважды', () => {
    const a = E.aggregate([s, E.parse(E.makeSampleLog(T), 'copy')], T);
    assert.strictEqual(a.total.toFixed(2), '9.62');
    assert.strictEqual(a.duplicates, 49);
    assert.strictEqual(a.sessions, 2);
    assert.ok(a.habits.length > 0 && a.habits.every(h => h.short && h.warn + h.info === 2));
  });

  test(lang + ': текст «Скопировать итог» без просьб и имён файлов', () => {
    const res = E.diagnose(s, T), found = res.map(r => r.finding);
    const top = E.mainFinding(found);
    const text = T.ui.shareSession(s, top, found.filter(f => f !== top && f.level !== 'ok').map(f => f.check.name));
    assert.ok(!/schema\.sql|promo|shop-api/.test(text), text);
    assert.ok(!BROKEN.test(text), text);
  });
});

test('русский и английский дают одинаковые уровни и экономию', () => {
  const r = E.diagnose(E.parse(E.makeSampleLog(LANGS.ru), 'a'), LANGS.ru);
  const e = E.diagnose(E.parse(E.makeSampleLog(LANGS.en), 'b'), LANGS.en);
  r.forEach((x, i) => {
    assert.strictEqual(x.finding.level, e[i].finding.level);
    assert.strictEqual((x.finding.saving || 0).toFixed(4), (e[i].finding.saving || 0).toFixed(4));
  });
});

test('не лог Claude Code — ни одного шага', () => {
  assert.strictEqual(E.parse('hello\nworld', 'x').uniqueCount, 0);
  assert.strictEqual(E.parse('', 'x').uniqueCount, 0);
});

test('цены: кэш на час дороже кэша на 5 минут, чтение в 10 раз дешевле', () => {
  const m = 'claude-sonnet-5';
  const w5 = E.costOf({ cache_creation_input_tokens: 1e6, cache_creation: { ephemeral_5m_input_tokens: 1e6 } }, m).dollars;
  const w1 = E.costOf({ cache_creation_input_tokens: 1e6, cache_creation: { ephemeral_1h_input_tokens: 1e6 } }, m).dollars;
  const rd = E.costOf({ cache_read_input_tokens: 1e6 }, m).dollars;
  assert.strictEqual(w5, 2.5); assert.strictEqual(w1, 4); assert.strictEqual(rd.toFixed(2), '0.20');
  assert.strictEqual(E.priceFor('claude-opus-4-8-20260101').known, true);
  assert.strictEqual(E.priceFor('some-new-model').known, false);
});

/* ---------- Консольная версия ---------- */
test('консольная версия: JSON по файлу учебного примера', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wse-'));
  const file = path.join(dir, 'sample.jsonl');
  fs.writeFileSync(file, E.makeSampleLog(LANGS.en));
  try {
    const cli = path.join(__dirname, '..', 'cli.js');
    const json = JSON.parse(execFileSync(process.execPath, [cli, file, '--all', '--json', '--lang', 'en'], { encoding: 'utf8' }));
    assert.strictEqual(json.total.toFixed(2), '9.62');
    assert.strictEqual(json.sessions, 1);
    assert.strictEqual(json.list[0].findings[0].name, 'Conversation length');
    const text = execFileSync(process.execPath, [cli, dir, '--all', '--lang', 'ru'], { encoding: 'utf8', env: Object.assign({}, process.env, { NO_COLOR: '1' }) });
    assert.ok(/\$9,62/.test(text) && /Что повторяется/.test(text), text);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ---------- Ваши настоящие логи (по флагу --local) ---------- */
if (process.argv.indexOf('--local') >= 0) {
  const root = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
  const files = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.jsonl')) files.push(p);
    });
  })(root);
  files.forEach(f => {
    test('лог ' + path.basename(f).slice(0, 8), () => {
      const s = E.parse(fs.readFileSync(f, 'utf8'), f);
      if (!s.uniqueCount) return;
      const turns = s.turns.reduce((a, t) => a + t.dollars, 0);
      assert.ok(Math.abs(turns - s.total) < 1e-6, 'сумма по просьбам не равна сумме сессии');
      Object.keys(LANGS).forEach(lang => {
        const res = E.diagnose(s, LANGS[lang]);
        checkCards(res, lang);
        res.forEach(r => { if (r.finding.saving) assert.ok(r.finding.saving > 0 && r.finding.saving <= s.total, 'экономия больше всей сессии'); });
      });
      // в тексты просьб не должны просачиваться служебные вставки Claude Code
      assert.ok(!s.turns.some(t => /<[a-z0-9]*[_-][a-z0-9_-]*[ >]|Caveat:/.test(t.text)), 'служебная вставка в тексте просьбы');
    });
  });
}

console.log('\nПрошло проверок: ' + passed + (process.exitCode ? '. Есть ошибки.' : '.'));
