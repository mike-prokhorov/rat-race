/* Смоук-тест движка: бот играет N партий каждой профессией.
   Проверяем: нет крашей, нет NaN, победа достижима, банкрот работает.
   Запуск: node test/smoke.js */
'use strict';

var D = require('../js/data.js');
var E = require('../js/engine.js');

var GAMES_PER_PROF = 125; // 8 профессий × 125 = 1000 партий
var MAX_TURNS = 600;

var stats = { games: 0, wins: 0, losses: 0, timeouts: 0, crashes: 0, minTurnsToWin: 1e9, sumWinTurns: 0 };
var perProf = {};

function assertNum(x, label, g) {
  if (typeof x !== 'number' || isNaN(x)) {
    throw new Error('NaN/не число: ' + label + ' = ' + x + ' (ход ' + g.state.turn + ')');
  }
}

function botDecide(g) {
  // простая жадная стратегия: покупаем всё что даёт кэшфлоу и по карману,
  // акции берём если дивидендные и дешёвые, офферы рынка принимаем
  var s = g.state;
  var pc = s.pendingCard;
  if (!pc) { return; }
  if (pc.type === 'dealChoice') {
    var size = s.cash > 15000 ? 'big' : 'small';
    g.chooseDeal(size);
    pc = s.pendingCard;
  }
  if (pc && pc.type === 'deal') {
    var card = pc.card;
    if (card.kind === 'stock') {
      if (card.dividend > 0 && s.cash > card.price * 50) {
        var qty = Math.floor((s.cash * 0.5) / card.price);
        if (qty > 0) { g.buyStock(qty); } else { g.passCard(); }
      } else { g.passCard(); }
    } else {
      var need = card.kind === 'cd' ? card.price : card.downPay;
      if ((card.cashflow || 0) > 0 && need <= s.cash * 0.8) { g.buyProperty(); }
      else { g.passCard(); }
    }
  } else if (pc && pc.type === 'charity') {
    g.charity(s.cash > 3000);
  } else if (pc && pc.type === 'marketOffer') {
    var ev = pc.card;
    var list = ev.kind === 'buyer_biz' ? s.biz : s.realty;
    if (list.length > 0) { g.sellToOffer(0, ev.kind === 'buyer_biz' ? 'biz' : 'realty'); }
    else { g.declineOffer(); }
  }
}

for (var p = 0; p < D.PROFESSIONS.length; p++) {
  var prof = D.PROFESSIONS[p];
  perProf[prof.id] = { wins: 0, losses: 0, timeouts: 0 };
  for (var gi = 0; gi < GAMES_PER_PROF; gi++) {
    stats.games++;
    try {
      var g = new E.Game({ seed: p * 100000 + gi });
      g.start(prof.id);
      var t = 0;
      while (t++ < MAX_TURNS) {
        var r = g.roll();
        if (r.blocked && r.reason === 'card') { botDecide(g); continue; }
        botDecide(g);
        var f = g.finance();
        assertNum(g.state.cash, 'cash', g);
        assertNum(f.cashflow, 'cashflow', g);
        assertNum(f.passive, 'passive', g);
        if (g.state.pos < 0 || g.state.pos >= D.BOARD.length) {
          throw new Error('Позиция вне доски: ' + g.state.pos);
        }
        if (g.state.won) {
          stats.wins++; perProf[prof.id].wins++;
          stats.sumWinTurns += g.state.turn;
          if (g.state.turn < stats.minTurnsToWin) { stats.minTurnsToWin = g.state.turn; }
          break;
        }
        if (g.state.lost) { stats.losses++; perProf[prof.id].losses++; break; }
      }
      if (t >= MAX_TURNS && !g.state.won && !g.state.lost) {
        stats.timeouts++; perProf[prof.id].timeouts++;
      }
    } catch (e) {
      stats.crashes++;
      console.error('CRASH [' + prof.id + ' #' + gi + ']: ' + e.message);
      if (stats.crashes > 5) { process.exit(1); }
    }
  }
}

console.log('=== СМОУК-ТЕСТ ===');
console.log('Партий: ' + stats.games);
console.log('Побед: ' + stats.wins + ' (' + Math.round(stats.wins / stats.games * 100) + '%)');
console.log('Банкротств: ' + stats.losses);
console.log('Таймаутов (600 ходов без исхода): ' + stats.timeouts);
console.log('Крашей: ' + stats.crashes);
if (stats.wins > 0) {
  console.log('Быстрейшая победа: ' + stats.minTurnsToWin + ' ходов, средняя: ' + Math.round(stats.sumWinTurns / stats.wins));
}
console.log('--- по профессиям ---');
Object.keys(perProf).forEach(function (k) {
  var s = perProf[k];
  console.log('  ' + k + ': W' + s.wins + ' / L' + s.losses + ' / T' + s.timeouts);
});

var ok = stats.crashes === 0 && stats.wins > 0 && stats.games === D.PROFESSIONS.length * GAMES_PER_PROF;
console.log(ok ? 'RESULT: OK' : 'RESULT: FAIL');
process.exit(ok ? 0 : 1);
