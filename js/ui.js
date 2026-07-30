/* ═══════ UI v2: сетап, месяц, карточки, панель, график ═══════ */

var GameUI = (function () {
  'use strict';

  var D = GameData;
  var game = null;

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('ru-RU'); }
  function el(cls, html) { var d = document.createElement('div'); d.className = cls; if (html) { d.innerHTML = html; } return d; }

  /* ---------- сетап ---------- */
  function renderSetup() {
    var box = $('setup-expenses');
    box.innerHTML = '';
    D.START.expenses.forEach(function (e) {
      var row = document.createElement('label');
      row.className = 'setup-row';
      row.innerHTML = '<span>' + e.label + '</span>';
      var inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.step = '10';
      inp.value = e.amount; inp.dataset.id = e.id;
      inp.addEventListener('input', updateSetupSummary);
      row.appendChild(inp);
      box.appendChild(row);
    });
    $('inp-salary').addEventListener('input', updateSetupSummary);
    updateSetupSummary();
  }

  function readSetup() {
    var expenses = {};
    var inputs = $('setup-expenses').querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      expenses[inputs[i].dataset.id] = Math.max(0, Number(inputs[i].value) || 0);
    }
    return { salary: Math.max(0, Number($('inp-salary').value) || 0), expenses: expenses };
  }

  function updateSetupSummary() {
    var s = readSetup();
    var exp = 0;
    Object.keys(s.expenses).forEach(function (k) { exp += s.expenses[k]; });
    $('sum-income').textContent = fmt(s.salary);
    $('sum-exp').textContent = fmt(exp);
    var flow = s.salary - exp;
    $('sum-flow').textContent = (flow >= 0 ? '+' : '') + fmt(flow);
    $('sum-flow').style.color = flow >= 0 ? 'var(--gain)' : 'var(--loss)';
  }

  /* ---------- старт ---------- */
  function startGame() {
    game = new GameEngine.Game({});
    game.start(readSetup());
    $('intro').classList.add('hidden');
    $('game').classList.remove('hidden');
    render();
  }

  /* ---------- трек года ---------- */
  function renderTrack(snap) {
    var track = $('year-track');
    track.innerHTML = '';
    var inYear = ((snap.month - 1) % 12);
    for (var i = 0; i < 12; i++) {
      var c = el('yt-cell' + (i < inYear ? ' done' : ''));
      track.appendChild(c);
    }
    var token = el('yt-token');
    token.textContent = '🐭';
    token.style.left = 'calc(' + (inYear / 12 * 100) + '% + 2px)';
    track.appendChild(token);
    $('m-num').textContent = 'Месяц ' + snap.month;
    $('m-year').textContent = snap.year + '-й год из 30';
  }

  /* ---------- карточки месяца ---------- */
  function renderCards(snap) {
    var flow = $('cards-flow');
    flow.innerHTML = '';
    var any = false;

    snap.warnings.forEach(function (w) {
      any = true;
      var c = el('mcard warn');
      c.appendChild(el('mcard-tag', '⚠️ предупреждение'));
      c.appendChild(el('mcard-title', w.title));
      c.appendChild(el('mcard-desc', w.desc + ' Если тянуть — будет сильно дороже.'));
      var nums = el('mcard-nums');
      nums.appendChild(el('mcard-num', '<span>Решить сейчас</span><b>' + fmt(w.fixCost) + '</b>'));
      nums.appendChild(el('mcard-num', '<span>Осталось месяцев</span><b>' + w.monthsLeft + '</b>'));
      c.appendChild(nums);
      var acts = el('mcard-acts');
      var b = document.createElement('button');
      b.className = 'btn btn-gold'; b.textContent = 'Решить за ' + fmt(w.fixCost);
      var err = el('mcard-err');
      b.addEventListener('click', function () {
        var r = game.fixWarning(w.id);
        if (r.ok) { showLesson('РЕШЕНО', w.title, r.lesson); } else { err.textContent = r.why || 'нельзя'; }
      });
      acts.appendChild(b);
      c.appendChild(acts);
      c.appendChild(err);
      flow.appendChild(c);
    });

    (snap.offer ? snap.offer.opportunities : []).forEach(function (o) {
      any = true;
      var c = el('mcard');
      var tag = o.network ? 'связи' : (o.spec ? 'ставка' : (o.liquid ? 'бумаги' : 'поток'));
      c.appendChild(el('mcard-tag', tag));
      c.appendChild(el('mcard-title', o.title));
      c.appendChild(el('mcard-desc', o.desc));
      var nums = el('mcard-nums');
      nums.appendChild(el('mcard-num', '<span>Цена</span><b>' + fmt(o.cost) + '</b>'));
      if (o.flow) {
        nums.appendChild(el('mcard-num hl', '<span>Поток</span><b>+' + fmt(o.flow) + '/мес</b>'));
        nums.appendChild(el('mcard-num', '<span>Окупаемость</span><b>' + Math.round(o.cost / o.flow) + ' мес</b>'));
      }
      if (o.risk) { nums.appendChild(el('mcard-num', '<span>Риск простоя</span><b>' + Math.round(o.risk * 100) + '%/мес</b>')); }
      c.appendChild(nums);
      var acts = el('mcard-acts');
      var b = document.createElement('button');
      b.className = 'btn btn-gold'; b.textContent = 'Взять';
      var err = el('mcard-err');
      b.addEventListener('click', function () {
        var r = game.buyOpportunity(o.id);
        if (r.ok) { showLesson('КУПЛЕНО', o.title, r.lesson); } else { err.textContent = r.why || 'нельзя'; }
      });
      acts.appendChild(b);
      c.appendChild(acts);
      c.appendChild(err);
      flow.appendChild(c);
    });

    if (snap.offer && snap.offer.temptation) {
      any = true;
      var t = snap.offer.temptation;
      var c2 = el('mcard');
      c2.appendChild(el('mcard-tag', 'хочется'));
      c2.appendChild(el('mcard-title', t.title));
      c2.appendChild(el('mcard-desc', t.desc));
      var nums2 = el('mcard-nums');
      nums2.appendChild(el('mcard-num', '<span>Цена</span><b>' + fmt(t.cost) + '</b>'));
      if (t.addExpense) { nums2.appendChild(el('mcard-num', '<span>Платёж дальше</span><b>' + fmt(t.addExpense) + '/мес</b>')); }
      c2.appendChild(nums2);
      var acts2 = el('mcard-acts');
      var bBuy = document.createElement('button');
      bBuy.className = 'btn btn-ivory'; bBuy.textContent = 'Купить';
      var bNo = document.createElement('button');
      bNo.className = 'btn btn-pass'; bNo.textContent = 'Пройти мимо';
      var err2 = el('mcard-err');
      bBuy.addEventListener('click', function () {
        var r = game.buyTemptation();
        if (r.ok) { showLesson('КУПЛЕНО', t.title, r.lesson); } else { err2.textContent = r.why || 'нельзя'; }
      });
      bNo.addEventListener('click', function () {
        var r = game.declineTemptation();
        showLesson('МИМО', t.title, r.lesson);
      });
      acts2.appendChild(bBuy); acts2.appendChild(bNo);
      c2.appendChild(acts2);
      c2.appendChild(err2);
      flow.appendChild(c2);
    }

    if (!any) { flow.appendChild(el('cards-empty', 'Тихий месяц. Реши, куда направить свободные деньги — и живи дальше.')); }
  }

  /* ---------- модалки ---------- */
  function openCard() { $('overlay').classList.remove('hidden'); }
  function closeCard() { $('overlay').classList.add('hidden'); render(); }

  function cardBase(tag, title, desc) {
    $('card-tag').textContent = tag;
    $('card-tag').className = 'card-tag';
    $('card-title').textContent = title;
    $('card-desc').textContent = desc || '';
    $('card-nums').innerHTML = '';
    $('card-actions').innerHTML = '';
  }

  function addAction(label, cls, fn) {
    var b = document.createElement('button');
    b.className = 'btn ' + cls; b.textContent = label;
    b.addEventListener('click', fn);
    $('card-actions').appendChild(b);
    return b;
  }

  function showLesson(tag, title, lesson) {
    cardBase(tag, title, '');
    if (lesson) { $('card-nums').appendChild(el('lesson', lesson)); }
    addAction('Дальше', 'btn-gold', closeCard);
    openCard();
  }

  function showMonthResults(events) {
    if (!events.length) { render(); return; }
    cardBase('ИТОГИ МЕСЯЦА', 'Пока месяц шёл…', '');
    var box = $('card-nums');
    events.forEach(function (e) {
      box.appendChild(el('mcard-num', '<span style="text-align:left">' + e.text + '</span>'));
      if (e.lesson) { box.appendChild(el('lesson', e.lesson)); }
    });
    addAction('Дальше', 'btn-gold', function () {
      var snap = game.snapshot();
      if (snap.status !== 'playing') { closeCard(); showFinale(snap); } else { closeCard(); }
    });
    openCard();
  }

  function showSkills() {
    var snap = game.snapshot();
    cardBase('НАВЫКИ', 'Вложить в себя', 'Зарплата растёт навсегда — но платишь сейчас, а ждёшь месяцы.');
    var box = $('card-nums');
    D.SKILLS.forEach(function (sk) {
      var learning = snap.skills.some(function (x) { return x.id === sk.id; });
      var done = game.state.owned['skill-' + sk.id];
      var row = el('mcard-num', '<span>' + sk.title + (done ? ' ✅' : (learning ? ' ⏳' : '')) + '</span><b>' + fmt(sk.cost) + ' → +' + fmt(sk.salaryUp) + '/мес</b>');
      box.appendChild(row);
      if (!learning && !done) {
        var b = document.createElement('button');
        b.className = 'btn btn-ivory'; b.style.marginBottom = '8px';
        b.textContent = 'Учить: ' + sk.title + ' (' + sk.months + ' мес)';
        b.addEventListener('click', function () {
          var r = game.learnSkill(sk.id);
          if (r.ok) { showLesson('УЧИШЬСЯ', sk.title, r.lesson); }
          else { b.textContent = r.why || 'нельзя'; }
        });
        box.appendChild(b);
      }
    });
    addAction('Закрыть', 'btn-pass', closeCard);
    openCard();
  }

  function showRest() {
    var snap = game.snapshot();
    cardBase('ОТДЫХ', 'Энергия: ' + snap.energy + '%', 'Без энергии доход падает. Отдых — часть системы, не слабость.');
    var box = $('card-nums');
    [D.REST.small, D.REST.big].forEach(function (r) {
      var b = document.createElement('button');
      b.className = 'btn btn-ivory'; b.style.marginBottom = '8px';
      b.textContent = r.title + ' — ' + fmt(r.cost) + ' (+' + r.energy + ' энергии)';
      b.addEventListener('click', function () {
        var res = game.rest(r === D.REST.big ? 'big' : 'small');
        if (res.ok) { showLesson('ОТДОХНУЛ', r.title, res.lesson); } else { b.textContent = res.why; }
      });
      box.appendChild(b);
    });
    addAction('Закрыть', 'btn-pass', closeCard);
    openCard();
  }

  function showDebt() {
    var snap = game.snapshot();
    cardBase('ДОЛГИ', snap.finance.debtTotal > 0 ? 'Тело долга: ' + fmt(snap.finance.debtTotal) : 'Долгов нет', snap.finance.debtTotal > 0 ? 'Каждый месяц долг растёт на 2%. Гасить = гарантированно богатеть.' : 'Так держать. Займ появляется, когда кэш уходит в минус.');
    if (snap.finance.debtTotal > 0) {
      var box = $('card-nums');
      [500, 1000, 2000].forEach(function (amt) {
        if (amt <= snap.cash) {
          var b = document.createElement('button');
          b.className = 'btn btn-ivory'; b.style.marginBottom = '8px';
          b.textContent = 'Погасить ' + fmt(amt);
          b.addEventListener('click', function () {
            var r = game.repayDebt(amt);
            if (r.ok) { showLesson('ПОГАШЕНО', fmt(amt), r.lesson); }
          });
          box.appendChild(b);
        }
      });
      if (snap.cash > 0) {
        var bAll = document.createElement('button');
        bAll.className = 'btn btn-gold';
        var maxPay = Math.min(snap.cash, snap.finance.debtTotal);
        bAll.textContent = 'Погасить максимум: ' + fmt(maxPay);
        bAll.addEventListener('click', function () {
          var r = game.repayDebt(maxPay);
          if (r.ok) { showLesson('ПОГАШЕНО', fmt(maxPay), r.lesson); }
        });
        $('card-nums').appendChild(bAll);
      }
    }
    addAction('Закрыть', 'btn-pass', closeCard);
    openCard();
  }

  /* ---------- финал ---------- */
  function showFinale(snap) {
    $('finale').classList.remove('hidden');
    var f = snap.finance;
    if (snap.status === 'free') {
      $('finale-emoji').textContent = '🏆';
      $('finale-title').textContent = 'СВОБОДА';
      $('finale-sub').textContent = 'Пассивный доход ' + fmt(f.passive) + ' перекрыл расходы ' + fmt(f.expenses) + ' за ' +
        snap.freedomMonth + ' месяцев (' + Math.round(snap.freedomMonth / 12 * 10) / 10 + ' лет). Теперь работа — по желанию.';
    } else if (snap.status === 'bankrupt') {
      $('finale-emoji').textContent = '💀';
      $('finale-title').textContent = 'ДОЛГИ ДОГНАЛИ';
      $('finale-sub').textContent = 'Проценты обогнали поток. Урок: кассовые разрывы закрывают подушкой, а не займами. Попробуй ещё раз — теперь ты знаешь.';
    } else {
      $('finale-emoji').textContent = '⏳';
      $('finale-title').textContent = 'ТРИДЦАТЬ ЛЕТ В БЕГАХ';
      $('finale-sub').textContent = 'Жизнь прошла в работе. Кэш был, поток — нет. Деньги без активов — это просто отложенная зарплата.';
    }
  }

  /* ---------- график ---------- */
  function renderChart(snap) {
    var svg = $('chart');
    var h = snap.history;
    if (h.length < 2) { svg.innerHTML = ''; return; }
    var W = 300, H = 80, pad = 4;
    var maxV = 1;
    h.forEach(function (p) { maxV = Math.max(maxV, p.passive, p.expenses); });
    function pts(key) {
      return h.map(function (p, i) {
        var x = pad + (W - 2 * pad) * i / (h.length - 1);
        var y = H - pad - (H - 2 * pad) * (p[key] / maxV);
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
    }
    svg.innerHTML =
      '<polyline points="' + pts('expenses') + '" fill="none" stroke="#c96a4e" stroke-width="1.5" opacity="0.85"/>' +
      '<polyline points="' + pts('passive') + '" fill="none" stroke="#d4af6a" stroke-width="2"/>';
  }

  /* ---------- панель ---------- */
  var lastCash = null;
  function render() {
    if (!game) { return; }
    var snap = game.snapshot();
    var f = snap.finance;

    renderTrack(snap);
    renderCards(snap);
    renderChart(snap);

    var cashEl = $('f-cash');
    cashEl.textContent = fmt(snap.cash);
    if (lastCash !== null && lastCash !== snap.cash) {
      cashEl.classList.remove('bump'); void cashEl.offsetWidth; cashEl.classList.add('bump');
    }
    lastCash = snap.cash;

    $('f-salary').textContent = fmt(f.salary) + (snap.burnout ? ' 🥵' : '');
    $('f-passive').textContent = fmt(f.passive);
    $('f-exp').textContent = fmt(f.expenses);
    $('f-flow').textContent = (f.flow >= 0 ? '+' : '') + fmt(f.flow);
    $('f-flow').style.color = f.flow >= 0 ? 'var(--gain)' : 'var(--loss)';
    $('f-debt').textContent = fmt(f.debtTotal);
    $('p-cushion').textContent = 'запас: ' + (Math.round(f.cushionMonths * 10) / 10) + ' мес';

    var pct = f.expenses > 0 ? Math.min(100, Math.round(f.passive / f.expenses * 100)) : 0;
    $('escape-pct').textContent = pct + '%';
    $('escape-fill').style.width = pct + '%';
    $('escape-passive').textContent = fmt(f.passive) + ' пассивно';
    $('escape-exp').textContent = 'из ' + fmt(f.expenses) + ' расходов';

    $('energy-pct').textContent = snap.energy + '%';
    var ef = $('energy-fill');
    ef.style.width = snap.energy + '%';
    ef.className = 'energy-fill' + (snap.energy <= 30 ? ' low' : '');
    $('burnout-note').classList.toggle('hidden', !snap.burnout);

    var list = $('assets-list');
    list.innerHTML = '';
    if (!snap.assets.length && !snap.skills.length) {
      list.innerHTML = '<div class="assets-empty">пока пусто — покупай то, что приносит поток</div>';
    }
    snap.assets.forEach(function (a) {
      var elA = el('asset');
      elA.innerHTML = '<span class="asset-name">' + a.title + (a.stalled ? ' <span class="asset-sub">простой</span>' : '') + '</span>' +
        '<span class="asset-flow">' + (a.flow ? '+' + fmt(a.flow) : '—') + '</span>';
      if (a.liquid) {
        var b = document.createElement('button');
        b.textContent = 'продать';
        b.addEventListener('click', function () {
          var r = game.sellAsset(a.id);
          if (r.ok) { showLesson('ПРОДАНО', a.title, r.lesson); }
        });
        elA.appendChild(b);
      }
      list.appendChild(elA);
    });
    snap.skills.forEach(function (sk) {
      list.appendChild(el('asset', '<span class="asset-name">📚 ' + sk.title + '</span><span class="asset-sub">через ' + sk.monthsLeft + ' мес</span>'));
    });

    var logEl = $('gamelog');
    logEl.innerHTML = '';
    snap.log.slice().reverse().forEach(function (l) {
      var d = document.createElement('div');
      d.textContent = l.msg;
      logEl.appendChild(d);
    });
  }

  /* ---------- init ---------- */
  function init() {
    renderSetup();
    $('btn-start').addEventListener('click', startGame);
    $('btn-month').addEventListener('click', function () {
      if (!game || game.state.status !== 'playing') { return; }
      var r = game.endMonth();
      render();
      if (r.events.length) { showMonthResults(r.events); }
      else if (game.state.status !== 'playing') { showFinale(game.snapshot()); }
    });
    $('btn-skills').addEventListener('click', showSkills);
    $('btn-rest').addEventListener('click', showRest);
    $('btn-debt').addEventListener('click', showDebt);
    $('btn-restart').addEventListener('click', function () { location.reload(); });
  }

  return { init: init };
})();
