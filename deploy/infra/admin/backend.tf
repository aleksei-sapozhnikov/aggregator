terraform {
  backend "local" {
    path = "../../../.temp/admin/admin-infra.tfstate"
  }
}
