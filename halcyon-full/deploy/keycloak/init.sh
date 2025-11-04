#!/bin/sh
/opt/keycloak/bin/kc.sh import --file /opt/keycloak/data/import/realm-export.json || true
