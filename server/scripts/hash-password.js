/**
 * Получить bcrypt-хэш пароля для создания пользователя в БД (например, суперадмина).
 *
 * Запуск из папки server (обязательно):
 *   cd server && node scripts/hash-password.js "ваш_пароль"
 *
 * Или интерактивно (пароль не попадёт в историю команд):
 *   cd server && node scripts/hash-password.js
 */

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    console.error('Модуль bcryptjs не найден.');
    console.error('');
    console.error('Вариант 1 — установить зависимости на этом сервере:');
    console.error('  cd /opt/FKPoster/server && npm install && node scripts/hash-password.js "ваш_пароль"');
    console.error('  (если npm нет: apt install npm или используйте вариант 2)');
    console.error('');
    console.error('Вариант 2 — сгенерировать хэш на своей машине (где есть Node и проект):');
    console.error('  cd server && node scripts/hash-password.js "ваш_пароль"');
    console.error('  Скопируйте вывод и подставьте в SQL при создании пользователя.');
    process.exit(1);
  }
  throw e;
}
const readline = require('readline');

const password = process.argv[2];

if (password) {
  const hash = bcrypt.hashSync(password, 10);
  console.log('Хэш пароля (подставьте в SQL):');
  console.log(hash);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Введите пароль: ', (input) => {
    rl.close();
    if (!input.trim()) {
      console.error('Пароль не задан.');
      process.exit(1);
    }
    const hash = bcrypt.hashSync(input.trim(), 10);
    console.log('Хэш пароля (подставьте в SQL):');
    console.log(hash);
  });
}
