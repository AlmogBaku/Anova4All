# Anova for All

> Recently, Anova decided to shut down their cloud services for the Anova Precision Cooker Wi-Fi 1 - although the device
is still fully functional, and still serves its purpose.
> 
> That means that while the device is still functional, the app is no longer able to connect to the device.

This project aims to provide a way to control the Anova Precision Cooker Wi-Fi without the need for the Anova app.

It uses the Anova Wi-Fi protocol to communicate with the device directly over the local network.

## Features & Roadmap

- [x] Connect to the Anova Precision Cooker Wi-Fi
- [x] Send commands to the device
- [x] Receive responses from the device
- [x] Control the device settings
- [x] Monitor the device status
- [ ] Implement a web interface

## Installation

1. git clone
2. install poetry (https://python-poetry.org/docs/)
3. `poetry install`
4. configure your router to resolve `pc.anovaculinary.com` to the server running this app
5. run the app with `poetry run python -m main`

## Usage

OpenAPI documentation is available at `http://localhost:8000/docs`

## References

Thanks for @TheUbuntuGuy for the initial research on the Anova Wi-Fi protocol:
https://www.youtube.com/watch?v=xDDPFHhY7ec
https://gist.github.com/TheUbuntuGuy/225492a8dec816d49b70d9c21811e8b1