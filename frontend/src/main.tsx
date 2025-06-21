import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import {ThemeProvider} from "@/contexts/Theme"

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <App/>
        </ThemeProvider>
    </StrictMode>,
)
