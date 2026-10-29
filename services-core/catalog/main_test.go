package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCatalogItemsAcceptOptionalDescriptions(t *testing.T) {
	content := []byte(strings.TrimSpace(`
items:
  - id: checkout
    title: Checkout
    shortDescription: Handles customer checkout.
    fullDescription: |
      Checkout lets customers submit orders.

      It coordinates the order flow.
  - id: legacy
    title: Legacy
`) + "\n")

	if err := validateCatalogFile("catalog-items.yaml", content); err != nil {
		t.Fatalf("validateCatalogFile() unexpected error: %v", err)
	}
}

func TestCatalogItemsRejectBlankOptionalDescriptions(t *testing.T) {
	content := []byte(strings.TrimSpace(`
items:
  - id: checkout
    title: Checkout
    fullDescription: "   "
`) + "\n")

	err := validateCatalogFile("catalog-items.yaml", content)
	if err == nil {
		t.Fatal("validateCatalogFile() expected error")
	}
	if !strings.Contains(err.Error(), "fullDescription") {
		t.Fatalf("validateCatalogFile() error = %q, want fullDescription", err.Error())
	}
}

func TestCatalogSignalDetailsByID(t *testing.T) {
	svc, err := newService("./catalog/demo", "./schemas")
	if err != nil {
		t.Fatalf("newService() unexpected error: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/signals/sg_dc0a314b", nil)
	rec := httptest.NewRecorder()
	svc.fileHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET signal status = %d, want 200", rec.Code)
	}
	var details map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &details); err != nil {
		t.Fatalf("decode signal: %v", err)
	}
	for key, expected := range map[string]string{
		"id":     "sg_dc0a314b",
		"itemId": "it_5a9ca947",
		"type":   "http-poll",
		"title":  "Availability heartbeat responds",
		"url":    "http://dummy-java:8080/health/sg_dc0a314b",
	} {
		if details[key] != expected {
			t.Errorf("%s = %v, want %q", key, details[key], expected)
		}
	}

	// Reading one definition must not mutate the original source collection.
	listReq := httptest.NewRequest(http.MethodGet, "/api/signals/http-poll", nil)
	listRec := httptest.NewRecorder()
	svc.fileHandler(listRec, listReq)
	var list map[string][]map[string]any
	if err := json.Unmarshal(listRec.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode signal list: %v", err)
	}
	if _, exists := list["signals"][0]["type"]; exists {
		t.Fatal("lookup mutated the original signal definition")
	}
}

func TestCatalogSignalDetailsMissingAndHead(t *testing.T) {
	svc, err := newService("./catalog/demo", "./schemas")
	if err != nil {
		t.Fatalf("newService() unexpected error: %v", err)
	}
	for _, path := range []string{
		"/api/signals/does-not-exist",
		"/api/signals/",
		"/api/signals/does-not-exist/extra",
	} {
		rec := httptest.NewRecorder()
		svc.fileHandler(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404", path, rec.Code)
		}
	}
	rec := httptest.NewRecorder()
	svc.fileHandler(rec, httptest.NewRequest(http.MethodHead, "/api/signals/sg_dc0a314b", nil))
	if rec.Code != http.StatusOK || rec.Body.Len() != 0 {
		t.Errorf("HEAD status = %d, body length = %d; want 200 and empty", rec.Code, rec.Body.Len())
	}
}
