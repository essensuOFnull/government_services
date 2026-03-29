import {useState} from 'react';
export default function AudioTrackItem({ track, audioRefs }){
  const [volume, setVolume] = useState(0); // Теперь useState на верхнем уровне компонента

  const title = track.title || (track.language === 'rus' ? 'Русский' : track.language === 'jpn' ? 'Японский' : track.language);
  const bitrate = track.bitrate ? ` (${Math.round(track.bitrate / 1000)} kbps)` : '';
  
  // Уникальный ID для связки label и input
  const inputId = `volume-${track.index}`;

  return (
    <div className="audio-track-item">
      <div className="track-label">{title}{bitrate}</div>
      <audio
        style={{display:'none'}}
        ref={el => { if (el) { audioRefs.current[track.index] = el; el.volume = volume; } }}
        src={track.url}
        controls
        className="track-audio"
        muted={!volume}
      />
      <div className="volume-container">
        <label htmlFor={inputId}>{volume?'🔊':'🔇'}</label>
        <input 
          id={inputId}
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          value={volume} 
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
};