package halcyon
default allow = false
allow {
  input.action == "write_entities"
  input.count <= 1000
}
allow {
  input.action == "write_relationships"
  input.count <= 5000
}
