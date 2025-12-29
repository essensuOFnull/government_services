// Импортируем все SVG файлы
const modules = import.meta.glob('./*.svg', { eager: true });

// Экспортируем их как объект
export const icons = Object.entries(modules).reduce((acc, [path, module]) => {
  const name = path.replace('./', '').replace('.svg', '');
  acc[name] = module.default;
  return acc;
}, {});