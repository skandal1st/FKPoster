function tenantMiddleware(req, res, next) {
  if (!req.tenantId) {
    return res.status(403).json({ error: 'Тенант не определён' });
  }
  next();
}

module.exports = { tenantMiddleware };
