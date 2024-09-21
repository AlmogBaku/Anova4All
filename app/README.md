This API provides endpoints for controlling Anova Precision Cooker devices over WiFi.
Using this API, you can start and stop cooking sessions, set the target temperature, and more.

## Setup
To get started, you'll need to setup your device using Bluetooth:
    1. Your device must be connected to the power outlet, and within a close range of your device to be set up
        with Bluetooth. 
    2. Set up a new `secret_key`, using the `POST /api/ble/new_secret_key` endpoint.
    3. Redirect your device to the Anova API server, using the `POST /api/ble/config_wifi_server` endpoint.
    4. Connect your device to the WiFi network, using the `POST /api/ble/connect_wifi` endpoint.
    
## Authentication
Most endpoints require authentication using a `secret_key`. You can provide the `secret_key` as a query parameter
or as a Bearer token in the `Authorization` header.

To obtain a `secret_key`, you can use the `POST /api/ble/new_secret_key` endpoint. Notice that the `secret_key` should be
kept secret, and cannot be retrieved from the device once set.

## Server-Sent Events
The Anova API provides a server-sent event stream, which can be used to monitor device state changes and events.
To subscribe to the event stream, you can use the `/api/devices/{device_id}/sse` endpoint.