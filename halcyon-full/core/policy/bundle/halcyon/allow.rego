package halcyon

default allow := false

allow := true if {
  input.action == "write_entities"
  input.count <= 1000
}

allow := true if {
  input.action == "write_relationships"
  input.count <= 5000
}
