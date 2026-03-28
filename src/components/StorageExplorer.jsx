import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import StorageFileItem from './StorageFileItem';

export default function StorageExplorer() {
  const { user } = useAuth();
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDirectory = async (path) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/storage/list?path=${encodeURIComponent(path)}`, {
        headers: { 'x-user-id': user.id },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(data.items);
        setError('');
      } else {
        setError(data.message || 'Ошибка загрузки');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDirectory(currentPath);
    }
  }, [currentPath, user]);

  const navigateTo = (path) => {
    setCurrentPath(path);
  };

  const handleItemClick = (item) => {
    if (item.type === 'directory') {
      navigateTo(item.path);
    }
  };

  const breadcrumbs = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <div className="storage-explorer">
      <div className="breadcrumbs">
        <button onClick={() => navigateTo('')}>Корень</button>
        {breadcrumbs.map((crumb, idx) => {
          const path = breadcrumbs.slice(0, idx + 1).join('/');
          return (
            <span key={idx}>
              {' / '}
              <button onClick={() => navigateTo(path)}>{crumb}</button>
            </span>
          );
        })}
      </div>

      {loading && <div>Загрузка...</div>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <ul className="tree-view">
          {items.map((item) => (
            <li key={item.path}>
              {item.type === 'directory' ? (
                <details>
                  <summary onClick={() => handleItemClick(item)}>{item.name}</summary>
                  {/* Можно сделать вложенную загрузку, но для простоты при клике на папку выше обновляется текущий путь */}
                </details>
              ) : (
                <StorageFileItem file={item} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}