/* ============================================================
   Крысиные бега v2 — движок «месяц за месяцем»
   Чистая логика без DOM. Цикл: startMonth → решения игрока →
   endMonth. Никакого кубика: исход зависит от решений.
   ============================================================ */

var GameEngine = (function () {
  'use strict';

  var D = (typeof GameData !== 'undefined') ? GameData : require('./data.js');

  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Game(opts) {
    opts = opts || {};
    this.rng = makeRng(opts.seed != null ? opts.seed : Date.now());
    this.decks = {};
    this.state = null;
  }

  function sum(arr, f) { var t = 0; for (var i = 0; i < arr.length; i++) { t += f(arr[i]); } return t; }

  function drawFrom(game, name, arr, filter) {
    var pool = filter ? arr.filter(filter) : arr;
    if (!pool.length) { return null; }
    var d = game.decks[name];
    if (!d || !d.length) {
      d = pool.map(function (x) { return x.id; });
      for (var i = d.length - 1; i > 0; i--) {
        var j = Math.floor(game.rng() * (i + 1));
        var t = d[i]; d[i] = d[j]; d[j] = t;
      }
      game.decks[name] = d;
    }
    while (d.length) {
      var id = d.pop();
      for (var k = 0; k < pool.length; k++) { if (pool[k].id === id) { return pool[k]; } }
    }
    return pool[Math.floor(game.rng() * pool.length)];
  }

  // ---------- старт ----------
  Game.prototype.start = function (setup) {
    setup = setup || {};
    var expenses = D.START.expenses.map(function (e) {
      var v = setup.expenses && setup.expenses[e.id] != null ? setup.expenses[e.id] : e.amount;
      return { id: e.id, label: e.label, amount: Math.max(0, v) };
    });
    this.state = {
      month: 0,
      salary: setup.salary != null ? Math.max(0, setup.salary) : D.START.salary,
      cash: D.START.cash,
      energy: D.START.energy,
      burnout: false,
      expenses: expenses,
      extraExpenses: [],        // хвосты соблазнов {id,label,amount}
      assets: [],               // {id,title,flow,cost,risk,liquid,stalled}
      debts: [],                // {id,label,principal,pay,rate}
      skills: [],               // в процессе {id,title,monthsLeft,salaryUp}
      network: 0,
      owned: {},                // id купленного (для needs/повторов)
      warnings: [],             // активные {id,...,dueMonth}
      offer: null,              // предложения текущего месяца {opportunities:[],temptation}
      monthClosed: true,
      status: 'playing',        // playing | free | bankrupt | timeup
      freedomMonth: null,
      history: [],
      log: []
    };
    this._log('Старт: ' + D.START.role + ', ' + D.START.place + '. Доход $' + this.state.salary + ', на руках $' + this.state.cash);
    this.startMonth();
    return this.snapshot();
  };

  // ---------- финансы ----------
  Game.prototype.finance = function () {
    var s = this.state;
    var passive = sum(s.assets, function (a) { return a.stalled ? 0 : a.flow; });
    var base = sum(s.expenses, function (e) { return e.amount; }) + sum(s.extraExpenses, function (e) { return e.amount; });
    var debtPay = sum(s.debts, function (d) { return d.pay; });
    var salary = s.burnout ? Math.round(s.salary * (1 - D.RULES.burnoutPenalty)) : s.salary;
    return {
      salary: salary, salaryFull: s.salary, passive: passive,
      expenses: base + debtPay, baseExpenses: base, debtPay: debtPay,
      flow: salary + passive - base - debtPay,
      debtTotal: sum(s.debts, function (d) { return d.principal; }),
      cushionMonths: (base + debtPay) > 0 ? Math.max(0, s.cash) / (base + debtPay) : 0
    };
  };

  // ---------- месяц: открытие ----------
  Game.prototype.startMonth = function () {
    var s = this.state;
    if (s.status !== 'playing') { return; }
    s.month += 1;
    s.monthClosed = false;

    var self = this;
    var opps = [];
    var n = D.RULES.opportunitiesPerMonth + (s.network > 0 && this.rng() < 0.3 * s.network ? 1 : 0);
    for (var i = 0; i < n; i++) {
      var card = drawFrom(this, 'opp', D.OPPORTUNITIES, function (o) {
        if (s.owned[o.id]) { return false; }
        if (o.needs && !s.owned[o.needs]) { return false; }
        return opps.indexOf(o) < 0;
      });
      if (card && opps.indexOf(card) < 0) { opps.push(card); }
    }
    var temptation = this.rng() < D.RULES.temptationChance ? drawFrom(this, 'tmp', D.TEMPTATIONS, function (t) { return !s.owned[t.id]; }) : null;

    // предупреждение (не больше 2 активных)
    if (s.warnings.length < 2 && this.rng() < D.RULES.warningChance) {
      var w = drawFrom(this, 'warn', D.WARNINGS, function (x) {
        if (x.dropAsset && !s.owned[x.dropAsset]) { return false; }
        for (var k = 0; k < s.warnings.length; k++) { if (s.warnings[k].id === x.id) { return false; } }
        return true;
      });
      if (w) {
        s.warnings.push({ id: w.id, title: w.title, desc: w.desc, fixCost: w.fixCost, hitCost: w.hitCost, hitText: w.hitText, lesson: w.lesson, dropAsset: w.dropAsset, dueMonth: s.month + w.delay });
        this._log('⚠️ ' + w.title + ' — можно решить за $' + w.fixCost + ', срок ' + w.delay + ' мес.');
      }
    }

    s.offer = { opportunities: opps, temptation: temptation };
    return this.snapshot();
  };

  // ---------- решения игрока ----------
  Game.prototype.buyOpportunity = function (id) {
    var s = this.state, card = null, i;
    for (i = 0; i < s.offer.opportunities.length; i++) { if (s.offer.opportunities[i].id === id) { card = s.offer.opportunities[i]; } }
    if (!card) { return { ok: false }; }
    if (s.cash < card.cost) { return { ok: false, why: 'не хватает $' + (card.cost - s.cash) }; }
    s.cash -= card.cost;
    s.owned[card.id] = true;
    if (card.network) { s.network += 1; }
    else { s.assets.push({ id: card.id, title: card.title, flow: card.flow, cost: card.cost, risk: card.risk || 0, liquid: !!card.liquid, spec: !!card.spec }); }
    s.offer.opportunities = s.offer.opportunities.filter(function (o) { return o.id !== id; });
    this._log('✅ ' + card.title + ' (−$' + card.cost + (card.flow ? ', +$' + card.flow + '/мес' : '') + ')');
    return { ok: true, lesson: card.lesson };
  };

  Game.prototype.buyTemptation = function () {
    var s = this.state, t = s.offer.temptation;
    if (!t) { return { ok: false }; }
    if (s.cash < t.cost) { return { ok: false, why: 'не хватает денег' }; }
    s.cash -= t.cost;
    s.owned[t.id] = true;
    if (t.addExpense) { s.extraExpenses.push({ id: t.id, label: t.title, amount: t.addExpense }); }
    s.energy = Math.min(100, s.energy + 10);
    s.offer.temptation = null;
    this._log('🛍 ' + t.title + ' (−$' + t.cost + (t.addExpense ? ', и −$' + t.addExpense + '/мес теперь' : '') + ')');
    return { ok: true, lesson: t.lesson };
  };

  Game.prototype.declineTemptation = function () {
    var s = this.state;
    if (!s.offer.temptation) { return { ok: false }; }
    var t = s.offer.temptation;
    s.offer.temptation = null;
    this._log('🙅 Прошёл мимо: ' + t.title);
    return { ok: true, lesson: 'Каждое «нет» соблазну — это «да» будущему потоку.' };
  };

  Game.prototype.fixWarning = function (id) {
    var s = this.state;
    for (var i = 0; i < s.warnings.length; i++) {
      if (s.warnings[i].id === id) {
        var w = s.warnings[i];
        if (s.cash < w.fixCost) { return { ok: false, why: 'не хватает денег' }; }
        s.cash -= w.fixCost;
        s.warnings.splice(i, 1);
        this._log('🔧 Решено вовремя: ' + w.title + ' (−$' + w.fixCost + ')');
        return { ok: true, lesson: w.lesson };
      }
    }
    return { ok: false };
  };

  Game.prototype.learnSkill = function (id) {
    var s = this.state;
    for (var i = 0; i < s.skills.length; i++) { if (s.skills[i].id === id) { return { ok: false, why: 'уже учишь' }; } }
    if (s.owned['skill-' + id]) { return { ok: false, why: 'уже выучено' }; }
    var sk = null;
    for (var k = 0; k < D.SKILLS.length; k++) { if (D.SKILLS[k].id === id) { sk = D.SKILLS[k]; } }
    if (!sk) { return { ok: false }; }
    if (s.cash < sk.cost) { return { ok: false, why: 'не хватает денег' }; }
    s.cash -= sk.cost;
    s.skills.push({ id: sk.id, title: sk.title, monthsLeft: sk.months, salaryUp: sk.salaryUp });
    this._log('📚 Начал: ' + sk.title + ' (−$' + sk.cost + ', +$' + sk.salaryUp + ' к доходу через ' + sk.months + ' мес.)');
    return { ok: true, lesson: sk.lesson };
  };

  Game.prototype.rest = function (kind) {
    var s = this.state;
    var r = kind === 'big' ? D.REST.big : D.REST.small;
    if (s.cash < r.cost) { return { ok: false, why: 'не хватает денег' }; }
    s.cash -= r.cost;
    s.energy = Math.min(100, s.energy + r.energy);
    if (s.energy > 35) { s.burnout = false; }
    this._log('🌊 ' + r.title + ' (−$' + r.cost + ', энергия ' + s.energy + ')');
    return { ok: true, lesson: r.lesson };
  };

  Game.prototype.repayDebt = function (amount) {
    var s = this.state;
    var debt = null;
    for (var i = 0; i < s.debts.length; i++) { if (s.debts[i].rate) { debt = s.debts[i]; break; } }
    if (!debt) { return { ok: false, why: 'долгов нет' }; }
    var pay = Math.min(amount, debt.principal, s.cash);
    if (pay <= 0) { return { ok: false, why: 'нечем платить' }; }
    debt.principal -= pay;
    s.cash -= pay;
    debt.pay = Math.round(debt.principal * D.RULES.loanMinShare);
    if (debt.principal <= 0) { s.debts = s.debts.filter(function (d) { return d !== debt; }); }
    this._log('🏦 Погасил долг на $' + pay + (debt.principal > 0 ? ' (осталось $' + debt.principal + ')' : ' — долг закрыт!'));
    return { ok: true, lesson: 'Долг под 2% в месяц — это минус 24% в год. Гасить его = гарантированная доходность.' };
  };

  Game.prototype.sellAsset = function (id) {
    var s = this.state;
    for (var i = 0; i < s.assets.length; i++) {
      if (s.assets[i].id === id && s.assets[i].liquid) {
        var a = s.assets.splice(i, 1)[0];
        var price = Math.round(a.cost * (0.9 + this.rng() * 0.2));
        s.cash += price;
        delete s.owned[a.id];
        this._log('💵 Продал: ' + a.title + ' (+$' + price + ')');
        return { ok: true, price: price, lesson: 'Ликвидный актив спас кэш за день. Ради этого его и держат.' };
      }
    }
    return { ok: false, why: 'это не продать быстро' };
  };

  // ---------- месяц: закрытие ----------
  Game.prototype.endMonth = function () {
    var s = this.state;
    if (s.status !== 'playing' || s.monthClosed) { return { events: [], snapshot: this.snapshot() }; }
    s.monthClosed = true;
    var events = [];
    var self = this;

    // риск активов: простой в этом месяце
    s.assets.forEach(function (a) {
      var was = a.stalled;
      a.stalled = a.risk > 0 && self.rng() < a.risk;
      if (a.stalled && !was) { events.push({ kind: 'stall', text: a.title + ': в этом месяце без дохода.', lesson: 'Рисковый актив иногда молчит. Несколько разных — молчат не хором.' }); }
    });

    // навыки тикают
    for (var i = s.skills.length - 1; i >= 0; i--) {
      s.skills[i].monthsLeft -= 1;
      if (s.skills[i].monthsLeft <= 0) {
        var sk = s.skills.splice(i, 1)[0];
        s.salary += sk.salaryUp;
        s.owned['skill-' + sk.id] = true;
        events.push({ kind: 'skill', text: sk.title + ' — готово. Доход теперь $' + s.salary + '/мес.', lesson: 'Инвестиция в себя окупается каждый месяц до конца игры.' });
      }
    }

    // просроченные предупреждения бьют
    for (var w = s.warnings.length - 1; w >= 0; w--) {
      if (s.month >= s.warnings[w].dueMonth) {
        var warn = s.warnings.splice(w, 1)[0];
        if (warn.hitCost) { s.cash -= warn.hitCost; }
        if (warn.dropAsset) {
          s.assets = s.assets.filter(function (a) { return a.id !== warn.dropAsset; });
          delete s.owned[warn.dropAsset];
        }
        events.push({ kind: 'hit', text: '💥 ' + warn.hitText + (warn.hitCost ? ' (−$' + warn.hitCost + ')' : ''), lesson: warn.lesson });
        this._log('💥 ' + warn.hitText);
      }
    }

    // случайное событие жизни
    if (this.rng() < D.RULES.lifeEventChance) {
      var ev = drawFrom(this, 'life', D.LIFE_EVENTS);
      if (ev) {
        s.cash -= ev.cost;
        events.push({ kind: ev.cost > 0 ? 'life' : 'luck', text: ev.title + ' (' + (ev.cost > 0 ? '−' : '+') + '$' + Math.abs(ev.cost) + ')', lesson: ev.lesson });
        this._log((ev.cost > 0 ? '⚡ ' : '🍀 ') + ev.title);
      }
    }

    // энергия и выгорание
    s.energy = Math.max(0, s.energy - D.RULES.energyDrop);
    if (s.energy <= 15 && !s.burnout) {
      s.burnout = true;
      events.push({ kind: 'burnout', text: '🥵 Выгорание: работаешь на четверть хуже, доход просел.', lesson: 'Энергия — тоже капитал. Кто не платит за отдых, платит зарплатой.' });
    }

    // начисление потока
    var f = this.finance();
    s.cash += f.flow;
    this._log('📅 Месяц ' + s.month + ': поток ' + (f.flow >= 0 ? '+' : '') + '$' + f.flow + ' → на руках $' + Math.round(s.cash));

    // проценты по долгам
    s.debts.forEach(function (d) {
      if (d.rate) {
        d.principal += Math.round(d.principal * d.rate);
        d.pay = Math.max(d.pay, Math.round(d.principal * D.RULES.loanMinShare));
      }
    });

    // кассовый разрыв → вынужденный займ
    if (s.cash < 0) {
      var need = Math.ceil(-s.cash / 500) * 500;
      var loan = null;
      for (var di = 0; di < s.debts.length; di++) { if (s.debts[di].id === 'loan') { loan = s.debts[di]; } }
      if (!loan) { loan = { id: 'loan', label: 'Вынужденный займ', principal: 0, pay: 0, rate: D.RULES.loanRate }; s.debts.push(loan); }
      loan.principal += need;
      loan.pay = Math.round(loan.principal * D.RULES.loanMinShare);
      s.cash += need;
      events.push({ kind: 'loan', text: 'Денег не хватило — занял $' + need + ' под 2% в месяц.', lesson: 'Кассовый разрыв всегда дороже, чем кажется. Подушка нужна именно для таких месяцев.' });
      this._log('🏦 Вынужденный займ $' + need);
    }

    s.history.push({ month: s.month, cash: Math.round(s.cash), passive: f.passive, expenses: f.expenses });

    // финалы
    var f2 = this.finance();
    if (f2.passive >= f2.expenses && f2.expenses > 0) {
      s.status = 'free'; s.freedomMonth = s.month;
      this._log('🏆 СВОБОДА: пассив $' + f2.passive + ' ≥ расходов $' + f2.expenses);
    } else if (f2.debtTotal > D.RULES.bankruptDebt) {
      s.status = 'bankrupt';
      this._log('💀 Долги перевалили за $' + D.RULES.bankruptDebt);
    } else if (s.month >= D.RULES.maxMonths) {
      s.status = 'timeup';
      this._log('⏳ 30 лет прошло, а поток так и не собран.');
    }

    var snap = this.snapshot();
    if (s.status === 'playing') { this.startMonth(); }
    return { events: events, snapshot: snap };
  };

  Game.prototype._log = function (msg) {
    this.state.log.push({ month: this.state.month, msg: msg });
    if (this.state.log.length > 250) { this.state.log.shift(); }
  };

  Game.prototype.snapshot = function () {
    var s = this.state;
    var f = this.finance();
    return {
      month: s.month, year: Math.floor((s.month - 1) / 12) + 1,
      cash: Math.round(s.cash), energy: s.energy, burnout: s.burnout,
      salary: f.salary, salaryFull: s.salary,
      network: s.network,
      assets: s.assets.slice(), debts: s.debts.slice(), skills: s.skills.slice(),
      extraExpenses: s.extraExpenses.slice(),
      warnings: s.warnings.map(function (w) { return { id: w.id, title: w.title, desc: w.desc, fixCost: w.fixCost, monthsLeft: w.dueMonth - s.month }; }),
      offer: s.offer ? { opportunities: s.offer.opportunities.slice(), temptation: s.offer.temptation } : null,
      status: s.status, freedomMonth: s.freedomMonth,
      finance: f, history: s.history.slice(-120),
      log: s.log.slice(-40)
    };
  };

  return { Game: Game, makeRng: makeRng };
})();

if (typeof module !== 'undefined') { module.exports = GameEngine; }
