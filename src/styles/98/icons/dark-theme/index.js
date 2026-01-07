// Импортируем все PNG файлы
const modules = import.meta.glob('./*.png', { eager: true });

// Экспортируем их как объект
export const icons = Object.entries(modules).reduce((acc, [path, module]) => {
  const name = path.replace('./', '').replace('.png', '');
  acc[name] = module.default;
  return acc;
}, {});