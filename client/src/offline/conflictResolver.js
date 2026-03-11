import toast from 'react-hot-toast';

/**
 * Обработка конфликтов при синхронизации офлайн-операций.
 * Возвращает: { action: 'skip' | 'retry' | 'fail', message: string }
 */
export function resolveConflict(op, error) {
  const msg = error?.message || error || '';

  // Стол уже занят другим заказом
  if (msg.includes('уже есть открытый заказ')) {
    toast.error(`Конфликт: стол уже занят. Заказ создан офлайн не синхронизирован.`, { duration: 6000 });
    return { action: 'fail', message: 'Стол занят другим заказом. Создайте заказ на свободный стол.' };
  }

  // Товар не найден или деактивирован
  if (msg.includes('Товар не найден') || msg.includes('не найден')) {
    toast.error(`Товар не найден на сервере — позиция пропущена`, { duration: 5000 });
    return { action: 'skip', message: 'Товар деактивирован или удалён' };
  }

  // Смена закрыта
  if (msg.includes('Откройте кассовый день') || msg.includes('кассовый день')) {
    toast.error(`Кассовый день закрыт. Офлайн-заказы не синхронизированы.`, { duration: 8000 });
    return { action: 'fail', message: 'Кассовый день закрыт' };
  }

  // Заказ не найден или уже закрыт
  if (msg.includes('уже закрыт') || msg.includes('не найден или уже')) {
    return { action: 'skip', message: 'Заказ уже обработан' };
  }

  // ККТ ошибка — пропускаем, заказ и так закрыт
  if (msg.includes('фискализации') || msg.includes('kkt_error')) {
    toast('Чек ККТ не пробит — будет создан при следующей синхронизации', {
      icon: '⚠️',
      duration: 5000,
    });
    return { action: 'skip', message: 'ККТ ошибка, заказ закрыт без чека' };
  }

  // Подписка / лимит
  if (msg.includes('лимит') || msg.includes('тарифа') || msg.includes('подписк')) {
    return { action: 'fail', message: msg };
  }

  // Idempotency — заказ уже существует (дубль)
  if (msg.includes('idempotency') || msg.includes('уже существует')) {
    return { action: 'skip', message: 'Операция уже выполнена (дубль)' };
  }

  // Неизвестная ошибка — retry при следующей синхронизации
  return { action: 'retry', message: msg || 'Неизвестная ошибка сервера' };
}
