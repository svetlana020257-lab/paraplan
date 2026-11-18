/**
 * ВСТАВКА В СКРИПТ КЭПА (Инструктор Кэп) — пересылка перемещений/поставок в скрипт «Поставки».
 *
 * 1. Вставь этот блок в любое место скрипта Кэпа (отдельным файлом «postavki.gs» в том же проекте — удобнее всего).
 * 2. В POSTAVKI_URL — адрес веб-приложения скрипта «Параплан — Поставки» (…/exec).
 * 3. В функции doPost(e) Кэпа самой первой строкой внутри try добавь:
 *
 *        forwardToPostavki_(JSON.parse(e.postData.contents));
 *
 * 4. «Развернуть» → «Управление развёртываниями» → карандаш → «Новая версия» → «Развернуть»
 *    (именно новая версия того же развёртывания — тогда вебхук Telegram менять не нужно).
 *
 * Что пересылается (обычные сообщения НЕ трогаются — перемещения создаются только в приложении):
 *  • один раз на каждый чат — его id и название (чтобы «Поставки» знали, куда писать «к вам едет»);
 *  • фото, отправленные ОТВЕТОМ на сообщение Кэпа о перемещении/поставке (фото товара к документу).
 * Всё остальное Кэп обрабатывает как раньше.
 */

const POSTAVKI_URL = 'ВСТАВЬ_СЮДА_URL_…/exec';

function forwardToPostavki_(update) {
  try {
    const m = update && (update.message || update.edited_message);
    if (!m) return;
    rememberChatForPostavki_(m.chat);
    const text = String(m.text || m.caption || '');
    const firstLine = text.split(/\r?\n/)[0];
    const isDoc = false;   // разбор текста выключен — перемещения только через приложение
    const isPhotoReply = !!(m.photo && m.reply_to_message && m.reply_to_message.from && m.reply_to_message.from.is_bot);
    if (!isDoc && !isPhotoReply) return;
    UrlFetchApp.fetch(POSTAVKI_URL, {
      method: 'post',
      contentType: 'text/plain',
      payload: JSON.stringify({ action: 'tg', message: m }),
      muteHttpExceptions: true
    });
  } catch (err) {
    // поставки не должны ломать Кэпа — молча пропускаем
  }
}

/** Один раз сообщить «Поставкам» id чата (по названию «Параплан Зорге 4» они поймут, какая это точка). */
function rememberChatForPostavki_(chat) {
  if (!chat || !chat.id || chat.type === 'private') return;
  const props = PropertiesService.getScriptProperties();
  const known = (props.getProperty('PV_CHATS') || '').split(',');
  if (known.indexOf(String(chat.id)) >= 0) return;
  const r = UrlFetchApp.fetch(POSTAVKI_URL, {
    method: 'post', contentType: 'text/plain', muteHttpExceptions: true,
    payload: JSON.stringify({ action: 'chat', chat: { id: chat.id, title: chat.title || '' } })
  });
  if (r.getResponseCode() === 200) { known.push(String(chat.id)); props.setProperty('PV_CHATS', known.filter(Boolean).join(',')); }
}
