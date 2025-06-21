# Store Integration Plan for Anova4All (Backend Focus)

## 1. Overview

This document outlines the backend integration plan for device management with Anova4All, focusing exclusively on:

- User authentication with JWT validation
- Device pairing system
- Online status tracking
- API endpoints for device management
- Row Level Security policies

## 2. Database Schema

```sql
-- Devices table for pairing
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_card TEXT NOT NULL UNIQUE,
  secret_key TEXT NOT NULL,
  name TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(id_card, secret_key)
);

-- Enable RLS
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY devices_select_policy ON devices 
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY devices_update_policy ON devices 
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY devices_delete_policy ON devices 
  FOR DELETE USING (user_id = auth.uid());

-- Allow initial device registration without user association
CREATE POLICY devices_insert_policy ON devices 
  FOR INSERT WITH CHECK (true);
```

## 3. Backend Components

### 3.1 Store Package

```go
// internal/store/models.go
package store

import (
    "time"
)

// DevicePairing represents the stored data for a device.
// It is the canonical representation for device information within the store.
// Other backend components should prefer using this struct or references to it,
// rather than passing IDCard, SecretKey, etc., as loose parameters.
type DevicePairing struct {
    ID        string     `json:"id"`
    IDCard    string     `json:"id_card"`    // References the wifi.AnovaDevice.IDCard()
    SecretKey string     `json:"secret_key"` // References the wifi.AnovaDevice.SecretKey()
    Name      string     `json:"name"`       // User-friendly name for the device
    UserID    *string    `json:"user_id"`    // Nullable - can be orphaned
    CreatedAt time.Time  `json:"created_at"`
}

type User struct {
    ID    string `json:"id"`
    Email string `json:"email"`
}
```

```go
// internal/store/store.go
package store

import (
    "anova4all/pkg/wifi"
    "context"
    "github.com/golang-jwt/jwt/v4"
    "net/http"
    "time"
)

// Store defines the interface for managing device and user data.
// It handles interactions with the persistence layer and provides
// core functionalities like device registration, pairing, and ownership verification.
type Store interface {
    // RegisterDevice registers a device, typically when it first connects.
    // It stores the device's IDCard and SecretKey.
    RegisterDevice(ctx context.Context, idCard, secretKey string) error

    // GetDeviceByCredentials retrieves a device's pairing information using its IDCard and SecretKey.
    // This is used to verify a device's identity before operations like pairing.
    GetDeviceByCredentials(ctx context.Context, idCard, secretKey string) (*DevicePairing, error)

    // AssociateDeviceWithUser links a registered device to a user account.
    // This function updates the device's UserID.
    AssociateDeviceWithUser(ctx context.Context, deviceID, userID string) error

    // GetUserDevices retrieves all devices associated with a specific user.
    GetUserDevices(ctx context.Context, userID string) ([]*DevicePairing, error)

    // IsDeviceOwnedByUser checks if a given device is owned by the specified user.
    IsDeviceOwnedByUser(ctx context.Context, deviceID, userID string) (bool, error)

    // VerifyToken validates a JWT and returns the claims if the token is valid.
    VerifyToken(tokenString string) (jwt.MapClaims, error)

    // JWTAuthMiddleware returns a Gin middleware handler for JWT authentication.
    JWTAuthMiddleware() gin.HandlerFunc

    // DeviceOwnershipMiddleware returns a Gin middleware handler to verify device ownership.
    // It also checks if the device is online via the wifiManager.
    DeviceOwnershipMiddleware() gin.HandlerFunc
}

// storeImpl implements the Store interface.
type storeImpl struct {
    httpClient  *http.Client
    apiURL      string
    apiKey      string
    jwtSecret   string
    wifiManager wifi.AnovaManager
}

// NewStore creates a new instance of the Store implementation.
func NewStore(apiURL, apiKey, jwtSecret string, wifiManager wifi.AnovaManager) Store {
    sImpl := &storeImpl{
        httpClient:  &http.Client{Timeout: 10 * time.Second},
        apiURL:      apiURL,
        apiKey:      apiKey,
        jwtSecret:   jwtSecret,
        wifiManager: wifiManager,
    }
    
    // Set up callbacks to track device connections/disconnections
    wifiManager.OnDeviceConnected(sImpl.handleDeviceConnected)
    wifiManager.OnDeviceDisconnected("*", sImpl.handleDeviceDisconnected)
    
    return sImpl
}

// Callback when a new device connects
func (s *storeImpl) handleDeviceConnected(ctx context.Context, device wifi.AnovaDevice) {
    // Register device in database if it doesn't exist
    _ = s.RegisterDevice(ctx, device.IDCard(), device.SecretKey())
}

// Callback when a device disconnects
func (s *storeImpl) handleDeviceDisconnected(ctx context.Context, deviceID string) {
    // Update device status or handle cleanup as needed
}

// Core functions to implement (as part of the Store interface):
// func (s *storeImpl) RegisterDevice(ctx context.Context, idCard, secretKey string) error { /* ... */ }
// func (s *storeImpl) GetDeviceByCredentials(ctx context.Context, idCard, secretKey string) (*DevicePairing, error) { /* ... */ }
// func (s *storeImpl) AssociateDeviceWithUser(ctx context.Context, deviceID, userID string) error { /* ... */ }
// func (s *storeImpl) GetUserDevices(ctx context.Context, userID string) ([]*DevicePairing, error) { /* ... */ }
// func (s *storeImpl) IsDeviceOwnedByUser(ctx context.Context, deviceID, userID string) (bool, error) { /* ... */ }
// func (s *storeImpl) VerifyToken(tokenString string) (jwt.MapClaims, error) { /* ... */ }
```

```go
// internal/store/middleware.go
package store

import (
    "net/http"
    "strings"
    "github.com/gin-gonic/gin"
)

// JWTAuthMiddleware validates JWT tokens in the Authorization header
// This method is part of storeImpl which implements the Store interface.
func (s *storeImpl) JWTAuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        if token == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "No authorization token provided"})
            return
        }
        
        token = strings.TrimPrefix(token, "Bearer ")
        
        claims, err := s.VerifyToken(token) // s is *storeImpl, VerifyToken is a method on it
        if err != nil {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
            return
        }
        
        userID, ok := claims["sub"].(string)
        if !ok {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID"})
            return
        }
        
        c.Set("user_id", userID)
        c.Next()
    }
}

// DeviceOwnershipMiddleware verifies the user owns the requested device
// This method is part of storeImpl which implements the Store interface.
func (s *storeImpl) DeviceOwnershipMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        userID := c.GetString("user_id")
        deviceID := c.Param("device_id")
        
        isOwner, err := s.IsDeviceOwnedByUser(c, deviceID, userID) // s is *storeImpl
        if err != nil || !isOwner {
            c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Access denied to this device"})
            return
        }
        
        // Check device online status directly via wifi manager
        device := s.wifiManager.Device(deviceID)
        if device == nil {
            c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "Device is offline"})
            return
        }
        
        c.Set("device", device)
        c.Next()
    }
}
```

### 3.2 Authentication Middleware

### 4. New API Endpoints

### 4.1 Device Pairing API

```go
// internal/rest/store.go
package rest

import (
    "net/http"
    "github.com/gin-gonic/gin"
)

// POST /api/devices/pair
func (s *svc) pairDevice(c *gin.Context) {
    userID := c.GetString("user_id")
    
    var req struct {
        IDCard    string `json:"id_card" binding:"required"`
        SecretKey string `json:"secret_key" binding:"required"`
        Name      string `json:"name" binding:"required"`
    }
    
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    // Verify device credentials
    pairing, err := s.storeManager.GetDeviceByCredentials(c, req.IDCard, req.SecretKey)
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "Device not found or credentials invalid"})
        return
    }
    
    // Check if already paired with another user
    if pairing.UserID != nil && *pairing.UserID != userID {
        c.JSON(http.StatusConflict, gin.H{"error": "Device already paired with another account"})
        return
    }
    
    // Associate device with user
    err = s.storeManager.AssociateDeviceWithUser(c, pairing.ID, userID, req.Name)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to pair device"})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{"message": "Device paired successfully"})
}
```

### 4.2 User's Devices API with Online Status

```go
// GET /api/user/devices
func (s *svc) getUserDevices(c *gin.Context) {
    userID := c.GetString("user_id")
    
    // Get user's device pairings from the store
    pairings, err := s.storeManager.GetUserDevices(c, userID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve devices"})
        return
    }
    
    // Add online status for each device by checking directly with wifi manager
    var response []map[string]interface{}
    for _, pairing := range pairings {
        // Check online status with AnovaManager via callback
        isOnline := s.manager.Device(pairing.IDCard) != nil
        
        // If online, we can get additional device details from wifi.AnovaDevice
        var version string
        if isOnline {
            device := s.manager.Device(pairing.IDCard)
            version = device.Version()
        }
        
        deviceInfo := map[string]interface{}{
            "id":        pairing.ID,
            "id_card":   pairing.IDCard,
            "name":      pairing.Name,
            "is_online": isOnline,
            "version":   version,
        }
        response = append(response, deviceInfo)
    }
    
    c.JSON(http.StatusOK, response)
}
```

## 5. Integration with Existing Routes

Update `internal/rest/service.go` to include the store manager:

```go
type svc struct {
    *gin.Engine
    manager      wifi.AnovaManager
    adminUsername string
    adminPassword string
    sse          *SSEManager
    logger       *zap.SugaredLogger
    storeManager store.Store
}

func NewService(manager wifi.AnovaManager, adminUsername, adminPassword, 
                frontEndDistDir string, storeManager store.Store, 
                logger *zap.Logger) (Service, error) {
    // Existing initialization...
    
    s := &svc{
        Engine:        gin.New(),
        manager:       manager,
        sse:           NewSSEManager(manager),
        adminUsername: adminUsername,
        adminPassword: adminPassword,
        storeManager:  storeManager,
        logger:        logger.Sugar(),
    }
    
    // Existing setup...
    
    // Add store protected routes
    storeProtectedRoutes := s.Group("/api")
    storeProtectedRoutes.Use(s.storeManager.JWTAuthMiddleware())
    {
        storeProtectedRoutes.POST("/devices/pair", s.pairDevice)
        storeProtectedRoutes.GET("/user/devices", s.getUserDevices)
        
        // Device-specific routes with ownership verification
        deviceRoutes := storeProtectedRoutes.Group("/user/devices/:device_id")
        deviceRoutes.Use(s.storeManager.DeviceOwnershipMiddleware())
        {
            // All existing device routes with ownership verification
            deviceRoutes.GET("/state", s.getDeviceState)
            deviceRoutes.POST("/target_temperature", s.setTemperature)
            // ... other existing device routes
        }
    }
    
    return s, nil
}
```

## 6. Configuration Updates

Update `cmd/anova4all/main.go` to initialize the store manager:

```go
func main() {
    cfg := loadConfig()
    
    // Existing logger setup...
    
    // Existing manager setup...
    
    // Initialize store manager with wifi manager for callbacks
    storeManager := store.NewStore(
        cfg.GetString("store_url"),
        cfg.GetString("store_key"),
        cfg.GetString("jwt_secret"),
        manager,
    )
    
    service, err := rest.NewService(
        manager,
        cfg.GetString("admin_username"),
        cfg.GetString("admin_password"),
        cfg.GetString("frontend_dist_dir"),
        storeManager,
        logger,
    )
    
    // Existing server setup...
}

func loadConfig() *viper.Viper {
    v := viper.New()
    // Existing config...
    
    // Add store configs
    v.SetDefault("store_url", "")
    v.SetDefault("store_key", "")
    v.SetDefault("jwt_secret", "")
    
    return v
}
```

## 7. Implementation Strategy

### Phase 1: Initial Setup
- Create database schema with device_pairings table and RLS policies
- Create internal store package with lightweight pairing model and manager

### Phase 2: Authentication Integration
- Implement JWT verification in store middleware
- Add authentication middleware
- Test token validation

### Phase 3: Device Registration & Callbacks
- Implement device connection/disconnection callbacks
- Add device registration on connection
- Implement device ownership verification

### Phase 4: API Enhancement
- Add device pairing API
- Add user's devices API with online status
- Integrate with existing endpoints

### Phase 5: Testing & Optimization
- End-to-end testing of device pairing flow
- Verify ownership verification works correctly
- Optimize database queries and callbacks
