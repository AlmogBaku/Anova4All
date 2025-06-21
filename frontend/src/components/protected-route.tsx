import React from 'react';
import {Navigate, Outlet} from 'react-router-dom';
import {useAuth} from '@/contexts/auth.tsx';

const ProtectedRoute: React.FC = () => {
    const {session, loading} = useAuth();
    console.log(session);
    if (loading) {
        return <div>Loading...</div>; // Or a spinner component
    }

    if (!session) {
        return <Navigate to="/login" replace/>;
    }

    return <Outlet/>;
};

export default ProtectedRoute;
