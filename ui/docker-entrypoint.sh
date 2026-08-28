#!/bin/sh
set -eu

MEMENTO_A_TOKEN=$(tr -d '\r\n' < /secrets/a-admin.token)
MEMENTO_B_TOKEN=$(tr -d '\r\n' < /secrets/b-admin.token)
export MEMENTO_A_TOKEN MEMENTO_B_TOKEN

exec npm run start
