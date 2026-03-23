// wallpaperUtils.js
// wallpaperUtils.js

const WALLPAPER_KEY = 'wallpaper';
const WALLPAPER_MODE_KEY = 'wallpaperMode';

export const saveWallpaper = (type, url) => {
  localStorage.setItem(WALLPAPER_KEY, JSON.stringify({ type, url }));
};

export const loadWallpaper = () => {
  const stored = localStorage.getItem(WALLPAPER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (e) {
    return null;
  }
};

export const clearWallpaper = () => {
  localStorage.removeItem(WALLPAPER_KEY);
  removeWallpaperElement();
};

export const saveWallpaperMode = (mode) => {
  localStorage.setItem(WALLPAPER_MODE_KEY, mode);
};

export const loadWallpaperMode = () => {
  const mode = localStorage.getItem(WALLPAPER_MODE_KEY);
  return mode || 'cover'; // 'cover', 'contain', 'stretch', 'repeat'
};

export const removeWallpaperElement = () => {
  const existing = document.getElementById('wallpaper-container');
  if (existing) existing.remove();
};

export const applyWallpaper = (type, url, mode = null) => {
  // Удаляем предыдущий контейнер
  removeWallpaperElement();

  // Если передан режим, сохраняем его, иначе берём сохранённый
  const finalMode = mode || loadWallpaperMode();

  const container = document.createElement('div');
  container.id = 'wallpaper-container';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.zIndex = '-1';
  container.style.pointerEvents = 'none';

  if (type === 'image') {
    container.style.backgroundImage = `url(${url})`;
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = finalMode === 'repeat' ? 'repeat' : 'no-repeat';
    
    switch (finalMode) {
      case 'cover':
        container.style.backgroundSize = 'cover';
        break;
      case 'contain':
        container.style.backgroundSize = 'contain';
        break;
      case 'stretch':
        container.style.backgroundSize = '100% 100%';
        break;
      case 'repeat':
        container.style.backgroundSize = 'auto';
        break;
      default:
        container.style.backgroundSize = 'cover';
    }
  } else if (type === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.style.width = '100%';
    video.style.height = '100%';
    
    // Для видео режим 'repeat' не имеет смысла, используем cover или contain
    switch (finalMode) {
      case 'contain':
        video.style.objectFit = 'contain';
        break;
      case 'stretch':
        video.style.objectFit = 'fill';
        break;
      default:
        video.style.objectFit = 'cover';
    }
    container.appendChild(video);
  }

  document.body.appendChild(container);
};