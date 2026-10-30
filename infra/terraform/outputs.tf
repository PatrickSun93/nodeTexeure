output "ipv4" {
  description = "Public IPv4 of the node: the DEPLOY_HOST repository variable."
  value       = hcloud_server.node.ipv4_address
}

output "nip_io_domain" {
  description = "A DNS name that resolves to the node without owning a domain: the DOMAIN repository variable (the site is shop.<domain>, the admin admin.<domain>)."
  value       = "${hcloud_server.node.ipv4_address}.nip.io"
}

output "ssh" {
  value = "ssh root@${hcloud_server.node.ipv4_address}"
}

output "kubeconfig" {
  description = "How to reach the cluster: copy the kubeconfig (it points at 127.0.0.1:6443), then keep a tunnel open while using kubectl."
  value       = <<-EOT
    ssh root@${hcloud_server.node.ipv4_address} cat /etc/rancher/k3s/k3s.yaml > ~/.kube/nodetexeure.yaml
    ssh -fN -L 6443:127.0.0.1:6443 root@${hcloud_server.node.ipv4_address}
    KUBECONFIG=~/.kube/nodetexeure.yaml kubectl get nodes
  EOT
}
