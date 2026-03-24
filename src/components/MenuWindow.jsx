import { useState, useEffect } from 'react';
import Messenger from './Messenger';
import { useWindowsManager } from '../hooks/useWindowsManager';
import { useAuth } from '../hooks/useAuth';
import DecorDisassembling from './calculators/crossout/DecorDisassembling';
import DateCountdown from './calculators/DateCountdown.jsx';
import {
  loadWallpaperMode,
  saveWallpaperMode,
  applyWallpaper,
  loadWallpaper,
  clearWallpaper,
  removeWallpaperElement
} from '../utils/wallpaperUtils';

export default function MenuWindow({ userId }) {
  const [activeTab, setActiveTab] = useState(0);
  const { openWindow } = useWindowsManager();
  const { user } = useAuth();
  const effectiveUserId = userId || user?.id;
  const [wallpaperMode, setWallpaperMode] = useState(loadWallpaperMode());

  // Применяем текущие обои при изменении режима
  useEffect(() => {
    const wallpaper = loadWallpaper();
    if (wallpaper) {
      applyWallpaper(wallpaper.type, wallpaper.url, wallpaperMode);
    }
  }, [wallpaperMode]);

  const group_link = "https://t.me/c/3601903002";
  const threads_id = {
    ПРКПН: 4,
    SRDI: 7,
    ОМГ: 8,
    ОСОС: 13,
    ХВЗ: 14
  };
  const ПРКПН_link = `${group_link}/${threads_id.ПРКПН}`,
    SRDI_link = `${group_link}/${threads_id.SRDI}`,
    ОМГ_link = `${group_link}/${threads_id.ОМГ}`,
    ОСОС_link = `${group_link}/${threads_id.ОСОС}`,
    ХВЗ_link = `${group_link}/${threads_id.ХВЗ}`;

  function copyToClipboard(text, then_func) {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert('Заготовка обращения скопирована в буфер обмена.');
        then_func();
      })
      .catch(err => {
        console.error(err);
      });
  }

  const handleModeChange = (mode) => {
    setWallpaperMode(mode);
    saveWallpaperMode(mode);
  };

  const handleClearWallpaper = () => {
    if (window.confirm('Удалить обои рабочего стола?')) {
      clearWallpaper();
      removeWallpaperElement();
    }
  };

  const other = "Я подтверждаю, что, находясь в здравом уме и трезвой памяти, просмотрел полный перечень предоставляемых запросов и НЕ нашел подходящий под мои нужды.";

  return (
    <>
      <menu role="tablist">
        <li role="tab" aria-selected={activeTab === 0} onClick={() => setActiveTab(0)}><a>Мессенджер</a></li>
        <li role="tab" aria-selected={activeTab === 1} onClick={() => setActiveTab(1)}><a>Хранилище</a></li>
        <li role="tab" aria-selected={activeTab === 2} onClick={() => setActiveTab(2)}><a>Организации</a></li>
        <li role="tab" aria-selected={activeTab === 3} onClick={() => setActiveTab(3)}><a>Калькуляторы</a></li>
        <li role="tab" aria-selected={activeTab === 4} onClick={() => setActiveTab(4)}><a>Настройки</a></li>
      </menu>

      <div className="window" role="tabpanel" style={{ display: activeTab === 0 ? 'block' : 'none' }}>
        <div className="window-body">
          <div style={{ marginBottom: 8 }}>
            <button onClick={() => openWindow({ title: 'Мессенджер', children: <Messenger userId={effectiveUserId} /> })}>
              Открыть мессенджер в окне
            </button>
          </div>
          {activeTab === 0 && (
            <div style={{ padding: 8 }}>
              <p>Нажмите кнопку выше, чтобы открыть мессенджер в отдельном окне.</p>
            </div>
          )}
        </div>
      </div>

      <div className="window" role="tabpanel" style={{ display: activeTab === 1 ? 'block' : 'none' }}>
        <div className="window-body">
          <p>Хранилище - в разработке</p>
        </div>
      </div>

      <div className="window" role="tabpanel" style={{ display: activeTab === 2 ? 'block' : 'none' }}>
        <div className="window-body">
          <ul className="tree-view">
            <li>
              <details open>
                <summary>Список услуг:</summary>
                <ul>
                  <li>
                    <details>
                      <summary>ПРКПН (ПодбредРосКомПозорНадзор)</summary>
                      <ul>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Мне нужна консультация по поводу обхода блокировок. Каким образом происходит данный процесс?', () => {
                              window.open(ПРКПН_link, '_blank');
                            });
                          }}>Запросить консультацию по обходу блокировок</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Мне нужен текущий общий конфигурационный файл для обхода блокировок, а также приложение для его запуска.', () => {
                              window.open(ПРКПН_link, '_blank');
                            });
                          }}>Получить текущий сбособ обхода блокировок</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Мне нужен новый конфигурационный файл для обхода блокировок.', () => {
                              window.open(ПРКПН_link, '_blank');
                            });
                          }}>Запросить новый конфиг</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard(other, () => {
                              window.open(ПРКПН_link, '_blank');
                            });
                          }}>Обращение по другому поводу</button>
                        </li>
                      </ul>
                    </details>
                  </li>
                  <li>
                    <details>
                      <summary>SRDI (Steal-ReDistribute-Internet)</summary>
                      <ul>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Научите меня взламывать wifi.', () => {
                              window.open(SRDI_link, '_blank');
                            });
                          }}>Запросить консультацию по взлому wifi</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Мне нужно оборудовние для захвата хендшейков.', () => {
                              window.open(SRDI_link, '_blank');
                            });
                          }}>Запросить оборудование для захвата хендшейков</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Мне нужны вычислительные мощности для брутфоса.', () => {
                              window.open(SRDI_link, '_blank');
                            });
                          }}>Запросить брутфорс хендшейка</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard(other, () => {
                              window.open(SRDI_link, '_blank');
                            });
                          }}>Обращение по другому поводу</button>
                        </li>
                      </ul>
                    </details>
                  </li>
                  <li>
                    <details>
                      <summary>ОМГ (Отдел Майнинга и Генерации)</summary>
                      <ul>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Научите меня программировать.', () => {
                              window.open(ОМГ_link, '_blank');
                            });
                          }}>Запросить консультацию по программированию</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Создайте программу для', () => {
                              window.open(ОМГ_link, '_blank');
                            });
                          }}>Запросить создание программы</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Модифицируйте существующую программу', () => {
                              window.open(ОМГ_link, '_blank');
                            });
                          }}>Запросить модификацию программы</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard(other, () => {
                              window.open(ОМГ_link, '_blank');
                            });
                          }}>Обращение по другому поводу</button>
                        </li>
                      </ul>
                    </details>
                  </li>
                  <li>
                    <details>
                      <summary>ОСОС (Отдел Сервисного Обслуживания Сети)</summary>
                      <ul>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Как мне сделать так, чтобы друг смог зайти на мой сервер?', () => {
                              window.open(ОСОС_link, '_blank');
                            });
                          }}>Запросить консультацию по предоставлению доступа к игровому серверу</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Как мне открыть порт?', () => {
                              window.open(ОСОС_link, '_blank');
                            });
                          }}>Запросить консультацию по открытию порта</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Как мне создать виртуальную локальную сеть?', () => {
                              window.open(ОСОС_link, '_blank');
                            });
                          }}>Запросить консультацию по созданию виртуальной локальной сети</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard(other, () => {
                              window.open(ОСОС_link, '_blank');
                            });
                          }}>Обращение по другому поводу</button>
                        </li>
                      </ul>
                    </details>
                  </li>
                  <li>
                    <details>
                      <summary>ХВЗ (Хранилище Вечного Знания)</summary>
                      <ul>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Мне нужна книга.', () => {
                              window.open(ХВЗ_link, '_blank');
                            });
                          }}>Запрос на предоставление доступа к книге</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Посоветуйте книгу.', () => {
                              window.open(ХВЗ_link, '_blank');
                            });
                          }}>Рекомендация книги по запросу</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard('Посоветуйте случайную книгу.', () => {
                              window.open(ХВЗ_link, '_blank');
                            });
                          }}>Рекомендация случайной книги</button>
                        </li>
                        <li>
                          <button onClick={() => {
                            copyToClipboard(other, () => {
                              window.open(ХВЗ_link, '_blank');
                            });
                          }}>Обращение по другому поводу</button>
                        </li>
                      </ul>
                    </details>
                  </li>
                </ul>
              </details>
            </li>
          </ul>
        </div>
      </div>

      <div className="window" role="tabpanel" style={{ display: activeTab === 3 ? 'block' : 'none' }}>
        <div className="window-body">
          <ul className="tree-view">
            <li>
              <details open>
                <summary>Список калькуляторов:</summary>
                <ul>
                  <li>
                    <details>
                      <summary>Игры</summary>
                      <ul>
                        <li>
                          <details>
                            <summary>Crossout</summary>
                            <ul>
                              <li>
                                <button onClick={() =>
                                  openWindow({ title: 'Калькулятор разбора декора Crossout', children: <DecorDisassembling /> })
                                }>Разбор декора</button>
                              </li>
                            </ul>
                          </details>
                        </li>
                      </ul>
                    </details>
                  </li>
                  <li>
                    <details>
                      <summary>Даты</summary>
                      <ul>
                        <li>
                          <button onClick={() =>
                            openWindow({ title: 'Обратный отсчёт до даты', children: <DateCountdown /> })
                          }>Обратный отсчёт до даты</button>
                        </li>
                      </ul>
                    </details>
                  </li>
                </ul>
              </details>
            </li>
          </ul>
        </div>
      </div>

      <div className="window" role="tabpanel" style={{ display: activeTab === 4 ? 'block' : 'none' }}>
        <div className="window-body">
          <fieldset>
            <legend>Рабочий стол</legend>
            <div>Режим отображения обоев:</div>
			<br/>
			<div class="field-row">
				<input
					id="radio_cover"
					type="radio"
					name="wallpaperMode"
					value="cover"
					checked={wallpaperMode === 'cover'}
					onChange={() => handleModeChange('cover')}
				/>
				<label for="radio_cover">
					Покрыть экран с обрезкой (cover)
				</label>
			</div>
            <br />
			<div class="field-row">
				<input
					id="radio_contain"
					type="radio"
					name="wallpaperMode"
					value="contain"
					checked={wallpaperMode === 'contain'}
					onChange={() => handleModeChange('contain')}
				/>
				<label for="radio_contain">
					Вписать целиком с сохранением пропорций (contain)
				</label>
			</div>
            <br />
			<div class="field-row">
				<input
					id="radio_stretch"
					type="radio"
					name="wallpaperMode"
					value="stretch"
					checked={wallpaperMode === 'stretch'}
					onChange={() => handleModeChange('stretch')}
				/>
				<label for="radio_stretch">
					Растянуть с искажением (stretch)
				</label>
			</div>
            <br />
            <button onClick={handleClearWallpaper} style={{ marginTop: '12px' }}>
              Удалить обои
            </button>
          </fieldset>
        </div>
      </div>
    </>
  );
}