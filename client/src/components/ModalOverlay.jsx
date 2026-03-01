export default function ModalOverlay({ children, onClose, style }) {
  const handleClick = (e) => {
    if (e.target === e.currentTarget && confirm('Закрыть окно? Несохранённые данные будут потеряны.')) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClick} style={style}>
      {children}
    </div>
  );
}
