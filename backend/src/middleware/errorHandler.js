// Centralized error handler. Never leak stack traces or raw DB errors to the client.
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Файл слишком большой' });
  }
  if (err.code === '23505') { // Postgres unique_violation
    return res.status(409).json({ error: 'Запись с такими данными уже существует' });
  }
  if (err.code === '23503') { // foreign_key_violation
    return res.status(400).json({ error: 'Некорректная ссылка на связанную запись' });
  }

  const status = err.status || 500;
  const message = status === 500 ? 'Внутренняя ошибка сервера' : err.message;
  res.status(status).json({ error: message });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Маршрут не найден' });
}

module.exports = { errorHandler, notFoundHandler };
