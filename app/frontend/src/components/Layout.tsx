import React, {useState} from 'react';
import {TbMoon, TbSettings, TbSun, TbSunMoon} from "react-icons/tb";
import {Link} from "react-router-dom";

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({children}) => {
    const [theme, setTheme] = useState<"default" | "light" | "dark">("default")

    const toggleTheme = () => {
        const themes = ["default", "light", "dark"];
        const index = themes.indexOf(theme);
        setTheme(themes[(index + 1) % themes.length] as "default" | "light" | "dark")
    };
    return <div className="App flex h-screen flex-col p-3">
        <div className="navbar bg-base-100 gap-2 mb-3 shadow-md rounded-box">
            <Link to="/" className="flex-1 font-bold font-mono p-1 pl-4">
                <img src={`${import.meta.env.BASE_URL}/logo.svg`} className={"h-12 mr-3"} alt="Anova4All logo"/>
                Anova 4 All
            </Link>
            <div className="flex-none">
                <Link to="/settings" className="btn btn-ghost btn-circle"><TbSettings className="h-7 w-7"/></Link>
            </div>

            <label className="btn btn-ghost btn-circle swap swap-rotate" onClick={toggleTheme}>
                {/* this hidden checkbox controls the state */}
                <input type="radio" checked={theme === 'default'} readOnly className="theme-controller"
                       value="default"/>
                <input type="radio" checked={theme === 'dark'} readOnly className="theme-controller" value="dark"/>
                <input type="radio" checked={theme === 'light'} readOnly className="theme-controller" value="light"/>

                <TbSun className={`fill-current w-7 h-7 ${theme === 'light' ? '' : 'opacity-0 -rotate-45'}`}/>
                <TbSunMoon className={`fill-current w-7 h-7 ${theme === 'default' ? '' : 'opacity-0 -rotate-45'}`}/>
                <TbMoon className={`fill-current w-7 h-7 ${theme === 'dark' ? '' : 'opacity-0 -rotate-45'}`}/>
            </label>
        </div>

        {children}
    </div>;
}

export default Layout;