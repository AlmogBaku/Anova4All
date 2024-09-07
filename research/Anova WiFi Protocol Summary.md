# Anova Wi-Fi Protocol Research Summary

## 1. Protocol Overview

The Anova Wi-Fi protocol is used for communication between Anova precision cookers and a control server. It operates over a TCP connection initiated by the device to `pc.anovaculinary.com` on port 8080.

## 2. Connection Establishment

- The Anova device initiates the connection to pc.anovaculinary.com on port 8080.
- A handshake process is performed to establish the session.

## 3. Message Structure

Each message in the protocol consists of:
- Length (1 byte)
- Payload (variable length)
- Checksum (1 byte)

## 4. Encoding Mechanism

- Messages are encoded as hex strings.
- The payload is encoded using a roll shift algorithm:
  ```python
  def roll_shift(byte, n):
      return (byte >> n) | ((byte & ((1 << n) - 1)) << (8 - n))
  ```
- The shift amount is calculated as `(position - 2) % 7` for each byte.

## 5. Handshake Process

1. Device Identification
   - Server: `get id card`
   - Client: Responds with device identifier

2. Version Check
   - Server: `version`
   - Client: Responds with firmware version

3. Device Number
   - Server: `get number`
   - Client: Responds with device number

4. Initial Status Check
   - Server: `status`
   - Client: Responds with current status

5. Initial Settings Query
   - Server sends queries for temperature, unit, timer, and speaker status
   - Client responds to each query

## 6. Heartbeat Mechanism

The server periodically sends a sequence of commands:
1. `status`
2. `read set temp`
3. `read temp`
4. `read unit`
5. `read timer`
6. `speaker status`

This sequence keeps the connection alive and synchronizes device state.

## 7. Command Categories

- Device Information: `get id card`, `version`, `get number`
- Device Status: `status`
- Temperature Control: `read set temp`, `read temp`, `set temp <value>`
- Timer Control: `read timer`, `set timer <value>`, `stop time`
- Device Control: `start`, `stop`
- Alarm Control: `clear alarm`
- Speaker Control: `speaker status`

## 8. Events

The device can send unprompted events:
- `event wifi stop`
- `event ble time stop`

## 9. Observations and Considerations

- The device operates in Celsius.
- It supports both Wi-Fi and Bluetooth Low Energy (BLE) connections.
- There's an alarm system, but only the clear command was observed.
- Some responses, especially to start and stop commands, contain additional data that isn't fully decoded.
- All observed checksums were failing, suggesting a potential issue with the decoding process or a change in the checksum algorithm.

## 10. Areas for Further Investigation

- Correct implementation of the checksum algorithm
- Decoding of complex responses (e.g., to start and stop commands)
- Complete range of possible commands and responses
- Potential security measures (e.g., encryption)
- BLE functionality and its interaction with Wi-Fi control

