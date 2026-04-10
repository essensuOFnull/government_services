import React, { useRef } from 'react';

export function MessageInput({
  value,
  onChange,
  onSend,
  attachments,
  onRemoveAttachment,
  onFileUpload,
  onDrop,
  onTyping,
  toggleSidebar,
  isSidebarCollapsed,
}) {
  const fileInputRef = useRef(null);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault(); // предотвращаем вставку текста, если есть файлы
      const dataTransfer = new DataTransfer();
      files.forEach((file) => dataTransfer.items.add(file));
      const fileList = dataTransfer.files;

      // Создаём псевдо-событие для совместимости с существующим onFileUpload
      const fakeEvent = {
        target: {
          files: fileList,
        },
      };
      onFileUpload(fakeEvent);
    }
    // Если файлов нет – позволяем вставить текст как обычно
  };

  return (
    <div
      className="window message-input-area field-row-stacked"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {attachments.length > 0 && (
        <div className="attachments-list">
          {attachments.map((f, idx) => (
            <div key={idx} className="attachment-item">
              <span>{f.name}</span>
              <button onClick={() => onRemoveAttachment(idx)}>Удалить</button>
            </div>
          ))}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onTyping();
        }}
        onKeyPress={handleKeyPress}
        onPaste={handlePaste}
        placeholder="Введите сообщение..."
      />
      <div className="message-actions">
        <button className="menu-toggle" onClick={toggleSidebar}>☰</button>
        <button>
          <label>
            📎
            <input
              type="file"
              multiple
              onChange={onFileUpload}
              hidden
              ref={fileInputRef}
            />
          </label>
        </button>
        <button onClick={onSend}>Отправить</button>
      </div>
    </div>
  );
}

export default MessageInput;