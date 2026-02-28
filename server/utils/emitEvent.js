function emitEvent(req, event, data) {
  const io = req.app.get('io');
  if (!io || !req.tenantId) return;
  io.to(`tenant:${req.tenantId}`).emit(event, data);
}

module.exports = { emitEvent };
