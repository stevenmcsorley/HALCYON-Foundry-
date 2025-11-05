# HALCYON Repository Structure

## Directory Layout

```
HALCYON-Foundry-/
├── halcyon-full/          # Main source code (authoritative)
│   ├── core/              # Backend services (gateway, ontology, registry, etc.)
│   ├── ui/                # Frontend React application
│   ├── deploy/            # Docker Compose configuration
│   ├── docs/              # Documentation
│   └── ...
├── README.md
└── ...
```

## Important Notes

- **All source code is in `halcyon-full/`** - This is the authoritative location
- `docker-compose.yml` (in `halcyon-full/deploy/`) uses relative paths:
  - `../core/gateway` → `halcyon-full/core/gateway`
  - `../ui` → `halcyon-full/ui`
- Root-level `core/` and `ui/` directories (if they exist) are **outdated duplicates** and should be removed

## Docker Build Context

The `docker-compose.yml` file is run from `halcyon-full/deploy/`, so all paths are relative to that directory:
- `../core/gateway` correctly points to `halcyon-full/core/gateway`
- `../ui` correctly points to `halcyon-full/ui`

## Migration Note

If you see root-level `core/` or `ui/` directories, these are legacy duplicates from an earlier structure. All code has been consolidated into `halcyon-full/`.

