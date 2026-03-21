import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function HookahBOSLanding() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="l-root">
      <header className="l-header">
        <div className="l-container l-header-inner">
          <Link to="/" className="l-logo">
            <div className="l-logo-mark">S</div>
            <span className="l-logo-name">Sellio</span>
          </Link>
          <nav className="l-nav">
            <a href="#features">Возможности</a>
            <a href="#pricing">Тарифы</a>
            <Link to="/partners">Партнёрам</Link>
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
          <div className="l-container l-hero-inner">
            <div className="l-hero-left">
              <div className="l-badge">Универсальная POS-система</div>
              <h1 className="l-hero-title">
                Sellio — облачная касса<br />
                <span>для любого формата</span>
              </h1>
              <p className="l-hero-text">
                Кальянные, кафе, рестораны, фастфуд — одна платформа для всех. Учёт
                заказов, смен, склада и финансов. Работает в браузере и на Android с оффлайн-режимом.
              </p>
              <div className="l-hero-cta">
                <Link to="/register" className="l-btn l-btn-primary l-btn-lg">Начать бесплатно</Link>
                <Link to="/login" className="l-btn l-btn-outline l-btn-lg">Смотреть демо</Link>
              </div>
            </div>
            <div className="l-hero-right">
              <div className="l-card l-hero-card">
                <div className="l-hero-card-header">
                  <span className="l-label">Статистика за день</span>
                  <span className="l-green-badge">Онлайн</span>
                </div>
                <div className="l-hero-stats">
                  <div>
                    <div className="l-stat-label">Выручка</div>
                    <div className="l-stat-value">87&nbsp;400&nbsp;₽</div>
                  </div>
                  <div>
                    <div className="l-stat-label">Средний чек</div>
                    <div className="l-stat-value">1&nbsp;850&nbsp;₽</div>
                  </div>
                </div>
                <div className="l-hero-rows">
                  <div className="l-hero-row"><span>Столы</span><span>8 / 12</span></div>
                  <div className="l-hero-row"><span>Заказы</span><span>47</span></div>
                  <div className="l-hero-row"><span>Наличные / Карта</span><span>44% / 56%</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="l-section">
          <div className="l-container">
            <div className="l-section-header">
              <h2>Функции, которые работают на вас</h2>
              <p>Всё для управления заведением — без лишних модулей, но с глубокой проработкой.</p>
            </div>
            <div className="l-features-grid">
              {[
                { icon: '🖥️', title: 'POS-экран', text: 'Удобный интерфейс кассира с карточками товаров, модификаторами и быстрым поиском.' },
                { icon: '📊', title: 'Аналитика', text: 'Отчёты по выручке, среднему чеку, популярности товаров и эффективности сотрудников.' },
                { icon: '📦', title: 'Складской учёт', text: 'Приёмка, инвентаризация, себестоимость. Контроль остатков и автоматическое списание.' },
                { icon: '📱', title: 'Android-приложение', text: 'Работает без интернета. Данные синхронизируются автоматически при подключении к сети.' },
                { icon: '🔗', title: 'Интеграции', text: 'ЕГАИС, Честный знак, ЭДО, онлайн-кассы АТОЛ. Подключение в пару кликов.' },
                { icon: '🏢', title: 'Управление сетью', text: 'Несколько заведений в одном кабинете. Сводная аналитика и перемещения между точками.' },
              ].map((f) => (
                <div key={f.title} className="l-card l-feature-card">
                  <div className="l-feature-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Android */}
        <section className="l-android-section">
          <div className="l-container">
            <div className="l-card l-android-card">
              <div className="l-android-left">
                <div className="l-badge">Android-приложение</div>
                <h2>Работайте даже<br />без интернета</h2>
                <p>
                  Установите приложение Sellio на любой Android-планшет или смартфон.
                  Принимайте заказы, открывайте смены и печатайте чеки — даже без подключения к сети.
                </p>
                <ul className="l-check-list">
                  <li>Оффлайн-режим — заказы создаются локально</li>
                  <li>Автоматическая синхронизация с облаком</li>
                  <li>Печать чеков через Bluetooth и USB</li>
                </ul>
              </div>
              <div className="l-android-right">
                <div className="l-phone-mock">
                  <div className="l-phone-bar">
                    <span>14:52</span>
                    <span className="l-phone-badge">Оффлайн</span>
                  </div>
                  <div className="l-phone-title">Быстрый заказ</div>
                  <div className="l-phone-rows">
                    <div className="l-phone-row"><span>Капучино x2</span><span>400 ₽</span></div>
                    <div className="l-phone-row"><span>Круассан</span><span>310 ₽</span></div>
                    <div className="l-phone-row l-phone-total"><span>Итого</span><span>710 ₽</span></div>
                  </div>
                  <div className="l-btn l-btn-primary" style={{ textAlign: 'center', fontSize: 13 }}>Оплатить</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="l-section">
          <div className="l-container">
            <div className="l-section-header">
              <h2>Простые тарифы без скрытых платежей</h2>
              <p>Начните бесплатно. При оплате за год — скидка до 20%.</p>
            </div>
            <div className="l-billing-toggle">
              <button
                className={`l-billing-btn${!yearly ? ' l-billing-btn-active' : ''}`}
                onClick={() => setYearly(false)}
              >Помесячно</button>
              <button
                className={`l-billing-btn${yearly ? ' l-billing-btn-active' : ''}`}
                onClick={() => setYearly(true)}
              >За год <span className="l-billing-save">-20%</span></button>
            </div>
            <div className="l-pricing-grid">
              <div className="l-card l-price-card">
                <div className="l-price-name">Бесплатный</div>
                <div className="l-price-value">0&nbsp;₽</div>
                <ul className="l-price-list">
                  <li>До 2 сотрудников</li>
                  <li>1 зал, до 50 товаров</li>
                  <li>150 заказов в месяц</li>
                  <li>Касса и учёт смен</li>
                  <li>Без интеграций</li>
                </ul>
                <Link to="/register" className="l-btn l-btn-outline l-btn-full">Начать бесплатно</Link>
              </div>
              <div className="l-card l-price-card">
                <div className="l-price-name">Старт</div>
                <div className="l-price-value">
                  {yearly ? <>1&nbsp;783&nbsp;₽/мес</> : <>1&nbsp;990&nbsp;₽/мес</>}
                </div>
                {yearly && <div className="l-price-yearly">21&nbsp;400&nbsp;₽ за год</div>}
                <ul className="l-price-list">
                  <li>Безлимит сотрудников</li>
                  <li>2 зала, все товары</li>
                  <li>Безлимит заказов</li>
                  <li>Складской учёт и отчёты</li>
                  <li>2 интеграции из 4</li>
                </ul>
                <Link to="/register" className="l-btn l-btn-primary l-btn-full">Подключить Старт</Link>
              </div>
              <div className="l-card l-price-card l-price-card-featured">
                <div className="l-price-badge">Рекомендуем</div>
                <div className="l-price-name">Бизнес</div>
                <div className="l-price-value">
                  {yearly ? <>3&nbsp;167&nbsp;₽/мес</> : <>3&nbsp;990&nbsp;₽/мес</>}
                </div>
                {yearly && <div className="l-price-yearly">38&nbsp;000&nbsp;₽ за год</div>}
                <ul className="l-price-list">
                  <li>Всё из Старта</li>
                  <li>Безлимит залов и интеграций</li>
                  <li>Себестоимость и финансы</li>
                  <li>ККТ, ЭДО, API</li>
                </ul>
                <Link to="/register" className="l-btn l-btn-primary l-btn-full">Подключить Бизнес</Link>
              </div>
              <div className="l-card l-price-card">
                <div className="l-price-name">Сети</div>
                <div className="l-price-value">
                  {yearly ? <>4&nbsp;792&nbsp;₽/мес</> : <>5&nbsp;990&nbsp;₽/мес</>}
                </div>
                {yearly && <div className="l-price-yearly">57&nbsp;500&nbsp;₽ за год</div>}
                <ul className="l-price-list">
                  <li>Всё из тарифа Бизнес</li>
                  <li>Управление сетью заведений</li>
                  <li>Сводная аналитика по сети</li>
                  <li>Перемещения между точками</li>
                </ul>
                <a href="mailto:info@sellio.ru" className="l-btn l-btn-outline l-btn-full">Связаться с нами</a>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="l-section">
          <div className="l-container">
            <div className="l-section-header">
              <h2>Запуск за 5 минут</h2>
              <p>От регистрации до первого заказа — без сложных настроек и обучения.</p>
            </div>
            <div className="l-steps-grid">
              <div className="l-card l-step">
                <div className="l-step-num">1</div>
                <h3>Регистрация</h3>
                <p>Укажите название и тип заведения. Аккаунт создаётся мгновенно.</p>
              </div>
              <div className="l-card l-step">
                <div className="l-step-num">2</div>
                <h3>Настройка</h3>
                <p>Добавьте меню, залы и сотрудников. Импорт из Excel за минуту.</p>
              </div>
              <div className="l-card l-step">
                <div className="l-step-num">3</div>
                <h3>Старт работы</h3>
                <p>Откройте смену и принимайте заказы. С любого устройства.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="l-section l-cta-section">
          <div className="l-container">
            <div className="l-cta-inner">
              <h2>Готовы автоматизировать ваше заведение?</h2>
              <p>Попробуйте бесплатно — без привязки карты и ограничений по времени.</p>
              <div className="l-cta-actions">
                <Link to="/register" className="l-btn l-btn-white l-btn-lg">Попробовать бесплатно</Link>
                <a href="mailto:info@sellio.ru" className="l-btn l-btn-outline-white l-btn-lg">Запросить демо</a>
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
            <a href="#features">Возможности</a>
            <a href="#pricing">Тарифы</a>
            <a href="#how-it-works">Как это работает</a>
            <a href="#features">Интеграции</a>
          </div>
          <div className="l-footer-col">
            <div className="l-footer-col-title">Партнёрам</div>
            <Link to="/partners">Программа</Link>
            <Link to="/partner/login">Личный кабинет</Link>
            <Link to="/partner/register">Стать партнёром</Link>
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
