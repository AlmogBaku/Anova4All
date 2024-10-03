package rest

import (
	"anova4all/pkg/commands"
	"anova4all/pkg/wifi"
	"github.com/gin-gonic/gin"
	"net/http"
)

func (s *Service) getDeviceState(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	c.JSON(http.StatusOK, device.State())
}

func (s *Service) setTemperature(c *gin.Context) {
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

func (s *Service) getTargetTemperature(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	temp, err := device.SendCommand(c, &commands.GetTargetTemperature{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, GetTargetTemperatureResponse{Temperature: temp.(float64)})
}

func (s *Service) getCurrentTemperature(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	temp, err := device.SendCommand(c, &commands.GetCurrentTemperature{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, TemperatureResponse{Temperature: temp.(float64)})
}

func (s *Service) startCooking(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	if err := device.StartCooking(c); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *Service) stopCooking(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	if err := device.StopCooking(c); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *Service) setTimer(c *gin.Context) {
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

func (s *Service) startTimer(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	if _, err := device.SendCommand(c, &commands.StartTimer{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *Service) stopTimer(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	if _, err := device.SendCommand(c, &commands.StopTimer{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *Service) clearAlarm(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	if _, err := device.SendCommand(c, &commands.ClearAlarm{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, OkResponseValue)
}

func (s *Service) getUnit(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	unit, err := device.SendCommand(c, &commands.GetTemperatureUnit{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, UnitResponse{Unit: unit.(commands.TemperatureUnit)})
}

func (s *Service) setUnit(c *gin.Context) {
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

func (s *Service) getTimer(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	timer, err := device.SendCommand(c, &commands.GetTimerStatus{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, TimerResponse{Timer: timer.(int)})
}

func (s *Service) getSpeakerStatus(c *gin.Context) {
	device := c.MustGet("device").(wifi.AnovaDevice)
	status, err := device.SendCommand(c, &commands.GetSpeakerStatus{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, SpeakerStatusResponse{SpeakerStatus: status.(bool)})
}
