/* Смоук v2: три стратегии бота × N партий.
   Инвестор должен выходить на свободу, транжира — нет. 0 крашей, 0 NaN.
   Запуск: node test/smoke.js */
'use strict';

var D = require('../js/data.js');
var E = require('../js/engine.js');

var N = 400; // партий на стратегию
var stats = {};

function assertNum(x, label, m) {
  if (typeof x !== 'number' || isNaN(x)) { throw new Error('NaN: ' + label + ' (месяц ' + m + ')'); }
}

var strategies = {
  // транжира: покупает все соблазны, игнорит предупреждения, активы не берёт
  spender: function (g) {
    var s = g.state;
    if (s.offer.temptation && s.cash >= s.offer.temptation.cost) { g.buyTemptation(); }
  },
  // инвестор: чинит предупреждения, держит подушку 3 мес, покупает поток, отдыхает, гасит долги
  investor: function (g) {
    var s = g.state, f = g.finance();
    var cushion = f.expenses * 3;
    s.warnings.slice().forEach(function (w) { g.fixWarning(w.id); });
    if (s.energy < 30) { g.rest(s.cash > cushion + 700 ? 'big' : 'small'); }
    if (f.debtTotal > 0 && s.cash > cushion + 1000) { g.repayDebt(Math.floor((s.cash - cushion) / 500) * 500); }
    if (s.offer.temptation) { g.declineTemptation(); }
    // покупаем лучший доступный поток, оставляя подушку
    var best = null, score = 0;
    s.offer.opportunities.forEach(function (o) {
      var sc = o.network ? 40 : (o.flow || 0) / Math.max(1, o.cost) * 1000 * (1 - (o.risk || 0));
      if (o.cost <= s.cash - cushion && sc > score) { best = o; score = sc; }
    });
    if (best) { g.buyOpportunity(best.id); }
    // учим навык в начале игры
    if (s.month < 24 && !s.skills.length && s.cash > cushion + 800) {
      for (var i = 0; i < D.SKILLS.length; i++) {
        if (!s.owned['skill-' + D.SKILLS[i].id]) { g.learnSkill(D.SKILLS[i].id); break; }
      }
    }
    // кэш в минус не ушёл, но подушка пробита и есть ликвидное — продать
    if (s.cash < f.expenses && s.assets.some(function (a) { return a.liquid; })) {
      var liq = s.assets.filter(function (a) { return a.liquid; })[0];
      g.sellAsset(liq.id);
    }
  },
  // рандом: 50/50 решения
  random: function (g) {
    var s = g.state;
    if (s.offer.temptation) { (g.rng() < 0.5 ? g.buyTemptation() : g.declineTemptation()); }
    s.warnings.slice().forEach(function (w) { if (g.rng() < 0.5) { g.fixWarning(w.id); } });
    s.offer.opportunities.slice().forEach(function (o) { if (g.rng() < 0.4 && s.cash >= o.cost) { g.buyOpportunity(o.id); } });
    if (s.energy < 25 && g.rng() < 0.6) { g.rest('small'); }
  }
};

var crashes = 0;
Object.keys(strategies).forEach(function (name) {
  var st = { free: 0, bankrupt: 0, timeup: 0, sumFreeMonth: 0 };
  for (var gi = 0; gi < N; gi++) {
    try {
      var g = new E.Game({ seed: gi * 7 + name.length * 1000 });
      g.start({});
      var guard = 0;
      while (g.state.status === 'playing' && guard++ < 400) {
        strategies[name](g);
        var r = g.endMonth();
        var f = g.finance();
        assertNum(g.state.cash, 'cash', g.state.month);
        assertNum(f.flow, 'flow', g.state.month);
        assertNum(f.passive, 'passive', g.state.month);
      }
      var out = g.state.status === 'playing' ? 'timeup' : g.state.status;
      st[out] = (st[out] || 0) + 1;
      if (out === 'free') { st.sumFreeMonth += g.state.freedomMonth; }
    } catch (e) {
      crashes++;
      console.error('CRASH [' + name + ' #' + gi + ']: ' + e.message);
      if (crashes > 5) { process.exit(1); }
    }
  }
  var med = st.free ? Math.round(st.sumFreeMonth / st.free) : 0;
  console.log(name + ': свобода ' + st.free + '/' + N + ' (' + Math.round(st.free / N * 100) + '%)' +
    ' · банкрот ' + (st.bankrupt || 0) + ' · 30 лет ' + (st.timeup || 0) +
    (med ? ' · средний выход: ' + med + ' мес (' + Math.round(med / 12) + ' лет)' : ''));
  stats[name] = st;
});

var ok = crashes === 0 &&
  stats.investor.free / N > 0.6 &&           // умная игра приводит к свободе
  (stats.spender.free || 0) / N < 0.1 &&     // транжирство — нет
  stats.investor.free > (stats.random.free || 0); // решения важнее случайности
console.log('Крашей: ' + crashes);
console.log(ok ? 'RESULT: OK' : 'RESULT: FAIL');
process.exit(ok ? 0 : 1);
