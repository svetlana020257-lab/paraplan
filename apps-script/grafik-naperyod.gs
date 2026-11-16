/**
 * Параплан — график наперёд (отдельный скрипт, основной не трогает).
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
