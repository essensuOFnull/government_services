import React from 'react';
import { useAuthContext } from '../auth/AuthContext';

export default function ForwardButton({ msg, wsRef }) {
  const { user } = useAuthContext();
  const [show, setShow] = React.useState(false);
  const [conversations, setConversations] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  // Получить список чатов пользователя
  const fetchConversations = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/messenger/conversations', { 
        headers: { 'x-user-id': user.id } 
      });
      const j = await resp.json();
      if (j.success && Array.isArray(j.conversations)) {
        setConversations(j.conversations);
      } else {
        setError('Не удалось получить список чатов');
      }
    } catch (e) {
      setError('Ошибка получения чатов');
    } finally {
      setLoading(false);
    }
  };

  const handleForward = async (convId) => {
    setLoading(true);
    setError('');
    
    try {
      // Отправляем запрос на сервер через WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'forward_message',
          data: {
            conversationId: convId,
            originalMessageId: msg.id
          }
        }));
        
        setShow(false);
      } else {
        setError('WebSocket не подключен');
      }
    } catch (e) {
      setError('Ошибка пересылки: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => { 
          setShow(s => !s); 
          if (!show) fetchConversations(); 
        }} 
        title="Переслать"
      >↗️
      </button>
      {show && (
        <div 
          className="forward-popup" 
          style={{ 
            position: 'absolute',
            left:'50%',
            top:'50%',
            transform:'translate(-50%, -50%)',
            background: '#fff', 
            border: '1px solid #ccc', 
            zIndex: 10, 
            padding: 8,
            borderRadius: 4,
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
          }}
        >
          <div><strong>Переслать в:</strong></div>
          {loading && <div>Загрузка чатов...</div>}
          {error && <div style={{ color: 'red' }}>{error}</div>}
          <ul style={{ 
            maxHeight: 200, 
            overflowY: 'auto', 
            padding: 0, 
            margin: '8px 0 0 0',
            borderTop: '1px solid #eee',
            paddingTop: 8
          }}>
            {conversations
              .map(conv => (
                <li key={conv.id} style={{ listStyle: 'none', margin: '4px 0' }}>
                  <button 
                    onClick={() => handleForward(conv.id)} 
                    style={{ 
                      width: '100%', 
                      textAlign: 'left',
                      padding: '4px 8px',
                      background: '#f0f0f0',
                      border: '1px solid #ddd',
                      cursor: 'pointer'
                    }}
                    onMouseOver={(e) => e.target.style.background = '#e0e0e0'}
                    onMouseOut={(e) => e.target.style.background = '#f0f0f0'}
                  >
                    {conv.title || `Чат ${conv.id.substring(0, 8)}`}
                  </button>
                </li>
              ))}
          </ul>
          <button 
            onClick={() => setShow(false)} 
            style={{ 
              marginTop: 8, 
              width: '100%',
              padding: '4px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Отмена
          </button>
        </div>
      )}
    </>
  );
}