package store

import (
	"context"
	"database/sql"
	"fmt"
	"log"

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

// RegisterDevice registers a new device and stores a bcrypt hash of its secret key.
// This relies on the pgcrypto extension being enabled in PostgreSQL.
func (s *storeImpl) RegisterDevice(ctx context.Context, idCard, secretKey string) (*Device, error) {
	device := &Device{}

	// Use ON CONFLICT DO NOTHING to handle race conditions gracefully.
	// The secret key is hashed using pgcrypto's crypt() and gen_salt('bf').
	query := `
		INSERT INTO devices (id_card, secret_key)
		VALUES ($1, crypt($2, gen_salt('bf')))
		ON CONFLICT (id_card) DO NOTHING
		RETURNING id, id_card, name, user_id, created_at;
	`

	err := s.db.QueryRowxContext(ctx, query, idCard, secretKey).StructScan(device)
	if err != nil {
		if err == sql.ErrNoRows { // This happens when ON CONFLICT is triggered.
			log.Printf("Device with IDCard %s already exists. Fetching.", idCard)
			// Since the device exists, we fetch it. The secret is not returned.
			return s.GetDeviceByIDCard(ctx, idCard)
		}
		return nil, fmt.Errorf("failed to register device (insert attempt): %w", err)
	}

	log.Printf("Device registered: ID %s, IDCard %s", device.ID, device.IDCard)
	return device, nil
}

// PairDevice associates a device with a user by verifying the secret key in the database.
func (s *storeImpl) PairDevice(ctx context.Context, userID uuid.UUID, idCard, secretKey string) (*Device, error) {
	device := &Device{}
	query := `
		UPDATE devices
		SET user_id = $1
		WHERE id_card = $2 AND secret_key = crypt($3, secret_key)
		RETURNING id, id_card, name, user_id, created_at;
	`
	err := s.db.QueryRowxContext(ctx, query, userID, idCard, secretKey).StructScan(device)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("device not found or secret key mismatch")
		}
		return nil, fmt.Errorf("failed to pair device: %w", err)
	}

	log.Printf("Device %s paired with user %s", device.ID, userID)
	return device, nil
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
