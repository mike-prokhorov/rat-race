/* ============================================================
   Крысиные бега — данные игры
   Профессии, клетки доски, колоды сделок/соблазнов/рынка
   Баланс близок к оригинальному Cashflow 101 (упрощён)
   ============================================================ */

var GameData = (function () {
  'use strict';

  // ---- Профессии (оригинальный баланс Cashflow, округлён) ----
  var PROFESSIONS = [
    {
      id: 'janitor', title: 'Дворник', emoji: '🧹',
      salary: 1600, taxes: 280, otherExpenses: 570,
      mortgage: 200, carLoan: 60, cardLoan: 60,
      liabilities: { mortgage: 20000, carLoan: 4000, cardLoan: 3000 },
      perChildCost: 70, cash: 560
    },
    {
      id: 'nurse', title: 'Медсестра', emoji: '💉',
      salary: 3100, taxes: 600, otherExpenses: 1000,
      mortgage: 400, carLoan: 100, cardLoan: 90,
      liabilities: { mortgage: 47000, carLoan: 5000, cardLoan: 4000 },
      perChildCost: 170, cash: 480
    },
    {
      id: 'teacher', title: 'Учитель', emoji: '📚',
      salary: 3300, taxes: 630, otherExpenses: 1090,
      mortgage: 500, carLoan: 100, cardLoan: 90,
      liabilities: { mortgage: 50000, carLoan: 5000, cardLoan: 4000 },
      perChildCost: 180, cash: 400
    },
    {
      id: 'engineer', title: 'Инженер', emoji: '⚙️',
      salary: 4900, taxes: 1050, otherExpenses: 1650,
      mortgage: 700, carLoan: 140, cardLoan: 120,
      liabilities: { mortgage: 75000, carLoan: 7000, cardLoan: 5000 },
      perChildCost: 250, cash: 400
    },
    {
      id: 'manager', title: 'Менеджер', emoji: '💼',
      salary: 4600, taxes: 910, otherExpenses: 1500,
      mortgage: 700, carLoan: 120, cardLoan: 100,
      liabilities: { mortgage: 75000, carLoan: 6000, cardLoan: 4000 },
      perChildCost: 240, cash: 400
    },
    {
      id: 'lawyer', title: 'Юрист', emoji: '⚖️',
      salary: 7500, taxes: 1830, otherExpenses: 2210,
      mortgage: 1100, carLoan: 220, cardLoan: 180,
      liabilities: { mortgage: 115000, carLoan: 11000, cardLoan: 7000 },
      perChildCost: 380, cash: 400
    },
    {
      id: 'pilot', title: 'Пилот', emoji: '✈️',
      salary: 9500, taxes: 2350, otherExpenses: 2900,
      mortgage: 1330, carLoan: 300, cardLoan: 660,
      liabilities: { mortgage: 143000, carLoan: 15000, cardLoan: 22000 },
      perChildCost: 480, cash: 400
    },
    {
      id: 'doctor', title: 'Врач', emoji: '🩺',
      salary: 13200, taxes: 3420, otherExpenses: 4650,
      mortgage: 1900, carLoan: 380, cardLoan: 270,
      liabilities: { mortgage: 202000, carLoan: 19000, cardLoan: 10000 },
      perChildCost: 640, cash: 400
    }
  ];

  // ---- Доска: 24 клетки по периметру, 4 угла ----
  // Порядок обхода по часовой, индекс 0 = угол «Зарплата»
  var BOARD = [
    { type: 'payday',  title: 'Зарплата',      emoji: '💰', corner: true },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' },
    { type: 'doodad',  title: 'Соблазн',       emoji: '🛍' },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' },
    { type: 'market',  title: 'Рынок',         emoji: '📈' },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' },
    { type: 'charity', title: 'Благотвор.',    emoji: '🤲', corner: true },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' },
    { type: 'doodad',  title: 'Соблазн',       emoji: '🛍' },
    { type: 'baby',    title: 'Ребёнок',       emoji: '👶' },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' },
    { type: 'doodad',  title: 'Соблазн',       emoji: '🛍' },
    { type: 'market',  title: 'Рынок',         emoji: '📈', corner: true },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' },
    { type: 'doodad',  title: 'Соблазн',       emoji: '🛍' },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' },
    { type: 'market',  title: 'Рынок',         emoji: '📈' },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' },
    { type: 'downsize', title: 'Увольнение',   emoji: '📉', corner: true },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' },
    { type: 'doodad',  title: 'Соблазн',       emoji: '🛍' },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' },
    { type: 'market',  title: 'Рынок',         emoji: '📈' },
    { type: 'deal',    title: 'Сделка',        emoji: '📄' }
  ];

  // ---- Малые сделки ----
  // kind: stock | realty | cd
  var SMALL_DEALS = [
    { kind: 'stock', id: 'OK4U', title: 'Акции OK4U', desc: 'Телеком-гигант. Дивидендов нет, волатильность высокая.', price: 10, range: [5, 40], dividend: 0 },
    { kind: 'stock', id: 'OK4U2', title: 'Акции OK4U', desc: 'Просадка после отчёта. Дивидендов нет.', price: 5, range: [5, 40], dividend: 0 },
    { kind: 'stock', id: 'MYT4U', title: 'Акции MYT4U', desc: 'Производитель электрокаров. Хайп.', price: 30, range: [10, 40], dividend: 0 },
    { kind: 'stock', id: 'MYT4U2', title: 'Акции MYT4U', desc: 'Коррекция рынка, страх в новостях.', price: 10, range: [10, 40], dividend: 0 },
    { kind: 'stock', id: 'GRO4US', title: 'Фонд GRO4US', desc: 'Дивидендный фонд. Платит $1 на акцию каждый круг.', price: 20, range: [10, 30], dividend: 1 },
    { kind: 'stock', id: '2BIG', title: 'Фонд 2BIG', desc: 'Дивидендный REIT. Платит $1 на акцию каждый круг.', price: 25, range: [15, 35], dividend: 1 },
    { kind: 'cd', id: 'CD5', title: 'Депозит (CD)', desc: 'Сертификат на $5 000 под 4% годовых. Надёжно, но медленно.', price: 5000, cashflow: 20 },
    { kind: 'realty', id: 'condo1', title: 'Студия 28 м²', desc: 'Хозяин срочно уезжает. Сдача в аренду покроет ипотеку с плюсом.', cost: 45000, downPay: 5000, cashflow: 140 },
    { kind: 'realty', id: 'condo2', title: 'Квартира 1+1', desc: 'Банк продаёт залоговую. Ниже рынка на 15%.', cost: 52000, downPay: 4000, cashflow: 160 },
    { kind: 'realty', id: 'condo3', title: 'Студия у метро', desc: 'Аренда стабильная, жильцы уже внутри.', cost: 40000, downPay: 3000, cashflow: 100 },
    { kind: 'realty', id: 'condo4', title: 'Комната-студия', desc: 'Дёшево и сердито. Косметика за свой счёт.', cost: 30000, downPay: 2000, cashflow: 80 },
    { kind: 'realty', id: 'land9', title: 'Участок 10 соток', desc: 'Земля на окраине. Дохода нет — ставка на рост.', cost: 9000, downPay: 9000, cashflow: 0 }
  ];

  // ---- Крупные сделки ----
  var BIG_DEALS = [
    { kind: 'realty', id: 'duplex1', title: 'Дуплекс', desc: 'Две квартиры под сдачу, район растёт.', cost: 110000, downPay: 12000, cashflow: 320 },
    { kind: 'realty', id: 'four1', title: 'Дом на 4 квартиры', desc: 'Полностью заселён, управляющий на месте.', cost: 180000, downPay: 16000, cashflow: 480 },
    { kind: 'realty', id: 'eight1', title: 'Дом на 8 квартир', desc: 'Хозяин устал, продаёт с дисконтом.', cost: 320000, downPay: 32000, cashflow: 1100 },
    { kind: 'realty', id: 'mini1', title: 'Мини-склад', desc: '20 боксов самохранения у трассы.', cost: 150000, downPay: 20000, cashflow: 600 },
    { kind: 'biz', id: 'laundry', title: 'Прачечная', desc: 'Автоматы работают сами, обслуживание раз в неделю.', cost: 60000, downPay: 15000, cashflow: 450 },
    { kind: 'biz', id: 'carwash', title: 'Автомойка', desc: 'Самообслуживание, аренда земли включена.', cost: 120000, downPay: 25000, cashflow: 800 },
    { kind: 'biz', id: 'pizza', title: 'Доля в пиццерии', desc: 'Франшиза, управляет партнёр. Ты — пассивный инвестор.', cost: 90000, downPay: 18000, cashflow: 500 },
    { kind: 'biz', id: 'vending', title: 'Сеть вендинга', desc: '12 кофейных автоматов в бизнес-центрах.', cost: 40000, downPay: 10000, cashflow: 300 }
  ];

  // ---- Соблазны (обязательные траты) ----
  var DOODADS = [
    { title: 'Новый смартфон', desc: 'Вышел новый флагман. Старый «уже не тот».', cost: 600 },
    { title: 'Отпуск у моря', desc: 'Горящий тур. Ты заслужил, правда?', cost: 1200 },
    { title: 'Ужин в ресторане', desc: 'Юбилей у друга, неудобно отказаться.', cost: 150 },
    { title: 'Абонемент в фитнес', desc: 'С понедельника — новая жизнь. Оплата за год.', cost: 300 },
    { title: 'Ремонт машины', desc: 'Загорелся чек. Сюрприз.', cost: 800 },
    { title: 'Новые кроссовки', desc: 'Лимитированная коллаборация.', cost: 180 },
    { title: 'Приставка', desc: 'Все друзья уже играют.', cost: 400 },
    { title: 'Кофе навынос', desc: 'Мелочь? За месяц набежало.', cost: 60 },
    { title: 'Стоматолог', desc: 'Дотянул до боли. Теперь дороже.', cost: 900 },
    { title: 'Свадьба у родни', desc: 'Конверт + костюм + перелёт.', cost: 1000 },
    { title: 'Большой телевизор', desc: 'Чёрная пятница! Скидка 40%!', cost: 700 },
    { title: 'Курс «успешный успех»', desc: 'Марафон желаний от блогера.', cost: 350 }
  ];

  // ---- События рынка ----
  var MARKET_EVENTS = [
    { kind: 'buyer_realty', title: 'Покупатель на жильё', desc: 'Инвестор скупает малые квартиры. Даёт цену покупки +30%.', premium: 0.3, target: 'realty_small' },
    { kind: 'buyer_realty', title: 'Горячий рынок', desc: 'Риелтор предлагает продать любую твою недвижимость за цену покупки +50%.', premium: 0.5, target: 'realty_any' },
    { kind: 'buyer_biz', title: 'Покупатель на бизнес', desc: 'Сеть выкупает малый бизнес: цена покупки +40%.', premium: 0.4, target: 'biz' },
    { kind: 'stock_split', title: 'Сплит акций', desc: 'Акции MYT4U дробятся 2 к 1 — у тебя вдвое больше акций.', stock: 'MYT4U' },
    { kind: 'stock_crash', title: 'Обвал рынка', desc: 'Паника! Все акции падают вдвое. У кого кэш — тот на коне.', factor: 0.5 },
    { kind: 'stock_rally', title: 'Ралли рынка', desc: 'Все акции удваиваются. Продавать или держать?', factor: 2 },
    { kind: 'rent_up', title: 'Аренда дорожает', desc: 'Спрос на съём вырос: +10% к кэшфлоу твоей недвижимости.', factor: 1.1 },
    { kind: 'tax_refund', title: 'Налоговый вычет', desc: 'Государство вернуло переплату.', cash: 800 }
  ];

  // ---- Константы ----
  var RULES = {
    loanStep: 1000,          // кредит берётся кратно этой сумме
    loanRate: 0.10,          // 10% от тела кредита каждый payday
    charityCost: 0.10,       // 10% совокупного дохода
    charityTurns: 3,         // сколько ходов действует бонус
    downsizePayFactor: 1,    // увольнение: оплатить 1× полных расходов
    downsizeSkip: 1,         // и пропустить 1 ход
    maxChildren: 3,
    startCashBonus: 0        // резерв
  };

  return {
    PROFESSIONS: PROFESSIONS,
    BOARD: BOARD,
    SMALL_DEALS: SMALL_DEALS,
    BIG_DEALS: BIG_DEALS,
    DOODADS: DOODADS,
    MARKET_EVENTS: MARKET_EVENTS,
    RULES: RULES
  };
})();

if (typeof module !== 'undefined') { module.exports = GameData; }
