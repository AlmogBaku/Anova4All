package store

import (
	"anova4all/pkg/commands"
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"anova4all/pkg/wifi"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq" // PostgreSQL driver
)

// Store defines the interface for device storage and management.
type Store interface {
	RegisterDevice(ctx context.Context, idCard, secretKey string) (*Device, error)
	PairDevice(ctx context.Context, userID uuid.UUID, idCard, secretKey string) (*Device, error)
	UnpairDevice(ctx context.Context, userID, deviceID uuid.UUID) (*Device, error)
	GetUserDevices(ctx context.Context, userID uuid.UUID) ([]*Device, error)
	GetDeviceByIDCard(ctx context.Context, idCard string) (*Device, error)
	GetDeviceByID(ctx context.Context, deviceID uuid.UUID) (*Device, error)
}

type storeImpl struct {
	db           *sqlx.DB
	anovaManager wifi.AnovaManager // To listen for device connections
}

// NewStore creates a new Store instance.
// dbURL is the connection string for the PostgreSQL database.
// anovaManager is an instance of wifi.AnovaManager.
func NewStore(dbURL string, anovaManager wifi.AnovaManager) (Store, error) {
	if anovaManager == nil {
		return nil, fmt.Errorf("anovaManager cannot be nil")
	}

	db, err := sqlx.Connect("postgres", dbURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	s := &storeImpl{
		db:           db,
		anovaManager: anovaManager,
	}

	// Register callbacks with AnovaManager
	anovaManager.OnDeviceConnected(func(ctx context.Context, device wifi.AnovaDevice) {
		// Run in a separate goroutine to avoid blocking the wifi manager.
		// Use a background context for this new task.
		go s.handleDeviceConnected(context.Background(), device)
	})

	// Register a global disconnect callback using the "*" wildcard.
	anovaManager.OnDeviceDisconnected("*", s.handleDeviceDisconnected)

	return s, nil
}

// RegisterDevice ensures a device is present in the database. It uses an upsert
// to handle device registration and re-registration.
// - If the device is new, it's inserted with its secret key.
// - If the device already exists, its secret_key is updated to the latest one provided.
// This ensures the server always has the most recent secret for any device connecting.
func (s *storeImpl) RegisterDevice(ctx context.Context, idCard, secretKey string) (*Device, error) {
	device := &Device{}

	// This query handles initial registration and re-registration of devices.
	// ON CONFLICT, it always updates the secret key to the latest one from the device.
	// The user_id is NOT modified on conflict.
	query := `
		INSERT INTO devices (id_card, secret_key)
		VALUES ($1, crypt($2, gen_salt('bf')))
		ON CONFLICT (id_card) DO UPDATE
		SET secret_key = crypt($2, gen_salt('bf'))
		RETURNING id, id_card, name, user_id, created_at;
	`

	err := s.db.QueryRowxContext(ctx, query, idCard, secretKey).StructScan(device)
	if err != nil {
		return nil, fmt.Errorf("failed to register device: %w", err)
	}

	log.Printf("Device registered/updated: ID %s, IDCard %s", device.ID, device.IDCard)
	return device, nil
}

// PairDevice associates a device with a user by verifying the secret key in the database.
// It performs an "upsert" to prevent race conditions:
// - If the device doesn't exist, it's created and paired.
// - If the device exists, it's paired only if the secret key matches.
// It includes a retry mechanism to handle the race condition where a pairing attempt
// arrives before a device's new secret key is registered.
func (s *storeImpl) PairDevice(ctx context.Context, userID uuid.UUID, idCard, secretKey string) (*Device, error) {
	device := &Device{}
	// This query performs an "upsert" to prevent race conditions.
	// 1. INSERT: Tries to create a new device with the user_id. This handles the case
	//    where pairing happens before the device's first connection. The secret is hashed.
	// 2. ON CONFLICT: If the device (id_card) already exists, it triggers the UPDATE.
	// 3. UPDATE: It sets the user_id, but only if the provided secretKey matches the
	//    existing one (verified by crypt).
	// If the secret key is wrong, the WHERE clause fails, the UPDATE doesn't happen,
	// and QueryRowxContext returns sql.ErrNoRows.
	query := `
		INSERT INTO devices (id_card, user_id, secret_key)
		VALUES ($2, $1, crypt($3, gen_salt('bf')))
		ON CONFLICT (id_card) DO UPDATE
		SET user_id = EXCLUDED.user_id
		WHERE devices.secret_key = crypt($3, devices.secret_key)
		RETURNING id, id_card, name, user_id, created_at;
	`

	var err error
	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		err = s.db.QueryRowxContext(ctx, query, userID, idCard, secretKey).StructScan(device)
		if err == nil {
			log.Printf("Device %s paired with user %s", device.ID, userID)
			return device, nil // Success
		}

		// If the error is not 'no rows', it's a different database issue, so fail fast.
		if err != sql.ErrNoRows {
			return nil, fmt.Errorf("failed to pair device: %w", err)
		}

		// This error occurs if the device exists but the secret key is incorrect,
		// which could be our race condition. Wait and retry.
		log.Printf("Pairing attempt %d/%d failed for device %s (secret mismatch or race condition), retrying in 1s...", i+1, maxRetries, idCard)
		time.Sleep(1 * time.Second)

		// Proactively fetch the latest secret from the live device and update our database.
		if dev := s.anovaManager.Device(idCard); dev != nil {
			log.Printf("Proactively refreshing secret for %s", idCard)
			secret, err := dev.SendCommand(ctx, &commands.GetSecretKey{})
			if err != nil {
				log.Printf("Failed to get secret key for device %s during retry: %v", idCard, err)
				continue // Continue to the next retry iteration
			}

			// Update the database with the secret we just fetched.
			if _, err := s.RegisterDevice(ctx, idCard, secret.(string)); err != nil {
				log.Printf("Failed to update secret key for device %s during retry: %v", idCard, err)
			}
		}
	}

	// If we've exhausted all retries, return the final error.
	log.Printf("Failed to pair device %s after %d retries.", idCard, maxRetries)
	return nil, fmt.Errorf("device not found or secret key mismatch")
}

// UnpairDevice disassociates a device from a user.
func (s *storeImpl) UnpairDevice(ctx context.Context, userID, deviceID uuid.UUID) (*Device, error) {
	device := &Device{}
	query := `
		UPDATE devices
		SET user_id = NULL
		WHERE id = $1 AND user_id = $2
		RETURNING id, id_card, name, user_id, created_at;
	`
	err := s.db.QueryRowxContext(ctx, query, deviceID, userID).StructScan(device)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("device not found or not owned by user")
		}
		return nil, fmt.Errorf("failed to unpair device: %w", err)
	}
	log.Printf("Device %s unpaired from user %s", device.ID, userID)
	return device, nil
}

// GetUserDevices retrieves all devices associated with a user.
func (s *storeImpl) GetUserDevices(ctx context.Context, userID uuid.UUID) ([]*Device, error) {
	var devices []*Device
	query := `
		SELECT id, id_card, name, user_id, created_at
		FROM devices
		WHERE user_id = $1
		ORDER BY created_at DESC;
	`
	err := s.db.SelectContext(ctx, &devices, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user devices: %w", err)
	}
	return devices, nil
}

// GetDeviceByID retrieves a single device by its ID.
func (s *storeImpl) GetDeviceByID(ctx context.Context, deviceID uuid.UUID) (*Device, error) {
	device := &Device{}
	query := `
		SELECT id, id_card, name, user_id, created_at
		FROM devices
		WHERE id = $1;
	`
	err := s.db.GetContext(ctx, device, query, deviceID)
	if err != nil {
		return nil, fmt.Errorf("failed to get device by id %s: %w", deviceID, err)
	}
	return device, nil
}

// GetDeviceByIDCard retrieves a single device by its ID card.
func (s *storeImpl) GetDeviceByIDCard(ctx context.Context, idCard string) (*Device, error) {
	device := &Device{}
	query := `
		SELECT id, id_card, name, user_id, created_at
		FROM devices
		WHERE id_card = $1;
	`
	err := s.db.GetContext(ctx, device, query, idCard)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("device with IDCard %s not found", idCard)
		}
		return nil, fmt.Errorf("failed to get device by ID card %s: %w", idCard, err)
	}
	return device, nil
}

// handleDeviceConnected is called when a device connects via AnovaManager.
// It ensures the device is registered in the database.
func (s *storeImpl) handleDeviceConnected(ctx context.Context, device wifi.AnovaDevice) {
	log.Printf("Attempting to register device on connect: IDCard %s", device.IDCard())
	_, err := s.RegisterDevice(ctx, device.IDCard(), device.SecretKey())
	if err != nil {
		log.Printf("Error registering device %s on connect: %v", device.IDCard(), err)
	} else {
		log.Printf("Device %s processed successfully on connect.", device.IDCard())
	}
}

// handleDeviceDisconnected is called when any device disconnects.
// For now, it just logs the event.
func (s *storeImpl) handleDeviceDisconnected(ctx context.Context, idCard string) {
	log.Printf("Device disconnected: IDCard %s (Store handling placeholder)", idCard)
	// No action required in the store for disconnects as per current plan.
	// Online status is checked live. This is just for logging/future use.
}
