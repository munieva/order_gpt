'use strict';
/* Мой мяч — форма-мастер заказа. Отправляет заявки в api.php в том же формате,
   что и прежние формы (index / football-logos / basketball-logos). */
(function () {
  const LEGAL_VERSION = '2026-10-11.1';
  const PHOTO_TERMS = 'Срок производства — 2–4 рабочих дня после утверждения макета и оплаты.';
  const LIMITS = { file: 10485760, vector: 26214400, total: 104857600, photos: 32, groups: 2, photoLogos: 20, logos: 32, texts: 20 };
  const STEPS = ['choose', 'ball', 'design', 'delivery', 'contacts'];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const form = $('#wizard');
  const el = name => form.elements[name];
  const val = name => { const e = el(name); return e ? String(e.value || '').trim() : ''; };

  const S = { sport: '', design: '', step: 'choose', photos: [], logos: [], texts: [], requisites: null };
  let models = {}, token = '', busy = false, seq = 0, requestId = uuid(), restoring = false;
  const urls = new Map();

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => b[i] = Math.random() * 256 | 0);
    b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const nextId = () => String(++seq);
  const fmtMB = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' КБ' : (n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace('.', ',') + ' МБ';
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return n + ' ' + (a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many); };
  const isLogo = () => S.design === 'logo';
  const isPhoto = () => S.design === 'photo';
  // Векторные файлы (логотипы и эмблемы): AI, EPS, CDR, SVG — до 25 МБ
  const VECTOR_RE = /\.(ai|eps|cdr|svg)$/i;
  const isVector = f => !!f && VECTOR_RE.test(f.name);
  const extOf = f => (f && f.name.split('.').pop() || '').toUpperCase();
  const model = () => models[val('model')] || null;

  /* ---------- ошибки ---------- */
  const errorBox = $('#error');
  function showError(msg, field) {
    errorBox.textContent = msg; errorBox.hidden = false;
    if (field) { field.classList.add('invalid'); field.focus({ preventScroll: true }); field.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    else errorBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }
  function clearError() { errorBox.hidden = true; $$('.invalid', form).forEach(x => x.classList.remove('invalid')); }
  function changed() { requestId = uuid(); $('#confirmed').checked = false; clearError(); scheduleSave(); renderSummary(); }

  /* ---------- видимость ---------- */
  function visible(node) { return !node.closest('[hidden]'); }
  function applyVisibility() {
    const tokens = new Set([S.sport, S.design].filter(Boolean));
    $$('[data-show]').forEach(n => { n.hidden = !n.dataset.show.split(' ').every(t => tokens.has(t)); });
    $$('[data-when]').forEach(n => {
      const [name, vals] = n.dataset.when.split('=');
      n.hidden = !vals.split('|').includes(val(name));
    });
    $$('[data-only-step]').forEach(n => { if (n.dataset.onlyStep !== S.step) n.hidden = true; });
    // мяч с фото — только футбольный (схема 32 панелей)
    const photoRadio = form.querySelector('input[name=design][value=photo]');
    const basket = S.sport === 'basketball';
    photoRadio.disabled = basket || busy;
    // Тиснение делаем только на баскетбольных мячах
    $('#logo-hint').textContent = 'Логотипы и надписи компании или клуба.' + (S.sport === 'basketball' ? ' Печать или тиснение.' : S.sport === 'football' ? ' Печать.' : '');
    $('#photo-note').textContent = basket ? 'Мяч с фото делаем на футбольном мяче' : 'Подарок команде, тренеру, выпускникам';
    const lbl = $('#progress li[data-for=design] .lbl');
    lbl.textContent = isPhoto() ? lbl.dataset.labelPhoto : lbl.dataset.labelLogo;
    $('#materials-text').innerHTML = isPhoto()
      ? 'Подтверждаю, что имею законные основания для передачи и использования материалов заказа, включая необходимые разрешения на фото других людей. Ознакомлен(а) с <a href="legal/materials.html" target="_blank" rel="noopener">правилами передачи материалов</a>.'
      : 'Подтверждаю, что имею права на использование логотипов, надписей и других материалов заказа. Ознакомлен(а) с <a href="legal/materials.html" target="_blank" rel="noopener">правилами передачи материалов</a>.';
    $('#confirmed-text').textContent = isPhoto()
      ? 'Я проверил(а) фото, фамилии, имена, номера панелей и надписи.'
      : 'Я проверил(а) модель, размер, количество мячей, логотипы и надписи.';
    $('#ball-subtitle').textContent = S.sport === 'basketball' ? 'Баскетбольный · с логотипом' : 'Футбольный';
    $('#production-terms').textContent = isPhoto() ? PHOTO_TERMS : (model() ? model().production : 'Выберите модель, чтобы увидеть ориентир по сроку производства.');
  }

  /* ---------- навигация ---------- */
  function go(step, push = true) {
    if (!STEPS.includes(step)) step = 'choose';
    if (step !== 'choose' && (!S.sport || !S.design)) step = 'choose';
    S.step = step;
    $$('.step').forEach(s => { s.hidden = s.dataset.step !== step; });
    const inWizard = step !== 'choose';
    $('#progress').hidden = !inWizard; $('#layout').hidden = !inWizard; $('#nav').hidden = !inWizard;
    const idx = STEPS.indexOf(step);
    $$('#progress li').forEach(li => {
      const i = STEPS.indexOf(li.dataset.for);
      li.classList.toggle('done', i < idx); li.classList.toggle('current', i === idx);
      if (i === idx) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    const last = step === 'contacts';
    $('#next-btn').hidden = last; $('#submit').hidden = !last;
    $('#next-btn').textContent = { ball: 'Далее: оформление', design: 'Далее: получение', delivery: 'Далее: контакты' }[step] || 'Далее';
    if (step === 'design' && isPhoto()) $('#next-btn').textContent = 'Далее: получение';
    if (step === 'ball' && isPhoto()) $('#next-btn').textContent = 'Далее';
    applyVisibility();
    if (last) renderReview();
    renderSummary();
    clearError();
    if (push && !restoring) { try { history.pushState({ step }, '', '#' + step); } catch (e) { /* file:// */ } }
    window.scrollTo({ top: 0, behavior: restoring ? 'auto' : 'smooth' });
    const h = $(`.step[data-step="${step}"] h1`); if (h && !restoring) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    scheduleSave();
  }
  window.addEventListener('popstate', e => { const st = e.state && e.state.step; if (st && !busy) go(st, false); });

  form.addEventListener('click', e => {
    const next = e.target.closest('[data-next]'); const back = e.target.closest('[data-back]'); const to = e.target.closest('[data-goto]');
    if (busy) return;
    if (next) { e.preventDefault(); if (validateStep(S.step)) go(STEPS[STEPS.indexOf(S.step) + 1]); }
    if (back) { e.preventDefault(); go(STEPS[Math.max(0, STEPS.indexOf(S.step) - 1)]); }
    if (to) { e.preventDefault(); go(to.dataset.goto); }
  });

  /* ---------- развилка ---------- */
  function syncChoice() {
    // Оформление выбирается по виду спорта: футбольный — редактор раскладки (лого, фото, текст), баскетбольный — логотипы.
    S.sport = val('sport'); S.design = S.sport === 'football' ? 'photo' : S.sport === 'basketball' ? 'logo' : '';
    form.querySelectorAll('input[name=design]').forEach(r => { r.checked = r.value === S.design; });
    const names = { football: 'Футбольный мяч', basketball: 'Баскетбольный мяч' };
    $('#choice-summary').textContent = S.sport && S.design ? names[S.sport] + (isPhoto() ? ' с фото' : ' с логотипом') : (S.sport ? names[S.sport] + ' — выберите оформление' : 'Выберите вид спорта и оформление');
    fillModels(); applyVisibility();
  }

  // Выбор вида спорта сразу открывает заказ (отдельного шага «Оформление» нет).
  $$('input[name=sport]', form).forEach(r => r.addEventListener('click', () => setTimeout(() => {
    if (busy) return; syncChoice(); if (S.design) { renderLogos(); renderPhotos(); go('ball'); changed(); }
  }, 0)));

  /* ---------- модели и размеры ---------- */
  function fillModels(keep) {
    const sel = el('model'); const prev = keep || sel.value;
    sel.replaceChildren(new Option('Выберите модель', ''));
    for (const [key, m] of Object.entries(models)) if (m.sport === S.sport) sel.add(new Option(m.title, key));
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    else if (sel.options.length === 2) sel.value = sel.options[1].value;
    syncModel();
  }
  function syncModel(keepSize) {
    const m = model(), box = $('#sizes'), prev = keepSize || (form.querySelector('input[name=size]:checked') || {}).value;
    box.replaceChildren();
    $('#model-description').textContent = m ? m.description : '';
    const link = $('#model-link'); link.hidden = !(m && m.url); if (m && m.url) link.href = m.url;
    if (!m) { const s = document.createElement('span'); s.className = 'hint'; s.textContent = 'Сначала выберите модель'; box.append(s); }
    else m.sizes.forEach(size => {
      const l = document.createElement('label'); l.className = 'pill';
      const i = document.createElement('input'); i.type = 'radio'; i.name = 'size'; i.value = size; i.required = true;
      if (size === prev || m.sizes.length === 1) i.checked = true;
      l.append(i, document.createTextNode(size === '3x3' ? 'Формат 3×3' : 'Размер ' + size)); box.append(l);
    });
    applyVisibility();
  }

  /* ---------- редактор раскладки мяча ---------- */
  // Две схемы: «32» — 32 отдельные панели; «groups» — панели 2+3 и 18+19 объединены в 33 и 35.
  // На одну панель — одно изображение. ФИО и номер на схему не наносятся.
  const PANELS = {"1":[146,94,"89,95 127,40 192,61 192,128 128,149"],"2":[276.5,94.5,"276.5,23 339,59 339,130 276.5,166 214,130 214,59"],"3":[423.5,94.5,"423.5,23 486,59 486,130 423.5,166 361,130 361,59"],"4":[555,95,"612,95 573,149 524,133 509,128 509,61 573,41"],"5":[350,229,"383,275 316,276 296,212 349,172 402,210 403,214"],"6":[350,361,"385,422 314,422 310,416 279,360 314,300 385,300 393,313 420,362"],"7":[349,509,"314,448 385,448 392,459 420,509 385,569 314,569 312,567 279,508"],"8":[349,641,"316,595 383,595 404,658 350,697 339,690 295,658"],"9":[175,309,"108,331 122,262 132,258 190,240 242,287 228,355 188,369 160,378"],"10":[217,436,"235,489 170,469 170,402 234,382 273,433 274,435 270,441"],"11":[83,436,"22,400 82,365 139,397 143,400 143,472 84,506 24,473 22,471"],"12":[175,562,"191,630 122,609 121,605 108,539 159,493 228,516 242,584"],"13":[524,308,"457,287 509,239 577,261 591,331 540,377 473,356 470,350"],"14":[483,434,"529,400 529,467 527,468 465,487 425,435 465,380"],"15":[616,434,"615,504 556,470 556,398 616,363 677,398 677,469"],"16":[524,561,"457,583 471,515 482,510 539,492 591,539 577,607 566,612 509,630"],"17":[144,775,"88,776 125,721 128,721 190,742 190,809 129,829 124,827"],"18":[276.5,776,"276.5,704 339,739.5 339,811 276.5,848 214,811 214,739.5"],"19":[424,776,"424,705 487,740 487,810 424,847 361.5,810 361.5,740"],"20":[556,775,"510,808 510,741 573,721 612,774 573,829"],"21":[349,910,"383,956 316,956 311,942 296,892 349,852 403,892"],"22":[350,1041,"314,981 385,981 388,985 420,1042 395,1086 386,1096 372,1102 326,1102 308,1093 279,1041"],"23":[349,1189,"314,1128 386,1129 420,1190 385,1250 314,1250 310,1244 279,1188"],"24":[350,1321,"316,1275 383,1274 403,1338 351,1378 296,1339"],"25":[175,989,"108,1011 122,943 130,939 190,920 242,967 228,1036 202,1045 160,1058"],"26":[216,1116,"235,1170 170,1150 170,1083 234,1063 274,1115"],"27":[83,1116,"143,1080 143,1152 141,1154 82,1187 22,1152 22,1081 26,1078 84,1046"],"28":[175,1241,"122,1288 108,1219 155,1176 160,1172 164,1173 228,1195 242,1263 196,1305 189,1310"],"29":[525,989,"510,920 575,941 579,947 592,1011 540,1058 472,1036 458,967"],"30":[483,1115,"425,1116 464,1061 529,1081 529,1148 527,1149 465,1168"],"31":[524,1241,"539,1172 591,1219 578,1286 576,1289 509,1310 457,1263 469,1206 473,1194"],"32":[616,1114,"556,1150 556,1078 617,1044 677,1079 677,1150 671,1154 616,1185"],"33":[349,95,"275,24 215,59 215,130 273,164 277,165 340,128 359,128 424,165 484,130 484,59 426,25 419,26 359,61 339,61"],"35":[346,775,"272,704 212,739 212,810 270,844 274,845 337,808 356,808 421,845 481,810 481,739 423,705 416,706 356,741 336,741"]};
  const UNIONS = { 33: [2, 3], 35: [18, 19] };
  const PENTAGONS = [1, 4, 5, 8, 10, 14, 17, 20, 21, 24, 26, 30];
  const VALVE = 22; // техническая панель: ниппель и логотип фабрики — клиент её не заполняет
  const LAYOUTS = {
    '32': { base: 'assets/s32v2-scheme.png', big: 'assets/s32v2-scheme-big.png', panels: Array.from({ length: 32 }, (_, i) => i + 1).filter(n => n !== 22) },
    groups: { base: 'assets/s32v2-groups.png', big: 'assets/s32v2-groups-big.png', panels: [1, 33, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 35, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32] }
  };
  const TYPES = { regular: 'Индивидуальное', group: 'Групповое', main: 'Главное', logo: 'Логотип / эмблема', text: 'Текст' };
  const RASTER = { jpg: 1, jpeg: 1, png: 1, webp: 1 }, VECT = { svg: 1, ai: 1, eps: 1, cdr: 1, pdf: 1 };
  const SVGNS = 'http://www.w3.org/2000/svg';
  S.layout = '32'; S.view = 'flat'; S.tpl = null; S.tplColor = null;
  // Шаблон из витрины (?template=…&color=…): узор шаблона — фон схемы, заполнять можно только места шаблона.
  // «Свободный» шаблон (подложка): узор под всей схемой, заполнять можно любую панель, схемы 32 и 30 доступны.
  const fixedTpl = () => !!S.tpl && !S.tpl.free;
  const tplSlot = n => !fixedTpl() ? '' : S.tpl.slots.photo.includes(+n) ? 'photo' : S.tpl.slots.text.includes(+n) ? 'text' : '';
  const layoutPanels = () => fixedTpl() ? [...S.tpl.slots.photo, ...S.tpl.slots.text].sort((a, b) => a - b) : LAYOUTS[S.layout].panels;
  const itemAt = n => S.photos.find(p => +p.panel === +n);
  const fullName = p => (p.caption || [p.surname, p.first, p.patronymic].map(x => (x || '').trim()).filter(Boolean).join(' ') || '').trim();
  const shapeName = n => UNIONS[n] ? 'Сдвоенная панель (' + UNIONS[n].join(' + ') + ')' : PENTAGONS.includes(+n) ? 'Пятиугольная панель' : +n === VALVE ? 'Шестиугольная панель с ниппелем' : 'Шестиугольная панель';
  const extName = f => (f && f.name.includes('.') ? f.name.split('.').pop() : '').toLowerCase();
  const isSvg = f => extName(f) === 'svg';
  const isImg = f => !!f && !!RASTER[extName(f)];
  const isPerson = () => true;
  // Групповое фото — только на сдвоенных панелях 33 и 35 (не больше двух), и на них — только групповое.
  // В шаблоне: на месте «фото» — фото (не логотип и не групповое), на месте «текст» — надпись или логотип.
  const fixType = (panel, type) => {
    const k = tplSlot(panel);
    if (k === 'text') return type === 'text' ? 'text' : 'logo';
    if (k === 'photo') return type === 'text' ? 'text' : (type === 'group' || type === 'logo') ? 'regular' : type;
    return type === 'text' ? 'text' : UNIONS[panel] ? 'group' : (type === 'group' ? 'regular' : type);
  };

  // --- проверка файла: формат по содержимому, размер, безопасность ---
  async function readHead(f, n) { return new Uint8Array(await f.slice(0, n).arrayBuffer()); }
  const startsWith = (b, sig) => sig.every((v, i) => b[i] === v);
  const ascii = b => String.fromCharCode.apply(null, Array.from(b));
  async function checkFile(f) {
    const ext = extName(f);
    if (!RASTER[ext] && !VECT[ext]) return 'Нужен JPG, PNG, WebP или вектор CDR, AI, EPS, SVG, PDF.';
    if (RASTER[ext] && f.size > LIMITS.file) return 'Фото должно быть до 10 МБ.';
    if (f.size > LIMITS.vector) return 'Файл должен быть до 25 МБ.';
    if (f.size < 16) return 'Файл пустой или повреждён.';
    const h = await readHead(f, 4096), a = ascii(h.slice(0, 16));
    const bad = 'Содержимое файла не совпадает с форматом .' + ext + '. Сохраните его заново.';
    if (ext === 'jpg' || ext === 'jpeg') { if (!startsWith(h, [0xFF, 0xD8, 0xFF])) return bad; }
    else if (ext === 'png') { if (!startsWith(h, [0x89, 0x50, 0x4E, 0x47])) return bad; }
    else if (ext === 'webp') { if (a.slice(0, 4) !== 'RIFF' || a.slice(8, 12) !== 'WEBP') return bad; }
    else if (ext === 'pdf') { if (a.slice(0, 5) !== '%PDF-') return bad; }
    else if (ext === 'ai') { if (a.slice(0, 5) !== '%PDF-' && a.slice(0, 4) !== '%!PS') return bad; }
    else if (ext === 'eps') { if (a.slice(0, 4) !== '%!PS' && !startsWith(h, [0xC5, 0xD0, 0xD3, 0xC6])) return bad; }
    else if (ext === 'cdr') { if (!(a.slice(0, 4) === 'RIFF' && a.slice(8, 11) === 'CDR') && !startsWith(h, [0x50, 0x4B, 0x03, 0x04])) return bad; }
    if (ext === 'svg') {
      const t = await f.text();
      if (!/<svg[\s>]/i.test(t)) return bad;
      if (/<script|<!ENTITY|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|javascript:|data:text\/html/i.test(t) || /(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|file:)/i.test(t)) return 'SVG содержит скрипты или внешние ссылки. Сохраните файл заново без них.';
    }
    if (ext === 'pdf' || (ext === 'ai' && a.startsWith('%PDF'))) {
      for (let off = 0; off < f.size; off += 4 << 20) {
        const chunk = ascii(new Uint8Array(await f.slice(Math.max(0, off - 32), off + (4 << 20)).arrayBuffer()));
        if (/\/(JavaScript|JS|Launch|SubmitForm|ImportData)\b/.test(chunk)) return 'Файл содержит встроенные скрипты. Сохраните его заново без них.';
      }
    }
    if (RASTER[ext]) {
      try { const b = await createImageBitmap(f); const big = b.width * b.height > 50e6; if (b.close) b.close(); if (big) return 'Фото больше 50 мегапикселей — уменьшите его.'; }
      catch (e) { return 'Не удалось открыть изображение — файл повреждён.'; }
    }
    return '';
  }

  // --- превью: растр уменьшаем до 480 px по одному; SVG показываем как картинку; остальное — значок формата ---
  const smallQ = []; let smallBusy = false;
  function thumbUrl(item) {
    if (!item.file) return '';
    if (urls.has(item.id)) return urls.get(item.id);
    if (isSvg(item.file)) { const u = URL.createObjectURL(item.file); urls.set(item.id, u); return u; }
    if (!isImg(item.file)) return '';
    if (!smallQ.includes(item)) { smallQ.push(item); pumpSmall(); }
    return '';
  }
  async function pumpSmall() {
    if (smallBusy) return; smallBusy = true;
    while (smallQ.length) {
      const it = smallQ.shift(); if (urls.has(it.id) || !it.file) continue;
      const file = it.file; let url = '';
      try {
        const bmp = await createImageBitmap(file);
        const s = Math.min(1, 480 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
        const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)); if (b) url = URL.createObjectURL(b);
      } catch (e) { /* старый браузер — покажем оригинал */ }
      if (it.file !== file) { if (url) URL.revokeObjectURL(url); continue; }
      urls.set(it.id, url || URL.createObjectURL(file));
      $$(`#logos [data-id="${it.id}"] .thumb img`).forEach(i => { i.src = urls.get(it.id); });
      renderPhotos(); if (card.item && card.item.id === it.id) renderCardPreview();
    }
    smallBusy = false;
  }
  function dropUrl(id) { const u = urls.get(id); if (u) URL.revokeObjectURL(u); urls.delete(id); }

  // --- разбор имени файла: «7-Иванов Иван Петрович 10.jpg» ---
  function parseFileName(name) {
    let base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    const r = { panel: '', caption: '', number: '', type: 'regular' };
    const kp = base.match(/(?:^|\s)панель\s*№?\s*(\d{1,2})(?=\s|$)/i);
    if (kp) { r.panel = kp[1]; base = base.replace(kp[0], ' ').replace(/\s+/g, ' ').trim(); }
    const kn = base.match(/(?:^|\s)(?:номер|№)\s*(\d{1,3})(?=\s|$)/i);
    if (kn) { base = (base.replace(kn[0], ' ').replace(/\s+/g, ' ').trim() + ' ' + kn[1]).trim(); }
    const m = base.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*[-–.)]\s*(.+)$/);
    if (m) { r.panel = m[2] ? ({ '2-3': '33', '18-19': '35' }[m[1] + '-' + m[2]] || '') : m[1]; base = m[3].trim(); }
    if (/эмблем|логотип|герб|logo/i.test(base)) { r.type = 'logo'; return r; }
    if (UNIONS[r.panel]) r.type = 'group';
    const n = base.match(/^(.*?)\s+(\d{1,3})$/);
    if (n) { r.number = n[2]; base = n[1].trim(); }
    if (/^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё-]*(?: [A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё-]*){1,2}$/.test(base)) r.caption = base;
    else if (!kn) r.number = '';
    return r;
  }

  // --- загрузка сразу нескольких файлов: по номеру из имени или на первую свободную панель ---
  async function addPhotoFiles(files) {
    const skipped = [];
    for (const file of files) {
      const err = await checkFile(file);
      if (err) { skipped.push(file.name + ' — ' + err); continue; }
      const parsed = parseFileName(file.name), panels = layoutPanels();
      let panel = panels.includes(+parsed.panel) && !itemAt(parsed.panel) ? String(parsed.panel) : '';
      if (!panel) {
        const want = fixedTpl() ? (parsed.type === 'logo' || VECT[extName(file)] ? 'text' : 'photo') : '';
        const free = panels.find(n => !itemAt(n) && !UNIONS[n] && (!want || tplSlot(n) === want));
        if (!free) { skipped.push(file.name + ' — ' + (want === 'photo' ? 'свободных мест под фото в шаблоне нет' : want === 'text' ? 'свободных мест под логотип в шаблоне нет' : 'свободных панелей нет')); continue; }
        panel = String(free);
      }
      S.photos.push({ id: nextId(), file, panel, type: fixType(panel, parsed.type), caption: parsed.caption, number: parsed.number, auto: true });
    }
    renderPhotos(); changed();
    if (skipped.length) showError('Не добавлены: ' + skipped.join('; ') + '.');
  }

  // --- схема (плоская раскладка) ---
  function svgEl(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function bbox(n) {
    const xs = [], ys = []; PANELS[n][2].split(' ').forEach(pt => { const [x, y] = pt.split(','); xs.push(+x); ys.push(+y); });
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  // --- поворот: угол −180…180, размер картинки «с запасом», чтобы после поворота панель была закрыта целиком ---
  const normRot = r => { r = Math.round(+r || 0) % 360; if (r > 180) r -= 360; if (r <= -180) r += 360; return r; };
  function coverSize(bw, bh, iw, ih, rot) {
    const a = rot * Math.PI / 180, c = Math.abs(Math.cos(a)), si = Math.abs(Math.sin(a));
    const ex = bw * c + bh * si, ey = bw * si + bh * c, k = Math.max(ex / iw, ey / ih);
    return { w: iw * k, h: ih * k };
  }
  const dims = new Map();
  function dimsOf(u) {
    if (!u) return null; if (dims.has(u)) return dims.get(u);
    dims.set(u, null); const i = new Image(); i.onload = () => { dims.set(u, { w: i.naturalWidth || 1, h: i.naturalHeight || 1 }); renderScheme(); if (card.n) renderCardPreview(); }; i.src = u;
    return null;
  }
  const rotLabel = r => r ? (r > 0 ? 'поворот ' + r + '° по часовой' : 'поворот ' + (-r) + '° против часовой') : '';
  // масштаб (30–300 %, 100 % — фото закрывает панель целиком) и сдвиг (доля ширины/высоты панели)
  const ZMIN = 30, ZMAX = 300;
  const normZoom = z => Math.min(ZMAX, Math.max(ZMIN, Math.round(+z || 100)));
  const normOff = v => Math.max(-1, Math.min(1, Math.round((+v || 0) * 100) / 100));
  const posOf = it => ({ rot: normRot(it && it.rot), zoom: normZoom(it && it.zoom), dx: normOff(it && it.dx), dy: normOff(it && it.dy) });
  function place(bx, by, bw, bh, iw, ih, it) {
    const q = posOf(it), z = coverSize(bw, bh, iw, ih, q.rot), k = q.zoom / 100;
    return { w: z.w * k, h: z.h * k, cx: bx + bw / 2 + q.dx * bw, cy: by + bh / 2 + q.dy * bh, rot: q.rot };
  }
  const shiftWord = (v, plus, minus) => v ? (v > 0 ? plus : minus) + ' на ' + Math.round(Math.abs(v) * 100) + '%' : '';
  function posLabel(it) {
    const q = posOf(it), parts = [];
    if (q.rot) parts.push(rotLabel(q.rot));
    if (q.zoom !== 100) parts.push('масштаб ' + q.zoom + '%');
    const sh = [shiftWord(q.dx, 'вправо', 'влево'), shiftWord(q.dy, 'вниз', 'вверх')].filter(Boolean);
    if (sh.length) parts.push('сдвиг ' + sh.join(' и '));
    return parts.join(', ');
  }
  function renderScheme() {
    const svg = $('#pe-svg'); if (!svg) return;
    svg.replaceChildren(svgEl('image', { href: S.tpl ? (tplArt.flat || '') : LAYOUTS[S.layout].base, x: 0, y: 0, width: 700, height: 1405 }));
    const defs = svgEl('defs', {}); svg.append(defs);
    layoutPanels().forEach(n => {
      const p = itemAt(n), [cx, cy, pts] = PANELS[n];
      const g = svgEl('g', { class: 'pe-p' + (p ? (p.auto ? ' check' : ' busy') : ' free'), 'data-n': n, tabindex: '0', role: 'button',
        'aria-label': 'Панель ' + n + (n === VALVE ? ' (с ниппелем)' : '') + (fixedTpl() ? (tplSlot(n) === 'photo' ? ' — место для фото' : ' — место для текста или логотипа') : '') + (p ? ': ' + (fullName(p) || TYPES[p.type]) + (p.auto ? ', проверьте данные' : ', занята') : ', свободна — нажмите, чтобы добавить') });
      const t = svgEl('title', {}); t.textContent = 'Панель ' + n + (p ? ' — занята' + (p.auto ? ', проверьте данные' : '') : ' — свободна'); g.append(t);
      if (p) {
        const cp = svgEl('clipPath', { id: 'pec-' + n }); cp.append(svgEl('polygon', { points: pts })); defs.append(cp);
        const u = thumbUrl(p), b = bbox(n);
        const q = posOf(p), rot = q.rot, d = u ? dimsOf(u) : null;
        if (u && d) {
          const z = place(b.x, b.y, b.w, b.h, d.w, d.h, p), clip = svgEl('g', { 'clip-path': 'url(#pec-' + n + ')' });
          if (q.zoom < 100 || q.dx || q.dy) clip.append(svgEl('polygon', { points: pts, fill: '#fff' }));
          clip.append(svgEl('image', { href: u, x: z.cx - z.w / 2, y: z.cy - z.h / 2, width: z.w, height: z.h, preserveAspectRatio: 'none', transform: rot ? 'rotate(' + rot + ' ' + z.cx + ' ' + z.cy + ')' : '' }));
          g.append(clip);
        }
        else if (u) g.append(svgEl('image', { href: u, x: b.x, y: b.y, width: b.w, height: b.h, preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'url(#pec-' + n + ')' }));
        else if (!p.file) {
          g.append(svgEl('polygon', { points: pts, class: 'pe-vec' }));
          const lbl = svgEl('text', { x: cx, y: cy - 4, class: 'pe-ext', transform: rot ? 'rotate(' + rot + ' ' + cx + ' ' + cy + ')' : '' }); lbl.textContent = 'ТЕКСТ'; g.append(lbl);
        }
        else {
          g.append(svgEl('polygon', { points: pts, class: 'pe-vec' }));
          const fx = svgEl('text', { x: cx, y: cy - 4, class: 'pe-ext' }); fx.textContent = extName(p.file).toUpperCase() || 'ФАЙЛ'; g.append(fx);
        }
      }
      g.append(svgEl('polygon', { points: pts, class: 'pe-hit' }));
      if (p) {
        g.append(svgEl('circle', { cx, cy: cy + 30, r: 25, class: 'pe-badge' }));
        const tx = svgEl('text', { x: cx, y: cy + 39, class: 'pe-num' }); tx.textContent = n; g.append(tx);
      } else if (fixedTpl()) {
        g.append(svgEl('circle', { cx, cy: cy + 38, r: 18, class: 'pe-tnum ' + (tplSlot(n) === 'photo' ? 'ph' : 'tx') }));
        const tn = svgEl('text', { x: cx, y: cy + 45, class: 'pe-tnum-t' }); tn.textContent = n; g.append(tn);
      } else {
        if (S.tpl) { const fn = svgEl('text', { x: cx, y: cy + 11, class: 'pe-fnum' }); fn.textContent = n; g.append(fn); }
        const plus = svgEl('text', { x: cx, y: cy + 42, class: 'pe-plus' }); plus.textContent = '+'; g.append(plus);
      }
      if (S.tpl && UNIONS[n]) g.insertBefore(svgEl('polygon', { points: pts, class: 'pe-union' }), g.firstChild.nextSibling);
      svg.append(g);
    });
    // техническая панель 22 — заблокирована
    const [tx, ty, tpts] = PANELS[VALVE];
    const tg = svgEl('g', { class: 'pe-p tech', 'data-n': VALVE, role: 'img', 'aria-label': 'Панель 22 — техническая: ниппель и логотип фабрики, недоступна для заполнения' });
    const tt = svgEl('title', {}); tt.textContent = 'Панель 22 — техническая (ниппель и логотип фабрики). Не заполняется.'; tg.append(tt);
    tg.append(svgEl('polygon', { points: tpts, class: 'pe-tech' }));
    const te = svgEl('text', { x: tx, y: ty - 45, class: 'pe-tech-t' }); te.textContent = 'техническая'; tg.append(te);
    svg.append(tg);
  }
  function renderList() {
    const list = $('#pe-list'); if (!list) return;
    list.replaceChildren(...[...S.photos].sort((a, b) => +a.panel - +b.panel).map(p => {
      const li = document.createElement('li'), btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'pe-row' + (p.auto ? ' check' : ''); btn.dataset.n = p.panel;
      const th = document.createElement('span'); th.className = 'pe-row-thumb';
      const u = thumbUrl(p); if (u) { const i = document.createElement('img'); i.src = u; i.alt = ''; const q = posOf(p); if (q.rot || q.zoom !== 100) i.style.transform = 'rotate(' + q.rot + 'deg) scale(' + q.zoom / 100 + ')'; th.append(i); } else th.textContent = p.file ? extName(p.file).toUpperCase() : 'Т';
      const n = document.createElement('b'); n.textContent = p.panel;
      const tx = document.createElement('span'); tx.className = 'pe-row-text';
      tx.textContent = (fullName(p) || '—') + (p.number ? ' · №' + p.number : '') + ' · ' + TYPES[p.type] + (normRot(p.rot) ? ' · ↻ ' + normRot(p.rot) + '°' : '') + (posOf(p).zoom !== 100 ? ' · ' + posOf(p).zoom + '%' : '') + (+p.panel === VALVE ? ' · ниппель' : '');
      const st = document.createElement('span'); st.className = 'pe-row-st'; st.textContent = p.auto ? 'проверьте' : 'изменить';
      btn.append(th, n, tx, st); li.append(btn); return li;
    }));
  }
  function renderStatus() {
    const total = layoutPanels().length, used = S.photos.length, check = S.photos.filter(p => p.auto).length;
    $('#pe-status').textContent = 'Занято ' + used + ' из ' + total + (check ? ' · ' + plural(check, 'панель ждёт', 'панели ждут', 'панелей ждут') + ' проверки' : '') + (used < total ? ' · нажмите на свободную панель, чтобы добавить изображение' : '');
    $('#photo-count').textContent = 'Размещено: ' + used + (check ? ' · проверьте отмеченные' : '');
    $('#photo-count').parentElement.hidden = !used;
    $$('[data-layout]').forEach(b => b.setAttribute('aria-pressed', b.dataset.layout === S.layout ? 'true' : 'false'));
    $('#pe-layout-seg').hidden = fixedTpl(); renderTplBar();
    $$('[data-tpl]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tpl ? !!S.tpl && S.tpl.id === b.dataset.tpl : !S.tpl)));
    $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === S.view ? 'true' : 'false'));
  }
  function renderPhotos() { renderScheme(); renderList(); renderStatus(); queue3d(); }
  function checkPanels() { return new Set(); }

  // --- переключатели схемы и вида ---
  $$('[data-layout]').forEach(b => b.addEventListener('click', () => {
    const to = b.dataset.layout; if (to === S.layout || busy || fixedTpl()) return;
    const blocked = S.photos.filter(p => !LAYOUTS[to].panels.includes(+p.panel)).map(p => p.panel);
    if (blocked.length) return showError('Чтобы сменить схему, освободите ' + (blocked.length > 1 ? 'панели ' : 'панель ') + blocked.sort((a, b) => a - b).join(', ') + (blocked.length > 1 ? ' — в другой схеме их нет.' : ' — в другой схеме её нет.'));
    S.layout = to; clearError(); renderPhotos(); changed();
  }));
  $$('[data-view]').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.view; show3d(S.view === '3d'); renderStatus(); }));

  // --- рисование раскладки на холсте (3D-текстура и схема для дизайнера) ---
  function loadImg(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
  async function drawLayout(W, H, opts = {}) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), kx = W / 700, ky = H / 1405;
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    const base = S.tpl ? tplArt.big : await loadImg(LAYOUTS[S.layout].big); if (base) x.drawImage(base, 0, 0, W, H);
    const pts = n => PANELS[n][2].split(' ').map(s => { const [a, b] = s.split(','); return [a * kx, b * ky]; });
    for (const p of S.photos) {
      const n = +p.panel; if (!PANELS[n]) continue;
      const P = pts(n), x0 = Math.min(...P.map(q => q[0])), y0 = Math.min(...P.map(q => q[1])), x1 = Math.max(...P.map(q => q[0])), y1 = Math.max(...P.map(q => q[1]));
      x.save(); x.beginPath(); P.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); x.clip();
      const u = p.file && (opts.svg !== false || !isSvg(p.file)) ? thumbUrl(p) : '';
      const im = u ? await loadImg(u) : null;
      const q = posOf(p), rot = q.rot;
      if (im) { const z = place(x0, y0, x1 - x0, y1 - y0, im.width, im.height, p); x.fillStyle = '#fff'; x.fillRect(x0, y0, x1 - x0, y1 - y0); x.translate(z.cx, z.cy); x.rotate(rot * Math.PI / 180); x.drawImage(im, -z.w / 2, -z.h / 2, z.w, z.h); }
      else if (!p.file) { x.fillStyle = '#fff'; x.fillRect(x0, y0, x1 - x0, y1 - y0); x.fillStyle = '#17171b'; x.textAlign = 'center'; x.textBaseline = 'middle'; let fs = Math.round(30 * kx); x.font = 'bold ' + fs + 'px Arial'; const t = fullName(p); while (x.measureText(t).width > (x1 - x0) * 0.8 && fs > 8) { fs--; x.font = 'bold ' + fs + 'px Arial'; } fs = Math.max(6, Math.round(fs * q.zoom / 100)); x.font = 'bold ' + fs + 'px Arial'; x.translate((x0 + x1) / 2 + q.dx * (x1 - x0), (y0 + y1) / 2 + q.dy * (y1 - y0)); x.rotate(rot * Math.PI / 180); x.fillText(t, 0, 0); x.textBaseline = 'alphabetic'; }
      else { x.fillStyle = '#fceef0'; x.fillRect(x0, y0, x1 - x0, y1 - y0); x.fillStyle = '#c20e2c'; x.font = 'bold ' + Math.round(26 * kx) + 'px Arial'; x.textAlign = 'center'; x.fillText(extName(p.file).toUpperCase() || 'ФАЙЛ', (x0 + x1) / 2, (y0 + y1) / 2 - 10 * ky); }
      x.restore();
      if (opts.badges) {
        x.beginPath(); P.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); x.lineWidth = 4 * kx; x.strokeStyle = '#c20e2c'; x.stroke();
        const cx = PANELS[n][0] * kx, cy = (PANELS[n][1] + 30) * ky;
        x.beginPath(); x.arc(cx, cy, 22 * kx, 0, 7); x.fillStyle = '#c20e2c'; x.fill(); x.lineWidth = 3 * kx; x.strokeStyle = '#fff'; x.stroke();
        x.fillStyle = '#fff'; x.font = 'bold ' + Math.round(22 * kx) + 'px Arial'; x.textAlign = 'center'; x.fillText(String(n), cx, cy + 8 * kx);
      }
    }
    // узор-подложка: для дизайнера подписываем номера и пустых панелей
    if (opts.badges && S.tpl && S.tpl.free) {
      x.textAlign = 'center'; x.font = 'bold ' + Math.round(28 * kx) + 'px Arial'; x.lineWidth = 5 * kx; x.strokeStyle = '#fff'; x.fillStyle = '#c20e2c';
      layoutPanels().filter(n => !itemAt(n)).forEach(n => { const cx = PANELS[n][0] * kx, cy = (PANELS[n][1] + 10) * ky; x.strokeText(String(n), cx, cy); x.fillText(String(n), cx, cy); });
    }
    return c;
  }

  // --- 3D-мяч: скрипт и модель грузятся только при открытии ---
  let viewer = null, viewerLoading = null, texTimer = 0;
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script')); document.head.append(s); }); }
  async function show3d(on) {
    const box = $('#pe-3d'), svg = $('#pe-svg');
    box.hidden = !on; svg.style.display = on ? 'none' : '';
    if (!on) { if (viewer) viewer.autoRotate(false); return; }
    const msg = $('#pe-3d-msg');
    try {
      if (!viewer) {
        msg.hidden = false; msg.textContent = 'Загружаем 3D-модель…';
        viewerLoading = viewerLoading || (async () => { if (!window.MoyMyach3D) await loadScript('ball3d.js?v=1'); return window.MoyMyach3D.create(box, 'assets/ball32.fbx'); })();
        viewer = await viewerLoading; msg.hidden = true;
      }
      viewer.autoRotate(true); await updateTexture();
    } catch (e) { viewerLoading = null; msg.hidden = false; msg.textContent = '3D-просмотр не поддерживается этим браузером. Плоская раскладка показывает всё то же самое.'; }
  }
  async function updateTexture() {
    if (!viewer) return;
    try { viewer.setTexture(await drawLayout(2048, 4114)); }
    catch (e) { try { viewer.setTexture(await drawLayout(2048, 4114, { svg: false })); } catch (x) { /* текстура не обязательна */ } }
  }
  function queue3d() { if (!viewer || S.view !== '3d') return; clearTimeout(texTimer); texTimer = setTimeout(updateTexture, 300); }

  // --- шаблон из витрины: перекраска узора и места под фото/надписи ---
  let TPLS = null; const tplArt = { key: '', big: null, flat: '' }; let tplJob = 0;
  const tplLabel = () => S.tpl ? S.tpl.code + ' «' + S.tpl.title + '»' + (S.tplColor ? ', цвет узора: ' + S.tplColor.name.toLowerCase() : ', узор-подложка') : '';
  const colorNote = () => 'Как в шаблоне ' + S.tpl.code + (S.tplColor ? ': ' + S.tplColor.name.toLowerCase() : '');
  async function applyTemplate(id, colorId, quiet) {
    try {
      await loadTemplates();
      const t = TPLS[id]; if (!t) return false;
      if (!window.MMRecolor) await loadScript('tpl/template-render.js?v=3');
      S.tpl = { id, ...t }; if (!t.free) S.layout = '32';
      S.tplColor = (t.colors || []).find(c => c.id === colorId) || (t.colors || [])[0] || null;
      if (!el('colors').value.trim()) el('colors').value = colorNote();
      await paintTemplate();
      renderPhotos(); if (!quiet) changed();
      return true;
    } catch (e) { S.tpl = null; S.tplColor = null; return false; }
  }
  async function loadTemplates() {
    if (!TPLS) TPLS = await fetch('tpl/templates.json?v=5', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    renderTplPicker(); return TPLS;
  }
  // карточки шаблонов: в боковой колонке и (на телефоне) над редактором
  function renderTplPicker() {
    const ids = Object.keys(TPLS || {});
    $('#pe-pick').hidden = !ids.length;
    [['#tpls-grid', false], ['#pe-pick-grid', true]].forEach(([sel]) => {
      const box = $(sel); if (!box) return;
      const mk = (id, t) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'tpl-card' + (id ? '' : ' none'); b.dataset.tpl = id;
        b.setAttribute('aria-pressed', String(id ? !!S.tpl && S.tpl.id === id : !S.tpl));
        if (id) { const i = document.createElement('img'); i.src = 'tpl/' + (t.thumb || '') + '?v=1'; i.alt = ''; i.loading = 'lazy'; i.width = 160; i.height = 160; const n = document.createElement('b'); n.textContent = t.title; const c = document.createElement('small'); c.textContent = t.code + ' · ' + (t.free ? 'любые панели' : t.slots.photo.length + ' фото'); b.append(i, n, c); }
        else { const n = document.createElement('b'); n.textContent = 'Без шаблона'; b.append(n); }
        return b;
      };
      box.replaceChildren(...ids.map(id => mk(id, TPLS[id])), mk('', null));
      if (!ids.length) box.closest('section, .pe-pick').hidden = true;
    });
  }
  // перед сменой схемы на шаблон: элементы с панелей-узора переносим на свободные места шаблона
  function kindOf(p) { return p.file && p.type !== 'logo' && p.type !== 'text' && !VECT[extName(p.file)] ? 'photo' : 'text'; }
  function fitToTemplate(t) {
    if (t.free) return { plan: [] };
    const ok = n => t.slots.photo.includes(+n) ? 'photo' : t.slots.text.includes(+n) ? 'text' : '';
    const stay = S.photos.filter(p => ok(p.panel) === kindOf(p)), move = S.photos.filter(p => !stay.includes(p));
    const used = new Set(stay.map(p => +p.panel)), plan = [];
    for (const p of move) {
      const k = kindOf(p), free = t.slots[k].find(n => !used.has(n));
      if (!free) return { error: 'В шаблоне «' + t.title + '» ' + t.slots.photo.length + ' мест под фото и ' + t.slots.text.length + ' — под надписи и логотипы. Сейчас на мяче ' + S.photos.filter(x => kindOf(x) === k).length + (k === 'photo' ? ' фото' : ' надписей и логотипов') + ' — удалите лишние, чтобы выбрать шаблон.' };
      used.add(free); plan.push([p, free]);
    }
    return { plan };
  }
  async function chooseTemplate(id) {
    if (busy) return;
    if (!id) { if (S.tpl) removeTemplate(); return; }
    if (S.tpl && S.tpl.id === id) return;
    await loadTemplates(); const t = TPLS[id]; if (!t) return;
    const fit = fitToTemplate(t); if (fit.error) return showError(fit.error);
    clearError();
    const keep = S.tplColor && (t.colors || []).some(c => c.id === S.tplColor.id) ? S.tplColor.id : null;
    if (S.tpl && el('colors').value.startsWith('Как в шаблоне ' + S.tpl.code)) el('colors').value = '';
    fit.plan.forEach(([p, n]) => { p.panel = String(n); p.auto = true; p.type = fixType(n, p.type); });
    if (!t.free) S.layout = '32';
    if (!(await applyTemplate(id, keep, true))) return showError('Не удалось загрузить шаблон. Обновите страницу.');
    S.photos.forEach(p => { p.type = fixType(p.panel, p.type); });
    renderPhotos(); changed();
    if (fit.plan.length) showError('Перенесли ' + plural(fit.plan.length, 'элемент', 'элемента', 'элементов') + ' на места шаблона — они отмечены оранжевым, проверьте их.');
  }
  function removeTemplate() {
    if (S.tpl && el('colors').value.startsWith('Как в шаблоне ' + S.tpl.code)) el('colors').value = '';
    S.tpl = null; S.tplColor = null; tplArt.key = '';
    try { const u = new URL(location.href); u.searchParams.delete('template'); u.searchParams.delete('color'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (x) { /* noop */ }
    renderPhotos(); changed();
  }
  ['#tpls-grid', '#pe-pick-grid'].forEach(sel => $(sel).addEventListener('click', e => { const b = e.target.closest('[data-tpl]'); if (b) chooseTemplate(b.dataset.tpl); }));
  async function paintTemplate() {
    if (!S.tpl) return;
    const key = S.tpl.id + ':' + (S.tplColor ? S.tplColor.id : '-'); if (tplArt.key === key) return;
    const job = ++tplJob, hint = $('#pe-tpl-hint'); hint.textContent = 'Перекрашиваем узор…';
    const img = await loadImg('tpl/' + S.tpl.layout + '?v=1'); if (!img) throw new Error('tpl');
    const c = document.createElement('canvas'); c.width = 2048; c.height = 4114;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 2048, 4114);
    if (S.tplColor) window.MMRecolor(x, 2048, 4114, S.tpl.baseHue, S.tplColor);
    if (window.MMKeep) window.MMKeep(x, img, 2048, 4114, PANELS, S.tpl.keep || [VALVE]);
    if (!S.tpl.free) window.MMSlots(x, 2048, 4114, PANELS, S.tpl.slots, S.tplColor);
    const f = document.createElement('canvas'); f.width = 1050; f.height = 2108; f.getContext('2d').drawImage(c, 0, 0, 1050, 2108);
    const blob = await new Promise(r => f.toBlob(r, 'image/jpeg', 0.88));
    if (job !== tplJob) return;
    if (tplArt.flat) URL.revokeObjectURL(tplArt.flat);
    tplArt.key = key; tplArt.big = c; tplArt.flat = blob ? URL.createObjectURL(blob) : f.toDataURL('image/jpeg', 0.88);
    renderTplBar(true);
  }
  function renderTplBar(fresh) {
    const bar = $('#pe-tpl'); bar.hidden = !S.tpl; if (!S.tpl) return;
    $('#pe-tpl-name').textContent = S.tpl.code + ' «' + S.tpl.title + '»';
    const box = $('#pe-tpl-colors');
    box.hidden = !(S.tpl.colors || []).length;
    if (box.dataset.tpl !== S.tpl.id) {
      box.dataset.tpl = S.tpl.id;
      box.replaceChildren(...(S.tpl.colors || []).map(c => { const b = document.createElement('button'); b.type = 'button'; b.dataset.color = c.id; const i = document.createElement('i'); i.style.background = c.swatch; b.append(i, document.createTextNode(c.name)); return b; }));
    }
    $$('button', box).forEach(b => b.setAttribute('aria-pressed', String(!!S.tplColor && b.dataset.color === S.tplColor.id)));
    if (S.tpl.free) { if (fresh !== undefined || !$('#pe-tpl-hint').textContent.endsWith('…')) $('#pe-tpl-hint').textContent = 'Узор-подложка: фото, логотип или надпись можно поставить на любую панель — на своей панели они закроют узор. Доступны схемы 32 и 30 панелей.'; return; }
    if (fresh !== undefined || !$('#pe-tpl-hint').textContent.endsWith('…')) $('#pe-tpl-hint').textContent = 'Фото — на панели № ' + S.tpl.slots.photo.join(', ') + ' (красные номера).' + (S.tpl.slots.text.length ? ' Надпись или логотип — № ' + S.tpl.slots.text.join(', ') + ' (чёрные).' : ' Подпишите фото в карточке панели — имя и номер увидит дизайнер.') + ' Остальные панели — узор шаблона.';
  }
  $('#pe-tpl-colors').addEventListener('click', async e => {
    const b = e.target.closest('[data-color]'); if (!b || busy || !S.tpl) return;
    const prev = S.tplColor; S.tplColor = S.tpl.colors.find(c => c.id === b.dataset.color) || prev;
    if (S.tplColor === prev) return;
    const cf = el('colors'); if (cf.value.startsWith('Как в шаблоне ' + S.tpl.code)) cf.value = colorNote();
    renderTplBar();
    try { await paintTemplate(); } catch (x) { /* узор не перекрасился — остаётся прежний */ }
    renderPhotos(); changed();
  });
  $('#pe-tpl-off').addEventListener('click', () => {
    if (busy || !S.tpl) return;
    if (!confirm('Убрать шаблон? Узор исчезнет, а ваши фото и надписи останутся на своих панелях.')) return;
    removeTemplate();
  });

  // --- карточка панели ---
  const dlg = $('#pe-card'), card = { n: 0, item: null, file: null, rot: 0, zoom: 100, dx: 0, dy: 0, pimg: null, pbox: null };
  function openCard(n) {
    if (busy) return;
    n = +n; const p = itemAt(n);
    card.n = n; card.item = p || null; card.file = p ? p.file : null; Object.assign(card, posOf(p));
    $('#pc-num').textContent = n; $('#pc-shape').textContent = shapeName(n) + (p ? ' · занята' : ' · свободна');
    $('#pc-caption').value = p ? fullName(p) : ''; $('#pc-number').value = p ? p.number || '' : '';
    const type = fixType(n, p ? p.type : 'regular');
    const slot = tplSlot(n);
    $$('input[name="pc-type"]', dlg).forEach(r => {
      r.checked = r.value === (type === 'text' ? 'logo' : type);
      r.disabled = slot === 'text' ? r.value !== 'logo' : slot === 'photo' ? (r.value === 'group' || r.value === 'logo') : UNIONS[n] ? r.value !== 'group' : r.value === 'group';
      r.closest('label').classList.toggle('off', r.disabled);
    });
    $('#pc-valve').hidden = n !== VALVE;
    $('#pc-type-hint').textContent = slot === 'text' ? 'В шаблоне эта панель — для надписи или логотипа: напишите текст или загрузите логотип.'
      : slot === 'photo' ? 'В шаблоне эта панель — для фото.'
      : UNIONS[n] ? 'Панель ' + n + ' — для группового фото.' : 'Групповое фото ставится только на сдвоенные панели 33 и 35 (схема «30 панелей»).';
    $('#pc-del').hidden = !p; $('#pc-save').textContent = p ? 'Сохранить изменения' : 'Сохранить';
    cardErr(''); renderCardPreview();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(() => (p ? $('#pc-caption') : $('#pc-input').closest('label')).focus(), 30);
  }
  function closeCard() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); card.item = null; card.file = null; }
  function cardErr(t) { const e = $('#pc-err'); e.textContent = t; e.hidden = !t; }
  let cardUrl = '', cardUrlFile = null;
  function renderCardPreview() {
    const box = $('#pc-prev'), f = card.file; box.replaceChildren(); card.pimg = null; syncRot();
    if (cardUrl && cardUrlFile !== f) { URL.revokeObjectURL(cardUrl); cardUrl = ''; cardUrlFile = null; }
    if (!f) { const s = document.createElement('span'); s.className = 'pc-empty'; s.textContent = 'Файл не выбран'; box.append(s); $('#pc-fname').textContent = ''; return; }
    $('#pc-fname').textContent = f.name + ' · ' + fmtMB(f.size);
    const saved = card.item && card.item.file === f ? thumbUrl(card.item) : '';
    const u = saved || ((isImg(f) || isSvg(f)) ? (cardUrl && cardUrlFile === f ? cardUrl : (cardUrlFile = f, cardUrl = URL.createObjectURL(f))) : '');
    const d = u ? dimsOf(u) : null;
    if (u && d && PANELS[card.n]) {
      // предпросмотр в форме панели: так фото встанет на мяч
      const b = bbox(card.n), pad = 6;
      const sv = svgEl('svg', { viewBox: (b.x - pad) + ' ' + (b.y - pad) + ' ' + (b.w + pad * 2) + ' ' + (b.h + pad * 2), role: 'img', 'aria-label': 'Предпросмотр на панели. Перетащите, чтобы сдвинуть фото', class: 'pc-pan' });
      const df = svgEl('defs', {}), cp = svgEl('clipPath', { id: 'pc-clip' }); cp.append(svgEl('polygon', { points: PANELS[card.n][2] })); df.append(cp); sv.append(df);
      const cg = svgEl('g', { 'clip-path': 'url(#pc-clip)' }); cg.append(svgEl('polygon', { points: PANELS[card.n][2], fill: '#fff' }));
      card.pimg = svgEl('image', { href: u, preserveAspectRatio: 'none' }); card.pbox = { b, d }; cg.append(card.pimg);
      sv.append(cg, svgEl('polygon', { points: PANELS[card.n][2], fill: 'none', stroke: '#c20e2c', 'stroke-width': 3 }));
      box.append(sv); updatePreview();
    }
    else if (u) { const i = document.createElement('img'); i.src = u; i.alt = 'Предпросмотр'; if (card.rot) i.style.transform = 'rotate(' + card.rot + 'deg)'; box.append(i); }
    else { const s = document.createElement('span'); s.className = 'pc-ext'; s.textContent = extName(f).toUpperCase(); box.append(s); }
  }
  async function pickCardFile(f) {
    if (!f) return;
    cardErr('Проверяем файл…');
    const err = await checkFile(f);
    if (err) { cardErr(f.name + ': ' + err); return; }
    cardErr(''); card.file = f; Object.assign(card, posOf(null));
    if (!card.item) {
      const r = parseFileName(f.name);
      if (!$('#pc-caption').value && r.caption) $('#pc-caption').value = r.caption;
      if (!$('#pc-number').value && r.number) $('#pc-number').value = r.number;
      if (r.type === 'logo' && !UNIONS[card.n]) $$('input[name="pc-type"]', dlg).forEach(x => { x.checked = x.value === 'logo'; });
    }
    renderCardPreview();
  }
  // только двигаем картинку, не перестраивая превью (чтобы перетаскивание было плавным)
  function updatePreview() {
    syncRot();
    if (!card.pimg) { const i = $('#pc-prev img'); if (i) i.style.transform = 'rotate(' + card.rot + 'deg) scale(' + card.zoom / 100 + ')'; return; }
    const { b, d } = card.pbox, z = place(b.x, b.y, b.w, b.h, d.w, d.h, card);
    card.pimg.setAttribute('x', z.cx - z.w / 2); card.pimg.setAttribute('y', z.cy - z.h / 2); card.pimg.setAttribute('width', z.w); card.pimg.setAttribute('height', z.h);
    card.pimg.setAttribute('transform', z.rot ? 'rotate(' + z.rot + ' ' + z.cx + ' ' + z.cy + ')' : '');
  }
  function syncRot() {
    $('#pc-rot-range').value = card.rot; $('#pc-rot-val').textContent = card.rot + '°';
    $('#pc-zoom-range').value = card.zoom; $('#pc-zoom-val').textContent = card.zoom + '%';
    $('#pc-rot-reset').hidden = !card.rot && card.zoom === 100 && !card.dx && !card.dy;
    $('#pc-rot').hidden = !card.file && !$('#pc-caption').value.trim();
    $('#pc-pan-hint').hidden = !card.pimg;
  }
  function setPos(ch) { Object.assign(card, posOf({ ...card, ...ch })); updatePreview(); }
  $$('#pc-rot [data-rot]').forEach(b => b.addEventListener('click', () => setPos({ rot: card.rot + +b.dataset.rot })));
  $$('#pc-rot [data-zoom]').forEach(b => b.addEventListener('click', () => setPos({ zoom: card.zoom + +b.dataset.zoom })));
  $('#pc-rot-range').addEventListener('input', e => setPos({ rot: e.target.value }));
  $('#pc-zoom-range').addEventListener('input', e => setPos({ zoom: e.target.value }));
  $('#pc-rot-reset').addEventListener('click', () => setPos({ rot: 0, zoom: 100, dx: 0, dy: 0 }));
  // перетаскивание фото в превью; колесо мыши — масштаб
  const pcPrev = $('#pc-prev'); let drag = null;
  pcPrev.addEventListener('pointerdown', e => {
    if (!card.pimg) return; const sv = pcPrev.querySelector('svg'), r = sv.getBoundingClientRect(), vb = sv.viewBox.baseVal;
    drag = { x: e.clientX, y: e.clientY, dx: card.dx, dy: card.dy, k: Math.max(vb.width / r.width, vb.height / r.height) };
    pcPrev.setPointerCapture(e.pointerId); e.preventDefault();
  });
  pcPrev.addEventListener('pointermove', e => {
    if (!drag || !card.pbox) return; const { b } = card.pbox;
    setPos({ dx: drag.dx + (e.clientX - drag.x) * drag.k / b.w, dy: drag.dy + (e.clientY - drag.y) * drag.k / b.h });
  });
  ['pointerup', 'pointercancel'].forEach(t => pcPrev.addEventListener(t, () => { drag = null; }));
  pcPrev.addEventListener('wheel', e => { if (!card.pimg) return; e.preventDefault(); setPos({ zoom: card.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) }); }, { passive: false });
  $('#pc-caption').addEventListener('input', () => { if (!card.file) syncRot(); });
  $('#pc-input').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; pickCardFile(f); });
  const pcDrop = $('#pc-drop');
  ['dragenter', 'dragover'].forEach(t => pcDrop.addEventListener(t, e => { e.preventDefault(); pcDrop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => pcDrop.addEventListener(t, e => { e.preventDefault(); pcDrop.classList.remove('over'); }));
  pcDrop.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files[0]) pickCardFile(e.dataTransfer.files[0]); });
  $('#pc-number').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3); });
  $('#pc-form').addEventListener('submit', e => {
    e.preventDefault();
    const caption = $('#pc-caption').value.trim();
    if (!card.file && !caption) return cardErr('Загрузите файл или напишите текст для панели ' + card.n + '.');
    if (!card.file && tplSlot(card.n) === 'photo') return cardErr('Панель ' + card.n + ' в шаблоне — для фото. Загрузите фото, а надпись разместите на чёрных пятиугольниках.');
    const other = itemAt(card.n); if (other && other !== card.item) return cardErr('На панели ' + card.n + ' уже есть изображение.');
    if (!card.item && S.photos.length >= LIMITS.photos) return cardErr('Можно разместить не более ' + LIMITS.photos + ' изображений.');
    const data = {
      file: card.file, panel: String(card.n), auto: false,
      type: card.file ? fixType(card.n, ($$('input[name="pc-type"]', dlg).find(r => r.checked) || {}).value || 'regular') : 'text',
      caption, surname: '', first: '', patronymic: '', number: $('#pc-number').value.trim(), ...posOf(card)
    };
    if (card.item) { if (card.item.file !== data.file) dropUrl(card.item.id); Object.assign(card.item, data); }
    else S.photos.push({ id: nextId(), ...data });
    closeCard(); renderPhotos(); changed();
  });
  $('#pc-del').addEventListener('click', () => {
    if (!card.item) return;
    if (!confirm('Удалить изображение и данные с панели ' + card.n + '?')) return;
    dropUrl(card.item.id); S.photos = S.photos.filter(p => p !== card.item);
    closeCard(); renderPhotos(); changed();
  });
  $('#pc-cancel').addEventListener('click', closeCard);
  $('#pc-close').addEventListener('click', closeCard);
  dlg.addEventListener('cancel', () => { card.item = null; card.file = null; });
  dlg.addEventListener('click', e => { if (e.target === dlg) closeCard(); });

  // клики по схеме и списку
  const peSvg = $('#pe-svg');
  peSvg.addEventListener('click', e => { const g = e.target.closest('.pe-p'); if (!g) { if (fixedTpl()) showError('Эта панель — узор шаблона. Фото и надписи ставятся на отмеченные номерами панели.'); return; } if (g.classList.contains('tech')) return showError('Панель 22 — техническая: на ней ниппель и логотип фабрики. Её заполнять не нужно.'); openCard(g.dataset.n); });
  peSvg.addEventListener('keydown', e => { const g = e.target.closest('.pe-p:not(.tech)'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCard(g.dataset.n); } });
  $('#pe-list').addEventListener('click', e => { const b = e.target.closest('.pe-row'); if (b) openCard(b.dataset.n); });

  const photoInput = $('#photo-input'), drop = $('#photo-drop');
  photoInput.addEventListener('change', () => { const fs = [...photoInput.files]; photoInput.value = ''; addPhotoFiles(fs); });
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { if (!busy && e.dataTransfer) addPhotoFiles([...e.dataTransfer.files]); });

  // --- картинка схемы для дизайнера (уходит в архив заказа) ---
  async function buildSchemeImage() {
    if (!S.photos.length) return null;
    const K = 1.4, SW = Math.round(700 * K), SH = Math.round(1405 * K), LW = 760, W = SW + LW + 60, H = SH + 40;
    let lay; try { lay = await drawLayout(SW, SH, { badges: true }); } catch (e) { lay = await drawLayout(SW, SH, { badges: true, svg: false }); }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(lay, 20, 20);
    const L = SW + 60; let y = 70;
    x.textAlign = 'left'; x.fillStyle = '#17171b'; x.font = 'bold 40px Arial'; x.fillText('Раскладка мяча', L, y); y += 44;
    x.font = '24px Arial'; x.fillStyle = '#5a5a63';
    x.fillText((S.layout === 'groups' ? 'Схема 30 панелей (33 = 2+3, 35 = 18+19)' : 'Схема 32 панели') + ' · размер ' + (val('photoSize') || '5') + ' · ' + new Date().toLocaleDateString('ru-RU'), L, y); y += 46;
    if (S.tpl) { x.fillStyle = '#c20e2c'; x.font = 'bold 26px Arial'; x.fillText('Шаблон ' + tplLabel(), L, y); y += 46; x.font = '24px Arial'; x.fillStyle = '#5a5a63'; }
    const rows = [...S.photos].sort((a, b) => +a.panel - +b.panel);
    const rowH = Math.min(64, Math.floor((H - y - 30) / Math.max(rows.length, 1)));
    for (const p of rows) {
      const th = rowH - 8, u = isImg(p.file) ? thumbUrl(p) : '', im = u ? await loadImg(u) : null;
      if (im) { x.save(); x.beginPath(); x.rect(L, y - th + 10, th, th); x.clip(); const s = Math.max(th / im.width, th / im.height); x.drawImage(im, L + (th - im.width * s) / 2, y - th + 10 + (th - im.height * s) / 2, im.width * s, im.height * s); x.restore(); }
      else { x.fillStyle = '#fceef0'; x.fillRect(L, y - th + 10, th, th); x.fillStyle = '#c20e2c'; x.font = 'bold 16px Arial'; x.textAlign = 'center'; x.fillText(extName(p.file).toUpperCase(), L + th / 2, y - th / 2 + 16); x.textAlign = 'left'; }
      x.fillStyle = '#c20e2c'; x.font = 'bold ' + Math.min(28, rowH - 26) + 'px Arial'; x.fillText(p.panel, L + th + 14, y);
      x.fillStyle = '#17171b'; x.font = Math.min(24, rowH - 30) + 'px Arial';
      const txt = (fullName(p) || '—') + (p.number ? ' · №' + p.number : '') + ' · ' + TYPES[p.type] + (posLabel(p) ? ' · ' + posLabel(p) : '');
      let t = txt; while (x.measureText(t).width > LW - th - 100 && t.length > 4) t = t.slice(0, -2);
      x.fillText(t === txt ? t : t + '…', L + th + 76, y);
      y += rowH;
    }
    return await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.9));
  }

  /* ---------- логотипы ---------- */
  function addLogo(file) {
    if (S.logos.length >= LIMITS.logos) return;
    S.logos.push({ id: nextId(), file: file || null, repeats: 1, note: '' }); renderLogos();
  }
  function renderLogos() {
    const list = $('#logos'), tpl = $('#logo-tpl'); list.replaceChildren();
    const maxRep = S.sport === 'football' ? 32 : 1000;
    S.logos.forEach((l, i) => {
      const node = tpl.content.firstElementChild.cloneNode(true); node.dataset.id = l.id;
      $('.item-label', node).textContent = 'Логотип ' + (i + 1);
      const img = $('img', node), u = thumbUrl(l); if (u) img.src = u;
      if (l.file && !isImg(l.file)) $('.thumb-ph', node).textContent = extOf(l.file);
      $('.file-name', node).textContent = l.file ? l.file.name + ' · ' + fmtMB(l.file.size) : 'Файл не выбран';
      $('.file-pick', node).firstChild.textContent = l.file ? 'Заменить файл' : 'Выбрать файл';
      $('.l-file', node).setAttribute('aria-label', 'Файл логотипа ' + (i + 1));
      const r = $('.l-repeats', node); r.value = l.repeats; r.max = maxRep;
      $('.l-note', node).value = l.note;
      list.append(node);
    });
    $('#add-logo').disabled = busy || S.logos.length >= LIMITS.logos;
  }
  const logoList = $('#logos');
  logoList.addEventListener('change', e => {
    if (!e.target.matches('.l-file')) return;
    const node = e.target.closest('.item'), l = S.logos.find(x => x.id === node.dataset.id), f = e.target.files[0];
    if (!f) return;
    const okType = /\.(pdf|png|jpe?g|webp|ai|eps|cdr|svg)$/i.test(f.name);
    const vec = isVector(f) || /\.pdf$/i.test(f.name);
    if (!okType || f.size > (vec ? LIMITS.vector : LIMITS.file)) { e.target.value = ''; return showError('Логотип: вектор AI, EPS, CDR, SVG или PDF — до 25 МБ, картинка JPG, PNG или WebP — до 10 МБ.'); }
    dropUrl(l.id); l.file = f; renderLogos(); changed();
  });
  logoList.addEventListener('input', e => {
    const node = e.target.closest('.item'); if (!node) return; const l = S.logos.find(x => x.id === node.dataset.id);
    e.target.classList.remove('invalid');
    if (e.target.matches('.l-repeats')) l.repeats = e.target.value === '' ? '' : Math.floor(Number(e.target.value));
    if (e.target.matches('.l-note')) l.note = e.target.value;
    changed();
  });
  logoList.addEventListener('click', e => {
    const b = e.target.closest('.remove'); if (!b || busy) return; const id = b.closest('.item').dataset.id;
    S.logos = S.logos.filter(x => x.id !== id); dropUrl(id); renderLogos(); changed();
  });
  $('#add-logo').addEventListener('click', () => { addLogo(); changed(); const last = $('#logos .item:last-child .l-file'); if (last) last.click(); });

  /* ---------- надписи ---------- */
  function renderTexts() {
    const list = $('#inscriptions'), tpl = $('#text-tpl'); list.replaceChildren();
    S.texts.forEach((t, i) => {
      const node = tpl.content.firstElementChild.cloneNode(true); node.dataset.id = t.id;
      $('.item-label', node).textContent = 'Надпись ' + (i + 1); $('.t-text', node).value = t.text; list.append(node);
    });
    $('#add-inscription').disabled = busy || S.texts.length >= LIMITS.texts;
  }
  const textList = $('#inscriptions');
  textList.addEventListener('input', e => { const node = e.target.closest('.text-item'); const t = S.texts.find(x => x.id === node.dataset.id); t.text = e.target.value; changed(); });
  textList.addEventListener('click', e => { const b = e.target.closest('.remove'); if (!b || busy) return; const id = b.closest('.text-item').dataset.id; S.texts = S.texts.filter(x => x.id !== id); renderTexts(); changed(); });
  $('#add-inscription').addEventListener('click', () => {
    if (S.texts.length >= LIMITS.texts) return; S.texts.push({ id: nextId(), text: '' }); renderTexts(); changed();
    const last = $('#inscriptions .text-item:last-child input'); if (last) last.focus();
  });

  /* ---------- реквизиты ---------- */
  function renderRequisites() {
    $('#requisites-name').textContent = S.requisites ? S.requisites.name + ' · ' + fmtMB(S.requisites.size) : 'Файл не выбран';
    $('#requisites-clear').hidden = !S.requisites;
  }
  $('#requisites').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > LIMITS.file || !/\.(pdf|docx?|xlsx?|jpe?g|png)$/i.test(f.name)) return showError('Реквизиты: выберите PDF, Word, Excel, JPG или PNG до 10 МБ.');
    S.requisites = f; renderRequisites(); changed();
  });
  $('#requisites-clear').addEventListener('click', () => { S.requisites = null; renderRequisites(); changed(); });

  /* ---------- общие изменения полей ---------- */
  form.addEventListener('input', e => {
    if (e.target.closest('#photos,#logos,#inscriptions') || e.target.type === 'file') return;
    e.target.classList.remove('invalid');
    if (['confirmed', 'privacy-consent', 'materials-confirmed'].includes(e.target.id)) { clearError(); return; }
    if (e.target.name === 'inn') e.target.value = e.target.value.replace(/\D/g, '');
    changed();
  });
  form.addEventListener('change', e => {
    const n = e.target.name;
    if (n === 'sport' || n === 'design') { syncChoice(); renderLogos(); changed(); }
    if (n === 'model') { syncModel(); applyVisibility(); changed(); }
    if (['delivery', 'payer', 'material', 'printing', 'size', 'photoSize'].includes(n)) { applyVisibility(); changed(); }
  });

  /* ---------- проверка шагов ---------- */
  function checkControls(step) {
    const sec = $(`.step[data-step="${step}"]`);
    for (const c of $$('input,select,textarea', sec)) {
      if (!c.name || c.type === 'file' || !visible(c)) continue;
      if (c.type === 'radio') { if (c.required && !sec.querySelector(`input[name="${c.name}"]:checked`)) return showError('Выберите ' + ({ size: 'размер мяча', photoSize: 'размер мяча', sport: 'вид спорта', design: 'оформление' }[c.name] || 'вариант') + '.', c); continue; }
      if (c.value.trim() === '' && c.required) { const lab = c.labels && c.labels[0] ? c.labels[0].textContent.replace('*', '').trim() : 'обязательное поле'; return showError('Заполните поле «' + lab + '».', c); }
      if (!c.checkValidity()) return showError(c.validationMessage || 'Проверьте поле.', c);
    }
    return true;
  }
  function validateStep(step) {
    clearError();
    if (step === 'choose') {
      if (!S.sport) return showError('Выберите вид спорта.', form.querySelector('input[name=sport]'));
      if (!S.design) return showError('Выберите оформление мяча.', form.querySelector('input[name=design]:not(:disabled)'));
      return true;
    }
    if (!checkControls(step)) return false;
    if (step === 'ball') {
      const q = Number(val('quantity'));
      if (!Number.isInteger(q) || q < 1 || q > 100000) return showError('Укажите целое количество мячей от 1 до 100 000.', el('quantity'));
      if (isLogo()) {
        const m = model(); if (!m) return showError('Выберите модель мяча.', el('model'));
        const s = (form.querySelector('input[name=size]:checked') || {}).value;
        if (!m.sizes.includes(s)) return showError('Выберите размер мяча.', form.querySelector('input[name=size]'));
      }
    }
    if (step === 'design') {
      const link = val('driveLink');
      if (link) { try { const u = new URL(link); if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw 0; } catch (e) { return showError('Ссылка на диск должна начинаться с https:// или http://.', el('driveLink')); } }
      if (isPhoto()) {
        if (!S.photos.length) return showError('Разместите хотя бы одно изображение: нажмите на панель на схеме.', $('#pe-svg'));
        if (S.photos.length > LIMITS.photos) return showError('Можно разместить не более ' + LIMITS.photos + ' изображений.');
        const seen = new Set();
        for (const p of S.photos) {
          if (!layoutPanels().includes(+p.panel)) return showError('Панель ' + p.panel + ' недоступна в выбранной схеме.');
          if (seen.has(p.panel)) return showError('На панели ' + p.panel + ' два изображения. Оставьте одно.'); seen.add(p.panel);
          if (p.type !== fixType(p.panel, p.type)) return showError('Групповое фото — только на панелях 33 и 35. Проверьте панель ' + p.panel + '.');
          if (tplSlot(p.panel) === 'photo' && !p.file) return showError('Панель ' + p.panel + ' в шаблоне — для фото. Загрузите фото на эту панель.');
          if (p.number && !/^\d{1,3}$/.test(p.number)) return showError('Панель ' + p.panel + ': игровой номер — от 1 до 3 цифр.');
        }
      } else {
        const withFile = S.logos.filter(l => l.file);
        if (!withFile.length && !link) return showError('Загрузите хотя бы один логотип или укажите ссылку на диск с логотипами.', $('#add-logo'));
        const maxRep = S.sport === 'football' ? 32 : 1000;
        for (const l of withFile) {
          if (!Number.isInteger(l.repeats) || l.repeats < 1 || l.repeats > maxRep) return showError('Количество повторений логотипа — целое число от 1 до ' + maxRep + '.', $(`#logos .item[data-id="${l.id}"] .l-repeats`));
        }
        const texts = S.texts.filter(t => t.text.trim()).length;
        if (S.sport === 'football' && withFile.reduce((n, l) => n + l.repeats, 0) + texts > 32) return showError('На футбольном мяче 32 панели: уменьшите число повторений логотипов или надписей.');
      }
      if (totalBytes() > LIMITS.total) return showError('Общий размер файлов больше 100 МБ. Уменьшите фото или передайте часть ссылкой на диск.');
    }
    if (step === 'delivery') {
      const d = val('neededDate'), today = localISO(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return showError('Укажите дату, когда нужны мячи.', el('neededDate'));
      if (d < today) return showError('Дата не может быть в прошлом.', el('neededDate'));
      if (val('payer') === 'company' && !/^(\d{10}|\d{12})$/.test(val('inn'))) return showError('ИНН — 10 или 12 цифр.', el('inn'));
      if (totalBytes() > LIMITS.total) return showError('Общий размер файлов больше 100 МБ.');
    }
    if (step === 'contacts') {
      const phone = val('phone'), digits = phone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15 || !/^[+\d\s().-]+$/.test(phone)) return showError('Проверьте телефон: от 7 до 15 цифр.', el('phone'));
      for (const id of ['privacy-consent', 'materials-confirmed', 'confirmed']) if (!$('#' + id).checked) return showError(id === 'confirmed' ? 'Проверьте данные заказа и отметьте, что всё верно.' : 'Отметьте согласие, чтобы отправить заявку.', $('#' + id));
    }
    return true;
  }
  function localISO(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  el('neededDate').min = localISO(new Date());
  function sendFiles() {
    const files = [];
    if (isPhoto()) S.photos.forEach(p => files.push(p.file)); else S.logos.forEach(l => l.file && files.push(l.file));
    if (val('payer') === 'company' && S.requisites) files.push(S.requisites);
    return files.filter(Boolean);
  }
  function totalBytes() { return sendFiles().reduce((n, f) => n + f.size, 0); }

  /* ---------- сводка ---------- */
  function summaryData() {
    const m = model(), size = (form.querySelector('input[name=size]:checked') || {}).value;
    const sportName = S.sport === 'basketball' ? 'Баскетбольный мяч' : 'Футбольный мяч';
    const lines = [];
    if (isLogo() && m) lines.push(m.title + (size ? ' · ' + (size === '3x3' ? 'формат 3×3' : 'размер ' + size) : ''));
    if (isPhoto() && val('photoSize')) lines.push('Размер ' + val('photoSize'));
    if (val('quantity')) lines.push(plural(Number(val('quantity')) || 0, 'мяч', 'мяча', 'мячей'));
    if (val('colors')) lines.push('Цвета: ' + val('colors'));
    if (isPhoto()) lines.push(S.tpl ? 'Шаблон ' + tplLabel() : S.layout === 'groups' ? 'Схема 30 панелей' : 'Схема 32 панели');
    if (isPhoto() && S.photos.length) lines.push(plural(S.photos.length, 'изображение', 'изображения', 'изображений') + ' на панелях');
    const logos = S.logos.filter(l => l.file).length;
    if (isLogo() && logos) lines.push(plural(logos, 'логотип', 'логотипа', 'логотипов'));
    const texts = S.texts.filter(t => t.text.trim()).length;
    if (texts) lines.push(plural(texts, 'надпись', 'надписи', 'надписей'));
    if (val('promo')) lines.push('Промокод: ' + val('promo').toUpperCase());
    return { title: S.sport && S.design ? sportName + (isPhoto() ? '' : ' с логотипом') : '—', lines };
  }
  function renderSummary() {
    const d = summaryData();
    $('#sum-title').textContent = d.title;
    $('#sum-lines').replaceChildren(...d.lines.map(t => { const li = document.createElement('li'); li.textContent = t; return li; }));
    $('#sum-terms').textContent = isPhoto() ? PHOTO_TERMS + ' Доставка — отдельно.' : (model() ? model().production : '');
  }
  function renderReview() {
    const box = $('#review'); box.replaceChildren();
    const h = document.createElement('h3'); h.textContent = 'Проверьте заказ'; box.append(h);
    const dl = document.createElement('dl');
    const add = (k, v) => { if (!v) return; const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); };
    const d = summaryData();
    add('Мяч', d.title);
    d.lines.forEach((l, i) => add(i === 0 ? 'Детали' : '', l));
    if (isPhoto()) {
      const named = [...S.photos].sort((a, b) => +a.panel - +b.panel).map(p => p.panel + ' — ' + (fullName(p) || TYPES[p.type]) + (p.number ? ' (№' + p.number + ')' : '') + (posLabel(p) ? ', ' + posLabel(p) : ''));
      add('Панели', named.join('; '));
    }
    S.texts.filter(t => t.text.trim()).forEach((t, i) => add('Надпись ' + (i + 1), t.text.trim()));
    add('Получение', val('delivery') === 'pickup' ? 'Самовывоз' : 'СДЭК: ' + val('deliveryAddress'));
    if (val('neededDate')) add('Нужны к', val('neededDate').split('-').reverse().join('.'));
    add('Оплата', (val('payer') === 'company' ? 'Юрлицо: ' + val('companyName') + ', ИНН ' + val('inn') : 'Физическое лицо') + '. Ссылку на оплату пришлёт менеджер после согласования макета.');
    add('Промокод', val('promo').toUpperCase());
    add('Почта', val('email') ? val('email') + ' — сюда придёт номер заказа и ссылка на архив' : '');
    box.append(dl);
  }

  /* ---------- черновик (IndexedDB, вместе с файлами) ---------- */
  const DRAFT_KEY = 'order-draft-v1';
  let dbp = null, saveTimer = 0;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('moymyach-order', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  async function idb(mode, fn) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction('kv', mode); const st = tx.objectStore('kv'); const r = fn(st); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }
  function snapshot() {
    const fields = {};
    for (const c of form.elements) {
      if (!c.name || c.type === 'file' || c.name.startsWith('ptype-')) continue;
      if (c.type === 'radio') { if (c.checked) fields[c.name] = c.value; }
      else if (c.type !== 'checkbox') fields[c.name] = c.value;
    }
    return {
      v: 2, savedAt: Date.now(), step: S.step, fields,
      layout: S.layout, tpl: S.tpl ? { id: S.tpl.id, color: S.tplColor ? S.tplColor.id : '' } : null, photos: S.photos.map(({ id, file, type, panel, caption, surname, first, patronymic, number, auto, rot, zoom, dx, dy }) => ({ id, file, type, panel, caption, surname, first, patronymic, number, auto, rot, zoom, dx, dy })),
      logos: S.logos.map(({ id, file, repeats, note }) => ({ id, file, repeats, note })),
      texts: S.texts.map(({ id, text }) => ({ id, text })), requisites: S.requisites
    };
  }
  function scheduleSave() {
    if (restoring || busy) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await idb('readwrite', st => st.put(snapshot(), DRAFT_KEY));
        const t = new Date(); const s = $('#draft-status');
        s.textContent = 'Черновик сохранён в ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); s.hidden = false;
      } catch (e) { $('#draft-status').hidden = true; }
    }, 500);
  }
  async function clearDraft() { try { await idb('readwrite', st => st.delete(DRAFT_KEY)); } catch (e) { /* нет хранилища */ } }
  async function loadDraft() {
    try {
      const d = await idb('readonly', st => st.get(DRAFT_KEY));
      if (!d || ![1, 2].includes(d.v) || Date.now() - d.savedAt > 30 * 864e5) return null;
      return d;
    } catch (e) { return null; }
  }
  function setField(name, value) {
    const c = el(name); if (!c) return;
    if (c instanceof RadioNodeList || (c.length && c[0] && c[0].type === 'radio')) { [...c].forEach(r => { r.checked = r.value === value; }); }
    else if (c.type === 'radio') c.checked = c.value === value;
    else c.value = value;
  }
  function restoreDraft(d) {
    restoring = true;
    const f = d.fields || {};
    ['sport', 'design'].forEach(n => f[n] && setField(n, f[n]));
    syncChoice();
    fillModels(f.model);
    syncModel(f.size);
    for (const [k, v] of Object.entries(f)) if (!['sport', 'design', 'model', 'size'].includes(k)) setField(k, v);
    const ids = [];
    // черновик старой формы: ФИО одной строкой, эмблема, панели 33/35
    S.layout = fixedTpl() ? '32' : d.layout === 'groups' || (d.photos || []).some(p => ['33', '35'].includes(String(p.panel))) ? 'groups' : '32';
    const used = new Set();
    S.photos = (d.photos || []).filter(p => p.file instanceof Blob || (p.type === 'text' && p.caption)).map(p => {
      ids.push(+p.id);
      const it = { id: p.id, file: p.file instanceof Blob ? p.file : null, type: p.type === 'emblem' ? 'logo' : (TYPES[p.type] ? p.type : 'regular'), panel: String(p.panel || ''), caption: p.caption || [p.surname, p.first, p.patronymic].filter(Boolean).join(' ') || p.name || '', number: p.number || '', auto: !!p.auto, ...posOf(p) };
      return it;
    }).filter(it => { if (!layoutPanels().includes(+it.panel) || used.has(it.panel)) { const free = layoutPanels().find(n => !used.has(String(n))); if (!free) return false; it.panel = String(free); it.auto = true; } used.add(it.panel); it.type = fixType(it.panel, it.type); return true; });
    S.logos = (d.logos || []).filter(l => !l.file || l.file instanceof Blob).map(l => { ids.push(+l.id); return { ...l }; });
    S.texts = (d.texts || []).map(t => { ids.push(+t.id); return { ...t }; });
    S.requisites = d.requisites instanceof Blob ? d.requisites : null;
    seq = Math.max(seq, ...ids.filter(Number.isFinite), 0);
    renderPhotos(); renderLogos(); renderTexts(); renderRequisites();
    go(d.step || 'choose', false);
    try { history.replaceState({ step: S.step }, '', '#' + S.step); } catch (e) { /* noop */ }
    restoring = false;
    const t = new Date(d.savedAt);
    $('#draft-banner-text').textContent = 'Мы восстановили ваш незаконченный заказ от ' + t.toLocaleDateString('ru-RU') + ' ' + t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '.';
    $('#draft-banner').hidden = false;
  }
  $('#draft-reset').addEventListener('click', async () => {
    if (!confirm('Удалить черновик и начать заполнение заново?')) return;
    await clearDraft(); location.replace(location.pathname);
  });

  /* ---------- подключение ---------- */
  async function connect() {
    const status = $('#connection');
    try {
      const [cfg, api] = await Promise.all([
        fetch('brief-models.json', { cache: 'no-store' }),
        fetch('api.php', { credentials: 'same-origin', cache: 'no-store' })
      ]);
      if (!cfg.ok) throw new Error('models');
      models = await cfg.json();
      const data = await api.json().catch(() => ({}));
      if (!api.ok || !data.csrf) throw new Error(data.error || 'api');
      token = data.csrf;
      if (data.limits) { LIMITS.file = data.limits.maxFileBytes || LIMITS.file; LIMITS.total = data.limits.maxTotalBytes || LIMITS.total; LIMITS.photos = data.limits.maxPlayers || LIMITS.photos; }
      status.className = 'notice ready';
      return true;
    } catch (e) {
      status.textContent = (e && e.message && e.message.length > 12) ? e.message : 'Форма пока недоступна. Обновите страницу или свяжитесь с менеджером: info@moymyach.ru.';
      $('#submit').disabled = true;
      return false;
    }
  }

  /* ---------- отправка ---------- */
  function buildPayload() {
    const texts = S.texts.map(t => t.text.trim()).filter(Boolean);
    const team = val('team'), prev = val('prevOrder');
    const order = (team && prev ? team + ' · заказ № ' + prev : team || (prev ? 'Заказ № ' + prev : '')).slice(0, 150);
    const company = val('payer') === 'company';
    const base = {
      legalVersion: LEGAL_VERSION, confirmed: $('#confirmed').checked,
      privacyAccepted: $('#privacy-consent').checked, materialsConfirmed: $('#materials-confirmed').checked,
      order, driveLink: val('driveLink'),
      customer: { fullname: val('customerName'), phone: val('phone'), email: val('email'), telegram: val('telegram'), max: val('max'), vk: val('vk') },
      delivery: { method: val('delivery'), address: val('delivery') === 'cdek' ? val('deliveryAddress') : '' },
      neededDate: val('neededDate'),
      payment: { type: val('payer'), companyName: company ? (val('companyName') + ', ИНН ' + val('inn')).slice(0, 200) : '', promo: val('promo').toUpperCase().slice(0, 40) },
      inscriptions: texts
    };
    if (isPhoto()) {
      const head = ['Мяч: футбольный', ...(S.tpl && S.tpl.free ? ['Шаблон: ' + tplLabel() + ' (узор под всей схемой, элементы — на любых панелях)'] : []), ...(fixedTpl() ? ['Шаблон: ' + tplLabel() + ' (фото — панели ' + S.tpl.slots.photo.join(', ') + (S.tpl.slots.text.length ? '; текст/логотип — ' + S.tpl.slots.text.join(', ') : '') + ')'] : []), 'Схема: ' + (S.layout === 'groups' ? '30 панелей (33 = 2+3, 35 = 18+19)' : '32 панели'), 'Размер: ' + (val('photoSize') || '5'), 'Количество мячей: ' + val('quantity'), 'Цвета мяча: ' + val('colors')].join('\n');
      return {
        ...base, briefType: 'photo', layout: S.layout,
        comments: (head + (val('comments') ? '\n\n' + val('comments') : '')).slice(0, 5000),
        players: S.photos.map(p => ({ key: p.id, type: p.type, panel: String(p.panel), caption: fullName(p), number: p.number, rotation: normRot(p.rot), zoom: posOf(p).zoom, offsetX: posOf(p).dx, offsetY: posOf(p).dy, placement: posLabel(p) })),
        logos: []
      };
    }
    const basket = S.sport === 'basketball';
    return {
      ...base, briefType: S.sport + '-logos', comments: val('comments'), players: [],
      product: {
        model: val('model'), size: (form.querySelector('input[name=size]:checked') || {}).value || '', quantity: Number(val('quantity')),
        colors: val('colors'), placement: val('placement'), modelReference: '',
        printing: basket ? val('printing') : '', material: basket ? val('material') : '',
        materialColor: basket && val('material') === 'pantone' ? val('materialColor') : '',
        embossing: basket && ['emboss', 'combined'].includes(val('printing')) ? val('embossing') : ''
      },
      logos: S.logos.filter(l => l.file).map(l => ({ key: l.id, repeats: l.repeats, note: l.note.trim() }))
    };
  }
  function setBusy(on) {
    busy = on;
    $$('input,select,textarea,button', form).forEach(c => { if (on) { c.dataset.wasDisabled = c.disabled ? '1' : ''; c.disabled = true; } else { c.disabled = c.dataset.wasDisabled === '1'; } });
    $('#sending').hidden = !on;
    $('#submit').textContent = on ? 'Отправляем…' : 'Отправить заявку';
  }
  // Отправка с полосой прогресса: при 50–100 МБ клиент видит, что загрузка идёт.
  function sendWithProgress(body) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(), bar = $('#send-bar'), pct = $('#send-pct');
      if (bar) bar.value = 0; if (pct) pct.textContent = '0%';
      xhr.open('POST', 'api.php'); xhr.withCredentials = true;
      xhr.upload.onprogress = e => { if (!e.lengthComputable) return; const v = Math.min(99, Math.round(e.loaded / e.total * 100)); if (bar) bar.value = v; if (pct) pct.textContent = v + '%'; };
      xhr.upload.onload = () => { if (pct) pct.textContent = 'сохраняем…'; };
      xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new Error('Соединение прервалось. Повторите отправку: дубликат заявки не будет создан.'));
      xhr.ontimeout = xhr.onerror; xhr.timeout = 15 * 60 * 1000;
      xhr.send(body);
    });
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    for (const st of STEPS) { if (!validateStep(st)) { if (S.step !== st) { const msg = errorBox.textContent; go(st); showError(msg); } return; } }
    if (!token) return showError('Форма не подключилась к серверу. Обновите страницу.');
    const payload = buildPayload(), body = new FormData();
    body.set('csrf', token); body.set('request_id', requestId); body.set('payload', JSON.stringify(payload));
    if (isPhoto()) S.photos.forEach(p => { if (p.file) body.set('photo_' + p.id, p.file, p.file.name); });
    else S.logos.filter(l => l.file).forEach(l => body.set('logo_' + l.id, l.file, l.file.name));
    if (payload.payment.type === 'company' && S.requisites) body.set('requisites', S.requisites, S.requisites.name);
    setBusy(true); clearError();
    if (isPhoto()) { try { const sc = await buildSchemeImage(); if (sc) body.set('scheme', sc, 'scheme.jpg'); } catch (x) { /* схема не обязательна */ } }
    try {
      const res = await sendWithProgress(body);
      let data; try { data = JSON.parse(res.text); } catch (x) { throw new Error('Сервер не принял загрузку. Попробуйте файлы меньшего размера или свяжитесь с менеджером.'); }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Не удалось сохранить заявку.');
      await clearDraft();
      urls.forEach(u => URL.revokeObjectURL(u)); urls.clear();
      form.hidden = true; $('#draft-banner').hidden = true; $('#draft-status').hidden = true;
      $('#receipt').textContent = data.orderId;
      $('#success-mail').textContent = 'Номер заявки и ссылку на архив с вашими материалами мы отправили на ' + payload.customer.email + '. Если письма нет — проверьте «Спам».';
      const ok = $('#success'); ok.hidden = false; ok.focus();
      window.scrollTo({ top: 0 });
      try { history.replaceState({}, '', location.pathname); } catch (x) { /* noop */ }
    } catch (err) {
      setBusy(false); applyVisibility(); renderLogos(); renderTexts(); renderPhotos();
      showError((err && err.message) || 'Соединение прервалось. Повторите отправку: дубликат заявки не будет создан.');
      return;
    }
    busy = false;
  });
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
    if (e.target.type === 'checkbox' || e.target.type === 'radio') { e.preventDefault(); return; }
    e.preventDefault();
    if (S.step !== 'contacts') { const b = S.step === 'choose' ? $('.step[data-step=choose] [data-next]') : $('#next-btn'); b.click(); }
  });
  $('#new-order').addEventListener('click', () => location.replace(location.pathname));
  window.addEventListener('beforeunload', e => { if (busy) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- старт ---------- */
  (async function init() {
    renderPhotos(); renderLogos(); renderTexts(); renderRequisites();
    const ok = await connect();
    loadTemplates();
    const draft = ok ? await loadDraft() : null;
    const q = new URLSearchParams(location.search);
    // шаблон: из ссылки витрины, иначе из черновика
    const tq = q.get('template') ? { id: q.get('template'), color: q.get('color') } : draft && draft.tpl;
    if (tq && (!draft || (draft.fields || {}).sport !== 'basketball')) await applyTemplate(tq.id, tq.color, true);
    if (draft) { restoreDraft(draft); if (S.tpl && q.get('template')) changed(); return; }
    if (['football', 'basketball'].includes(q.get('sport'))) setField('sport', q.get('sport'));
    syncChoice();
    syncChoice();
    if (!S.logos.length) addLogo();
    if (!S.texts.length) { S.texts.push({ id: nextId(), text: '' }); renderTexts(); }
    const start = S.sport && S.design ? 'ball' : 'choose';
    restoring = true; go(start, false); restoring = false;
    try { history.replaceState({ step: start }, '', location.search + '#' + start); } catch (e) { /* noop */ }
  })();


})();
