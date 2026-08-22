const CONFIG = window.YECHIM_CONFIG || {};

const SUPABASE_READY = Boolean(
  window.supabase &&
  CONFIG.supabaseUrl &&
  !CONFIG.supabaseUrl.includes('YOUR_PROJECT') &&
  CONFIG.supabaseAnonKey &&
  !CONFIG.supabaseAnonKey.includes('YOUR_')
);

const db = SUPABASE_READY
  ? window.supabase.createClient(
      CONFIG.supabaseUrl,
      CONFIG.supabaseAnonKey
    )
  : null;

const state = {
  products: [],
  loading: true,
  query: '',
  selectedBrand: null,
  selectedCategory: null,
  productId: new URLSearchParams(location.search).get('product')
};

const CART_KEY = 'yechim_cart_v2';

let cart = {};

try {
  cart = JSON.parse(
    localStorage.getItem(CART_KEY) || '{}'
  );
} catch {
  cart = {};
}

/* =========================================
   HELPERS
========================================= */

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&#039;',
        "'": '&#039;'
      }[c])
  );

const money = (v) =>
  Number(v || 0).toLocaleString('ru-RU') + ' сум';

const productUrl = (id) =>
  `?product=${encodeURIComponent(id)}`;

const normalize = (x) =>
  String(x ?? '').toLowerCase().trim();

const goHome = () => {
  history.pushState({}, '', './');
  state.productId = null;
  state.selectedBrand = null;
  state.selectedCategory = null;
  renderHome();
};

const goBrand = (brand) => {
  history.pushState(
    {},
    '',
    `?brand=${encodeURIComponent(brand)}`
  );

  state.productId = null;
  state.selectedBrand = brand;
  state.selectedCategory = null;

  renderBrandCategories();
};

const goCategory = (brand, category) => {
  history.pushState(
    {},
    '',
    `?brand=${encodeURIComponent(
      brand
    )}&category=${encodeURIComponent(category)}`
  );

  state.productId = null;
  state.selectedBrand = brand;
  state.selectedCategory = category;

  renderCategoryProducts();
};

/* =========================================
   LOAD PRODUCTS
========================================= */

async function loadProducts() {

  try {

    if (db) {

      const { data, error } =
        await db.rpc('get_public_catalog');

      if (error) {
        throw error;
      }

      state.products = (data || []).map((p) => ({
        id: p.eman_id,
        eman_id: p.eman_id,
        source_url: p.source_url,

        sku: p.sku || '',

        name: p.name,

        brand: p.brand,

        category:
          p.category || 'Без категории',

        subcategory:
          p.subcategory || '',

        price: p.price,

        currency: p.currency,

        image: p.image_url,

        description: p.description,

        specs: p.specs || {},

        mounting_scheme:
          p.mounting_scheme_url,

        additional_images:
          p.additional_images || [],

        badge: p.badge
      }));

    } else {

      const r =
        await fetch('data/products.json');

      const raw = await r.json();

      state.products =
        raw.products || [];
    }

  } catch (e) {

    state.products = [];

    document.querySelector('#app').innerHTML = `
      <div class="shell">
        <div class="panel error">
          <b>Каталог временно недоступен.</b>
          <div class="muted">
            ${esc(e.message || e)}
          </div>
        </div>
      </div>
    `;

  } finally {

    state.loading = false;
  }
}

/* =========================================
   CART
========================================= */

function persistCart() {

  localStorage.setItem(
    CART_KEY,
    JSON.stringify(cart)
  );

  updateCartBadge();
}

function cartQty() {

  return Object.values(cart)
    .reduce(
      (total, quantity) =>
        total + Number(quantity || 0),
      0
    );
}

function updateCartBadge() {

  const el =
    document.querySelector('#cartCount');

  if (el) {
    el.textContent = cartQty();
  }
}

function add(id, delta = 1) {

  const key = String(id);

  const current =
    Number(cart[key] || 0);

  const next =
    current + Number(delta || 0);

  if (next <= 0) {
    delete cart[key];
  } else {
    cart[key] = next;
  }

  persistCart();

  if (state.productId) {
    renderDetail();
  } else if (
    state.selectedBrand &&
    state.selectedCategory
  ) {
    renderCategoryProducts();
  } else if (state.selectedBrand) {
    renderBrandCategories();
  } else {
    renderHome();
  }
}

function clearCart() {

  cart = {};

  persistCart();

  const drawer =
    document.querySelector('.cart-drawer');

  if (drawer) {
    renderCart();
  }
}

/* =========================================
   HOME
========================================= */

function renderHome() {

  state.productId = null;
  state.selectedBrand = null;
  state.selectedCategory = null;

  history.replaceState({}, '', './');

  document.title =
    'YECHIM — Решения для вашей мебели';

  const brands = [
    'STARAX',
    'SAMET',
    'CEBI',
    'MESAN',
    'YECHIM LIGHTING'
  ];

  document.querySelector('#app').innerHTML = `

    <div class="shell">

      <section class="catalog-head">

        <div>
          <div class="eyebrow">
            YECHIM
          </div>

          <h1>
            Каталог
          </h1>

          <p class="muted">
            Решения для вашей мебели
          </p>
        </div>

        <div class="search wide">

          <input
            id="q"
            placeholder="Найти товар или артикул"
            value="${esc(state.query)}"
          >

          <button
            class="btn btn-primary"
            id="searchBtn"
            type="button"
          >
            Найти
          </button>

        </div>

      </section>

      <section>

        <div class="section-head">
          <h2>Бренды</h2>
        </div>

        <div class="brand-grid">

          ${brands
            .map(
              (brand) => `
                <button
                  class="brand"
                  data-brand="${esc(brand)}"
                  type="button"
                >
                  ${esc(brand)}
                </button>
              `
            )
            .join('')}

        </div>

      </section>

    </div>
  `;

  const searchBtn =
    document.querySelector('#searchBtn');

  const searchInput =
    document.querySelector('#q');

  searchBtn.onclick = () => {

    state.query =
      searchInput.value.trim();

    renderSearchResults();
  };

  searchInput.onkeydown = (event) => {

    if (event.key === 'Enter') {

      state.query =
        event.target.value.trim();

      renderSearchResults();
    }
  };

  document
    .querySelectorAll('[data-brand]')
    .forEach((button) => {

      button.onclick = () => {
        goBrand(button.dataset.brand);
      };
    });

  updateCartBadge();
}

/* =========================================
   BRAND → CATEGORIES
========================================= */

function renderBrandCategories() {

  const brand =
    state.selectedBrand;

  const products =
    state.products.filter(
      (p) => normalize(p.brand) === normalize(brand)
    );

  const categories =
    [...new Set(
      products
        .map((p) => p.category)
        .filter(Boolean)
    )]
      .sort((a, b) =>
        String(a).localeCompare(
          String(b),
          'ru'
        )
      );

  document.title =
    `YECHIM — ${brand}`;

  document.querySelector('#app').innerHTML = `

    <div class="shell">

      <div class="breadcrumbs">

        <a href="./" id="backHome">
          Каталог
        </a>

        <span>›</span>

        <b>
          ${esc(brand)}
        </b>

      </div>

      <div class="section-head">

        <h1>
          ${esc(brand)}
        </h1>

        <button
          class="btn btn-ghost"
          id="backBrand"
          type="button"
        >
          Назад
        </button>

      </div>

      <p class="muted">
        Категории товаров
      </p>

      <section class="category-grid">

        ${
          categories.length
            ? categories
                .map((category) => {

                  const count =
                    products.filter(
                      (p) =>
                        normalize(
                          p.category
                        ) ===
                        normalize(category)
                    ).length;

                  return `
                    <button
                      class="category-card"
                      data-category="${esc(category)}"
                      type="button"
                    >

                      <div class="category-card-title">
                        ${esc(category)}
                      </div>

                      <div class="category-card-count">
                        ${count} ${
                          count === 1
                            ? 'товар'
                            : 'товаров'
                        }
                      </div>

                    </button>
                  `;
                })
                .join('')
            : `
              <div class="panel">
                <b>Категории пока не определены.</b>

                <div class="muted">
                  Для этого бренда в базе Eman ещё не заполнена
                  категория товара.
                </div>
              </div>
            `
        }

      </section>

    </div>
  `;

  document.querySelector('#backHome').onclick =
    (event) => {

      event.preventDefault();

      goHome();
    };

  document.querySelector('#backBrand').onclick =
    goHome;

  document
    .querySelectorAll('[data-category]')
    .forEach((button) => {

      button.onclick = () => {

        goCategory(
          brand,
          button.dataset.category
        );
      };
    });

  updateCartBadge();
}

/* =========================================
   CATEGORY → PRODUCTS
========================================= */

function renderCategoryProducts() {

  const brand =
    state.selectedBrand;

  const category =
    state.selectedCategory;

  const products =
    state.products.filter(
      (p) =>
        normalize(p.brand) ===
          normalize(brand) &&
        normalize(p.category) ===
          normalize(category)
    );

  document.title =
    `YECHIM — ${category}`;

  document.querySelector('#app').innerHTML = `

    <div class="shell">

      <div class="breadcrumbs">

        <a href="./" id="categoryHome">
          Каталог
        </a>

        <span>›</span>

        <a href="#" id="categoryBrand">
          ${esc(brand)}
        </a>

        <span>›</span>

        <b>
          ${esc(category)}
        </b>

      </div>

      <div class="section-head">

        <div>
          <div class="eyebrow">
            ${esc(brand)}
          </div>

          <h1>
            ${esc(category)}
          </h1>
        </div>

        <button
          class="btn btn-ghost"
          id="backToCategories"
          type="button"
        >
          Категории
        </button>

      </div>

      <section
        class="products"
        id="products"
      >

        ${
          products.length
            ? products
                .map(productCard)
                .join('')
            : `
              <div class="panel">
                <b>
                  В этой категории пока нет товаров.
                </b>
              </div>
            `
        }

      </section>

    </div>
  `;

  document.querySelector('#categoryHome').onclick =
    (event) => {

      event.preventDefault();

      goHome();
    };

  document.querySelector('#categoryBrand').onclick =
    (event) => {

      event.preventDefault();

      goBrand(brand);
    };

  document.querySelector(
    '#backToCategories'
  ).onclick = () => {

    goBrand(brand);
  };

  updateCartBadge();
}

/* =========================================
   SEARCH
========================================= */

function renderSearchResults() {

  const q =
    normalize(state.query);

  const products =
    state.products.filter((p) => {

      const haystack = [
        p.name,
        p.sku,
        p.brand,
        p.category,
        p.subcategory
      ]
        .filter(Boolean)
        .map(normalize)
        .join(' ');

      return !q || haystack.includes(q);
    });

  document.title =
    `YECHIM — Поиск`;

  document.querySelector('#app').innerHTML = `

    <div class="shell">

      <div class="breadcrumbs">

        <a href="./" id="searchHome">
          Каталог
        </a>

        <span>›</span>

        <b>
          Поиск
        </b>

      </div>

      <section class="catalog-head">

        <div>

          <div class="eyebrow">
            YECHIM
          </div>

          <h1>
            Поиск
          </h1>

          <p class="muted">
            ${products.length}
            ${
              products.length === 1
                ? 'товар'
                : 'товаров'
            }
          </p>

        </div>

        <div class="search wide">

          <input
            id="searchInput"
            value="${esc(state.query)}"
            placeholder="Найти товар или артикул"
          >

          <button
            class="btn btn-primary"
            id="searchAgain"
            type="button"
          >
            Найти
          </button>

        </div>

      </section>

      <section class="products">

        ${
          products.length
            ? products
                .map(productCard)
                .join('')
            : `
              <div class="panel">
                <b>
                  Ничего не найдено.
                </b>

                <div class="muted">
                  Попробуйте другой запрос.
                </div>
              </div>
            `
        }

      </section>

    </div>
  `;

  document.querySelector('#searchHome').onclick =
    (event) => {

      event.preventDefault();

      goHome();
    };

  const input =
    document.querySelector('#searchInput');

  const searchAgain =
    document.querySelector('#searchAgain');

  const executeSearch = () => {

    state.query =
      input.value.trim();

    renderSearchResults();
  };

  searchAgain.onclick =
    executeSearch;

  input.onkeydown = (event) => {

    if (event.key === 'Enter') {
      executeSearch();
    }
  };

  updateCartBadge();
}

/* =========================================
   PRODUCT CARD
========================================= */

function productCard(p) {

  return `
    <article
      class="product"
      data-product-card="${encodeURIComponent(p.id)}"
    >

      <a
        class="product-link"
        href="${productUrl(p.id)}"
      >

        <div class="photo">

          ${
            p.image
              ? `
                <img
                  src="${esc(p.image)}"
                  alt="${esc(p.name)}"
                  loading="lazy"
                >
              `
              : `
                <span>
                  Фото товара
                </span>
              `
          }

        </div>

        <div class="product-body">

          <div class="brand-mini">
            ${esc(p.brand)}
          </div>

          <h3>
            ${esc(p.name)}
          </h3>

          <div class="sku">
            ${
              p.sku
                ? `Артикул: ${esc(p.sku)}`
                : ''
            }
          </div>

          ${
            p.badge
              ? `
                <div class="badge">
                  ${esc(p.badge)}
                </div>
              `
              : ''
          }

          <div class="price">
            ${
              p.price
                ? money(p.price)
                : 'Цена уточняется'
            }
          </div>

        </div>

      </a>

      <div
        class="product-body"
        style="padding-top:0"
      >

        <div class="card-actions">

          <button
            class="btn btn-primary"
            type="button"
            data-add="${encodeURIComponent(p.id)}"
          >
            В корзину
          </button>

        </div>

      </div>

    </article>
  `;
}

/* =========================================
   PRODUCT DETAIL
========================================= */

function getProduct() {

  return state.products.find(
    (x) =>
      String(x.id) ===
      String(state.productId)
  );
}

function renderDetail() {

  const p = getProduct();

  if (!p) {
    return renderHome();
  }

  document.title =
    `YECHIM — ${p.name}`;

  const thumbs = [
    p.image,
    ...(p.additional_images || [])
  ].filter(Boolean);

  document.querySelector('#app').innerHTML = `

    <div class="shell">

      <div class="breadcrumbs">

        <a href="./" id="detailHome">
          Каталог
        </a>

        <span>›</span>

        <span>
          ${esc(p.brand)}
        </span>

        <span>›</span>

        <b>
          ${esc(p.name)}
        </b>

      </div>

      <div class="detail">

        <div class="gallery">

          <div class="gallery-main">

            ${
              p.image
                ? `
                  <img
                    id="mainImage"
                    src="${esc(p.image)}"
                    alt="${esc(p.name)}"
                  >
                `
                : `
                  <span>
                    Фото товара
                  </span>
                `
            }

          </div>

          ${
            thumbs.length > 1
              ? `
                <div class="thumbs">

                  ${thumbs
                    .map(
                      (u, i) => `
                        <button
                          class="thumb ${
                            i === 0
                              ? 'active'
                              : ''
                          }"
                          data-img="${esc(u)}"
                          type="button"
                        >

                          <img
                            src="${esc(u)}"
                            alt=""
                          >

                        </button>
                      `
                    )
                    .join('')}

                </div>
              `
              : ''
          }

        </div>

        <div class="info">

          <div class="brand-mini">
            ${esc(p.brand)}
          </div>

          <h1>
            ${esc(p.name)}
          </h1>

          ${
            p.sku
              ? `
                <div class="sku">
                  Артикул: ${esc(p.sku)}
                </div>
              `
              : ''
          }

          ${
            p.badge
              ? `
                <div class="badge">
                  ${esc(p.badge)}
                </div>
              `
              : ''
          }

          <div class="price detail-price">
            ${
              p.price
                ? money(p.price)
                : 'Цена уточняется'
            }
          </div>

          <div class="buyline">

            <div class="qty">

              <button
                class="btn btn-ghost"
                id="minus"
                type="button"
              >
                −
              </button>

              <b id="detailQty">
                ${cart[p.id] || 0}
              </b>

              <button
                class="btn btn-ghost"
                id="plus"
                type="button"
              >
                +
              </button>

            </div>

            <button
              class="btn btn-primary grow-btn"
              id="addToCart"
              type="button"
            >
              В корзину
            </button>

            <button
              class="btn btn-ghost"
              id="share"
              type="button"
            >
              Поделиться
            </button>

          </div>

          ${
            p.description
              ? `
                <p class="description">
                  ${esc(p.description)}
                </p>
              `
              : ''
          }

          ${
            Object.keys(p.specs || {}).length
              ? `
                <div class="specs">

                  ${Object.entries(
                    p.specs || {}
                  )
                    .map(
                      ([k, v]) => `
                        <div class="spec">

                          <b>
                            ${esc(k)}
                          </b>

                          <span>
                            ${esc(v)}
                          </span>

                        </div>
                      `
                    )
                    .join('')}

                </div>
              `
              : ''
          }

          ${
            p.mounting_scheme
              ? `
                <div class="extra-block">

                  <h3>
                    Схема присадки
                  </h3>

                  <a
                    href="${esc(
                      p.mounting_scheme
                    )}"
                    target="_blank"
                    rel="noopener"
                  >

                    <img
                      class="scheme"
                      src="${esc(
                        p.mounting_scheme
                      )}"
                      alt="Схема присадки"
                    >

                  </a>

                </div>
              `
              : ''
          }

        </div>

      </div>

    </div>
  `;

  document.querySelector('#detailHome').onclick =
    (event) => {

      event.preventDefault();

      goHome();
    };

  document
    .querySelectorAll('.thumb')
    .forEach((button) => {

      button.onclick = () => {

        const mainImage =
          document.querySelector(
            '#mainImage'
          );

        if (mainImage) {
          mainImage.src =
            button.dataset.img;
        }

        document
          .querySelectorAll('.thumb')
          .forEach((thumb) =>
            thumb.classList.remove(
              'active'
            )
          );

        button.classList.add('active');
      };
    });

  document.querySelector('#minus').onclick =
    () => add(p.id, -1);

  document.querySelector('#plus').onclick =
    () => add(p.id, 1);

  document.querySelector('#addToCart').onclick =
    () => add(p.id, 1);

  document.querySelector('#share').onclick =
    shareProduct;

  updateCartBadge();
}

/* =========================================
   SHARE
========================================= */

async function shareProduct() {

  const url =
    location.href;

  const p =
    getProduct();

  try {

    if (navigator.share) {

      await navigator.share({
        title:
          p?.name ||
          'YECHIM',

        text:
          p?.sku
            ? `Артикул ${p.sku}`
            : 'Товар YECHIM',

        url
      });

    } else {

      await navigator.clipboard.writeText(
        url
      );

      alert(
        'Ссылка на товар скопирована.'
      );
    }

  } catch {
    /* Пользователь отменил */
  }
}

/* =========================================
   CART DRAWER
========================================= */

function renderCart() {

  const items =
    Object.entries(cart)
      .map(([id, q]) => ({
        p: state.products.find(
          (x) =>
            String(x.id) ===
            String(id)
        ),
        q: Number(q)
      }))
      .filter(
        (x) =>
          x.p &&
          x.q > 0
      );

  const old =
    document.querySelector(
      '.cart-drawer'
    );

  if (old) {
    old.remove();
  }

  const el =
    document.createElement('aside');

  el.className =
    'cart-drawer';

  el.innerHTML = `

    <div class="cart-head">

      <div>

        <h3>
          Корзина
        </h3>

        <span class="muted">
          ${items.length}
          ${
            items.length === 1
              ? 'позиция'
              : 'позиций'
          }
          ·
          ${cartQty()} шт.
        </span>

      </div>

      <div class="cart-head-actions">

        ${
          items.length
            ? `
              <button
                class="btn btn-ghost"
                id="clearCart"
                type="button"
              >
                ×
              </button>
            `
            : ''
        }

        <button
          class="btn btn-ghost"
          id="closeCart"
          type="button"
        >
          Закрыть
        </button>

      </div>

    </div>

    ${
      items.length
        ? items
            .map(
              ({ p, q }) => `
                <div class="cart-row">

                  <div class="cart-item-info">

                    <b>
                      ${esc(p.brand)}
                    </b>

                    <div class="cart-item-name">
                      ${esc(p.name)}
                    </div>

                    ${
                      p.sku
                        ? `
                          <div class="muted">
                            ${esc(p.sku)}
                          </div>
                        `
                        : ''
                    }

                  </div>

                  <div class="cart-item-actions">

                    <div class="qty">

                      <button
                        class="btn btn-ghost"
                        data-cart-minus="${encodeURIComponent(
                          p.id
                        )}"
                        type="button"
                      >
                        −
                      </button>

                      <b>
                        ${q}
                      </b>

                      <button
                        class="btn btn-ghost"
                        data-cart-plus="${encodeURIComponent(
                          p.id
                        )}"
                        type="button"
                      >
                        +
                      </button>

                    </div>

                  </div>

                </div>
              `
            )
            .join('')
        : `
          <div class="empty">
            Корзина пока пустая.
          </div>
        `
    }

    ${
      items.length
        ? `
          <div class="cart-actions">

            <button
              class="btn btn-primary"
              id="sendRequest"
              type="button"
            >
              Отправить заявку
            </button>

          </div>
        `
        : ''
    }

  `;

  document.body.append(el);

  document.querySelector(
    '#closeCart'
  ).onclick = () => {
    el.remove();
  };

  const clearButton =
    document.querySelector(
      '#clearCart'
    );

  if (clearButton) {

    clearButton.onclick =
      () => {

        clearCart();

        updateCartBadge();
      };
  }

  document
    .querySelectorAll(
      '[data-cart-minus]'
    )
    .forEach((button) => {

      button.onclick = () => {

        add(
          decodeURIComponent(
            button.dataset.cartMinus
          ),
          -1
        );

        renderCart();
      };
    });

  document
    .querySelectorAll(
      '[data-cart-plus]'
    )
    .forEach((button) => {

      button.onclick = () => {

        add(
          decodeURIComponent(
            button.dataset.cartPlus
          ),
          1
        );

        renderCart();
      };
    });

  const sendButton =
    document.querySelector(
      '#sendRequest'
    );

  if (sendButton) {
    sendButton.onclick =
      sendRequest;
  }
}

/* =========================================
   SEND REQUEST
========================================= */

function sendRequest() {

  const items =
    Object.entries(cart)
      .map(([id, q]) => ({
        p: state.products.find(
          (x) =>
            String(x.id) ===
            String(id)
        ),
        q: Number(q)
      }))
      .filter(
        (x) =>
          x.p &&
          x.q > 0
      );

  if (!items.length) {
    return;
  }

  const lines =
    items
      .map(
        ({ p, q }) =>
          `${
            p.sku ||
            p.name ||
            p.id
          } — ${q} шт.`
      )
      .join('\n');

  const text =
    `Заявка из YECHIM Catalog\n\n${lines}`;

  const username =
    (
      CONFIG.telegramManagerUsername ||
      ''
    )
      .replace(/^@/, '')
      .trim();

  if (
    !username ||
    username.includes('YOUR_')
  ) {

    navigator.clipboard?.writeText(
      text
    );

    clearCart();

    alert(
      'Список заявки скопирован. Укажите Telegram username менеджера в supabase-config.js.'
    );

    renderCart();

    return;
  }

  window.open(
    `https://t.me/${encodeURIComponent(
      username
    )}?text=${encodeURIComponent(
      text
    )}`,
    '_blank'
  );

  /* После отправки заявки корзина очищается */
  clearCart();

  renderCart();
}

/* =========================================
   EVENTS
========================================= */

document.querySelector(
  '#cartButton'
).onclick = renderCart;

/* Клики по кнопке "В корзину" на карточках */
document.addEventListener(
  'click',
  (event) => {

    const button =
      event.target.closest(
        '[data-add]'
      );

    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const id =
      decodeURIComponent(
        button.dataset.add
      );

    add(id, 1);
  }
);

/* Навигация */
window.add = add;
window.renderCart = renderCart;
window.goHome = goHome;
window.goBrand = goBrand;
window.goCategory = goCategory;

/* =========================================
   INIT
========================================= */

(async () => {

  await loadProducts();

  const params =
    new URLSearchParams(
      location.search
    );

  const product =
    params.get('product');

  const brand =
    params.get('brand');

  const category =
    params.get('category');

  if (product) {

    state.productId =
      product;

    renderDetail();

  } else if (
    brand &&
    category
  ) {

    state.selectedBrand =
      brand;

    state.selectedCategory =
      category;

    renderCategoryProducts();

  } else if (brand) {

    state.selectedBrand =
      brand;

    renderBrandCategories();

  } else {

    renderHome();
  }

  updateCartBadge();

})();
