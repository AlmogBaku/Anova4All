import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {Client, Device, DeviceResponse, ServerInfo} from '@/lib/client';
import {State} from "@/lib/client/device";
import {useAuth} from "@/contexts/auth";
import {useLocalStorage} from "@/hooks/use-local-storage";

// Context for the Anova device
interface AnovaContextType {
    devices: DeviceResponse[];
    selectedDevice: Device | null;
    selectDevice: (deviceId: string) => void;
    isLoading: boolean;
    state: State | null;
    remoteServer: ServerInfo;
    refreshDevices: () => Promise<void>;
    unpairDevice: (deviceId: string) => Promise<void>;
}

const AnovaContext = createContext<AnovaContextType>({} as AnovaContextType);

// Provider component
export const AnovaProvider: React.FC<React.PropsWithChildren> = ({children}) => {
    const {session} = useAuth();
    const [devices, setDevices] = useState<DeviceResponse[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [state, setState] = useState<State | null>(null);
    const [remoteServer, setRemoteServer] = useLocalStorage<ServerInfo>("RemoteServer", {
        host: "",
        port: 0
    });

    useEffect(() => {
        if (selectedDevice) {
            localStorage.setItem('AnovaSelectedDevice', selectedDevice.deviceId);
        }
    }, [selectedDevice]);

    const refreshDevices = useCallback((): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!session?.access_token) {
                setDevices([]);
                setIsLoading(false);
                resolve();
                return;
            }
            setIsLoading(true);
            Client.getUserDevices(session.access_token)
                .then(userDevices => {
                    setDevices(userDevices);
                    setSelectedDevice(currentDevice => {
                        const currentSelectedId = currentDevice?.deviceId;
                        const newSelectionExists = userDevices.some(d => d.id === currentSelectedId);

                        if (userDevices.length > 0) {
                            if (!newSelectionExists) {
                                const storedId = localStorage.getItem('AnovaSelectedDevice');
                                const deviceToSelect = userDevices.find(d => d.id === storedId) || userDevices[0];
                                currentDevice?.stop();
                                return new Device(deviceToSelect.id, session!.access_token);
                            }
                            return currentDevice; // No change
                        }
                        // No devices left
                        currentDevice?.stop();
                        return null;
                    });
                    resolve();
                })
                .catch(err => {
                    console.error(err);
                    reject(err);
                })
                .finally(() => setIsLoading(false));
        });
    }, [session]);

    const unpairDevice = useCallback(async (deviceId: string) => {
        if (!session?.access_token) {
            throw new Error("Not authenticated");
        }
        await Client.unpairDevice(session.access_token, deviceId);
        await refreshDevices();
    }, [session, refreshDevices]);

    useEffect(() => {
        if (!remoteServer.host || !remoteServer.port) {
            Client.getServerInfo().then(setRemoteServer).catch(console.error);
        }
    }, [remoteServer, setRemoteServer]);

    useEffect(() => {
        Client.setBaseUrl("/api");
        refreshDevices();
    }, [session]);

    useEffect(() => {
        if (!selectedDevice) {
            setState(null);
            return;
        }
        selectedDevice.onStateChange(newState => {
            setState(newState);
        });
        setState(selectedDevice.state);

        // No need to return stop, it's handled when the device is changed

    }, [selectedDevice]);

    const selectDevice = useCallback((deviceId: string) => {
        if (session?.access_token) {
            setSelectedDevice(currentDevice => {
                if (currentDevice?.deviceId === deviceId) {
                    return currentDevice;
                }
                currentDevice?.stop();
                return new Device(deviceId, session.access_token);
            });
        }
    }, [session]);

    const value = useMemo(() => ({
        devices,
        selectedDevice,
        selectDevice,
        isLoading,
        state,
        remoteServer,
        refreshDevices,
        unpairDevice
    }), [devices, selectedDevice, selectDevice, isLoading, state, remoteServer, refreshDevices, unpairDevice]);

    return <AnovaContext.Provider value={value}>{children}</AnovaContext.Provider>;
};

// Hook to use the Anova context
export const useAnova = (): AnovaContextType => {
    const context = useContext(AnovaContext);
    if (context === undefined) {
        throw new Error('useAnova must be used within an AnovaProvider');
    }
    return context;
};


// Hook to control cooking
export const useCookingControl = () => {
    const {selectedDevice} = useAnova();

    const startCooking = useCallback(async () => {
        if (selectedDevice) {
            await selectedDevice.startCooking();
        }
    }, [selectedDevice]);

    const stopCooking = useCallback(async () => {
        if (selectedDevice) {
            await selectedDevice.stopCooking();
        }
    }, [selectedDevice]);

    return {startCooking, stopCooking};
};

// Hook to control temperature
export const useTemperatureControl = () => {
    const {selectedDevice} = useAnova();

    const setTargetTemperature = useCallback(async (temperature: number) => {
        if (selectedDevice) {
            await selectedDevice.setTargetTemperature(temperature);
        }
    }, [selectedDevice]);

    const setUnit = useCallback(async (unit: 'c' | 'f') => {
        if (selectedDevice) {
            await selectedDevice.setUnit(unit);
        }
    }, [selectedDevice]);

    return {setTargetTemperature, setUnit};
};

// Hook to control timer
export const useTimerControl = () => {
    const {selectedDevice} = useAnova();

    const setTimer = useCallback(async (minutes: number) => {
        if (selectedDevice) {
            await selectedDevice.setTimer(minutes);
        }
    }, [selectedDevice]);

    const startTimer = useCallback(async () => {
        if (selectedDevice) {
            await selectedDevice.startTimer();
        }
    }, [selectedDevice]);

    const stopTimer = useCallback(async () => {
        if (selectedDevice) {
            await selectedDevice.stopTimer();
        }
    }, [selectedDevice]);

    const clearAlarm = useCallback(async () => {
        if (selectedDevice) {
            await selectedDevice.clearAlarm();
        }
    }, [selectedDevice]);

    return {setTimer, startTimer, stopTimer, clearAlarm};
};