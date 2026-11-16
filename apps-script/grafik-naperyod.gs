/**
 * Параплан — график наперёд и заказы клиентов (отдельный скрипт, основной не трогает).
 * Продавцы записываются на будущие смены из мини-приложения в Кэпе.
 * На ЗП это НЕ влияет — ЗП считается только по отметкам Кэпа.
 *
 * Установка:
 * 1. script.google.com → «Новый проект» → вставить этот код вместо всего, что там есть.
 * 2. Выбрать функцию setup → «Выполнить» → разрешить доступ.
 *    Создастся таблица «Параплан — график наперёд» у тебя на Диске (ссылка — в журнале).
 * 3. «Развернуть» → «Новое развёртывание» → тип «Веб-приложение»:
 *    Выполнять от имени: «Меня», Доступ: «Все». Скопировать URL (…/exec).
 */

const SHEET = 'План';
const TZ = 'Asia/Novosibirsk';

function setup() {
  const ss = getSS_();
  Logger.log('Таблица: ' + ss.getUrl());
}

function getSS_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SS_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {}
  }
  const ss = SpreadsheetApp.create('Параплан — график наперёд');
  const sh = ss.getSheets()[0];
  sh.setName(SHEET);
  sh.getRange(1, 1, 1, 6)
    .setValues([['Дата', 'Точка (id)', 'Точка', 'Сотрудник', 'Кто записал', 'Когда']])
    .setFontWeight('bold').setBackground('#E87A1E').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, 6, 150);
  props.setProperty('SS_ID', ss.getId());
  return ss;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normDate_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, TZ, 'yyyy-MM-dd');
  const s = String(x).replace(/^'/, '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === 'ping') return out_({ ok: true });
    if (p.action === 'getPlan') {
      const v = getSS_().getSheetByName(SHEET).getDataRange().getValues();
      const data = {};
      for (let i = 1; i < v.length; i++) {
        const iso = normDate_(v[i][0]);
        if (!iso) continue;
        if (p.shop && String(v[i][1]) !== p.shop) continue;
        if (p.month && iso.slice(0, 7) !== p.month) continue;
        data[v[i][1] + ':' + iso] = { main: String(v[i][3]), by: String(v[i][4]) };
      }
      return out_({ ok: true, data: data });
    }
    if (p.action === 'getOrders') return out_({ ok: true, data: getOrders_(p.shopName || '') });
    return out_({ ok: false, error: 'Неизвестное действие' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'saveOrder') return out_(saveOrder_(d.order || {}, d.by || ''));
    if (d.action !== 'savePlan') return out_({ ok: false, error: 'Неизвестное действие' });
    if (!d.shop || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return out_({ ok: false, error: 'Нет точки или даты' });
    const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    if (d.date < today) return out_({ ok: false, error: 'Прошедшие дни не меняются' });

    const sh = getSS_().getSheetByName(SHEET);
    const v = sh.getDataRange().getValues();
    let row = -1;
    for (let i = 1; i < v.length; i++) {
      if (normDate_(v[i][0]) === d.date && String(v[i][1]) === d.shop) { row = i + 1; break; }
    }
    if (!d.name) {
      if (row > 0) sh.deleteRow(row);
      return out_({ ok: true });
    }
    const vals = ["'" + d.date, d.shop, d.shopName || '', d.name, d.by || '', new Date()];
    if (row > 0) sh.getRange(row, 1, 1, 6).setValues([vals]);
    else sh.appendRow(vals);
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}


/* ═══════════ ЗАКАЗЫ КЛИЕНТОВ ═══════════ */
const ORDERS = 'Заказы клиентов';
const OCOLS = ['ID', 'Создан', 'Точка', 'Телефон', 'Имя', 'Что заказать', 'Кол-во', 'Как связаться', 'Статус', 'Статус изменён', 'Кто создал', 'Кто изменил', 'Комментарий'];
const OKEYS = ['id', 'created', 'shopName', 'phone', 'name', 'item', 'qty', 'contact', 'status', 'updated', 'createdBy', 'updatedBy', 'comment'];
const STATUSES = ['Заказать', 'Заказали', 'Пришло', 'Написали', 'Забрал', 'Отказ'];

function ordersSheet_() {
  const ss = getSS_();
  let sh = ss.getSheetByName(ORDERS);
  if (!sh) {
    sh = ss.insertSheet(ORDERS);
    sh.getRange(1, 1, 1, OCOLS.length).setValues([OCOLS])
      .setFontWeight('bold').setBackground('#E87A1E').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, OCOLS.length, 130);
    sh.setColumnWidth(6, 280);
    sh.setColumnWidth(13, 220);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
    sh.getRange('I2:I').setDataValidation(rule);
  }
  return sh;
}

function fmtDate_(x) {
  return x instanceof Date ? Utilities.formatDate(x, TZ, "yyyy-MM-dd'T'HH:mm:ss") : String(x || '');
}

function getOrders_(shopName) {
  const v = ordersSheet_().getDataRange().getValues();
  const res = [];
  for (let i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    if (shopName && String(v[i][2]) !== shopName) continue;
    const o = {};
    OKEYS.forEach((k, j) => { o[k] = (k === 'created' || k === 'updated') ? fmtDate_(v[i][j]) : String(v[i][j]); });
    res.push(o);
  }
  return res;
}

function saveOrder_(o, by) {
  if (!o.shopName) return { ok: false, error: 'Нет точки' };
  if (!o.item) return { ok: false, error: 'Напиши, что заказать' };
  if (o.status && STATUSES.indexOf(o.status) < 0) return { ok: false, error: 'Неизвестный статус' };
  const sh = ordersSheet_();
  const v = sh.getDataRange().getValues();
  const now = new Date();
  let row = -1, old = null;
  if (o.id) for (let i = 1; i < v.length; i++) if (String(v[i][0]) === o.id) { row = i + 1; old = v[i]; break; }
  const rec = {
    id: o.id || ('o' + now.getTime()),
    created: old ? old[1] : now,
    shopName: o.shopName,
    phone: "'" + String(o.phone || '').replace(/^'/, ''),
    name: o.name || '',
    item: o.item,
    qty: o.qty || '',
    contact: o.contact || '',
    status: o.status || 'Заказать',
    updated: (!old || String(old[8]) !== (o.status || 'Заказать')) ? now : old[9],
    createdBy: old ? old[10] : by,
    updatedBy: by,
    comment: o.comment || ''
  };
  const vals = OKEYS.map(k => rec[k]);
  if (row > 0) sh.getRange(row, 1, 1, vals.length).setValues([vals]);
  else sh.appendRow(vals);
  return { ok: true, id: rec.id };
}

/** Один раз: перенести текущие заказы Династии из старой таблицы. Выбери функцию и нажми «Выполнить». */
function importDynasty() {
  const sh = ordersSheet_();
  const have = sh.getDataRange().getValues().some(r => String(r[11]) === 'перенос' && String(r[2]) === 'Династия');
  if (have) { Logger.log('Уже перенесено'); return; }
  const rows = DYNASTY_ROWS;
  const now = new Date();
  rows.forEach((r, i) => {
    sh.appendRow(['o' + (now.getTime() + i), now, 'Династия', r.phone ? "'" + r.phone : '', r.name, r.item, r.qty, r.contact,
      r.status, now, 'перенос', 'перенос', r.comment]);
  });
  Logger.log('Перенесено заказов: ' + rows.length);
}

const DYNASTY_ROWS = [
 {
  "phone": "79529156191",
  "name": "",
  "item": "Monstervapor манго маракуйя 20мг",
  "qty": "",
  "contact": "Макс",
  "status": "Заказали",
  "comment": ""
 },
 {
  "phone": "79139849811",
  "name": "",
  "item": "Ароматизатор BG кислый виноград",
  "qty": "",
  "contact": "",
  "status": "Заказать",
  "comment": ""
 },
 {
  "phone": "79529359174",
  "name": "",
  "item": "Monstervapor малина еживика 20мг",
  "qty": "",
  "contact": "",
  "status": "Заказали",
  "comment": ""
 },
 {
  "phone": "79994685321",
  "name": "",
  "item": "Арка банановая жвачка",
  "qty": "",
  "contact": "",
  "status": "Заказать",
  "comment": ""
 },
 {
  "phone": "",
  "name": "",
  "item": "Мастхев грейпфрут",
  "qty": "",
  "contact": "",
  "status": "Пришло",
  "comment": "нет контакта клиента"
 },
 {
  "phone": "79501384256",
  "name": "",
  "item": "Хром киви",
  "qty": "",
  "contact": "",
  "status": "Пришло",
  "comment": ""
 },
 {
  "phone": "79139013739",
  "name": "",
  "item": "Брызги яблоко вишня",
  "qty": "",
  "contact": "",
  "status": "Заказать",
  "comment": ""
 },
 {
  "phone": "79237772397",
  "name": "",
  "item": "DUALL - МОРОЗНОЕ ЯБЛОКО",
  "qty": "6",
  "contact": "Макс",
  "status": "Заказать",
  "comment": ""
 },
 {
  "phone": "79831314663",
  "name": "Максим",
  "item": "Monstervapor - яблоко клюква Strong",
  "qty": "",
  "contact": "Звонок",
  "status": "Заказали",
  "comment": ""
 },
 {
  "phone": "",
  "name": "Елена",
  "item": "Monstervapor - Груша банан, Персик банан Salt 20 mg",
  "qty": "",
  "contact": "Телеграм",
  "status": "Заказали",
  "comment": ""
 },
 {
  "phone": "",
  "name": "Марина",
  "item": "Chrome - киви со льдом 20 мг",
  "qty": "",
  "contact": "Макс",
  "status": "Пришло",
  "comment": ""
 },
 {
  "phone": "79618792711",
  "name": "Виталий",
  "item": "Monstervapor -Ананас кокос мята 20 mg",
  "qty": "",
  "contact": "Макс",
  "status": "Заказали",
  "comment": ""
 },
 {
  "phone": "79538759410",
  "name": "Юля",
  "item": "Monster vapor - виноград малина 1, манго апельсин 1 ( не точно )",
  "qty": "",
  "contact": "Макс",
  "status": "Пришло",
  "comment": "пришло частично; клиент не уверен во вкусах"
 },
 {
  "phone": "79609426727",
  "name": "",
  "item": "Must Have 25г - освежающая мята",
  "qty": "6",
  "contact": "",
  "status": "Заказали",
  "comment": ""
 },
 {
  "phone": "79513698179",
  "name": "Наталья",
  "item": "Ароматизатор BG - розовый лимонад",
  "qty": "3",
  "contact": "Макс",
  "status": "Заказать",
  "comment": ""
 },
 {
  "phone": "79232287542",
  "name": "",
  "item": "BZ, Ароматизатор BG - лимон лайм, грейфрут",
  "qty": "3",
  "contact": "",
  "status": "Пришло",
  "comment": "пришло частично; по 3 шт каждого"
 },
 {
  "phone": "79135377487",
  "name": "Алиса",
  "item": "Iceberg - 100/130",
  "qty": "6",
  "contact": "",
  "status": "Заказали",
  "comment": ""
 }
];
