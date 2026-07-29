/* ============================================================
   Крысиные бега — игровой движок
   Чистая логика без DOM: гоняется и в браузере, и в node
   Все методы возвращают события для UI, состояние иммутабельно
   наружу не отдаётся (только снапшоты)
   ============================================================ */

var GameEngine = (function () {
  'use strict';

  var D = (typeof GameData !== 'undefined') ? GameData : require('./data.js');

  // ---------- утилиты ----------
  function makeRng(seed) {
    // mulberry32 — детерминированный rng для тестов
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  function Game(opts) {
    opts = opts || {};
    this.rng = makeRng(opts.seed != null ? opts.seed : Date.now());
    this.state = null;
  }

  // ---------- старт ----------
  Game.prototype.start = function (professionId) {
    var prof = null;
    for (var i = 0; i < D.PROFESSIONS.length; i++) {
      if (D.PROFESSIONS[i].id === professionId) { prof = D.PROFESSIONS[i]; }
    }
    if (!prof) { throw new Error('Профессия не найдена: ' + professionId); }

    this.state = {
      prof: prof,
      pos: 0,
      cash: prof.cash,
      loan: 0,                 // кредит банка (тело)
      children: 0,
      charityTurns: 0,
      skipTurns: 0,
      turn: 0,
      laps: 0,
      stocks: {},              // id -> {qty, avgPrice, dividend, title}
      realty: [],              // {id,title,cost,downPay,cashflow,kind}
      biz: [],
      cds: [],
      pendingCard: null,       // текущая карточка, ждущая решения
      won: false,
      lost: false,
      log: []
    };
    this._log('Старт: ' + prof.title + ', на руках $' + prof.cash);
    return this.snapshot();
  };

  // ---------- финансовый отчёт ----------
  Game.prototype.finance = function () {
    var s = this.state, p = s.prof;
    var passive = 0, i;
    for (i = 0; i < s.realty.length; i++) { passive += s.realty[i].cashflow; }
    for (i = 0; i < s.biz.length; i++) { passive += s.biz[i].cashflow; }
    for (i = 0; i < s.cds.length; i++) { passive += s.cds[i].cashflow; }
    var divs = 0;
    Object.keys(s.stocks).forEach(function (k) {
      divs += s.stocks[k].qty * (s.stocks[k].dividend || 0);
    });
    passive += divs;

    var expenses = p.taxes + p.otherExpenses + p.mortgage + p.carLoan + p.cardLoan
      + s.children * p.perChildCost
      + Math.round(s.loan * D.RULES.loanRate);

    return {
      salary: p.salary,
      passive: passive,
      totalIncome: p.salary + passive,
      expenses: expenses,
      cashflow: p.salary + passive - expenses,
      loanPayment: Math.round(s.loan * D.RULES.loanRate)
    };
  };

  Game.prototype._checkWin = function () {
    var f = this.finance();
    if (f.passive > f.expenses && !this.state.won) {
      this.state.won = true;
      this._log('🏆 ПОБЕДА! Пассивный доход $' + f.passive + ' > расходов $' + f.expenses);
      return true;
    }
    return false;
  };

  // ---------- ход ----------
  Game.prototype.roll = function () {
    var s = this.state;
    if (s.won || s.lost) { return { blocked: true }; }
    if (s.pendingCard) { return { blocked: true, reason: 'card' }; }

    if (s.skipTurns > 0) {
      s.skipTurns--;
      s.turn++;
      this._log('⏸ Пропуск хода (осталось ' + s.skipTurns + ')');
      return { skipped: true, snapshot: this.snapshot() };
    }

    var dice = 1 + Math.floor(this.rng() * 6);
    var dice2 = 0;
    if (s.charityTurns > 0) {
      dice2 = 1 + Math.floor(this.rng() * 6);
      s.charityTurns--;
      // игрок двигается на сумму двух кубиков (бонус благотворительности)
    }
    var stepsTotal = dice + dice2;
    var from = s.pos;
    var to = (from + stepsTotal) % D.BOARD.length;
    var passedStart = (from + stepsTotal) >= D.BOARD.length;

    s.pos = to;
    s.turn++;

    var events = [];
    if (passedStart) {
      s.laps++;
      var pay = this._payday();
      events.push({ type: 'payday', amount: pay });
    }

    var cell = D.BOARD[to];
    var cellEvent = this._landOn(cell);
    if (cellEvent) { events.push(cellEvent); }

    return {
      dice: dice, dice2: dice2, from: from, to: to,
      passedStart: passedStart, cell: cell, events: events,
      snapshot: this.snapshot()
    };
  };

  Game.prototype._payday = function () {
    var f = this.finance();
    this.state.cash += f.cashflow;
    this._log('💰 Payday: ' + (f.cashflow >= 0 ? '+' : '') + '$' + f.cashflow +
      ' (доход ' + f.totalIncome + ' − расходы ' + f.expenses + ')');
    this._checkBankrupt();
    return f.cashflow;
  };

  // ---------- клетки ----------
  Game.prototype._landOn = function (cell) {
    var s = this.state;
    switch (cell.type) {
      case 'payday': {
        var pay = this._payday();
        return { type: 'payday', amount: pay, corner: true };
      }
      case 'deal': {
        // игрок выбирает: малая или крупная
        s.pendingCard = { type: 'dealChoice' };
        return { type: 'dealChoice' };
      }
      case 'doodad': {
        var dd = pick(this.rng, D.DOODADS);
        s.cash -= dd.cost;
        this._log('🛍 Соблазн: ' + dd.title + ' −$' + dd.cost);
        this._checkBankrupt();
        return { type: 'doodad', card: dd };
      }
      case 'market': {
        var ev = pick(this.rng, D.MARKET_EVENTS);
        return this._applyMarket(ev);
      }
      case 'charity': {
        s.pendingCard = { type: 'charity' };
        return { type: 'charity' };
      }
      case 'baby': {
        if (s.children < D.RULES.maxChildren) {
          s.children++;
          this._log('👶 Ребёнок! Теперь ' + s.children + '. Расходы выросли на $' + s.prof.perChildCost);
        } else {
          this._log('👶 Клетка «Ребёнок», но лимит достигнут');
        }
        return { type: 'baby', children: s.children };
      }
      case 'downsize': {
        var f = this.finance();
        s.cash -= f.expenses * D.RULES.downsizePayFactor;
        s.skipTurns = D.RULES.downsizeSkip;
        this._log('📉 Увольнение: −$' + f.expenses + ' и пропуск ' + D.RULES.downsizeSkip + ' ходов');
        this._checkBankrupt();
        return { type: 'downsize', paid: f.expenses };
      }
    }
    return null;
  };

  // ---------- сделки ----------
  Game.prototype.chooseDeal = function (size) {
    var s = this.state;
    if (!s.pendingCard || s.pendingCard.type !== 'dealChoice') { return null; }
    var deck = size === 'big' ? D.BIG_DEALS : D.SMALL_DEALS;
    var card = pick(this.rng, deck);
    s.pendingCard = { type: 'deal', size: size, card: card };
    this._log('📄 Открыта ' + (size === 'big' ? 'крупная' : 'малая') + ' сделка: ' + card.title);
    return { card: card, size: size };
  };

  Game.prototype.buyStock = function (qty) {
    var s = this.state;
    var pc = s.pendingCard;
    if (!pc || pc.type !== 'deal' || pc.card.kind !== 'stock') { return { ok: false }; }
    var card = pc.card;
    var total = card.price * qty;
    if (qty <= 0 || total > s.cash) { return { ok: false, reason: 'денег не хватает' }; }
    var key = card.id.replace(/\d+$/, ''); // OK4U2 -> OK4U
    if (!s.stocks[key]) { s.stocks[key] = { qty: 0, avgPrice: 0, dividend: card.dividend || 0, title: key }; }
    var st = s.stocks[key];
    st.avgPrice = Math.round((st.avgPrice * st.qty + total) / (st.qty + qty));
    st.qty += qty;
    s.cash -= total;
    s.pendingCard = null;
    this._log('📊 Куплено ' + qty + ' акций ' + key + ' по $' + card.price + ' (−$' + total + ')');
    this._checkWin();
    return { ok: true };
  };

  Game.prototype.buyProperty = function () {
    var s = this.state;
    var pc = s.pendingCard;
    if (!pc || pc.type !== 'deal') { return { ok: false }; }
    var card = pc.card;
    if (card.kind === 'stock') { return { ok: false }; }
    var need = card.kind === 'cd' ? card.price : card.downPay;
    if (need > s.cash) { return { ok: false, reason: 'не хватает $' + (need - s.cash) }; }
    s.cash -= need;
    var asset = {
      id: card.id, title: card.title, kind: card.kind,
      cost: card.cost || card.price, downPay: need, cashflow: card.cashflow || 0
    };
    if (card.kind === 'realty') { s.realty.push(asset); }
    else if (card.kind === 'biz') { s.biz.push(asset); }
    else { s.cds.push(asset); }
    s.pendingCard = null;
    this._log('🏠 Куплено: ' + card.title + ' (взнос $' + need + ', кэшфлоу +$' + (card.cashflow || 0) + '/круг)');
    this._checkWin();
    return { ok: true };
  };

  Game.prototype.passCard = function () {
    var s = this.state;
    if (!s.pendingCard) { return { ok: false }; }
    this._log('↩️ Пас: карточка отложена');
    s.pendingCard = null;
    return { ok: true };
  };

  // ---------- благотворительность ----------
  Game.prototype.charity = function (accept) {
    var s = this.state;
    if (!s.pendingCard || s.pendingCard.type !== 'charity') { return { ok: false }; }
    s.pendingCard = null;
    if (!accept) { this._log('🤲 Благотворительность: отказ'); return { ok: true, accepted: false }; }
    var f = this.finance();
    var cost = Math.round(f.totalIncome * D.RULES.charityCost);
    if (cost > s.cash) { this._log('🤲 Хотел пожертвовать, но нечем'); return { ok: false, reason: 'нет денег' }; }
    s.cash -= cost;
    s.charityTurns = D.RULES.charityTurns;
    this._log('🤲 Пожертвовано $' + cost + ' → 2 кубика на ' + D.RULES.charityTurns + ' хода');
    return { ok: true, accepted: true, cost: cost };
  };

  // ---------- рынок ----------
  Game.prototype._applyMarket = function (ev) {
    var s = this.state;
    switch (ev.kind) {
      case 'stock_crash':
      case 'stock_rally': {
        var f = ev.factor;
        Object.keys(s.stocks).forEach(function (k) {
          s.stocks[k].lastFactor = f;
        });
        s.marketFactor = f;
        this._log('📈 ' + ev.title + ': цены акций ×' + f);
        return { type: 'market', card: ev };
      }
      case 'stock_split': {
        var key = ev.stock;
        if (s.stocks[key] && s.stocks[key].qty > 0) {
          s.stocks[key].qty *= 2;
          s.stocks[key].avgPrice = Math.round(s.stocks[key].avgPrice / 2);
          this._log('📈 Сплит ' + key + ': акций теперь ' + s.stocks[key].qty);
        } else {
          this._log('📈 Сплит ' + key + ', но у тебя их нет');
        }
        return { type: 'market', card: ev };
      }
      case 'rent_up': {
        for (var i = 0; i < s.realty.length; i++) {
          s.realty[i].cashflow = Math.round(s.realty[i].cashflow * ev.factor);
        }
        this._log('📈 Аренда подорожала: кэшфлоу недвижимости +10%');
        this._checkWin();
        return { type: 'market', card: ev };
      }
      case 'tax_refund': {
        s.cash += ev.cash;
        this._log('📈 Налоговый вычет: +$' + ev.cash);
        return { type: 'market', card: ev };
      }
      case 'buyer_realty':
      case 'buyer_biz': {
        // предложение продажи — игрок решает через sellAsset
        s.pendingCard = { type: 'marketOffer', card: ev };
        this._log('📈 ' + ev.title + ' — есть предложение о продаже');
        return { type: 'marketOffer', card: ev };
      }
    }
    return { type: 'market', card: ev };
  };

  Game.prototype.sellToOffer = function (assetIndex, listName) {
    var s = this.state;
    var pc = s.pendingCard;
    if (!pc || pc.type !== 'marketOffer') { return { ok: false }; }
    var ev = pc.card;
    var list = listName === 'biz' ? s.biz : s.realty;
    var asset = list[assetIndex];
    if (!asset) { return { ok: false }; }
    var price = Math.round(asset.cost * (1 + ev.premium));
    var mortgage = asset.cost - asset.downPay;      // остаток «ипотеки» актива
    var gain = price - (asset.kind === 'cd' ? 0 : mortgage);
    list.splice(assetIndex, 1);
    s.cash += gain;
    s.pendingCard = null;
    this._log('💵 Продано: ' + asset.title + ' за $' + price + ' (в карман $' + gain + ')');
    return { ok: true, gain: gain };
  };

  Game.prototype.declineOffer = function () {
    var s = this.state;
    if (!s.pendingCard || s.pendingCard.type !== 'marketOffer') { return { ok: false }; }
    s.pendingCard = null;
    this._log('↩️ Предложение рынка отклонено');
    return { ok: true };
  };

  // ---------- акции: продажа в любой момент ----------
  Game.prototype.sellStock = function (key, qty, price) {
    var s = this.state;
    var st = s.stocks[key];
    if (!st || st.qty < qty || qty <= 0) { return { ok: false }; }
    var gain = qty * price;
    st.qty -= qty;
    if (st.qty === 0) { delete s.stocks[key]; }
    s.cash += gain;
    this._log('📊 Продано ' + qty + ' акций ' + key + ' по $' + price + ' (+$' + gain + ')');
    return { ok: true, gain: gain };
  };

  // ---------- банк ----------
  Game.prototype.takeLoan = function (amount) {
    var s = this.state;
    if (amount <= 0 || amount % D.RULES.loanStep !== 0) { return { ok: false, reason: 'кратно $1000' }; }
    s.loan += amount;
    s.cash += amount;
    this._log('🏦 Кредит +$' + amount + ' (тело долга $' + s.loan + ', платёж $' + Math.round(s.loan * D.RULES.loanRate) + '/payday)');
    return { ok: true };
  };

  Game.prototype.repayLoan = function (amount) {
    var s = this.state;
    if (amount <= 0 || amount % D.RULES.loanStep !== 0) { return { ok: false, reason: 'кратно $1000' }; }
    if (amount > s.loan) { amount = s.loan; }
    if (amount > s.cash) { return { ok: false, reason: 'не хватает наличных' }; }
    s.loan -= amount;
    s.cash -= amount;
    this._log('🏦 Кредит погашен на $' + amount + ' (остаток $' + s.loan + ')');
    this._checkWin();
    return { ok: true };
  };

  // ---------- банкротство ----------
  Game.prototype._checkBankrupt = function () {
    var s = this.state;
    if (s.cash >= 0) { return; }
    // авто-спасение: попробовать кредит
    var need = Math.ceil(-s.cash / D.RULES.loanStep) * D.RULES.loanStep;
    var f = this.finance();
    // кредит доступен, пока платёж по нему не съедает весь кэшфлоу
    var futurePayment = Math.round((s.loan + need) * D.RULES.loanRate);
    var wouldFlow = f.salary + f.passive - (f.expenses - f.loanPayment) - futurePayment;
    if (wouldFlow > 0) {
      s.loan += need;
      s.cash += need;
      this._log('🏦 Авто-кредит на $' + need + ' чтобы закрыть минус');
      return;
    }
    // продать активы? если нечего — проигрыш
    if (s.realty.length === 0 && s.biz.length === 0 && s.cds.length === 0 && Object.keys(s.stocks).length === 0) {
      s.lost = true;
      this._log('💀 Банкротство: наличные ушли в минус, активов нет');
    } else {
      this._log('⚠️ Минус на счету! Продай активы или возьми кредит');
    }
  };

  // ---------- разное ----------
  Game.prototype._log = function (msg) {
    this.state.log.push({ turn: this.state.turn, msg: msg });
    if (this.state.log.length > 200) { this.state.log.shift(); }
  };

  Game.prototype.snapshot = function () {
    var s = this.state;
    var f = this.finance();
    return {
      pos: s.pos, cash: s.cash, loan: s.loan, children: s.children,
      charityTurns: s.charityTurns, skipTurns: s.skipTurns,
      turn: s.turn, laps: s.laps,
      stocks: JSON.parse(JSON.stringify(s.stocks)),
      realty: s.realty.slice(), biz: s.biz.slice(), cds: s.cds.slice(),
      pendingCard: s.pendingCard ? JSON.parse(JSON.stringify(s.pendingCard)) : null,
      won: s.won, lost: s.lost,
      finance: f,
      prof: { id: s.prof.id, title: s.prof.title, emoji: s.prof.emoji },
      log: s.log.slice(-30)
    };
  };

  return { Game: Game, makeRng: makeRng };
})();

if (typeof module !== 'undefined') { module.exports = GameEngine; }
