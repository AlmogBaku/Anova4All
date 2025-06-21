import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client'
import App from '@/app.tsx'
import '@/app.css'
import '@/index.css'
import {ThemeProvider} from "@/contexts/theme.tsx";

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <App/>
        </ThemeProvider>
    </StrictMode>,
)
