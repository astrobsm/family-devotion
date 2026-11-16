#!/usr/bin/env sh
# Publishes www/ to GitHub Pages (served from the gh-pages branch).
#   sh tools/deploy.sh
# Live at https://astrobsm.github.io/family-devotion/ about a minute later.
# Installed phones then show "A new version is ready — Update".
set -e
cd "$(dirname "$0")/.."

node tools/build.mjs                      # new cache version for the new files
if ! git diff --quiet -- www; then
  git add www
  git commit -q -m "Update app (sw $(grep -o "VERSION = '[^']*'" www/sw.js))"
fi
git push -q origin main
git push -q origin "$(git subtree split --prefix www)":refs/heads/gh-pages --force
echo "Pushed. Live in about a minute: https://astrobsm.github.io/family-devotion/"
