import React from 'react';
import {useNavigate} from 'react-router-dom';
import {TbChefHat} from 'react-icons/tb';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Button} from "@/components/ui/button.tsx";

const Welcome: React.FC = () => {
    const navigate = useNavigate();

    const handleSetupDevice = () => {
        navigate('/setup');
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <div className="flex justify-center mb-4">
                        <TbChefHat className="text-6xl text-primary"/>
                    </div>
                    <CardTitle className="text-4xl font-bold">Welcome to Anova4All</CardTitle>
                    <CardDescription className="text-xl">Your personal sous vide assistant</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="mb-6">It looks like you don't have any devices paired yet. Let's add one!</p>
                    <Button size="lg" onClick={handleSetupDevice}>
                        Add Your First Device
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};

export default Welcome;