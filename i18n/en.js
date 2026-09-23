/* English texts: check cards and report labels. The numbers behind them come from engine.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../engine.js'));
  else root.WSE_TEXT = factory(root.WSE);
})(typeof self !== 'undefined' ? self : this, function (E) {
'use strict';

const clip = E.clip;

/* ---------- Formatting ---------- */
const money = d => d < 0.01 ? 'under a cent' : '$' + d.toFixed(2);
const pct = x => Math.round(x * 100) + '%';
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
function pages(tokens) {
  let p = Math.max(1, Math.round(tokens / E.TOKENS_PER_PAGE));
  if (p >= 20) p = Math.round(p / 10) * 10;       // "about 470 pages", not "about 472"
  return 'about ' + plural(p, 'page', 'pages');
}
function times(x) {
  const r = x >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
  return r + (r === 1 ? ' time' : ' times');          // "1.5 times", "6 times"
}
const nSteps = n => plural(n, 'step', 'steps');
const nImages = n => plural(n, 'image', 'images');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = ts => { const d = new Date(ts); return MONTHS[d.getMonth()] + ' ' + d.getDate(); };
// "from Sep 9 to 23", "from Aug 28 to Sep 3", "on Sep 23"
function period(a, b) {
  const x = new Date(a), y = new Date(b);
  if (day(a) === day(b)) return 'on ' + day(b);
  return 'from ' + day(a) + ' to ' + (x.getMonth() === y.getMonth() ? y.getDate() : day(b));
}

/* ---------- Checks ---------- */
const groups = {
  reread: { name: 'What the model rereads', about: 'Before every answer the model rereads the whole conversation. Here we look for what bloats it.' },
  task:   { name: 'How the task was set',   about: 'We look for requests that took the most steps and money.' },
  model:  { name: 'Model and settings',     about: 'We check whether you pay for horsepower where it isn\'t needed.' },
};
const checks = {
  growth:       { name: 'Conversation length',            about: 'Has the conversation grown so much that every message costs more and more?' },
  loop:         { name: 'Files reopened',                 about: 'Did the model open the same file again and again?' },
  screenshots:  { name: 'Images in the conversation',     about: 'How many screenshots got into the conversation and are reread with every message.' },
  cache:        { name: 'Rereading discount',             about: 'Did the discount on rereading the conversation kick in?' },
  bigAsk:       { name: 'Most expensive request',         about: 'Did a single request eat most of the bill?' },
  errors:       { name: 'Errors and retries',             about: 'What the "failed, tried again, failed again" loops cost.' },
  noResult:     { name: 'Work with no result',            about: 'Money spent, yet not a single file changed.' },
  thinking:     { name: 'Model\'s thinking',              about: 'How much of the text you paid for is reasoning you never see.' },
  shortAnswers: { name: 'Expensive model for small stuff', about: 'Did an expensive model spend its effort on two-line replies?' },
  background:   { name: 'Forgotten background processes', about: 'Did background tasks wake the model after you had left?' },
};

/* An action kind (engine.toolKind) in plain words. */
const KINDS = {
  terminal: 'terminal commands', read: 'reading files', edit: 'editing files', search: 'searching files',
  web: 'web search', browser: 'browser control', mcp: 'external connections (MCP)', other: 'other actions',
};
const kind = k => KINDS[k] || k;

/* ---------- Problem cards ----------
   headline — one sentence for the "In short" block, short — the advice for it,
   what / why / todo — what happened, why it costs money, what to do. */
const rules = {
  growth: f => ({
    title: 'The conversation grew — every message costs more',
    headline: 'you worked in one window for a long time, and by the end the model was rereading ' + pages(f.max) + ' for every message you sent.',
    short: 'Finished a task? Type <code>/clear</code> and start the next one from a clean slate.',
    what: 'At the start of the session the model reread ' + pages(f.first) + ' per message; by the end, ' + pages(f.max) + ' — ' + times(f.ratio) + ' as much. ' +
          'The first steps cost ' + money(f.early) + ' on average, the last ones ' + money(f.late) + '.',
    why: 'The model has no memory of the conversation. Before every answer it rereads the whole thing from the beginning — your messages, its replies, every file it opened. ' +
         'Picture a translator paid per page read who rereads the entire conversation before each new sentence. The longer the conversation, the more each sentence costs.',
    todo: [
      'Done with one task and moving to another? Type <code>/clear</code>. The conversation is wiped and the next task starts from scratch.',
      'Same task, but the conversation is already long? Type <code>/compact</code>. Claude Code condenses the conversation into a short summary and continues from there.',
    ],
    savingNote: 'if the conversation had been cleared before each new request. In practice some requests continue the previous one, so real savings are smaller.',
  }),

  bigAsk: f => ({
    title: 'One request ate most of the bill',
    headline: 'a single request cost ' + money(f.top.dollars) + ' — ' + pct(f.share) + ' of the whole session.',
    short: 'Hand over big tasks in parts and check the result after each one.',
    what: (f.top.text ? 'The request "' + clip(f.top.text, 90) + '" ' : 'One request ') + 'cost ' + money(f.top.dollars) +
          ' — ' + pct(f.share) + ' of the whole session. To complete it, the model took ' + nSteps(f.top.steps) + '.',
    why: 'Every step is a separate call to the model: read a file, check something, fix it, run it. ' +
         'And every step rereads the whole conversation again. When a task is vague, the model takes lots of extra steps — trying, failing, redoing.',
    todo: [
      'Break a big task into parts: "first do X", check it, then "now do Y".',
      'Be more specific: which file, what exactly to change, how to tell it\'s done. The less the model has to guess, the fewer steps it takes.',
    ],
  }),

  thinking: f => ({
    title: 'The model does a lot of thinking to itself',
    headline: pct(f.share) + ' of the text you paid for is the model\'s internal reasoning, which you never even see.',
    short: 'Run simple tasks with lower reasoning effort.',
    what: 'Of everything the model wrote, ' + pct(f.share) + ' was its internal reasoning, not the answer to you. You don\'t see it, but you pay for it: ' + money(f.cost) + '.' +
          (f.effort ? ' This session used the "' + f.effort + '" effort level.' : ''),
    why: 'Before answering, the model writes a draft "to itself". That\'s the most expensive kind of text — it\'s billed at the output price. ' +
         'On hard tasks the draft pays off; on simple ones ("rename this file", "fix the typo") it\'s money down the drain.',
    todo: [
      'For simple tasks, start Claude Code like this: <code>claude --effort low</code>. The model will think less.',
      'For hard tasks (a new feature, a tricky bug) leave it as is — there the reasoning pays off.',
    ],
  }),

  loop: f => ({
    title: 'Going in circles',
    headline: 'the model opened the same file, ' + f.file + ', ' + f.count + ' times.',
    short: 'Tell the model directly that it has already read the file.',
    what: 'The file ' + f.file + ' was opened ' + f.count + ' times during the session.',
    why: 'Every time the model opens a file, its entire contents are added to the conversation. ' +
         'And, as you remember, the whole conversation is reread with every message. One big file opened five times means five copies you pay for again and again.',
    todo: [
      'If you notice the model opening the same file again, write: "You\'ve already read ' + f.file + ', don\'t open it again."',
      'If the file is big and only part of it matters, say which part: "only look at the payment function".',
    ],
  }),

  screenshots: f => ({
    title: 'Lots of images in the conversation',
    headline: nImages(f.images) + ' ended up in the conversation, and all of them are reread with every message.',
    short: 'Ask for a screenshot only when there\'s no other way.',
    what: 'During the session ' + nImages(f.images) + ' ended up in the conversation — page screenshots or attached pictures.',
    why: 'To the model, an image is like several pages of text. And it stays in the conversation until the end: every following message "looks" at all the past screenshots again.',
    todo: [
      'To check the text on a page you don\'t need a screenshot — ask the model to read the page text instead.',
      'If there were many screenshots and the task is done, use <code>/clear</code>: the old images will stop being reread.',
    ],
  }),

  shortAnswers: f => {
    const name = f.model.name || 'unknown model';
    return {
      title: 'Expensive short answers',
      headline: f.count + ' times the model reread the whole conversation just to reply with a couple of lines.',
      short: 'Switch to a cheaper model for small questions.',
      what: nSteps(f.count) + ' ended with a reply shorter than a couple of paragraphs, but before each one the model reread the whole conversation. Total: ' + money(f.dollars) + '.',
      why: 'A short answer costs almost as much as a long one: most of the price isn\'t the answer itself but reading everything before it. "Continue", "yes", "what\'s that file?" are expensive questions in a long conversation.',
      todo: f.cheaper ? [
        'For routine work and small questions, switch to a cheaper model: type <code>/model</code> and pick Haiku. Rereading the conversation costs $' + f.cheap.in + ' per million tokens on Haiku versus $' + f.model.in + ' on ' + name + '.',
        'Ask a short question unrelated to the current task in a new window — the conversation there is empty.',
      ] : [
        'Ask a short question unrelated to the current task in a new window — the conversation there is empty.',
        'Before a series of small edits, run <code>/compact</code>: the conversation shrinks, and every short answer gets cheaper.',
      ],
      savingNote: 'if these steps had run on Haiku instead of ' + name + '.',
    };
  },

  errors: f => ({
    title: 'The model stumbled and tried again',
    headline: f.n + ' of the model\'s actions ended in an error, and fixing them cost ' + money(f.cost) + '.',
    short: 'If the model hits the same error a second time, stop it and give it a hint.',
    what: 'During the session ' + f.n + ' of the model\'s actions ended in an error: a command failed, a file wasn\'t found, a tool refused. ' +
          'What broke most often: ' + kind(f.kind) + ' (' + plural(f.kindCount, 'time', 'times') + '). ' +
          (f.maxStreak >= 3 ? 'At one point the error happened ' + f.maxStreak + ' times in a row. ' : '') +
          'The steps where the model dealt with errors cost ' + money(f.cost) + ' — ' + pct(f.share) + ' of the session.',
    why: 'Every error means at least one more step: the model reads the error message, thinks, and tries again. And every such step rereads the whole conversation. ' +
         'If the cause is on your machine — a program isn\'t installed, access is missing, wrong folder — the model can keep hitting it for a long time with no result.',
    todo: [
      'The model gets the same error a second time? Stop it (<code>Esc</code> or the stop button) and tell it what\'s wrong. One sentence from you is cheaper than five attempts.',
      'Write down in <code>CLAUDE.md</code> in the project folder how your tests and build are run. Then the model won\'t have to guess the commands.',
      'If the problem is on your machine — a missing program or no access — fix it yourself: the model can\'t.',
    ],
  }),

  noResult: f => ({
    title: 'Lots of work — not a single file changed',
    headline: 'the request "' + clip(f.top.text, 60) + '" cost ' + money(f.top.dollars) + ', yet not a single file changed.',
    short: 'Expecting edits but the model keeps reading? Stop it after 5–6 steps and ask what\'s in the way.',
    what: (f.count > 1
      ? f.count + ' of your requests cost ' + money(f.cost) + ' together, yet not a single file changed after them. The most expensive: "' + clip(f.top.text, 90) + '", '
      : 'The request "' + clip(f.top.text, 90) + '" cost ' + money(f.cost) + ', yet not a single file changed after it. It took ') +
      plural(f.top.steps, 'model step', 'model steps') + '.',
    why: 'Sometimes that\'s the point: you asked to explain, find, or check something. Then all is fine — skip this finding. ' +
         'But if you expected edits, the model spent a long time reading, searching, and trying without getting to the actual work. That usually happens when the task is vague and the model doesn\'t know where to start.',
    todo: [
      'Give it an entry point: a file name, a function name, the error text. The model will start with the work, not with searching the whole project.',
      'Expecting edits, and the model has only been reading for 5–6 steps? Stop it and ask: "What are you doing right now, and what\'s stopping you from starting?"',
      'For questions without edits, set a frame: "look only at the cart folder and answer in five bullet points".',
    ],
  }),

  background: f => {
    const list = f.commands.slice(0, 3).map(t => '"' + clip(t, 50) + '"').join(', ') + (f.commands.length > 3 ? ' and ' + (f.commands.length - 3) + ' more' : '');
    return {
      title: 'Background tasks woke the model without you',
      headline: 'the model worked ' + plural(f.steps, 'time', 'times') + ' without being asked — on a signal from a background task — and it cost ' + money(f.cost) + '.',
      short: 'Done for the day? Ask the model to stop all background tasks.',
      what: (f.commands.length ? 'The model started in the background: ' + list + '. ' : '') +
            'Background tasks woke the model ' + plural(f.wakeups, 'time', 'times') + ', and it took ' + nSteps(f.steps) + ' you didn\'t ask for — ' + money(f.cost) + ' worth.' +
            (f.tailSteps === f.steps ? ' All of them came more than 10 minutes after your last message: you had most likely left.'
              : f.tailSteps ? ' Of those, ' + nSteps(f.tailSteps) + ' worth ' + money(f.tailCost) + ' came more than 10 minutes after your last message: you had most likely left.' : ''),
      why: 'Claude Code can run long jobs in the background: a server, a build, a helper. When a background task reports something, the model wakes up and rereads the whole conversation again — even if you\'re gone. ' +
           'A forgotten server or watcher can wake it again and again.',
      todo: [
        'When you\'re done, write: "Stop all background tasks." The model will find and close them.',
        'Leaving for a long time? Close Claude Code: background tasks stop along with it.',
      ],
      savingNote: 'if the background tasks had stopped when you left.',
    };
  },

  cache: f => f.calm ? {
    title: 'The rereading discount works',
    headline: '',
    what: pct(f.share) + ' of the reread conversation came at a 10× discount. Without it, the session would have cost about ' + money(f.saved) + ' more.',
    why: 'Claude Code remembers the conversation it has already read, and rereading it costs ten times less. The discount holds as long as you don\'t take long breaks.',
    todo: [
      'Nothing to do right now — Claude Code handles this on its own.',
      'To keep it that way: coming back to a long conversation after a long break, run <code>/compact</code> first; switching to a different task, use <code>/clear</code>.',
    ],
  } : {
    title: 'The rereading discount barely kicked in',
    headline: 'only ' + pct(f.share) + ' of the conversation was read at a discount — the rest at full price.',
    short: 'After a long break, start with <code>/compact</code> or <code>/clear</code>.',
    what: 'Only ' + pct(f.share) + ' of the reread conversation came at a 10× discount. The rest was full price.',
    why: 'Claude Code remembers the conversation it has read, and rereading it costs ten times less. But that memory doesn\'t last long — in this session, about ' + (f.ttl1h ? 'an hour' : 'five minutes') + ' without messages. ' +
         'Go to lunch, come back with a new question, and the whole long conversation is read again at full price.',
    todo: [
      'Coming back to a long conversation after a break? Run <code>/compact</code> first: you\'ll pay full price for a short summary instead of the whole history.',
      'If you\'re coming back to a different task, use <code>/clear</code>.',
    ],
  },
};

/* ---------- "All good" cards ----------
   What we saw in this session, why the point matters at all, and how to avoid problems in the future. */
const calm = {
  growth: f => ({
    title: 'The conversation didn\'t grow too much',
    what: f.tooShort ? 'The session was too short for the conversation to grow.'
      : 'At the start the model reread ' + pages(f.first) + ' per message; by the end, ' + pages(f.max) + '. Over ' +
        nSteps(f.steps) + ' the conversation didn\'t grow much, and messages didn\'t get noticeably more expensive.',
    why: 'Before every answer the model rereads the whole conversation from the start. While it\'s short, that\'s cheap. Once it grows, every next message costs more.',
    todo: [
      'One task, one conversation: done with a task — type <code>/clear</code>.',
      'The task is big and the conversation is already long — type <code>/compact</code>: Claude Code condenses it into a short summary.',
    ],
  }),
  loop: f => ({
    title: 'Files weren\'t reopened in circles',
    what: f.file ? 'The file the model opened most was ' + f.file + ' — ' + plural(f.count, 'time', 'times') + '. That\'s normal.' : 'The model didn\'t open any file more than once.',
    why: 'Every time the model opens a file, the whole file is added to the conversation and reread with every message after that. A file opened five times is paid for five times.',
    todo: [
      'If you notice the model opening the same file again, say: "You\'ve already read it, don\'t open it again."',
      'Only need part of a big file? Say which part: "only look at the payment function".',
    ],
  }),
  screenshots: f => ({
    title: 'Few images',
    what: f.images ? 'Images in the conversation: ' + f.images + ' — that\'s not many.' : 'There were no images in the conversation.',
    why: 'To the model, an image is like several pages of text. And it stays in the conversation until the end: every following message "looks" at all the past screenshots again.',
    todo: [
      'To check the text on a page, ask the model to read the page text instead of taking a screenshot.',
      'After a series of screenshots, once the task is done, use <code>/clear</code>.',
    ],
  }),
  cache: f => ({
    title: 'Rereading discount — nothing to flag',
    what: 'The session had ' + nSteps(f.steps) + ' — too few for the rereading discount to noticeably affect the bill.',
    why: 'Claude Code remembers the conversation it has read, and rereading it costs ten times less. But that memory doesn\'t last long: after a long break the whole conversation is read again at full price.',
    todo: [
      'Coming back to a long conversation after a break? Run <code>/compact</code> first: you\'ll pay full price for a short summary instead of the whole history.',
      'Coming back to a different task — use <code>/clear</code>.',
    ],
  }),
  bigAsk: f => ({
    title: 'No single request ate the bill',
    what: f.single ? 'The session had a single request — nothing to compare it with.'
      : 'The most expensive request took ' + pct(f.share) + ' of the session — the money was spread evenly across requests.',
    why: 'Every model step is a separate call: read, check, fix. And every step rereads the whole conversation. A vague task turns into dozens of extra steps.',
    todo: [
      'Hand over big tasks in parts: "first do X", check it, then "now do Y".',
      'Be specific: which file, what to change, how to tell it\'s done.',
    ],
  }),
  errors: f => ({
    title: 'The model didn\'t stumble',
    what: f.n ? 'There ' + (f.n === 1 ? 'was 1 error' : 'were ' + f.n + ' errors') + '; the model dealt with them quickly, and they didn\'t cost much.' : 'None of the model\'s actions ended in an error.',
    why: 'Every error means at least one more step: the model reads the error, thinks, and tries again. If the cause is on your machine — a missing program, no access — the model can keep hitting it for a long time.',
    todo: [
      'The model gets the same error a second time? Stop it (<code>Esc</code> or the stop button) and tell it what\'s wrong.',
      'Write down in <code>CLAUDE.md</code> in the project folder how your tests and build are run.',
    ],
  }),
  noResult: () => ({
    title: 'The work produced results',
    what: 'We found no expensive requests after which not a single file changed.',
    why: 'When a task is vague, the model reads, searches, and tries for a long time without getting to the edits — and you pay for the searching.',
    todo: [
      'Give it an entry point: a file name, a function name, the error text.',
      'Expecting edits, and the model has only been reading for 5–6 steps? Stop it and ask what\'s in the way.',
    ],
  }),
  thinking: f => ({
    title: 'A reasonable amount of thinking',
    what: f.out && !f.thinking ? 'The model answered directly, with no hidden reasoning.'
      : f.out ? 'The model\'s reasoning was ' + pct(f.thinking / f.out) + ' of the text you paid for. That\'s within the normal range.' : 'The model wrote almost nothing.',
    why: 'Before answering, the model writes a draft "to itself", billed at the output price — the most expensive kind of text. On hard tasks the draft pays off; on simple ones it doesn\'t.',
    todo: [
      'For simple tasks, start Claude Code like this: <code>claude --effort low</code>.',
      'For hard tasks (a new feature, a tricky bug) keep the normal effort level.',
    ],
  }),
  shortAnswers: () => ({
    title: 'Short answers were cheap',
    what: 'There were almost no short answers on top of a long conversation.',
    why: 'A short answer costs almost as much as a long one: most of the price isn\'t the answer itself but rereading the whole conversation before it.',
    todo: [
      'For small questions, switch to a cheaper model: <code>/model</code> → Haiku.',
      'Ask a question unrelated to the current task in a new window — the conversation there is empty.',
    ],
  }),
  background: f => ({
    title: 'Background tasks didn\'t cost money',
    what: f.wakeups ? 'Background tasks did wake the model, but it didn\'t cost much.'
      : f.started ? 'The model started tasks in the background, but they didn\'t wake it without you.' : 'There were no background tasks in this session.',
    why: 'Claude Code can run long jobs in the background: a server, a build, a helper. When a background task reports something, the model wakes up and rereads the whole conversation — even if you\'re gone.',
    todo: [
      'When you\'re done, write: "Stop all background tasks."',
      'Leaving for a long time? Close Claude Code: background tasks stop along with it.',
    ],
  }),
};

/* ---------- Sample ---------- */
const sample = {
  name: 'sample',
  notification: 'npm run dev: new output',
  asks: {
    0:  'Add a promo code discount to the cart, the codes are in the promo table',
    9:  'Tests are failing, fix them',
    14: 'Do the same for the orders page, and while you\'re at it check the whole database schema for missing indexes',
    30: 'Why does a discounted order sometimes get counted twice? Look into it',
    38: 'ok, go on',
  },
};

/* ---------- Report labels ---------- */
const DEMO_URL = 'https://serghomka.github.io/why-so-expensive-landing/en/demo.html';
const ui = {
  q: t => '"' + t + '"',
  summaryTag: 'In short',
  sessionCost: s => 'This session cost <b>' + money(s.total) + '</b>' +
    (s.turns.length ? ': ' + plural(s.turns.length, 'request', 'requests') + ' from you, ' : ', ') +
    plural(s.uniqueCount, 'model step', 'model steps') + '. ',
  mainThing: 'The main thing: ',
  summarySaving: x => ' <b>Estimated savings: up to ' + money(x) + '.</b>',
  noLeaks: 'No obvious leaks found — the money went into the actual work.',
  promptsTitle: 'What your requests cost',
  promptMeta: (t, share) => '<b>' + money(t.dollars) + '</b> · ' + plural(t.steps, 'model step', 'model steps') + ' · ' + pct(share) + ' of the session',
  oneMore: x => 'One more request — ' + money(x) + '.',
  others: (n, x) => 'The other ' + n + ' requests — ' + money(x) + ' together.',
  levels: { warn: 'Problem', info: 'Worth a look', ok: 'All good here' },
  checkTag: n => 'Check ' + n,
  badge: x => 'save up to ' + money(x),
  labels: { what: 'What happened', why: 'Why it costs money', todo: 'What to do' },
  calmLabels: { what: 'What we saw', why: 'Why it\'s worth watching', todo: 'How to keep it that way' },
  savingLine: (x, note, esc) => 'Estimated savings: up to <b>' + money(x) + '</b>, ' + esc(note),
  tech: (s, p, tok, esc) => {
    let li = '<li>Main model: ' + esc(s.mainModel || '—') + ' ($' + p.in + ' per 1M input tokens, $' + p.out + ' per 1M output).</li>' +
      '<li>Total tokens: ' + (tok / 1e6).toFixed(2) + 'M.</li>';
    if (s.rawCount > s.uniqueCount) {
      li += '<li>The log has ' + s.rawCount + ' model response records, ' + s.uniqueCount +
        ' of them unique. The same response is stored in the file several times. Counting them all would give ' + money(s.naive) +
        ' — ' + times(s.naive / s.total) + ' the real figure.</li>';
    }
    if (s.unknownModel) li += '<li>' + esc(s.unknownModel) + ' isn\'t in the price list — an average rate was used, so the figure is approximate.</li>';
    li += '<li>A "page" is roughly ' + E.TOKENS_PER_PAGE + ' tokens — a rough conversion for illustration.</li>';
    return li;
  },
  techTitle: 'Details for the curious',
  status: { warn: 'Problem', info: 'Worth a look', ok: 'All good', none: 'No problems', soon: 'Next update' },
  checklistTitle: 'What we checked',
  checklistIntro: 'We check the session on ten points in three groups. Each point is its own way for the bill to grow unnoticed. ' +
    'Click a point to open the details and tips.',
  detailsTitle: 'Each check in detail',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  nothingTag: 'Nothing triggered',
  nothingText: 'No obvious problems in this session — that happens, and it\'s an honest answer.',
  notLog: bad => '<h3>This doesn\'t look like a Claude Code log</h3>' +
    '<p class="small" style="margin-bottom:0">' + (bad && bad.badLines ? 'The file has ' + plural(bad.badLines, 'line', 'lines') + ', but not a single' : 'The file has no') +
    ' usage record. You need <code>.jsonl</code> files from the <code>~/.claude/projects/</code> folder — ' +
    'that\'s where Claude Code writes sessions.</p>',
  sampleTag: 'Sample',
  sampleText: 'This is a made-up session in the real Claude Code format, so you can see the report without your own file. ' +
    'On your own log the numbers and requests will be yours.',
  totalSub: (count, main, steps, esc) => (count > 1 ? count + ' sessions' : 'session' + (main.project ? ' in project ' + esc(main.project) : '')) +
    ' · ' + plural(steps, 'model step', 'model steps') +
    (main.minutes > 1 && count === 1 ? ' · ' + plural(Math.round(main.minutes), 'minute', 'minutes') : ''),
  sessionsTitle: 'All sessions',
  sessionsIntro: 'Below is the report for the most expensive one. Click a row to see another.',
  cols: { project: 'Project', steps: 'Steps', cost: 'Cost' },
  reading: n => 'Reading ' + plural(n, 'file', 'files') + '…',
  readingOf: (i, n) => 'Reading file ' + i + ' of ' + n + '…',
  noJsonl: '<h3>No Claude Code logs in this folder</h3><p class="small" style="margin-bottom:0">You need the <code>~/.claude/projects/</code> folder or one of the folders inside it: that\'s where the <code>.jsonl</code> files are.</p>',

  // subscriptions: the report shows API prices, while a subscriber pays with their usage limit
  apiNote: 'These are API prices. On a Pro or Max plan you aren\'t charged this on top, but the same work draws down your usage limit — and the same habits burn through it faster.',

  // summary across several sessions
  habitsTitle: 'What repeats from session to session',
  habitsIntro: a => 'We checked ' + plural(a.sessions, 'session', 'sessions') +
    (a.firstTs ? ' ' + period(a.firstTs, a.lastTs) : '') + '. Here are the checks that fired most often, with rough savings across all sessions together.',
  habitCount: (k, n) => 'in ' + k + ' of ' + plural(n, 'session', 'sessions'),
  noHabits: 'No check fired in any session — the money went into the actual work.',
  duplicates: n => 'Identical model responses found in more than one file: ' + n + ' (this happens when a session is continued). Each was counted once.',
  cols2: { when: 'When' },
  moreRows: n => 'Show ' + plural(n, 'more session', 'more sessions'),

  // "Copy summary": no text of your requests and no file names
  copy: 'Copy summary',
  copied: 'Copied',
  shareSession: (s, top, others) => 'I ran my Claude Code session through a cost check: ' + money(s.total) + ' at API prices.\n' +
    (top ? 'Main issue: "' + top.check.name + '"' + (top.saving ? ', could save up to ' + money(top.saving) : '') + '.\n' : 'No obvious leaks.\n') +
    (others.length ? 'Also flagged: ' + others.slice(0, 3).join(', ') + (others.length > 3 ? ' and ' + (others.length - 3) + ' more' : '') + '.\n' : '') +
    'Check yours (the file never leaves your browser): ' + DEMO_URL,
  shareAll: a => 'I ran ' + plural(a.sessions, 'Claude Code session', 'Claude Code sessions') + ' through a cost check: ' + money(a.total) + ' at API prices.\n' +
    (a.habits.length ? 'Most frequent: ' + a.habits.slice(0, 3).map(h => h.check.name + ' (' + (h.warn + h.info) + ' of ' + a.sessions + ')').join(', ') + '.\n' : 'No obvious leaks.\n') +
    'Check yours (files never leave your browser): ' + DEMO_URL,
};

/* ---------- Command-line version (cli.js) ---------- */
const cli = {
  title: 'Why So Expensive — Claude Code log analysis',
  scope: (dir, days) => 'Folder: ' + dir + (days === 1 ? ' · last day' : days ? ' · last ' + days + ' days' : ' · all time'),
  noFolder: dir => 'Folder not found: ' + dir + '.\nPass the log folder: npx github:SergHomka/why-so-expensive-landing <folder>',
  noSessions: days => 'No sessions with usage ' + (days ? 'in the last ' + plural(days, 'day', 'days') : 'at all') + '.' + (days ? ' Try --days 30 or --all.' : ''),
  total: a => money(a.total) + ' — ' + plural(a.sessions, 'session', 'sessions') + ', ' + plural(a.steps, 'model step', 'model steps'),
  projectsTitle: 'By project',
  topTitle: 'Most expensive sessions',
  sessionLine: s => money(s.total) + ' · ' + (s.project || '—') + (s.lastTs ? ' · ' + day(s.lastTs) : '') + ' · ' + nSteps(s.uniqueCount),
  main: 'Main thing: ',
  file: 'File: ',
  more: 'Full report for a session — all ten checks with tips — in your browser:\n  ' + DEMO_URL + '\nDrop the session file there: it never leaves your computer.',
  help:
    'Claude Code log analysis: what your sessions cost and where the money leaked.\n\n' +
    'Usage:\n' +
    '  npx github:SergHomka/why-so-expensive-landing [folder or files] [options]\n\n' +
    'Without a folder we use ~/.claude/projects (or $CLAUDE_CONFIG_DIR/projects).\n\n' +
    'Options:\n' +
    '  --days N    sessions from the last N days (default 7)\n' +
    '  --all       all sessions, no day limit\n' +
    '  --top N     how many of the most expensive sessions to show (default 3)\n' +
    '  --lang ru   Russian text (en for English)\n' +
    '  --json      JSON output — for scripts and other programs\n' +
    '  --help      this help\n\n' +
    'Logs are read only on your computer; nothing is sent over the network.',
};

return {
  lang: 'en', cli: cli, money: money, pct: pct, plural: plural, day: day, nSteps: nSteps,
  groups: groups, checks: checks, rules: rules, calm: calm, sample: sample, ui: ui,
};
});
