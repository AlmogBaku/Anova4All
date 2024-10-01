import React from 'react';
import {useNavigate} from 'react-router-dom';
import {TbCoffee} from 'react-icons/tb';

const Welcome: React.FC = () => {
    const navigate = useNavigate();

    const handleSetupDevice = () => {
        navigate('/setup');
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <TbCoffee className="text-6xl text-primary mb-4"/>
            <h1 className="text-4xl font-bold mb-4">Welcome to Anova4All</h1>
            <p className="text-xl mb-8">Your personal sous vide assistant</p>
            <button
                className="btn btn-primary btn-lg"
                onClick={handleSetupDevice}
            >
                Set Up New Device
            </button>
        </div>
    );
};

export default Welcome;