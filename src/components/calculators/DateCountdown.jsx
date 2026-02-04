import React, { useEffect, useRef, useState } from 'react';
import './DateCountdown.css';

const DateCountdown = () => {
  const canvasRef = useRef(null);
  const [targetDate, setTargetDate] = useState(null);
  const [displayDate, setDisplayDate] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const animationFrameId = useRef(null);

  // Инициализация начальной даты (1 июня текущего года)
  useEffect(() => {
    const currentYear = new Date().getFullYear();
    const summerStart = new Date(currentYear, 5, 1, 0, 0, 0); // Месяцы от 0 до 11 (5 = июнь)
    setTargetDate(summerStart);
  }, []);

  // Форматирование даты для отображения
  const formatDisplayDate = (date) => {
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];

    const dayName = days[date.getDay()];
    const dayNum = String(date.getDate()).padStart(2, '0');
    const monthName = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${dayName} ${dayNum} ${monthName} ${year} года ${hours}:${minutes}`;
  };

  // Обновление отображаемой даты при изменении targetDate
  useEffect(() => {
    if (targetDate) {
      setDisplayDate(formatDisplayDate(targetDate));
    }
  }, [targetDate]);

  // Получение правильного окончания для слов
  const getAffixWord = (number, word) => {
    const num = Math.floor(number);
    const lastDigit = num % 10;
    const lastTwoDigits = num % 100;

    const words = {
      day: { r_mn: 'дней', im: 'день', r_ed: 'дня' },
      hour: { r_mn: 'часов', im: 'час', r_ed: 'часа' },
      min: { r_mn: 'минут', im: 'минута', r_ed: 'минуты' },
      sec: { r_mn: 'секунд', im: 'секунда', r_ed: 'секунды' },
      milsec: { r_mn: 'миллисекунды', im: 'миллисекунды', r_ed: 'миллисекунды' }
    };

    const wordObj = words[word];

    if ((lastTwoDigits >= 11 && lastTwoDigits <= 19) || (lastDigit >= 5 && lastDigit <= 9) || lastDigit === 0) {
      return wordObj.r_mn;
    } else if (lastDigit === 1) {
      return wordObj.im;
    } else if (lastDigit >= 2 && lastDigit <= 4) {
      return wordObj.r_ed;
    }
    return wordObj.r_mn;
  };

  // Отрисовка таймера на canvas
  const drawTimer = (ctx, time, canvas) => {
    const rings={
        day: {s: 864e5, max: 365},
        hour: {s: 36e5, max: 24},
        min: {s: 6e4, max: 60},
        sec: {s: 1e3, max: 60},
        milsec: {s: 1, max: 1e3}
    };

    const r_size = 200;
    const r_thickness = 8;
    const r_spacing = 20;
    let actual_size = r_size + r_thickness;
    let remainingTime = time;
    let ringIndex = 0;

    Object.entries(rings).forEach(([unit, ringData]) => {
      const n = parseFloat(remainingTime / ringData.s);
      remainingTime -= Math.round(parseInt(n)) * ringData.s;
      const displayValue = n; // Показываем реальное значение, в том числе отрицательное

      let a, s;
      let currentRingSize = r_size;

      // Логика расположения из оригинала
      if (ringIndex === 0) {
        a = 440;
        a += ringIndex * (r_size + r_spacing + r_thickness);
        s = 160;
        s += 0.5 * r_thickness;
        currentRingSize = 300;
      } else {
        a = 0.5 * r_size + 0.5 * r_thickness;
        a += (ringIndex - 1) * (r_size + r_spacing + r_thickness);
        s = 2.2 * r_size;
        s += 0.5 * r_thickness;
      }

      const absDisplayValue = Math.abs(displayValue);
      const angle = (270 - (absDisplayValue / ringData.max) * 360) * (Math.PI / 180);

      ctx.save();
      ctx.translate(a, s);
      ctx.clearRect(
        -0.5 * actual_size,
        -0.5 * actual_size,
        actual_size,
        actual_size
      );

      // Background circle
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, currentRingSize / 2, 0, 2 * Math.PI);
      ctx.lineWidth = r_thickness;
      ctx.stroke();

      // Progress circle
      ctx.strokeStyle = 'rgb(100, 150, 255)';
      ctx.beginPath();
      ctx.arc(0, 0, currentRingSize / 2, 1.5 * Math.PI, angle, 1);
      ctx.lineWidth = r_thickness;
      ctx.stroke();

      // Unit name
      ctx.fillStyle = '#333';
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.textAlign = 'center';
      const unitName = getAffixWord(Math.floor(displayValue), unit).toUpperCase();
      ctx.fillText(unitName, 0, 46);

      // Number
      ctx.font = 'bold 80px Arial, sans-serif';
      ctx.fillText(Math.floor(displayValue), 0, 10);

      ctx.restore();
      ringIndex++;
    });
  };

  // Основной цикл анимации
  useEffect(() => {
    if (!targetDate || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const countdownToTime = new Date(targetDate).getTime();

    // Инициализация параметров canvas из оригинала
    const r_count = 5;
    const r_size = 200;
    const r_thickness = 8;
    const r_spacing = 20;
    
    // Вычисляем масштаб на основе новой высоты
    const oldHeight = r_size + r_thickness + 370;
    const newHeight = r_size + r_thickness + 250;
    const scale = newHeight / oldHeight;

    // Вычисляем размеры canvas с масштабом
    const scaledWidth = ((r_size + r_thickness) * (r_count - 1) + r_spacing * (r_count - 2)) * scale;
    const scaledHeight = newHeight;

    const animate = () => {
      const now = new Date().getTime();
      const time = countdownToTime - now; // Вычисляем время до даты (может быть отрицательным если дата прошла)

      // Очищаем весь canvas (прозрачный фон)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Применяем масштабирование
      ctx.save();
      ctx.scale(scale, scale);

      // Отрисовываем таймер (может быть отрицательным если дата прошла)
      drawTimer(ctx, time, canvas);

      ctx.restore();

      animationFrameId.current = requestAnimationFrame(animate);
    };
    
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    animate();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [targetDate]);

  // Обработка изменения даты
  const handleDateChange = (e) => {
    const newDate = new Date(e.target.value);
    setTargetDate(newDate);
  };

  // Форматирование даты для input[type="datetime-local"]
  const formatDateForInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  return (
    <div className="date-countdown-container">
      <div className="timer-wrapper">
        <canvas
          ref={canvasRef}
          className="countdown-canvas"
        />
      </div>

      <p className="target-date-label">
        Окончание отсчёта: <span className="target-date">{displayDate}</span>
      </p>

      <div className="controls">
        <input
          type="datetime-local"
          value={targetDate ? formatDateForInput(targetDate) : ''}
          onChange={handleDateChange}
          className="date-picker"
        />
      </div>
    </div>
  );
};

export default DateCountdown;
