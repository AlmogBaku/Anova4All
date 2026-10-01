package rest

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"anova4all/internal/control"
)

const maxBody = 4 << 10

type errorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func statusFor(code control.Code) int {
	switch code {
	case control.CodeInvalidInput:
		return http.StatusBadRequest
	case control.CodeNotMember, control.CodeOwnerOnly:
		return http.StatusForbidden
	case control.CodeDeviceOffline, control.CodeKeyMismatch, control.CodeCookInProgress, control.CodeNoActiveCook:
		return http.StatusConflict
	case control.CodeRateLimited:
		return http.StatusTooManyRequests
	case "not_found":
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}

// writeError writes a typed JSON error. Internal errors are logged by the caller's
// access log status only; their text is never sent.
func writeError(c *gin.Context, err error) {
	var body errorBody
	var e *control.Error
	if errors.As(err, &e) {
		body.Error.Code, body.Error.Message = string(e.Code), e.Message
	} else {
		body.Error.Code, body.Error.Message = "internal", "something went wrong on the server"
	}
	c.AbortWithStatusJSON(statusFor(control.Code(body.Error.Code)), body)
}

func writeUnauthorized(c *gin.Context) {
	var body errorBody
	body.Error.Code, body.Error.Message = "unauthorized", "sign in again"
	c.AbortWithStatusJSON(http.StatusUnauthorized, body)
}

func (s *Server) fail(c *gin.Context, err error) {
	if control.CodeOf(err) == "" {
		s.log.Error("request failed", zap.String("route", c.FullPath()), zap.Error(err))
	}
	writeError(c, err)
}

func deviceID(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("device_id"))
	if err != nil {
		writeError(c, control.ErrNotMember) // same answer as an unknown device
		return uuid.Nil, false
	}
	return id, true
}

func bindJSON(c *gin.Context, v any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBody)
	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeError(c, &control.Error{Code: control.CodeInvalidInput, Message: "invalid JSON body"})
		return false
	}
	return true
}

func (s *Server) serverInfo(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"host": s.opts.PublicHost, "port": s.opts.PublicPort})
}

func (s *Server) listDevices(c *gin.Context) {
	all, err := s.opts.Control.StatusAll(c.Request.Context(), user(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"devices": all})
}

func (s *Server) getDevice(c *gin.Context) {
	id, ok := deviceID(c)
	if !ok {
		return
	}
	ds, err := s.opts.Control.Status(c.Request.Context(), user(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, ds)
}

type pairRequest struct {
	IDCard string `json:"id_card"`
	Key    string `json:"key"`
}

func (s *Server) pair(c *gin.Context) {
	u := user(c)
	if !s.pairLim.allow(u) {
		writeError(c, control.ErrRateLimited)
		return
	}
	var in pairRequest
	if !bindJSON(c, &in) {
		return
	}
	d, err := s.opts.Control.Pair(c.Request.Context(), u, in.IDCard, in.Key)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": d.ID, "name": d.Name})
}

func (s *Server) startCook(c *gin.Context) {
	id, ok := deviceID(c)
	if !ok {
		return
	}
	var in control.StartCook
	if !bindJSON(c, &in) {
		return
	}
	ds, err := s.opts.Control.Start(c.Request.Context(), user(c), id, in)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, ds)
}

func (s *Server) updateCook(c *gin.Context) {
	id, ok := deviceID(c)
	if !ok {
		return
	}
	var in control.UpdateCook
	if !bindJSON(c, &in) {
		return
	}
	ds, err := s.opts.Control.Update(c.Request.Context(), user(c), id, in)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, ds)
}

func (s *Server) stopCook(c *gin.Context) {
	id, ok := deviceID(c)
	if !ok {
		return
	}
	ds, err := s.opts.Control.Stop(c.Request.Context(), user(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, ds)
}

// events streams `status` (the full DeviceStatus, sent first and then on every change)
// and `cook_ended` ({"reason"}). A ping every PingEvery re-checks access; the stream
// ends when access is lost or the cooker is re-paired to a new owner.
func (s *Server) events(c *gin.Context) {
	id, ok := deviceID(c)
	if !ok {
		return
	}
	ctx, u := c.Request.Context(), user(c)
	a, err := s.opts.Control.Access(ctx, u, id)
	if err != nil {
		s.fail(c, err)
		return
	}
	sb := s.opts.Hub.subscribe(a.IDCard, a.ID)
	defer s.opts.Hub.unsubscribe(sb)
	ds, err := s.opts.Control.Status(ctx, u, id)
	if err != nil {
		s.fail(c, err)
		return
	}

	w := c.Writer
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	rc := http.NewResponseController(w)
	write := func(format string, args ...any) bool {
		_ = rc.SetWriteDeadline(time.Now().Add(10 * time.Second))
		if _, err := fmt.Fprintf(w, format, args...); err != nil {
			return false
		}
		return rc.Flush() == nil
	}
	var last []byte
	sendStatus := func() bool {
		b, err := json.Marshal(ds)
		if err != nil || string(b) == string(last) {
			return err == nil
		}
		last = b
		return write("event: status\ndata: %s\n\n", b)
	}
	refresh := func() bool { // re-reads access and cook; false ends the stream
		fresh, err := s.opts.Control.Status(ctx, u, id)
		if err != nil {
			return false
		}
		ds = fresh
		return true
	}
	if !sendStatus() {
		return
	}

	ping := time.NewTicker(s.opts.PingEvery)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-sb.done:
			return
		case m := <-sb.ch:
			switch m.kind {
			case msgState:
				ds = ds.WithState(m.state)
			case msgCook:
				if m.endReason != "" {
					b, _ := json.Marshal(gin.H{"reason": m.endReason})
					if !write("event: cook_ended\ndata: %s\n\n", b) {
						return
					}
				}
				if !refresh() {
					return
				}
			}
			if !sendStatus() {
				return
			}
		case <-ping.C:
			if !refresh() || !sendStatus() || !write(": ping\n\n") {
				return
			}
		}
	}
}
