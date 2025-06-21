import React, {useState} from 'react';
import {TbMoon, TbSettings, TbSun, TbSunMoon} from "react-icons/tb";
import {Link} from "react-router-dom";
import {useTheme} from "@/contexts/Theme";
import {Button} from "@/components/ui/button.tsx";

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({children}) => {
    const {theme, setTheme} = useTheme();
    const [lastMajorTheme, setLastMajorTheme] = useState<"dark" | "light">(
        theme === 'light' ? 'light' : 'dark'
    );

    const handleThemeChange = () => {
        if (theme === 'system') {
            const nextTheme = lastMajorTheme === 'dark' ? 'light' : 'dark';
            setTheme(nextTheme);
            setLastMajorTheme(nextTheme);
        } else {
            setLastMajorTheme(theme);
            setTheme('system');
        }
    };

    return <div className="flex h-screen flex-col p-3">
        <header className="flex items-center justify-between bg-card p-2 mb-3 shadow-md rounded-lg">
            <Link to="/" className="flex items-center flex-1 font-bold font-mono text-lg pl-2">
                <img src={`${import.meta.env.BASE_URL}logo.svg`} className={"h-12 mr-3"} alt="Anova4All logo"/>
                Anova 4 All
            </Link>
            <nav className="flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
                    <Link to="/settings">
                        <TbSettings className="h-7 w-7"/>
                    </Link>
                </Button>

                <Button variant="ghost" size="icon" onClick={handleThemeChange}>
                    {theme === 'light' && <TbSun className="h-7 w-7"/>}
                    {theme === 'dark' && <TbMoon className="h-7 w-7"/>}
                    {theme === 'system' && <TbSunMoon className="h-7 w-7"/>}
                    <span className="sr-only">Toggle theme</span>
                </Button>
            </nav>
        </header>

        <main className="flex-1 overflow-y-auto">
            {children}
        </main>
    </div>;
}

export default Layout;