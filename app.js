/* Страница демо: отрисовка отчёта и события. Расчёты — engine.js (WSE), слова — i18n/*.js (WSE_TEXT). */
'use strict';

const E = self.WSE, T = self.WSE_TEXT, U = T.ui;
const money = T.money, pct = T.pct;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// в текстах правил разрешён только тег <code> для команд; остальное экранируем
const safe = s => esc(s).replace(/&lt;code&gt;/g, '<code>').replace(/&lt;\/code&gt;/g, '</code>');
const result = $('result');

function show(html) {
  result.innerHTML = html;
  result.classList.add('shown');
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const diagnose = s => E.diagnose(s, T);
const mainFinding = E.mainFinding;

/* Кнопка «Скопировать итог». В тексте — только суммы и названия проверок: ни ваших просьб, ни имён файлов. */
const copyButton = text => '<button type="button" class="copy" data-text="' + esc(text) + '">' + U.copy + '</button>';

function renderSummary(s, found) {
  const top = mainFinding(found);
  let html = '<div class="summary"><span class="tag">' + U.summaryTag + '</span><p>';
  html += U.sessionCost(s);
  if (top) {
    html += U.mainThing + safe(top.headline) + '</p><p class="advice">' + safe(top.short) +
      (top.saving ? U.summarySaving(top.saving) : '') + '</p>';
  } else {
    html += U.noLeaks + '</p>';
  }
  const others = found.filter(f => f !== top && f.level !== 'ok').map(f => f.check.name);
  return html + copyButton(U.shareSession(s, top, others)) + '</div>';
}

/* Сводка по нескольким сессиям: какие проверки срабатывают снова и снова. */
function renderHabits(a) {
  let html = '<div class="habits"><h2>' + U.habitsTitle + '</h2><p class="small muted">' + U.habitsIntro(a) + '</p>';
  if (a.habits.length) {
    html += '<ul>';
    a.habits.forEach(h => {
      const k = h.warn ? 'warn' : 'info';
      html += '<li class="c-' + k + '"><span class="ic" aria-hidden="true">' + (h.warn ? '!' : '●') + '</span><div>' +
        '<span class="nm">' + h.check.name + '</span>' +
        '<div class="st">' + U.habitCount(h.warn + h.info, a.sessions) + (h.saving >= 0.05 ? ' · ' + U.badge(h.saving) : '') + '</div>' +
        (h.short ? '<div class="ds">' + safe(h.short) + '</div>' : '') + '</div></li>';
    });
    html += '</ul>';
  } else {
    html += '<p>' + U.noHabits + '</p>';
  }
  if (a.duplicates) html += '<p class="small muted">' + U.duplicates(a.duplicates) + '</p>';
  return html + copyButton(U.shareAll(a)) + '</div>';
}

function renderPrompts(s) {
  const turns = s.turns.filter(t => t.text);
  if (turns.length < 2) return '';
  const sorted = turns.slice().sort((a, b) => b.dollars - a.dollars);
  const top = sorted.slice(0, 3);
  let rest = 0; sorted.slice(3).forEach(t => rest += t.dollars);
  let html = '<h2>' + U.promptsTitle + '</h2><div class="asks">';
  top.forEach(t => {
    html += '<div class="ask"><div class="q">' + U.q(esc(E.clip(t.text, 140))) + '</div>' +
      '<div class="meta">' + U.promptMeta(t, t.dollars / s.total) + '</div></div>';
  });
  if (sorted.length === 4) html += '<p class="small muted">' + U.oneMore(rest) + '</p>';
  else if (sorted.length > 4) html += '<p class="small muted">' + U.others(sorted.length - 3, rest) + '</p>';
  return html + '</div>';
}

/* Карточка сворачивается: в заголовке — суть одной строкой, по нажатию — подробности. */
function renderFinding(f, open) {
  const teaser = f.headline
    ? f.headline.charAt(0).toUpperCase() + f.headline.slice(1)
    : f.what.split('. ')[0].replace(/\.?$/, '.');     // первое предложение
  const lbl = f.calm ? U.calmLabels : U.labels;
  let html = '<details class="finding ' + f.level + '" id="check-' + f.check.n + '"' + (open ? ' open' : '') + '><summary>' +
    '<span class="tag">' + U.checkTag(f.check.n) + ' · ' + U.levels[f.level] + '</span>' +
    (f.saving ? '<span class="badge">' + U.badge(f.saving) + '</span>' : '') +
    '<h3>' + esc(f.title) + '</h3>' +
    '<p class="teaser">' + safe(teaser) + '</p>' +
    '<span class="more"></span></summary>' +
    '<div class="part"><div class="lbl">' + lbl.what + '</div><p>' + safe(f.what) + '</p></div>' +
    '<div class="part"><div class="lbl">' + lbl.why + '</div><p>' + safe(f.why) + '</p></div>' +
    '<div class="part"><div class="lbl">' + lbl.todo + '</div><ul>';
  f.todo.forEach(t => html += '<li>' + safe(t) + '</li>');
  html += '</ul>';
  if (f.saving) html += '<p class="saving">' + U.savingLine(f.saving, f.savingNote, esc) + '</p>';
  return html + '</div></details>';
}

function renderTech(s) {
  const p = E.priceFor(s.mainModel).p;
  let tok = 0; s.requests.forEach(r => tok += r.input + r.output + r.cacheRead + r.cacheWrite);
  return '<details class="tech"><summary>' + U.techTitle + '</summary><ul>' + U.tech(s, p, tok, esc) + '</ul></details>';
}

/* Все десять проверок одним списком: что проверяли и чем кончилось. */
function renderChecklist(results) {
  const icons = { warn: '!', info: '●', ok: '✓', none: '✓', soon: '○' };
  let html = '<h2>' + U.checklistTitle + '</h2>' +
    '<p class="small muted">' + U.checklistIntro + '</p><div class="checks">';
  E.GROUPS.forEach(g => {
    const G = T.groups[g];
    html += '<div class="cgroup"><h3>' + G.name + '</h3><p class="small muted">' + G.about + '</p><ul>';
    results.filter(r => r.check.group === g).forEach(r => {
      const c = r.check, k = c.soon ? 'soon' : r.finding ? r.finding.level : 'none';
      const name = r.finding ? '<a class="nm" href="#check-' + c.n + '">' + c.name + '</a>' : '<span class="nm">' + c.name + '</span>';
      html += '<li class="c-' + k + '"><span class="ic" aria-hidden="true">' + icons[k] + '</span><div>' +
        '<span class="num">' + c.n + '.</span> ' + name + '<div class="st">' + U.status[k] + '</div>' +
        '<div class="ds">' + c.about + '</div></div></li>';
    });
    html += '</ul></div>';
  });
  return html + '</div>';
}

function renderSession(s) {
  const results = diagnose(s);
  const found = results.filter(r => r.finding).map(r => r.finding);
  let html = renderSummary(s, found) + renderChecklist(results) + renderPrompts(s);
  if (found.length) {
    // открыта только главная проблема — остальное, в том числе карточки «всё хорошо», по нажатию
    const top = mainFinding(found);
    html += '<div class="found-head"><h2>' + U.detailsTitle + '</h2>' +
      (found.length > 1 ? '<button type="button" class="toggle-all">' + U.expandAll + '</button>' : '') + '</div>';
    E.GROUPS.forEach(g => {
      const fs = found.filter(f => f.check.group === g);
      if (!fs.length) return;
      html += '<div class="glabel">' + T.groups[g].name + '</div>';
      fs.forEach(f => html += renderFinding(f, f === top || found.length === 1));
    });
  } else {
    html += '<div class="finding info"><span class="tag">' + U.nothingTag + '</span>' +
      '<p>' + U.nothingText + '</p></div>';
  }
  return html + renderTech(s);
}

function render(sessions, isSample) {
  const good = sessions.filter(s => s.uniqueCount > 0);

  if (!good.length) {
    show('<div class="error">' + U.notLog(sessions[0]) + '</div>');
    return;
  }

  good.sort((a, b) => b.total - a.total);
  const main = good[0], multi = good.length > 1;
  // по нескольким сессиям — общая сумма без повторов: один ответ модели может лежать в двух файлах
  const agg = multi ? E.aggregate(good, T) : null;
  const total = multi ? agg.total : main.total, steps = multi ? agg.steps : main.uniqueCount;

  let html = '';
  if (isSample) {
    html += '<div class="finding info" style="margin-bottom:22px"><span class="tag">' + U.sampleTag + '</span>' +
      '<p style="margin-top:6px">' + U.sampleText + '</p></div>';
  }

  html += '<div class="total"><div class="sum">' + money(total) + '</div>' +
    '<div class="sub">' + U.totalSub(good.length, main, steps, esc) + '</div>' +
    '<div class="naive">' + U.apiNote + '</div></div>';

  if (multi) {
    html += renderHabits(agg);
    const SHOWN = 12;
    let rows = '';
    good.forEach((s, i) => {
      rows += '<tr class="pick' + (i === 0 ? ' active' : '') + (i >= SHOWN ? ' extra' : '') + '" data-i="' + i + '">' +
        '<td>' + esc(s.project || s.name) + '</td>' +
        '<td class="hide-sm">' + (s.lastTs ? T.day(s.lastTs) : '—') + '</td>' +
        '<td class="hide-sm">' + s.uniqueCount + '</td>' +
        '<td class="num">' + money(s.total) + '</td></tr>';
    });
    html += '<div class="sessions"><h2>' + U.sessionsTitle + '</h2>' +
      '<p class="small muted">' + U.sessionsIntro + '</p>' +
      '<table><tr><th>' + U.cols.project + '</th><th class="hide-sm">' + U.cols2.when + '</th><th class="hide-sm">' + U.cols.steps + '</th><th class="num">' + U.cols.cost + '</th></tr>' + rows + '</table>' +
      (good.length > SHOWN ? '<button type="button" class="more-rows">' + U.moreRows(good.length - SHOWN) + '</button>' : '') + '</div>';
  }

  html += '<div id="session">' + renderSession(main) + '</div>';
  show(html);

  const rows = result.querySelectorAll('.pick');
  for (let i = 0; i < rows.length; i++) {
    rows[i].addEventListener('click', function () {
      $('session').innerHTML = renderSession(good[+this.getAttribute('data-i')]);
      for (let k = 0; k < rows.length; k++) rows[k].classList.remove('active');
      this.classList.add('active');
      $('session').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

/* ---------- Чтение файлов ----------
   Читаем по одному, чтобы на сотнях файлов не упереться в память и показывать, сколько осталось.
   Из папки берём только .jsonl; если файлов очень много — самые свежие. */
const MAX_FILES = 2000;
function readFiles(fileList, fromFolder) {
  let files = Array.prototype.slice.call(fileList);
  if (fromFolder) files = files.filter(f => /\.jsonl$/i.test(f.name));
  if (!files.length) { if (fromFolder) show('<div class="error">' + U.noJsonl + '</div>'); return; }
  files.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  files = files.slice(0, MAX_FILES);
  show('<p class="lead" id="progress">' + U.reading(files.length) + '</p>');

  const sessions = [];
  let i = 0;
  const next = () => {
    if (i >= files.length) { render(sessions, false); return; }
    const f = files[i++];
    const bar = $('progress');
    if (bar && files.length > 1) bar.textContent = U.readingOf(i, files.length);
    const reader = new FileReader();
    reader.onload = () => {
      try { sessions.push(E.parse(String(reader.result), f.name)); }
      catch (e) { /* один битый файл не должен ронять остальные */ }
      next();
    };
    reader.onerror = next;
    reader.readAsText(f);
  };
  next();
}

/* Перетащили папку: обходим её целиком и собираем все .jsonl внутри. */
function filesFromDrop(dt, done) {
  const items = dt.items ? Array.prototype.slice.call(dt.items) : [];
  // webkitGetAsEntry работает только прямо в обработчике drop — поэтому сразу
  const entries = items.map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
  if (!entries.some(e => e.isDirectory)) { done(dt.files, false); return; }
  const out = [];
  let pending = 0;
  const finish = () => { if (--pending === 0) done(out, true); };
  const walk = entry => {
    pending++;
    if (entry.isFile) {
      if (/\.jsonl$/i.test(entry.name)) entry.file(f => { out.push(f); finish(); }, finish);
      else finish();
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const batch = () => reader.readEntries(list => {
        if (!list.length) { finish(); return; }
        list.forEach(walk);
        batch();                           // readEntries отдаёт папку порциями
      }, finish);
      batch();
    } else finish();
  };
  entries.forEach(walk);
}

/* Скопировать текст: современный способ, а если браузер не дал — через скрытое поле. */
function copyText(text, ok) {
  const legacy = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { if (document.execCommand('copy')) ok(); } catch (e) { /* не вышло — кнопка останется как была */ }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, legacy);
  else legacy();
}

/* ---------- События ---------- */
const drop = $('drop');
$('pickBtn').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', e => {
  readFiles(e.target.files);
  e.target.value = '';                     // иначе повторный выбор того же файла не сработает
});
$('sampleBtn').addEventListener('click', () => render([E.parse(E.makeSampleLog(T), T.sample.name)], true));

// выбор папки целиком — только там, где браузер это умеет (на телефонах логов всё равно нет)
const dirInput = $('dir');
if (!('webkitdirectory' in dirInput) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
  $('dirBtn').style.display = 'none';
  $('dirNote').style.display = 'none';
}
$('dirBtn').addEventListener('click', () => dirInput.click());
dirInput.addEventListener('change', e => {
  readFiles(e.target.files, true);
  e.target.value = '';
});

result.addEventListener('click', e => {
  const btn = e.target.closest && e.target.closest('.copy');
  if (!btn) return;
  copyText(btn.getAttribute('data-text'), () => {
    btn.textContent = U.copied;
    setTimeout(() => { btn.textContent = U.copy; }, 2000);
  });
});
result.addEventListener('click', e => {
  const btn = e.target.closest && e.target.closest('.more-rows');
  if (!btn) return;
  btn.parentNode.classList.add('all');
  btn.parentNode.removeChild(btn);
});

/* «Развернуть все / Свернуть все». Отчёт перерисовывается, поэтому слушаем на контейнере. */
function syncToggle() {
  const btn = result.querySelector('.toggle-all');
  if (!btn) return;
  const cards = result.querySelectorAll('details.finding');
  const allOpen = Array.prototype.every.call(cards, d => d.open);
  btn.textContent = allOpen ? U.collapseAll : U.expandAll;
}
// пункт из «Что мы проверили»: открыть карточку и прокрутить к ней
result.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#check-"]');
  if (!a) return;
  const card = document.getElementById(a.getAttribute('href').slice(1));
  if (!card) return;
  e.preventDefault();
  card.open = true;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
result.addEventListener('click', e => {
  const btn = e.target.closest && e.target.closest('.toggle-all');
  if (!btn) return;
  const cards = result.querySelectorAll('details.finding');
  const open = btn.textContent === U.expandAll;
  for (let i = 0; i < cards.length; i++) cards[i].open = open;
  syncToggle();
});
result.addEventListener('toggle', syncToggle, true);   // событие toggle не всплывает — ловим на погружении

['dragenter', 'dragover'].forEach(ev =>
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev =>
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer) filesFromDrop(e.dataTransfer, readFiles); });

// перетаскивание мимо зоны не должно открывать файл поверх страницы
['dragover', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  if (!drop.contains(e.target)) e.preventDefault();
}));
