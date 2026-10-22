package main

import (
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
