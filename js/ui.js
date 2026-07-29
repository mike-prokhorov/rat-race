/* ═══════ UI: рендер доски, фишка, карточки, панель ═══════ */

var GameUI = (function () {
  'use strict';

  var D = GameData;
  var game = null;
  var cells = [];        // DOM клеток по индексу доски
  var busy = false;      // блок кнопок во время анимации

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('ru-RU'); }

  /* ---------- интро: карточки профессий ---------- */
  function renderIntro() {
    var grid = $('prof-grid');
    grid.innerHTML = '';
    D.PROFESSIONS.forEach(function (p, i) {
      var exp = p.taxes + p.otherExpenses + p.mortgage + p.carLoan + p.cardLoan;
      var card = document.createElement('button');
      card.className = 'prof-card';
      card.style.setProperty('--i', i);
      card.innerHTML =
        '<div class="prof-emoji">' + p.emoji + '</div>' +
        '<div class="prof-name">' + p.title + '</div>' +
        '<div class="prof-nums">' +
        '<span>Зарплата <b>' + fmt(p.salary) + '</b></span>' +
        '<span>Расходы <b>' + fmt(exp) + '</b></span>' +
        '<span>На руках <b>' + fmt(p.cash) + '</b></span>' +
        '</div>' +
        '<div class="prof-flow">Кэшфлоу <b>+' + fmt(p.salary - exp) + '</b></div>';
      card.addEventListener('click', function () { startGame(p.id); });
      grid.appendChild(card);
    });
  }

  /* ---------- доска ---------- */
  // 24 клетки по периметру грида 7×7 по часовой с верхнего левого угла
  function cellGridPos(i) {
    if (i <= 6) { return { r: 1, c: i + 1 }; }          // верхний ряд →
    if (i <= 11) { return { r: i - 5, c: 7 }; }          // правая колонка ↓
    if (i <= 18) { return { r: 7, c: 19 - i }; }         // нижний ряд ←
    return { r: 25 - i, c: 1 };                          // левая колонка ↑
  }

  function renderBoard() {
    var board = $('board');
    cells = [];
    D.BOARD.forEach(function (cell, i) {
      var el = document.createElement('div');
      el.className = 'cell type-' + cell.type + (cell.corner ? ' corner' : '');
      var pos = cellGridPos(i);
      el.style.gridRow = pos.r;
      el.style.gridColumn = pos.c;
      el.innerHTML = '<div class="cell-emoji">' + cell.emoji + '</div>' +
                     '<div class="cell-title">' + cell.title + '</div>';
      board.appendChild(el);
      cells.push(el);
    });
  }

  function moveTokenTo(i, instant) {
    var el = cells[i];
    var board = $('board');
    var token = $('token');
    var br = board.getBoundingClientRect();
    var cr = el.getBoundingClientRect();
    token.style.left = (cr.left - br.left + cr.width / 2) + 'px';
    token.style.top = (cr.top - br.top + cr.height / 2) + 'px';
    cells.forEach(function (c) { c.classList.remove('active'); });
    el.classList.add('active');
    if (!instant) {
      token.classList.remove('hop');
      void token.offsetWidth;
      token.classList.add('hop');
    }
  }

  /* ---------- старт ---------- */
  function startGame(profId) {
    game = new GameEngine.Game({});
    game.start(profId);
    $('intro').classList.add('hidden');
    $('game').classList.remove('hidden');
    requestAnimationFrame(function () {
      moveTokenTo(0, true);
      render();
    });
  }

  /* ---------- бросок ---------- */
  function onRoll() {
    if (busy || !game) { return; }
    var r = game.roll();
    if (r.blocked) { return; }
    busy = true;
    $('btn-roll').disabled = true;

    if (r.skipped) {
      $('center-note').textContent = 'Ход пропущен (после увольнения)';
      busy = false; $('btn-roll').disabled = false;
      render();
      return;
    }

    // кубики
    var d1 = $('die1'), d2 = $('die2');
    d1.classList.remove('rolling'); void d1.offsetWidth; d1.classList.add('rolling');
    d1.querySelector('span').textContent = r.dice;
    if (r.dice2 > 0) {
      d2.classList.remove('hidden');
      d2.classList.remove('rolling'); void d2.offsetWidth; d2.classList.add('rolling');
      d2.querySelector('span').textContent = r.dice2;
    } else {
      d2.classList.add('hidden');
    }

    // фишка шагает по клеткам
    var steps = r.dice + r.dice2;
    var cur = r.from;
    var stepN = 0;
    var timer = setInterval(function () {
      stepN++;
      cur = (cur + 1) % D.BOARD.length;
      moveTokenTo(cur);
      if (cur === 0 && stepN < steps) { paydayFlash(); }
      if (stepN >= steps) {
        clearInterval(timer);
        setTimeout(function () { afterLand(r); }, 260);
      }
    }, 170);
  }

  function paydayFlash() {
    var b = $('board');
    b.classList.remove('payday-flash');
    void b.offsetWidth;
    b.classList.add('payday-flash');
  }

  function afterLand(r) {
    busy = false;
    render();
    var snap = game.snapshot();

    if (snap.lost) { showFinale(false, snap); return; }
    if (snap.won) { showFinale(true, snap); return; }

    if (snap.pendingCard) {
      var pc = snap.pendingCard;
      if (pc.type === 'dealChoice') { showDealChoice(); return; }
      if (pc.type === 'charity') { showCharity(); return; }
      if (pc.type === 'marketOffer') { showMarketOffer(pc.card); return; }
    }

    // информационные события клетки
    var ev = null;
    for (var i = 0; i < r.events.length; i++) {
      if (r.events[i].type !== 'payday') { ev = r.events[i]; }
    }
    if (ev && ev.type === 'doodad') { showInfoCard('СОБЛАЗН', ev.card.title, ev.card.desc, [{ k: 'Потрачено', v: fmt(-ev.card.cost) }], true); return; }
    if (ev && ev.type === 'market' && ev.card) { showInfoCard('РЫНОК', ev.card.title, ev.card.desc, [], false); return; }
    if (ev && ev.type === 'downsize') { showInfoCard('УВОЛЬНЕНИЕ', 'Сокращение на работе', 'Оплати полные расходы и пропусти ход. Пассивный доход в такие моменты — лучшая страховка.', [{ k: 'Оплачено', v: fmt(-ev.paid) }], true); return; }
    if (ev && ev.type === 'baby') { showInfoCard('СЕМЬЯ', 'У тебя родился ребёнок!', 'Расходы выросли. Теперь выйти из бегов чуть сложнее — но и мотивации больше.', [{ k: 'Детей', v: String(ev.children) }], false); return; }

    $('btn-roll').disabled = false;
  }

  /* ---------- карточки ---------- */
  function openCard() { $('overlay').classList.remove('hidden'); }
  function closeCard() {
    $('overlay').classList.add('hidden');
    $('btn-roll').disabled = false;
    render();
  }

  function cardBase(tag, title, desc, nums, bad) {
    $('card-tag').textContent = tag;
    $('card-tag').className = 'card-tag' + (bad ? ' tag-bad' : '');
    $('card-title').textContent = title;
    $('card-desc').textContent = desc;
    var numsEl = $('card-nums');
    numsEl.innerHTML = '';
    (nums || []).forEach(function (n) {
      var row = document.createElement('div');
      row.className = 'card-num' + (n.hl ? ' hl' : '');
      row.innerHTML = '<span>' + n.k + '</span><b>' + n.v + '</b>';
      numsEl.appendChild(row);
    });
    $('card-actions').innerHTML = '';
  }

  function addAction(label, cls, fn) {
    var b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    $('card-actions').appendChild(b);
    return b;
  }

  function addErr() {
    var e = document.createElement('div');
    e.className = 'card-err';
    $('card-actions').appendChild(e);
    return e;
  }

  function showInfoCard(tag, title, desc, nums, bad) {
    cardBase(tag, title, desc, nums, bad);
    addAction('Понятно', 'btn-gold', closeCard);
    openCard();
  }

  function showDealChoice() {
    cardBase('СДЕЛКА', 'Какую сделку смотрим?', 'Малые сделки дешёвые: акции и небольшая недвижимость. Крупные требуют капитала, но кэшфлоу у них сильнее.', []);
    addAction('Малая', 'btn-ivory', function () {
      var res = game.chooseDeal('small');
      showDealCard(res.card);
    });
    addAction('Крупная', 'btn-gold', function () {
      var res = game.chooseDeal('big');
      showDealCard(res.card);
    });
    openCard();
  }

  function showDealCard(card) {
    var snap = game.snapshot();
    if (card.kind === 'stock') {
      var divTxt = card.dividend > 0 ? '+$' + card.dividend + '/акция каждый круг' : 'нет';
      cardBase('АКЦИИ', card.title, card.desc, [
        { k: 'Цена за акцию', v: fmt(card.price) },
        { k: 'Исторический диапазон', v: '$' + card.range[0] + '–$' + card.range[1] },
        { k: 'Дивиденды', v: divTxt, hl: card.dividend > 0 },
        { k: 'Твои наличные', v: fmt(snap.cash) }
      ]);
      var err = null;
      [10, 50, 100].forEach(function (q) {
        addAction(q + ' шт (' + fmt(card.price * q) + ')', 'btn-ivory', function () {
          var r = game.buyStock(q);
          if (r.ok) { closeCard(); } else if (err) { err.textContent = r.reason || 'нельзя'; }
        });
      });
      var maxQ = Math.floor(snap.cash / card.price);
      if (maxQ > 0) {
        addAction('Максимум: ' + maxQ + ' шт', 'btn-gold', function () {
          var r = game.buyStock(maxQ);
          if (r.ok) { closeCard(); } else if (err) { err.textContent = r.reason || 'нельзя'; }
        });
      }
      addAction('Пас', 'btn-pass', function () { game.passCard(); closeCard(); });
      err = addErr();
    } else {
      var need = card.kind === 'cd' ? card.price : card.downPay;
      var nums = [];
      if (card.kind !== 'cd') { nums.push({ k: 'Полная цена', v: fmt(card.cost) }); }
      nums.push({ k: card.kind === 'cd' ? 'Вложение' : 'Первый взнос', v: fmt(need) });
      nums.push({ k: 'Кэшфлоу', v: '+' + fmt(card.cashflow || 0) + '/круг', hl: (card.cashflow || 0) > 0 });
      nums.push({ k: 'Твои наличные', v: fmt(snap.cash) });
      cardBase(card.kind === 'biz' ? 'БИЗНЕС' : (card.kind === 'cd' ? 'ДЕПОЗИТ' : 'НЕДВИЖИМОСТЬ'), card.title, card.desc, nums);
      var err2 = null;
      addAction('Купить', 'btn-gold', function () {
        var r = game.buyProperty();
        if (r.ok) { closeCard(); } else if (err2) { err2.textContent = r.reason || 'не хватает денег — возьми кредит и попробуй снова'; }
      });
      addAction('Пас', 'btn-pass', function () { game.passCard(); closeCard(); });
      err2 = addErr();
    }
    openCard();
  }

  function showCharity() {
    var f = game.finance();
    var cost = Math.round(f.totalIncome * D.RULES.charityCost);
    cardBase('БЛАГОТВОРИТЕЛЬНОСТЬ', 'Пожертвовать 10% дохода?', 'Отдаёшь ' + fmt(cost) + ' — следующие ' + D.RULES.charityTurns + ' хода бросаешь два кубика и двигаешься быстрее.', [
      { k: 'Стоимость', v: fmt(cost) },
      { k: 'Бонус', v: '2 кубика × ' + D.RULES.charityTurns + ' хода', hl: true }
    ]);
    addAction('Пожертвовать', 'btn-gold', function () { game.charity(true); closeCard(); });
    addAction('Отказаться', 'btn-pass', function () { game.charity(false); closeCard(); });
    openCard();
  }

  function showMarketOffer(ev) {
    var snap = game.snapshot();
    var isBiz = ev.kind === 'buyer_biz';
    var list = isBiz ? snap.biz : snap.realty;
    cardBase('РЫНОК', ev.title, ev.desc + (list.length ? ' Что продаём?' : ' Но у тебя нет подходящих активов.'), []);
    list.forEach(function (a, i) {
      var price = Math.round(a.cost * (1 + ev.premium));
      var gain = price - (a.cost - a.downPay);
      addAction(a.title + ' → в карман ' + fmt(gain), 'btn-ivory', function () {
        game.sellToOffer(i, isBiz ? 'biz' : 'realty');
        closeCard();
      });
    });
    addAction(list.length ? 'Ничего не продавать' : 'Понятно', 'btn-pass', function () {
      game.declineOffer();
      closeCard();
    });
    openCard();
  }

  /* ---------- банк ---------- */
  function onLoan() {
    var amount = prompt('Сколько взять? Кратно $1000. Платёж 10% от долга каждый payday.', '5000');
    if (!amount) { return; }
    var r = game.takeLoan(parseInt(amount, 10) || 0);
    if (!r.ok) { alert(r.reason || 'Нельзя'); }
    render();
  }
  function onRepay() {
    var snap = game.snapshot();
    if (snap.loan <= 0) { return; }
    var amount = prompt('Сколько погасить? Кратно $1000. Долг: ' + fmt(snap.loan), String(Math.min(snap.loan, Math.floor(snap.cash / 1000) * 1000)));
    if (!amount) { return; }
    var r = game.repayLoan(parseInt(amount, 10) || 0);
    if (!r.ok) { alert(r.reason || 'Нельзя'); }
    render();
  }

  /* ---------- продажа акций из панели ---------- */
  function sellStockUI(key) {
    var snap = game.snapshot();
    var st = snap.stocks[key];
    if (!st) { return; }
    var mid = st.avgPrice || 10;
    var price = prompt('Продать ' + key + ' (' + st.qty + ' шт). По какой цене за акцию? Средняя покупка: $' + st.avgPrice, String(mid));
    if (!price) { return; }
    var qty = prompt('Сколько штук продать? (макс ' + st.qty + ')', String(st.qty));
    if (!qty) { return; }
    game.sellStock(key, Math.min(parseInt(qty, 10) || 0, st.qty), Math.max(1, parseInt(price, 10) || 0));
    render();
  }

  /* ---------- финал ---------- */
  function showFinale(won, snap) {
    $('finale').classList.remove('hidden');
    $('finale-emoji').textContent = won ? '🏆' : '💀';
    $('finale-title').textContent = won ? 'ТЫ ВЫШЕЛ ИЗ КРЫСИНЫХ БЕГОВ' : 'БАНКРОТСТВО';
    $('finale-sub').textContent = won
      ? 'Пассивный доход ' + fmt(snap.finance.passive) + ' перекрыл расходы ' + fmt(snap.finance.expenses) +
        '. Ходов: ' + snap.turn + ', кругов: ' + snap.laps + '. Деньги теперь работают на тебя.'
      : 'Наличные ушли в минус, активов не осталось. Урок: подушка безопасности и активы важнее статусных трат. Попробуй ещё раз!';
  }

  /* ---------- рендер панели ---------- */
  var lastCash = null;
  function render() {
    if (!game) { return; }
    var s = game.snapshot();
    var f = s.finance;

    $('p-prof').textContent = s.prof.emoji + ' ' + s.prof.title;
    $('p-turn').textContent = 'ход ' + s.turn;

    var cashEl = $('f-cash');
    cashEl.textContent = fmt(s.cash);
    if (lastCash !== null && lastCash !== s.cash) {
      cashEl.classList.remove('bump'); void cashEl.offsetWidth; cashEl.classList.add('bump');
    }
    lastCash = s.cash;

    $('f-salary').textContent = fmt(f.salary);
    $('f-passive').textContent = fmt(f.passive);
    $('f-exp').textContent = fmt(f.expenses);
    $('f-flow').textContent = (f.cashflow >= 0 ? '+' : '') + fmt(f.cashflow);
    $('f-flow').style.color = f.cashflow >= 0 ? 'var(--gain)' : 'var(--loss)';
    $('f-loan').textContent = fmt(s.loan) + (s.loan > 0 ? ' (−' + fmt(f.loanPayment) + ')' : '');
    $('f-children').textContent = 'детей: ' + s.children;
    $('f-laps').textContent = 'кругов: ' + s.laps;

    // прогресс выхода
    var pct = f.expenses > 0 ? Math.min(100, Math.round(f.passive / f.expenses * 100)) : 0;
    $('escape-pct').textContent = pct + '%';
    $('escape-fill').style.width = pct + '%';
    $('escape-passive').textContent = fmt(f.passive) + ' пассивно';
    $('escape-exp').textContent = 'из ' + fmt(f.expenses) + ' расходов';

    // активы
    var list = $('assets-list');
    list.innerHTML = '';
    var any = false;
    s.realty.concat(s.biz).concat(s.cds).forEach(function (a) {
      any = true;
      var el = document.createElement('div');
      el.className = 'asset';
      el.innerHTML = '<span class="asset-name">' + a.title + '</span>' +
                     '<span class="asset-flow">+' + fmt(a.cashflow) + '</span>';
      list.appendChild(el);
    });
    Object.keys(s.stocks).forEach(function (k) {
      any = true;
      var st = s.stocks[k];
      var el = document.createElement('div');
      el.className = 'asset';
      el.innerHTML = '<span class="asset-name">📊 ' + k + ' <span class="asset-sub">' + st.qty + ' шт · ср. $' + st.avgPrice + '</span></span>';
      var btn = document.createElement('button');
      btn.textContent = 'продать';
      btn.addEventListener('click', function () { sellStockUI(k); });
      el.appendChild(btn);
      list.appendChild(el);
    });
    if (!any) { list.innerHTML = '<div class="assets-empty">пока пусто — покупай то, что приносит кэшфлоу</div>'; }

    // лог (новые сверху)
    var logEl = $('gamelog');
    logEl.innerHTML = '';
    s.log.slice().reverse().forEach(function (l) {
      var d = document.createElement('div');
      d.textContent = l.msg;
      logEl.appendChild(d);
    });

    // подсказка в центре
    if (s.charityTurns > 0) { $('center-note').textContent = '🤲 Бонус: два кубика ещё ' + s.charityTurns + ' х.'; }
    else if (s.skipTurns > 0) { $('center-note').textContent = '⏸ Пропуск ходов: ' + s.skipTurns; }
    else if (f.cashflow < 0) { $('center-note').textContent = '⚠️ Кэшфлоу в минусе — гаси кредит или наращивай пассивный доход'; }
    else { $('center-note').textContent = ''; }
  }

  /* ---------- init ---------- */
  function init() {
    renderIntro();
    renderBoard();
    $('btn-roll').addEventListener('click', onRoll);
    $('btn-loan').addEventListener('click', onLoan);
    $('btn-repay').addEventListener('click', onRepay);
    $('btn-restart').addEventListener('click', function () { location.reload(); });
    window.addEventListener('resize', function () {
      if (game) { moveTokenTo(game.snapshot().pos, true); }
    });
  }

  return { init: init };
})();
