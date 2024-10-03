//go:build !no_wifi

package rest

import (
	"anova4all/pkg/commands"
	"anova4all/pkg/wifi"
	"github.com/gin-gonic/gin"
	"net/http"
)

func (s *svc) setupWifiRoutes() {
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
}

func (s *svc) getDevices(c *gin.Context) {
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

func (s *svc) getServerInfo(c *gin.Context) {
	// Assume we have a method to get server info from the manager
	host, port := s.manager.Server().HostPort()
	c.JSON(http.StatusOK, ServerInfo{Host: host, Port: port})
}

func (s *svc) getDeviceState(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	c.JSON(http.StatusOK, device.State())
}

func (s *svc) setTemperature(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	var req struct {
		Temperature float64 `json:"temperature" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := device.SendCommand(c, &commands.SetTargetTemperature{Temperature: req.Temperature, Unit: device.State().Unit})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, SetTemperatureResponse{ChangedTo: resp.(float64)})
}

func (s *svc) getTargetTemperature(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	temp, err := device.SendCommand(c, &commands.GetTargetTemperature{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, GetTargetTemperatureResponse{Temperature: temp.(float64)})
}

func (s *svc) getCurrentTemperature(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	temp, err := device.SendCommand(c, &commands.GetCurrentTemperature{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, TemperatureResponse{Temperature: temp.(float64)})
}

func (s *svc) startCooking(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	if err := device.StartCooking(c); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *svc) stopCooking(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	if err := device.StopCooking(c); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *svc) setTimer(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	var req struct {
		Minutes int `json:"minutes" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := device.SendCommand(c, &commands.SetTimer{Minutes: req.Minutes})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, SetTimerResponse{Message: "Timer set successfully", Minutes: resp.(int)})
}

func (s *svc) startTimer(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	if _, err := device.SendCommand(c, &commands.StartTimer{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *svc) stopTimer(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	if _, err := device.SendCommand(c, &commands.StopTimer{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *svc) clearAlarm(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	if _, err := device.SendCommand(c, &commands.ClearAlarm{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *svc) getUnit(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	unit, err := device.SendCommand(c, &commands.GetTemperatureUnit{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, UnitResponse{Unit: unit.(commands.TemperatureUnit)})
}

func (s *svc) setUnit(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	var req struct {
		Unit commands.TemperatureUnit `json:"unit" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if _, err := device.SendCommand(c, &commands.SetTemperatureUnit{Unit: req.Unit}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *svc) getTimer(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	timer, err := device.SendCommand(c, &commands.GetTimerStatus{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, TimerResponse{Timer: timer.(int)})
}

func (s *svc) getSpeakerStatus(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	status, err := device.SendCommand(c, &commands.GetSpeakerStatus{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, SpeakerStatusResponse{SpeakerStatus: status.(bool)})
}
