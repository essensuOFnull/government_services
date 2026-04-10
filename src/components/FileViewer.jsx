import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import AudioTrackItem from './AudioTrackItem';

export default function FileViewer({ fileId, fileMeta, file, userId: propUserId }) {
  const { user } = useAuth();
  const userId = propUserId || user?.id;
  const isStorageFile = !!file;
  const meta = isStorageFile ? file : fileMeta;

  const [srcUrl, setSrcUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [audioTracks, setAudioTracks] = useState([]);
  const videoRef = useRef(null);
  const audioRefs = useRef({}); // track.index -> HTMLAudioElement

  // Флаг, разрешающий синхронизацию
  const syncEnabled = useRef(true);
  // Для предотвращения повторных обновлений
  const isRefreshing = useRef(false);

  const getFileType = () => {
    if (isStorageFile) {
      const name = file.name;
      if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name)) return 'image';
      if (/\.(mp4|webm|ogg|mov|mkv|avi|wmv|flv)$/i.test(name)) return 'video';
      if (/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(name)) return 'audio';
      if (/\.(txt|md|json|js|html|css|xml|log|ini|cfg|conf)$/i.test(name)) return 'text';
      return 'generic';
    } else {
      const mime = meta?.mime_type || '';
      if (mime.startsWith('image/')) return 'image';
      if (mime.startsWith('video/')) return 'video';
      if (mime.startsWith('audio/')) return 'audio';
      if (mime.startsWith('text/') || mime === 'application/json') return 'text';
      return 'generic';
    }
  };

  const fileType = getFileType();

  // Получение URL (вынесем в отдельную функцию для возможности переиспользования)
  const fetchVideoUrl = async () => {
    let token = null;
    try {
      if (isStorageFile) {
        const tokenResp = await fetch('/api/storage/preview-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
          body: JSON.stringify({ path: file.path }),
        });
        const data = await tokenResp.json();
        if (!tokenResp.ok || !data.success) throw new Error(data.message || 'Не удалось получить токен');
        token = data.token;
        const previewUrl = `/api/storage/preview?token=${encodeURIComponent(token)}`;
        return { url: previewUrl, token };
      } else {
        const tokenResp = await fetch(`/api/messenger/preview-token/${fileId}`, {
          method: 'POST',
          headers: { 'x-user-id': userId },
        });
        const tj = await tokenResp.json();
        if (!tokenResp.ok || !tj.success || !tj.token) throw new Error(tj.message || 'Не удалось получить токен');
        token = tj.token;
        const previewUrl = `/api/messenger/preview/${fileId}?token=${encodeURIComponent(token)}`;
        return { url: previewUrl, token };
      }
    } catch (err) {
      console.error('Token fetch error', err);
      throw err;
    }
  };

  // Загрузка аудиодорожек
  const fetchAudioTracks = async () => {
    if (fileType !== 'video' || !isStorageFile) return [];
    try {
      const resp = await fetch(`/api/storage/audio-tracks?path=${encodeURIComponent(file.path)}`, {
        headers: { 'x-user-id': userId },
      });
      if (!resp.ok) throw new Error('Ошибка загрузки списка дорожек');
      const data = await resp.json();
      if (data.success && data.tracks) {
        return data.tracks;
      } else {
        return [];
      }
    } catch (err) {
      console.error('Audio tracks error', err);
      return [];
    }
  };

  // Первоначальная загрузка
  useEffect(() => {
    let mounted = true;
    let token = null;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (fileType === 'text') {
          if (isStorageFile) {
            const resp = await fetch(`/api/storage/download?path=${encodeURIComponent(file.path)}`, {
              headers: { 'x-user-id': userId },
            });
            if (!resp.ok) throw new Error('Не удалось получить текст');
            const txt = await resp.text();
            if (mounted) setTextContent(txt);
          } else {
            const resp = await fetch(`/api/messenger/preview/${fileId}?token=${encodeURIComponent(token)}`); // token еще не получен, но для текста используется другой подход
            // На самом деле для текста нужен токен, упростим: используем ту же логику что и для видео
            const { url, token: newToken } = await fetchVideoUrl();
            token = newToken;
            const respText = await fetch(url);
            if (!respText.ok) throw new Error('Не удалось получить текст');
            const txt = await respText.text();
            if (mounted) setTextContent(txt);
          }
        } else {
          const { url, token: newToken } = await fetchVideoUrl();
          token = newToken;
          if (mounted) setSrcUrl(url);

          if (fileType === 'video' && isStorageFile) {
            const tracks = await fetchAudioTracks();
            if (mounted) setAudioTracks(tracks);
          }
        }
      } catch (err) {
        console.error('FileViewer fetch error', err);
        if (mounted) setError(err.message || 'Ошибка загрузки');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (token) {
        const endpoint = isStorageFile ? '/api/storage/preview-release' : '/api/messenger/preview-release';
        fetch(`${endpoint}/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'x-user-id': userId } }).catch(() => {});
      }
    };
  }, [isStorageFile, fileId, file?.path, userId, fileType]); // зависимости оставляем как есть, но при рефреше вызовется отдельно

  // Синхронизация видео и аудио (без изменений, только добавим проверку syncEnabled)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncTimeToAllAudios = () => {
      if (!syncEnabled.current) return;
      const currentTime = video.currentTime;
      Object.values(audioRefs.current).forEach(audio => {
        if (Math.abs(audio.currentTime - currentTime) > 0.2) {
          audio.currentTime = currentTime;
        }
      });
    };

    const playUnmutedAudios = () => {
      if (!syncEnabled.current) return;
      Object.values(audioRefs.current).forEach(audio => {
        if (!audio.muted && audio.paused) {
          audio.play().catch(e => console.warn('Audio play error', e));
        }
      });
    };

    const pauseUnmutedAudios = () => {
      if (!syncEnabled.current) return;
      Object.values(audioRefs.current).forEach(audio => {
        if (!audio.muted && !audio.paused) {
          audio.pause();
        }
      });
    };

    const activateDefaultTrack = () => {
      if (!syncEnabled.current) return;
      if (audioTracks.length === 0) return;
      const hasUnmuted = Object.values(audioRefs.current).some(audio => !audio.muted);
      if (hasUnmuted) return;

      const defaultIndex = audioTracks.findIndex(track => track.language === 'rus');
      const idx = defaultIndex !== -1 ? defaultIndex : 0;
      const track = audioTracks[idx];
      const audio = audioRefs.current[track.index];
      if (audio && audio.muted) {
        audio.muted = false;
        if (!video.paused) {
          audio.play().catch(e => console.warn('Audio play error', e));
        }
      }
    };

    const handlePlay = () => {
      if (!syncEnabled.current) return;
      activateDefaultTrack();
      playUnmutedAudios();
    };

    const handlePause = () => {
      if (!syncEnabled.current) return;
      pauseUnmutedAudios();
    };

    const handleSeeked = () => {
      if (!syncEnabled.current) return;
      syncTimeToAllAudios();
      if (!video.paused) {
        playUnmutedAudios();
      }
    };

    const handleTimeUpdate = () => {
      if (!syncEnabled.current) return;
      syncTimeToAllAudios();
      if (!video.paused) {
        playUnmutedAudios();
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [audioTracks]);

  // Отслеживаем видимость страницы
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        syncEnabled.current = false;
      } else {
        syncEnabled.current = true;
        // Находим активную аудиодорожку
        let activeAudio = null;
        for (const audio of Object.values(audioRefs.current)) {
          if (!audio.muted && !audio.paused) {
            activeAudio = audio;
            break;
          }
        }
        if (activeAudio && videoRef.current) {
          const video = videoRef.current;
          const targetTime = activeAudio.currentTime;
          if (Math.abs(video.currentTime - targetTime) > 0.2) {
            video.currentTime = targetTime;
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Обработчик ошибок видео
  const handleVideoError = async () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    try {
      console.log('Video error, refreshing token...');
      const video = videoRef.current;
      if (!video) return;

      // Сохраняем состояние
      const savedTime = video.currentTime;
      const wasPlaying = !video.paused;
      let savedActiveTrack = null;
      if (audioTracks.length > 0) {
        for (let i = 0; i < audioTracks.length; i++) {
          const audio = audioRefs.current[audioTracks[i].index];
          if (audio && !audio.muted) {
            savedActiveTrack = { index: i, track: audioTracks[i] };
            break;
          }
        }
      }

      // Запрашиваем новый URL
      const { url: newUrl, token: newToken } = await fetchVideoUrl();
      setSrcUrl(newUrl);

      // Для видео с треками перезагружаем аудиодорожки
      if (fileType === 'video' && isStorageFile) {
        const newTracks = await fetchAudioTracks();
        setAudioTracks(newTracks);
      }

      // Ждём, пока видео загрузит метаданные (новый src)
      const onLoadedMetadata = () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        // Восстанавливаем время
        if (savedTime && isFinite(savedTime)) {
          video.currentTime = savedTime;
        }
        // Если видео играло, запускаем
        if (wasPlaying) {
          video.play().catch(e => console.warn('Play after refresh error', e));
        }
        // Восстанавливаем активную дорожку
        if (savedActiveTrack && audioTracks.length > 0) {
          const newTrack = audioTracks.find((_, idx) => idx === savedActiveTrack.index);
          if (newTrack) {
            const audioEl = audioRefs.current[newTrack.index];
            if (audioEl) {
              audioEl.muted = false;
              if (wasPlaying && audioEl.paused) {
                audioEl.play().catch(e => console.warn('Audio play after refresh error', e));
              }
            }
          }
        }
      };
      video.addEventListener('loadedmetadata', onLoadedMetadata);
    } catch (err) {
      console.error('Failed to refresh video', err);
      setError('Не удалось восстановить воспроизведение. Обновите страницу.');
    } finally {
      isRefreshing.current = false;
    }
  };

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioRefs.current = {};
    };
  }, []);

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div style={{ color: 'red' }}>Ошибка: {error}</div>;

  if (fileType === 'image' && srcUrl) {
    return <img src={srcUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%' }} />;
  }

  if (fileType === 'audio' && srcUrl) {
    return <audio src={srcUrl} controls style={{ width: '100%' }} />;
  }

  if (fileType === 'text' && textContent !== null) {
    return <pre style={{ whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '100%' }}>{textContent}</pre>;
  }

  if (fileType === 'video' && srcUrl) {
    if (!isStorageFile) {
      return (
        <video
          ref={videoRef}
          src={srcUrl}
          controls
          style={{ width: '100%', height: '100%' }}
          onError={handleVideoError}
        />
      );
    }

    return (
      <div className="video-with-tracks">
        <video
          ref={videoRef}
          src={srcUrl}
          controls
          muted
          className="video-player"
          onError={handleVideoError}
        />
        {audioTracks.length > 0 && (
          <div className="audio-tracks-list">
            {audioTracks.map((track, idx) => (
              <React.Fragment key={track.index}>
                <AudioTrackItem track={track} audioRefs={audioRefs} />
                {idx < audioTracks.length - 1 && <hr className="track-separator" />}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <p>Файл: {isStorageFile ? file.name : (meta?.original_filename || fileId)}</p>
      {!isStorageFile && meta?.size && <p>Размер: {meta.size} байт</p>}
      <button onClick={() => {
        if (isStorageFile) window.open(`/api/storage/download?path=${encodeURIComponent(file.path)}`, '_blank');
        else window.open(`/api/messenger/download-file/${fileId}`, '_blank');
      }}>Скачать</button>
    </div>
  );
}