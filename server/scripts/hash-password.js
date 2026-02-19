/**
 * Получить bcrypt-хэш пароля для создания пользователя в БД (например, суперадмина).
 *
 * Запуск:
 *   node scripts/hash-password.js "ваш_пароль"
 *
 * Или интерактивно (пароль не попадёт в историю команд):
 *   node scripts/hash-password.js
 */

const bcrypt = require('bcryptjs');
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
