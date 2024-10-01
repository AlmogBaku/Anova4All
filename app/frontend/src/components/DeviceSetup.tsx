import React, {useEffect, useState} from 'react';
import {useAnova} from "../contexts/Anova.tsx";
import {TbBluetooth, TbPassword, TbWifi} from "react-icons/tb";
import {useNavigate} from "react-router-dom";
import {BluetoothClient} from "../client/ble/client.ts";

const DeviceSetup: React.FC = () => {
        const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
        const [client, setClient] = useState<BluetoothClient | null>(null);
        const [idCard, setIDCard] = useState<string | null>(null);
        const [error, setError] = useState<string | null>(null);
        const {configureDevice, remoteServer} = useAnova();

        const [ssid, setSSID] = useState<string>('');
        const [password, setPassword] = useState<string>('');

        const navigate = useNavigate();


        const scanForDevice = async () => {
            try {
                setError(null);
                setSelectedDevice(null);
                const dev = await BluetoothClient.scan();
                setSelectedDevice(dev);
            } catch (e: unknown) {
                console.error('Error scanning for device:', e);
                setError('Error scanning for device');
                return;
            }
        }

        const handleSetup = async () => {
            setError(null);
            if (!selectedDevice) {
                setError('No device selected');
                return;
            }
            if (idCard === null) {
                setError('Error getting device info');
                return;
            }
            if (!client) {
                setError('Error connecting to device');
                return;
            }

            const characters: string = 'abcdefghijklmnopqrstuvwxyz0123456789';
            const array = new Uint8Array(10);
            crypto.getRandomValues(array);
            const secretKey: string = Array.from(array, byte => characters[byte % characters.length]).join('');

            await client!.setServerInfo(remoteServer.host, remoteServer.port);
            if (ssid && password) {
                await client!.setWifiCredentials(ssid, password);
            }
            await client!.setSecretKey(secretKey);
            configureDevice({id: idCard, secretKey});
            navigate('/');
        };

        useEffect(() => {
            if (!selectedDevice) return;
            const getInfo = async () => {
                try {
                    const cli = new BluetoothClient(selectedDevice!)
                    setClient(cli);
                    await cli.connect();
                    setIDCard(cli.idCard);
                } catch (e: unknown) {
                    console.error('Error getting device info:', e);
                    setError('Error getting device info');
                }
            }
            getInfo();
        }, [selectedDevice]);


        return (
            <div className="flex flex-col items-center justify-center min-h-screen">
                <h1 className="text-3xl font-bold mb-6">Set Up New Device</h1>
                {error && <p className="text-error mb-4">{error}</p>}
                <p className="mb-4">Please make sure your device is powered on and in setup mode</p>

                {!selectedDevice ? <>
                    <button
                        className={`btn btn-primary btn-lg `}
                        onClick={scanForDevice}
                    >
                        <TbBluetooth/> Scan for device
                    </button>
                </> : <>
                    <div className={`mb-4`}>
                        <p>Found device: {selectedDevice.name}</p>
                        {idCard && <p>ID Card: {idCard}</p>}
                        <button
                            className={`btn btn-sm btn-secondary`}
                            onClick={() => scanForDevice()}
                        >
                            <TbBluetooth/>
                            Rescan
                        </button>
                    </div>

                    <label className="input input-bordered flex items-center gap-2">
                        <TbWifi/>
                        <input type="text" className="grow" placeholder="SSID" value={ssid}
                               onChange={(e) => setSSID(e.target.value)}/>
                    </label>

                    <label className="input input-bordered flex items-center gap-2">
                        <TbPassword/>
                        <input type="password" className="grow" placeholder="Password" value={password}
                               onChange={(e) => setPassword(e.target.value)}/>
                    </label>

                    <button
                        className={`btn btn-primary btn-lg ${!selectedDevice ? 'loading' : ''}`}
                        onClick={handleSetup}
                        disabled={!selectedDevice}
                    >
                        <TbWifi/>
                        {!selectedDevice ? 'Scanning...' : "Setup your device"}
                    </button>
                </>}
            </div>
        );
    }
;

export default DeviceSetup;