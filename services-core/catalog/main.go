package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

var requiredFiles = []string{
	"catalog-items.yaml",
	"catalog-dependencies.yaml",
	"catalog-contacts.yaml",
	"catalog-item-contacts.yaml",
	"catalog-actors.yaml",
	"catalog-item-actors.yaml",
	"catalog-actors-contacts.yaml",
	"signals-http-poll.yaml",
}

var apiToFile = map[string]string{
	"catalog/items":          "catalog-items.yaml",
	"catalog/dependencies":   "catalog-dependencies.yaml",
	"catalog/contacts":       "catalog-contacts.yaml",
	"catalog/item-contacts":  "catalog-item-contacts.yaml",
	"catalog/actors":         "catalog-actors.yaml",
	"catalog/item-actors":    "catalog-item-actors.yaml",
	"catalog/actor-contacts": "catalog-actors-contacts.yaml",
	"signals/http-poll":      "signals-http-poll.yaml",
}

var requiredSchemaFiles = []string{
	"catalog-items.schema.yaml",
	"catalog-dependencies.schema.yaml",
	"catalog-contacts.schema.yaml",
	"catalog-item-contacts.schema.yaml",
	"catalog-actors.schema.yaml",
	"catalog-item-actors.schema.yaml",
	"catalog-actors-contacts.schema.yaml",
	"signals-http-poll.schema.yaml",
}

type service struct {
	files      map[string][]byte
	parsed     map[string]map[string]any
	schemas    map[string][]byte
	catalogAll map[string]any
}

func main() {
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}

	baseDir := defaultIfBlank(os.Getenv("CATALOG_DIR"), "./catalog/empty")
	schemaDir := defaultIfBlank(os.Getenv("CATALOG_SCHEMAS_DIR"), "./schemas")

	svc, err := newService(baseDir, schemaDir)
	if err != nil {
		log.Fatalf("failed to initialize catalog service: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", svc.healthHandler)
	mux.HandleFunc("/", svc.fileHandler)

	addr := ":" + port
	log.Printf("catalog service started on %s, source dir: %s, schemas: %s", addr, baseDir, schemaDir)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("catalog service stopped: %v", err)
	}
}

func newService(baseDir string, schemaDir string) (*service, error) {
	files := make(map[string][]byte, len(requiredFiles))
	for _, name := range requiredFiles {
		content, err := readRequiredFile(baseDir, name)
		if err != nil {
			return nil, err
		}
		if err := validateCatalogFile(name, content); err != nil {
			return nil, err
		}
		files[name] = content
	}

	schemas := make(map[string][]byte, len(requiredSchemaFiles))
	for _, name := range requiredSchemaFiles {
		content, err := readRequiredFile(schemaDir, name)
		if err != nil {
			return nil, err
		}
		schemas[name] = content
	}

	parsed := parsedCatalogPayloads(files)
	return &service{
		files:   files,
		parsed:  parsed,
		schemas: schemas,
		catalogAll: map[string]any{
			"items":         parsed["catalog-items.yaml"]["items"],
			"dependencies":  parsed["catalog-dependencies.yaml"]["dependencies"],
			"contacts":      parsed["catalog-contacts.yaml"]["contacts"],
			"itemContacts":  parsed["catalog-item-contacts.yaml"]["itemContacts"],
			"actors":        parsed["catalog-actors.yaml"]["actors"],
			"itemActors":    parsed["catalog-item-actors.yaml"]["itemActors"],
			"actorContacts": resolveActorContacts(parsed["catalog-actors-contacts.yaml"]),
		},
	}, nil
}

func (s *service) healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "UP"})
}

func (s *service) fileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	name := strings.TrimPrefix(r.URL.Path, "/")
	if name == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if strings.HasPrefix(name, "api/") {
		s.handleAPI(w, r, strings.TrimPrefix(name, "api/"))
		return
	}

	if strings.HasPrefix(name, "schemas/") {
		schemaName := strings.TrimPrefix(name, "schemas/")
		schema, ok := s.schemas[schemaName]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		if r.Method == http.MethodHead {
			return
		}
		_, _ = w.Write(schema)
		return
	}

	content, ok := s.files[name]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(content)
}

func (s *service) handleAPI(w http.ResponseWriter, r *http.Request, endpoint string) {
	if endpoint == "catalog" {
		writeJSON(w, r, http.StatusOK, s.catalogAll)
		return
	}
	fileName, ok := apiToFile[endpoint]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	payload, ok := s.parsed[fileName]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	writeJSON(w, r, http.StatusOK, payload)
}

func writeJSON(w http.ResponseWriter, r *http.Request, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if r.Method == http.MethodHead {
		return
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func defaultIfBlank(value string, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func readRequiredFile(baseDir string, fileName string) ([]byte, error) {
	path := filepath.Join(baseDir, fileName)
	content, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, errors.New("missing file: " + path)
		}
		return nil, err
	}
	return content, nil
}

func validateCatalogFile(name string, content []byte) error {
	var payload map[string]any
	if err := yaml.Unmarshal(content, &payload); err != nil {
		return fmt.Errorf("%s: invalid yaml: %w", name, err)
	}
	switch name {
	case "catalog-items.yaml":
		items, err := requireArray(payload, "items")
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		for i, row := range items {
			entry, ok := row.(map[string]any)
			if !ok {
				return fmt.Errorf("%s: items[%d] must be an object", name, i)
			}
			if err := requireText(entry, "id"); err != nil {
				return fmt.Errorf("%s: items[%d].id: %w", name, i, err)
			}
			if err := requireText(entry, "title"); err != nil {
				return fmt.Errorf("%s: items[%d].title: %w", name, i, err)
			}
		}
	case "catalog-dependencies.yaml":
		deps, err := requireArray(payload, "dependencies")
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		for i, row := range deps {
			entry, ok := row.(map[string]any)
			if !ok {
				return fmt.Errorf("%s: dependencies[%d] must be an object", name, i)
			}
			if err := requireText(entry, "sourceId"); err != nil {
				return fmt.Errorf("%s: dependencies[%d].sourceId: %w", name, i, err)
			}
			if err := requireText(entry, "targetId"); err != nil {
				return fmt.Errorf("%s: dependencies[%d].targetId: %w", name, i, err)
			}
		}
	case "signals-http-poll.yaml":
		signals, err := requireArray(payload, "signals")
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		for i, row := range signals {
			entry, ok := row.(map[string]any)
			if !ok {
				return fmt.Errorf("%s: signals[%d] must be an object", name, i)
			}
			if err := requireText(entry, "id"); err != nil {
				return fmt.Errorf("%s: signals[%d].id: %w", name, i, err)
			}
			if err := requireText(entry, "itemId"); err != nil {
				return fmt.Errorf("%s: signals[%d].itemId: %w", name, i, err)
			}
			if err := requireText(entry, "url"); err != nil {
				return fmt.Errorf("%s: signals[%d].url: %w", name, i, err)
			}
		}
	}
	return nil
}

func parsedCatalogPayloads(files map[string][]byte) map[string]map[string]any {
	result := make(map[string]map[string]any, len(files))
	for name, content := range files {
		payload := map[string]any{}
		if err := yaml.Unmarshal(content, &payload); err == nil {
			result[name] = payload
		}
	}
	return result
}

func resolveActorContacts(payload map[string]any) any {
	if payload == nil {
		return nil
	}
	if value, ok := payload["actorContacts"]; ok {
		return value
	}
	return payload["actorsContacts"]
}

func requireArray(payload map[string]any, field string) ([]any, error) {
	raw, ok := payload[field]
	if !ok {
		return nil, fmt.Errorf("missing field %q", field)
	}
	result, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("field %q must be an array", field)
	}
	return result, nil
}

func requireText(payload map[string]any, field string) error {
	raw, ok := payload[field]
	if !ok {
		return fmt.Errorf("missing field")
	}
	value, ok := raw.(string)
	if !ok {
		return fmt.Errorf("must be a string")
	}
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("must be non-empty")
	}
	return nil
}
