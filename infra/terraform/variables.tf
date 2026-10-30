variable "hcloud_token" {
  description = "Hetzner Cloud API token (read/write). Pass it as TF_VAR_hcloud_token, never in a file."
  type        = string
  sensitive   = true
}

variable "name" {
  description = "Prefix for every resource name."
  type        = string
  default     = "nodetexeure"
}

variable "ssh_public_key_path" {
  description = "Public key installed for root. The matching private key is the DEPLOY_SSH_KEY GitHub secret."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "ssh_source_ips" {
  description = "CIDRs allowed to reach port 22. GitHub Actions deploys over SSH, so the default is open; narrow it if you deploy from a fixed runner."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "server_type" {
  description = "Hetzner server type: 2 vCPU / 4 GB is enough for k3s plus the whole stack. Check `hcloud server-type list` if Hetzner renames it."
  type        = string
  default     = "cx22"
}

variable "location" {
  description = "Hetzner location (nbg1, fsn1, hel1, ash, hil)."
  type        = string
  default     = "nbg1"
}

variable "image" {
  description = "OS image."
  type        = string
  default     = "ubuntu-24.04"
}

variable "k3s_channel" {
  description = "k3s release channel for the installer (stable, latest, or a minor such as v1.33)."
  type        = string
  default     = "stable"
}

variable "k3s_version" {
  description = "Exact k3s version (e.g. v1.33.5+k3s1); overrides k3s_channel when set."
  type        = string
  default     = ""
}

variable "cert_manager_version" {
  description = "cert-manager Helm chart version, installed by k3s's Helm controller on first boot."
  type        = string
  default     = "v1.18.2"
}
