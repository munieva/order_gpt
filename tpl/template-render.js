// Перекраска шаблона: все цветные (насыщенные) пиксели сдвигаются по оттенку, белое и чёрное не меняются.
// Цвета шаблона хранятся в templates.json: hue — целевой оттенок (0–360), sat — множитель насыщенности, light — множитель светлоты,
// spread — насколько сохранить разброс оттенков исходника (1 — как в макете, 0.45 — плотнее к целевому цвету).
window.MMRecolor = function (ctx, w, h, baseHue, c) {
  if (c && c.second) return window.MMRecolor2(ctx, w, h, baseHue, c);
  if (!c || (c.hue === baseHue && (c.sat ?? 1) === 1 && (c.light ?? 1) === 1)) return;
  const d = ctx.getImageData(0, 0, w, h), p = d.data, sm = c.sat ?? 1, lm = c.light ?? 1, k = c.spread ?? 0.45;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
    if (dd < 0.06) continue; // белый, серый, чёрный — без изменений
    let s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn), hh;
    if (mx === r) hh = ((g - b) / dd + (g < b ? 6 : 0)) / 6; else if (mx === g) hh = ((b - r) / dd + 2) / 6; else hh = ((r - g) / dd + 4) / 6;
    let dv = hh * 360 - baseHue; dv = ((dv + 540) % 360) - 180; // отклонение от основного оттенка шаблона
    hh = (((c.hue + dv * k) % 360) + 360) % 360 / 360; s = Math.min(1, s * sm); const L = Math.min(1, l * lm);
    const q = L < 0.5 ? L * (1 + s) : L + s - L * s, pp = 2 * L - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp; };
    p[i] = f(hh + 1 / 3) * 255; p[i + 1] = f(hh) * 255; p[i + 2] = f(hh - 1 / 3) * 255;
  }
  ctx.putImageData(d, 0, 0);
};

// Заглушки в слотах шаблона: силуэт в фото-панелях, «ТЕКСТ / ЛОГО» в текстовых. Только для просмотра — в заказ не уходит.
window.MMSlots = function (ctx, W, H, panels, slots, c) {
  const kx = W / 700, ky = H / 1405, accent = c && c.sat === 0 ? 'hsl(0,0%,32%)' : 'hsl(' + (c ? c.hue : 210) + ',62%,42%)';
  const pts = n => panels[n][2].split(' ').map(s => { const [a, b] = s.split(','); return [a * kx, b * ky]; });
  const path = n => { ctx.beginPath(); pts(n).forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.closePath(); };
  (slots.photo || []).forEach(n => {
    const P = pts(n), xs = P.map(p => p[0]), ys = P.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0, cx = x0 + w / 2, cy = y0 + h / 2;
    ctx.save(); path(n); ctx.clip();
    const g = ctx.createLinearGradient(x0, y0, x0, y0 + h); g.addColorStop(0, '#dfe5ec'); g.addColorStop(1, '#b9c3cf'); ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = '#f7f8fa'; ctx.beginPath(); ctx.arc(cx, cy - h * 0.1, h * 0.14, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.34, h * 0.28, h * 0.25, 0, Math.PI, 0); ctx.fill();
    ctx.restore();
  });
  (slots.text || []).forEach(n => {
    const P = pts(n), xs = P.map(p => p[0]), ys = P.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, w = Math.max(...xs) - Math.min(...xs);
    ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.round(w * 0.13); ctx.font = '700 ' + fs + 'px Arial, sans-serif';
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillText('ТЕКСТ', 0, -fs * 0.6); ctx.fillText('ИЛИ ЛОГО', 0, fs * 0.6); ctx.restore();
  });
};

// Вернуть исходные пиксели на технических панелях (22: ниппель и логотип фабрики не перекрашиваются).
window.MMKeep = function (ctx, src, W, H, panels, list) {
  const kx = W / 700, ky = H / 1405;
  (list || []).forEach(n => {
    if (!panels[n]) return;
    ctx.save(); ctx.beginPath();
    panels[n][2].split(' ').forEach((s, i) => { const [a, b] = s.split(','); i ? ctx.lineTo(a * kx, b * ky) : ctx.moveTo(a * kx, b * ky); });
    ctx.closePath(); ctx.clip(); ctx.drawImage(src, 0, 0, W, H); ctx.restore();
  });
};

// Двухцветная перекраска: основной цвет (baseHue → hue) и второй (second.base → second.hue).
// Оттенки между ними (сетка из смешанных линий) плавно переходят от одного нового цвета к другому.
window.MMRecolor2 = function (ctx, w, h, baseHue, c) {
  const B = c.second, A0 = baseHue, B0 = B.base, arc = ((A0 - B0) % 360 + 360) % 360 || 360;
  const same = c.hue === A0 && B.hue === B0 && (c.sat ?? 1) === 1 && (c.light ?? 1) === 1 && (B.sat ?? 1) === 1 && (B.light ?? 1) === 1;
  if (same) return;
  let dH = ((c.hue - B.hue) % 360 + 360) % 360; if (dH > 180) dH -= 360; // кратчайший путь между новыми цветами
  const d = ctx.getImageData(0, 0, w, h), p = d.data, k = c.spread ?? 0.45;
  const dist = (x, y) => { const v = Math.abs(((x - y) % 360 + 540) % 360 - 180); return v; };
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
    if (dd < 0.06) continue;
    let s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn), hh;
    if (mx === r) hh = ((g - b) / dd + (g < b ? 6 : 0)) / 6; else if (mx === g) hh = ((b - r) / dd + 2) / 6; else hh = ((r - g) / dd + 4) / 6;
    const deg = hh * 360, fromB = ((deg - B0) % 360 + 360) % 360;
    let t, nh;
    if (fromB <= arc) { t = fromB / arc; nh = B.hue + dH * t; }
    else { t = dist(deg, A0) < dist(deg, B0) ? 1 : 0; let dv = deg - (t ? A0 : B0); dv = ((dv + 540) % 360) - 180; nh = (t ? c.hue : B.hue) + dv * k; }
    const sm = (B.sat ?? 1) + ((c.sat ?? 1) - (B.sat ?? 1)) * t, lm = (B.light ?? 1) + ((c.light ?? 1) - (B.light ?? 1)) * t;
    hh = ((nh % 360) + 360) % 360 / 360; s = Math.min(1, s * sm); const L = Math.min(1, l * lm);
    const q = L < 0.5 ? L * (1 + s) : L + s - L * s, pp = 2 * L - q;
    const f = x => { x = (x + 1) % 1; return x < 1 / 6 ? pp + (q - pp) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? pp + (q - pp) * (2 / 3 - x) * 6 : pp; };
    p[i] = f(hh + 1 / 3) * 255; p[i + 1] = f(hh) * 255; p[i + 2] = f(hh - 1 / 3) * 255;
  }
  ctx.putImageData(d, 0, 0);
};
