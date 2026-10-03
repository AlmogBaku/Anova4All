package rest

import (
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/time/rate"

	"anova4all/pkg/wifi"
)

func TestSlowSubscriberDoesNotBlockOthers(t *testing.T) {
	h := NewHub()
	slow := h.subscribe("c1", uuid.New())
	fast := h.subscribe("c1", uuid.New())
	got := make(chan int, 1)
	go func() {
		n := 0
		for m := range fast.ch {
			n++
			if m.state.TimerValue == 99 {
				got <- n
				return
			}
		}
	}()
	done := make(chan struct{})
	go func() {
		for i := 0; i < 100; i++ {
			h.State("c1", &wifi.DeviceState{TimerValue: i})
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("broadcast blocked on a slow subscriber")
	}
	select {
	case <-got:
	case <-time.After(2 * time.Second):
		t.Fatal("fast subscriber missed the last message")
	}
	// The slow one kept the newest 16.
	if len(slow.ch) != subBuffer {
		t.Fatalf("slow buffer %d", len(slow.ch))
	}
	var last message
	for len(slow.ch) > 0 {
		last = <-slow.ch
	}
	if last.state.TimerValue != 99 {
		t.Fatalf("slow subscriber's newest is %d", last.state.TimerValue)
	}
}

func TestUnsubscribeDuringBroadcast(t *testing.T) {
	h := NewHub()
	stop := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
				h.State("c1", &wifi.DeviceState{})
				h.CookChanged("c1", "stopped")
			}
		}
	}()
	for i := 0; i < 500; i++ {
		s := h.subscribe("c1", uuid.New())
		if i%2 == 0 {
			h.Repaired("c1", uuid.New())
		}
		h.unsubscribe(s)
	}
	close(stop)
	wg.Wait()
	h.Close()
}

func TestRepairedKicksOnlyOldRows(t *testing.T) {
	h := NewHub()
	cur := uuid.New()
	old := h.subscribe("c1", uuid.New())
	keep := h.subscribe("c1", cur)
	h.Repaired("c1", cur)
	select {
	case <-old.done:
	default:
		t.Fatal("old row's stream not kicked")
	}
	select {
	case <-keep.done:
		t.Fatal("current row's stream kicked")
	default:
	}
}

func TestPairPollingIsNeverLimited(t *testing.T) {
	l := limiter{every: time.Second, burst: 2, m: map[uuid.UUID]*rate.Limiter{}}
	u := uuid.New()
	now := time.Now()
	for i := 0; i < 30; i++ { // the UI polls every 2 s for 60 s
		if !l.allowAt(u, now.Add(time.Duration(i)*2*time.Second)) {
			t.Fatalf("poll %d limited", i)
		}
	}
	burst := now.Add(time.Hour)
	if !l.allowAt(u, burst) || !l.allowAt(u, burst) || l.allowAt(u, burst) {
		t.Fatal("burst of 3 at once not limited to 2")
	}
	if !l.allowAt(uuid.New(), burst) {
		t.Fatal("limit shared across users")
	}
}
