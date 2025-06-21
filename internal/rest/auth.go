package rest

import (
	"anova4all/internal/store"
	"crypto/subtle"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"net"
	"net/http"
	"strings"
)

func (s *svc) isLocalRequest(c *gin.Context) bool {
	ip, _, err := net.SplitHostPort(c.Request.RemoteAddr)
	if err != nil {
		return false
	}
	remoteIP := net.ParseIP(ip)
	if remoteIP == nil {
		return false
	}

	// Check if the IP is a loopback address
	if remoteIP.IsLoopback() {
		return true
	}

	// Check if the IP is a private address
	if remoteIP.IsPrivate() {
		return true
	}

	return false
}

func (s *svc) jwtAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token format"})
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// Don't forget to validate the alg is what you expect:
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(s.jwtSecret), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			if sub, exists := claims["sub"]; exists {
				if userIDStr, ok := sub.(string); ok {
					userID, err := uuid.Parse(userIDStr)
					if err != nil {
						c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID in token"})
						return
					}
					c.Set("userID", userID)
					c.Next()
					return
				}
			}
		}

		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid claims"})
	}
}

func (s *svc) adminAuth(c *gin.Context) {
	if s.isLocalRequest(c) {
		c.Next()
		return
	}

	if s.adminUsername == "" || s.adminPassword == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized. Admin credentials not set"})
		return
	}

	username, password, hasAuth := c.Request.BasicAuth()
	if !hasAuth || subtle.ConstantTimeCompare([]byte(username), []byte(s.adminUsername)) != 1 || subtle.ConstantTimeCompare([]byte(password), []byte(s.adminPassword)) != 1 {
		c.Header("WWW-Authenticate", "Basic realm=Admin Area")
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	c.Next()
}

func (s *svc) getAuthenticatedDevice(c *gin.Context) {
	// We can now safely get the userID from the context, as the JWT middleware should have run first.
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	userID := userIDVal.(uuid.UUID)

	// Get the device ID from the URL parameter.
	deviceIDStr := c.Param("device_id")
	deviceID, err := uuid.Parse(deviceIDStr)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "Invalid device ID format"})
		return
	}

	// Verify the user owns this device by checking against the store.
	userDevices, err := s.store.GetUserDevices(c.Request.Context(), userID)
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
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Device not found or not owned by user"})
		return
	}

	// Finally, check if the device is currently online.
	anovaDevice := s.manager.Device(targetDevice.IDCard)
	if anovaDevice == nil {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "Device is offline or not found"})
		return
	}

	// If all checks pass, set the AnovaDevice in the context for the next handlers.
	c.Set("device", anovaDevice)
	c.Next()
}
