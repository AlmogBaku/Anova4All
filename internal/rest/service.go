package rest

import (
	"anova4all/pkg/wifi"
	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"net/http"
)

type Service interface {
	http.Handler
}

type svc struct {
	*gin.Engine
	manager       wifi.AnovaManager
	adminUsername string
	adminPassword string
	sse           *SSEManager
}

func NewService(manager wifi.AnovaManager, adminUsername, adminPassword, frontEndDistDir string) (Service, error) {
	s := &svc{
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

	// No wifi routes
	s.setupWifiRoutes()
	// BLE routes
	s.setupBLERoutes()

	if frontEndDistDir != "" {
		s.Use(static.Serve("/", static.LocalFile(frontEndDistDir, true)))
	}

	return s, nil
}
