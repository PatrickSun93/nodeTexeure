resource "hcloud_ssh_key" "deploy" {
  name       = "${var.name}-deploy"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

# Only SSH, HTTP and HTTPS come in. The Kubernetes API (6443) stays closed:
# kubectl reaches it through an SSH tunnel (see README.md and deploy.yml).
resource "hcloud_firewall" "web" {
  name = "${var.name}-web"

  rule {
    description = "ssh"
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.ssh_source_ips
  }

  rule {
    description = "http (Let's Encrypt HTTP-01 and the redirect to https)"
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "https"
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "node" {
  name         = "${var.name}-1"
  server_type  = var.server_type
  image        = var.image
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.deploy.id]
  firewall_ids = [hcloud_firewall.web.id]

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    k3s_channel          = var.k3s_channel
    k3s_version          = var.k3s_version
    cert_manager_version = var.cert_manager_version
  })

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  labels = {
    app = var.name
  }

  # cloud-init only runs on first boot; editing the template must not
  # silently replace the server (and its MySQL volume).
  lifecycle {
    ignore_changes = [user_data, image]
  }
}
