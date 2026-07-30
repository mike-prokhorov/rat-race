/* Валидатор колод: уникальность id, обязательные поля, рамки баланса, NaN.
   Запуск: node test/validate.js */
'use strict';

var D = require('../js/data.js');
var errs = [];
var ids = {};

function uniq(x, deck) {
  if (ids[x.id]) { errs.push('ДУБЛЬ id ' + x.id + ' (' + deck + ')'); }
  ids[x.id] = true;
}
function num(x, field, min, max, ctx) {
  var v = x[field];
  if (typeof v !== 'number' || isNaN(v)) { errs.push(ctx + ' ' + x.id + ': ' + field + ' не число'); return false; }
  if (v < min || v > max) { errs.push(ctx + ' ' + x.id + ': ' + field + '=' + v + ' вне [' + min + ',' + max + ']'); return false; }
  return true;
}
function str(x, field, ctx) {
  if (typeof x[field] !== 'string' || !x[field].length) { errs.push(ctx + ' ' + x.id + ': нет ' + field); }
}

D.OPPORTUNITIES.forEach(function (o) {
  uniq(o, 'opp');
  str(o, 'title', 'opp'); str(o, 'lesson', 'opp');
  num(o, 'cost', 100, 50000, 'opp');
  if (o.flow) {
    num(o, 'flow', 1, 3000, 'opp');
    var payback = o.cost / o.flow;
    // цепочки (needs) и рисковые карточки могут окупаться быстрее — это награда за риск/развитие
    var minPb = (o.needs || (o.risk && o.risk >= 0.3)) ? 3 : 8;
    if (payback < minPb || payback > 140) { errs.push('opp ' + o.id + ': окупаемость ' + Math.round(payback) + ' мес вне [' + minPb + ',140]'); }
  }
  if (o.risk != null) { num(o, 'risk', 0.05, 0.5, 'opp'); }
});
D.TEMPTATIONS.forEach(function (t) {
  uniq(t, 'tmp');
  str(t, 'title', 'tmp'); str(t, 'lesson', 'tmp');
  num(t, 'cost', 20, 5000, 'tmp');
  if (t.addExpense != null) { num(t, 'addExpense', 10, 400, 'tmp'); }
});
D.WARNINGS.forEach(function (w) {
  uniq(w, 'warn');
  str(w, 'title', 'warn'); str(w, 'lesson', 'warn'); str(w, 'hitText', 'warn');
  num(w, 'fixCost', 20, 400, 'warn');
  num(w, 'delay', 2, 4, 'warn');
  if (w.hitCost) { num(w, 'hitCost', 100, 2500, 'warn'); }
});
D.LIFE_EVENTS.forEach(function (e) {
  uniq(e, 'event');
  str(e, 'title', 'event'); str(e, 'lesson', 'event');
  num(e, 'cost', -1500, 1500, 'event');
});
D.SKILLS.forEach(function (s) {
  uniq(s, 'skill');
  str(s, 'title', 'skill'); str(s, 'lesson', 'skill');
  num(s, 'cost', 100, 2000, 'skill');
  num(s, 'months', 1, 8, 'skill');
  num(s, 'salaryUp', 50, 800, 'skill');
});

console.log('Колоды: возможности ' + D.OPPORTUNITIES.length +
  ' · соблазны ' + D.TEMPTATIONS.length +
  ' · предупреждения ' + D.WARNINGS.length +
  ' · события ' + D.LIFE_EVENTS.length +
  ' · навыки ' + D.SKILLS.length);
if (errs.length) {
  errs.slice(0, 25).forEach(function (e) { console.error('  ✗ ' + e); });
  if (errs.length > 25) { console.error('  … и ещё ' + (errs.length - 25)); }
  console.log('ОШИБОК: ' + errs.length + ' — FAIL');
  process.exit(1);
}
console.log('Валидация: OK');
