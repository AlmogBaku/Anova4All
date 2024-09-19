# Anova Wi-Fi Library Design Document

## 1. Overview

This document outlines the design for an asynchronous Python library to interact with Anova precision cookers using the
Anova Wi-Fi protocol. The library will use asyncio for asynchronous operations and Pydantic for data validation and
settings management.

## 2. Design Principles

- Asynchronous: Utilize asyncio for non-blocking I/O operations.
- Modular: Separate concerns into distinct modules for easier maintenance and extensibility.
- Type-safe: Use type hints throughout and Pydantic for data modeling.
- Idiomatic: Follow Python best practices and make use of asyncio, Pydantic, and anyio/asyncer.
- Robust: Implement comprehensive error handling and logging.

## 3. Architecture

### 3.1 Low-Level Layer

#### 3.1.1 Server Module

- **AsyncTCPServer**
    - `start(): Coroutine[None]`
    - `stop(): Coroutine[None]`
    - `on_connection(callback: Callable[[AsyncAnovaConnection], Coroutine[None]]): None`

#### 3.1.2 Communication Module

- **AsyncEncoder**
    - `encode(message: str) -> Coroutine[bytes]`

- **AsyncDecoder**
    - `decode(data: bytes) -> Coroutine[str]`

- **Checksum**
    - `calculate(data: bytes) -> int`
    - `verify(data: bytes, checksum: int) -> bool`

#### 3.1.3 Connection Module

- **AsyncAnovaConnection**
    - `send(message: str) -> Coroutine[None]`
    - `receive() -> Coroutine[str]`
    - `close() -> Coroutine[None]`

### 3.2 High-Level Layer

#### 3.2.1 Commands Module

- **AsyncCommandBase** (ABC)
    - `execute() -> Coroutine[str]`

- Concrete command classes (e.g., `AsyncStatusCommand`, `AsyncSetTempCommand`)

#### 3.2.2 Responses Module

- **AsyncResponseBase** (ABC)
    - `parse(data: str) -> Coroutine[Any]`

- Concrete response classes (e.g., `AsyncStatusResponse`, `AsyncTemperatureResponse`)

### 3.3 Management Layer

#### 3.3.1 Device Module

- **AsyncAnovaDevice**
    - `send_command(command: AsyncCommandBase) -> Coroutine[AsyncResponseBase]`
    - `get_state() -> Coroutine[DeviceState]`
    - `on_state_change(callback: Callable[[DeviceState], Coroutine[None]]): None`

#### 3.3.2 Session Module

- **AsyncDeviceSession**
    - `start() -> Coroutine[None]`
    - `stop() -> Coroutine[None]`
    - `get_device() -> AsyncAnovaDevice`

#### 3.3.3 Manager Module

- **AsyncAnovaManager**
    - `start() -> Coroutine[None]`
    - `stop() -> Coroutine[None]`
    - `get_devices() -> List[AsyncAnovaDevice]`
    - `on_device_connected(callback: Callable[[AsyncAnovaDevice], Coroutine[None]]): None`
    - `on_device_disconnected(callback: Callable[[AsyncAnovaDevice], Coroutine[None]]): None`

### 3.4 Utility Modules

#### 3.4.1 Heartbeat Module

- **AsyncHeartbeat**
    - `start(device: AsyncAnovaDevice) -> Coroutine[None]`
    - `stop() -> Coroutine[None]`

#### 3.4.2 State Module

- **DeviceState** (Pydantic BaseModel)
    - Fields for device status, temperature, timer, etc.

#### 3.4.3 Graceful Shutdown Module

- **GracefulShutdown**
    - `register(coro: Coroutine): None`
    - `shutdown() -> Coroutine[None]`

### 3.5 Main Application Runner

- **AnovaAppRunner**
    - `run(manager: AsyncAnovaManager) -> Coroutine[None]`
    - `stop() -> Coroutine[None]`

## 4. Key Components Implementation

### 4.1 Anova-Specific Decoder

- Implement a custom decoder for the Anova Wi-Fi protocol that can handle the specific message format and checksum
  calculation.

## 5. Error Handling and Logging

- Implement comprehensive error handling for network operations, decoding/encoding, and command execution.
- Use structured logging throughout the library for easier debugging and monitoring.
- Implement custom exception classes for specific error scenarios.
- use logrus

