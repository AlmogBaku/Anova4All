package rest

import (
	"crypto/subtle"
	"github.com/gin-gonic/gin"
	"net"
	"net/http"
	"strings"
)

func (s *Service) isLocalRequest(c *gin.Context) bool {
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

func (s *Service) adminAuth(c *gin.Context) {
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

func (s *Service) getAuthenticatedDevice(c *gin.Context) {
	deviceID := c.Param("device_id")
	auth := strings.SplitN(c.GetHeader("Authorization"), " ", 2)
	if len(auth) != 2 || auth[0] != "Bearer" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized request"})
	}
	secretKey := auth[1]

	device := s.manager.Device(deviceID)
	if device == nil {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	if subtle.ConstantTimeCompare([]byte(device.SecretKey()), []byte(secretKey)) == 0 {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	c.Set("device", device)
	c.Next()
}
