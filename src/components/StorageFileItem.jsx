import React, { useState } from 'react';
import { useWindowsManager } from '../hooks/useWindowsManager';
import { useAuth } from '../hooks/useAuth';
import StorageFileViewer from './StorageFileViewer';

// Определяем иконку по расширению файла
function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    // Изображения
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    // Видео
    mp4: '🎬', webm: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
    // Аудио
    mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵', m4a: '🎵',
    // Документы
    pdf: '📄', doc: '📄', docx: '📄', xls: '📊', xlsx: '📊', ppt: '📽️', pptx: '📽️',
    txt: '📝', md: '📝', json: '🔧', xml: '🔧', html: '🌐', css: '🎨', js: '⚙️',
    // Архивы
    zip: '📦', rar: '📦', tar: '📦', gz: '📦', '7z': '📦',
    // Исполняемые
    exe: '⚙️', msi: '⚙️', app: '⚙️',
    // Прочее
    default: '📄'
  };
  return icons[ext] || icons.default;
}

export default function StorageFileItem({ file, userId: propUserId }) {
  const { openWindow } = useWindowsManager();
  const { user } = useAuth();
  const userId = propUserId || user?.id;
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);

  const { name, path, size } = file;
  const icon = getFileIcon(name);
  // Форматируем размер для отображения
  const formatSize = (bytes) => {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // Скачивание файла с прогрессом
  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const xhr = new XMLHttpRequest();
      xhr.open('GET', `/api/storage/download?path=${encodeURIComponent(path)}`, true);
      xhr.setRequestHeader('x-user-id', userId);
      xhr.responseType = 'blob';

      xhr.onprogress = (e) => {
        if (e.lengthComputable) {
          setDownloadProgress((e.loaded / e.total) * 100);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const blob = xhr.response;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } else {
          alert('Ошибка скачивания');
        }
        setIsDownloading(false);
        setDownloadProgress(null);
      };

      xhr.onerror = () => {
        alert('Ошибка сети');
        setIsDownloading(false);
        setDownloadProgress(null);
      };

      xhr.send();
    } catch (err) {
      console.error('Download error', err);
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  // Открыть в окне просмотра
  const handleOpen = () => {
    openWindow({
      title: name,
      children: <StorageFileViewer file={file} />,
    });
  };

  return (
    <div className="file-item">
      <hr />
      {isDownloading && (
        <div className="progress-indicator segmented">
          <span
            className="progress-indicator-bar"
            style={{ width: `${downloadProgress !== null ? downloadProgress : 0}%` }}
          />
        </div>
      )}
      <div className="row">
        <div style={{ fontSize: '48px'}}>{icon}</div>
		<div className="column" style={{justifyContent:'space-around'}}>
			<div style={{ fontWeight: 'bold' }}>{name}</div>
			{size !== undefined && <div style={{ fontSize: '0.8em', color: '#666' }}>{formatSize(size)}</div>}
		</div>
      </div>
      <div className="file-actions">
        <button onClick={handleDownload} className="download-btn" disabled={isDownloading}>
          {isDownloading ? 'Загрузка...' : '💾'}
        </button>
        <button onClick={handleOpen} className="open-btn">
          👁️
        </button>
      </div>
      <hr />
    </div>
  );
}