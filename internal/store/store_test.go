package store_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"anova4all/internal/store"
	"anova4all/internal/store/storetest"
)

const idCard = "f00000000000000000000000"

func TestParseConfigRequiresVerifyFull(t *testing.T) {
	refused := []string{
		"postgresql://u:p@db.example.test:5432/postgres",
		"postgresql://u:p@db.example.test:5432/postgres?sslmode=require",
		"postgresql://u:p@db.example.test:5432/postgres?sslmode=prefer",
		"postgresql://u:p@db.example.test:5432/postgres?sslmode=disable",
		"postgresql://u:p@db.example.test:5432/postgres?sslmode=verify-ca",
		"not a url ::",
	}
	for _, u := range refused {
		if _, err := store.ParseConfig(u); err == nil {
			t.Errorf("accepted %q", u)
		}
	}
	accepted := []string{
		"postgresql://u:p@db.example.test:5432/postgres?sslmode=verify-full",
		"postgresql://u:p@127.0.0.1:54322/postgres",
		"postgresql://u:p@localhost:54322/postgres?sslmode=disable",
	}
	for _, u := range accepted {
		cfg, err := store.ParseConfig(u)
		if err != nil {
			t.Errorf("refused %q: %v", u, err)
			continue
		}
		if cfg.MaxConns != 4 || cfg.ConnConfig.RuntimeParams["statement_timeout"] != "5000" {
			t.Errorf("pool settings not applied for %q", u)
		}
	}
}

func TestParseConfigErrorHidesPassword(t *testing.T) {
	_, err := store.ParseConfig("postgresql://u:testkey000@db.example.test:5432/postgres?sslmode=bogus")
	if err == nil {
		t.Fatal("accepted bad sslmode")
	}
	if strings.Contains(err.Error(), "testkey000") {
		t.Fatalf("error leaks password: %v", err)
	}
}

func TestClaimAndVerify(t *testing.T) {
	ctx := context.Background()
	st := storetest.Open(t)
	alice, bob, eve := storetest.User(t, "alice"), storetest.User(t, "bob"), storetest.User(t, "eve")
	card := idCard + "a" // unique per test

	h, _ := store.HashKey("testkey000")
	d1, err := st.ClaimDevice(ctx, card, h, alice)
	if err != nil {
		t.Fatal(err)
	}
	if ok, _ := st.VerifyKey(ctx, card, "testkey000"); !ok {
		t.Fatal("stored key doesn't verify")
	}
	if ok, _ := st.VerifyKey(ctx, card, "testkey111"); ok {
		t.Fatal("wrong key verifies")
	}
	if ok, err := st.VerifyKey(ctx, "nosuchcard", "testkey000"); ok || err != nil {
		t.Fatalf("unknown id card: ok=%v err=%v", ok, err)
	}
	storetest.AddMember(t, d1.ID, bob)
	if _, err := st.InsertCook(ctx, d1.ID, &alice, false, false); err != nil {
		t.Fatal(err)
	}

	// Same owner re-pairs: same row, members kept.
	h2, _ := store.HashKey("testkey111")
	d2, err := st.ClaimDevice(ctx, card, h2, alice)
	if err != nil {
		t.Fatal(err)
	}
	if d2.ID != d1.ID {
		t.Fatal("same owner got a new device id")
	}
	if _, err := st.Access(ctx, d1.ID, bob); err != nil {
		t.Fatalf("member lost on same-owner re-pair: %v", err)
	}
	if ok, _ := st.VerifyKey(ctx, card, "testkey111"); !ok {
		t.Fatal("new key not stored")
	}

	// New owner: new row, old members/invites/cooks gone.
	storetest.AddInvite(t, d1.ID, alice)
	d3, err := st.ClaimDevice(ctx, card, h, eve)
	if err != nil {
		t.Fatal(err)
	}
	if d3.ID == d1.ID || d3.OwnerID != eve {
		t.Fatal("new owner kept the old row")
	}
	for _, q := range []string{
		`select count(*) from public.device_members where device_id = $1`,
		`select count(*) from public.device_invites where device_id = $1`,
		`select count(*) from public.cooks where device_id = $1`,
	} {
		if n := storetest.Count(t, q, d1.ID); n != 0 {
			t.Errorf("%s: %d rows left", q, n)
		}
	}
	if _, err := st.Access(ctx, d3.ID, alice); !errors.Is(err, store.ErrNotMember) {
		t.Fatalf("old owner still has access: %v", err)
	}
	a, err := st.Access(ctx, d3.ID, eve)
	if err != nil || !a.IsOwner {
		t.Fatalf("new owner access: %+v %v", a, err)
	}
	storetest.DeleteDevice(t, d3.ID)
}

func TestAccessAndCooks(t *testing.T) {
	ctx := context.Background()
	st := storetest.Open(t)
	alice, bob, eve := storetest.User(t, "alice"), storetest.User(t, "bob"), storetest.User(t, "eve")
	h, _ := store.HashKey("testkey000")
	d, err := st.ClaimDevice(ctx, idCard+"b", h, alice)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { storetest.DeleteDevice(t, d.ID) })
	storetest.AddMember(t, d.ID, bob)

	if a, err := st.Access(ctx, d.ID, bob); err != nil || a.IsOwner {
		t.Fatalf("member: %+v %v", a, err)
	}
	if _, err := st.Access(ctx, d.ID, eve); !errors.Is(err, store.ErrNotMember) {
		t.Fatalf("eve: %v", err)
	}
	if list, _ := st.DevicesForUser(ctx, bob); len(list) != 1 {
		t.Fatalf("bob lists %d devices", len(list))
	}
	if list, _ := st.DevicesForUser(ctx, eve); len(list) != 0 {
		t.Fatalf("eve lists %d devices", len(list))
	}

	c, err := st.InsertCook(ctx, d.ID, &alice, true, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.InsertCook(ctx, d.ID, nil, false, false); err == nil {
		t.Fatal("second open cook allowed")
	}
	if closed, err := st.CloseCook(ctx, c.ID, store.EndAutoStop); !closed || err != nil {
		t.Fatalf("close: %v %v", closed, err)
	}
	if closed, _ := st.CloseCook(ctx, c.ID, store.EndStopped); closed {
		t.Fatal("closed twice")
	}
	if _, err := st.OpenCook(ctx, d.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("open cook after close: %v", err)
	}
	last, err := st.LastCook(ctx, d.ID)
	if err != nil || last.EndReason == nil || *last.EndReason != store.EndAutoStop {
		t.Fatalf("last cook: %+v %v", last, err)
	}
	ex, err := st.ExistingIDCards(ctx, []string{idCard + "b", "nosuchcard"})
	if err != nil || !ex[idCard+"b"] || ex["nosuchcard"] {
		t.Fatalf("existing: %v %v", ex, err)
	}
}
