package store

import (
	"time"

	"github.com/google/uuid"
)

// Device represents a device in the database.
// Note: We are using TEXT for id_card and secret_key as per the SQL schema in the plan.
// The user ID is a UUID, which is common in many authentication systems.
type Device struct {
	ID        uuid.UUID  `db:"id"`
	IDCard    string     `db:"id_card"`
	Name      *string    `db:"name"`    // Nullable
	UserID    *uuid.UUID `db:"user_id"` // Nullable, typically references an auth user table.
	CreatedAt time.Time  `db:"created_at"`
}
