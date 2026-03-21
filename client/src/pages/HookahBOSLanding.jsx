import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function HookahBOSLanding() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="landing-root">
      <div className="landing-grid-bg" aria-hidden="true" />

      <div className="landing-shell landing-shell-full">
        <div className="landing-content">
          <header className="landing-header">
            <div className="landing-logo">
              <div className="landing-logo-mark">S</div>
              <div>
                <div className="landing-logo-title">Sellio</div>
              </div>
            </div>
            <nav className="landing-nav">
              <a href="#features">Возможности</a>
              <a href="#pricing">Тарифы</a>
              <a href="/partner">Партнёрам</a>
            </nav>
            <div className="landing-actions">
              <Link to="/login" className="btn btn-ghost btn-sm">Войти</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Попробовать бесплатно</Link>
            </div>
          </header>

          <main className="landing-main">
            <section id="hero" className="landing-hero glass-card">
              <div className="landing-hero-left">
                <div className="landing-pill">Универсальная POS-система для бизнеса</div>
                <h1 className="landing-hero-title">
                  Sellio — облачная касса
                  <span>для любого формата</span>
                </h1>
                <p className="landing-hero-text">
                  Кальянные, кафе, рестораны, фастфуд — одна платформа для всех. Учёт
                  заказов, смен, склада и финансов. Работает в браузере и на Android с оффлайн-режимом.
                </p>
                <div className="landing-hero-cta">
                  <Link to="/register" className="btn btn-primary">
                    Начать бесплатно
                  </Link>
                  <Link to="/login" className="btn btn-ghost">
                    Смотреть демо
                  </Link>
                </div>
              </div>
              <div className="landing-hero-right">
                <div className="landing-hero-card glass-card">
                  <div className="landing-hero-card-header">
                    <span className="landing-hero-label">Статистика за день</span>
                    <span className="badge badge-success">Онлайн</span>
                  </div>
                  <div className="landing-hero-stats">
                    <div>
                      <div className="landing-hero-stat-label">Выручка</div>
                      <div className="landing-hero-stat-value">87&nbsp;400&nbsp;₽</div>
                    </div>
                    <div>
                      <div className="landing-hero-stat-label">Средний чек</div>
                      <div className="landing-hero-stat-value">1&nbsp;850&nbsp;₽</div>
                    </div>
                  </div>
                  <div className="landing-hero-rows">
                    <div className="landing-hero-row">
                      <span>Столы</span>
                      <span>8 / 12</span>
                    </div>
                    <div className="landing-hero-row">
                      <span>Заказы</span>
                      <span>47</span>
                    </div>
                    <div className="landing-hero-row">
                      <span>Наличные / Карта</span>
                      <span>44% / 56%</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="features" className="landing-section">
              <div className="landing-section-header">
                <h2>Функции, которые работают на вас</h2>
                <p>Всё для управления заведением — без лишних модулей, но с глубокой проработкой.</p>
              </div>
              <div className="landing-features-grid">
                <div className="landing-feature glass-card">
                  <h3>POS-экран</h3>
                  <p>Удобный интерфейс кассира с карточками товаров, модификаторами и быстрым поиском.</p>
                </div>
                <div className="landing-feature glass-card">
                  <h3>Аналитика</h3>
                  <p>Отчёты по выручке, среднему чеку, популярности товаров и эффективности сотрудников.</p>
                </div>
                <div className="landing-feature glass-card">
                  <h3>Складской учёт</h3>
                  <p>Приёмка, инвентаризация, себестоимость. Контроль остатков и автоматическое списание.</p>
                </div>
                <div className="landing-feature glass-card">
                  <h3>Android-приложение</h3>
                  <p>Работает без интернета. Данные синхронизируются автоматически при подключении к сети.</p>
                </div>
                <div className="landing-feature glass-card">
                  <h3>Интеграции</h3>
                  <p>ЕГАИС, Честный знак, ЭДО, онлайн-кассы АТОЛ. Подключение в пару кликов.</p>
                </div>
                <div className="landing-feature glass-card">
                  <h3>Управление сетью</h3>
                  <p>Несколько заведений в одном кабинете. Сводная аналитика и перемещения между точками.</p>
                </div>
              </div>
            </section>

            <section className="landing-section landing-android-section">
              <div className="landing-android glass-card">
                <div className="landing-android-left">
                  <div className="landing-pill">Android-приложение</div>
                  <h2>Работайте даже<br />без интернета</h2>
                  <p>
                    Установите приложение Sellio на любой Android-планшет или смартфон.
                    Принимайте заказы, открывайте смены и печатайте чеки — даже без подключения к сети.
                  </p>
                  <ul className="landing-android-features">
                    <li>Оффлайн-режим — заказы создаются локально</li>
                    <li>Автоматическая синхронизация с облаком</li>
                    <li>Печать чеков через Bluetooth и USB</li>
                  </ul>
                </div>
                <div className="landing-android-right">
                  <div className="landing-phone-mock glass-card">
                    <div className="landing-phone-bar">
                      <span>14:52</span>
                      <span className="landing-phone-badge">Оффлайн-режим</span>
                    </div>
                    <div className="landing-phone-title">Быстрый заказ</div>
                    <div className="landing-phone-rows">
                      <div className="landing-phone-row">
                        <span>Капучино x2</span>
                        <span>400 ₽</span>
                      </div>
                      <div className="landing-phone-row">
                        <span>Круассан</span>
                        <span>310 ₽</span>
                      </div>
                      <div className="landing-phone-row landing-phone-total">
                        <span>Итого</span>
                        <span>710 ₽</span>
                      </div>
                    </div>
                    <div className="btn btn-primary landing-phone-pay-btn">Оплатить</div>
                  </div>
                </div>
              </div>
            </section>

            <section id="pricing" className="landing-section">
              <div className="landing-section-header">
                <h2>Простые тарифы без скрытых платежей</h2>
                <p>Начните бесплатно. При оплате за год — скидка до 20%.</p>
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
                    <li>150 заказов в месяц</li>
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
                    <li>Безлимит сотрудников</li>
                    <li>2 зала, все товары</li>
                    <li>Безлимит заказов</li>
                    <li>Складской учёт и отчёты</li>
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
                    <li>Всё из Старта</li>
                    <li>Безлимит залов и интеграций</li>
                    <li>Себестоимость и финансы</li>
                    <li>ККТ, ЭДО, API</li>
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
                    <li>Всё из тарифа Бизнес</li>
                    <li>Управление сетью заведений</li>
                    <li>Сводная аналитика по сети</li>
                    <li>Перемещения между точками</li>
                  </ul>
                  <a href="mailto:info@sellio.ru" className="btn btn-ghost btn-sm landing-price-btn">
                    Связаться с нами
                  </a>
                </div>
              </div>
            </section>

            <section id="how-it-works" className="landing-section">
              <div className="landing-section-header">
                <h2>Запуск за 5 минут</h2>
                <p>От регистрации до первого заказа — без сложных настроек и обучения.</p>
              </div>
              <div className="landing-steps-grid landing-steps-grid-3">
                <div className="landing-step glass-card">
                  <div className="landing-step-number">1</div>
                  <h3>Регистрация</h3>
                  <p>Укажите название и тип заведения. Аккаунт создаётся мгновенно.</p>
                </div>
                <div className="landing-step glass-card">
                  <div className="landing-step-number">2</div>
                  <h3>Настройка</h3>
                  <p>Добавьте меню, залы и сотрудников. Импорт из Excel за минуту.</p>
                </div>
                <div className="landing-step glass-card">
                  <div className="landing-step-number">3</div>
                  <h3>Старт работы</h3>
                  <p>Откройте смену и принимайте заказы. С любого устройства.</p>
                </div>
              </div>
            </section>

            <section className="landing-section landing-cta-section">
              <div className="landing-cta glass-card">
                <div>
                  <h2>Готовы автоматизировать<br />ваше заведение?</h2>
                  <p>Попробуйте бесплатно — без привязки карты и ограничений по времени.</p>
                </div>
                <div className="landing-cta-actions">
                  <Link to="/register" className="btn btn-primary">
                    Попробовать бесплатно
                  </Link>
                  <a href="mailto:info@sellio.ru" className="btn btn-ghost">
                    Запросить демо
                  </a>
                </div>
              </div>
            </section>
          </main>

          <footer className="landing-footer landing-footer-full">
            <div className="landing-footer-brand">
              <div className="landing-footer-logo">
                <div className="landing-logo-mark landing-logo-mark-sm">S</div>
                <span className="landing-footer-logo-name">Sellio</span>
              </div>
              <p className="landing-footer-desc">Облачная POS-система для кафе,<br />ресторанов, кальянных и фастфуда</p>
            </div>
            <div className="landing-footer-col">
              <div className="landing-footer-col-title">Продукт</div>
              <a href="#features">Возможности</a>
              <a href="#pricing">Тарифы</a>
              <a href="#how-it-works">Android-приложение</a>
              <a href="#features">Интеграции</a>
            </div>
            <div className="landing-footer-col">
              <div className="landing-footer-col-title">Контакты</div>
              <a href="mailto:info@sellio.ru">info@sellio.ru</a>
              <span>+7 (800) 000-00-00</span>
              <span>Telegram: @sellio_support</span>
            </div>
            <div className="landing-footer-copy">
              © {new Date().getFullYear()} Sellio. Все права защищены.
              <span className="landing-footer-separator">·</span>
              <a href="#">Политика конфиденциальности</a>
              <span className="landing-footer-separator">·</span>
              <a href="#">Условия использования</a>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
