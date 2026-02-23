import { Link } from 'react-router-dom';

export default function HookahBOSLanding() {
  return (
    <div className="landing-root">
      <div className="landing-grid-bg" aria-hidden="true" />

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
            <p>Оплата помесячно, можно начать с одного зала и масштабироваться по мере роста сети.</p>
          </div>
          <div className="landing-pricing-grid">
            <div className="landing-price-card glass-card">
              <div className="landing-price-name">Start</div>
              <div className="landing-price-value">3&nbsp;900&nbsp;₽/мес</div>
              <ul className="landing-price-list">
                <li>1 заведение, до 5 сотрудников</li>
                <li>POS‑экран и учёт смен</li>
                <li>Базовый склад и остатки</li>
                <li>Стандартные отчёты по выручке</li>
              </ul>
              <Link to="/register" className="btn btn-primary btn-sm landing-price-btn">
                Подключить Start
              </Link>
            </div>
            <div className="landing-price-card glass-card landing-price-card-featured">
              <div className="landing-price-badge">Рекомендуем</div>
              <div className="landing-price-name">Business</div>
              <div className="landing-price-value">6&nbsp;900&nbsp;₽/мес</div>
              <ul className="landing-price-list">
                <li>До 3 заведений в одной сети</li>
                <li>Техкарты, себестоимость и кухня</li>
                <li>Интеграции с ЕГАИС и маркировкой</li>
                <li>Расширенная аналитика и отчёты</li>
              </ul>
              <Link to="/register" className="btn btn-primary btn-sm landing-price-btn">
                Подключить Business
              </Link>
            </div>
            <div className="landing-price-card glass-card">
              <div className="landing-price-name">Pro</div>
              <div className="landing-price-value">от 12&nbsp;900&nbsp;₽/мес</div>
              <ul className="landing-price-list">
                <li>Сети от 4 заведений</li>
                <li>Персональные доработки под ваши процессы</li>
                <li>Приоритетная поддержка и SLA</li>
                <li>Индивидуальные условия по интеграциям</li>
              </ul>
              <a href="mailto:sales@skandata.ru" className="btn btn-ghost btn-sm landing-price-btn">
                Обсудить условия
              </a>
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
  );
}

