import { Link } from 'react-router-dom';

export default function PartnerProgram() {
  return (
    <div className="l-root">
      <header className="l-header">
        <div className="l-container l-header-inner">
          <Link to="/" className="l-logo">
            <div className="l-logo-mark">S</div>
            <span className="l-logo-name">Sellio</span>
          </Link>
          <nav className="l-nav">
            <a href="/#features">Возможности</a>
            <a href="/#pricing">Тарифы</a>
            <Link to="/partners" className="l-nav-active">Партнёрам</Link>
          </nav>
          <div className="l-header-actions">
            <Link to="/login" className="l-btn l-btn-outline">Войти</Link>
            <Link to="/register" className="l-btn l-btn-primary">Попробовать бесплатно</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="l-hero">
          <div className="l-container">
            <div className="l-partner-hero-inner">
              <div className="l-badge">Партнёрская программа</div>
              <h1 className="l-partner-hero-title">
                Зарабатывайте 30%<br />
                <span>с каждого клиента</span>
              </h1>
              <p className="l-partner-hero-text">
                Привлекайте новые заведения в Sellio и получайте 30% с каждого их платежа —
                ежемесячно, пока они пользуются сервисом.
              </p>
              <div className="l-hero-cta">
                <Link to="/partner/register" className="l-btn l-btn-primary l-btn-lg">Стать партнёром</Link>
                <a href="#conditions" className="l-btn l-btn-outline l-btn-lg">Узнать подробнее</a>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="l-section">
          <div className="l-container">
            <div className="l-section-header">
              <h2>Как это работает</h2>
              <p>Всего три шага — и вы уже зарабатываете</p>
            </div>
            <div className="l-steps-grid">
              <div className="l-card l-step">
                <div className="l-step-num">1</div>
                <h3>Регистрация</h3>
                <p>Создайте партнёрский аккаунт и получите уникальную реферальную ссылку с вашим кодом.</p>
              </div>
              <div className="l-card l-step">
                <div className="l-step-num">2</div>
                <h3>Привлечение</h3>
                <p>Делитесь ссылкой с владельцами кафе, ресторанов, кальянных. Они регистрируются через вас.</p>
              </div>
              <div className="l-card l-step">
                <div className="l-step-num">3</div>
                <h3>Заработок</h3>
                <p>Получайте 30% от стоимости каждого платежа клиента — автоматически, каждый месяц.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Earnings */}
        <section className="l-section l-section-white">
          <div className="l-container">
            <div className="l-earnings-grid">
              <div className="l-earnings-left">
                <div className="l-badge">Доходность</div>
                <h2 className="l-earnings-title">Сколько можно зарабатывать?</h2>
                <p className="l-earnings-text">
                  Ваш доход растёт вместе с числом привлечённых клиентов. Нет потолка — нет ограничений.
                </p>
                <div className="l-earnings-highlight">
                  <div className="l-earnings-highlight-label">Например, 10 клиентов на тарифе Бизнес</div>
                  <div className="l-earnings-highlight-value">11&nbsp;970&nbsp;₽/мес</div>
                  <div className="l-earnings-highlight-sub">10 × 3 990 ₽ × 30%</div>
                </div>
              </div>
              <div className="l-card l-earnings-table-card">
                <table className="l-earnings-table">
                  <thead>
                    <tr>
                      <th>Клиенты</th>
                      <th>Тариф</th>
                      <th>Доход/мес</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="l-td-bold">5</td>
                      <td>Старт</td>
                      <td className="l-td-green">2&nbsp;985&nbsp;₽</td>
                    </tr>
                    <tr>
                      <td className="l-td-bold">10</td>
                      <td>Бизнес</td>
                      <td className="l-td-green">11&nbsp;970&nbsp;₽</td>
                    </tr>
                    <tr>
                      <td className="l-td-bold">20</td>
                      <td>Бизнес</td>
                      <td className="l-td-green">23&nbsp;940&nbsp;₽</td>
                    </tr>
                    <tr>
                      <td className="l-td-bold">50</td>
                      <td>Бизнес</td>
                      <td className="l-td-green">59&nbsp;850&nbsp;₽</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Conditions */}
        <section id="conditions" className="l-section">
          <div className="l-container">
            <div className="l-section-header">
              <h2>Условия программы</h2>
            </div>
            <div className="l-conditions-grid">
              <div className="l-card l-condition-card">
                <h3>Для партнёра</h3>
                <ul className="l-condition-list">
                  <li>Регистрация бесплатная, без взносов</li>
                  <li>Комиссия 30% с каждого платежа клиента</li>
                  <li>Начисления за весь период подписки клиента</li>
                  <li>Вывод от 1 000 ₽ на расчётный счёт</li>
                  <li>Личный кабинет с детальной аналитикой</li>
                  <li>Поддержка партнёров по email</li>
                </ul>
              </div>
              <div className="l-card l-condition-card">
                <h3>Для клиента</h3>
                <ul className="l-condition-list">
                  <li>Скидка 10% на первый платёж при регистрации по ссылке</li>
                  <li>Все функции тарифа без ограничений</li>
                  <li>Полноценная поддержка от команды Sellio</li>
                  <li>Бесплатный тариф навсегда</li>
                  <li>Переход на платный тариф в любой момент</li>
                  <li>Отмена подписки без штрафов</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="l-section l-section-white">
          <div className="l-container">
            <div className="l-section-header">
              <h2>Частые вопросы</h2>
            </div>
            <div className="l-faq-list">
              {[
                {
                  q: 'Когда начисляется комиссия?',
                  a: 'Комиссия начисляется автоматически при каждом успешном платеже вашего реферала. Вы видите начисления в режиме реального времени в личном кабинете.',
                },
                {
                  q: 'Как долго действует реферальная привязка?',
                  a: 'Привязка действует бессрочно. Пока клиент платит за Sellio — вы получаете комиссию. Даже если он сменит тариф.',
                },
                {
                  q: 'Как вывести деньги?',
                  a: 'Минимальная сумма вывода — 1 000 ₽. Выплаты производятся на расчётный счёт в течение 3 рабочих дней.',
                },
                {
                  q: 'Есть ли ограничение по количеству рефералов?',
                  a: 'Нет. Вы можете привлекать неограниченное количество заведений. Чем больше клиентов — тем выше ваш доход.',
                },
              ].map((faq, i) => (
                <div key={i} className="l-card l-faq-card">
                  <h3>{faq.q}</h3>
                  <p>{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="l-section l-cta-section">
          <div className="l-container">
            <div className="l-cta-inner">
              <h2>Начните зарабатывать уже сегодня</h2>
              <p>Регистрация занимает 2 минуты. Ваша первая комиссия может поступить уже в этом месяце.</p>
              <div className="l-cta-actions">
                <Link to="/partner/register" className="l-btn l-btn-white l-btn-lg">Стать партнёром</Link>
                <Link to="/partner/login" className="l-btn l-btn-outline-white l-btn-lg">Войти в кабинет</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="l-footer">
        <div className="l-container l-footer-inner">
          <div className="l-footer-brand">
            <div className="l-footer-logo">
              <div className="l-logo-mark-sm">S</div>
              <span>Sellio</span>
            </div>
            <p>Облачная POS-система для кафе,<br />ресторанов, кальянных и фастфуда</p>
          </div>
          <div className="l-footer-col">
            <div className="l-footer-col-title">Продукт</div>
            <Link to="/">Главная</Link>
            <a href="/#features">Возможности</a>
            <a href="/#pricing">Тарифы</a>
          </div>
          <div className="l-footer-col">
            <div className="l-footer-col-title">Партнёрам</div>
            <a href="#conditions">Условия</a>
            <Link to="/partner/login">Личный кабинет</Link>
            <a href="#faq">FAQ</a>
            <a href="mailto:partners@sellio.ru">partners@sellio.ru</a>
          </div>
          <div className="l-footer-col">
            <div className="l-footer-col-title">Контакты</div>
            <a href="mailto:info@sellio.ru">info@sellio.ru</a>
            <span>+7 (800) 000-00-00</span>
            <span>Telegram: @sellio_support</span>
          </div>
          <div className="l-footer-copy">
            © {new Date().getFullYear()} Sellio. Все права защищены.
            <span className="l-sep">·</span>
            <a href="#">Политика конфиденциальности</a>
            <span className="l-sep">·</span>
            <a href="#">Условия использования</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
