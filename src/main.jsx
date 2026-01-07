import { createRoot } from 'react-dom/client'
import App from './components/App.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { icons as icons_light_theme } from './styles/98/icons/light-theme/index.js'
import { icons as icons_dark_theme } from './styles/98/icons/dark-theme/index.js'
import './styles/98/common.css'
import './styles/98/light-theme.css'
import './styles/98/dark-theme.css'

createRoot(document.getElementById('root')).render(
    <ThemeProvider>
        <App />
    </ThemeProvider>
)