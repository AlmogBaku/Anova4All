import React, {useEffect, useState} from 'react';
import {useAnova} from "../contexts/Anova.tsx";
import {TbBluetooth, TbPassword, TbWifi} from "react-icons/tb";
import {Link, useNavigate} from "react-router-dom";
import {BluetoothClient} from "../client/ble/client.ts";

const DeviceSetup: React.FC = () => {
        const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
        const [client, setClient] = useState<BluetoothClient | null>(null);
        const [idCard, setIDCard] = useState<string | null>(null);
        const [error, setError] = useState<string | null>(null);
        const {configureDevice, remoteServer} = useAnova();

        const [resetSecretKey, setResetSecretKey] = useState<boolean>(true);
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

            await client!.setServerInfo(remoteServer.host, remoteServer.port);
            if (ssid && password) {
                await client!.setWifiCredentials(ssid, password);
            }
            if (resetSecretKey) {
                const characters: string = 'abcdefghijklmnopqrstuvwxyz0123456789';
                const array = new Uint8Array(10);
                crypto.getRandomValues(array);
                const secretKey: string = Array.from(array, byte => characters[byte % characters.length]).join('');

                await client!.setSecretKey(secretKey);
                configureDevice({id: idCard, secretKey});
            } else {
                configureDevice((prev) => ({...prev, id: idCard}));
            }
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
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <h1 className="text-3xl font-bold">Set Up New Device</h1>
                {error && <p className="text-error mb-4">{error}</p>}
                <p>Please make sure your device is powered on and in setup mode</p>

                {!selectedDevice ? <>
                    <button
                        className={`btn btn-primary btn-lg `}
                        onClick={scanForDevice}
                    >
                        <TbBluetooth/> Scan for device
                    </button>
                </> : <div className="w-10/12 flex flex-col gap-4">
                    <div>
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

                    <div tabIndex={0} className="collapse collapse-arrow border-base-300 bg-base-200 border">
                        <input type="checkbox"/>
                        <div className="collapse-title text-xl font-medium">Configure Wifi</div>
                        <div className="collapse-content flex flex-col gap-2">
                            <div className="mb-2">
                                <p>Enter your wifi credentials to connect the device to your network.</p>
                                <p>If credentials are not provided, the device will connect to the previously configured
                                    network.</p>
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
                        </div>
                    </div>

                    <div className="form-control">
                        <label className="label cursor-pointer pb-0">
                            <span className="label-text">Regenerate secret key</span>
                            <input type="checkbox" className="checkbox" checked={resetSecretKey}
                                   onChange={() => setResetSecretKey(!resetSecretKey)}/>
                        </label>
                        <label className="label pt-1">
                            <span className="label-text-alt">
                                <p>Regenerating the secret key will invalidate the previous one and require reconfiguration of the device</p>
                                <p>If you choose not to generate a new secret key, you <strong>must</strong> configure manually on the <Link
                                    to="/settings" className="underline">settings page</Link>.</p>
                            </span>
                        </label>
                    </div>

                    <button
                        className={`btn btn-primary btn-lg ${!selectedDevice ? 'loading' : ''}`}
                        onClick={handleSetup}
                        disabled={!selectedDevice}
                    >
                        <TbWifi/>
                        {!selectedDevice ? 'Scanning...' : "Setup your device"}
                    </button>
                </div>}
            </div>
        );
    }
;

export default DeviceSetup;