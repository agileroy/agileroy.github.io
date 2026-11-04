/*
 * Export du CV en PDF (pdfmake) et Word (.docx, bibliothèque docx).
 * Le contenu est lu directement dans la page : il suffit de mettre index.html à jour.
 */
(function () {
  var LIBS = {
    pdf: [
      'https://cdn.jsdelivr.net/npm/pdfmake@0.2.23/build/pdfmake.min.js',
      'https://cdn.jsdelivr.net/npm/pdfmake@0.2.23/build/vfs_fonts.js'
    ],
    docx: ['https://cdn.jsdelivr.net/npm/docx@9.15.2/dist/index.iife.js']
  };
  var FILE = 'CV-Vincent-Leroy';
  var C = { ink: '#1c2230', muted: '#5d6475', accent: '#c4552d', ok: '#2f7d5b', okSoft: '#eaf4ef', line: '#e2dccf' };

  /* ---------- chargement des bibliothèques ---------- */
  function loadScript(src) {
    return new Promise(function (ok, ko) {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { ko(new Error('Chargement impossible : ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadAll(list) {
    return list.reduce(function (p, src) { return p.then(function () { return loadScript(src); }); }, Promise.resolve());
  }

  /* ---------- lecture de la page ---------- */
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function txt(el) { return el ? clean(el.textContent) : ''; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Texte enrichi : [{t, b}] (b = gras pour <strong>/<b>)
  function runs(el) {
    var out = [];
    (function walk(node, bold) {
      node.childNodes.forEach(function (n) {
        if (n.nodeType === 3) { if (n.textContent) out.push({ t: n.textContent, b: bold }); }
        else if (n.nodeType === 1 && n.tagName !== 'SVG' && n.tagName !== 'svg') {
          walk(n, bold || n.tagName === 'STRONG' || n.tagName === 'B');
        }
      });
    })(el, false);
    // normalise les espaces sans perdre ceux entre deux segments
    var joined = [];
    out.forEach(function (r) {
      var t = r.t.replace(/\s+/g, ' ');
      if (!t) return;
      var last = joined[joined.length - 1];
      if (last && last.b === r.b) last.t += t; else joined.push({ t: t, b: r.b });
    });
    if (joined.length) {
      joined[0].t = joined[0].t.replace(/^\s+/, '');
      joined[joined.length - 1].t = joined[joined.length - 1].t.replace(/\s+$/, '');
    }
    return joined.filter(function (r) { return r.t; });
  }
  function items(ul) { return ul ? $$(':scope > li', ul).map(runs) : []; }
  function ownText(el) {
    return clean(Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 3; })
      .map(function (n) { return n.textContent; }).join(' '));
  }

  function readJob(job) {
    var when = $('.when', job);
    var body = job.children[1];
    var j = {
      dates: ownText(when),
      meta: $$('.dur', when).map(txt),
      title: '', company: '', blocks: []
    };
    Array.prototype.forEach.call(body.children, function (el) {
      var c = el.classList;
      if (el.tagName === 'H3') j.title = txt(el);
      else if (c.contains('co')) j.company = txt(el);
      else if (c.contains('intl')) j.blocks.push({ type: 'intl', text: txt(el) });
      else if (c.contains('ctx')) j.blocks.push({ type: 'ctx', text: txt(el) });
      else if (c.contains('lbl')) j.blocks.push({ type: 'label', text: txt(el) });
      else if (el.tagName === 'UL') j.blocks.push({ type: 'list', items: items(el) });
      else if (c.contains('wins')) j.blocks.push({ type: 'result', label: txt($('b', el)), items: items($('ul', el)) });
      else if (c.contains('also')) {
        j.blocks.push({ type: 'label', text: txt($('.lbl', el)) });
        j.blocks.push({ type: 'list', items: items($('ul', el)) });
      } else if (c.contains('sub')) {
        $$('.team', el).forEach(function (t) {
          var r = $('.wins', t);
          j.blocks.push({
            type: 'team', name: txt($('h4', t)), desc: txt($(':scope > p', t)),
            result: r ? { label: txt($('b', r)), items: items($('ul', r)) } : null
          });
        });
      }
    });
    return j;
  }

  function readCard(card) {
    return {
      title: txt($('h3', card)),
      items: $$('li', card).map(function (li) {
        return { t: ownText(li), s: txt($('small', li)) };
      })
    };
  }

  function readCV() {
    var mail = $('a[href^="mailto:"]');
    var li = $('a[href*="linkedin.com"]');
    return {
      name: txt($('.hero h1')),
      role: txt($('.hero .role')),
      place: txt($('.hero .eyebrow')),
      pitch: txt($('.hero .pitch')),
      email: mail ? mail.getAttribute('href').replace('mailto:', '') : '',
      linkedin: li ? li.href : '',
      site: 'https://agileroy.github.io/',
      stats: $$('.stat').map(function (s) { return { n: txt($('.n', s)), l: txt($('.l', s)) }; }),
      jobs: $$('#parcours .job').map(readJob),
      certs: $$('#certifications .cert').map(function (c) {
        return { y: txt($('.y', c)), t: txt($('.t', c)), o: txt($('.o', c)) };
      }),
      cards: $$('#plus .card').map(readCard)
    };
  }
  function short(url) { return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''); }

  /* ---------- PDF ---------- */
  function pdfRuns(rs) { return rs.map(function (r) { return r.b ? { text: r.t, bold: true, color: C.ok } : { text: r.t }; }); }

  function pdfResult(res) {
    return {
      margin: [0, 4, 0, 6],
      table: {
        widths: ['*'],
        body: [[{
          fillColor: C.okSoft,
          stack: [{ text: (res.label || 'Résultat').toUpperCase(), style: 'resLbl' }].concat(
            res.items.map(function (it) { return { text: [{ text: '•  ', color: C.ok, bold: true }].concat(pdfRuns(it)), margin: [0, 1, 0, 0] }; })
          )
        }]]
      },
      layout: {
        hLineWidth: function () { return 0; },
        vLineWidth: function (i) { return i === 0 ? 2 : 0; },
        vLineColor: function () { return C.ok; },
        paddingLeft: function () { return 8; }, paddingRight: function () { return 8; },
        paddingTop: function () { return 5; }, paddingBottom: function () { return 5; }
      }
    };
  }

  function pdfSection(title) {
    return {
      stack: [
        { text: title.toUpperCase(), style: 'h2' },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.8, lineColor: C.accent }] }
      ],
      margin: [0, 14, 0, 8]
    };
  }

  function pdfJob(j) {
    var out = [{
      columns: [
        { width: '*', stack: [{ text: j.title, style: 'jobTitle' }, { text: j.company, style: 'company' }] },
        { width: 'auto', stack: [{ text: j.dates, style: 'dates' }].concat(j.meta.map(function (m) { return { text: m, style: 'meta' }; })) }
      ],
      columnGap: 12
    }];
    j.blocks.forEach(function (b) {
      if (b.type === 'intl') out.push({ text: b.text, style: 'intl' });
      else if (b.type === 'ctx') out.push({ text: b.text, style: 'ctx' });
      else if (b.type === 'label') out.push({ text: b.text, style: 'lbl' });
      else if (b.type === 'list') out.push({ ul: b.items.map(function (it) { return { text: pdfRuns(it) }; }), margin: [0, 2, 0, 4], markerColor: C.accent });
      else if (b.type === 'result') out.push(pdfResult(b));
      else if (b.type === 'team') {
        out.push({ text: b.name, style: 'team' });
        if (b.desc) out.push({ text: b.desc, margin: [0, 0, 0, 2] });
        if (b.result) out.push(pdfResult(b.result));
      }
    });
    // les expériences courtes ne sont jamais coupées entre deux pages
    var compact = !j.blocks.some(function (b) { return b.type === 'team'; });
    return { stack: out, margin: [0, 0, 0, 12], unbreakable: compact };
  }

  function buildPdf(cv) {
    var contact = [];
    if (cv.email) contact.push({ text: cv.email, link: 'mailto:' + cv.email, color: C.ink });
    if (cv.linkedin) contact.push({ text: '   ·   ' }, { text: short(cv.linkedin), link: cv.linkedin, color: C.ink });
    contact.push({ text: '   ·   ' }, { text: short(cv.site), link: cv.site, color: C.ink });

    var content = [
      { text: cv.name, style: 'name' },
      { text: cv.role, style: 'role' },
      { text: contact, style: 'contact' },
      { text: cv.place, fontSize: 8.5, color: C.muted, margin: [0, 2, 0, 0] },
      { text: cv.pitch, margin: [0, 10, 0, 10] },
      {
        columns: cv.stats.map(function (s) {
          return { stack: [{ text: s.n, style: 'statN' }, { text: s.l, style: 'statL' }] };
        }),
        columnGap: 14
      },
      pdfSection('Parcours')
    ];
    cv.jobs.forEach(function (j) { content.push(pdfJob(j)); });

    content.push(pdfSection('Certifications'));
    cv.certs.forEach(function (c) {
      content.push({
        columns: [
          { width: 34, text: c.y, color: C.muted, bold: true },
          { width: '*', text: c.t, bold: true },
          { width: 'auto', text: c.o, color: C.muted }
        ],
        columnGap: 8, margin: [0, 0, 0, 4]
      });
    });

    var cards = cv.cards.slice();
    var lang = cards.filter(function (c) { return /formation/i.test(c.title); });
    var rest = cards.filter(function (c) { return !/formation/i.test(c.title); });
    lang.concat(rest).forEach(function (card) {
      content.push(pdfSection(card.title));
      content.push({
        ul: card.items.map(function (it) {
          return { text: [{ text: it.t, bold: true }, { text: it.s ? ' — ' + it.s : '', color: C.muted }] };
        }),
        markerColor: C.accent
      });
    });

    return {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 44],
      info: { title: 'CV – ' + cv.name, author: cv.name },
      defaultStyle: { font: 'Roboto', fontSize: 9.5, color: C.ink, lineHeight: 1.25 },
      footer: function (page, pages) {
        return { text: cv.name + ' · ' + short(cv.site) + '   —   ' + page + ' / ' + pages, alignment: 'center', fontSize: 8, color: C.muted, margin: [0, 16, 0, 0] };
      },
      content: content,
      styles: {
        name: { fontSize: 24, bold: true },
        role: { fontSize: 12, color: C.accent, bold: true, margin: [0, 2, 0, 4] },
        contact: { fontSize: 9.5 },
        h2: { fontSize: 11.5, bold: true, color: C.accent, characterSpacing: 1, margin: [0, 0, 0, 3] },
        jobTitle: { fontSize: 12, bold: true },
        company: { fontSize: 10, bold: true, color: C.accent, margin: [0, 1, 0, 3] },
        dates: { fontSize: 9, bold: true, alignment: 'right' },
        meta: { fontSize: 8.5, color: C.muted, alignment: 'right' },
        intl: { fontSize: 9, italics: true, color: C.muted, margin: [0, 0, 0, 3] },
        ctx: { bold: true, margin: [0, 2, 0, 2] },
        lbl: { bold: true, color: C.accent, margin: [0, 6, 0, 2] },
        team: { fontSize: 10, bold: true, margin: [0, 6, 0, 1] },
        resLbl: { fontSize: 7.5, bold: true, color: C.ok, characterSpacing: 0.8 },
        statN: { fontSize: 18, bold: true, color: C.accent },
        statL: { fontSize: 8, color: C.muted }
      }
    };
  }

  /* ---------- Word (.docx) ---------- */
  function hex(c) { return c.replace('#', ''); }

  function buildDocx(cv) {
    var D = window.docx;
    var P = D.Paragraph, T = D.TextRun;
    var WIDTH = 11906 - 2 * 1000; // A4 moins les marges, en twips

    function rich(rs, extra) {
      return rs.map(function (r) { return new T(Object.assign({ text: r.t, bold: r.b, color: r.b ? hex(C.ok) : undefined }, extra || {})); });
    }
    function link(text, url) {
      return new D.ExternalHyperlink({ link: url, children: [new T({ text: text, style: 'Hyperlink' })] });
    }
    function section(title) {
      return new P({
        spacing: { before: 280, after: 120 },
        border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: hex(C.accent), space: 2 } },
        children: [new T({ text: title.toUpperCase(), bold: true, size: 24, color: hex(C.accent), characterSpacing: 20 })]
      });
    }
    function bullet(children) { return new P({ bullet: { level: 0 }, spacing: { after: 40 }, children: children }); }
    function result(res) {
      var box = {
        shading: { type: D.ShadingType.CLEAR, color: 'auto', fill: hex(C.okSoft) },
        border: { left: { style: D.BorderStyle.SINGLE, size: 18, color: hex(C.ok), space: 6 } },
        indent: { left: 140 }
      };
      var out = [new P(Object.assign({ spacing: { before: 60, after: 0 }, children: [new T({ text: (res.label || 'Résultat').toUpperCase(), bold: true, size: 16, color: hex(C.ok) })] }, box))];
      res.items.forEach(function (it, i) {
        out.push(new P(Object.assign({
          spacing: { after: i === res.items.length - 1 ? 120 : 0 },
          children: [new T({ text: '✓  ', bold: true, color: hex(C.ok) })].concat(rich(it))
        }, box)));
      });
      return out;
    }

    var kids = [];
    kids.push(new P({ spacing: { after: 0 }, children: [new T({ text: cv.name, bold: true, size: 44 })] }));
    kids.push(new P({ spacing: { after: 60 }, children: [new T({ text: cv.role, bold: true, size: 24, color: hex(C.accent) })] }));
    var contact = [];
    if (cv.email) contact.push(link(cv.email, 'mailto:' + cv.email));
    if (cv.linkedin) contact.push(new T({ text: '   ·   ' }), link(short(cv.linkedin), cv.linkedin));
    contact.push(new T({ text: '   ·   ' }), link(short(cv.site), cv.site));
    kids.push(new P({ spacing: { after: 0 }, children: contact }));
    kids.push(new P({ spacing: { after: 160 }, children: [new T({ text: cv.place, color: hex(C.muted), size: 18 })] }));
    kids.push(new P({ spacing: { after: 160 }, children: [new T({ text: cv.pitch })] }));

    cv.stats.forEach(function (s) {
      kids.push(new P({ spacing: { after: 20 }, children: [new T({ text: s.n + '  ', bold: true, color: hex(C.accent), size: 24 }), new T({ text: s.l, color: hex(C.muted) })] }));
    });

    kids.push(section('Parcours'));
    cv.jobs.forEach(function (j, idx) {
      kids.push(new P({
        spacing: { before: idx ? 240 : 60, after: 0 },
        keepNext: true,
        tabStops: [{ type: D.TabStopType.RIGHT, position: WIDTH }],
        children: [new T({ text: j.title, bold: true, size: 24 }), new T({ text: '\t' + j.dates, bold: true, size: 18, color: hex(C.muted) })]
      }));
      kids.push(new P({
        spacing: { after: 80 }, keepNext: true,
        tabStops: [{ type: D.TabStopType.RIGHT, position: WIDTH }],
        children: [new T({ text: j.company, bold: true, color: hex(C.accent) }), new T({ text: '\t' + j.meta.join(' · '), size: 17, color: hex(C.muted) })]
      }));
      j.blocks.forEach(function (b) {
        if (b.type === 'intl') kids.push(new P({ spacing: { after: 60 }, children: [new T({ text: b.text, italics: true, color: hex(C.muted), size: 19 })] }));
        else if (b.type === 'ctx') kids.push(new P({ spacing: { after: 40 }, children: [new T({ text: b.text, bold: true })] }));
        else if (b.type === 'label') kids.push(new P({ spacing: { before: 120, after: 40 }, keepNext: true, children: [new T({ text: b.text, bold: true, color: hex(C.accent) })] }));
        else if (b.type === 'list') b.items.forEach(function (it) { kids.push(bullet(rich(it))); });
        else if (b.type === 'result') kids.push.apply(kids, result(b));
        else if (b.type === 'team') {
          kids.push(new P({ spacing: { before: 120, after: 20 }, keepNext: true, children: [new T({ text: b.name, bold: true })] }));
          if (b.desc) kids.push(new P({ spacing: { after: 40 }, children: [new T({ text: b.desc })] }));
          if (b.result) kids.push.apply(kids, result(b.result));
        }
      });
    });

    kids.push(section('Certifications'));
    cv.certs.forEach(function (c) {
      kids.push(new P({
        spacing: { after: 40 },
        children: [new T({ text: c.y + '   ', bold: true, color: hex(C.muted) }), new T({ text: c.t, bold: true }), new T({ text: c.o ? '  ·  ' + c.o : '', color: hex(C.muted) })]
      }));
    });

    var lang = cv.cards.filter(function (c) { return /formation/i.test(c.title); });
    var rest = cv.cards.filter(function (c) { return !/formation/i.test(c.title); });
    lang.concat(rest).forEach(function (card) {
      kids.push(section(card.title));
      card.items.forEach(function (it) {
        kids.push(bullet([new T({ text: it.t, bold: true }), new T({ text: it.s ? ' — ' + it.s : '', color: hex(C.muted) })]));
      });
    });

    return new D.Document({
      creator: cv.name,
      title: 'CV – ' + cv.name,
      styles: { default: { document: { run: { font: 'Calibri', size: 20, color: hex(C.ink) }, paragraph: { spacing: { line: 264 } } } } },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        children: kids
      }]
    });
  }

  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  window.CVExport = {
    read: readCV,
    pdfDefinition: function () { return buildPdf(readCV()); },
    pdf: function () {
      return loadAll(LIBS.pdf).then(function () {
        return new Promise(function (ok) { window.pdfMake.createPdf(buildPdf(readCV())).download(FILE + '.pdf', ok); });
      });
    },
    docx: function () {
      return loadAll(LIBS.docx).then(function () {
        return window.docx.Packer.toBlob(buildDocx(readCV()));
      }).then(function (blob) { save(blob, FILE + '.docx'); });
    }
  };
})();
