package rest

import (
	"anova4all/pkg/wifi"
	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"net/http"
)

type Service struct {
	*gin.Engine
	manager       wifi.AnovaManager
	adminUsername string
	adminPassword string
	sse           *SSEManager
}

func NewService(manager wifi.AnovaManager, adminUsername, adminPassword, frontEndDistDir string) (*Service, error) {
	s := &Service{
		Engine:        gin.Default(),
		manager:       manager,
		sse:           NewSSEManager(manager),
		adminUsername: adminUsername,
		adminPassword: adminPassword,
	}

	s.Use(cors.Default())

	s.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	s.GET("/api/devices", s.adminAuth, s.getDevices)
	s.GET("/api/server_info", s.getServerInfo)

	deviceRoutes := s.Group("/api/devices/:device_id")
	deviceRoutes.Use(s.getAuthenticatedDevice)
	{
		deviceRoutes.GET("/state", s.getDeviceState)
		deviceRoutes.POST("/target_temperature", s.setTemperature)
		deviceRoutes.GET("/target_temperature", s.getTargetTemperature)
		deviceRoutes.GET("/temperature", s.getCurrentTemperature)
		deviceRoutes.POST("/start", s.startCooking)
		deviceRoutes.POST("/stop", s.stopCooking)
		deviceRoutes.POST("/timer", s.setTimer)
		deviceRoutes.POST("/timer/start", s.startTimer)
		deviceRoutes.POST("/timer/stop", s.stopTimer)
		deviceRoutes.POST("/alarm/clear", s.clearAlarm)
		deviceRoutes.GET("/unit", s.getUnit)
		deviceRoutes.POST("/unit", s.setUnit)
		deviceRoutes.GET("/timer", s.getTimer)
		deviceRoutes.GET("/speaker_status", s.getSpeakerStatus)
		deviceRoutes.GET("/sse", func(context *gin.Context) {
			server := s.sse.ServeHTTP(context.Param("device_id"))
			server(context.Writer, context.Request)
		})
	}

	if frontEndDistDir != "" {
		s.Use(static.Serve("/", static.LocalFile(frontEndDistDir, true)))
	}

	return s, nil
}

func (s *Service) getDevices(c *gin.Context) {
	devices := s.manager.Devices()
	var deviceInfos []DeviceInfo
	for _, device := range devices {
		deviceInfos = append(deviceInfos, DeviceInfo{
			ID:      device.IDCard(),
			Version: device.Version(),
		})
	}
	c.JSON(http.StatusOK, deviceInfos)
}

func (s *Service) getServerInfo(c *gin.Context) {
	// Assume we have a method to get server info from the manager
	host, port := s.manager.Server().HostPort()
	c.JSON(http.StatusOK, ServerInfo{Host: host, Port: port})
}
