import React from 'react';
import {useAnova, useTemperatureControl} from "../contexts/Anova.tsx";
import {TemperatureUnit} from "../client";

const Settings: React.FC = () => {
    const {
        remoteServer,
        deviceCreds,
        configureDevice,
        configureRemoteServer,
        isConfigured,
        state: anovaState,
        apiURL,
        setApiURL,
    } = useAnova();
    const tempCtrl = useTemperatureControl();

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Settings</h1>

            <div className="bg-base-100 shadow-xl rounded-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-2">General Settings</h2>
                <p className="text-gray-600">General settings for the app</p>


                <div className="justify-between shadow-xl rounded-lg p-6 mb-6 mt-3">
                    <h3 className="text-lg font-semibold mb-2">API Server</h3>
                    <label className="form-control w-full max-w-xs">
                        <div className="label">
                            <span className="label-text">Host</span>
                        </div>
                        <input type="text" placeholder="API Base URL" className="input input-bordered w-full max-w-xs"
                               value={apiURL} onChange={(e) => setApiURL(e.target.value)}/>
                    </label>
                </div>
                <div className="justify-between shadow-xl rounded-lg p-6 mb-6 mt-3">
                    <h3 className="text-lg font-semibold mb-2">Remote Server</h3>
                    <label className="form-control w-full max-w-xs">
                        <div className="label">
                            <span className="label-text">Host</span>
                        </div>
                        <input type="text" placeholder="Remote host" className="input input-bordered w-full max-w-xs"
                               value={remoteServer.host} onChange={(e) => configureRemoteServer((prev) => {
                            return {
                                host: e.target.value,
                                port: prev.port
                            }
                        })}/>
                        <div className="label">
                            <span className="label-text-alt">The remote host to connect to</span>
                        </div>
                    </label>
                    <label className="form-control w-full max-w-xs">
                        <div className="label">
                            <span className="label-text">Port</span>
                        </div>
                        <input type="number" placeholder="Remote port" className="input input-bordered w-full max-w-xs"
                               value={remoteServer.port} onChange={(e) => configureRemoteServer(
                            (prev) => {
                                return {
                                    host: prev.host,
                                    port: parseInt(e.target.value),
                                }
                            })}/>
                        <div className="label">
                            <span className="label-text-alt">The remote port to connect to</span>
                        </div>
                    </label>
                </div>

                <div className="justify-between shadow-xl rounded-lg p-6 mb-6 mt-3">
                    <h3 className="text-lg font-semibold mb-2">Device credentials</h3>
                    <label className="form-control w-full max-w-xs">
                        <div className="label">
                            <span className="label-text">Device ID</span>
                        </div>
                        <input type="text" placeholder="Device ID" className="input input-bordered w-full max-w-xs"
                               value={deviceCreds?.id} onChange={(e) => configureDevice((prev) => {
                            return {
                                id: e.target.value,
                                secretKey: prev.secretKey
                            }
                        })}/>
                        <div className="label">
                            <span className="label-text-alt">The remote host to connect to</span>
                        </div>
                    </label>
                    <label className="form-control w-full max-w-xs">
                        <div className="label">
                            <span className="label-text">Secret Key</span>
                        </div>
                        <input type="text" placeholder="Secret Key" className="input input-bordered w-full max-w-xs"
                               value={deviceCreds?.secretKey}
                               onChange={(e) => configureDevice((prev) => {
                                   return {
                                       id: prev.id,
                                       secretKey: e.target.value
                                   }
                               })}/>
                        <div className="label">
                            <span className="label-text-alt">The remote port to connect to</span>
                        </div>
                    </label>
                </div>
            </div>

            {isConfigured && anovaState && (
                <div className="bg-base-100 shadow-xl rounded-lg p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-2">Device Settings</h2>
                    <p className="text-gray-600">Settings for the connected device</p>


                    <label className="form-control w-full max-w-xs">
                        <div className="label">
                            <span className="label-text">Temperature Unit</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="label-text-alt">Fahrenheit</span>
                            <input type="checkbox" className="toggle"
                                   checked={anovaState.unit == TemperatureUnit.Celsius}
                                   onChange={(e) => tempCtrl.setUnit(e.target.checked ? 'c' : 'f')}
                            />
                            <span className="label-text-alt">Celsius</span>
                        </div>
                    </label>
                </div>

            )}
        </div>
    );
};

export default Settings;