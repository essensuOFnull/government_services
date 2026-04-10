import { useState, useRef, useCallback } from 'react';

export function useTyping(currentConversationId, wsSend) {
  const [typingUsers, setTypingUsers] = useState(new Set());
  const typingTimeoutRef = useRef(null);

  const handleTyping = useCallback(() => {
    if (!currentConversationId) return;

    wsSend({
      type: 'typing_start',
      data: { conversationId: currentConversationId }
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      wsSend({
        type: 'typing_stop',
        data: { conversationId: currentConversationId }
      });
    }, 3000);
  }, [currentConversationId, wsSend]);

  const handleTypingStart = useCallback((userId) => {
    setTypingUsers(prev => new Set([...prev, userId]));
  }, []);

  const handleTypingStop = useCallback((userId) => {
    setTypingUsers(prev => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  return {
    typingUsers,
    handleTyping,
    handleTypingStart,
    handleTypingStop,
  };
}