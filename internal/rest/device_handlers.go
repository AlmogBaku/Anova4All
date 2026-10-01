package rest

import (
	"net/http"
	"strings"
	"time"

	"anova4all/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// DeviceResponse is the model for a device returned by the API.
// It includes the online status, which is not stored in the database.
type DeviceResponse struct {
	ID        uuid.UUID `json:"id"`
	IDCard    string    `json:"id_card"`
	Name      *string   `json:"name"`
	Online    bool      `json:"online"`
	CreatedAt time.Time `json:"created_at"`
}

// setupDeviceRoutes registers the device management API endpoints.
func (s *svc) setupDeviceRoutes() {
	devices := s.Group("/api/devices")
	devices.Use(s.jwtAuthMiddleware()) // Protect all device routes
	{
		devices.POST("/pair", s.pairDevice)
		devices.DELETE("/:deviceID/unpair", s.unpairDevice)
		devices.GET("", s.getUserDevices)
		devices.GET("/:deviceID/status", s.getDeviceStatus)
	}
}

type pairDeviceRequest struct {
	IDCard    string `json:"id_card" binding:"required"`
	SecretKey string `json:"secret_key" binding:"required"`
}

func (s *svc) pairDevice(c *gin.Context) {
	var req pairDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload: " + err.Error()})
		return
	}

	userIDString, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in token"})
		return
	}
	userID, err := uuid.Parse(userIDString.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID format"})
		return
	}

	device, err := s.store.PairDevice(c.Request.Context(), userID, req.IDCard, req.SecretKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to pair device: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, device)
}

func (s *svc) unpairDevice(c *gin.Context) {
	deviceIDString := c.Param("deviceID")
	deviceID, err := uuid.Parse(deviceIDString)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid device ID format"})
		return
	}

	userIDString, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in token"})
		return
	}
	userID, err := uuid.Parse(userIDString.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID format"})
		return
	}

	// Call the store to unpair the device.
	_, err = s.store.UnpairDevice(c.Request.Context(), userID, deviceID)
	if err != nil {
		if strings.Contains(err.Error(), "not found or not owned") {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Failed to unpair device"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device unpaired successfully"})
}

func (s *svc) getUserDevices(c *gin.Context) {
	userIDString, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in token"})
		return
	}
	userID, err := uuid.Parse(userIDString.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID format"})
		return
	}

	devices, err := s.store.GetUserDevices(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve user devices: " + err.Error()})
		return
	}

	// Transform devices to the response model, checking online status for each.
	responseDevices := make([]DeviceResponse, len(devices))
	for i, device := range devices {
		anovaDevice := s.manager.Device(device.IDCard)
		responseDevices[i] = DeviceResponse{
			ID:        device.ID,
			IDCard:    device.IDCard,
			Name:      device.Name,
			Online:    anovaDevice != nil,
			CreatedAt: device.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, responseDevices)
}

func (s *svc) getDeviceStatus(c *gin.Context) {
	deviceIDStr := c.Param("deviceID")
	deviceID, err := uuid.Parse(deviceIDStr)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "Invalid device ID format"})
		return
	}

	userID, _ := c.Get("userID")

	// First, verify the user owns this device.
	userDevices, err := s.store.GetUserDevices(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Could not verify device ownership"})
		return
	}

	var targetDevice *store.Device
	for _, device := range userDevices {
		if device.ID == deviceID {
			targetDevice = device
			break
		}
	}

	if targetDevice == nil {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "Device not found or not owned by user"})
		return
	}

	// Check online status using AnovaManager
	anovaDevice := s.manager.Device(targetDevice.IDCard)
	if anovaDevice == nil {
		c.JSON(http.StatusOK, gin.H{"id": deviceID, "id_card": targetDevice.IDCard, "name": targetDevice.Name, "status": "offline"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"id": deviceID, "id_card": targetDevice.IDCard, "name": targetDevice.Name, "status": "online"})
}
