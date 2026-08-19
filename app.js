const CONFIG = window.YECHIM_CONFIG || {};
const SUPABASE_READY = Boolean(window.supabase && CONFIG.supabaseUrl && !CONFIG.supabaseUrl.includes('YOUR_PROJECT') && CONFIG.supabaseAnonKey && !CONFIG.supabaseAnonKey.includes('YOUR_'));
const db = SUPABASE_READY ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;

const state = { products: [], loading: true, query: '', brands: [], categories: [], productId: new URLSearchParams(location.search).get('product') };
const CART_KEY = 'yechim_cart_v2';
let cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const money = v => Number(v || 0).toLocaleString('ru-RU') + ' сум';
const productUrl = id => `?product=${encodeURIComponent(id)}`;
const normalize = x => String(x ?? '').toLowerCase().trim();

async function loadProducts() {
  try {
    if (db) {
      const { data, error } = await db.rpc('get_public_catalog');
      if (error) throw error;
      state.products = (data || []).map(p => ({
        id: p.eman_id,
        eman_id: p.eman_id,
        source_url: p.source_url,
        sku: p.sku || '', name: p.name, brand: p.brand, category: p.category,
        subcategory: p.subcategory, price: p.price, currency: p.currency,
        image: p.image_url, description: p.description, specs: p.specs || {},
        mounting_scheme: p.mounting_scheme_url, additional_images: p.additional_images || [], badge: p.badge
      }));
    } else {
      const r = await fetch('data/products.json'); const raw = await r.json();
      state.products = raw.products || [];
    }
    state.brands = [...new Set(state.products.map(p => p.brand).filter(Boolean))];
    state.categories = [...new Set(state.products.map(p => p.category).filter(Boolean))];
  } catch (e) {
    state.products = []; document.querySelector('#app').innerHTML = `<div class="shell"><div class="panel error"><b>Каталог временно недоступен.</b><div class="muted">${esc(e.message || e)}</div></div></div>`;
  } finally {
    state.loading = false;
  }
}

function persistCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateCartBadge(); }
function cartQty() { return Object.values(cart).reduce((a,b) => a + b, 0); }
function updateCartBadge() { const el = document.querySelector('#cartCount'); if (el) el.textContent = cartQty(); }
function add(id, delta=1) { cart[id] = Math.max(0, (cart[id] || 0) + delta); if (!cart[id]) delete cart[id]; persistCart(); if (state.productId) renderDetail(); else renderHome(); }

function renderHome() {
  state.productId = null;
  history.replaceState({}, '', './');
  document.title = 'YECHIM — каталог';
  const brands = ['STARAX','SAMET','CEBI','MESAN','YECHIM LIGHTING'];
  document.querySelector('#app').innerHTML = `
  <div class="shell">
    <section class="catalog-head">
      <div><div class="eyebrow">YECHIM by Eman Materials</div><h1>Каталог</h1><p class="muted">Мебельная фурнитура и решения с актуальными ценами.</p></div>
      <div class="search wide"><input id="q" placeholder="Найти товар, артикул или бренд" value="${esc(state.query)}"><button class="btn btn-primary" id="searchBtn">Найти</button></div>
    </section>
    <section><div class="section-head"><h2>Бренды</h2></div><div class="brand-grid">${brands.map(b => `<button class="brand" data-brand="${esc(b)}"><span>${esc(b)}</span></button>`).join('')}</div></section>
    <div class="section-head"><h2 id="resultsTitle">Товары</h2><button class="btn btn-ghost" id="clearFilters">Сбросить фильтры</button></div>
    <div class="layout"><aside class="filters"><div class="filter-title">Фильтры</div>
      <div class="filter-block"><div class="filter-title">Бренд</div>${brands.map(b => `<label class="check"><input type="checkbox" class="brand-filter" value="${esc(b)}"> ${esc(b)}</label>`).join('')}</div>
      <div class="filter-block"><div class="filter-title">Категория</div><div id="catFilters"></div></div>
    </aside><section class="products" id="products"></section></div>
  </div>`;
  document.querySelector('#searchBtn').onclick = () => { state.query = document.querySelector('#q').value; applyFilters(); };
  document.querySelector('#q').onkeydown = e => { if (e.key === 'Enter') { state.query = e.target.value; applyFilters(); } };
  document.querySelectorAll('[data-brand]').forEach(b => b.onclick = () => { state.query=''; document.querySelectorAll('.brand-filter').forEach(x=>x.checked=x.value===b.dataset.brand); applyFilters(); });
  document.querySelectorAll('.brand-filter').forEach(x=>x.onchange=applyFilters);
  document.querySelector('#clearFilters').onclick = () => { state.query=''; document.querySelector('#q').value=''; document.querySelectorAll('input[type=checkbox]').forEach(x=>x.checked=false); applyFilters(); };
  renderCategoryFilters(); applyFilters(); updateCartBadge();
}

function renderCategoryFilters() {
  document.querySelector('#catFilters').innerHTML = state.categories.sort().map(c => `<label class="check"><input type="checkbox" class="cat-filter" value="${esc(c)}"> ${esc(c)}</label>`).join('');
  document.querySelectorAll('.cat-filter').forEach(x => x.onchange=applyFilters);
}

function applyFilters() {
  state.query = document.querySelector('#q')?.value ?? state.query;
  const q = normalize(state.query);
  const brands = [...document.querySelectorAll('.brand-filter:checked')].map(x=>x.value);
  const cats = [...document.querySelectorAll('.cat-filter:checked')].map(x=>x.value);
  const filtered = state.products.filter(p => (!q || [p.name,p.sku,p.brand,p.category,p.subcategory].map(normalize).join(' ').includes(q)) && (!brands.length || brands.includes(p.brand)) && (!cats.length || cats.includes(p.category)));
  const productEl = document.querySelector('#products'); if (!productEl) return;
  productEl.innerHTML = filtered.map(productCard).join('') || `<div class="panel"><b>Ничего не найдено.</b><div class="muted">Попробуйте другой артикул, название или фильтр.</div></div>`;
  document.querySelector('#resultsTitle').textContent = q ? `Результаты поиска · ${filtered.length}` : `Товары · ${filtered.length}`;
}

function productCard(p) {
  return `<article class="product"><a class="photo" href="${productUrl(p.id)}">${p.image ? `<img src="${esc(p.image)}" alt="">` : '<span>Фото товара</span>'}</a><div class="product-body"><div class="brand-mini">${esc(p.brand)}</div><h3>${esc(p.name)}</h3><div class="sku">Артикул: ${esc(p.sku || '—')}</div>${p.badge ? `<div class="badge">${esc(p.badge)}</div>` : ''}<div class="price">${p.price ? money(p.price) : 'Цена уточняется'}</div><div class="card-actions"><a class="btn btn-ghost" href="${productUrl(p.id)}">Подробнее</a><button class="btn btn-primary" onclick="event.preventDefault();add('${encodeURIComponent(p.id)}')">В корзину</button></div></div></article>`;
}

function getProduct() { return state.products.find(x => String(x.id) === String(state.productId)); }
function renderDetail() {
  const p = getProduct(); if (!p) return renderHome();
  document.title = `YECHIM — ${p.name}`;
  const thumbs = [p.image, ...(p.additional_images || [])].filter(Boolean);
  document.querySelector('#app').innerHTML = `<div class="shell"><div class="breadcrumbs"><a href="./">Каталог</a><span>›</span><span>${esc(p.brand)}</span><span>›</span><b>${esc(p.name)}</b></div><div class="detail"><div class="gallery"><div class="gallery-main">${p.image ? `<img id="mainImage" src="${esc(p.image)}" alt="">` : '<span>Фото товара</span>'}</div>${thumbs.length>1?`<div class="thumbs">${thumbs.map((u,i)=>`<button class="thumb ${i===0?'active':''}" data-img="${esc(u)}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>`:''}</div><div class="info"><div class="brand-mini">${esc(p.brand)}</div><h1>${esc(p.name)}</h1><div class="sku">Артикул: ${esc(p.sku || '—')}</div>${p.badge?`<div class="badge">${esc(p.badge)}</div>`:''}<div class="price detail-price">${p.price ? money(p.price) : 'Цена уточняется'}</div><div class="buyline"><div class="qty"><button class="btn btn-ghost" id="minus">−</button><b>${cart[p.id]||0}</b><button class="btn btn-ghost" id="plus">+</button></div><button class="btn btn-primary grow-btn" id="addToCart">В корзину</button><button class="btn btn-ghost" id="share">Поделиться</button></div>${p.description?`<p class="description">${esc(p.description)}</p>`:''}<div class="specs">${Object.entries(p.specs||{}).map(([k,v])=>`<div class="spec"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>${p.mounting_scheme?`<div class="extra-block"><h3>Схема присадки</h3><a href="${esc(p.mounting_scheme)}" target="_blank" rel="noopener"><img class="scheme" src="${esc(p.mounting_scheme)}" alt="Схема присадки"></a></div>`:''}</div></div></div>`;
  document.querySelectorAll('.thumb').forEach(x=>x.onclick=()=>{document.querySelector('#mainImage').src=x.dataset.img;document.querySelectorAll('.thumb').forEach(t=>t.classList.remove('active'));x.classList.add('active')});
  document.querySelector('#minus').onclick=()=>add(p.id,-1); document.querySelector('#plus').onclick=()=>add(p.id,1); document.querySelector('#addToCart').onclick=()=>add(p.id,1); document.querySelector('#share').onclick=shareProduct;
  updateCartBadge();
}

async function shareProduct(){
  const url = location.href; const p = getProduct();
  try { if (navigator.share) await navigator.share({title:p?.name || 'YECHIM', text:p?.sku ? `Артикул ${p.sku}` : 'Товар YECHIM', url}); else { await navigator.clipboard.writeText(url); alert('Ссылка на товар скопирована.'); } }
  catch(e) { /* user cancelled */ }
}

function renderCart() {
  const items = Object.entries(cart).map(([id,q])=>({p:state.products.find(x=>x.id===id),q})).filter(x=>x.p);
  const old=document.querySelector('.cart-drawer'); if(old) old.remove();
  const el=document.createElement('aside'); el.className='cart-drawer';
  el.innerHTML=`<div class="cart-head"><div><h3>Корзина</h3><span class="muted">${items.length} позиций · ${cartQty()} шт.</span></div><button class="btn btn-ghost" id="closeCart">Закрыть</button></div>${items.length?items.map(({p,q})=>`<div class="cart-row"><div><b>${esc(p.brand)}</b><div>${esc(p.name)}</div><div class="muted">${esc(p.sku||'')}</div></div><div class="qty"><button class="btn btn-ghost" onclick="add('${encodeURIComponent(p.id)}',-1)">−</button><b>${q}</b><button class="btn btn-ghost" onclick="add('${encodeURIComponent(p.id)}',1)">+</button></div><button class="btn btn-ghost" onclick="add('${encodeURIComponent(p.id)}',-999)">×</button></div>`).join(''):'<div class="empty">Корзина пока пустая.</div>'}<div class="cart-actions">${items.length?`<button class="btn btn-primary" id="sendRequest">Отправить заявку</button>`:''}</div>`;
  document.body.append(el); el.querySelector('#closeCart').onclick=()=>el.remove(); const btn=el.querySelector('#sendRequest'); if(btn) btn.onclick=sendRequest;
}

function sendRequest(){
  const items=Object.entries(cart).map(([id,q])=>({p:state.products.find(x=>x.id===id),q})).filter(x=>x.p);
  if(!items.length)return;
  const lines=items.map(({p,q})=>`${p.sku || p.id} — ${q} шт.`).join('\n');
  const text=`Заявка из YECHIM Catalog\n\n${lines}`;
  const username=(CONFIG.telegramManagerUsername||'').replace(/^@/,'').trim();
  if(!username || username.includes('YOUR_')){ navigator.clipboard?.writeText(text); alert('Список заявки скопирован. Укажите Telegram username менеджера в supabase-config.js.'); return; }
  window.open(`https://t.me/${encodeURIComponent(username)}?text=${encodeURIComponent(text)}`,'_blank');
}

document.querySelector('#cartButton').onclick=renderCart;
(async()=>{await loadProducts(); if(state.productId) renderDetail(); else renderHome();})();
window.add=add;
