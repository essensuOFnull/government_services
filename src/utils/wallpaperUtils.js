// wallpaperUtils.js
export const saveWallpaper = (type, url) => {
  localStorage.setItem('wallpaper', JSON.stringify({ type, url }));
};

export const loadWallpaper = () => {
  const stored = localStorage.getItem('wallpaper');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (e) {
    return null;
  }
};

export const clearWallpaper = () => {
  localStorage.removeItem('wallpaper');
};

export const applyWallpaper = (type, url) => {
  // Удаляем предыдущий контейнер обоев
  const existing = document.getElementById('wallpaper-container');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'wallpaper-container';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.zIndex = '-1';
  container.style.pointerEvents = 'none'; // чтобы не мешать кликам

  if (type === 'image') {
    container.style.backgroundImage = `url(${url})`;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';
  } else if (type === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    container.appendChild(video);
  }

  document.body.appendChild(container);
};