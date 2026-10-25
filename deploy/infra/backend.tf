terraform {
  backend "local" {
    path = "../../.temp/demo/demo-infra.tfstate"
  }
}
