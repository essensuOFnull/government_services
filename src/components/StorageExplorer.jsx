import React, { useState, useEffect, useMemo } from 'react';
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

  // Сортировка: сначала папки, потом файлы, по алфавиту
  const sortedItems = useMemo(() => {
    const directories = items.filter(item => item.type === 'directory');
    const files = items.filter(item => item.type === 'file');
    
    const sortByName = (a, b) => a.name.localeCompare(b.name);
    directories.sort(sortByName);
    files.sort(sortByName);
    
    return [...directories, ...files];
  }, [items]);

  const navigateTo = (path) => {
    setCurrentPath(path);
  };

  const goBack = () => {
    if (!currentPath) return;
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    setCurrentPath(parentPath);
  };

  const breadcrumbs = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <div className="storage-explorer">
      <div className="toolbar" style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
        {currentPath && (
          <button onClick={goBack}>⬅ Назад</button>
        )}
        <button onClick={() => navigateTo('')}>📁 Корень</button>
      </div>
      <div className="breadcrumbs" style={{ marginBottom: '12px', fontSize: '0.9em' }}>
        <span>📍 </span>
        {breadcrumbs.map((crumb, idx) => {
          const path = breadcrumbs.slice(0, idx + 1).join('/');
          return (
            <span key={idx}>
              {idx > 0 && ' / '}
              <button 
                onClick={() => navigateTo(path)} 
                style={{ background: 'none', border: 'none', color: 'blue', cursor: 'pointer' }}
              >
                {crumb}
              </button>
            </span>
          );
        })}
        {!currentPath && <span>Корень</span>}
      </div>

      {loading && <div>Загрузка...</div>}
      {error && <div className="error" style={{ color: 'red' }}>{error}</div>}

      {!loading && !error && (
        <ul className="tree-view" style={{ listStyle: 'none', padding: 0 }}>
          {sortedItems.map((item) => (
            <li key={item.path} style={{ marginBottom: '8px' }}>
              {item.type === 'directory' ? (
                <div 
                  onClick={() => navigateTo(item.path)} 
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>📁</span> {item.name}
                </div>
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