import { useEffect, useRef, useCallback } from 'react';

export function useScrollPagination({
  messageListRef,
  hasMore,
  loadMore,
  allMessages,
}) {
  const wasAtBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);

  // Начальная прокрутка вниз
  useEffect(() => {
    if (!messageListRef.current || allMessages.length === 0) return;
    if (!initialScrollDoneRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      initialScrollDoneRef.current = true;
      wasAtBottomRef.current = true;
    }
  }, [allMessages, messageListRef]);

  // Прокрутка при новых сообщениях, если пользователь был внизу
  useEffect(() => {
    if (!messageListRef.current || allMessages.length === 0) return;
    if (wasAtBottomRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [allMessages, messageListRef]);

  // Отслеживание прокрутки вниз
  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;

    const handleScroll = () => {
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 20;
      wasAtBottomRef.current = atBottom;
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [messageListRef]);

  // Подгрузка при скролле вверх
  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;

    const handleScrollToTop = async () => {
      if (container.scrollTop === 0 && hasMore && loadMore) {
        const oldScrollHeight = container.scrollHeight;
        const newMessages = await loadMore();
        if (newMessages && newMessages.length > 0) {
          requestAnimationFrame(() => {
            const newScrollHeight = container.scrollHeight;
            const delta = newScrollHeight - oldScrollHeight;
            container.scrollTop = delta;
          });
        }
      }
    };

    container.addEventListener('scroll', handleScrollToTop);
    return () => container.removeEventListener('scroll', handleScrollToTop);
  }, [hasMore, loadMore, messageListRef]);

  return { wasAtBottomRef, initialScrollDoneRef };
}