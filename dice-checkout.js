/**
 * BlowGirl × Dice — Checkout PIX + Facebook Pixel
 * Intercepta o carrinho e redireciona para pagamento PIX via Dice.
 */

(function () {
  'use strict';

  /* ── Catálogo de produtos (ID do carrinho → dados) ─────────────────────────
     IDs extraídos dos hrefs /carrinho/produto/{ID}/adicionar              */
  var PRODUTOS = {};  /* preenchido dinamicamente via _catalog.json ou scan da página */

  var FRETE = 0;
  var COR   = '#d63384'; /* pink BlowGirl */

  /* estado */
  var cart      = [];
  var pixText   = '';
  var pixId     = null;
  var pollingTO = null;
  var timerTO   = null;
  var etapa     = 1;

  /* ── Utilitários ── */
  function fmt(v) { return 'R$ ' + v.toFixed(2).replace('.', ','); }
  function totalCart()    { return cart.reduce(function (s, i) { return s + i.preco * i.qty; }, 0) + FRETE; }
  function subtotalCart() { return cart.reduce(function (s, i) { return s + i.preco * i.qty; }, 0); }

  /* ── Lê preço da página atual ── */
  function readPagePrice() {
    var el = document.querySelector('[itemprop="price"]');
    if (el) {
      var v = parseFloat((el.getAttribute('content') || el.textContent || '0').replace(',', '.'));
      if (v > 0) return v;
    }
    /* Tenta ler texto R$ X,XX */
    var priceEls = document.querySelectorAll('.preco-atual, .preco strong, .valor-atual, .price, [class*="preco"] strong');
    for (var i = 0; i < priceEls.length; i++) {
      var txt = priceEls[i].textContent.replace(/[^\d,]/g, '').replace(',', '.');
      var n = parseFloat(txt);
      if (n > 0) return n;
    }
    return 0;
  }

  /* ── Lê dados do produto da página atual ── */
  function readPageProduct() {
    var h1 = document.querySelector('h1, .nome-produto, .product-name');
    var name = h1 ? h1.textContent.trim() : 'Produto BlowGirl';
    var price = readPagePrice();
    var img = '';
    var imgEl = document.querySelector('[itemprop="image"], .imagem-principal img, .foto-principal img, .produto-foto img, .main-product-image img');
    if (imgEl) img = imgEl.src || imgEl.getAttribute('data-src') || '';
    /* ID via link de compra no DOM */
    var buyLink = document.querySelector("a[href*='/carrinho/produto/']");
    var productId = null;
    if (buyLink) {
      var m = (buyLink.getAttribute('href') || '').match(/\/carrinho\/produto\/(\d+)\//);
      if (m) productId = m[1];
    }
    return { productId: productId, nome: name, preco: price, img: img };
  }

  /* ── Carrega catálogo do servidor ── */
  function loadCatalog() {
    fetch('/_catalog.json').then(function (r) { return r.json(); }).then(function (data) {
      Object.assign(PRODUTOS, data);
    }).catch(function () {});
  }

  /* ── Injeção de estilos ── */
  function injectCSS() {
    var s = document.createElement('style');
    s.textContent = [
      ':root { --pz: ' + COR + '; --pz-light: #fce4ec; --pz-dark: #9c1d56; }',
      'html,body { max-width:100%;overflow-x:hidden; }',

      /* overlay */
      '.pz-overlay { position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;opacity:0;visibility:hidden;transition:opacity .3s; }',
      '.pz-overlay.on { opacity:1;visibility:visible; }',

      /* drawer */
      '.pz-drawer { position:fixed;top:0;right:-110%;width:100%;max-width:420px;height:100%;height:100dvh;background:#fff;z-index:9999;transition:right .35s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-4px 0 24px rgba(0,0,0,.14); }',
      '.pz-drawer.on { right:0; }',
      '.pz-dhead { display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #eee; }',
      '.pz-dhead h3 { font-size:1.05em;font-weight:700;margin:0; }',
      '.pz-dclose { background:none;border:none;font-size:1.4em;cursor:pointer;color:#888;padding:8px;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center; }',
      '.pz-dbody { flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 20px; }',
      '.pz-empty { text-align:center;padding:60px 20px;color:#aaa; }',
      '.pz-item { display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #eee;align-items:flex-start; }',
      '.pz-item-img { width:72px;height:72px;border-radius:10px;object-fit:cover;flex-shrink:0;background:#f3f3f3; }',
      '.pz-item-info { flex:1;min-width:0; }',
      '.pz-item-name { font-weight:600;font-size:.9em;margin-bottom:6px;line-height:1.3; }',
      '.pz-item-price { font-weight:700;color:var(--pz);font-size:1em; }',
      '.pz-qty { display:flex;align-items:center;gap:8px;margin-bottom:6px; }',
      '.pz-qty-btn { width:36px;height:36px;border:1.5px solid #ddd;border-radius:6px;background:#f7f7f7;cursor:pointer;font-size:1em;font-weight:700;display:flex;align-items:center;justify-content:center;touch-action:manipulation; }',
      '.pz-qty-btn:hover { border-color:var(--pz);color:var(--pz); }',
      '.pz-qty-num { font-size:.95em;font-weight:700;min-width:22px;text-align:center; }',
      '.pz-dfooter { padding:16px 20px;padding-bottom:max(16px,env(safe-area-inset-bottom));border-top:1px solid #eee; }',
      '.pz-totals-row { display:flex;justify-content:space-between;font-size:.88em;color:#666;margin-bottom:6px; }',
      '.pz-totals-row.grand { font-size:1.08em;font-weight:700;color:#222;border-top:1px solid #eee;padding-top:10px;margin-top:4px; }',
      '.pz-totals-row.grand span:last-child { color:var(--pz); }',
      '.pz-btn-ck { display:block;width:100%;padding:16px;min-height:52px;background:var(--pz);color:#fff;border:none;border-radius:50px;font-size:.97em;font-weight:700;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;margin-top:14px;transition:box-shadow .2s;touch-action:manipulation; }',
      '.pz-btn-ck:hover { box-shadow:0 6px 20px rgba(214,51,132,.35); }',

      /* modal checkout */
      '.pz-modal-wrap { display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);align-items:flex-end;overflow-y:auto; }',
      '.pz-modal-wrap.on { display:flex; }',
      '@media(min-width:580px) { .pz-modal-wrap { align-items:center;justify-content:center;padding:20px; } }',
      '.pz-modal { background:#fff;width:100%;max-width:500px;max-height:100dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;border-radius:20px 20px 0 0;position:relative; }',
      '@media(min-width:580px) { .pz-modal { border-radius:16px;max-height:92dvh; } }',
      '.pz-mhead { position:sticky;top:0;background:#fff;padding:14px 16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;z-index:2; }',
      '.pz-mhead-title { font-size:1em;font-weight:700; }',
      '.pz-mclose { width:36px;height:36px;min-width:36px;border:none;background:#f3f3f3;border-radius:50%;cursor:pointer;font-size:.95em;color:#666;display:flex;align-items:center;justify-content:center;touch-action:manipulation; }',
      '.pz-steps { display:flex;border-bottom:1px solid #eee; }',
      '.pz-step { flex:1;text-align:center;padding:11px 0;font-size:.72em;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#aaa;border-bottom:2px solid transparent;transition:all .2s; }',
      '.pz-step.active { color:var(--pz);border-color:var(--pz); }',
      '.pz-step.done { color:var(--pz); }',
      '.pz-mbody { padding:18px 14px;padding-bottom:max(18px,env(safe-area-inset-bottom)); }',
      '@media(min-width:400px) { .pz-mbody { padding:22px 20px; } }',
      '.pz-stage { display:none; }',
      '.pz-stage.show { display:block; }',

      /* form */
      '.pz-summary { border:1px solid #eee;border-radius:10px;padding:14px;margin-bottom:18px; }',
      '.pz-sum-row { display:flex;justify-content:space-between;font-size:.88em;color:#666;padding:5px 0; }',
      '.pz-sum-row.grand { font-weight:700;color:#222;font-size:1em;border-top:1px solid #eee;margin-top:5px;padding-top:10px; }',
      '.pz-sum-row.grand span:last-child { color:var(--pz);font-size:1.15em; }',
      '.pz-fg { margin-bottom:13px; }',
      '.pz-fg label { display:block;font-size:.78em;font-weight:600;color:#888;margin-bottom:4px;letter-spacing:.03em; }',
      '.pz-inp { width:100%;border:1.5px solid #ddd;border-radius:9px;padding:12px 13px;font-size:16px;color:#222;background:#f8f8f8;outline:none;transition:border-color .2s;font-family:inherit;-webkit-appearance:none;box-sizing:border-box; }',
      '.pz-inp:focus { border-color:var(--pz);background:#fff; }',
      '.pz-inp.err { border-color:#e53935;background:#fff8f8; }',
      '.pz-row2 { display:grid;grid-template-columns:1fr 1fr;gap:10px; }',
      '@media(max-width:400px) { .pz-row2 { grid-template-columns:1fr; } }',
      '.pz-actions { display:flex;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid #eee; }',
      '.pz-btn-back { flex-shrink:0;border:1.5px solid #ddd;border-radius:50px;padding:14px 16px;min-height:52px;background:none;font-size:.87em;font-weight:600;color:#888;cursor:pointer;font-family:inherit;touch-action:manipulation; }',
      '.pz-btn-next { flex:1;border:none;border-radius:50px;padding:15px;min-height:52px;background:var(--pz);color:#fff;font-size:.93em;font-weight:700;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;transition:box-shadow .2s;font-family:inherit;touch-action:manipulation; }',
      '.pz-btn-next:hover { box-shadow:0 4px 16px rgba(214,51,132,.35); }',
      '.pz-btn-next:disabled { opacity:.5;pointer-events:none; }',
      '.pz-obrig { color:var(--pz); }',

      /* PIX */
      '.pz-pix-wrap { text-align:center;padding:6px 0; }',
      '.pz-pix-amount { font-size:2.2em;font-weight:700;color:var(--pz);letter-spacing:-.02em;line-height:1; }',
      '.pz-pix-sub { font-size:.86em;color:#888;margin:6px 0 22px; }',
      '.pz-pix-load { display:flex;flex-direction:column;align-items:center;gap:14px;padding:36px 0; }',
      '.pz-spinner { width:38px;height:38px;border:3px solid #eee;border-top-color:var(--pz);border-radius:50%;animation:pzspin .8s linear infinite; }',
      '@keyframes pzspin { to { transform:rotate(360deg); } }',
      '.pz-pix-load p { font-size:.86em;color:#888; }',
      '#pz-qr-wrap { display:none; }',
      '.pz-timer { display:none;align-items:center;justify-content:center;gap:8px;background:#fff8e1;border:1px solid #ffb300;border-radius:9px;padding:8px 14px;margin-bottom:14px;font-size:.82em;font-weight:600;color:#7b5600; }',
      '.pz-timer.on { display:flex; }',
      '.pz-timer-val { color:#c0392b;font-family:monospace;font-size:1.1em; }',
      '#pz-qrcode { width:180px;height:180px;margin:0 auto 16px;padding:8px;background:#fff;border:1px solid #eee;border-radius:12px; }',
      '#pz-qrcode img,#pz-qrcode canvas { max-width:100%;height:auto; }',
      '.pz-code-box { background:#f5f5f5;border:1px solid #eee;border-radius:9px;padding:9px 12px;font-family:monospace;font-size:.74em;color:#888;word-break:break-all;text-align:left;margin-bottom:12px;max-height:52px;overflow:hidden; }',
      '.pz-btn-copy { display:block;width:100%;padding:15px;min-height:52px;background:#222;color:#fff;border:none;border-radius:50px;font-size:.92em;font-weight:700;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;transition:background .2s;margin-bottom:18px;font-family:inherit;touch-action:manipulation; }',
      '.pz-btn-copy.ok { background:#27ae60; }',
      '.pz-pix-steps { text-align:left;border:1px solid #eee;border-radius:10px;overflow:hidden; }',
      '.pz-pix-step { display:flex;gap:12px;align-items:flex-start;padding:11px 14px;border-bottom:1px solid #eee;font-size:.86em;color:#666; }',
      '.pz-pix-step:last-child { border-bottom:none; }',
      '.pz-pix-n { flex-shrink:0;width:22px;height:22px;background:var(--pz);color:#fff;border-radius:50%;font-size:.74em;font-weight:700;display:flex;align-items:center;justify-content:center; }',
      '#pz-pix-err { display:none;text-align:center;padding:28px 0; }',
      '#pz-pix-err p { font-size:.86em;color:#e53935;margin:8px 0 16px; }',
      '.pz-btn-retry { background:#f3f3f3;border:1.5px solid #ddd;border-radius:50px;padding:12px 22px;min-height:48px;font-size:.86em;font-weight:600;color:#444;cursor:pointer;font-family:inherit;touch-action:manipulation; }',

      /* confirmação */
      '.pz-done { text-align:center;padding:40px 16px; }',
      '.pz-done-icon { font-size:3.2em;margin-bottom:16px; }',
      '.pz-done h3 { font-size:1.35em;font-weight:700;margin-bottom:10px; }',
      '.pz-done p { color:#888;font-size:.93em;line-height:1.7; }',
      '.pz-btn-done { margin-top:22px;background:var(--pz);color:#fff;border:none;border-radius:50px;padding:14px 34px;min-height:52px;font-size:.93em;font-weight:700;cursor:pointer;font-family:inherit;touch-action:manipulation; }',

      /* badge */
      '.pz-cart-badge { position:fixed;bottom:calc(20px + env(safe-area-inset-bottom));right:16px;z-index:9997;background:var(--pz);color:#fff;border-radius:50px;padding:12px 18px;font-size:.82em;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(214,51,132,.35);transition:transform .2s,box-shadow .2s;display:none;align-items:center;gap:7px;touch-action:manipulation; }',
      '@media(min-width:768px) { .pz-cart-badge { top:12px;bottom:auto;right:16px; } }',
      '.pz-cart-badge.show { display:flex; }',
      '.pz-cart-badge:hover { transform:scale(1.05); }',
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── Injeção de HTML ── */
  function injectHTML() {
    var el = document.createElement('div');
    el.innerHTML = [
      '<div class="pz-overlay" id="pz-overlay"></div>',

      '<div class="pz-cart-badge" id="pz-badge" onclick="pzAbrirDrawer()">',
      '  <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" stroke="#fff" stroke-width="1.5" fill="none"/></svg>',
      '  <span id="pz-badge-txt">Ver Carrinho</span>',
      '</div>',

      '<div class="pz-drawer" id="pz-drawer">',
      '  <div class="pz-dhead"><h3>Seu Carrinho</h3><button class="pz-dclose" onclick="pzFecharDrawer()">✕</button></div>',
      '  <div class="pz-dbody" id="pz-dbody"><div class="pz-empty"><p>Seu carrinho está vazio.</p></div></div>',
      '  <div class="pz-dfooter" id="pz-dfooter" style="display:none">',
      '    <div class="pz-totals-row"><span>Subtotal</span><span id="pz-sub">R$ 0,00</span></div>',
      '    <div class="pz-totals-row"><span>Frete</span><span>Grátis</span></div>',
      '    <div class="pz-totals-row grand"><span>Total</span><span id="pz-total">R$ 0,00</span></div>',
      '    <button class="pz-btn-ck" onclick="pzAbrirModal()">Finalizar Compra — PIX</button>',
      '  </div>',
      '</div>',

      '<div class="pz-modal-wrap" id="pz-modal">',
      '  <div class="pz-modal">',
      '    <div class="pz-mhead"><span class="pz-mhead-title">Finalizar Pedido</span><button class="pz-mclose" onclick="pzFecharModal()">✕</button></div>',
      '    <div class="pz-steps">',
      '      <div class="pz-step active" id="pz-s1">1. Dados</div>',
      '      <div class="pz-step" id="pz-s2">2. Pagamento</div>',
      '      <div class="pz-step" id="pz-s3">3. Confirmação</div>',
      '    </div>',
      '    <div class="pz-mbody">',

      /* Stage 1 — dados */
      '      <div class="pz-stage show" id="pz-stage1">',
      '        <div class="pz-summary" id="pz-summary"></div>',
      '        <div class="pz-fg"><label>Nome completo <span class="pz-obrig">*</span></label><input id="pz-nome" class="pz-inp" placeholder="Seu nome"></div>',
      '        <div class="pz-fg"><label>E-mail <span class="pz-obrig">*</span></label><input id="pz-email" class="pz-inp" type="email" placeholder="seu@email.com"></div>',
      '        <div class="pz-row2">',
      '          <div class="pz-fg"><label>CPF <span class="pz-obrig">*</span></label><input id="pz-cpf" class="pz-inp" placeholder="000.000.000-00" maxlength="14"></div>',
      '          <div class="pz-fg"><label>Telefone</label><input id="pz-tel" class="pz-inp" placeholder="(11) 99999-9999" maxlength="15"></div>',
      '        </div>',
      '        <div class="pz-actions"><button class="pz-btn-next" onclick="pzIrEtapa2()">Ir para Pagamento →</button></div>',
      '      </div>',

      /* Stage 2 — PIX */
      '      <div class="pz-stage" id="pz-stage2">',
      '        <div class="pz-pix-wrap">',
      '          <div class="pz-pix-amount" id="pz-pix-amount">R$ 0,00</div>',
      '          <p class="pz-pix-sub">Pagamento via PIX — aprovação em segundos</p>',
      '          <div class="pz-timer" id="pz-timer"><span>⏱ Expira em:</span><span class="pz-timer-val" id="pz-timer-val">15:00</span></div>',
      '          <div class="pz-pix-load" id="pz-pix-load"><div class="pz-spinner"></div><p>Gerando código PIX...</p></div>',
      '          <div id="pz-qr-wrap">',
      '            <div id="pz-qrcode"></div>',
      '            <p class="pz-code-box" id="pz-code-txt"></p>',
      '            <button class="pz-btn-copy" id="pz-btn-copy" onclick="pzCopiarPix()">Copiar código PIX</button>',
      '            <div class="pz-pix-steps">',
      '              <div class="pz-pix-step"><div class="pz-pix-n">1</div><span>Abra o app do seu banco</span></div>',
      '              <div class="pz-pix-step"><div class="pz-pix-n">2</div><span>Escolha pagar via PIX Copia e Cola</span></div>',
      '              <div class="pz-pix-step"><div class="pz-pix-n">3</div><span>Cole o código copiado e confirme</span></div>',
      '            </div>',
      '          </div>',
      '          <div id="pz-pix-err"><p>Não foi possível gerar o PIX. Tente novamente.</p><button class="pz-btn-retry" onclick="pzGerarPix()">Tentar novamente</button></div>',
      '        </div>',
      '        <div class="pz-actions"><button class="pz-btn-back" onclick="pzIrEtapa(1)">← Voltar</button></div>',
      '      </div>',

      /* Stage 3 — confirmação */
      '      <div class="pz-stage" id="pz-stage3">',
      '        <div class="pz-done">',
      '          <div class="pz-done-icon">🌸</div>',
      '          <h3>Pagamento Confirmado!</h3>',
      '          <p>Seu pedido foi recebido com sucesso.<br>Em breve você receberá a confirmação por e-mail.</p>',
      '          <button class="pz-btn-done" onclick="pzFecharModal();pzLimparCarrinho()">Continuar comprando</button>',
      '        </div>',
      '      </div>',

      '    </div>',
      '  </div>',
      '</div>',
    ].join('');
    document.body.appendChild(el);
  }

  /* ── Badge ── */
  function pzAtualizarBadge() {
    var total = cart.reduce(function (s, i) { return s + i.qty; }, 0);
    var badge = document.getElementById('pz-badge');
    var txt   = document.getElementById('pz-badge-txt');
    if (!badge) return;
    if (total > 0) {
      badge.classList.add('show');
      txt.textContent = 'Carrinho (' + total + ')';
    } else {
      badge.classList.remove('show');
    }
  }

  /* ── Render drawer ── */
  function pzRenderDrawer() {
    var body   = document.getElementById('pz-dbody');
    var footer = document.getElementById('pz-dfooter');
    var subEl  = document.getElementById('pz-sub');
    var totEl  = document.getElementById('pz-total');
    if (!body) return;
    if (!cart.length) {
      body.innerHTML = '<div class="pz-empty"><p>Seu carrinho está vazio.</p></div>';
      if (footer) footer.style.display = 'none';
      return;
    }
    body.innerHTML = cart.map(function (item, idx) {
      return [
        '<div class="pz-item">',
        item.img ? '<img class="pz-item-img" src="' + item.img + '" alt="">' : '<div class="pz-item-img"></div>',
        '<div class="pz-item-info">',
        '  <div class="pz-item-name">' + item.nome + '</div>',
        '  <div class="pz-qty">',
        '    <button class="pz-qty-btn" onclick="pzQty(' + idx + ',-1)">−</button>',
        '    <span class="pz-qty-num">' + item.qty + '</span>',
        '    <button class="pz-qty-btn" onclick="pzQty(' + idx + ',1)">+</button>',
        '  </div>',
        '  <div class="pz-item-price">' + fmt(item.preco * item.qty) + '</div>',
        '</div>',
        '</div>',
      ].join('');
    }).join('');
    if (footer) {
      footer.style.display = 'block';
      if (subEl) subEl.textContent = fmt(subtotalCart());
      if (totEl) totEl.textContent = fmt(totalCart());
    }
  }

  /* ── Controles drawer ── */
  window.pzAbrirDrawer = function () {
    document.getElementById('pz-drawer').classList.add('on');
    document.getElementById('pz-overlay').classList.add('on');
    document.body.style.overflow = 'hidden';
  };
  window.pzFecharDrawer = function () {
    document.getElementById('pz-drawer').classList.remove('on');
    document.getElementById('pz-overlay').classList.remove('on');
    document.body.style.overflow = '';
  };

  /* ── Modal ── */
  window.pzAbrirModal = function () {
    pzFecharDrawer();
    etapa = 1; pzIrEtapa(1);
    var sumEl = document.getElementById('pz-summary');
    if (sumEl) {
      sumEl.innerHTML = cart.map(function (i) {
        return '<div class="pz-sum-row"><span>' + i.nome + ' ×' + i.qty + '</span><span>' + fmt(i.preco * i.qty) + '</span></div>';
      }).join('') + '<div class="pz-sum-row"><span>Frete</span><span>Grátis</span></div>' +
        '<div class="pz-sum-row grand"><span>Total</span><span>' + fmt(totalCart()) + '</span></div>';
    }
    document.getElementById('pz-modal').classList.add('on');
    document.body.style.overflow = 'hidden';
    /* FB Pixel: InitiateCheckout */
    fbEvent('InitiateCheckout', { value: totalCart(), currency: 'BRL', num_items: cart.reduce(function(s,i){return s+i.qty;},0) });
  };
  window.pzFecharModal = function () {
    document.getElementById('pz-modal').classList.remove('on');
    document.body.style.overflow = '';
    if (pollingTO) { clearTimeout(pollingTO); pollingTO = null; }
    if (timerTO)   { clearTimeout(timerTO);   timerTO   = null; }
  };

  function pzIrEtapa(n) {
    etapa = n;
    [1,2,3].forEach(function (i) {
      var stage = document.getElementById('pz-stage' + i);
      var step  = document.getElementById('pz-s' + i);
      if (!stage || !step) return;
      stage.classList.toggle('show', i === n);
      step.classList.remove('active','done');
      if (i < n) step.classList.add('done');
      else if (i === n) step.classList.add('active');
    });
  }

  /* ── Máscara CPF e Tel ── */
  function bindMasks() {
    var cpf = document.getElementById('pz-cpf');
    var tel = document.getElementById('pz-tel');
    if (cpf) cpf.addEventListener('input', function () {
      var v = cpf.value.replace(/\D/g,'').slice(0,11);
      cpf.value = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, function(_,a,b,c,d){ return a+'.'+b+'.'+c+(d?'-'+d:''); });
    });
    if (tel) tel.addEventListener('input', function () {
      var v = tel.value.replace(/\D/g,'').slice(0,11);
      tel.value = v.replace(/(\d{2})(\d{5})(\d{0,4})/, function(_,a,b,c){ return '('+a+') '+b+(c?'-'+c:''); });
    });
  }

  /* ── Etapa 2 ── */
  window.pzIrEtapa2 = function () {
    var nome  = (document.getElementById('pz-nome')  || {}).value || '';
    var email = (document.getElementById('pz-email') || {}).value || '';
    var cpf   = (document.getElementById('pz-cpf')   || {}).value || '';
    var ok = true;
    ['pz-nome','pz-email','pz-cpf'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (!el.value.trim()) { el.classList.add('err'); ok = false; }
      else el.classList.remove('err');
    });
    if (!ok) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      var el = document.getElementById('pz-email'); if (el) el.classList.add('err'); return;
    }
    pzIrEtapa(2);
    var amEl = document.getElementById('pz-pix-amount');
    if (amEl) amEl.textContent = fmt(totalCart());
    pzGerarPix();
  };

  /* ── Gera PIX ── */
  window.pzGerarPix = function () {
    var loadEl  = document.getElementById('pz-pix-load');
    var qrWrap  = document.getElementById('pz-qr-wrap');
    var errEl   = document.getElementById('pz-pix-err');
    var timerEl = document.getElementById('pz-timer');
    if (loadEl)  loadEl.style.display  = 'flex';
    if (qrWrap)  qrWrap.style.display  = 'none';
    if (errEl)   errEl.style.display   = 'none';
    if (timerEl) timerEl.classList.remove('on');
    if (pollingTO) { clearTimeout(pollingTO); pollingTO = null; }

    var nome  = (document.getElementById('pz-nome')  || {}).value || '';
    var email = (document.getElementById('pz-email') || {}).value || '';
    var cpf   = (document.getElementById('pz-cpf')   || {}).value || '';
    var tel   = (document.getElementById('pz-tel')   || {}).value || '';
    var total = totalCart();
    var nomes = cart.map(function(i){ return i.nome + ' x' + i.qty; }).join(', ');

    fetch('/api/criar-pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome, email: email, cpf: cpf, tel: tel, produto_nome: nomes, total: total })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok || !d.qr_code_text) throw new Error(d.erro || 'sem qr_code');
      pixText = d.qr_code_text;
      pixId   = d.payment_id;
      if (loadEl) loadEl.style.display = 'none';
      if (qrWrap) qrWrap.style.display = 'block';
      var codeEl = document.getElementById('pz-code-txt');
      if (codeEl) codeEl.textContent = pixText;

      /* QR Code via API pública */
      var qrEl = document.getElementById('pz-qrcode');
      if (qrEl) {
        qrEl.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(pixText) + '" alt="QR Code PIX">';
      }

      /* Timer 15 min */
      var end = Date.now() + 15 * 60 * 1000;
      if (timerEl) timerEl.classList.add('on');
      function tick() {
        var left = Math.max(0, end - Date.now());
        var m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
        var tv = document.getElementById('pz-timer-val');
        if (tv) tv.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        if (left > 0) timerTO = setTimeout(tick, 1000);
      }
      tick();

      /* Polling */
      if (pixId) pzPollStatus(pixId, { total: total, email: email });
    }).catch(function (err) {
      console.error('[BlowGirl] PIX err:', err);
      if (loadEl) loadEl.style.display = 'none';
      if (errEl) errEl.style.display = 'block';
    });
  };

  /* ── Polling status ── */
  function pzPollStatus(id, meta) {
    fetch('/api/status-pagamento?id=' + id)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.status === 'PAID' || d.status === 'APPROVED') {
          pzIrEtapa(3);
          /* FB Purchase dispara só na confirmação real do pagamento */
          var total = (meta && meta.total) || 0;
          var email = (meta && meta.email) || '';
          fbEvent('Purchase', { value: total, currency: 'BRL', num_items: cart.length });
          fbServerEvent('Purchase', { value: total, currency: 'BRL', email: email });
        } else {
          pollingTO = setTimeout(function () { pzPollStatus(id, meta); }, 5000);
        }
      })
      .catch(function () {
        pollingTO = setTimeout(function () { pzPollStatus(id, meta); }, 10000);
      });
  }

  /* ── Copia PIX ── */
  window.pzCopiarPix = function () {
    if (!pixText) return;
    var btn = document.getElementById('pz-btn-copy');
    navigator.clipboard.writeText(pixText).then(function () {
      if (btn) { btn.textContent = '✓ Copiado!'; btn.classList.add('ok'); }
      setTimeout(function () {
        if (btn) { btn.textContent = 'Copiar código PIX'; btn.classList.remove('ok'); }
      }, 3000);
    }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = pixText; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (btn) { btn.textContent = '✓ Copiado!'; btn.classList.add('ok'); }
    });
  };

  /* ── Cart qty ── */
  window.pzQty = function (idx, delta) {
    if (!cart[idx]) return;
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    pzAtualizarBadge();
    pzRenderDrawer();
  };

  window.pzLimparCarrinho = function () {
    cart = []; pixText = ''; pixId = null;
    pzAtualizarBadge();
    pzRenderDrawer();
  };

  /* ── Adicionar ao carrinho ── */
  window.pzAdicionarAoCarrinho = function (productId, nome, preco, img) {
    var existente = cart.find(function (i) { return i.productId === productId; });
    if (existente) {
      existente.qty++;
    } else {
      cart.push({ productId: productId, nome: nome, preco: preco, qty: 1, img: img || '' });
    }
    pzAtualizarBadge();
    pzRenderDrawer();
    /* Na página de produto: abre modal direto */
    if (window.location.pathname.length > 1 && document.querySelector('.botao-comprar, .produto-comprar, [class*="produto"]')) {
      pzAbrirModal();
    } else {
      pzAbrirDrawer();
    }
    /* FB: AddToCart */
    fbEvent('AddToCart', { content_ids: [productId], content_name: nome, value: preco, currency: 'BRL' });
  };

  /* ── Facebook Pixel (client-side) ── */
  function fbEvent(event, params) {
    if (window.fbq) { try { window.fbq('track', event, params || {}); } catch(_) {} }
  }

  function fbServerEvent(event, params) {
    try {
      fetch('/api/fb-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: event, params: params || {}, url: window.location.href })
      }).catch(function(){});
    } catch(_) {}
  }

  /* ── Intercepta o carrinho BlowGirl ── */
  function interceptCart() {
    /* Bloqueia /carrinho/* (exceto /carrinho/produto/ID/adicionar que tratamos) */
    var origFetch = window.fetch;
    var CART_RE = /\/carrinho\/(produto\/\d+\/adicionar|finalizar|atualizar|remover|voucher)/;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url && /\/carrinho/.test(url) && !/\/carrinho\/produto\/\d+\/adicionar/.test(url)) {
        return Promise.resolve(new Response(JSON.stringify({ success: true, items: [] }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        }));
      }
      return origFetch.apply(this, arguments);
    };

    /* Intercepta cliques nos botões de compra */
    document.addEventListener('click', function (e) {
      var buyLink = e.target.closest(
        'a[href*="/carrinho/produto/"], a.botao-comprar, a.tag-comprar, .botao-comprar, .btn-comprar'
      );
      if (buyLink) {
        e.preventDefault();
        e.stopImmediatePropagation();

        var href = buyLink.getAttribute('href') || '';
        var m = href.match(/\/carrinho\/produto\/(\d+)\//);
        var productId = m ? m[1] : null;

        if (productId && PRODUTOS[productId]) {
          var prod = PRODUTOS[productId];
          pzAdicionarAoCarrinho(productId, prod.nome, prod.preco, prod.img);
        } else {
          /* Fallback: lê dados da página atual */
          var pdata = readPageProduct();
          var pid   = productId || pdata.productId || ('page_' + Date.now());
          var nome  = pdata.nome  || 'Produto BlowGirl';
          var preco = pdata.preco || 0;
          var img   = pdata.img   || '';
          if (preco > 0) {
            /* Salva no catálogo para próximas interações */
            if (pid) PRODUTOS[pid] = { nome: nome, preco: preco, img: img };
            pzAdicionarAoCarrinho(pid, nome, preco, img);
          }
        }
        return;
      }

      /* Bloqueia /carrinho e /finalizar links */
      var link = e.target.closest('a[href]');
      if (link) {
        var href = link.getAttribute('href') || '';
        if (/^\/carrinho(?!\/produto)/.test(href) || /\/finalizar/.test(href)) {
          e.preventDefault();
          if (cart.length > 0) pzAbrirDrawer();
        }
      }
    }, true);

    /* Bloqueia submit de formulários de carrinho */
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form) return;
      var action = form.getAttribute('action') || '';
      if (/\/carrinho/.test(action)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  }

  /* ── Init ── */
  function init() {
    injectCSS();
    injectHTML();
    loadCatalog();

    var ready = function () {
      var overlay = document.getElementById('pz-overlay');
      if (overlay) overlay.addEventListener('click', function () {
        pzFecharDrawer();
        pzFecharModal();
      });
      bindMasks();
      interceptCart();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ready);
    } else {
      ready();
    }
  }

  init();
})();
