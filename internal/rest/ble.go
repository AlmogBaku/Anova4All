//go:build !no_ble

package rest

import (
	"anova4all/pkg/ble"
	"anova4all/pkg/commands"
	"github.com/gin-gonic/gin"
	"math/rand"
	"net/http"
	"strings"
)

func (s *svc) setupBLERoutes() {
	bleRoutes := s.Group("/api/ble")
	bleRoutes.Use(s.adminAuth)
	{
		bleRoutes.GET("/device", s.getBLEDevice)
		bleRoutes.POST("/connect_wifi", s.bleConnectWifi)
		bleRoutes.POST("/config_wifi_server", s.bleConfigWifiServer)
		bleRoutes.POST("/restore_wifi_server", s.bleRestoreWifiServer)
		bleRoutes.GET("/", s.bleGetInfo)
		bleRoutes.POST("/secret_key", s.bleNewSecretKey)
	}
}

// BLE endpoint handlers
func (s *svc) getBLEDevice(c *gin.Context) {
	device, err := ble.Scan()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, BLEDevice{
		Address: device.Address.String(),
		Name:    device.LocalName(),
	})
}

func (s *svc) bleConnectWifi(c *gin.Context) {
	var request struct {
		SSID     string `json:"ssid" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	device, err := ble.Scan()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	client, err := ble.New(device.Address)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, err = client.SendCommand(commands.SetWifiCredentials{SSID: request.SSID, Password: request.Password})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, OkResponse(OkResponseValue))
}

func (s *svc) bleConfigWifiServer(c *gin.Context) {
	var request struct {
		Host *string `json:"host"`
		Port *int    `json:"port"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	host, port := s.manager.Server().HostPort()
	if request.Host != nil {
		host = *request.Host
	}
	if request.Port != nil {
		port = *request.Port
	}

	device, err := ble.Scan()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	client, err := ble.New(device.Address)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, err = client.SendCommand(commands.SetServerInfo{ServerIP: host, Port: port})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, OkResponse(OkResponseValue))
}

func (s *svc) bleRestoreWifiServer(c *gin.Context) {
	device, err := ble.Scan()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	client, err := ble.New(device.Address)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, err = client.SendCommand(commands.SetServerInfo{}) // Empty host and port 0 restore to default
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, OkResponse(OkResponseValue))
}

func (s *svc) bleGetInfo(c *gin.Context) {
	device, err := ble.Scan()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	client, err := ble.New(device.Address)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	idCard, _ := client.SendCommand(commands.GetIDCard{})
	version, _ := client.SendCommand(commands.GetVersion{})
	unit, _ := client.SendCommand(commands.GetTemperatureUnit{})
	speaker, _ := client.SendCommand(commands.GetSpeakerStatus{})

	c.JSON(http.StatusOK, gin.H{
		"ble_address":      device.Address.String(),
		"ble_name":         device.LocalName(),
		"version":          version,
		"id_card":          idCard,
		"temperature_unit": unit,
		"speaker_status":   speaker,
	})
}

func generateSecretKey() string {
	const characters = "abcdefghijklmnopqrstuvwxyz0123456789"
	const length = 10

	var sb strings.Builder
	sb.Grow(length)
	for i := 0; i < length; i++ {
		sb.WriteByte(characters[rand.Intn(len(characters))])
	}
	return sb.String()
}

func (s *svc) bleNewSecretKey(c *gin.Context) {
	device, err := ble.Scan()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	client, err := ble.New(device.Address)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	secretKey := generateSecretKey()
	_, err = client.SendCommand(commands.SetSecretKey{Key: secretKey})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, NewSecretResponse{SecretKey: secretKey})
}
