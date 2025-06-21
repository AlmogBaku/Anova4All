package main

import (
	"anova4all/internal/store"
	"anova4all/pkg/wifi"
	"context"
	"errors"
	"fmt"
	"go.uber.org/zap"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"anova4all/internal/rest"
	"github.com/spf13/viper"
)

func main() {
	cfg := loadConfig()

	var logger *zap.Logger
	env := strings.ToUpper(cfg.GetString("env"))
	if env == "DEV" || env == "DEVELOPMENT" {
		logger = zap.Must(zap.NewDevelopment())
	} else {
		logger = zap.Must(zap.NewProduction())
	}
	defer logger.Sync()

	manager, err := wifi.NewAnovaManager(
		context.Background(),
		cfg.GetString("server_host"),
		cfg.GetInt("anova_server_port"),
		logger,
	)
	if err != nil {
		logger.Sugar().With("error", err).Error("Failed to create AnovaManager")
	}
	{
		host, port := manager.Server().HostPort()
		logger.Sugar().Infof("Anova Server started on %s:%d", host, port)
	}

	databaseURL := cfg.GetString("database_url")
	if databaseURL == "" {
		logger.Sugar().Fatal("DATABASE_URL environment variable / config not set")
	}
	storeInstance, err := store.NewStore(databaseURL, manager)
	if err != nil {
		logger.Sugar().With("error", err).Fatal("Failed to create store")
	}
	logger.Sugar().Info("Store initialized successfully")

	jwtSecret := cfg.GetString("jwt_secret")
	if jwtSecret == "" {
		// Depending on policy, you might want to make this a Fatal error.
		// For now, a warning, as some functionalities might work without JWT if not protected.
		logger.Sugar().Warn("JWT_SECRET environment variable / config not set. JWT-protected endpoints will fail.")
	}

	service, err := rest.NewService(
		manager,
		cfg.GetString("admin_username"),
		cfg.GetString("admin_password"),
		jwtSecret,     // Pass JWT secret
		storeInstance, // Pass store instance
		cfg.GetString("frontend_dist_dir"),
		logger,
	)
	if err != nil {
		logger.Sugar().With("error", err).Error("Failed to create service")
	}

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.GetInt("rest_server_port")),
		Handler: service,
	}

	go func() {
		logger.Sugar().Infof("REST Server started on http://localhost:%d", cfg.GetInt("rest_server_port"))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Sugar().With("error", err).Fatal("Failed to start server")
		}
	}()

	if cfg.GetInt("rest_server_tls_port") > 0 {
		if cfg.GetString("server_host") == "" || cfg.GetString("rest_server_tls_cert") == "" || cfg.GetString("rest_server_tls_key") == "" {
			logger.Sugar().Fatal("Missing required config for TLS server to start")
		}
		logger.Sugar().Infof("REST TLS Server started on https://localhost:%d", cfg.GetInt("rest_server_tls_port"))
		if err := http.ListenAndServeTLS(fmt.Sprintf(":%d", cfg.GetInt("rest_server_tls_port")), cfg.GetString("rest_server_tls_cert"), cfg.GetString("rest_server_tls_key"), service); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Sugar().With("error", err).Fatal("Failed to start server")
		}
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Sugar().Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Sugar().With("error", err).Fatal("Server forced to shutdown")
	}

	logger.Sugar().Info("Server closed")
}

func loadConfig() *viper.Viper {
	v := viper.New()
	v.AutomaticEnv()
	v.SetDefault("env", "prod")
	v.SetDefault("server_host", "")
	v.SetDefault("anova_server_port", 8080)
	v.SetDefault("rest_server_port", 8000)
	v.SetDefault("frontend_dist_dir", "./dist")
	v.SetDefault("admin_username", "")
	v.SetDefault("admin_password", "")

	v.SetDefault("rest_server_tls_port", -1)
	v.SetDefault("rest_server_tls_cert", "")
	v.SetDefault("rest_server_tls_key", "")
	// Add new config defaults for the database and JWT
	v.SetDefault("database_url", "") // e.g., "postgresql://user:password@host:port/database"
	v.SetDefault("jwt_secret", "")   // Your JWT secret for token validation

	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.SetConfigName("config")
	if err := v.ReadInConfig(); err != nil {
		var configFileNotFoundError viper.ConfigFileNotFoundError
		if !errors.As(err, &configFileNotFoundError) {
			panic(fmt.Errorf("failed to read config file: %w", err))
		}
	}

	return v
}
