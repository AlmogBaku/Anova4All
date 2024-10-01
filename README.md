<h1>
<img src="app/frontend/public/logo.svg" width="20"> Anova for All
</h1>

> Recently, Anova decided to shut down their cloud services for the Anova Precision Cooker Wi-Fi 1 - although the device
> is still fully functional, and still serves its purpose.
>
> That means that while the device is still functional, the app is no longer able to connect to the device.

This project aims to provide a way to control the Anova Precision Cooker Wi-Fi without the need for the Anova app.

It uses the Anova Wi-Fi protocol to communicate with the device directly over the local network.

## Features & Roadmap

- [x] Connect to the Anova Precision Cooker Wi-Fi
- [x] Discover the device on the local network (Bluetooth Low Energy)
- [x] Send commands to the device (Wi-Fi or Bluetooth)
- [x] Configure the device to work with the local server without any DNS patching
- [x] Receive responses from the device
- [x] Control the device settings
- [x] Monitor the device status
- [x] Use the library via a REST API
- [x] Use the library via a Python package
- [x] Implement a web interface

## Installation

1. git clone
2. install [uv](https://docs.astral.sh/uv/) package manager
3. Sync the dependencies with `uv sync`
4. Run the server with `uv run fastapi run`
5. Open the OpenAPI documentation at `http://localhost:8000/docs`

### Building the UI

To build the UI:

1. navigate to the `app/frontend` directory
2. install the dependencies using `yarn install`
3. build the UI using `yarn build --base=/static/`
4. To serve the UI using the FastAPI server, configure the environment variable `FRONTEND_DIST_DIR`
   to `app/frontend/dist/` and run the server.

## Configuration

To use the Anova for All, you need to patch the `anova` package to use the server's IP address instead of the Anova
cloud services.

To do this, assist the `POST /api/ble/config_wifi_server` endpoint.

To revert the changes, use the `POST /api/ble/restore_wifi_server` endpoint.

## Usage

OpenAPI documentation is available at `http://localhost:8000/docs`

## References

Thanks for @TheUbuntuGuy for the initial research on the Anova Wi-Fi protocol:
https://www.youtube.com/watch?v=xDDPFHhY7ec
https://gist.github.com/TheUbuntuGuy/225492a8dec816d49b70d9c21811e8b1