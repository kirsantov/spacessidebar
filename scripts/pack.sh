#!/bin/sh
# Собирает zip для Chrome Web Store: только файлы расширения.
set -e
cd "$(dirname "$0")/.."
v=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' manifest.json)
mkdir -p dist
rm -f "dist/spaces-sidebar-$v.zip"
zip -qr "dist/spaces-sidebar-$v.zip" manifest.json background.js panel.html panel.css panel.js icons.js arc-import.js icons _locales
echo "dist/spaces-sidebar-$v.zip"
