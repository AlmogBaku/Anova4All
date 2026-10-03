package storetest

import "testing"

// The harness writes a committed password and test rows: it must refuse any
// database that isn't local.
func TestLocalURLOnlyAcceptsLoopback(t *testing.T) {
	for raw, want := range map[string]bool{
		"postgresql://postgres:postgres@127.0.0.1:54322/postgres":              true,
		"postgresql://postgres:postgres@localhost:54322/postgres":              true,
		"postgresql://postgres:postgres@[::1]:54322/postgres":                  true,
		"postgresql://postgres:x@db.example.test:5432/postgres":                false,
		"postgresql://postgres:x@127.0.0.1.example.test:5432/postgres":         false,
		"postgresql://postgres:x@10.0.0.5:5432/postgres":                       false,
		"postgresql://postgres:x@127.0.0.1:5432/postgres?host=db.example.test": false,
		"postgresql://postgres:x@127.0.0.1:5432,db.example.test:5432/postgres": false,
		"host=db.example.test user=postgres":                                   false,
		"not a url":                                                            false,
	} {
		if got := LocalURL(raw); got != want {
			t.Errorf("LocalURL(%q) = %v; want %v", raw, got, want)
		}
	}
}
