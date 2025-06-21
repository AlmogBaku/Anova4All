package rest

import (
	"anova4all/internal/store"
	"anova4all/pkg/wifi"
	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/static"
	ginzap "github.com/gin-contrib/zap"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"net/http"
	"time"
)

type Service interface {
	http.Handler
}

type svc struct {
	*gin.Engine
	manager       wifi.AnovaManager
	adminUsername string
	adminPassword string
	jwtSecret     string
	store         store.Store
	sse           *SSEManager
	logger        *zap.SugaredLogger
}

func NewService(manager wifi.AnovaManager, adminUsername, adminPassword, jwtSecret string, storeInstance store.Store, frontEndDistDir string, logger *zap.Logger) (Service, error) {
	if logger == nil {
		logger = zap.NewNop()
	}
	logger = logger.Named("rest_service")

	gin.SetMode(gin.ReleaseMode)
	s := &svc{
		Engine:        gin.New(),
		manager:       manager,
		sse:           NewSSEManager(manager),
		adminUsername: adminUsername,
		adminPassword: adminPassword,
		jwtSecret:     jwtSecret,
		store:         storeInstance,
		logger:        logger.Sugar(),
	}

	s.Use(ginzap.Ginzap(logger, time.RFC3339, true))
	s.Use(ginzap.RecoveryWithZap(logger, true))

	corsCfg := cors.DefaultConfig()
	corsCfg.AllowCredentials = true
	corsCfg.AllowAllOrigins = true
	corsCfg.AllowHeaders = append(corsCfg.AllowHeaders, "Authorization")
	s.Use(cors.New(corsCfg))

	s.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// No wifi routes
	s.setupWifiRoutes()
	// BLE routes
	s.setupBLERoutes()
	// Device management routes (Supabase integration)
	s.setupDeviceRoutes()

	if frontEndDistDir != "" {
		s.Use(static.Serve("/", static.LocalFile(frontEndDistDir, true)))
		// Handle unmatched routes and redirect them to index.html
		s.NoRoute(func(c *gin.Context) {
			c.File(frontEndDistDir + "/index.html")
		})
	}

	return s, nil
}
