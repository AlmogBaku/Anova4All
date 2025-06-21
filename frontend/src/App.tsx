// src/app.tsx
import {BrowserRouter as Router, Route, Routes} from 'react-router-dom';

import Layout from '@/components/layout.tsx';
import DeviceSetup from '@/components/device-setup.tsx';
import {AnovaProvider} from "@/contexts/anova.tsx";
import Home from "@/components/home.tsx";
import ProtectedRoute from "@/components/protected-route.tsx";
import {AuthProvider} from "@/contexts/auth.tsx";
import {LoginForm} from '@/components/login-form.tsx';
import {ForgotPasswordForm} from "@/components/forgot-password-form.tsx";
import {UpdatePasswordForm} from "@/components/update-password-form.tsx";
import {SignUpForm} from "@/components/sign-up-form.tsx";

function App() {
    return (
        <Router basename={import.meta.env.VITE_BASE_ROUTE}>
            <AuthProvider>
                <AnovaProvider>
                    <Layout>
                        <Routes>
                            <Route path="/login" element={<LoginForm/>}/>
                            <Route path="/sign-up" element={<SignUpForm/>}/>
                            <Route path="/forgot-password" element={<ForgotPasswordForm/>}/>
                            <Route path="/update-password" element={<UpdatePasswordForm/>}/>
                            <Route element={<ProtectedRoute/>}>
                                <Route path="/" element={<Home/>}/>
                                <Route path="/setup" element={<DeviceSetup/>}/>
                            </Route>
                        </Routes>
                    </Layout>
                </AnovaProvider>
            </AuthProvider>
        </Router>
    );
}

export default App;