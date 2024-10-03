package main

import (
	"anova4all/pkg/wifi"
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"anova4all/internal/rest"
	"github.com/spf13/viper"
)

func main() {
	cfg := loadConfig()

	manager, err := wifi.NewAnovaManager(
		context.Background(),
		cfg.GetString("server_host"),
		cfg.GetInt("anova_server_port"),
	)
	if err != nil {
		log.Fatalf("Failed to create AnovaManager: %v", err)
	}
	{
		host, port := manager.Server().HostPort()
		log.Printf("Anova Server started on %s:%d", host, port)
	}

	service, err := rest.NewService(
		manager,
		cfg.GetString("admin_username"),
		cfg.GetString("admin_password"),
		cfg.GetString("frontend_dist_dir"),
	)
	if err != nil {
		log.Fatalf("Failed to create service: %v", err)
	}

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.GetInt("rest_server_port")),
		Handler: service,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exiting")
}

func loadConfig() *viper.Viper {
	v := viper.New()
	v.AutomaticEnv()
	v.SetDefault("server_host", "")
	v.SetDefault("anova_server_port", 8080)
	v.SetDefault("rest_server_port", 8000)
	v.SetDefault("frontend_dist_dir", "")
	v.SetDefault("admin_username", "")
	v.SetDefault("admin_password", "")
	v.SetDefault("frontend_dist_dir", "")

	if err := v.ReadInConfig(); err != nil {
		var configFileNotFoundError viper.ConfigFileNotFoundError
		if !errors.As(err, &configFileNotFoundError) {
			log.Fatalf("Error reading config file: %v", err)
		}
	}

	return v
}
