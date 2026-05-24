#!/usr/bin/env bash
set -euo pipefail

echo "Release helper"
echo "1) Update docs/CHANGELOG.md with release notes under [Unreleased]"
echo "2) Bump frontend version: npm --prefix frontend version patch"
echo "3) Commit and tag: git add docs/CHANGELOG.md frontend/package.json && git commit -m \"chore(release): x.y.z\" && git tag vX.Y.Z"
echo "4) Push tags: git push --follow-tags"

echo "This script provides guidance; edit files and run the commands above to perform a release."
