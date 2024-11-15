import React, {
    createContext,
    Dispatch,
    SetStateAction,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState
} from 'react';
import {Client, Device, ServerInfo} from '../client';

import {State} from "../client/device.ts";
import {useLocalStorage} from "../hooks/LocalStorage.ts";


// Context for the Anova device
interface AnovaContextType {
    device: Device | null;
    deviceCreds: DeviceCredentials;
    configureDevice: Dispatch<SetStateAction<DeviceCredentials>>
    remoteServer: ServerInfo;
    configureRemoteServer: Dispatch<SetStateAction<ServerInfo>>
    state: State | null;
    apiURL: string;
    setApiURL: Dispatch<SetStateAction<string>>;
    isConfigured: boolean;
}

interface DeviceCredentials {
    id: string;
    secretKey: string;
}

const AnovaContext = createContext<AnovaContextType>({} as AnovaContextType);

// Provider component
export const AnovaProvider: React.FC<React.PropsWithChildren> = ({children}) => {
    const [deviceCreds, setDeviceCreds] = useLocalStorage<DeviceCredentials>("AnovaDevice", {id: "", secretKey: ""});
    const [device, setDevice] = useState<Device | null>(null);
    const [apiURL, setApiURL] = useLocalStorage<string>("API_URL", "/api");
    const [remoteServer, setRemoteServer] = useLocalStorage<ServerInfo>("RemoteServer", {
        host: "",
        port: 0
    });

    useEffect(() => {
        if (!apiURL) {
            return
        }
        Client.setBaseUrl(apiURL);
    }, [apiURL]);

    useEffect(() => {

        if (!remoteServer.host || remoteServer.port === 0 || !remoteServer.port) {
            Client.getServerInfo().then((serverInfo) => {
                setRemoteServer(serverInfo);
            })
        }
    }, [remoteServer, setRemoteServer]);


    const [state, setState] = useState<State | null>(device?.state || null);

    useEffect(() => {
        if (!device) return;
        device.onStateChange((newState) => {
            setState(newState);
        });

    }, [device, setState]);

    useEffect(() => {
        if (!deviceCreds) {
            return
        }
        if (deviceCreds.id === "" || deviceCreds.secretKey === "") {
            return
        }
        const dev = new Device(deviceCreds.id, deviceCreds.secretKey);
        setDevice((prev) => {
            if (prev) {
                prev.stop();
            }
            return dev
        });

        return () => {
            dev.stop();
        }
    }, [deviceCreds, setDevice]);

    const value = useMemo(() => ({
        device,
        deviceCreds: deviceCreds,
        configureDevice: setDeviceCreds,
        isConfigured: !!device,
        remoteServer,
        apiURL,
        setApiURL,
        configureRemoteServer: setRemoteServer,
        state
    }), [apiURL, setApiURL, state, device, deviceCreds, setDeviceCreds, remoteServer, setRemoteServer]);

    return <AnovaContext.Provider value={value}>{children}</AnovaContext.Provider>;
};

// Hook to use the Anova context
export const useAnova = (): AnovaContextType => {
    const context: AnovaContextType = useContext<AnovaContextType>(AnovaContext);
    if (context === undefined) {
        throw new Error('useAnova must be used within an AnovaProvider');
    }
    return context;
};


// Hook to control cooking
export const useCookingControl = () => {
    const {device} = useAnova();

    const startCooking = useCallback(async () => {
        if (device) {
            await device.startCooking();
        }
    }, [device]);

    const stopCooking = useCallback(async () => {
        if (device) {
            await device.stopCooking();
        }
    }, [device]);

    return {startCooking, stopCooking};
};

// Hook to control temperature
export const useTemperatureControl = () => {
    const {device} = useAnova();

    const setTargetTemperature = useCallback(async (temperature: number) => {
        if (device) {
            await device.setTargetTemperature(temperature);
        }
    }, [device]);

    const setUnit = useCallback(async (unit: 'c' | 'f') => {
        if (device) {
            await device.setUnit(unit);
        }
    }, [device]);

    return {setTargetTemperature, setUnit};
};

// Hook to control timer
export const useTimerControl = () => {
    const {device} = useAnova();

    const setTimer = useCallback(async (minutes: number) => {
        if (device) {
            await device.setTimer(minutes);
        }
    }, [device]);

    const startTimer = useCallback(async () => {
        if (device) {
            await device.startTimer();
        }
    }, [device]);

    const stopTimer = useCallback(async () => {
        if (device) {
            await device.stopTimer();
        }
    }, [device]);

    const clearAlarm = useCallback(async () => {
        if (device) {
            await device.clearAlarm();
        }
    }, [device]);

    return {setTimer, startTimer, stopTimer, clearAlarm};
};


// // Example usage:
// const ExampleComponent: React.FC = () => {
//   const { device, configureDevice, isConfigured } = useAnova();
//   const state = useAnovaState();
//   const { startCooking, stopCooking } = useCookingControl();
//   const { setTargetTemperature, setUnit } = useTemperatureControl();
//   const { setTimer, startTimer, stopTimer } = useTimerControl();
//   const availableDevices = useAvailableDevices();
//
//   if (!isConfigured) {
//     return (
//       <div>
//         <h2>Available Devices:</h2>
//         <ul>
//           {availableDevices.map((device) => (
//             <li key={device.id}>
//               {device.id} - {device.version}
//               <button onClick={() => configureDevice(device.id, 'your-secret-key')}>
//                 Configure
//               </button>
//             </li>
//           ))}
//         </ul>
//       </div>
//     );
//   }
//
//   return (
//     <div>
//       <h2>Device State:</h2>
//       <pre>{JSON.stringify(state, null, 2)}</pre>
//       <button onClick={startCooking}>Start Cooking</button>
//       <button onClick={stopCooking}>Stop Cooking</button>
//       <input
//         type="number"
//         onChange={(e) => setTargetTemperature(Number(e.target.value))}
//         placeholder="Set target temperature"
//       />
//       <select onChange={(e) => setUnit(e.target.value as 'c' | 'f')}>
//         <option value="c">Celsius</option>
//         <option value="f">Fahrenheit</option>
//       </select>
//       <input
//         type="number"
//         onChange={(e) => setTimer(Number(e.target.value))}
//         placeholder="Set timer (minutes)"
//       />
//       <button onClick={startTimer}>Start Timer</button>
//       <button onClick={stopTimer}>Stop Timer</button>
//     </div>
//   );
// };