import React from 'react';
import {TbAlertCircle} from 'react-icons/tb';
import {Label} from "@/components/ui/label.tsx";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert.tsx";

interface InputControlProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    error?: string;
    htmlFor?: string;
}

export const InputControl: React.FC<InputControlProps> = ({
                                                               title,
                                                               icon,
                                                               children,
                                                               error,
                                                               htmlFor
                                                           }) => {
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <div className="flex-1">
                    <Label htmlFor={htmlFor} className="text-2xl font-bold">{title}</Label>
                    <div className="flex items-baseline">
                        {children}
                    </div>
                </div>
                {icon}
            </div>
            {error && (
                <Alert variant="destructive">
                    <TbAlertCircle className="h-4 w-4"/>
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
        </div>
    );
};