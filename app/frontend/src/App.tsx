// src/App.tsx
import React from 'react';
import {BrowserRouter as Router, Route, Routes} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import Layout from './components/Layout';
import Welcome from './components/Welcome';
import Settings from './components/Settings';
import DeviceSetup from './components/DeviceSetup';
import {AnovaProvider, useAnova} from "./contexts/Anova.tsx";
import Home from "./components/Home.tsx";

const queryClient = new QueryClient();

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AnovaProvider>
                <Router>
                    <Layout>
                        <Routes>
                            <Route path="/" element={<WelcomeOrHome/>}/>
                            <Route path="/setup" element={<DeviceSetup/>}/>
                            <Route path="/settings" element={<Settings/>}/>
                        </Routes>
                    </Layout>
                </Router>
            </AnovaProvider>
        </QueryClientProvider>
    );
}

const WelcomeOrHome: React.FC = () => {
    const {isConfigured} = useAnova();

    return isConfigured ? <Home/> : <Welcome/>;
}

export default App;