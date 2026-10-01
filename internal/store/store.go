// Package store is the Go server's access to Supabase Postgres, as the anova_server role.
package store

import (
	"context"
	"errors"
	"fmt"
	"net"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound  = errors.New("not found")
	ErrNotMember = errors.New("not a member")
)

// Device is a paired cooker row.
type Device struct {
	ID         uuid.UUID
	IDCard     string
	OwnerID    uuid.UUID
	Name       string
	LastSeenAt *time.Time
}

// Access is a device as seen by one user.
type Access struct {
	Device
	IsOwner bool
}

// Cook is an open or closed cook row.
type Cook struct {
	ID        uuid.UUID
	DeviceID  uuid.UUID
	StartedAt time.Time
	AutoStop  bool
	EndedAt   *time.Time
	EndReason *string
}

// End reasons (must match the cooks.end_reason check constraint).
const (
	EndAutoStop = "auto_stop"
	EndStopped  = "stopped"
	EndManual   = "manual"
)

type Store struct {
	pool *pgxpool.Pool
}

// ParseConfig validates DATABASE_URL: TLS must be verify-full, except for a loopback host (local Supabase).
func ParseConfig(url string) (*pgxpool.Config, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, errors.New("parse DATABASE_URL: invalid connection string")
	}
	cc := cfg.ConnConfig
	if !isLoopback(cc.Host) {
		tls := cc.TLSConfig
		if tls == nil || tls.InsecureSkipVerify || tls.ServerName == "" {
			return nil, errors.New("DATABASE_URL must use sslmode=verify-full")
		}
		for _, fb := range cc.Fallbacks {
			if fb.TLSConfig == nil {
				return nil, errors.New("DATABASE_URL must use sslmode=verify-full (no plaintext fallback)")
			}
		}
	}
	cfg.MaxConns = 4
	if cc.RuntimeParams == nil {
		cc.RuntimeParams = map[string]string{}
	}
	cc.RuntimeParams["statement_timeout"] = "5000"
	cc.RuntimeParams["application_name"] = "anova4all"
	return cfg, nil
}

func isLoopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// Open connects and pings.
func Open(ctx context.Context, url string) (*Store, error) {
	cfg, err := ParseConfig(url)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

// VerifyKey reports whether key matches the stored hash for idCard. No row → false.
func (s *Store) VerifyKey(ctx context.Context, idCard, key string) (bool, error) {
	var hash string
	err := s.pool.QueryRow(ctx, `select key_hash from public.devices where id_card = $1`, idCard).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("verify key: %w", err)
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(key)) == nil, nil
}

// HashKey bcrypt-hashes a cooker key.
func HashKey(key string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(key), bcrypt.DefaultCost)
	return string(h), err
}

const deviceCols = `id, id_card, owner_id, name, last_seen_at`

func scanDevice(row pgx.Row) (Device, error) {
	var d Device
	err := row.Scan(&d.ID, &d.IDCard, &d.OwnerID, &d.Name, &d.LastSeenAt)
	return d, err
}

// ClaimDevice makes user the owner of idCard with keyHash, in one transaction.
// Same owner keeps the row (and members); a new owner replaces the row, so the old
// members, invites and cooks are deleted by cascade.
func (s *Store) ClaimDevice(ctx context.Context, idCard, keyHash string, user uuid.UUID) (Device, error) {
	var d Device
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var id, owner uuid.UUID
		err := tx.QueryRow(ctx, `select id, owner_id from public.devices where id_card = $1 for update`, idCard).Scan(&id, &owner)
		switch {
		case err == nil && owner == user:
			d, err = scanDevice(tx.QueryRow(ctx, `update public.devices set key_hash = $2, last_seen_at = now() where id = $1
				returning `+deviceCols, id, keyHash))
			return err
		case err == nil:
			if _, err := tx.Exec(ctx, `delete from public.devices where id = $1`, id); err != nil {
				return err
			}
		case !errors.Is(err, pgx.ErrNoRows):
			return err
		}
		d, err = scanDevice(tx.QueryRow(ctx, `insert into public.devices (id_card, key_hash, owner_id, last_seen_at)
			values ($1, $2, $3, now()) returning `+deviceCols, idCard, keyHash, user))
		return err
	})
	if err != nil {
		return Device{}, fmt.Errorf("claim device: %w", err)
	}
	return d, nil
}

// accessSelect selects devices visible to user $1.
const accessSelect = `select d.id, d.id_card, d.owner_id, d.name, d.last_seen_at, d.owner_id = $1
	from public.devices d
	where (d.owner_id = $1 or exists (select 1 from public.device_members m where m.device_id = d.id and m.user_id = $1))`

func scanAccess(row pgx.Row) (Access, error) {
	var a Access
	err := row.Scan(&a.ID, &a.IDCard, &a.OwnerID, &a.Name, &a.LastSeenAt, &a.IsOwner)
	return a, err
}

// Access returns the device if user is its owner or a member; ErrNotMember otherwise
// (including when the device doesn't exist, so ids can't be probed).
func (s *Store) Access(ctx context.Context, deviceID, user uuid.UUID) (Access, error) {
	a, err := scanAccess(s.pool.QueryRow(ctx, accessSelect+` and d.id = $2`, user, deviceID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Access{}, ErrNotMember
	}
	if err != nil {
		return Access{}, fmt.Errorf("access: %w", err)
	}
	return a, nil
}

// DevicesForUser lists every device the user owns or is a member of.
func (s *Store) DevicesForUser(ctx context.Context, user uuid.UUID) ([]Access, error) {
	rows, err := s.pool.Query(ctx, accessSelect+` order by d.created_at`, user)
	if err != nil {
		return nil, fmt.Errorf("devices for user: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Access, error) { return scanAccess(r) })
	if err != nil {
		return nil, fmt.Errorf("devices for user: %w", err)
	}
	return out, nil
}

// DeviceByIDCard returns the paired row for idCard.
func (s *Store) DeviceByIDCard(ctx context.Context, idCard string) (Device, error) {
	d, err := scanDevice(s.pool.QueryRow(ctx, `select `+deviceCols+` from public.devices where id_card = $1`, idCard))
	if errors.Is(err, pgx.ErrNoRows) {
		return Device{}, ErrNotFound
	}
	if err != nil {
		return Device{}, fmt.Errorf("device by id card: %w", err)
	}
	return d, nil
}

// TouchLastSeen records that the cooker is connected now.
func (s *Store) TouchLastSeen(ctx context.Context, deviceID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `update public.devices set last_seen_at = now() where id = $1`, deviceID)
	return err
}

const cookCols = `id, device_id, started_at, auto_stop, ended_at, end_reason`

func scanCook(row pgx.Row) (Cook, error) {
	var c Cook
	err := row.Scan(&c.ID, &c.DeviceID, &c.StartedAt, &c.AutoStop, &c.EndedAt, &c.EndReason)
	return c, err
}

func oneCook(row pgx.Row, what string) (Cook, error) {
	c, err := scanCook(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Cook{}, ErrNotFound
	}
	if err != nil {
		return Cook{}, fmt.Errorf("%s: %w", what, err)
	}
	return c, nil
}

// OpenCook returns the device's open cook, or ErrNotFound.
func (s *Store) OpenCook(ctx context.Context, deviceID uuid.UUID) (Cook, error) {
	return oneCook(s.pool.QueryRow(ctx, `select `+cookCols+` from public.cooks where device_id = $1 and ended_at is null`, deviceID), "open cook")
}

// LastCook returns the most recent cook (open or closed), or ErrNotFound.
func (s *Store) LastCook(ctx context.Context, deviceID uuid.UUID) (Cook, error) {
	return oneCook(s.pool.QueryRow(ctx, `select `+cookCols+` from public.cooks where device_id = $1 order by started_at desc limit 1`, deviceID), "last cook")
}

// OpenCooks lists every open cook (used to resume auto-stop after a restart).
func (s *Store) OpenCooks(ctx context.Context) ([]Cook, error) {
	rows, err := s.pool.Query(ctx, `select `+cookCols+` from public.cooks where ended_at is null`)
	if err != nil {
		return nil, fmt.Errorf("open cooks: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Cook, error) { return scanCook(r) })
	if err != nil {
		return nil, fmt.Errorf("open cooks: %w", err)
	}
	return out, nil
}

// InsertCook opens a cook row. startedBy is nil for a cook started from the cooker's buttons.
func (s *Store) InsertCook(ctx context.Context, deviceID uuid.UUID, startedBy *uuid.UUID, autoStop bool) (Cook, error) {
	c, err := scanCook(s.pool.QueryRow(ctx, `insert into public.cooks (device_id, started_by, auto_stop) values ($1, $2, $3)
		returning `+cookCols, deviceID, startedBy, autoStop))
	if err != nil {
		return Cook{}, fmt.Errorf("insert cook: %w", err)
	}
	return c, nil
}

// SetCookAutoStop changes the auto-stop flag of an open cook.
func (s *Store) SetCookAutoStop(ctx context.Context, cookID uuid.UUID, on bool) error {
	_, err := s.pool.Exec(ctx, `update public.cooks set auto_stop = $2 where id = $1 and ended_at is null`, cookID, on)
	return err
}

// CloseCook ends an open cook with reason. It reports whether a row was closed;
// closing an already-closed cook is a no-op.
func (s *Store) CloseCook(ctx context.Context, cookID uuid.UUID, reason string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `update public.cooks set ended_at = now(), end_reason = $2 where id = $1 and ended_at is null`, cookID, reason)
	if err != nil {
		return false, fmt.Errorf("close cook: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

// ExistingIDCards returns which of the given id cards still have a row (to drop unpaired cookers).
func (s *Store) ExistingIDCards(ctx context.Context, idCards []string) (map[string]bool, error) {
	rows, err := s.pool.Query(ctx, `select id_card from public.devices where id_card = any($1)`, idCards)
	if err != nil {
		return nil, fmt.Errorf("existing id cards: %w", err)
	}
	cards, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, fmt.Errorf("existing id cards: %w", err)
	}
	out := make(map[string]bool, len(cards))
	for _, c := range cards {
		out[c] = true
	}
	return out, nil
}
