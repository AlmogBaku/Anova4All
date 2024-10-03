import React from 'react';
import {TbAlertCircle} from 'react-icons/tb';

interface InputControlProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    error?: string;
}

export const InputControl: React.FC<InputControlProps> = ({
                                                              title,
                                                              icon,
                                                              children,
                                                              error
                                                          }) => {
    return (
        <div className="mb-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">{title}</h2>
                    <label className="input input-ghost flex flex-auto p-0 text-4xl">
                        {children}
                    </label>
                </div>
                {icon}
            </div>
            {error && (
                <div className="alert alert-error mt-2">
                    <TbAlertCircle className="text-2xl mr-2"/>
                    {error}
                </div>
            )}
        </div>
    );
};