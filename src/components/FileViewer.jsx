import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';

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

  // Получение URL
  useEffect(() => {
    let mounted = true;
    let token = null;

    (async () => {
      setLoading(true);
      setError(null);
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

          if (fileType === 'text') {
            const resp = await fetch(`/api/storage/download?path=${encodeURIComponent(file.path)}`, {
              headers: { 'x-user-id': userId },
            });
            if (!resp.ok) throw new Error('Не удалось получить текст');
            const txt = await resp.text();
            if (mounted) setTextContent(txt);
          } else {
            if (mounted) setSrcUrl(previewUrl);
          }
        } else {
          const tokenResp = await fetch(`/api/messenger/preview-token/${fileId}`, {
            method: 'POST',
            headers: { 'x-user-id': userId },
          });
          const tj = await tokenResp.json();
          if (!tokenResp.ok || !tj.success || !tj.token) throw new Error(tj.message || 'Не удалось получить токен');
          token = tj.token;
          const previewUrl = `/api/messenger/preview/${fileId}?token=${encodeURIComponent(token)}`;

          if (fileType === 'text') {
            const resp = await fetch(previewUrl);
            if (!resp.ok) throw new Error('Не удалось получить текст');
            const txt = await resp.text();
            if (mounted) setTextContent(txt);
          } else {
            if (mounted) setSrcUrl(previewUrl);
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
  }, [isStorageFile, fileId, file?.path, userId, fileType]);

  // Загрузка аудиодорожек
  useEffect(() => {
    if (fileType !== 'video' || !isStorageFile || !srcUrl) return;

    (async () => {
      try {
        const resp = await fetch(`/api/storage/audio-tracks?path=${encodeURIComponent(file.path)}`, {
          headers: { 'x-user-id': userId },
        });
        if (!resp.ok) throw new Error('Ошибка загрузки списка дорожек');
        const data = await resp.json();
        if (data.success && data.tracks) {
          setAudioTracks(data.tracks);
        } else {
          setAudioTracks([]);
        }
      } catch (err) {
        console.error('Audio tracks error', err);
        setAudioTracks([]);
      }
    })();
  }, [fileType, isStorageFile, file?.path, srcUrl, userId]);

  // Синхронизация видео и аудио (с учётом видимости)
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
  }, [audioTracks]); // пересоздаём при изменении списка дорожек

  // Отслеживаем видимость страницы
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Вкладка неактивна — отключаем синхронизацию
        syncEnabled.current = false;
      } else {
        // Вкладка активна — включаем синхронизацию и принудительно синхронизируем видео по аудио
        syncEnabled.current = true;

        // Находим активную аудиодорожку (не muted и не paused)
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
          // Если разница больше 0.2 секунды, синхронизируем
          if (Math.abs(video.currentTime - targetTime) > 0.2) {
            video.currentTime = targetTime;
          }
          // Если видео на паузе, а активное аудио играет, возможно, стоит запустить видео?
          // По умолчанию не трогаем, чтобы не нарушать состояние пользователя.
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

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
      return <video src={srcUrl} controls style={{ width: '100%', height: '100%' }} />;
    }

    return (
      <div className="video-with-tracks">
        <video
          ref={videoRef}
          src={srcUrl}
          controls
          muted
          className="video-player"
        />
        {audioTracks.length > 0 && (
          <div className="audio-tracks-list">
            {audioTracks.map((track, idx) => {
              const title = track.title || (track.language === 'rus' ? 'Русский' : track.language === 'jpn' ? 'Японский' : track.language);
              const bitrate = track.bitrate ? ` (${Math.round(track.bitrate / 1000)} kbps)` : '';
              return (
                <React.Fragment key={track.index}>
                  <div className="audio-track-item">
                    <div className="track-label">
                      {title}{bitrate}
                    </div>
                    <audio
                      ref={el => { if (el) audioRefs.current[track.index] = el; }}
                      src={track.url}
                      controls
                      controlsList="nodownload nofullscreen noremoteplayback"
                      className="track-audio"
                      muted
                    />
                  </div>
                  {idx < audioTracks.length - 1 && <hr className="track-separator" />}
                </React.Fragment>
              );
            })}
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