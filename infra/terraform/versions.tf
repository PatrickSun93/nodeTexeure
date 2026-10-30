terraform {
  required_version = ">= 1.6"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.49"
    }
  }

  # State stays local for now (terraform.tfstate next to this file, gitignored).
  # It holds the server's IP and nothing secret beyond what the token can read;
  # move it to a remote backend before more than one person runs apply.
}

provider "hcloud" {
  token = var.hcloud_token
}
