package cook

// Idle reports whether no work is pending or running.
func (s *Service) Idle() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, c := range s.cookers {
		if c.running || len(c.pending) > 0 {
			return false
		}
	}
	return true
}
