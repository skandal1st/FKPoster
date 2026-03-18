import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function HookahBOSLanding() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="landing-root">
      <div className="landing-grid-bg" aria-hidden="true" />

      <div className="landing-shell">
        <aside className="landing-sidenav">
          <div className="landing-sidenav-logo">
            <span className="landing-sidenav-mark">HB</span>
            <span className="landing-sidenav-title">HookahBOS</span>
          </div>
          <div className="landing-sidenav-divider" />
          <nav className="landing-sidenav-nav">
            <a href="#hero">
              <span className="landing-sidenav-index">01</span>
              <span className="landing-sidenav-label">Обзор</span>
            </a>
            <a href="#features">
              <span className="landing-sidenav-index">02</span>
              <span className="landing-sidenav-label">Возможности</span>
            </a>
            <a href="#pricing">
              <span className="landing-sidenav-index">03</span>
              <span className="landing-sidenav-label">Тарифы</span>
            </a>
            <a href="#how-it-works">
              <span className="landing-sidenav-index">04</span>
              <span className="landing-sidenav-label">Внедрение</span>
            </a>
          </nav>
        </aside>

        <div className="landing-content">
          <header className="landing-header">
            <div className="landing-logo">
              <span className="landing-logo-mark">HB</span>
              <div>
                <div className="landing-logo-title">HookahBOS</div>
                <div className="landing-logo-subtitle">POS‑система для кальянных и баров</div>
              </div>
            </div>
            <nav className="landing-nav">
              <a href="#features">Возможности</a>
              <a href="#pricing">Тарифы</a>
              <a href="#how-it-works">Как работает</a>
            </nav>
            <div className="landing-actions">
              <Link to="/login" className="btn btn-ghost btn-sm">Войти</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Регистрация заведения</Link>
            </div>
          </header>

          <main className="landing-main">
        <section id="hero" className="landing-hero glass-card">
          <div className="landing-hero-left">
            <div className="landing-pill">SaaS‑платформа под брендом Skandata</div>
            <h1 className="landing-hero-title">
              HookahBOS — умная касса
              <span>для кальянных, баров и лаунжей</span>
            </h1>
            <p className="landing-hero-text">
              Учитывайте заказы, смены, остатки и алкоголь в одном современном интерфейсе.
              Мультиарендная архитектура, быстрый запуск для сети заведений, поддержка ЕГАИС и маркировки.
            </p>
            <div className="landing-hero-cta">
              <Link to="/register" className="btn btn-primary">
                Начать 14‑дневный тест
              </Link>
              <Link to="/login" className="btn btn-ghost">
                Уже пользуетесь? Войти
              </Link>
            </div>
            <div className="landing-hero-meta">
              <div>
                <div className="landing-meta-number">5 минут</div>
                <div className="landing-meta-label">на запуск первого заведения</div>
              </div>
              <div>
                <div className="landing-meta-number">24/7</div>
                <div className="landing-meta-label">доступ из любой точки мира</div>
              </div>
              <div>
                <div className="landing-meta-number">Безопасно</div>
                <div className="landing-meta-label">данные хранятся в облаке</div>
              </div>
            </div>
          </div>
          <div className="landing-hero-right">
            <div className="landing-hero-card glass-card">
              <div className="landing-hero-card-header">
                <span className="landing-hero-label">Живой экран смены</span>
                <span className="badge badge-success">Онлайн</span>
              </div>
              <div className="landing-hero-stats">
                <div>
                  <div className="landing-hero-stat-label">Выручка за сегодня</div>
                  <div className="landing-hero-stat-value">124&nbsp;800&nbsp;₽</div>
                  <div className="landing-hero-stat-trend">+18% к вчерашнему дню</div>
                </div>
                <div>
                  <div className="landing-hero-stat-label">Средний чек</div>
                  <div className="landing-hero-stat-value">1&nbsp;950&nbsp;₽</div>
                  <div className="landing-hero-stat-trend">гости остаются дольше</div>
                </div>
              </div>
              <div className="landing-hero-footer">
                <span>Столы</span>
                <div className="landing-hero-tables">
                  <span className="landing-table-dot landing-table-dot-busy" />
                  <span className="landing-table-dot landing-table-dot-busy" />
                  <span className="landing-table-dot" />
                  <span className="landing-table-dot" />
                  <span className="landing-table-dot" />
                  <span className="landing-table-dot" />
                  <span className="landing-table-caption">7 из 12 занято</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="landing-section">
          <div className="landing-section-header">
            <h2>Сделано под кальянные и бары</h2>
            <p>Только то, что нужно заведению: без лишних модулей, но с глубокой проработкой смен, стола и склада.</p>
          </div>
          <div className="landing-features-grid">
            <div className="landing-feature glass-card">
              <h3>POS‑экран для кассира</h3>
              <p>Быстрый приём заказов по столам, сплит‑чек, скидки и акции. Интерфейс оптимизирован под тёмное помещение и работу с тач‑монитором.</p>
            </div>
            <div className="landing-feature glass-card">
              <h3>Учёт смен и выручки</h3>
              <p>Открытие и закрытие смены, контроль внесений и инкассаций, отчёт по кассиру и заведению за любой период.</p>
            </div>
            <div className="landing-feature glass-card">
              <h3>Склад и кухня</h3>
              <p>Ингредиенты, техкарты, себестоимость и остатки. Контроль маржинальности меню и автоматическое списание при продаже.</p>
            </div>
            <div className="landing-feature glass-card">
              <h3>Алкоголь, ЕГАИС и маркировка</h3>
              <p>Интеграции для работы с алкоголем и маркированной продукцией. Минимум ручной работы и ошибок.</p>
            </div>
            <div className="landing-feature glass-card">
              <h3>Мульти‑заведение и сеть</h3>
              <p>HookahBOS — мультиарендная платформа. Управляйте сетью заведений из одного аккаунта, каждое со своим поддоменом.</p>
            </div>
            <div className="landing-feature glass-card">
              <h3>Аналитика в реальном времени</h3>
              <p>Дашборды по выручке, среднему чеку, популярным позициям и эффективности персонала. Все данные — в одном месте.</p>
            </div>
          </div>
        </section>

        <section id="pricing" className="landing-section">
          <div className="landing-section-header">
            <h2>Простые тарифы без скрытых платежей</h2>
            <p>Начните бесплатно и масштабируйтесь по мере роста. При оплате за год — скидка до 20%.</p>
          </div>
          <div className="landing-billing-toggle">
            <button
              className={`landing-billing-btn${!yearly ? ' landing-billing-btn-active' : ''}`}
              onClick={() => setYearly(false)}
            >
              Помесячно
            </button>
            <button
              className={`landing-billing-btn${yearly ? ' landing-billing-btn-active' : ''}`}
              onClick={() => setYearly(true)}
            >
              За год <span className="landing-billing-save">-20%</span>
            </button>
          </div>
          <div className="landing-pricing-grid">
            <div className="landing-price-card glass-card">
              <div className="landing-price-name">Бесплатный</div>
              <div className="landing-price-value">0&nbsp;₽</div>
              <ul className="landing-price-list">
                <li>До 2 сотрудников</li>
                <li>1 зал, до 50 товаров</li>
                <li>До 150 заказов в месяц</li>
                <li>Касса и учёт смен</li>
                <li>Без интеграций</li>
              </ul>
              <Link to="/register" className="btn btn-ghost btn-sm landing-price-btn">
                Начать бесплатно
              </Link>
            </div>
            <div className="landing-price-card glass-card">
              <div className="landing-price-name">Старт</div>
              <div className="landing-price-value">
                {yearly ? <>1&nbsp;783&nbsp;₽/мес</> : <>1&nbsp;990&nbsp;₽/мес</>}
              </div>
              {yearly && <div className="landing-price-yearly">21&nbsp;400&nbsp;₽ за год</div>}
              <ul className="landing-price-list">
                <li>Безлимит: сотрудники, товары, заказы</li>
                <li>До 2 залов</li>
                <li>Аналитика и отчёты</li>
                <li>Складской учёт</li>
                <li>2 интеграции из 4</li>
              </ul>
              <Link to="/register" className="btn btn-primary btn-sm landing-price-btn">
                Подключить Старт
              </Link>
            </div>
            <div className="landing-price-card glass-card landing-price-card-featured">
              <div className="landing-price-badge">Рекомендуем</div>
              <div className="landing-price-name">Бизнес</div>
              <div className="landing-price-value">
                {yearly ? <>3&nbsp;167&nbsp;₽/мес</> : <>3&nbsp;990&nbsp;₽/мес</>}
              </div>
              {yearly && <div className="landing-price-yearly">38&nbsp;000&nbsp;₽ за год</div>}
              <ul className="landing-price-list">
                <li>Всё из «Старта» без ограничений</li>
                <li>Безлимит залов и интеграций</li>
                <li>Себестоимость и финансы</li>
                <li>ККТ, ЭДО, API</li>
                <li>Программа лояльности</li>
              </ul>
              <Link to="/register" className="btn btn-primary btn-sm landing-price-btn">
                Подключить Бизнес
              </Link>
            </div>
            <div className="landing-price-card glass-card">
              <div className="landing-price-name">Сети</div>
              <div className="landing-price-value">
                {yearly ? <>4&nbsp;792&nbsp;₽/мес</> : <>5&nbsp;990&nbsp;₽/мес</>}
              </div>
              {yearly && <div className="landing-price-yearly">57&nbsp;500&nbsp;₽ за год</div>}
              <ul className="landing-price-list">
                <li>Всё из «Бизнеса»</li>
                <li>Управление сетью заведений</li>
                <li>Сводная аналитика по сети</li>
                <li>Перемещения между точками</li>
                <li>Единый кабинет владельца</li>
              </ul>
              <Link to="/register" className="btn btn-primary btn-sm landing-price-btn">
                Подключить Сети
              </Link>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="landing-section">
          <div className="landing-section-header">
            <h2>Как HookahBOS внедряется в заведение</h2>
            <p>Делаем запуск максимально мягким для команды — без остановки работы и болезненной миграции.</p>
          </div>
          <div className="landing-steps-grid">
            <div className="landing-step glass-card">
              <div className="landing-step-number">1</div>
              <h3>Создаём аккаунт заведения</h3>
              <p>Регистрируете заведение на skandata.ru, настраиваете базовые параметры и получаете доступ в личный кабинет владельца.</p>
            </div>
            <div className="landing-step glass-card">
              <div className="landing-step-number">2</div>
              <h3>Импортируем меню и остатки</h3>
              <p>Помогаем перенести позиции меню, ингредиенты и остатки со старой системы или из Excel.</p>
            </div>
            <div className="landing-step glass-card">
              <div className="landing-step-number">3</div>
              <h3>Обучаем команду</h3>
              <p>Краткое обучение для кассиров, управляющих и бухгалтерии. Поддержка на старте смены.</p>
            </div>
            <div className="landing-step glass-card">
              <div className="landing-step-number">4</div>
              <h3>Запускаем и сопровождаем</h3>
              <p>Отслеживаем первые дни работы, помогаем настроить отчёты, интеграции и подключаем дополнительные заведения.</p>
            </div>
          </div>
        </section>

        <section className="landing-section landing-cta-section">
          <div className="landing-cta glass-card">
            <div>
              <h2>Готовы перевести кальянную на современную POS‑систему?</h2>
              <p>Расскажите о своём формате — подберём конфигурацию HookahBOS и покажем живой демо‑стенд.</p>
            </div>
            <div className="landing-cta-actions">
              <Link to="/register" className="btn btn-primary">
                Запросить демо и доступ
              </Link>
              <a href="mailto:sales@skandata.ru" className="btn btn-ghost">
                Написать в Skandata
              </a>
            </div>
          </div>
        </section>
          </main>

          <footer className="landing-footer">
            <span>© {new Date().getFullYear()} HookahBOS / Skandata</span>
            <span className="landing-footer-separator">·</span>
            <span>Облачная POS‑платформа для кальянных и баров</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

