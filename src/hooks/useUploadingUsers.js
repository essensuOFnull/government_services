import { useState, useCallback } from 'react';

export function useUploadingUsers() {
  const [uploadingUsers, setUploadingUsers] = useState(new Map());

  const handleUploadStart = useCallback((userId, filename) => {
    setUploadingUsers(prev => new Map(prev).set(userId, filename));
  }, []);

  const handleUploadComplete = useCallback((userId) => {
    setUploadingUsers(prev => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  return {
    uploadingUsers,
    handleUploadStart,
    handleUploadComplete,
  };
}