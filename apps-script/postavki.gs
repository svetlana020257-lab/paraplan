/**
 * Параплан — ПОСТАВКИ и ПЕРЕМЕЩЕНИЯ (отдельный скрипт, основной и Кэпа не трогает).
 *
 * Что делает:
 *  • Перемещения и поставки создаются ТОЛЬКО в мини-приложении (вкладка «Поставки»).
 *    Обычные сообщения в чатах Кэп не разбирает — разбор текста выключен
 *    (можно включить свойством скрипта PARSE_CHAT = 1, код разбора оставлен).
 *  • От Кэпа сюда приходит только: id чата точки (один раз) и фото, отправленное
 *    ОТВЕТОМ на сообщение Кэпа о документе (фото товара к документу).
 *  • Мини-приложение: список «к нам едет / от нас / все», создание перемещения,
 *    приёмка (✅ сходится / ❌ не сходится, факт, фото), привязка нераспознанных товаров.
 *  • Уведомления в чаты обеих точек и в чат управляющих (расхождения, «висит 2+ дня»).
 *  • Фото — на Google Диск: «Параплан — Поставки (фото)» / Точка / ГГГГ-ММ / № документа.
 *
 * Установка:
 * 1. script.google.com → «Новый проект» «Параплан — Поставки» → вставить этот код.
 * 2. «Настройки проекта» → «Свойства скрипта» → добавить:
 *      BOT_TOKEN   — токен бота Кэпа (тот же, что в скрипте Кэпа)
 *      BOSS_CHAT   — id чата управляющих (куда Кэп шлёт сводки), например -100123…
 * 3. Выбрать функцию setup → «Выполнить» → разрешить доступ.
 *    Создастся таблица «Параплан — Поставки» и папка для фото (ссылки — в журнале).
 * 4. «Развернуть» → «Новое развёртывание» → «Веб-приложение»:
 *      Выполнять от имени: «Меня», Доступ: «Все». URL (…/exec) вставить:
 *      — в tg.html → const POSTAVKI_URL
 *      — в скрипт Кэпа → const POSTAVKI_URL (см. kep-postavki-snippet.gs)
 * 5. Выбрать функцию installTriggers → «Выполнить» (ежедневное напоминание о зависших).
 * 6. id чатов точек заполняются сами, когда в чате точки впервые напишут «перемещение…»
 *    (по названию чата). Проверить можно на листе «Точки», столбец «chat_id».
 */

const TZ = 'Asia/Novosibirsk';
const OTCHET_ID = '1ITQbDT1x_Yx_ZPweaz5Ije4Q17rjVIUKRQGlNcZQPwc';   // таблица «Отчет»
const CATALOG_SHEET = 'Эвотор_Остатки';                               // Точка | ID | Код | Товар | Группа | Остаток …
const STALE_DAYS = 2;                                                 // «В пути» дольше — напоминаем

const SH = { docs: 'Документы', rows: 'Строки', shops: 'Точки', syn: 'Синонимы', photos: 'Фото', log: 'Журнал' };

const HEAD = {
  docs:   ['№', 'Тип', 'Откуда (id)', 'Откуда', 'Куда (id)', 'Куда', 'Поставщик', 'Создано', 'Создал', 'Источник',
           'Статус', 'Принял', 'Принято', 'Комментарий', 'Папка фото', 'msg чата', 'msg Кэпа', 'Текст сообщения'],
  rows:   ['№ документа', 'Строка', 'Как написано', 'Товар (справочник)', 'Отправлено', 'Ед.', 'Факт', 'Сходится',
           'Комментарий', 'Варианты'],
  shops:  ['id', 'Название', 'Синонимы (через запятую)', 'chat_id', 'Название чата'],
  syn:    ['Как пишут', 'Товар (справочник)', 'Кто подтвердил', 'Когда'],
  photos: ['№ документа', 'Этап', 'Кто', 'Когда', 'Ссылка', 'Точка'],
  log:    ['Когда', 'Событие', 'Детали']
};

// Точки и как их называют в чатах (из истории чатов). id — как в мини-приложении.
const SHOPS_DEFAULT = [
  ['sklad',     'Склад',          'склад,со склада,складе'],
  ['moskva',    'Москва',         'москва,мск,тц москва,тцмосква,крылова'],
  ['titova',    'Титова',         'титова,титово,титов'],
  ['gromova',   'Громова',        'громова,громово'],
  ['korotaeva', 'Коротаева',      'коротаева,коротаево,чемской,чемская,чемкой'],
  ['zorge',     'Зорге',          'зорге,зорге 4,зорге4'],
  ['gorsky',    'Горский',        'горский,горская,горского,горка'],
  ['petukhova', 'Петухова',       'петухова,петухово'],
  ['plan',      'Планировочная',  'планировочная,планировочной,планир,план'],
  ['shluz',     'Шлюз',           'шлюз,софийская,софийской,софия'],
  ['dynasty',   'Династия',       'династия,династии,династию'],
  ['nikitina',  'Никитина',       'никитина,никитино'],
  ['bogatk',    'Богаткова',      'богаткова,богатково,бб']
];

/* ════════════════════════ УСТАНОВКА ════════════════════════ */

function setup() {
  const ss = getSS_();
  Logger.log('Таблица: ' + ss.getUrl());
  Logger.log('Папка фото: ' + rootFolder_().getUrl());
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'remindStale') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('remindStale').timeBased().everyDays(1).atHour(11).inTimezone(TZ).create();
  Logger.log('Напоминание о зависших — каждый день в 11:00');
}

function getSS_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SS_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const ss = SpreadsheetApp.create('Параплан — Поставки');
  Object.keys(SH).forEach((k, i) => {
    const sh = i === 0 ? ss.getSheets()[0].setName(SH[k]) : ss.insertSheet(SH[k]);
    sh.getRange(1, 1, 1, HEAD[k].length).setValues([HEAD[k]])
      .setFontWeight('bold').setBackground('#E87A1E').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, HEAD[k].length, 140);
  });
  const shops = ss.getSheetByName(SH.shops);
  shops.getRange(2, 1, SHOPS_DEFAULT.length, 3).setValues(SHOPS_DEFAULT);
  props.setProperty('SS_ID', ss.getId());
  return ss;
}

function sheet_(k) { return getSS_().getSheetByName(SH[k]); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm'); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function log_(ev, det) { try { sheet_('log').appendRow([now_(), ev, String(det || '').slice(0, 2000)]); } catch (e) {} }

/* ════════════════════════ ВЕБ-API ════════════════════════ */

function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === 'ping') return out_({ ok: true });
    if (p.action === 'getDocs') { const me = resolveShop_(p.shop, p.shopName); return out_({ ok: true, me: me ? me.id : '', data: getDocs_(me ? me.id : '', p.all === '1') }); }
    if (p.action === 'getCatalog') return out_({ ok: true, data: catalogNames_() });
    if (p.action === 'learnGet') return out_({ ok: true, data: learnGet_(p.user) });
    if (p.action === 'getShops') return out_({ ok: true, data: shops_().map(s => ({ id: s.id, name: s.name })) });
    return out_({ ok: false, error: 'Неизвестное действие' });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'tg')          return out_(handleTg_(d.message || {}));
    if (d.action === 'chat')        { const c = d.chat || {}; const sh = shopByChat_(c); if (!sh) log_('Чат без точки', (c.title || '') + ' = ' + c.id); return out_({ ok: true, shop: sh ? sh.name : '' }); }
    if (d.action === 'learnSave')   return out_({ ok: true, data: learnSave_(d.user, d.name, d.point, d.state) });
    if (d.action === 'create')      return out_(createFromApp_(d));
    if (d.action === 'accept')      return out_(accept_(d));
    if (d.action === 'resolveItem') return out_(resolveItem_(d));
    if (d.action === 'addPhotos')   return out_(addPhotos_(d));
    if (d.action === 'cancel')      return out_(cancel_(d));
    return out_({ ok: false, error: 'Неизвестное действие' });
  } catch (err) {
    log_('Ошибка', String(err) + ' ' + (err.stack || ''));
    return out_({ ok: false, error: String(err) });
  } finally { lock.releaseLock(); }
}

/* ════════════════════════ ТОЧКИ ════════════════════════ */

/** Chat ID чатов точек — те же, что в Кэпе (Синхронизация_смен → POINTS). Склад → чат поставок (тема). */
const CHATS_DEFAULT = {
  dynasty: '-1001927226002', gromova: '-1002066972660', nikitina: '-1003964020686', korotaeva: '-1002028479449',
  titova: '-1001985155814', gorsky: '-1003868197974', moskva: '-1001874958730', zorge: '-1001713321916',
  petukhova: '-1002559299199', shluz: '-1003785547674', bogatk: '-1003897843810', plan: '-1004402832347',
  sklad: '-1003975907264_1172'   // чат поставок, тема 1172 (формат «чат_тема»)
};

function shops_() {
  const sh = sheet_('shops');
  const v = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    const id = String(v[i][0]);
    const syn = String(v[i][2] || '').split(',').map(s => norm_(s)).filter(Boolean);
    syn.push(norm_(v[i][1]));
    let chat = String(v[i][3] || '').trim();
    if (CHATS_DEFAULT[id] && chat !== CHATS_DEFAULT[id]) { chat = CHATS_DEFAULT[id]; sh.getRange(i + 1, 4).setValue(chat); }   // чат точки — всегда как в Кэпе
    if (!chat && id === 'sklad') chat = prop_('BOSS_CHAT');                                                // склад → чат управляющих
    out.push({ row: i + 1, id: id, name: String(v[i][1]), syn: syn, chat: chat, title: String(v[i][4] || '') });
  }
  return out;
}
function shopById_(id) { return shops_().find(s => s.id === id) || null; }
/** Точка из приложения: по id, а если id другой — по названию («Шлюз», «Москва»…). */
function resolveShop_(id, name) {
  const shops = shops_();
  return (id && shops.find(s => s.id === id)) || (name && (shops.find(s => norm_(s.name) === norm_(name)) || findShop_(name, shops))) || null;
}

/** Найти точку в куске текста: «тц москва», «Мск», «горской», «на москву», «зорги»… */
function shopHits_(txt, shops) {
  const words = norm_(txt).split(' ').filter(Boolean);
  const t = ' ' + words.join(' ') + ' ';
  const hits = [];
  shops.forEach(s => {
    let pos = -1, len = 0;
    s.syn.forEach(w => {
      if (w.length < 2) return;
      const i = t.indexOf(' ' + w + ' ');
      if (i >= 0 && w.length > len) { pos = i; len = w.length; }
      if (w.indexOf(' ') < 0 && w.length >= 5) {            // падежи и опечатки: «москву», «горской», «зорги»
        const stem = w.slice(0, w.length - 1);
        words.forEach(x => {
          if (x.length >= stem.length && x.indexOf(stem.slice(0, Math.max(4, stem.length - 1))) === 0 && Math.abs(x.length - w.length) <= 2) {
            const j = t.indexOf(' ' + x + ' ');
            if (len < stem.length) { pos = j; len = stem.length; }
          }
        });
      }
    });
    if (pos >= 0) hits.push({ s: s, pos: pos, len: len });
  });
  // если один синоним — часть другого («зорге» в «зорге 4»), оставляем самый длинный на этой позиции
  hits.sort((a, b) => a.pos - b.pos || b.len - a.len);
  const out = [];
  hits.forEach(h => { if (!out.some(o => o.s.id === h.s.id)) out.push(h); });
  return out;
}
function findShop_(txt, shops) {
  const h = shopHits_(txt, shops).sort((a, b) => b.len - a.len);
  return h.length ? h[0].s : null;
}

/** Точка по чату: сначала по сохранённому chat_id, иначе по названию чата («Параплан Зорге 4») — и запоминаем. */
function shopByChat_(chat) {
  const shops = shops_();
  const id = String(chat.id || '');
  let s = shops.find(x => x.chat === id);
  if (s) return s;
  if (/ozon|озон|\bwb\b|вб|яндекс|пвз/i.test(String(chat.title || ''))) return null;   // чаты ПВЗ — не точки Параплан
  s = findShop_(String(chat.title || ''), shops);
  if (s && id) {
    const sh = sheet_('shops');
    if (!s.chat) { sh.getRange(s.row, 4, 1, 2).setValues([[id, chat.title || '']]); log_('Запомнил чат', s.name + ' = ' + id); }
  }
  return s;
}

/* ════════════════════════ СПРАВОЧНИК ТОВАРОВ ════════════════════════ */

/** Единая номенклатура для всех точек: уникальные названия товаров из «Эвотор_Остатки» (остатки не берём). */
function catalog_() {
  const c = CacheService.getScriptCache();
  const hit = c.get('catalog');
  if (hit) return JSON.parse(hit);
  const v = SpreadsheetApp.openById(OTCHET_ID).getSheetByName(CATALOG_SHEET).getDataRange().getValues();
  const byName = {};
  for (let i = 1; i < v.length; i++) {
    const name = String(v[i][3] || '').trim();
    if (name && !byName[name]) byName[name] = { n: name, g: String(v[i][4] || '').trim() };
  }
  const list = Object.keys(byName).map(k => byName[k])
    .sort((a, b) => a.g.localeCompare(b.g, 'ru') || a.n.localeCompare(b.n, 'ru'));
  try { c.put('catalog', JSON.stringify(list), 3600); } catch (e) {}   // кэш на час (если влезает)
  return list;
}

function catalogNames_() { return catalog_(); }

function synonyms_() {
  const v = sheet_('syn').getDataRange().getValues();
  const m = {};
  for (let i = 1; i < v.length; i++) if (v[i][0] && v[i][1]) m[norm_(v[i][0])] = String(v[i][1]);
  return m;
}

// Сленг → как в справочнике (до сравнения по словам). Пары «как пишут|…» → «как в карточке».
const SLANG_WORDS = [
  ['жт', 'жевательный табак'], ['аромка|аромки|жижа|жижи', 'ароматизатор'],
  ['монстервейпор|монстервапор|монстрвейпор|монстр вейпор|монстер вейпор|монстер', 'monstervapor'], ['мад|мэд', 'mad'], ['каста', 'kasta'],
  ['дуал|дуалл|дуалы', 'duall'], ['скала|скалы', 'skala'], ['влага', 'vlaga'], ['сибирь|сибирия|сиберия', 'siberia'],
  ['оденс|оденсы', 'odens'], ['айсберг|айсберги', 'iceberg'], ['айсберн', 'iceburn'], ['луп', 'loop'],
  ['люфт|лифт', 'lyft'], ['вело', 'velo'], ['ред', 'red'], ['арка', 'arqa'], ['федрс', 'fedrs'], ['чн|chn', 'chn'],
  ['дельта|дэлта|delta', 'd l t a'], ['драймост|драй мост|dry most', 'drymost'], ['корвус', 'corvus'],
  ['лост мери|лост мэри|лостмери|лост мари', 'lost mary'], ['иксрос|хрос|xros', 'xros'], ['вапорессо|вапоресо', 'vaporesso'],
  ['гиквейп|гик вейп|geek vape', 'geekvape'], ['вупу', 'voopoo'], ['брызги', 'bryzgi'], ['вейп клауд|вейпклауд|vepe cloud', 'vape cloud'],
  ['наркоз', 'narcoz'], ['анархия', 'анархия'], ['рик и морти|рик морти', 'rick and morty'], ['злая монашка', 'злая монашка'],
  ['максвеллс|максвелс|maxwell|maxwells', 'maxwells'], ['хулинет|xylinet', 'xylinet'], ['бруско', 'brusko'],
  ['миникан', 'minican'], ['тайсон', 'tyson'], ['хиллми', 'hillme'], ['празе|praze', 'praze'],
  ['картриджи', 'картридж'], ['испарители|испаители|испарик|испарики|коил|коилы|coil', 'испаритель'], ['одноразки|одноразка|снюс|никпак', ''],
  ['энергетик|энергетики', 'энергетик'], ['10к|10k', '10000'], ['20к|20k', '20000'], ['16к|16k', '16000'], ['бм', 'bm']
];
const SLANG = SLANG_WORDS.map(p => [new RegExp('(^| )(' + p[0] + ')(?= |$)', 'g'), '$1' + p[1]]);
// слова-категории: не считаются «лишними» при сравнении с карточкой
const CAT_WORDS = ['ароматизатор', 'пищевой', 'жевательный', 'табак', 'набор', 'pod', 'система', 'жидкость', 'никпак', 'для', 'на'];

function norm_(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е')
    .replace(/[«»"'`’().,;:!?+\/\\|_*#№]/g, ' ').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
}
function slang_(s) { let t = norm_(s).replace(/(\d)\.(\d{3})\b/g, '$1$2'); SLANG.forEach(r => { t = t.replace(r[0], r[1]); }); return t.replace(/\s+/g, ' ').trim(); }
function latinCode_(w) {
  if (!/\d/.test(w)) return w;
  const map = { 'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'х': 'x', 'у': 'y' };
  return w.replace(/[авекмнорстху]/g, c => map[c]);
}
function tokens_(s) { return slang_(s).replace(/-/g, ' ').split(' ').map(latinCode_).join(' ').replace(/([a-z])(\d)/g, '$1 $2').split(' ').filter(w => w && !/^(шт|уп|упак|по|на|и|с|для|мг|мл|г)$/.test(w)); }

/** Сопоставить «как написано» со справочником. → {name, ok, options[]} */
function matchItem_(raw, shopName) {
  const syn = synonyms_();
  const key = norm_(raw);
  if (syn[key]) return { name: syn[key], ok: true, options: [] };
  const q = tokens_(raw).filter(w => CAT_WORDS.indexOf(w) < 0 || tokens_(raw).length === 1);
  if (!q.length) return { name: '', ok: false, options: [] };
  const same = (w, z) => z === w || (w.length >= 4 && z.length >= 4 && (z.indexOf(w) === 0 || w.indexOf(z) === 0)) ||
    (/^\d/.test(w) && z.replace(/[^\d]/g, '') === w.replace(/[^\d]/g, '') && w.replace(/[^\d]/g, '').length >= 2);
  const scored = [];
  catalog_().forEach(x => {
    const t = tokens_(x.n);
    let hit = 0;
    q.forEach(w => { if (t.some(z => same(w, z))) hit++; });
    if (!hit) return;
    const extra = t.filter(z => CAT_WORDS.indexOf(z) < 0 && !q.some(w => same(w, z))).length;
    const cover = hit / q.length;
    let score = cover * 3 - extra * 0.4;
    if (shopName && x.st && x.st[shopName] > 0) score += 0.3;            // есть на остатке у отправителя
    scored.push({ n: x.n, s: score, cover: cover, extra: extra });
  });
  if (!scored.length) return { name: '', ok: false, options: [] };
  scored.sort((a, b) => b.s - a.s || a.extra - b.extra || a.n.length - b.n.length);
  const top = scored.slice(0, 4).map(x => x.n);
  const b = scored[0], second = scored[1];
  // уверены, если все написанные слова нашлись и следующий вариант заметно хуже (или в нём больше лишних слов)
  const ok = b.cover === 1 && (!second || second.cover < 1 || b.s - second.s >= 0.35 || (b.extra === 0 && second.extra > 0));
  return { name: ok ? b.n : '', ok: ok, options: top };
}

/* ════════════════════════ РАЗБОР СООБЩЕНИЯ ════════════════════════ */

/** Сообщение — документ, если первое слово «Перемещение/Перемещения/Поставка» и в первой строке нет вопроса. */
function isDocHeader_(text) {
  const first = String(text || '').split(/\r?\n/)[0];
  return /^\s*(перемещени[ея]|перемешени[ея]|поставка)(?![а-я])/i.test(first) && first.indexOf('?') < 0;
}

/**
 * Разбор текста «Перемещение / Мск > династия / Duall - 14 шт / …»
 * chatShop — точка, в чьём чате написали (если в маршруте нет «откуда»).
 * → {type, from, to, supplier, items:[{raw, qty, unit, note}], notes[]}
 */
function parseText_(text, chatShop, shops) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const first = lines.shift() || '';
  const type = /поставк/i.test(first) ? 'Поставка' : 'Перемещение';
  let rest = first.replace(/^\s*(перемещени[еяй]|перемешени[еяй]|поставк[аи])\s*[:.\-–—]?\s*/i, '');
  let from = null, to = null, supplier = '';
  const tryRoute = (line) => {
    const L = norm_(line);
    if (!L) return false;
    // «на горский», «в зорге» — получатель, отправитель = чат
    let m = L.match(/^(?:на|в|во)\s+(.+)$/);
    if (m) { const s = findShop_(m[1], shops); if (s) { to = s; return true; } }
    // «с титова», «со склада» — отправитель, получатель = чат
    m = L.match(/^(?:с|со|из|от)\s+(.+)$/);
    if (m) { const s = findShop_(m[1], shops); if (s) { from = s; return true; } }
    // «Склад зорге», «Зорге петухова» — две точки без разделителя
    if (!/\d/.test(L)) {
      const h = shopHits_(line, shops);
      if (h.length === 2 && h[0].s.id !== h[1].s.id && !/(->|→|=>|>|–|—|-)/.test(line)) { from = h[0].s; to = h[1].s; return true; }
    }
    // «А > Б», «А - Б», «А -> Б», «А → Б», «А – Б»
    const parts = line.split(/\s*(?:->|→|=>|>|–|—|-)\s*/).filter(Boolean);
    if (parts.length === 2) {
      const a = findShop_(parts[0], shops), b = findShop_(parts[1], shops);
      if (a && b && a.id !== b.id) { from = a; to = b; return true; }
      if (!a && b && type === 'Поставка' && !/\d/.test(parts[0])) { supplier = parts[0].trim(); to = b; return true; }
      if (a && !b && !/\d/.test(parts[1])) { from = a; return true; }
    }
    return false;
  };
  const items = [], notes = [];
  let routeFound = false;
  if (rest) { if (tryRoute(rest)) routeFound = true; else lines.unshift(rest); }
  lines.forEach(line => {
    if (!routeFound && tryRoute(line)) { routeFound = true; return; }
    const it = parseItemLine_(line);
    if (it) items.push(it); else notes.push(line);
  });
  if (!from && to && chatShop && chatShop.id !== to.id) from = chatShop;
  if (from && !to && chatShop && chatShop.id !== from.id) to = chatShop;
  if (!from && !to && chatShop) {
    if (type === 'Поставка') { to = chatShop; from = shops.find(s => s.id === 'sklad') || null; routeFound = true; }   // «поставка» без маршрута = со склада к нам
    else from = chatShop;
  }
  return { type: type, from: from, to: to, supplier: supplier, items: items, notes: notes, routeFound: routeFound };
}

/** «Vape cloud Lux - 22 шт ( по кассе 18)», «skala 3шт», «картриджи 0.4-3уп.», «Iceberg 100mg - 5» */
function parseItemLine_(line) {
  let s = String(line).trim();
  let note = '';
  const par = s.match(/\(([^)]*)\)\s*$/);
  if (par) { note = par[1].trim(); s = s.slice(0, par.index).trim(); }
  // «8 шт дуалл» — количество впереди
  const pre = s.match(/^(\d+)\s*(шт|штук|уп|упак|пач|пачк[аи]|блок[аов]*)\.?\s+(.+)$/i);
  if (pre && /[a-zа-я]/i.test(pre[3])) return { raw: pre[3].trim(), qty: Number(pre[1]), unit: /уп|пач|блок/i.test(pre[2]) ? 'уп' : 'шт', note: note };
  const m = s.match(/^(.*?)[\s\-–—:x×=]*?(\d+(?:[.,]\d+)?)\s*(шт|штук|штуки|уп|упак|упаковк[аи]|пач|пачк[аи]|бан|банк[аи]|шайб[аы]?|блок[аов]*)?\.?\s*$/i);
  if (!m || !m[1] || !/[a-zа-я]/i.test(m[1])) return null;
  // «Монстервейпор киви яблок 50мг» — число это крепость, а не количество
  if (!m[3] && /^(мг|mg|мл|ml|г|k|к)$/i.test((s.slice(m.index + m[0].length - 0).match(/^\S*/) || [''])[0])) return null;
  if (!m[3] && /(мг|mg|мл|ml)\s*$/i.test(s)) return null;
  let name = m[1].replace(/[\s\-–—:x×=]+$/, '').trim();
  // «картридж 0.4-3уп» — 0.4 часть названия; «Iceberg 100mg - 5» — тоже ок
  if (!name) return null;
  const unit = /уп|пач|блок/i.test(m[3] || '') ? 'уп' : 'шт';
  return { raw: name, qty: Number(String(m[2]).replace(',', '.')), unit: unit, note: note };
}

/* ════════════════════════ ДОКУМЕНТЫ ════════════════════════ */

function nextNo_(type) {
  const p = PropertiesService.getScriptProperties();
  const k = 'SEQ_' + (type === 'Поставка' ? 'S' : 'P');
  const n = Number(p.getProperty(k) || 0) + 1;
  p.setProperty(k, String(n));
  return (type === 'Поставка' ? 'S-' : 'P-') + ('000' + n).slice(-4);
}

function createDoc_(o) {
  const no = nextNo_(o.type);
  const fromName = o.from ? o.from.name : '', toName = o.to ? o.to.name : '';
  sheet_('docs').appendRow([no, o.type, o.from ? o.from.id : '', fromName, o.to ? o.to.id : '', toName, o.supplier || '',
    now_(), o.by || '', o.source || 'приложение', o.status || 'В пути', '', '', o.comment || '', '', o.chatMsg || '', '', o.text || '']);
  const rows = sheet_('rows');
  const shopName = fromName;
  const out = [];
  (o.items || []).forEach((it, i) => {
    const m = it.catalog ? { name: it.catalog, ok: true, options: [] } : matchItem_(it.raw, shopName);
    out.push({ raw: it.raw, name: m.name, ok: m.ok, qty: it.qty, unit: it.unit || 'шт' });
    rows.appendRow([no, i + 1, it.raw, m.name, it.qty, it.unit || 'шт', '', '', it.note || '', (m.options || []).join(' | ')]);
  });
  return { no: no, items: out };
}

function docRow_(no) {
  const v = sheet_('docs').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === no) return { row: i + 1, v: v[i] };
  return null;
}

function getDocs_(shopId, all) {
  if (!all && !shopId) return [];
  const dv = sheet_('docs').getDataRange().getValues();
  const rv = sheet_('rows').getDataRange().getValues();
  const lines = {};
  for (let i = 1; i < rv.length; i++) {
    const no = String(rv[i][0]);
    (lines[no] = lines[no] || []).push({
      row: i + 1, n: Number(rv[i][1]), raw: String(rv[i][2]), name: String(rv[i][3]), qty: Number(rv[i][4]) || 0,
      unit: String(rv[i][5] || 'шт'), fact: rv[i][6] === '' ? null : Number(rv[i][6]), ok: String(rv[i][7]),
      note: String(rv[i][8] || ''), options: String(rv[i][9] || '').split(' | ').filter(Boolean)
    });
  }
  const out = [];
  for (let i = dv.length - 1; i >= 1; i--) {
    const r = dv[i];
    const fromId = String(r[2]), toId = String(r[4]);
    if (!all && shopId && fromId !== shopId && toId !== shopId) continue;
    out.push({
      no: String(r[0]), type: String(r[1]), fromId: fromId, from: String(r[3]), toId: toId, to: String(r[5]),
      supplier: String(r[6]), created: fmt_(r[7]), by: String(r[8]), source: String(r[9]), status: String(r[10]),
      acceptedBy: String(r[11]), accepted: fmt_(r[12]), comment: String(r[13]), folder: String(r[14]),
      text: String(r[17] || ''), lines: lines[String(r[0])] || []
    });
    if (out.length >= 300) break;
  }
  return out;
}
function fmt_(x) { return x instanceof Date ? Utilities.formatDate(x, TZ, 'dd.MM.yyyy HH:mm') : String(x || ''); }

/* ── создание из приложения ── */
function createFromApp_(d) {
  const from = resolveShop_(d.from, d.fromName), to = resolveShop_(d.to, d.toName);
  if (!to) return { ok: false, error: 'Не выбрана точка-получатель' };
  if (!(d.items || []).length) return { ok: false, error: 'Нет товаров' };
  const type = d.type === 'Поставка' ? 'Поставка' : 'Перемещение';
  const doc = createDoc_({
    type: type, from: from, to: to, supplier: d.supplier || '', by: d.by || '', source: 'приложение',
    status: type === 'Поставка' && d.expected ? 'Ожидается' : 'В пути', comment: d.comment || '',
    items: d.items.map(x => ({ raw: x.raw || x.catalog, catalog: x.catalog || '', qty: Number(x.qty) || 0, unit: x.unit || 'шт' }))
  });
  if ((d.photos || []).length) savePhotos_(doc.no, d.photos, 'отправка', d.by || '', from ? from.name : (to ? to.name : ''));
  notifyCreated_(doc.no, true);
  return { ok: true, no: doc.no };
}

/* ── сообщение из чата (через Кэпа) ── */
function handleTg_(m) {
  const chat = m.chat || {};
  const chatShop = shopByChat_(chat);
  const text = String(m.text || m.caption || '');
  const by = [m.from && m.from.first_name, m.from && m.from.last_name].filter(Boolean).join(' ');
  const msgKey = String(chat.id) + ':' + String(m.message_id);

  // фото ответом на сообщение Кэпа о документе → прикрепить к документу
  if (m.photo && m.reply_to_message) {
    const no = docByBotMsg_(String(chat.id) + ':' + String(m.reply_to_message.message_id))
      || (String(m.reply_to_message.text || '').match(/[PS]-\d{4}/) || [])[0];
    if (no) {
      const fileId = m.photo[m.photo.length - 1].file_id;
      saveTgPhoto_(no, fileId, by, chatShop ? chatShop.name : '');
      return { ok: true, attached: no };
    }
  }
  // Разбор текстовых сообщений выключен: перемещения создаются только в приложении.
  // Включить (если когда-нибудь понадобится): свойство скрипта PARSE_CHAT = 1.
  if (prop_('PARSE_CHAT') !== '1') return { ok: true, skip: true };
  if (!isDocHeader_(text)) return { ok: true, skip: true };
  if (docByChatMsg_(msgKey)) return { ok: true, dup: true };                 // уже записано (повтор/правка)
  const p = parseText_(text, chatShop, shops_());
  if (/вс[её]\s+сошл/i.test(text) || (!p.items.length && !p.routeFound)) return { ok: true, skip: true };   // «всё сошлось», болтовня
  const doc = createDoc_({
    type: p.type, from: p.from, to: p.to, supplier: p.supplier, by: by, source: 'чат',
    status: (!p.to || !p.items.length) ? 'Черновик' : 'В пути', comment: p.notes.join(' / '),
    chatMsg: msgKey, text: text, items: p.items
  });
  if (m.photo) saveTgPhoto_(doc.no, m.photo[m.photo.length - 1].file_id, by, chatShop ? chatShop.name : '');
  notifyCreated_(doc.no, false, chat.id, m.message_id);
  return { ok: true, no: doc.no };
}

function docByChatMsg_(key) {
  const v = sheet_('docs').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][15]) === key) return String(v[i][0]);
  return '';
}
function docByBotMsg_(key) {
  const v = sheet_('docs').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][16]).split(',').indexOf(key) >= 0) return String(v[i][0]);
  return '';
}

/* ── приёмка ── */
function accept_(d) {
  const dr = docRow_(d.no);
  if (!dr) return { ok: false, error: 'Документ не найден' };
  if (/^Принято/.test(String(dr.v[10]))) return { ok: false, error: 'Уже принято' };
  const rows = sheet_('rows');
  const rv = rows.getDataRange().getValues();
  let mism = 0, totalQ = 0, totalF = 0;
  const diffs = [];
  (d.lines || []).forEach(l => {
    const r = Number(l.row);
    if (!r || String(rv[r - 1][0]) !== d.no) return;
    const qty = Number(rv[r - 1][4]) || 0, fact = Number(l.fact);
    const ok = l.ok === true && fact === qty;
    totalQ += qty; totalF += fact;
    if (!ok) { mism++; diffs.push((rv[r - 1][3] || rv[r - 1][2]) + ': ' + qty + ' → ' + fact); }
    rows.getRange(r, 7, 1, 3).setValues([[fact, ok ? 'да' : 'нет', l.comment || rv[r - 1][8] || '']]);
  });
  // товары, которые приехали сверх документа
  (d.extra || []).forEach(x => {
    const n = (rv.filter(r => String(r[0]) === d.no).length) + 1;
    rows.appendRow([d.no, n, x.raw || x.catalog, x.catalog || '', 0, 'шт', Number(x.fact) || 0, 'нет', 'лишнее, не было в документе', '']);
    mism++; diffs.push((x.catalog || x.raw) + ': 0 → ' + x.fact + ' (лишнее)');
  });
  const status = mism ? 'Принято с расхождением' : 'Принято';
  const sh = sheet_('docs');
  sh.getRange(dr.row, 11, 1, 4).setValues([[status, d.by || '', now_(), [dr.v[13], d.comment].filter(Boolean).join(' / ')]]);
  const to = shopById_(String(dr.v[4]));
  if ((d.photos || []).length) savePhotos_(d.no, d.photos, 'приёмка', d.by || '', to ? to.name : '');
  notifyAccepted_(d.no, status, diffs, d.by || '');
  return { ok: true, status: status };
}

/* ── привязать нераспознанный товар и запомнить синоним ── */
function resolveItem_(d) {
  const r = Number(d.row);
  const rows = sheet_('rows');
  const raw = String(rows.getRange(r, 3).getValue());
  rows.getRange(r, 4).setValue(d.catalog);
  if (d.remember !== false && raw && norm_(raw) !== norm_(d.catalog)) {
    const syn = synonyms_();
    if (!syn[norm_(raw)]) sheet_('syn').appendRow([raw, d.catalog, d.by || '', now_()]);
  }
  // документ-черновик со всеми товарами и маршрутом → «В пути»
  return { ok: true };
}

function cancel_(d) {
  const dr = docRow_(d.no);
  if (!dr) return { ok: false, error: 'Документ не найден' };
  sheet_('docs').getRange(dr.row, 11).setValue('Отменено');
  sheet_('docs').getRange(dr.row, 14).setValue([dr.v[13], 'отменил ' + (d.by || '')].filter(Boolean).join(' / '));
  return { ok: true };
}

function addPhotos_(d) {
  const dr = docRow_(d.no);
  if (!dr) return { ok: false, error: 'Документ не найден' };
  savePhotos_(d.no, d.photos || [], d.stage || 'доп.', d.by || '', d.shopName || '');
  return { ok: true };
}

/* ════════════════════════ ФОТО ════════════════════════ */

function rootFolder_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('PHOTO_ROOT');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('Параплан — Поставки (фото)');
  p.setProperty('PHOTO_ROOT', f.getId());
  return f;
}
function sub_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }

function docFolder_(no) {
  const dr = docRow_(no);
  if (dr && dr.v[14]) { try { return DriveApp.getFolderById(String(dr.v[14]).split('/').pop().split('?')[0]); } catch (e) {} }
  const point = (dr && (dr.v[3] || dr.v[6] || dr.v[5])) || 'Без точки';
  const month = Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  const name = no + ' ' + (dr ? (dr.v[3] || dr.v[6] || '?') + ' → ' + (dr.v[5] || '?') : '');
  const f = sub_(sub_(sub_(rootFolder_(), String(point)), month), name);
  if (dr) sheet_('docs').getRange(dr.row, 15).setValue(f.getUrl());
  return f;
}

function savePhotos_(no, photos, stage, by, point) {
  const f = docFolder_(no);
  photos.forEach((p, i) => {
    const blob = Utilities.newBlob(Utilities.base64Decode(String(p.data).replace(/^data:[^,]+,/, '')),
      p.mime || 'image/jpeg', (stage + '_' + Utilities.formatDate(new Date(), TZ, 'ddMM_HHmmss') + '_' + (i + 1) + '.jpg'));
    const file = f.createFile(blob);
    sheet_('photos').appendRow([no, stage, by, now_(), file.getUrl(), point]);
  });
}

function saveTgPhoto_(no, fileId, by, point) {
  const token = prop_('BOT_TOKEN');
  if (!token) return;
  const r = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getFile?file_id=' + fileId).getContentText());
  if (!r.ok) return;
  const blob = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + token + '/' + r.result.file_path).getBlob()
    .setName('чат_' + Utilities.formatDate(new Date(), TZ, 'ddMM_HHmmss') + '.jpg');
  const file = docFolder_(no).createFile(blob);
  sheet_('photos').appendRow([no, 'чат', by, now_(), file.getUrl(), point]);
}

/* ════════════════════════ TELEGRAM ════════════════════════ */

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

function tgSend_(chatId, text, replyTo) {
  const token = prop_('BOT_TOKEN').trim().replace(/^['"]|['"]$/g, '');
  if (!token) { log_('Не отправлено', 'нет свойства BOT_TOKEN в настройках проекта'); return null; }
  if (!chatId) return null;
  const parts = String(chatId).split('_');                       // «-100…_1172» → чат + тема форума
  const payload = { chat_id: parts[0], text: text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (parts[1]) payload.message_thread_id = Number(parts[1]);
  if (replyTo) { payload.reply_to_message_id = replyTo; payload.allow_sending_without_reply = true; }
  try {
    const r = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage',
      { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }).getContentText());
    if (!r.ok) log_('Не отправлено', chatId + ' — Telegram: ' + (r.error_code || '') + ' ' + (r.description || ''));
    return r.ok ? r.result.message_id : null;
  } catch (e) { log_('Не отправлено', chatId + ' ' + e); return null; }
}
function esc_(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function rememberBotMsg_(no, chatId, msgId) {
  if (!msgId) return;
  const dr = docRow_(no);
  const cur = String(dr.v[16] || '');
  sheet_('docs').getRange(dr.row, 17).setValue((cur ? cur + ',' : '') + chatId + ':' + msgId);
}

function itemsText_(no) {
  const d = getDocs_('', true).find(x => x.no === no);
  return d.lines.map(l => '• ' + esc_(l.name || l.raw) + ' — ' + l.qty + ' ' + l.unit + (l.name ? '' : ' ⚠️')).join('\n');
}

/** Фото документа из листа «Фото» (stages — какие этапы брать; пусто = все). */
function docPhotos_(no, stages) {
  const v = sheet_('photos').getDataRange().getValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) !== no) continue;
    if (stages && stages.indexOf(String(v[i][1])) < 0) continue;
    const m = String(v[i][4]).match(/\/d\/([^/]+)/);
    if (m) try { out.push(DriveApp.getFileById(m[1]).getBlob()); } catch (e) {}
  }
  return out;
}

/** Отправить фото в чат альбомом (по 10). chatId может быть «чат_тема». */
function tgPhotos_(chatId, blobs, caption) {
  const token = prop_('BOT_TOKEN').trim().replace(/^['"]|['"]$/g, '');
  if (!token || !chatId || !blobs.length) return;
  const parts = String(chatId).split('_');
  for (let i = 0; i < blobs.length; i += 10) {
    const chunk = blobs.slice(i, i + 10);
    const payload = { chat_id: parts[0] };
    if (parts[1]) payload.message_thread_id = parts[1];
    let method;
    if (chunk.length === 1) {
      method = 'sendPhoto'; payload.photo = chunk[0];
      if (i === 0 && caption) payload.caption = caption;
    } else {
      method = 'sendMediaGroup';
      payload.media = JSON.stringify(chunk.map((b, k) => {
        const m = { type: 'photo', media: 'attach://p' + k };
        if (i === 0 && k === 0 && caption) m.caption = caption;
        return m;
      }));
      chunk.forEach((b, k) => payload['p' + k] = b);
    }
    try {
      const r = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method,
        { method: 'post', payload: payload, muteHttpExceptions: true }).getContentText());
      if (!r.ok) log_('Фото не отправлены', chatId + ' — Telegram: ' + (r.error_code || '') + ' ' + (r.description || ''));
    } catch (e) { log_('Фото не отправлены', chatId + ' ' + e); }
  }
}

function notifyCreated_(no, fromApp, chatId, msgId) {
  const d = getDocs_('', true).find(x => x.no === no);
  if (!d) return;
  const from = shopById_(d.fromId), to = shopById_(d.toId);
  const route = (d.supplier || d.from || '?') + ' → ' + (d.to || '?');
  const unknown = d.lines.filter(l => !l.name).length;
  const pcs = d.lines.reduce((a, l) => a + l.qty, 0);
  const icon = d.type === 'Поставка' ? '📦' : '🔄';
  if (d.status === 'Черновик') {
    const id = tgSend_(chatId, icon + ' Вижу ' + d.type.toLowerCase() + ', но ' + (!d.to ? 'не понял, <b>куда</b>' : 'не нашёл <b>товары с количеством</b>') +
      '.\nДополни в приложении → «Поставки», документ <b>' + no + '</b>.', msgId);
    rememberBotMsg_(no, chatId, id);
    return;
  }
  const body = icon + ' <b>' + d.type + ' ' + no + '</b>\n📍 ' + esc_(route) + '\n' + itemsText_(no) +
    '\n<i>' + d.lines.length + ' поз., ' + pcs + ' шт</i>' +
    (unknown ? '\n⚠️ Не узнал ' + unknown + ' поз. — проверь в приложении («Поставки»)' : '') +
    '\n👤 ' + esc_(d.by) + ' · статус: в пути 🚚';
  // в чат, откуда пришло сообщение (или чат отправителя, если создано в приложении)
  const srcChat = chatId || (from && from.chat);
  if (srcChat) rememberBotMsg_(no, srcChat, tgSend_(srcChat, (fromApp ? '' : '✅ Записал. ') + body, msgId));
  // в чат получателя — «к вам едет»
  if (to && to.chat && String(to.chat) !== String(srcChat)) {
    const id = d.type === 'Поставка'
      // поставка от поставщика — коротко, список товаров только в приложении
      ? tgSend_(to.chat, '📦 <b>Поставка ' + no + '</b> от ' + esc_(d.supplier || '?') + '\n' + d.lines.length + ' поз., ' + pcs + ' шт/уп' +
          '\nСписок и приёмка — в приложении → «Поставки».')
      : tgSend_(to.chat, '🚚 <b>К вам едет ' + d.type.toLowerCase() + ' ' + no + '</b> от ' + esc_(d.supplier || d.from) + '\n' +
          itemsText_(no) + '\nКогда приедет — открой приложение → «Поставки» → «Принять». Фото товара — ответом на это сообщение.');
    rememberBotMsg_(no, to.chat, id);
  }
  // фото к документу — альбомом в те же чаты
  const ph = docPhotos_(no, ['отправка', 'доп.', 'чат']);
  if (ph.length) {
    const cap = '📷 Фото к ' + no;
    if (srcChat) tgPhotos_(srcChat, ph, cap);
    if (to && to.chat && String(to.chat) !== String(srcChat)) tgPhotos_(to.chat, ph, cap);
  }
}

function notifyAccepted_(no, status, diffs, by) {
  const d = getDocs_('', true).find(x => x.no === no);
  const from = shopById_(d.fromId), to = shopById_(d.toId);
  const ok = status === 'Принято';
  const txt = (ok ? '✅ ' : '⚠️ ') + '<b>' + esc_(d.to) + ' приняла ' + no + '</b> (' + esc_(d.supplier || d.from) + ' → ' + esc_(d.to) + ')\n' +
    (ok ? 'Всё сходится 👌' : 'Расхождение:\n' + diffs.map(x => '• ' + esc_(x)).join('\n')) + '\n👤 ' + esc_(by);
  const sent = {};
  [from && from.chat, to && to.chat].forEach(c => { if (c && !sent[c]) { sent[c] = 1; tgSend_(c, txt); } });
  const ph = docPhotos_(no, ['приёмка']);
  if (ph.length) Object.keys(sent).forEach(c => tgPhotos_(c, ph, '📷 Приёмка ' + no));
  if (!ok && prop_('BOSS_CHAT')) tgSend_(prop_('BOSS_CHAT'), '📋 ' + txt);
}

/** Ежедневно: «В пути»/«Черновик» дольше STALE_DAYS — напомнить получателю и в штаб. */
function remindStale() {
  const docs = getDocs_('', true).filter(d => d.status === 'В пути' || d.status === 'Черновик' || d.status === 'Ожидается');
  const now = new Date();
  const stale = docs.filter(d => {
    const p = d.created.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!p) return false;
    return (now - new Date(+p[3], +p[2] - 1, +p[1])) / 864e5 >= STALE_DAYS;
  });
  if (!stale.length) return;
  stale.forEach(d => {
    const to = shopById_(d.toId);
    if (to && to.chat && d.status === 'В пути') tgSend_(to.chat, '⏳ ' + d.type + ' <b>' + d.no + '</b> от ' + esc_(d.supplier || d.from) +
      ' висит «в пути» с ' + d.created.slice(0, 5) + '. Приехало? Прими в приложении → «Поставки».');
  });
  if (prop_('BOSS_CHAT')) tgSend_(prop_('BOSS_CHAT'), '⏳ <b>Зависшие поставки/перемещения</b>\n' +
    stale.map(d => '• ' + d.no + ' ' + esc_((d.supplier || d.from) + ' → ' + d.to) + ' · ' + d.status + ' с ' + d.created.slice(0, 5)).join('\n'));
}

/* ════════════════════════ ТЕСТ РАЗБОРА (без отправки) ════════════════════════ */
function testParse() {
  const t = 'Перемещение\nМск > династия\nDuall - 14 шт\nVape cloud Lux - 22 шт ( по кассе 18)';
  const p = parseText_(t, null, shops_());
  Logger.log(JSON.stringify({ from: p.from && p.from.name, to: p.to && p.to.name, items: p.items, notes: p.notes }));
  p.items.forEach(it => Logger.log(it.raw + ' → ' + JSON.stringify(matchItem_(it.raw, p.from && p.from.name))));
}

/** Вручную: ещё раз отправить в чаты уведомление о последнем созданном документе (▶ Выполнить). */
function povtoritUvedomlenie() {
  const v = sheet_('docs').getDataRange().getValues();
  const no = String(v[v.length - 1][0] || '');
  if (!no) return;
  notifyCreated_(no, true);
  log_('Повтор уведомления', no);
}


/* ════════════════════════ ОБУЧЕНИЕ: прогресс каждого продавца ════════════════════════ */
// Лист «Обучение»: Продавец (ключ точка|имя) | Имя | Точка | Прочитано | Тесты сданы | Прогресс (JSON) | Обновлено
function learnSheet_() {
  const ss = getSS_();
  let sh = ss.getSheetByName('Обучение');
  if (!sh) {
    sh = ss.insertSheet('Обучение');
    sh.getRange(1, 1, 1, 7).setValues([['Продавец', 'Имя', 'Точка', 'Прочитано тем', 'Тестов сдано', 'Прогресс (не трогать)', 'Обновлено']])
      .setFontWeight('bold').setBackground('#E87A1E').setFontColor('#FFFFFF');
    sh.setFrozenRows(1); sh.setColumnWidths(1, 7, 140); sh.setColumnWidth(6, 60);
  }
  return sh;
}
function learnRow_(sh, user) {
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === user) return { row: i + 1, v: v[i] };
  return null;
}
function learnParse_(x) { try { const s = JSON.parse(x || '{}'); return { read: s.read || {}, quiz: s.quiz || {} }; } catch (e) { return { read: {}, quiz: {} }; } }
/** Слить два прогресса: прочитанное — объединение, тест — лучший результат, «сдан» — если сдан хоть раз. */
function learnMerge_(a, b) {
  const out = { read: Object.assign({}, a.read, b.read), quiz: Object.assign({}, a.quiz) };
  Object.keys(b.quiz || {}).forEach(k => {
    const x = out.quiz[k], y = b.quiz[k];
    if (!x) { out.quiz[k] = y; return; }
    out.quiz[k] = Object.assign({}, x, y, { best: Math.max(+x.best || 0, +y.best || 0), passed: !!(x.passed || y.passed) });
  });
  return out;
}
function learnGet_(user) {
  user = String(user || '').trim(); if (!user) return null;
  const r = learnRow_(learnSheet_(), user);
  return r ? learnParse_(r.v[5]) : null;
}
function learnSave_(user, name, point, state) {
  user = String(user || '').trim(); if (!user) return null;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = learnSheet_(), r = learnRow_(sh, user);
    const merged = learnMerge_(r ? learnParse_(r.v[5]) : { read: {}, quiz: {} }, learnParse_(JSON.stringify(state || {})));
    const row = [user, name || '', point || '', Object.keys(merged.read).length,
      Object.keys(merged.quiz).filter(k => merged.quiz[k].passed).length, JSON.stringify(merged), now_()];
    if (r) sh.getRange(r.row, 1, 1, 7).setValues([row]); else sh.appendRow(row);
    return merged;
  } finally { lock.releaseLock(); }
}
