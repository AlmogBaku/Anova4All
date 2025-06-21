# Anova4All TypeScript SDK Documentation

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Client Class](#client-class)
4. [Device Class](#device-class)
5. [Models](#models)
6. [Error Handling](#error-handling)
7. [Server-Sent Events](#server-sent-events)
8. [Examples](#examples)

## Introduction

The Anova4All TypeScript SDK provides a convenient way to interact with the Anova4All REST API, allowing you to control
Anova Precision Cooker devices over WiFi. This SDK enables you to perform various operations such as starting and
stopping cooking sessions, setting target temperatures, and monitoring device states.

## Getting Started

To use the SDK, first import the necessary classes and interfaces:

```typescript
import {Client, Device, DeviceInfo, TemperatureUnit} from 'client';
```

## Client Class

The `Client` class provides static methods to interact with the Anova4All API directly.

### Key Methods:

- `setBaseUrl(url: string)`: Set the base URL for API requests.
- `getServerInfo(): Promise<{ server: string, port: number }>`: Get the current Anova4All device server configuration.
- `getDevices(): Promise<DeviceInfo[]>`: Retrieve a list of available devices.
- `getDeviceState(deviceId: string, secretKey: string): Promise<DeviceState>`: Get the current state of a device.
- `setTargetTemperature(deviceId: string, secretKey: string, temperature: number): Promise<{ changed_to: number }>`: Set
  the target temperature for a device.
- `startCooking(deviceId: string, secretKey: string): Promise<string>`: Start a cooking session.
- `stopCooking(deviceId: string, secretKey: string): Promise<string>`: Stop a cooking session.
- `SubscribeToSSE(device_id: string, secretKey: string): AsyncGenerator<SSEEvent>`: Subscribe to Server-Sent Events for
  a device.

## Device Class

The `Device` class provides an interface to interact with a specific Anova Precision Cooker device **over WiFi**.
It seamlessly handles authentication, allow you to perform device operations, and keep an up-to-date state of the
device using Server-Sent Events.

### Constructor:

The `Device` class constructor requires the `deviceId` and `secretKey` of the device:

```typescript
const device = new Device('your-device-id', 'your-secret-key');
```

### Key Methods:

- `getDeviceState(): Promise<DeviceState>`: Get the current state of the device.
- `setTargetTemperature(temperature: number): Promise<{ changed_to: number }>`: Set the target temperature.
- `startCooking(): Promise<string>`: Start a cooking session.
- `stopCooking(): Promise<string>`: Stop a cooking session.
- `setTimer(minutes: number): Promise<void>`: Set the cooking timer.
- `setUnit(unit: 'c' | 'f'): Promise<string>`: Set the temperature unit.
- `onStateChanged(callback: (state: DeviceState) => void): void`: Subscribe to device state changes.

## Models

The SDK includes several interfaces and enums to represent various data structures:

- `DeviceInfo`: Basic information about a device.
- `DeviceState`: The current state of a device.
- `TemperatureUnit`: Enum for temperature units (Celsius or Fahrenheit).
- `SSEEvent`: Represents a Server-Sent Event.
- `BLEDevice`: Represents a Bluetooth Low Energy device.
- `BLEDeviceInfo`: Detailed information about a BLE device.

## Error Handling

The SDK uses a custom `Anova4AllError` class for error handling:

```typescript
class Anova4AllError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'Anova4AllError';
    }
}
```

## Server-Sent Events

The SDK supports Server-Sent Events (SSE) for real-time updates:

```typescript
for await (const event of Client.SubscribeToSSE(deviceId, secretKey)) {
    console.log('Received SSE event:', event);
}
```

## Examples

### Setting up a device using Bluetooth:

```typescript
// 1. Set up a new secret key
const newSecretResponse = await Client.ble_setNewSecretKey();
const secretKey = newSecretResponse.secret_key;

// 2. Configure WiFi server
await Client.ble_configureWiFiServer('api.anova4all.com', 443);

// 3. Connect to WiFi
await Client.ble_connectToWiFi('YourWiFiSSID', 'YourWiFiPassword');
```

### Controlling a device:

```typescript
const device = new Device('your-device-id', 'your-secret-key');

// Start cooking
await device.startCooking();

// Set target temperature to 60°C
await device.setTargetTemperature(60);

// Set timer for 2 hours
await device.setTimer(120);

// Monitor device state
for await (const event of Client.SubscribeToSSE(device.deviceId, 'your-secret-key')) {
    if (event.event_type === SSEventType.StateChanged) {
        console.log('Device state changed:', event.payload);
    }
}
```

This documentation provides an overview of the Anova4All TypeScript SDK, including its main classes, methods, and usage
examples. For more detailed information on specific methods and their parameters, refer to the inline documentation in
the source code.